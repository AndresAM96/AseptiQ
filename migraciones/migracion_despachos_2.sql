CREATE OR REPLACE FUNCTION public.registrar_despacho(
  p_codigo_pt text,
  p_cantidad numeric,
  p_cliente text,
  p_lote_op text DEFAULT NULL,
  p_consecutivo text DEFAULT NULL,
  p_oc text DEFAULT NULL,
  p_fecha date DEFAULT CURRENT_DATE,
  p_fecha_vencimiento text DEFAULT NULL,
  p_observaciones text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pt record;
  v_existencia_nueva numeric;
  v_email text;
BEGIN
  SELECT * INTO v_pt FROM public.productos_terminados WHERE codigo_pt = p_codigo_pt FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto terminado no encontrado'; END IF;
  
  IF v_pt.existencia_actual < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente. Disponible: %', v_pt.existencia_actual;
  END IF;

  UPDATE public.productos_terminados 
  SET existencia_actual = existencia_actual - p_cantidad 
  WHERE codigo_pt = p_codigo_pt 
  RETURNING existencia_actual INTO v_existencia_nueva;

  -- Manejo seguro del email (por si el perfil está vacío)
  BEGIN
    SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_email := 'desconocido';
  END;

  INSERT INTO public.despachos (
    codigo_pt, cantidad, cliente, lote_op, consecutivo, oc, fecha, fecha_vencimiento, observaciones, usuario_email
  ) VALUES (
    p_codigo_pt, p_cantidad, p_cliente, p_lote_op, p_consecutivo, p_oc, p_fecha, p_fecha_vencimiento, p_observaciones, v_email
  );

  RETURN jsonb_build_object('ok', true, 'existencia_nueva', v_existencia_nueva);
END;
$$;