-- =============================================================
-- 1. REESCRITURA DE REGISTRAR_ENTREGA_OP CON VALIDACIONES
-- =============================================================
CREATE OR REPLACE FUNCTION public.registrar_entrega_op(
  p_orden_id uuid,
  p_cantidad numeric,
  p_lote_entrega text DEFAULT NULL,
  p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_op record;
  v_detalle jsonb;
  v_ins record;
  v_sub record;
  v_receta record;
  v_cant_proporcional numeric;
  v_stock_actual numeric;
  v_faltante numeric;
  v_email text;
  v_producido_antes numeric;
  v_existencia_pt numeric;
  v_pendiente numeric;
BEGIN
  PERFORM public.validar_escritura();

  SELECT * INTO v_op FROM public.ordenes_semanales WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OP no encontrada'; END IF;
  
  -- Validaciones críticas de estado y cantidad
  IF v_op.estado_op = 'Terminada' THEN RAISE EXCEPTION 'La OP ya está terminada'; END IF;
  IF v_op.estado_op = 'Cancelada' THEN RAISE EXCEPTION 'La OP está cancelada'; END IF;
  IF p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a 0'; END IF;
  
  v_producido_antes := COALESCE(v_op.cantidad_producida, 0);
  v_pendiente := v_op.cantidad_proyectada - v_producido_antes;
  
  IF p_cantidad > v_pendiente THEN 
    RAISE EXCEPTION 'La cantidad excede el pendiente de la OP. Pendiente: %', v_pendiente; 
  END IF;

  v_detalle := v_op.detalle_faltantes;
  v_cant_proporcional := p_cantidad / v_op.cantidad_proyectada;

  -- 1. Procesar SUBPRODUCTOS (Consumo o Auto-producción)
  FOR v_sub IN SELECT * FROM jsonb_to_recordset(v_detalle->'subproductos') AS x(subproducto_id uuid, requerido numeric) LOOP
    v_faltante := v_sub.requerido * v_cant_proporcional;
    
    SELECT existencia_actual INTO v_stock_actual FROM public.subproductos WHERE id = v_sub.subproducto_id FOR UPDATE;
    
    IF v_stock_actual >= v_faltante THEN
      UPDATE public.subproductos SET existencia_actual = existencia_actual - v_faltante WHERE id = v_sub.subproducto_id;
      INSERT INTO public.movimientos_inventario (subproducto_id, tipo, cantidad, motivo, orden_id)
      VALUES (v_sub.subproducto_id, 'Consumo', v_faltante, 'Consumo OP ' || COALESCE(v_op.numero_op,''), p_orden_id);
    ELSE
      IF v_stock_actual > 0 THEN
        UPDATE public.subproductos SET existencia_actual = 0 WHERE id = v_sub.subproducto_id;
        INSERT INTO public.movimientos_inventario (subproducto_id, tipo, cantidad, motivo, orden_id)
        VALUES (v_sub.subproducto_id, 'Consumo', v_stock_actual, 'Consumo OP ' || COALESCE(v_op.numero_op,''), p_orden_id);
      END IF;
      
      v_faltante := v_faltante - v_stock_actual;
      
      -- Auto-producción con FIFO (Respetando factor_receta y unidad_receta)
      FOR v_receta IN SELECT * FROM public.subproducto_recetas WHERE subproducto_id = v_sub.subproducto_id LOOP
        PERFORM public.consumir_insumo_fifo(
          v_receta.insumo_id, 
          (v_receta.cantidad_por_unidad * COALESCE(v_receta.factor_receta, 1) * v_faltante), 
          'Auto-producción para OP ' || COALESCE(v_op.numero_op,''), 
          p_orden_id
        );
      END LOOP;
    END IF;
  END LOOP;

  -- 2. Procesar INSUMOS DIRECTOS (FIFO)
  FOR v_ins IN SELECT * FROM jsonb_to_recordset(v_detalle->'insumos') AS x(insumo_id uuid, consumo_total numeric) LOOP
    v_faltante := v_ins.consumo_total * v_cant_proporcional;
    
    -- Validar stock antes de consumir (para evitar stock negativo si falla FIFO)
    SELECT existencia_actual INTO v_stock_actual FROM public.insumos WHERE id = v_ins.insumo_id FOR UPDATE;
    IF v_stock_actual < v_faltante THEN 
      RAISE EXCEPTION 'Stock insuficiente para el insumo % (requerido: %, disponible: %)', v_ins.insumo_id, v_faltante, v_stock_actual; 
    END IF;

    PERFORM public.consumir_insumo_fifo(
      v_ins.insumo_id, 
      v_faltante, 
      'Consumo OP ' || COALESCE(v_op.numero_op,''), 
      p_orden_id
    );
  END LOOP;

  -- 3. Registrar entrega
  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.entregas_op (orden_id, cantidad, lote_entrega, motivo, usuario_email)
  VALUES (p_orden_id, p_cantidad, p_lote_entrega, p_motivo, v_email);

  -- 4. Sumar Producto Terminado al stock
  UPDATE public.productos_terminados 
  SET existencia_actual = COALESCE(existencia_actual, 0) + p_cantidad 
  WHERE codigo_pt = v_op.codigo_pt
  RETURNING existencia_actual INTO v_existencia_pt;

  -- 5. Actualizar OP
  UPDATE public.ordenes_semanales
  SET cantidad_producida = v_producido_antes + p_cantidad,
      estado_op = CASE WHEN (v_producido_antes + p_cantidad) >= cantidad_proyectada THEN 'Terminada' ELSE 'En proceso' END,
      fecha_completado = CASE WHEN (v_producido_antes + p_cantidad) >= cantidad_proyectada THEN now() ELSE NULL END
  WHERE id = p_orden_id;

  RETURN jsonb_build_object(
    'ok', true, 
    'cantidad_producida', v_producido_antes + p_cantidad, 
    'op_cerrada', (v_producido_antes + p_cantidad) >= v_op.cantidad_proyectada,
    'existencia_pt', v_existencia_pt
  );
END; $$;

-- =============================================================
-- 2. NUEVO RPC PARA ENTRADA MULTI-LOTE (Sin doble conteo)
-- =============================================================
CREATE OR REPLACE FUNCTION public.registrar_entrada_multi_lote(
  p_insumo_id uuid, p_lotes jsonb, p_proveedor_id uuid DEFAULT NULL, p_costo_unitario numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ins public.insumos%ROWTYPE;
  v_item jsonb;
  v_cant_total numeric := 0;
  v_costo_promedio numeric;
  v_factor numeric;
BEGIN
  PERFORM public.validar_escritura();
  SELECT * INTO v_ins FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  
  -- Calcular factor de conversión
  v_factor := COALESCE(v_ins.factor_conversion, 1);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_lotes) LOOP
    v_cant_total := v_cant_total + (v_item->>'cantidad')::numeric;
    
    INSERT INTO public.insumo_lotes (insumo_id, lote, cantidad_recibida, cantidad_actual, costo_unitario, proveedor_id, primer_ingreso, ultimo_ingreso)
    VALUES (p_insumo_id, trim(v_item->>'lote'), (v_item->>'cantidad')::numeric, (v_item->>'cantidad')::numeric, p_costo_unitario, p_proveedor_id, now(), now())
    ON CONFLICT (insumo_id, lote) DO UPDATE SET cantidad_recibida = public.insumo_lotes.cantidad_recibida + EXCLUDED.cantidad_recibida, cantidad_actual = public.insumo_lotes.cantidad_actual + EXCLUDED.cantidad_actual;
  END LOOP;

  v_costo_promedio := COALESCE(p_costo_unitario, v_ins.costo_unitario);
  
  -- Actualizamos el insumo una sola vez
  UPDATE public.insumos 
  SET existencia_actual = existencia_actual + v_cant_total,
      costo_unitario = v_costo_promedio
  WHERE id = p_insumo_id;

  -- Registramos un solo movimiento global (para el Kardex)
  INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, proveedor_id, motivo, costo_unitario_momento)
  VALUES (p_insumo_id, 'Entrada', v_cant_total, p_proveedor_id, 'Entrada Multi-lote', v_costo_promedio);

  RETURN jsonb_build_object('ok', true, 'cantidad_total', v_cant_total);
END; $$;