-- 1. Crear tabla de despachos
CREATE TABLE IF NOT EXISTS public.despachos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_pt text REFERENCES public.productos_terminados(codigo_pt) ON DELETE CASCADE,
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  lote_op text,
  consecutivo text,
  oc text,
  cliente text NOT NULL,
  fecha date DEFAULT CURRENT_DATE,
  fecha_vencimiento text, -- Formato MM/YY (ej: 08/29)
  observaciones text,
  usuario_email text,
  creado_en timestamptz DEFAULT now()
);

-- 2. Habilitar RLS
ALTER TABLE public.despachos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS despachos_all ON public.despachos;
CREATE POLICY despachos_all ON public.despachos FOR ALL TO authenticated USING (true);

-- 3. Función RPC para registrar despacho y descontar stock
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
  -- Bloquear PT para evitar condiciones de carrera
  SELECT * INTO v_pt FROM public.productos_terminados WHERE codigo_pt = p_codigo_pt FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto terminado no encontrado'; END IF;
  
  IF v_pt.existencia_actual < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente. Disponible: %', v_pt.existencia_actual;
  END IF;

  -- Descontar inventario
  UPDATE public.productos_terminados 
  SET existencia_actual = existencia_actual - p_cantidad 
  WHERE codigo_pt = p_codigo_pt 
  RETURNING existencia_actual INTO v_existencia_nueva;

  -- Obtener email del usuario
  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid();

  -- Registrar el despacho
  INSERT INTO public.despachos (
    codigo_pt, cantidad, cliente, lote_op, consecutivo, oc, fecha, fecha_vencimiento, observaciones, usuario_email
  ) VALUES (
    p_codigo_pt, p_cantidad, p_cliente, p_lote_op, p_consecutivo, p_oc, p_fecha, p_fecha_vencimiento, p_observaciones, v_email
  );

  RETURN jsonb_build_object('ok', true, 'existencia_nueva', v_existencia_nueva);
END;
$$;