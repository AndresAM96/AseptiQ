-- =============================================================
-- v2.5.1
--  · N12 (a): Cajas con lote. Código = {PT}-C{###}-LOTE-{lote}
--  · N12 (b): FIFO deshabilitado para insumos sin lote real
--  · N6     : Consumo recursivo de subproductos en registrar_entrega_op
--  · Fix    : Trigger mov_inv_sync_lotes solo actúa si estado_calidad='Aprobado'
--  · Fix    : registrar_entrada ya NO inserta en insumo_lotes (lo hace el trigger)
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. TRIGGER LOTES: solo sumar si calidad = 'Aprobado'
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mov_inv_sync_lotes()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_lote text;
BEGIN
  IF NEW.tipo = 'Entrada'
     AND NEW.insumo_id IS NOT NULL
     AND COALESCE(NEW.estado_calidad, 'Aprobado') = 'Aprobado'
  THEN
    v_lote := COALESCE(NULLIF(trim(NEW.lote_insumo), ''), 'SIN LOTE');
    INSERT INTO public.insumo_lotes
      (insumo_id, lote, cantidad_recibida, cantidad_actual, costo_unitario,
       proveedor_id, primer_ingreso, ultimo_ingreso)
    VALUES
      (NEW.insumo_id, v_lote, COALESCE(NEW.cantidad,0), COALESCE(NEW.cantidad,0),
       NEW.costo_unitario_momento, NEW.proveedor_id, NEW.fecha, NEW.fecha)
    ON CONFLICT (insumo_id, lote) DO UPDATE
      SET cantidad_recibida = public.insumo_lotes.cantidad_recibida + EXCLUDED.cantidad_recibida,
          cantidad_actual   = public.insumo_lotes.cantidad_actual   + EXCLUDED.cantidad_actual,
          ultimo_ingreso    = EXCLUDED.ultimo_ingreso,
          costo_unitario    = COALESCE(EXCLUDED.costo_unitario, public.insumo_lotes.costo_unitario),
          proveedor_id      = COALESCE(EXCLUDED.proveedor_id, public.insumo_lotes.proveedor_id);
  END IF;
  RETURN NEW;
END; $$;

-- -------------------------------------------------------------
-- 2. registrar_entrada: sin INSERT manual en insumo_lotes
--    (el trigger ya lo hace)
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
  -- El trigger mov_inv_sync_lotes suma al lote SOLO si estado_calidad='Aprobado'.

  IF p_estado_calidad = 'Aprobado' THEN
    UPDATE public.insumos
      SET existencia_actual = existencia_actual + v_cantidad_consumo,
          costo_unitario    = v_nuevo_costo
      WHERE id = p_insumo_id;
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
-- 3. consumir_insumo_fifo: sin-lote => descuento directo
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
  v_lotes_reales int;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad debe ser > 0';
  END IF;
  IF p_tipo NOT IN ('Consumo','Salida') THEN
    RAISE EXCEPTION 'Tipo de movimiento inválido: %', p_tipo;
  END IF;

  SELECT costo_unitario INTO v_costo FROM public.insumos WHERE id = p_insumo_id;

  -- N12(b): ¿el insumo maneja lotes reales (algún lote != 'SIN LOTE')?
  SELECT COUNT(*) INTO v_lotes_reales
    FROM public.insumo_lotes
    WHERE insumo_id = p_insumo_id
      AND cantidad_actual > 0
      AND lote <> 'SIN LOTE';

  IF v_lotes_reales = 0 THEN
    -- Sin FIFO: descuento directo, sin recorrer lotes
    INSERT INTO public.movimientos_inventario
      (insumo_id, tipo, cantidad, motivo, orden_id, lote_insumo, costo_unitario_momento)
    VALUES
      (p_insumo_id, p_tipo, p_cantidad, p_motivo, p_orden_id, 'SIN LOTE', v_costo);
    UPDATE public.insumos SET existencia_actual = existencia_actual - p_cantidad
      WHERE id = p_insumo_id;
    RETURN jsonb_build_object('consumo_detalle', jsonb_build_array(
      jsonb_build_object('lote','SIN LOTE','cantidad',p_cantidad)
    ));
  END IF;

  -- FIFO normal
  FOR v_lote IN
    SELECT id, lote, cantidad_actual, costo_unitario
    FROM public.insumo_lotes
    WHERE insumo_id = p_insumo_id AND cantidad_actual > 0
    ORDER BY primer_ingreso ASC
  LOOP
    IF v_restante <= 0 THEN EXIT; END IF;
    v_tomar := LEAST(v_restante, v_lote.cantidad_actual);
    UPDATE public.insumo_lotes SET cantidad_actual = cantidad_actual - v_tomar
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
-- 4. N6: Consumo recursivo de subproductos
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consumir_subproducto_recursivo(
  p_sub_id uuid, p_cantidad numeric, p_orden_id uuid DEFAULT NULL,
  p_visited uuid[] DEFAULT ARRAY[]::uuid[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub record;
  v_stock numeric;
  v_faltante numeric;
  v_receta record;
  v_hijo record;
  v_consumido_de_stock numeric := 0;
BEGIN
  IF p_sub_id = ANY(p_visited) THEN
    RAISE EXCEPTION 'Ciclo detectado en subproductos (id=%)', p_sub_id;
  END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RETURN jsonb_build_object('consumido_de_stock', 0, 'auto_producido', 0);
  END IF;

  SELECT * INTO v_sub FROM public.subproductos WHERE id = p_sub_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subproducto no encontrado: %', p_sub_id; END IF;

  v_stock := COALESCE(v_sub.existencia_actual, 0);

  IF v_stock >= p_cantidad THEN
    UPDATE public.subproductos SET existencia_actual = existencia_actual - p_cantidad
      WHERE id = p_sub_id;
    INSERT INTO public.movimientos_inventario
      (subproducto_id, tipo, cantidad, motivo, orden_id)
    VALUES (p_sub_id, 'Consumo', p_cantidad, 'Consumo OP', p_orden_id);
    RETURN jsonb_build_object('consumido_de_stock', p_cantidad, 'auto_producido', 0);
  END IF;

  IF v_stock > 0 THEN
    UPDATE public.subproductos SET existencia_actual = 0 WHERE id = p_sub_id;
    INSERT INTO public.movimientos_inventario
      (subproducto_id, tipo, cantidad, motivo, orden_id)
    VALUES (p_sub_id, 'Consumo', v_stock, 'Consumo OP', p_orden_id);
    v_consumido_de_stock := v_stock;
  END IF;

  v_faltante := p_cantidad - v_stock;

  -- 4a. Primero asegurar hijos (recursivo)
  FOR v_hijo IN SELECT subproducto_hijo_id, cantidad_por_unidad
                FROM public.subproducto_subproductos
                WHERE subproducto_padre_id = p_sub_id
  LOOP
    PERFORM public.consumir_subproducto_recursivo(
      v_hijo.subproducto_hijo_id,
      v_hijo.cantidad_por_unidad * v_faltante,
      p_orden_id,
      p_visited || p_sub_id
    );
  END LOOP;

  -- 4b. Consumir insumos directos (FIFO)
  FOR v_receta IN SELECT insumo_id, cantidad_por_unidad, factor_receta
                  FROM public.subproducto_recetas
                  WHERE subproducto_id = p_sub_id
  LOOP
    PERFORM public.consumir_insumo_fifo(
      v_receta.insumo_id,
      v_receta.cantidad_por_unidad * COALESCE(v_receta.factor_receta, 1) * v_faltante,
      'Auto-producción OP',
      p_orden_id,
      'Consumo'
    );
  END LOOP;

  -- 4c. Registrar la entrada del subproducto auto-producido
  INSERT INTO public.movimientos_inventario
    (subproducto_id, tipo, cantidad, motivo, orden_id)
  VALUES (p_sub_id, 'Entrada', v_faltante, 'Auto-producción OP', p_orden_id);

  RETURN jsonb_build_object('consumido_de_stock', v_consumido_de_stock, 'auto_producido', v_faltante);
END; $$;

-- 4d. Preview sin mutar (para validación)
CREATE OR REPLACE FUNCTION public.planificar_consumo_subproducto(
  p_sub_id uuid, p_cantidad numeric,
  p_visited uuid[] DEFAULT ARRAY[]::uuid[]
) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_sub record;
  v_stock numeric;
  v_faltante numeric;
  v_insumos jsonb := '[]'::jsonb;
  v_rec record;
  v_hijo record;
  v_hijos_result jsonb;
BEGIN
  IF p_sub_id = ANY(p_visited) THEN
    RAISE EXCEPTION 'Ciclo detectado en subproductos';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RETURN jsonb_build_object('insumos', v_insumos);
  END IF;

  SELECT existencia_actual INTO v_stock FROM public.subproductos WHERE id = p_sub_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subproducto no encontrado: %', p_sub_id; END IF;
  v_stock := COALESCE(v_stock, 0);
  IF v_stock >= p_cantidad THEN
    RETURN jsonb_build_object('insumos', v_insumos);
  END IF;

  v_faltante := p_cantidad - v_stock;

  FOR v_hijo IN SELECT subproducto_hijo_id, cantidad_por_unidad
                FROM public.subproducto_subproductos
                WHERE subproducto_padre_id = p_sub_id
  LOOP
    v_hijos_result := public.planificar_consumo_subproducto(
      v_hijo.subproducto_hijo_id,
      v_hijo.cantidad_por_unidad * v_faltante,
      p_visited || p_sub_id
    );
    v_insumos := v_insumos || (v_hijos_result->'insumos');
  END LOOP;

  FOR v_rec IN SELECT insumo_id, cantidad_por_unidad, factor_receta
               FROM public.subproducto_recetas
               WHERE subproducto_id = p_sub_id
  LOOP
    v_insumos := v_insumos || jsonb_build_object(
      'insumo_id', v_rec.insumo_id,
      'cantidad',  v_rec.cantidad_por_unidad * COALESCE(v_rec.factor_receta, 1) * v_faltante
    );
  END LOOP;

  RETURN jsonb_build_object('insumos', v_insumos);
END; $$;

-- -------------------------------------------------------------
-- 5. registrar_entrega_op con recursión + validación agrupada
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
  v_plan jsonb;
  v_req jsonb;
  v_req_map jsonb := '{}'::jsonb;
  v_key text;
  v_stock numeric;
  v_cant_req numeric;
  v_faltantes jsonb := '[]'::jsonb;
  v_email text;
  v_producido_antes numeric;
  v_existencia_pt numeric;
  v_pendiente numeric;
  v_items_afectados int := 0;
BEGIN
  PERFORM public.validar_escritura();
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad debe ser > 0';
  END IF;

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

  -- ============ FASE 1: PLANIFICAR + VALIDAR ============
  -- 1a. Subproductos: planificar recursivamente y acumular requerimientos
  FOR v_sub IN SELECT subproducto_id, cantidad FROM public.paquete_subproductos
               WHERE codigo_pt = v_op.codigo_pt
  LOOP
    v_plan := public.planificar_consumo_subproducto(
      v_sub.subproducto_id, v_sub.cantidad * p_cantidad
    );
    FOR v_req IN SELECT * FROM jsonb_array_elements(v_plan->'insumos') LOOP
      v_key := v_req->>'insumo_id';
      v_cant_req := (v_req->>'cantidad')::numeric;
      v_req_map := jsonb_set(
        v_req_map, ARRAY[v_key],
        to_jsonb(COALESCE((v_req_map->>v_key)::numeric, 0) + v_cant_req)
      );
    END LOOP;
  END LOOP;

  -- 1b. Insumos directos del PT: sumar al mismo mapa
  FOR v_ins IN SELECT insumo_id, cantidad_por_unidad FROM public.bom_recetas
               WHERE codigo_pt = v_op.codigo_pt
  LOOP
    v_key := v_ins.insumo_id::text;
    v_req_map := jsonb_set(
      v_req_map, ARRAY[v_key],
      to_jsonb(COALESCE((v_req_map->>v_key)::numeric, 0)
               + v_ins.cantidad_por_unidad * p_cantidad)
    );
  END LOOP;

  -- 1c. Validar el acumulado contra el stock real
  FOR v_key IN SELECT jsonb_object_keys(v_req_map) LOOP
    v_cant_req := (v_req_map->>v_key)::numeric;
    SELECT existencia_actual INTO v_stock FROM public.insumos WHERE id = v_key::uuid;
    IF v_stock < v_cant_req THEN
      v_faltantes := v_faltantes || jsonb_build_object(
        'tipo','insumo','insumo_id',v_key,'requerido',v_cant_req,'existencia',v_stock
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_faltantes) > 0 THEN
    RAISE EXCEPTION 'Stock insuficiente para esta entrega: %', v_faltantes::text;
  END IF;

  -- ============ FASE 2: CONSUMIR SUBPRODUCTOS (recursivo) ============
  FOR v_sub IN SELECT subproducto_id, cantidad FROM public.paquete_subproductos
               WHERE codigo_pt = v_op.codigo_pt
  LOOP
    PERFORM public.consumir_subproducto_recursivo(
      v_sub.subproducto_id, v_sub.cantidad * p_cantidad, p_orden_id
    );
    v_items_afectados := v_items_afectados + 1;
  END LOOP;

  -- ============ FASE 3: CONSUMIR INSUMOS DIRECTOS ============
  FOR v_ins IN SELECT insumo_id, cantidad_por_unidad FROM public.bom_recetas
               WHERE codigo_pt = v_op.codigo_pt
  LOOP
    PERFORM public.consumir_insumo_fifo(
      v_ins.insumo_id, v_ins.cantidad_por_unidad * p_cantidad,
      'Consumo OP ' || COALESCE(v_op.numero_op,''),
      p_orden_id, 'Consumo'
    );
    v_items_afectados := v_items_afectados + 1;
  END LOOP;

  -- ============ FASE 4: ENTREGA + PT + OP ============
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
-- 6. Reserva de códigos de caja con lote
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.siguiente_codigo_caja(
  p_codigo_pt text, p_lote text
) RETURNS int LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_max int := 0; v_rec record; v_match text[];
BEGIN
  FOR v_rec IN
    SELECT codigo_caja FROM public.cajas_ubicacion
    WHERE codigo_pt = p_codigo_pt
      AND codigo_caja LIKE '%' || '-LOTE-' || p_lote
  LOOP
    v_match := regexp_match(v_rec.codigo_caja, '-C(\d+)-LOTE-');
    IF v_match IS NOT NULL THEN
      v_max := GREATEST(v_max, v_match[1]::int);
    END IF;
  END LOOP;
  RETURN v_max + 1;
END; $$;

CREATE OR REPLACE FUNCTION public.reservar_cajas_lote(
  p_codigo_pt text, p_lote text, p_cantidad int
) RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inicio int;
  v_codigos text[] := ARRAY[]::text[];
  v_i int;
  v_cod text;
  v_email text;
BEGIN
  PERFORM public.validar_escritura();
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad debe ser > 0';
  END IF;
  IF p_lote IS NULL OR length(trim(p_lote)) = 0 THEN
    RAISE EXCEPTION 'El lote es obligatorio para generar códigos de caja';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_codigo_pt || ':' || p_lote));
  v_inicio := public.siguiente_codigo_caja(p_codigo_pt, p_lote);

  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid();

  FOR v_i IN 0..(p_cantidad - 1) LOOP
    v_cod := p_codigo_pt || '-C' || lpad((v_inicio + v_i)::text, 3, '0')
             || '-LOTE-' || p_lote;
    v_codigos := array_append(v_codigos, v_cod);
    INSERT INTO public.cajas_ubicacion
      (codigo_caja, codigo_pt, ubicacion, estado, usuario_email, actualizado_en)
    VALUES
      (v_cod, p_codigo_pt, 'Pendiente de ubicar', 'Impresa', v_email, now())
    ON CONFLICT (codigo_caja) DO NOTHING;
  END LOOP;

  RETURN v_codigos;
END; $$;

GRANT EXECUTE ON FUNCTION public.reservar_cajas_lote(text, text, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.consumir_subproducto_recursivo(uuid, numeric, uuid, uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.planificar_consumo_subproducto(uuid, numeric, uuid[]) FROM authenticated;

COMMIT;