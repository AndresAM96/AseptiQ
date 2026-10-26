-- 1. Borrar la función de devoluciones vieja
DROP FUNCTION IF EXISTS public.registrar_devolucion(uuid, numeric, uuid, text);

-- 2. Crear la nueva función con soporte para elegir Lote
CREATE OR REPLACE FUNCTION public.registrar_devolucion(
  p_insumo_id uuid,
  p_cantidad numeric,
  p_proveedor_id uuid,
  p_motivo text DEFAULT NULL,
  p_lote text DEFAULT NULL -- Nuevo parámetro
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_insumo record;
  v_restante numeric := p_cantidad;
  v_tomar numeric;
  v_lote_rec record;
  v_existencia_nueva numeric;
BEGIN
  SELECT * INTO v_insumo FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  IF v_insumo.existencia_actual < p_cantidad THEN RAISE EXCEPTION 'No hay suficiente stock para devolver'; END IF;

  -- Descontar de los lotes
  IF p_lote IS NOT NULL THEN
    -- Si eligen un lote específico
    UPDATE public.insumo_lotes SET cantidad_actual = cantidad_actual - p_cantidad WHERE insumo_id = p_insumo_id AND lote = p_lote;
  ELSE
    -- Si no, LIFO (descontar de los más nuevos primero, suele ser lo que se devuelve)
    FOR v_lote_rec IN SELECT id, lote, cantidad_actual FROM public.insumo_lotes WHERE insumo_id = p_insumo_id AND cantidad_actual > 0 ORDER BY primer_ingreso DESC LOOP
      IF v_restante <= 0 THEN EXIT; END IF;
      v_tomar := LEAST(v_restante, v_lote_rec.cantidad_actual);
      UPDATE public.insumo_lotes SET cantidad_actual = cantidad_actual - v_tomar WHERE id = v_lote_rec.id;
      v_restante := v_restante - v_tomar;
    END LOOP;
  END IF;

  -- Actualizar stock general
  UPDATE public.insumos SET existencia_actual = existencia_actual - p_cantidad WHERE id = p_insumo_id RETURNING existencia_actual INTO v_existencia_nueva;

  -- Registrar salida
  INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, proveedor_id, motivo, lote_insumo)
  VALUES (p_insumo_id, 'Salida', p_cantidad, p_proveedor_id, COALESCE(p_motivo, 'Devolución a proveedor'), p_lote);

  RETURN jsonb_build_object('existencia_nueva', v_existencia_nueva);
END;
$$;

-- 3. Actualizar Ajustes de Inventario (Conteo físico)
CREATE OR REPLACE FUNCTION public.ajustar_inventario(
  p_insumo_id uuid,
  p_nueva_existencia numeric,
  p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_insumo record;
  v_dif numeric;
BEGIN
  SELECT * INTO v_insumo FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  
  v_dif := p_nueva_existencia - v_insumo.existencia_actual;

  IF v_dif = 0 THEN
    RETURN jsonb_build_object('existencia_nueva', p_nueva_existencia);
  END IF;

  IF v_dif > 0 THEN
    -- Si sobra mercancía en el conteo, se suma a un lote llamado 'AJUSTE'
    INSERT INTO public.insumo_lotes (insumo_id, lote, cantidad_recibida, cantidad_actual, costo_unitario, primer_ingreso, ultimo_ingreso)
    VALUES (p_insumo_id, 'AJUSTE', v_dif, v_dif, v_insumo.costo_unitario, now(), now())
    ON CONFLICT (insumo_id, lote) DO UPDATE SET cantidad_actual = public.insumo_lotes.cantidad_actual + EXCLUDED.cantidad_actual;
    
    INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, motivo, lote_insumo)
    VALUES (p_insumo_id, 'Entrada', v_dif, COALESCE(p_motivo, 'Ajuste positivo'), 'AJUSTE');
  ELSE
    -- Si falta mercancía, se descuenta por FIFO
    PERFORM public.consumir_insumo_fifo(p_insumo_id, ABS(v_dif), COALESCE(p_motivo, 'Ajuste negativo'), NULL);
  END IF;

  UPDATE public.insumos SET existencia_actual = p_nueva_existencia WHERE id = p_insumo_id;
  
  RETURN jsonb_build_object('existencia_nueva', p_nueva_existencia);
END;
$$;