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
BEGIN
  SELECT * INTO v_op FROM public.ordenes_semanales WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OP no encontrada'; END IF;
  
  v_detalle := v_op.detalle_faltantes;
  v_producido_antes := COALESCE(v_op.cantidad_producida, 0);
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
      
      FOR v_receta IN SELECT * FROM public.subproducto_recetas WHERE subproducto_id = v_sub.subproducto_id LOOP
        PERFORM public.consumir_insumo_fifo(
          v_receta.insumo_id, 
          (v_receta.cantidad_por_unidad * v_faltante), 
          'Auto-producción para OP ' || COALESCE(v_op.numero_op,''), 
          p_orden_id
        );
      END LOOP;
    END IF;
  END LOOP;

  -- 2. Procesar INSUMOS DIRECTOS (FIFO)
  FOR v_ins IN SELECT * FROM jsonb_to_recordset(v_detalle->'insumos') AS x(insumo_id uuid, consumo_total numeric) LOOP
    v_faltante := v_ins.consumo_total * v_cant_proporcional;
    
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

  -- 4. ¡AQUÍ ESTÁ LA CORRECCIÓN! SUMAR EL PRODUCTO TERMINADO AL STOCK
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
END;
$$;