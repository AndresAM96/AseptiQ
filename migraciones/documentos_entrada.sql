-- =============================================================
-- migracion_v39.sql — Documentos y OC en entradas de mercancía
-- =============================================================

ALTER TABLE public.movimientos_inventario
  ADD COLUMN IF NOT EXISTS numero_factura text,
  ADD COLUMN IF NOT EXISTS numero_oc text,
  ADD COLUMN IF NOT EXISTS numero_entrada_almacen text,
  ADD COLUMN IF NOT EXISTS cantidad_pendiente_oc numeric;

COMMENT ON COLUMN public.movimientos_inventario.numero_oc IS 'Número de la Orden de Compra asociada a esta entrada';
COMMENT ON COLUMN public.movimientos_inventario.cantidad_pendiente_oc IS 'Cantidad de unidades que quedan pendientes por entregar en esta OC';