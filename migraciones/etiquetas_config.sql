-- =============================================================
-- migracion_v30.sql — Configuración de etiquetas por PT
-- =============================================================

-- 1. Plantilla de etiqueta por defecto
ALTER TABLE public.productos_terminados
  ADD COLUMN IF NOT EXISTS plantilla_etiqueta text
    DEFAULT 'esteril_proclides';

COMMENT ON COLUMN public.productos_terminados.plantilla_etiqueta IS
  'Nombre de plantilla de etiqueta: esteril_proclides | esteril_allers | noesteril_allers | noesteril_grande_proclides | noesteril_pequena_proclides';

-- 2. Vida útil en meses (default 36 = 3 años)
ALTER TABLE public.productos_terminados
  ADD COLUMN IF NOT EXISTS vida_util_meses integer
    DEFAULT 36;

COMMENT ON COLUMN public.productos_terminados.vida_util_meses IS
  'Vida útil en meses. Default 36 (3 años). Usado para calcular la fecha de vencimiento en las etiquetas.';

-- 3. Registro INVIMA específico (null = "No requiere registro INVIMA")
ALTER TABLE public.productos_terminados
  ADD COLUMN IF NOT EXISTS registro_invima text;

COMMENT ON COLUMN public.productos_terminados.registro_invima IS
  'Número de registro sanitario INVIMA (opcional). Si es null, la etiqueta mostrará "No requiere registro INVIMA".';

-- 4. Constraint de validación de plantilla
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'productos_terminados_plantilla_etiqueta_check'
  ) THEN
    ALTER TABLE public.productos_terminados
      ADD CONSTRAINT productos_terminados_plantilla_etiqueta_check
      CHECK (plantilla_etiqueta IN (
        'esteril_proclides',
        'esteril_allers',
        'noesteril_allers',
        'noesteril_grande_proclides',
        'noesteril_pequena_proclides'
      ));
  END IF;
END $$;