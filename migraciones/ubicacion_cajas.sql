-- =============================================================
-- migracion_v36.sql — Zonificación de cajas en bodega
-- =============================================================

CREATE TABLE IF NOT EXISTS public.cajas_ubicacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_caja text UNIQUE NOT NULL,
  codigo_pt text REFERENCES public.productos_terminados(codigo_pt) ON DELETE CASCADE,
  ubicacion text NOT NULL,
  estado text DEFAULT 'En bodega',
  usuario_email text,
  actualizado_en timestamptz DEFAULT now(),
  creado_en timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cajas_ubicacion_codigo_idx ON public.cajas_ubicacion (codigo_caja);

ALTER TABLE public.cajas_ubicacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cajas_all ON public.cajas_ubicacion;
CREATE POLICY cajas_all ON public.cajas_ubicacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);