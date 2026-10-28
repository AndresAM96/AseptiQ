-- =============================================================
-- N5: BLINDAJE TOTAL DE SEGURIDAD Y ROLES
-- =============================================================

-- 1. Función de rol que detecta inactivos
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN activo = true THEN role ELSE 'inactivo' END 
     FROM public.profiles WHERE user_id = auth.uid()),
    'anon'
  );
$$;

-- 2. Revocar accesos públicos (El REVOKE anterior no funcionó por PUBLIC)
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 3. Bloquear a los inactivos en la lectura de perfiles
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin','operador','consulta') AND (user_id = auth.uid() OR public.current_user_role() = 'admin'));

-- 4. Actualizar consumir_insumo_fifo con tipo de movimiento y search_path (N3)
DROP FUNCTION IF EXISTS public.consumir_insumo_fifo(uuid, numeric, text, uuid);
CREATE OR REPLACE FUNCTION public.consumir_insumo_fifo(
  p_insumo_id uuid, p_cantidad numeric, p_motivo text, p_orden_id uuid DEFAULT NULL, p_tipo text DEFAULT 'Consumo'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  v_restante numeric := p_cantidad; v_tomar numeric; v_lote record; v_detalle jsonb := '[]'::jsonb; v_costo numeric;
BEGIN
  IF p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser > 0'; END IF;
  SELECT costo_unitario INTO v_costo FROM public.insumos WHERE id = p_insumo_id;

  FOR v_lote IN SELECT id, lote, cantidad_actual, costo_unitario FROM public.insumo_lotes WHERE insumo_id = p_insumo_id AND cantidad_actual > 0 ORDER BY primer_ingreso ASC LOOP
    IF v_restante <= 0 THEN EXIT; END IF;
    v_tomar := LEAST(v_restante, v_lote.cantidad_actual);
    UPDATE public.insumo_lotes SET cantidad_actual = cantidad_actual - v_tomar WHERE id = v_lote.id;
    
    -- Insertar movimiento con p_tipo (Consumo o Salida)
    INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, motivo, orden_id, lote_insumo, costo_unitario_momento)
    VALUES (p_insumo_id, p_tipo, v_tomar, p_motivo, p_orden_id, v_lote.lote, COALESCE(v_lote.costo_unitario, v_costo));
    
    v_restante := v_restante - v_tomar;
    v_detalle := v_detalle || jsonb_build_object('lote', v_lote.lote, 'cantidad', v_tomar);
  END LOOP;
  
  IF v_restante > 0 THEN
    INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, motivo, orden_id, lote_insumo, costo_unitario_momento) 
    VALUES (p_insumo_id, p_tipo, v_restante, p_motivo, p_orden_id, 'SIN LOTE', v_costo);
    v_detalle := v_detalle || jsonb_build_object('lote', 'SIN LOTE', 'cantidad', v_restante);
  END IF;
  
  UPDATE public.insumos SET existencia_actual = existencia_actual - p_cantidad WHERE id = p_insumo_id;
  RETURN jsonb_build_object('consumo_detalle', v_detalle);
END; $$;

-- 5. Actualizar registrar_entrada con calidad (N8: No sumar a stock si no está aprobado)
DROP FUNCTION IF EXISTS public.registrar_entrada(uuid, numeric, uuid, numeric, text, numeric, text);
CREATE OR REPLACE FUNCTION public.registrar_entrada(
  p_insumo_id uuid, p_cantidad numeric, p_proveedor_id uuid DEFAULT NULL,
  p_costo_unitario numeric DEFAULT NULL, p_motivo text DEFAULT NULL,
  p_rendimiento_real numeric DEFAULT NULL, p_lote_insumo text DEFAULT NULL,
  p_estado_calidad text DEFAULT 'Aprobado'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ins public.insumos%ROWTYPE; v_mov public.movimientos_inventario%ROWTYPE;
  v_cadena jsonb; v_factor_calc numeric := 1; v_factor_usar numeric;
  v_cantidad_consumo numeric; v_costo_por_consumo numeric; v_nuevo_costo numeric;
  v_lote_final text;
BEGIN
  PERFORM public.validar_escritura();
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad > 0'; END IF;
  SELECT * INTO v_ins FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  
  v_cadena := COALESCE(v_ins.conversiones, '[]'::jsonb);
  IF jsonb_array_length(v_cadena) > 1 THEN
    SELECT COALESCE(EXP(SUM(LN(GREATEST((elem->>'factor')::numeric, 0.0000001)))), 1) INTO v_factor_calc FROM jsonb_array_elements(v_cadena) WITH ORDINALITY AS t(elem, ord) WHERE ord < jsonb_array_length(v_cadena);
  END IF;

  v_factor_usar := CASE WHEN p_rendimiento_real > 0 THEN p_rendimiento_real ELSE v_factor_calc END;
  v_cantidad_consumo := p_cantidad * v_factor_usar;
  v_lote_final := COALESCE(NULLIF(trim(p_lote_insumo), ''), 'SIN LOTE');

  IF p_costo_unitario IS NOT NULL AND p_costo_unitario > 0 THEN
    v_costo_por_consumo := p_costo_unitario / v_factor_usar;
    IF (v_ins.existencia_actual + v_cantidad_consumo) > 0 THEN
      v_nuevo_costo := ((v_ins.existencia_actual * v_ins.costo_unitario) + (v_cantidad_consumo * v_costo_por_consumo)) / (v_ins.existencia_actual + v_cantidad_consumo);
    ELSE v_nuevo_costo := v_costo_por_consumo; END IF;
  ELSE 
    v_costo_por_consumo := v_ins.costo_unitario; v_nuevo_costo := v_ins.costo_unitario; 
  END IF;

  -- Registrar movimiento (Siempre se registra, pero si es Rechazado/Cuarentena no suma stock)
  INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, proveedor_id, motivo, rendimiento_real, unidad_compra, cantidad_compra, costo_unitario_momento, lote_insumo, estado_calidad)
  VALUES (p_insumo_id, 'Entrada', v_cantidad_consumo, p_proveedor_id, p_motivo, p_rendimiento_real, (v_cadena->0->>'unidad'), p_cantidad, v_costo_por_consumo, v_lote_final, p_estado_calidad)
  RETURNING * INTO v_mov;

  -- Si está Aprobado, sumamos al inventario y a los lotes
  IF p_estado_calidad = 'Aprobado' THEN
    UPDATE public.insumos SET existencia_actual = existencia_actual + v_cantidad_consumo, costo_unitario = v_nuevo_costo WHERE id = p_insumo_id;
    
    INSERT INTO public.insumo_lotes (insumo_id, lote, cantidad_recibida, cantidad_actual, costo_unitario, proveedor_id, primer_ingreso, ultimo_ingreso)
    VALUES (p_insumo_id, v_lote_final, v_cantidad_consumo, v_cantidad_consumo, v_costo_por_consumo, p_proveedor_id, now(), now())
    ON CONFLICT (insumo_id, lote) DO UPDATE SET cantidad_recibida = public.insumo_lotes.cantidad_recibida + EXCLUDED.cantidad_recibida, cantidad_actual = public.insumo_lotes.cantidad_actual + EXCLUDED.cantidad_actual;
  END IF;

  RETURN jsonb_build_object('movimiento_id', v_mov.id, 'cantidad_consumo', v_cantidad_consumo, 'existencia_nueva', CASE WHEN p_estado_calidad = 'Aprobado' THEN v_ins.existencia_actual + v_cantidad_consumo ELSE v_ins.existencia_actual END);
END; $$;

-- 6. Fix Multi-Lote (N1 y N2) - Itera llamando a registrar_entrada
CREATE OR REPLACE FUNCTION public.registrar_entrada_multi_lote(
  p_insumo_id uuid, p_lotes jsonb, p_proveedor_id uuid DEFAULT NULL, p_costo_unitario numeric DEFAULT NULL, p_estado_calidad text DEFAULT 'Aprobado'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item jsonb; v_count int := 0;
BEGIN
  PERFORM public.validar_escritura();
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_lotes) LOOP
    PERFORM public.registrar_entrada(p_insumo_id, (v_item->>'cantidad')::numeric, p_proveedor_id, p_costo_unitario, 'Entrada multi-lote', NULL, trim(v_item->>'lote'), p_estado_calidad);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('lotes_insertados', v_count);
END; $$;

-- 7. Fix Ajuste Positivo (N4) y Mermas (N3)
CREATE OR REPLACE FUNCTION public.ajustar_inventario(p_insumo_id uuid, p_nueva_existencia numeric, p_motivo text DEFAULT NULL) 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_insumo record; v_dif numeric;
BEGIN
  PERFORM public.validar_escritura();
  SELECT * INTO v_insumo FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  v_dif := p_nueva_existencia - v_insumo.existencia_actual;
  IF v_dif = 0 THEN RETURN jsonb_build_object('existencia_nueva', p_nueva_existencia); END IF;

  IF v_dif > 0 THEN
    -- Ajuste positivo: llama a registrar_entrada (el trigger ya no duplica porque borramos el trigger)
    PERFORM public.registrar_entrada(p_insumo_id, v_dif, NULL, v_insumo.costo_unitario, COALESCE(p_motivo, 'Ajuste positivo'), NULL, 'AJUSTE', 'Aprobado');
    UPDATE public.insumos SET existencia_actual = p_nueva_existencia WHERE id = p_insumo_id;
  ELSE
    PERFORM public.consumir_insumo_fifo(p_insumo_id, ABS(v_dif), COALESCE(p_motivo, 'Ajuste negativo'), NULL, 'Salida');
  END IF;
  RETURN jsonb_build_object('existencia_nueva', p_nueva_existencia);
END; $$;

CREATE OR REPLACE FUNCTION public.registrar_salida(p_insumo_id uuid, p_cantidad numeric, p_motivo text DEFAULT NULL) 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_insumo record; v_existencia_nueva numeric;
BEGIN
  PERFORM public.validar_escritura();
  SELECT * INTO v_insumo FROM public.insumos WHERE id = p_insumo_id;
  PERFORM public.consumir_insumo_fifo(p_insumo_id, p_cantidad, 'Salida manual: ' || COALESCE(p_motivo,'Sin motivo'), NULL, 'Salida');
  SELECT existencia_actual INTO v_existencia_nueva FROM public.insumos WHERE id = p_insumo_id;
  RETURN jsonb_build_object('existencia_nueva', v_existencia_nueva);
END; $$;

-- 8. Fix Entrega OP (N6: Consumo desde BOM real, no desde snapshot)
CREATE OR REPLACE FUNCTION public.registrar_entrega_op(
  p_orden_id uuid, p_cantidad numeric, p_lote_entrega text DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_op record; v_ins record; v_sub record; v_receta record;
  v_stock_actual numeric; v_faltante numeric; v_email text; v_producido_antes numeric; v_existencia_pt numeric; v_pendiente numeric;
BEGIN
  PERFORM public.validar_escritura();
  SELECT * INTO v_op FROM public.ordenes_semanales WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OP no encontrada'; END IF;
  IF v_op.estado_op IN ('Terminada', 'Cancelada') THEN RAISE EXCEPTION 'La OP ya está cerrada o cancelada'; END IF;
  
  v_producido_antes := COALESCE(v_op.cantidad_producida, 0);
  v_pendiente := v_op.cantidad_proyectada - v_producido_antes;
  IF p_cantidad <= 0 OR p_cantidad > v_pendiente THEN RAISE EXCEPTION 'Cantidad inválida. Pendiente: %', v_pendiente; END IF;

  -- 1. Procesar SUBPRODUCTOS del Paquete (BOM real)
  FOR v_sub IN SELECT subproducto_id, cantidad FROM public.paquete_subproductos WHERE codigo_pt = v_op.codigo_pt LOOP
    v_faltante := v_sub.cantidad * p_cantidad;
    SELECT existencia_actual INTO v_stock_actual FROM public.subproductos WHERE id = v_sub.subproducto_id FOR UPDATE;
    
    IF v_stock_actual >= v_faltante THEN
      UPDATE public.subproductos SET existencia_actual = existencia_actual - v_faltante WHERE id = v_sub.subproducto_id;
      INSERT INTO public.movimientos_inventario (subproducto_id, tipo, cantidad, motivo, orden_id) VALUES (v_sub.subproducto_id, 'Consumo', v_faltante, 'Consumo OP ' || COALESCE(v_op.numero_op,''), p_orden_id);
    ELSE
      IF v_stock_actual > 0 THEN
        UPDATE public.subproductos SET existencia_actual = 0 WHERE id = v_sub.subproducto_id;
        INSERT INTO public.movimientos_inventario (subproducto_id, tipo, cantidad, motivo, orden_id) VALUES (v_sub.subproducto_id, 'Consumo', v_stock_actual, 'Consumo OP ' || COALESCE(v_op.numero_op,''), p_orden_id);
      END IF;
      v_faltante := v_faltante - v_stock_actual;
      
      -- Auto-producción (con factor_receta)
      FOR v_receta IN SELECT insumo_id, cantidad_por_unidad, factor_receta FROM public.subproducto_recetas WHERE subproducto_id = v_sub.subproducto_id LOOP
        PERFORM public.consumir_insumo_fifo(v_receta.insumo_id, (v_receta.cantidad_por_unidad * COALESCE(v_receta.factor_receta,1) * v_faltante), 'Auto-producción OP ' || COALESCE(v_op.numero_op,''), p_orden_id, 'Consumo');
      END LOOP;
    END IF;
  END LOOP;

  -- 2. Procesar INSUMOS DIRECTOS del Paquete (BOM real)
  FOR v_ins IN SELECT insumo_id, cantidad_por_unidad FROM public.bom_recetas WHERE codigo_pt = v_op.codigo_pt LOOP
    v_faltante := v_ins.cantidad_por_unidad * p_cantidad;
    PERFORM public.consumir_insumo_fifo(v_ins.insumo_id, v_faltante, 'Consumo OP ' || COALESCE(v_op.numero_op,''), p_orden_id, 'Consumo');
  END LOOP;

  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.entregas_op (orden_id, cantidad, lote_entrega, motivo, usuario_email) VALUES (p_orden_id, p_cantidad, p_lote_entrega, p_motivo, v_email);

  UPDATE public.productos_terminados SET existencia_actual = COALESCE(existencia_actual, 0) + p_cantidad WHERE codigo_pt = v_op.codigo_pt RETURNING existencia_actual INTO v_existencia_pt;

  UPDATE public.ordenes_semanales SET cantidad_producida = v_producido_antes + p_cantidad, estado_op = CASE WHEN (v_producido_antes + p_cantidad) >= cantidad_proyectada THEN 'Terminada' ELSE 'En proceso' END, fecha_completado = CASE WHEN (v_producido_antes + p_cantidad) >= cantidad_proyectada THEN now() ELSE NULL END WHERE id = p_orden_id;

  RETURN jsonb_build_object('ok', true, 'cantidad_producida', v_producido_antes + p_cantidad, 'cantidad_pendiente', v_pendiente - p_cantidad, 'op_cerrada', (v_producido_antes + p_cantidad) >= v_op.cantidad_proyectada, 'existencia_pt', v_existencia_pt);
END; $$;

-- 9. Asegurar search_path y roles en las demás (N5)
ALTER FUNCTION public.confirmar_orden(text, numeric, text, jsonb, text, numeric, text, integer, date) SET search_path = public;
ALTER FUNCTION public.cancelar_orden(uuid, text) SET search_path = public;
ALTER FUNCTION public.guardar_subproducto(uuid, text, text, numeric, numeric, jsonb, jsonb, text) SET search_path = public;
ALTER FUNCTION public.guardar_paquete(text, boolean, text, jsonb, jsonb, integer, numeric) SET search_path = public;
ALTER FUNCTION public.eliminar_insumo(uuid) SET search_path = public;
ALTER FUNCTION public.producir_subproducto(uuid, numeric, text, text) SET search_path = public;
ALTER FUNCTION public.ajustar_subproducto(uuid, numeric, text) SET search_path = public;
ALTER FUNCTION public.ajustar_costo_insumo(uuid, numeric, text) SET search_path = public;
ALTER FUNCTION public.registrar_devolucion(uuid, numeric, uuid, text, text) SET search_path = public;
ALTER FUNCTION public.registrar_devolucion_pt(text, numeric, text, text) SET search_path = public;
ALTER FUNCTION public.registrar_despacho(text, numeric, text, text, text, text, date, text, text) SET search_path = public;
-- (Si falta alguna, el REVOKE general de arriba ya quitó el acceso público)