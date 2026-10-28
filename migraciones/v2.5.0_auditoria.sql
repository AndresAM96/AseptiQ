-- =============================================================
-- v2.5.0 · Correcciones de auditoría
-- - N5  : seguridad completa (inactivos, REVOKE PUBLIC, validar_escritura, search_path, cantidades > 0)
-- - N1/N2: registrar_entrada_multi_lote vía registrar_entrada
-- - N3  : consumir_insumo_fifo con p_tipo; registrar_salida en una sola llamada
-- - N4  : ajustar_inventario positivo sin doble INSERT en insumo_lotes
-- - N6  : registrar_entrega_op recalcula consumo desde BOM; valida stock antes de mutar
-- - N8  : calidad Rechazado/Cuarentena NO entra a stock ni a lotes
-- - N12 : guardar_subproducto no pisa existencia al editar
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- A. SEGURIDAD
-- -------------------------------------------------------------

-- A.1 current_user_role devuelve 'inactivo'
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN activo THEN role ELSE 'inactivo' END
     FROM public.profiles WHERE user_id = auth.uid()),
    'anon'
  );
$$;

-- A.2 Revocar de PUBLIC y anon (lo que blindaje_seguridad.sql no logró)
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- consumir_insumo_fifo es interno: ningún usuario debe invocarlo directo
REVOKE EXECUTE ON FUNCTION public.consumir_insumo_fifo(uuid, numeric, text, uuid, text)
  FROM authenticated;

-- A.3 Policy de profiles correcta: inactivos no leen nada
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('admin','operador','consulta')
    AND (user_id = auth.uid() OR public.current_user_role() = 'admin')
  );

-- A.4 Cerrar lectura a inactivos en TODAS las tablas de negocio
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'insumos','subproductos','productos_terminados','bom_recetas',
    'subproducto_recetas','subproducto_subproductos','paquete_subproductos',
    'ordenes_semanales','movimientos_inventario','sys_proveedores',
    'etiquetas_impresas','devoluciones_pt','evaluaciones_proveedores',
    'insumo_lotes','despachos','cajas_ubicacion','sys_config',
    'entregas_op','ajustes_costo_insumo'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS rol_select ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY rol_select ON public.%I FOR SELECT TO authenticated '
      'USING (public.current_user_role() IN (''admin'',''operador'',''consulta''))', t);
  END LOOP;
END $$;

-- -------------------------------------------------------------
-- B. FIFO con tipo de movimiento (N3)
-- -------------------------------------------------------------

DROP FUNCTION IF EXISTS public.consumir_insumo_fifo(uuid, numeric, text, uuid);
CREATE OR REPLACE FUNCTION public.consumir_insumo_fifo(
  p_insumo_id uuid, p_cantidad numeric, p_motivo text,
  p_orden_id uuid DEFAULT NULL, p_tipo text DEFAULT 'Consumo'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_restante numeric := p_cantidad;
  v_tomar numeric;
  v_lote record;
  v_detalle jsonb := '[]'::jsonb;
  v_costo numeric;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad debe ser mayor a 0';
  END IF;
  IF p_tipo NOT IN ('Consumo','Salida') THEN
    RAISE EXCEPTION 'Tipo de movimiento inválido: %', p_tipo;
  END IF;

  SELECT costo_unitario INTO v_costo FROM public.insumos WHERE id = p_insumo_id;

  FOR v_lote IN
    SELECT id, lote, cantidad_actual, costo_unitario
    FROM public.insumo_lotes
    WHERE insumo_id = p_insumo_id AND cantidad_actual > 0
    ORDER BY primer_ingreso ASC
  LOOP
    IF v_restante <= 0 THEN EXIT; END IF;
    v_tomar := LEAST(v_restante, v_lote.cantidad_actual);
    UPDATE public.insumo_lotes
      SET cantidad_actual = cantidad_actual - v_tomar
      WHERE id = v_lote.id;
    INSERT INTO public.movimientos_inventario
      (insumo_id, tipo, cantidad, motivo, orden_id, lote_insumo, costo_unitario_momento)
    VALUES
      (p_insumo_id, p_tipo, v_tomar, p_motivo, p_orden_id, v_lote.lote,
       COALESCE(v_lote.costo_unitario, v_costo));
    v_restante := v_restante - v_tomar;
    v_detalle := v_detalle || jsonb_build_object('lote', v_lote.lote, 'cantidad', v_tomar);
  END LOOP;

  IF v_restante > 0 THEN
    INSERT INTO public.movimientos_inventario
      (insumo_id, tipo, cantidad, motivo, orden_id, lote_insumo, costo_unitario_momento)
    VALUES
      (p_insumo_id, p_tipo, v_restante, p_motivo, p_orden_id, 'SIN LOTE', v_costo);
    v_detalle := v_detalle || jsonb_build_object('lote', 'SIN LOTE', 'cantidad', v_restante);
  END IF;

  UPDATE public.insumos SET existencia_actual = existencia_actual - p_cantidad
    WHERE id = p_insumo_id;
  RETURN jsonb_build_object('consumo_detalle', v_detalle);
END; $$;

-- -------------------------------------------------------------
-- C. Entrada simple con calidad (N8) y devolviendo los campos que JS espera (N11)
-- -------------------------------------------------------------

DROP FUNCTION IF EXISTS public.registrar_entrada(uuid, numeric, uuid, numeric, text, numeric);
DROP FUNCTION IF EXISTS public.registrar_entrada(uuid, numeric, uuid, numeric, text, numeric, text);
CREATE OR REPLACE FUNCTION public.registrar_entrada(
  p_insumo_id uuid, p_cantidad numeric,
  p_proveedor_id uuid DEFAULT NULL,
  p_costo_unitario numeric DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_rendimiento_real numeric DEFAULT NULL,
  p_lote_insumo text DEFAULT NULL,
  p_estado_calidad text DEFAULT 'Aprobado'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ins public.insumos%ROWTYPE;
  v_mov public.movimientos_inventario%ROWTYPE;
  v_cadena jsonb;
  v_factor_calc numeric := 1;
  v_factor_usar numeric;
  v_cantidad_consumo numeric;
  v_costo_por_consumo numeric;
  v_nuevo_costo numeric;
  v_lote_final text;
BEGIN
  PERFORM public.validar_escritura();
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad > 0'; END IF;
  IF p_estado_calidad NOT IN ('Aprobado','Rechazado','Cuarentena') THEN
    RAISE EXCEPTION 'Estado de calidad inválido';
  END IF;

  SELECT * INTO v_ins FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;

  v_cadena := COALESCE(v_ins.conversiones, '[]'::jsonb);
  IF jsonb_array_length(v_cadena) > 1 THEN
    SELECT COALESCE(EXP(SUM(LN(GREATEST((elem->>'factor')::numeric, 0.0000001)))), 1)
      INTO v_factor_calc
    FROM jsonb_array_elements(v_cadena) WITH ORDINALITY AS t(elem, ord)
    WHERE ord < jsonb_array_length(v_cadena);
  END IF;

  v_factor_usar := CASE WHEN p_rendimiento_real > 0 THEN p_rendimiento_real ELSE v_factor_calc END;
  v_cantidad_consumo := p_cantidad * v_factor_usar;
  v_lote_final := COALESCE(NULLIF(trim(p_lote_insumo), ''), 'SIN LOTE');

  IF p_costo_unitario IS NOT NULL AND p_costo_unitario > 0 THEN
    v_costo_por_consumo := p_costo_unitario / v_factor_usar;
    IF (v_ins.existencia_actual + v_cantidad_consumo) > 0 THEN
      v_nuevo_costo := ((v_ins.existencia_actual * v_ins.costo_unitario)
                        + (v_cantidad_consumo * v_costo_por_consumo))
                       / (v_ins.existencia_actual + v_cantidad_consumo);
    ELSE
      v_nuevo_costo := v_costo_por_consumo;
    END IF;
  ELSE
    v_costo_por_consumo := v_ins.costo_unitario;
    v_nuevo_costo := v_ins.costo_unitario;
  END IF;

  INSERT INTO public.movimientos_inventario
    (insumo_id, tipo, cantidad, proveedor_id, motivo, rendimiento_real,
     unidad_compra, cantidad_compra, costo_unitario_momento, lote_insumo, estado_calidad)
  VALUES
    (p_insumo_id, 'Entrada', v_cantidad_consumo, p_proveedor_id, p_motivo,
     p_rendimiento_real, (v_cadena->0->>'unidad'), p_cantidad,
     v_costo_por_consumo, v_lote_final, p_estado_calidad)
  RETURNING * INTO v_mov;

  -- N8: SOLO si Aprobado se suma a stock y lotes
  IF p_estado_calidad = 'Aprobado' THEN
    UPDATE public.insumos
      SET existencia_actual = existencia_actual + v_cantidad_consumo,
          costo_unitario = v_nuevo_costo
      WHERE id = p_insumo_id;

    INSERT INTO public.insumo_lotes
      (insumo_id, lote, cantidad_recibida, cantidad_actual, costo_unitario,
       proveedor_id, primer_ingreso, ultimo_ingreso)
    VALUES
      (p_insumo_id, v_lote_final, v_cantidad_consumo, v_cantidad_consumo,
       v_costo_por_consumo, p_proveedor_id, now(), now())
    ON CONFLICT (insumo_id, lote) DO UPDATE
      SET cantidad_recibida = public.insumo_lotes.cantidad_recibida + EXCLUDED.cantidad_recibida,
          cantidad_actual  = public.insumo_lotes.cantidad_actual  + EXCLUDED.cantidad_actual,
          ultimo_ingreso   = EXCLUDED.ultimo_ingreso;
  END IF;

  RETURN jsonb_build_object(
    'movimiento_id',    v_mov.id,
    'cantidad_consumo', v_cantidad_consumo,
    'existencia_nueva', CASE WHEN p_estado_calidad = 'Aprobado'
                             THEN v_ins.existencia_actual + v_cantidad_consumo
                             ELSE v_ins.existencia_actual END,
    'costo_unitario',   v_nuevo_costo,
    'estado_calidad',   p_estado_calidad
  );
END; $$;

-- -------------------------------------------------------------
-- D. Multi-lote (N1/N2): delega a registrar_entrada lote a lote
-- -------------------------------------------------------------

DROP FUNCTION IF EXISTS public.registrar_entrada_multi_lote(uuid, jsonb, uuid, numeric);
DROP FUNCTION IF EXISTS public.registrar_entrada_multi_lote(uuid, jsonb, uuid, numeric, text);
CREATE OR REPLACE FUNCTION public.registrar_entrada_multi_lote(
  p_insumo_id uuid, p_lotes jsonb,
  p_proveedor_id uuid DEFAULT NULL,
  p_costo_unitario numeric DEFAULT NULL,
  p_estado_calidad text DEFAULT 'Aprobado'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item jsonb;
  v_count int := 0;
  v_total numeric := 0;
BEGIN
  PERFORM public.validar_escritura();
  IF p_lotes IS NULL OR jsonb_array_length(p_lotes) = 0 THEN
    RAISE EXCEPTION 'Debe enviar al menos un lote';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_lotes) LOOP
    IF NULLIF(trim(v_item->>'lote'), '') IS NULL THEN
      RAISE EXCEPTION 'Todos los lotes deben tener número';
    END IF;
    IF (v_item->>'cantidad')::numeric <= 0 THEN
      RAISE EXCEPTION 'Cantidades deben ser > 0';
    END IF;
    PERFORM public.registrar_entrada(
      p_insumo_id,
      (v_item->>'cantidad')::numeric,
      p_proveedor_id,
      p_costo_unitario,
      'Entrada multi-lote',
      NULL,
      trim(v_item->>'lote'),
      p_estado_calidad
    );
    v_total := v_total + (v_item->>'cantidad')::numeric;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'lotes_insertados', v_count,
    'cantidad_total',   v_total
  );
END; $$;

-- -------------------------------------------------------------
-- E. Ajuste de inventario (N4)
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ajustar_inventario(
  p_insumo_id uuid, p_nueva_existencia numeric, p_motivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_insumo record;
  v_dif numeric;
BEGIN
  PERFORM public.validar_escritura();
  IF p_nueva_existencia IS NULL OR p_nueva_existencia < 0 THEN
    RAISE EXCEPTION 'Existencia no puede ser negativa';
  END IF;
  SELECT * INTO v_insumo FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  v_dif := p_nueva_existencia - v_insumo.existencia_actual;
  IF v_dif = 0 THEN RETURN jsonb_build_object('existencia_nueva', p_nueva_existencia); END IF;

  IF v_dif > 0 THEN
    -- N4: no insertar a mano en insumo_lotes; lo hace registrar_entrada + trigger
    PERFORM public.registrar_entrada(
      p_insumo_id, v_dif, NULL, NULL,
      COALESCE(p_motivo, 'Ajuste positivo'),
      NULL, 'AJUSTE', 'Aprobado'
    );
    UPDATE public.insumos SET existencia_actual = p_nueva_existencia WHERE id = p_insumo_id;
  ELSE
    PERFORM public.consumir_insumo_fifo(
      p_insumo_id, ABS(v_dif),
      COALESCE(p_motivo, 'Ajuste negativo'),
      NULL, 'Salida'
    );
  END IF;

  RETURN jsonb_build_object('existencia_nueva', p_nueva_existencia);
END; $$;

-- -------------------------------------------------------------
-- F. Salida manual (N3: una sola llamada con p_tipo)
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registrar_salida(
  p_insumo_id uuid, p_cantidad numeric, p_motivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_insumo record;
  v_existencia_nueva numeric;
BEGIN
  PERFORM public.validar_escritura();
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad debe ser > 0';
  END IF;
  SELECT * INTO v_insumo FROM public.insumos WHERE id = p_insumo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  IF v_insumo.existencia_actual < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente';
  END IF;

  PERFORM public.consumir_insumo_fifo(
    p_insumo_id, p_cantidad,
    'Salida manual: ' || COALESCE(p_motivo, 'Sin motivo'),
    NULL, 'Salida'
  );

  SELECT existencia_actual INTO v_existencia_nueva
    FROM public.insumos WHERE id = p_insumo_id;
  RETURN jsonb_build_object('existencia_nueva', v_existencia_nueva);
END; $$;

-- -------------------------------------------------------------
-- G. Devolución a proveedor con costo_unitario_momento (N6)
-- -------------------------------------------------------------

DROP FUNCTION IF EXISTS public.registrar_devolucion(uuid, numeric, uuid, text);
CREATE OR REPLACE FUNCTION public.registrar_devolucion(
  p_insumo_id uuid, p_cantidad numeric, p_proveedor_id uuid,
  p_motivo text DEFAULT NULL, p_lote text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_insumo record;
  v_restante numeric := p_cantidad;
  v_tomar numeric;
  v_lote_rec record;
  v_existencia_nueva numeric;
BEGIN
  PERFORM public.validar_escritura();
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad > 0'; END IF;
  SELECT * INTO v_insumo FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  IF v_insumo.existencia_actual < p_cantidad THEN
    RAISE EXCEPTION 'No hay suficiente stock para devolver';
  END IF;

  IF p_lote IS NOT NULL THEN
    UPDATE public.insumo_lotes SET cantidad_actual = cantidad_actual - p_cantidad
      WHERE insumo_id = p_insumo_id AND lote = p_lote;
  ELSE
    FOR v_lote_rec IN
      SELECT id, lote, cantidad_actual FROM public.insumo_lotes
      WHERE insumo_id = p_insumo_id AND cantidad_actual > 0
      ORDER BY primer_ingreso DESC
    LOOP
      IF v_restante <= 0 THEN EXIT; END IF;
      v_tomar := LEAST(v_restante, v_lote_rec.cantidad_actual);
      UPDATE public.insumo_lotes SET cantidad_actual = cantidad_actual - v_tomar
        WHERE id = v_lote_rec.id;
      v_restante := v_restante - v_tomar;
    END LOOP;
  END IF;

  UPDATE public.insumos SET existencia_actual = existencia_actual - p_cantidad
    WHERE id = p_insumo_id RETURNING existencia_actual INTO v_existencia_nueva;

  INSERT INTO public.movimientos_inventario
    (insumo_id, tipo, cantidad, proveedor_id, motivo, lote_insumo, costo_unitario_momento)
  VALUES
    (p_insumo_id, 'Salida', p_cantidad, p_proveedor_id,
     COALESCE(p_motivo, 'Devolución a proveedor'), p_lote, v_insumo.costo_unitario);

  RETURN jsonb_build_object('existencia_nueva', v_existencia_nueva);
END; $$;

-- -------------------------------------------------------------
-- H. registrar_entrega_op desde BOM (N6) con validación previa
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registrar_entrega_op(
  p_orden_id uuid, p_cantidad numeric,
  p_lote_entrega text DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_op record;
  v_ins record;
  v_sub record;
  v_receta record;
  v_stock_actual numeric;
  v_faltante numeric;
  v_faltante_restante numeric;
  v_faltantes jsonb := '[]'::jsonb;
  v_email text;
  v_producido_antes numeric;
  v_existencia_pt numeric;
  v_pendiente numeric;
  v_items_afectados int := 0;
BEGIN
  PERFORM public.validar_escritura();
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad debe ser > 0'; END IF;

  SELECT * INTO v_op FROM public.ordenes_semanales WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OP no encontrada'; END IF;
  IF v_op.estado_op IN ('Terminada','Cancelada') THEN
    RAISE EXCEPTION 'La OP ya está cerrada o cancelada';
  END IF;

  v_producido_antes := COALESCE(v_op.cantidad_producida, 0);
  v_pendiente := v_op.cantidad_proyectada - v_producido_antes;
  IF p_cantidad > v_pendiente THEN
    RAISE EXCEPTION 'La cantidad excede el pendiente. Pendiente: %', v_pendiente;
  END IF;

  -- FASE 1: validar stock suficiente ANTES de mutar
  FOR v_sub IN SELECT subproducto_id, cantidad FROM public.paquete_subproductos
               WHERE codigo_pt = v_op.codigo_pt
  LOOP
    v_faltante := v_sub.cantidad * p_cantidad;
    SELECT existencia_actual INTO v_stock_actual FROM public.subproductos
      WHERE id = v_sub.subproducto_id FOR UPDATE;
    IF v_stock_actual < v_faltante THEN
      -- el resto se auto-produce; validar insumos de la receta
      v_faltante_restante := v_faltante - v_stock_actual;
      FOR v_receta IN SELECT insumo_id, cantidad_por_unidad, factor_receta
                      FROM public.subproducto_recetas
                      WHERE subproducto_id = v_sub.subproducto_id
      LOOP
        PERFORM 1 FROM public.insumos
          WHERE id = v_receta.insumo_id
            AND existencia_actual < v_receta.cantidad_por_unidad
                                    * COALESCE(v_receta.factor_receta, 1)
                                    * v_faltante_restante;
        IF FOUND THEN
          v_faltantes := v_faltantes || jsonb_build_object(
            'tipo','insumo','insumo_id',v_receta.insumo_id,'faltante_auto',v_faltante_restante
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  FOR v_ins IN SELECT insumo_id, cantidad_por_unidad FROM public.bom_recetas
               WHERE codigo_pt = v_op.codigo_pt
  LOOP
    v_faltante := v_ins.cantidad_por_unidad * p_cantidad;
    SELECT existencia_actual INTO v_stock_actual FROM public.insumos
      WHERE id = v_ins.insumo_id FOR UPDATE;
    IF v_stock_actual < v_faltante THEN
      v_faltantes := v_faltantes || jsonb_build_object(
        'tipo','insumo','insumo_id',v_ins.insumo_id,
        'requerido',v_faltante,'existencia',v_stock_actual
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_faltantes) > 0 THEN
    RAISE EXCEPTION 'Stock insuficiente para esta entrega: %', v_faltantes::text;
  END IF;

  -- FASE 2: consumir subproductos (stock + auto-producción del faltante)
  FOR v_sub IN SELECT subproducto_id, cantidad FROM public.paquete_subproductos
               WHERE codigo_pt = v_op.codigo_pt
  LOOP
    v_faltante := v_sub.cantidad * p_cantidad;
    SELECT existencia_actual INTO v_stock_actual FROM public.subproductos
      WHERE id = v_sub.subproducto_id FOR UPDATE;

    IF v_stock_actual >= v_faltante THEN
      UPDATE public.subproductos SET existencia_actual = existencia_actual - v_faltante
        WHERE id = v_sub.subproducto_id;
      INSERT INTO public.movimientos_inventario
        (subproducto_id, tipo, cantidad, motivo, orden_id)
      VALUES
        (v_sub.subproducto_id, 'Consumo', v_faltante,
         'Consumo OP ' || COALESCE(v_op.numero_op,''), p_orden_id);
    ELSE
      IF v_stock_actual > 0 THEN
        UPDATE public.subproductos SET existencia_actual = 0
          WHERE id = v_sub.subproducto_id;
        INSERT INTO public.movimientos_inventario
          (subproducto_id, tipo, cantidad, motivo, orden_id)
        VALUES
          (v_sub.subproducto_id, 'Consumo', v_stock_actual,
           'Consumo OP ' || COALESCE(v_op.numero_op,''), p_orden_id);
      END IF;
      v_faltante_restante := v_faltante - v_stock_actual;
      FOR v_receta IN SELECT insumo_id, cantidad_por_unidad, factor_receta
                      FROM public.subproducto_recetas
                      WHERE subproducto_id = v_sub.subproducto_id
      LOOP
        PERFORM public.consumir_insumo_fifo(
          v_receta.insumo_id,
          v_receta.cantidad_por_unidad * COALESCE(v_receta.factor_receta,1) * v_faltante_restante,
          'Auto-producción OP ' || COALESCE(v_op.numero_op,''),
          p_orden_id, 'Consumo'
        );
      END LOOP;
    END IF;
  END LOOP;

  -- FASE 3: consumir insumos directos (FIFO)
  FOR v_ins IN SELECT insumo_id, cantidad_por_unidad FROM public.bom_recetas
               WHERE codigo_pt = v_op.codigo_pt
  LOOP
    v_faltante := v_ins.cantidad_por_unidad * p_cantidad;
    PERFORM public.consumir_insumo_fifo(
      v_ins.insumo_id, v_faltante,
      'Consumo OP ' || COALESCE(v_op.numero_op,''),
      p_orden_id, 'Consumo'
    );
  END LOOP;

  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.entregas_op (orden_id, cantidad, lote_entrega, motivo, usuario_email)
  VALUES (p_orden_id, p_cantidad, p_lote_entrega, p_motivo, v_email);

  UPDATE public.productos_terminados
    SET existencia_actual = COALESCE(existencia_actual, 0) + p_cantidad
    WHERE codigo_pt = v_op.codigo_pt
    RETURNING existencia_actual INTO v_existencia_pt;

  UPDATE public.ordenes_semanales
    SET cantidad_producida = v_producido_antes + p_cantidad,
        estado_op = CASE WHEN (v_producido_antes + p_cantidad) >= cantidad_proyectada
                         THEN 'Terminada' ELSE 'En proceso' END,
        fecha_completado = CASE WHEN (v_producido_antes + p_cantidad) >= cantidad_proyectada
                                THEN now() ELSE NULL END
  WHERE id = p_orden_id;

  RETURN jsonb_build_object(
    'ok', true,
    'cantidad_producida', v_producido_antes + p_cantidad,
    'cantidad_pendiente', v_pendiente - p_cantidad,
    'op_cerrada', (v_producido_antes + p_cantidad) >= v_op.cantidad_proyectada,
    'existencia_pt', v_existencia_pt
  );
END; $$;

-- -------------------------------------------------------------
-- I. Resto de RPCs: validar_escritura + search_path (N5)
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirmar_orden(
  p_codigo_pt text, p_cantidad numeric, p_estado_cobertura text, p_detalle jsonb,
  p_numero_op text DEFAULT NULL, p_cantidad_cajas numeric DEFAULT NULL,
  p_lote text DEFAULT NULL, p_prioridad integer DEFAULT NULL,
  p_fecha_programada date DEFAULT NULL
) RETURNS public.ordenes_semanales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_orden public.ordenes_semanales%ROWTYPE;
BEGIN
  PERFORM public.validar_escritura();
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad > 0'; END IF;
  INSERT INTO public.ordenes_semanales
    (codigo_pt, cantidad_proyectada, estado_cobertura, detalle_faltantes,
     numero_op, cantidad_cajas, lote, prioridad, fecha_programada)
  VALUES
    (p_codigo_pt, p_cantidad, p_estado_cobertura, p_detalle,
     p_numero_op, p_cantidad_cajas, p_lote, p_prioridad, p_fecha_programada)
  RETURNING * INTO v_orden;
  RETURN v_orden;
END; $$;

CREATE OR REPLACE FUNCTION public.cancelar_orden(p_orden_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_orden public.ordenes_semanales%ROWTYPE;
BEGIN
  PERFORM public.validar_escritura();
  SELECT * INTO v_orden FROM public.ordenes_semanales WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;
  IF v_orden.estado_op = 'Terminada' THEN RAISE EXCEPTION 'No se puede cancelar una OP terminada'; END IF;
  IF v_orden.estado_op = 'Cancelada' THEN RAISE EXCEPTION 'La OP ya está cancelada'; END IF;
  UPDATE public.ordenes_semanales
    SET estado_op = 'Cancelada', fecha_cancelado = now(), motivo_cancelacion = p_motivo
    WHERE id = p_orden_id;
  RETURN jsonb_build_object('ok', true);
END; $$;

-- N12: guardar_subproducto no pisa existencia al editar
CREATE OR REPLACE FUNCTION public.guardar_subproducto(
  p_id uuid, p_codigo text, p_nombre text,
  p_existencia numeric, p_punto_reorden numeric,
  p_receta jsonb, p_hijos jsonb DEFAULT '[]'::jsonb, p_tipo text DEFAULT 'ambos'
) RETURNS public.subproductos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub public.subproductos%ROWTYPE; v_row jsonb;
BEGIN
  PERFORM public.validar_escritura();
  IF p_nombre IS NULL OR length(trim(p_nombre)) = 0 THEN RAISE EXCEPTION 'Nombre obligatorio'; END IF;
  IF p_tipo NOT IN ('intermedio','final','ambos') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.subproductos (codigo, nombre, existencia_actual, punto_reorden, tipo)
      VALUES (p_codigo, p_nombre, COALESCE(p_existencia, 0),
              COALESCE(p_punto_reorden, 0), p_tipo)
      RETURNING * INTO v_sub;
  ELSE
    IF EXISTS (
      WITH RECURSIVE descendientes AS (
        SELECT subproducto_hijo_id AS id FROM public.subproducto_subproductos
          WHERE subproducto_padre_id = p_id
        UNION ALL
        SELECT ss.subproducto_hijo_id FROM public.subproducto_subproductos ss
          JOIN descendientes d ON ss.subproducto_padre_id = d.id
      ) SELECT 1 FROM descendientes WHERE id = p_id
    ) THEN RAISE EXCEPTION 'Ciclo detectado'; END IF;

    -- N12: NO tocar existencia_actual al editar (se ajusta solo vía Entrada/Auditoría)
    UPDATE public.subproductos
      SET nombre = p_nombre,
          punto_reorden = COALESCE(p_punto_reorden, 0),
          tipo = p_tipo
      WHERE id = p_id RETURNING * INTO v_sub;
    IF NOT FOUND THEN RAISE EXCEPTION 'Subproducto no encontrado'; END IF;
    DELETE FROM public.subproducto_recetas WHERE subproducto_id = p_id;
    DELETE FROM public.subproducto_subproductos WHERE subproducto_padre_id = p_id;
  END IF;

  IF p_receta IS NOT NULL THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_receta) LOOP
      INSERT INTO public.subproducto_recetas
        (subproducto_id, insumo_id, cantidad_por_unidad, unidad_receta, factor_receta)
      VALUES
        (v_sub.id, (v_row->>'insumo_id')::uuid, (v_row->>'cantidad')::numeric,
         NULLIF(v_row->>'unidad_receta',''), COALESCE((v_row->>'factor_receta')::numeric, 1));
    END LOOP;
  END IF;

  IF p_hijos IS NOT NULL THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_hijos) LOOP
      IF (v_row->>'subproducto_id')::uuid = v_sub.id THEN RAISE EXCEPTION 'Auto-referencia'; END IF;
      INSERT INTO public.subproducto_subproductos
        (subproducto_padre_id, subproducto_hijo_id, cantidad_por_unidad)
      VALUES
        (v_sub.id, (v_row->>'subproducto_id')::uuid, (v_row->>'cantidad')::numeric);
    END LOOP;
  END IF;

  RETURN v_sub;
END; $$;

-- guardar_paquete con validación
CREATE OR REPLACE FUNCTION public.guardar_paquete(
  p_codigo_pt text, p_es_nuevo boolean, p_nombre text,
  p_subproductos jsonb, p_insumos jsonb,
  p_unidades_por_caja integer DEFAULT 1, p_precio_venta numeric DEFAULT NULL
) RETURNS public.productos_terminados
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prod public.productos_terminados%ROWTYPE; v_row jsonb;
BEGIN
  PERFORM public.validar_escritura();
  IF p_nombre IS NULL OR length(trim(p_nombre)) = 0 THEN RAISE EXCEPTION 'Nombre obligatorio'; END IF;
  IF p_unidades_por_caja IS NULL OR p_unidades_por_caja < 1 THEN RAISE EXCEPTION 'Unidades por caja >= 1'; END IF;

  IF p_es_nuevo THEN
    INSERT INTO public.productos_terminados
      (codigo_pt, nombre, unidades_por_caja, precio_venta)
    VALUES
      (p_codigo_pt, p_nombre, p_unidades_por_caja, p_precio_venta)
      RETURNING * INTO v_prod;
  ELSE
    UPDATE public.productos_terminados
      SET nombre = p_nombre, unidades_por_caja = p_unidades_por_caja,
          precio_venta = p_precio_venta
      WHERE codigo_pt = p_codigo_pt RETURNING * INTO v_prod;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
    DELETE FROM public.paquete_subproductos WHERE codigo_pt = p_codigo_pt;
    DELETE FROM public.bom_recetas WHERE codigo_pt = p_codigo_pt;
  END IF;

  IF p_subproductos IS NOT NULL THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_subproductos) LOOP
      INSERT INTO public.paquete_subproductos (codigo_pt, subproducto_id, cantidad)
      VALUES (v_prod.codigo_pt, (v_row->>'subproducto_id')::uuid, (v_row->>'cantidad')::numeric);
    END LOOP;
  END IF;

  IF p_insumos IS NOT NULL THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_insumos) LOOP
      INSERT INTO public.bom_recetas (codigo_pt, insumo_id, cantidad_por_unidad)
      VALUES (v_prod.codigo_pt, (v_row->>'insumo_id')::uuid, (v_row->>'cantidad')::numeric);
    END LOOP;
  END IF;

  RETURN v_prod;
END; $$;

CREATE OR REPLACE FUNCTION public.eliminar_insumo(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bom int; v_subre int; v_mov int;
BEGIN
  PERFORM public.validar_escritura();
  SELECT COUNT(*) INTO v_bom FROM public.bom_recetas WHERE insumo_id = p_id;
  SELECT COUNT(*) INTO v_subre FROM public.subproducto_recetas WHERE insumo_id = p_id;
  SELECT COUNT(*) INTO v_mov FROM public.movimientos_inventario WHERE insumo_id = p_id;
  IF v_bom > 0 OR v_subre > 0 THEN
    RAISE EXCEPTION 'En uso en recetas (BOM: %, subproductos: %)', v_bom, v_subre;
  END IF;
  IF v_mov > 0 THEN
    RAISE EXCEPTION 'Tiene % movimientos. Desactívalo en lugar de borrarlo.', v_mov;
  END IF;
  DELETE FROM public.insumos WHERE id = p_id;
END; $$;

CREATE OR REPLACE FUNCTION public.ajustar_subproducto(
  p_id uuid, p_nueva_existencia numeric, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub public.subproductos%ROWTYPE; v_diff numeric; v_tipo text;
BEGIN
  PERFORM public.validar_escritura();
  IF p_nueva_existencia IS NULL OR p_nueva_existencia < 0 THEN
    RAISE EXCEPTION 'Existencia no puede ser negativa';
  END IF;
  SELECT * INTO v_sub FROM public.subproductos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subproducto no encontrado'; END IF;
  v_diff := p_nueva_existencia - v_sub.existencia_actual;
  IF v_diff = 0 THEN RETURN jsonb_build_object('existencia_nueva', p_nueva_existencia); END IF;
  v_tipo := CASE WHEN v_diff > 0 THEN 'Entrada' ELSE 'Salida' END;
  UPDATE public.subproductos SET existencia_actual = p_nueva_existencia WHERE id = p_id;
  INSERT INTO public.movimientos_inventario (subproducto_id, tipo, cantidad, motivo)
    VALUES (p_id, v_tipo, ABS(v_diff), COALESCE(p_motivo,'Ajuste por inventario físico'));
  RETURN jsonb_build_object('existencia_nueva', p_nueva_existencia);
END; $$;

CREATE OR REPLACE FUNCTION public.ajustar_costo_insumo(
  p_insumo_id uuid, p_costo_nuevo numeric, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ins public.insumos%ROWTYPE; v_email text;
BEGIN
  PERFORM public.validar_escritura();
  IF p_costo_nuevo IS NULL OR p_costo_nuevo < 0 THEN RAISE EXCEPTION 'Costo no puede ser negativo'; END IF;
  SELECT * INTO v_ins FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.ajustes_costo_insumo
    (insumo_id, costo_anterior, costo_nuevo, motivo, usuario_id, usuario_email)
  VALUES
    (p_insumo_id, v_ins.costo_unitario, p_costo_nuevo, p_motivo, auth.uid(), v_email);
  UPDATE public.insumos SET costo_unitario = p_costo_nuevo WHERE id = p_insumo_id;
  RETURN jsonb_build_object('costo_anterior', v_ins.costo_unitario, 'costo_nuevo', p_costo_nuevo);
END; $$;

CREATE OR REPLACE FUNCTION public.registrar_devolucion_pt(
  p_codigo_pt text, p_cantidad numeric,
  p_estado_producto text DEFAULT 'bueno', p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pt public.productos_terminados%ROWTYPE; v_id uuid; v_email text; v_existencia_despues numeric;
BEGIN
  PERFORM public.validar_escritura();
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad > 0'; END IF;
  IF p_estado_producto NOT IN ('bueno','dañado','cuarentena') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;
  SELECT * INTO v_pt FROM public.productos_terminados WHERE codigo_pt = p_codigo_pt FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PT no encontrado'; END IF;
  IF p_estado_producto = 'bueno' THEN
    UPDATE public.productos_terminados
      SET existencia_actual = COALESCE(existencia_actual, 0) + p_cantidad
      WHERE codigo_pt = p_codigo_pt;
    v_existencia_despues := COALESCE(v_pt.existencia_actual, 0) + p_cantidad;
  ELSE
    v_existencia_despues := COALESCE(v_pt.existencia_actual, 0);
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.devoluciones_pt
    (codigo_pt, cantidad, estado_producto, motivo, usuario_id, usuario_email)
  VALUES
    (p_codigo_pt, p_cantidad, p_estado_producto, p_motivo, auth.uid(), v_email)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'existencia_nueva', v_existencia_despues,
                            'afecta_stock', p_estado_producto = 'bueno');
END; $$;

CREATE OR REPLACE FUNCTION public.registrar_despacho(
  p_codigo_pt text, p_cantidad numeric, p_cliente text,
  p_lote_op text DEFAULT NULL, p_consecutivo text DEFAULT NULL,
  p_oc text DEFAULT NULL, p_fecha date DEFAULT CURRENT_DATE,
  p_fecha_vencimiento text DEFAULT NULL, p_observaciones text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pt record; v_existencia_nueva numeric; v_email text;
BEGIN
  PERFORM public.validar_escritura();
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad > 0'; END IF;
  IF p_cliente IS NULL OR length(trim(p_cliente)) = 0 THEN RAISE EXCEPTION 'Cliente obligatorio'; END IF;
  SELECT * INTO v_pt FROM public.productos_terminados WHERE codigo_pt = p_codigo_pt FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PT no encontrado'; END IF;
  IF v_pt.existencia_actual < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente. Disponible: %', v_pt.existencia_actual;
  END IF;
  UPDATE public.productos_terminados SET existencia_actual = existencia_actual - p_cantidad
    WHERE codigo_pt = p_codigo_pt RETURNING existencia_actual INTO v_existencia_nueva;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.despachos
    (codigo_pt, cantidad, cliente, lote_op, consecutivo, oc, fecha,
     fecha_vencimiento, observaciones, usuario_email)
  VALUES
    (p_codigo_pt, p_cantidad, p_cliente, p_lote_op, p_consecutivo, p_oc, p_fecha,
     p_fecha_vencimiento, p_observaciones, v_email);
  RETURN jsonb_build_object('ok', true, 'existencia_nueva', v_existencia_nueva);
END; $$;

CREATE OR REPLACE FUNCTION public.producir_subproducto(
  p_id uuid, p_cantidad numeric, p_lote text DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub record; v_receta record; v_hijo record;
  v_items int := 0; v_existencia_nueva numeric;
  v_faltantes jsonb := '[]'::jsonb; v_stock numeric;
BEGIN
  PERFORM public.validar_escritura();
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad > 0'; END IF;
  SELECT * INTO v_sub FROM public.subproductos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subproducto no encontrado'; END IF;

  -- Validar stock de insumos
  FOR v_receta IN SELECT insumo_id, cantidad_por_unidad, factor_receta
                  FROM public.subproducto_recetas WHERE subproducto_id = p_id
  LOOP
    SELECT existencia_actual INTO v_stock FROM public.insumos
      WHERE id = v_receta.insumo_id FOR UPDATE;
    IF v_stock < v_receta.cantidad_por_unidad * COALESCE(v_receta.factor_receta,1) * p_cantidad THEN
      v_faltantes := v_faltantes || jsonb_build_object(
        'tipo','insumo','insumo_id',v_receta.insumo_id
      );
    END IF;
  END LOOP;
  -- Validar stock de hijos
  FOR v_hijo IN SELECT subproducto_hijo_id, cantidad_por_unidad
                FROM public.subproducto_subproductos WHERE subproducto_padre_id = p_id
  LOOP
    SELECT existencia_actual INTO v_stock FROM public.subproductos
      WHERE id = v_hijo.subproducto_hijo_id FOR UPDATE;
    IF v_stock < v_hijo.cantidad_por_unidad * p_cantidad THEN
      v_faltantes := v_faltantes || jsonb_build_object(
        'tipo','subproducto','subproducto_id',v_hijo.subproducto_hijo_id
      );
    END IF;
  END LOOP;
  IF jsonb_array_length(v_faltantes) > 0 THEN
    RAISE EXCEPTION 'Stock insuficiente: %', v_faltantes::text;
  END IF;

  FOR v_receta IN SELECT insumo_id, cantidad_por_unidad, factor_receta
                  FROM public.subproducto_recetas WHERE subproducto_id = p_id
  LOOP
    PERFORM public.consumir_insumo_fifo(
      v_receta.insumo_id,
      v_receta.cantidad_por_unidad * COALESCE(v_receta.factor_receta,1) * p_cantidad,
      'Producción de ' || v_sub.nombre,
      NULL, 'Consumo'
    );
    v_items := v_items + 1;
  END LOOP;

  FOR v_hijo IN SELECT subproducto_hijo_id, cantidad_por_unidad
                FROM public.subproducto_subproductos WHERE subproducto_padre_id = p_id
  LOOP
    UPDATE public.subproductos
      SET existencia_actual = existencia_actual - (v_hijo.cantidad_por_unidad * p_cantidad)
      WHERE id = v_hijo.subproducto_hijo_id;
    INSERT INTO public.movimientos_inventario
      (subproducto_id, tipo, cantidad, motivo)
    VALUES
      (v_hijo.subproducto_hijo_id, 'Consumo',
       v_hijo.cantidad_por_unidad * p_cantidad,
       'Producción de ' || v_sub.nombre);
    v_items := v_items + 1;
  END LOOP;

  UPDATE public.subproductos SET existencia_actual = existencia_actual + p_cantidad
    WHERE id = p_id RETURNING existencia_actual INTO v_existencia_nueva;
  INSERT INTO public.movimientos_inventario
    (subproducto_id, tipo, cantidad, motivo, lote_insumo)
  VALUES
    (p_id, 'Entrada', p_cantidad, COALESCE(p_motivo, 'Producción manual'), p_lote);
  RETURN jsonb_build_object('existencia_nueva', v_existencia_nueva, 'items_afectados', v_items);
END; $$;

-- Limpiar la versión con 6 argumentos de registrar_entrada si existe
DROP FUNCTION IF EXISTS public.registrar_entrada(uuid, numeric, uuid, numeric, text, numeric);

COMMIT;