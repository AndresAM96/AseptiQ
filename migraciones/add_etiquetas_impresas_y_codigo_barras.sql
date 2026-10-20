-- 1. Agregar columna de código de barras a los PT
ALTER TABLE public.productos_terminados ADD COLUMN IF NOT EXISTS codigo_barras text;

-- 2. Tabla para llevar el contador/trazabilidad de impresiones
CREATE TABLE IF NOT EXISTS public.etiquetas_impresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_pt text REFERENCES public.productos_terminados(codigo_pt) ON DELETE CASCADE,
  lote text,
  cantidad_paquetes int,
  cantidad_cajas int,
  usuario_email text,
  fecha timestamptz DEFAULT now()
);
ALTER TABLE public.etiquetas_impresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY etiquetas_impresas_all ON public.etiquetas_impresas FOR ALL TO authenticated USING (true);