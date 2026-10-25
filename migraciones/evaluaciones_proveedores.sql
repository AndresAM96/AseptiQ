-- =============================================================
-- migracion_v37.sql — Evaluaciones formales de proveedores
-- =============================================================

CREATE TABLE IF NOT EXISTS public.evaluaciones_proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid REFERENCES public.sys_proveedores(id) ON DELETE CASCADE,
  proveedor_nombre text,
  proveedor_nit text,
  fecha date DEFAULT CURRENT_DATE,
  evaluador_email text,
  
  nota_entrega numeric(3,1) DEFAULT 5.0,
  nota_calidad numeric(3,1) DEFAULT 5.0,
  nota_postventa numeric(3,1) DEFAULT 5.0,
  nota_fumigacion numeric(3,1) DEFAULT 5.0,
  nota_precio numeric(3,1) DEFAULT 5.0,
  
  promedio numeric(3,2),
  resultado text, -- 'Excelente', 'Bueno', 'Regular', 'No Confiable'
  observaciones text,
  
  creado_en timestamptz DEFAULT now()
);

ALTER TABLE public.evaluaciones_proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY evaluaciones_all ON public.evaluaciones_proveedores FOR ALL TO authenticated USING (true);