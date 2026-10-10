-- =============================================================
-- migracion_v28.sql — Devoluciones de producto terminado
-- =============================================================

CREATE TABLE IF NOT EXISTS public.devoluciones_pt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_pt text NOT NULL REFERENCES public.productos_terminados(codigo_pt),
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  estado_producto text NOT NULL DEFAULT 'bueno'
    CHECK (estado_producto IN ('bueno','dañado','cuarentena')),
  motivo text,
  usuario_id uuid,
  usuario_email text,
  fecha timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS devoluciones_pt_fecha_idx ON public.devoluciones_pt (fecha DESC);
CREATE INDEX IF NOT EXISTS devoluciones_pt_pt_idx ON public.devoluciones_pt (codigo_pt, fecha DESC);

ALTER TABLE public.devoluciones_pt ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS devoluciones_pt_select ON public.devoluciones_pt;
DROP POLICY IF EXISTS devoluciones_pt_write ON public.devoluciones_pt;
CREATE POLICY devoluciones_pt_select ON public.devoluciones_pt FOR SELECT TO authenticated USING (true);
CREATE POLICY devoluciones_pt_write ON public.devoluciones_pt FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin','operador'))
  WITH CHECK (public.current_user_role() IN ('admin','operador'));

CREATE OR REPLACE FUNCTION public.registrar_devolucion_pt(
  p_codigo_pt text,
  p_cantidad numeric,
  p_estado_producto text DEFAULT 'bueno',
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_pt public.productos_terminados%ROWTYPE;
  v_id uuid;
  v_email text;
  v_existencia_despues numeric;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a cero';
  END IF;
  IF p_estado_producto NOT IN ('bueno','dañado','cuarentena') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;

  SELECT * INTO v_pt FROM public.productos_terminados WHERE codigo_pt = p_codigo_pt FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto terminado no encontrado'; END IF;

  -- Solo los productos en buen estado vuelven al stock vendible
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
    VALUES (p_codigo_pt, p_cantidad, p_estado_producto, p_motivo, auth.uid(), v_email)
    RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'existencia_nueva', v_existencia_despues,
    'afecta_stock', p_estado_producto = 'bueno'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_devolucion_pt(text, numeric, text, text) TO anon, authenticated;