-- =============================================================
-- 1. BLINDAJE DE SEGURIDAD
-- =============================================================

-- Asegurar que el rol consulta no pueda escribir saltándose la UI
CREATE OR REPLACE FUNCTION public.validar_escritura() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF public.current_user_role() NOT IN ('admin', 'operador') THEN
    RAISE EXCEPTION 'Permiso denegado: se requiere rol de operador o administrador.';
  END IF;
END; $$;

-- Revocar permisos de anon en TODAS las funciones públicas
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT proname, pg_get_function_identity_arguments(oid) AS args FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon;', f.proname, f.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated;', f.proname, f.args);
  END LOOP;
END $$;

-- Actualizar RLS de profiles para que los inactivos no puedan leer nada
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (activo = true OR user_id = auth.uid() OR public.current_user_role() = 'admin');

-- =============================================================
-- 2. INTEGRIDAD DE LOTES Y COSTOS
-- =============================================================

-- 2.1 Consumir FIFO (Ahora guarda el COSTO del lote en el movimiento)
CREATE OR REPLACE FUNCTION public.consumir_insumo_fifo(
  p_insumo_id uuid, p_cantidad numeric, p_motivo text, p_orden_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
  v_restante numeric := p_cantidad; 
  v_tomar numeric; 
  v_lote record; 
  v_detalle jsonb := '[]'::jsonb;
  v_costo numeric;
BEGIN
  -- Obtener costo de referencia del insumo
  SELECT costo_unitario INTO v_costo FROM public.insumos WHERE id = p_insumo_id;

  FOR v_lote IN SELECT id, lote, cantidad_actual, costo_unitario FROM public.insumo_lotes WHERE insumo_id = p_insumo_id AND cantidad_actual > 0 ORDER BY primer_ingreso ASC LOOP
    IF v_restante <= 0 THEN EXIT; END IF;
    v_tomar := LEAST(v_restante, v_lote.cantidad_actual);
    
    UPDATE public.insumo_lotes SET cantidad_actual = cantidad_actual - v_tomar WHERE id = v_lote.id;
    
    -- Insertar movimiento con el costo del lote (si el lote tiene costo, si no, usa el del insumo)
    INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, motivo, orden_id, lote_insumo, costo_unitario_momento)
    VALUES (p_insumo_id, 'Consumo', v_tomar, p_motivo, p_orden_id, v_lote.lote, COALESCE(v_lote.costo_unitario, v_costo));
    
    v_restante := v_restante - v_tomar;
    v_detalle := v_detalle || jsonb_build_object('lote', v_lote.lote, 'cantidad', v_tomar);
  END LOOP;
  
  IF v_restante > 0 THEN
    INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, motivo, orden_id, lote_insumo, costo_unitario_momento) 
    VALUES (p_insumo_id, 'Consumo', v_restante, p_motivo, p_orden_id, 'SIN LOTE', v_costo);
    v_detalle := v_detalle || jsonb_build_object('lote', 'SIN LOTE', 'cantidad', v_restante);
  END IF;
  
  UPDATE public.insumos SET existencia_actual = existencia_actual - p_cantidad WHERE id = p_insumo_id;
  RETURN jsonb_build_object('consumo_detalle', v_detalle);
END; $$;

-- 2.2 Registrar Entrada (Unificada y con Lote correcto)
DROP FUNCTION IF EXISTS public.registrar_entrada(uuid, numeric, uuid, numeric, text, numeric);
CREATE OR REPLACE FUNCTION public.registrar_entrada(
  p_insumo_id uuid, p_cantidad numeric, p_proveedor_id uuid DEFAULT NULL,
  p_costo_unitario numeric DEFAULT NULL, p_motivo text DEFAULT NULL,
  p_rendimiento_real numeric DEFAULT NULL, p_lote_insumo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ins public.insumos%ROWTYPE; v_mov public.movimientos_inventario%ROWTYPE;
  v_cadena jsonb; v_factor_calc numeric := 1; v_factor_usar numeric;
  v_cantidad_consumo numeric; v_costo_por_consumo numeric; v_nuevo_costo numeric; v_eslabones jsonb;
  v_lote_final text;
BEGIN
  PERFORM public.validar_escritura();
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad > 0'; END IF;
  
  SELECT * INTO v_ins FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;

  v_cadena := COALESCE(v_ins.conversiones, '[]'::jsonb);
  IF jsonb_array_length(v_cadena) > 1 THEN
    SELECT COALESCE(EXP(SUM(LN(GREATEST((elem->>'factor')::numeric, 0.0000001)))), 1) INTO v_factor_calc
    FROM jsonb_array_elements(v_cadena) WITH ORDINALITY AS t(elem, ord) WHERE ord < jsonb_array_length(v_cadena);
  END IF;

  IF p_rendimiento_real IS NOT NULL AND p_rendimiento_real > 0 THEN
    v_factor_usar := p_rendimiento_real;
  ELSE 
    v_factor_usar := v_factor_calc; 
  END IF;

  v_cantidad_consumo := p_cantidad * v_factor_usar;
  v_lote_final := COALESCE(NULLIF(trim(p_lote_insumo), ''), 'SIN LOTE');

  IF p_costo_unitario IS NOT NULL AND p_costo_unitario > 0 THEN
    v_costo_por_consumo := p_costo_unitario / v_factor_usar;
    IF (v_ins.existencia_actual + v_cantidad_consumo) > 0 THEN
      v_nuevo_costo := ((v_ins.existencia_actual * v_ins.costo_unitario) + (v_cantidad_consumo * v_costo_por_consumo)) / (v_ins.existencia_actual + v_cantidad_consumo);
    ELSE v_nuevo_costo := v_costo_por_consumo; END IF;
  ELSE 
    v_costo_por_consumo := v_ins.costo_unitario; 
    v_nuevo_costo := v_ins.costo_unitario; 
  END IF;

  UPDATE public.insumos SET existencia_actual = existencia_actual + v_cantidad_consumo, costo_unitario = v_nuevo_costo WHERE id = p_insumo_id;
  
  -- Insertamos el movimiento con el LOTE DESDE EL INICIO
  INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, proveedor_id, motivo, rendimiento_real, unidad_compra, cantidad_compra, costo_unitario_momento, lote_insumo)
  VALUES (p_insumo_id, 'Entrada', v_cantidad_consumo, p_proveedor_id, p_motivo, p_rendimiento_real, (v_cadena->0->>'unidad'), p_cantidad, v_costo_por_consumo, v_lote_final)
  RETURNING * INTO v_mov;

  RETURN jsonb_build_object('movimiento_id', v_mov.id, 'existencia_nueva', v_ins.existencia_actual + v_cantidad_consumo, 'costo_unitario', v_nuevo_costo);
END; $$;

-- 2.3 Registrar Salida (Mermas) - Volvemos a usar 'Salida' en vez de 'Consumo'
CREATE OR REPLACE FUNCTION public.registrar_salida(p_insumo_id uuid, p_cantidad numeric, p_motivo text DEFAULT NULL) 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_insumo record; v_existencia_nueva numeric;
BEGIN
  PERFORM public.validar_escritura();
  SELECT * INTO v_insumo FROM public.insumos WHERE id = p_insumo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  IF v_insumo.existencia_actual < p_cantidad THEN RAISE EXCEPTION 'Stock insuficiente'; END IF;

  -- Consumimos por FIFO pero insertamos el movimiento como 'Salida' (para reportes)
  PERFORM public.consumir_insumo_fifo(p_insumo_id, p_cantidad, 'Salida manual: ' || COALESCE(p_motivo,'Sin motivo'), NULL);
  UPDATE public.movimientos_inventario SET tipo = 'Salida' WHERE orden_id IS NULL AND id = (SELECT id FROM public.movimientos_inventario WHERE insumo_id = p_insumo_id ORDER BY fecha DESC LIMIT 1);
  
  SELECT existencia_actual INTO v_existencia_nueva FROM public.insumos WHERE id = p_insumo_id;
  RETURN jsonb_build_object('existencia_nueva', v_existencia_nueva);
END; $$;

-- 2.4 Ajustar Inventario (Conteo Físico)
CREATE OR REPLACE FUNCTION public.ajustar_inventario(p_insumo_id uuid, p_nueva_existencia numeric, p_motivo text DEFAULT NULL) 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_insumo record; v_dif numeric;
BEGIN
  PERFORM public.validar_escritura();
  SELECT * INTO v_insumo FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  
  v_dif := p_nueva_existencia - v_insumo.existencia_actual;
  IF v_dif = 0 THEN RETURN jsonb_build_object('existencia_nueva', p_nueva_existencia); END IF;

  IF v_dif > 0 THEN
    -- Ajuste positivo
    INSERT INTO public.insumo_lotes (insumo_id, lote, cantidad_recibida, cantidad_actual, costo_unitario, primer_ingreso, ultimo_ingreso)
    VALUES (p_insumo_id, 'AJUSTE', v_dif, v_dif, v_insumo.costo_unitario, now(), now())
    ON CONFLICT (insumo_id, lote) DO UPDATE SET cantidad_actual = public.insumo_lotes.cantidad_actual + EXCLUDED.cantidad_actual, cantidad_recibida = public.insumo_lotes.cantidad_recibida + EXCLUDED.cantidad_recibida;
    
    INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, motivo, lote_insumo, costo_unitario_momento) 
    VALUES (p_insumo_id, 'Entrada', v_dif, COALESCE(p_motivo, 'Ajuste positivo'), 'AJUSTE', v_insumo.costo_unitario);
    
    UPDATE public.insumos SET existencia_actual = p_nueva_existencia WHERE id = p_insumo_id;
  ELSE
    -- Ajuste negativo (llamamos a FIFO, luego corregimos el tipo)
    PERFORM public.consumir_insumo_fifo(p_insumo_id, ABS(v_dif), COALESCE(p_motivo, 'Ajuste negativo'), NULL);
    UPDATE public.movimientos_inventario SET tipo = 'Salida' WHERE id = (SELECT id FROM public.movimientos_inventario WHERE insumo_id = p_insumo_id ORDER BY fecha DESC LIMIT 1);
  END IF;

  RETURN jsonb_build_object('existencia_nueva', p_nueva_existencia);
END; $$;