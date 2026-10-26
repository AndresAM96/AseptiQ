-- =============================================================
-- migracion_v40.sql — Control de calidad en entradas
-- =============================================================

ALTER TABLE public.movimientos_inventario
  ADD COLUMN IF NOT EXISTS estado_calidad text DEFAULT 'Aprobado',
  ADD COLUMN IF NOT EXISTS observaciones_calidad text;

COMMENT ON COLUMN public.movimientos_inventario.estado_calidad IS 'Decisión final de calidad: Aprobado, Rechazado, Cuarentena';