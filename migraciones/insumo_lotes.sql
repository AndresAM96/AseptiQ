-- =============================================================
-- migracion_v32.sql — Registro de lotes por insumo
-- =============================================================
-- Almacena los lotes recibidos por insumo. Sirve para INVIMA
-- y para el módulo de Trazabilidad. No implementa FIFO.
-- =============================================================

-- 1. Tabla principal
CREATE TABLE IF NOT EXISTS public.insumo_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id uuid NOT NULL REFERENCES public.insumos(id) ON DELETE CASCADE,
  lote text NOT NULL,
  cantidad_recibida numeric NOT NULL DEFAULT 0,
  costo_unitario numeric,
  proveedor_id uuid REFERENCES public.sys_proveedores(id) ON DELETE SET NULL,
  primer_ingreso timestamptz NOT NULL DEFAULT now(),
  ultimo_ingreso timestamptz NOT NULL DEFAULT now(),
  notas text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (insumo_id, lote)
);

COMMENT ON TABLE public.insumo_lotes IS
  'Lotes recibidos por insumo. Auto-poblado desde movimientos de entrada. Acumula cantidad por lote.';

COMMENT ON COLUMN public.insumo_lotes.cantidad_recibida IS
  'Suma acumulada de todas las entradas registradas con este lote.';

-- 2. Índices
CREATE INDEX IF NOT EXISTS insumo_lotes_insumo_idx ON public.insumo_lotes (insumo_id, ultimo_ingreso DESC);
CREATE INDEX IF NOT EXISTS insumo_lotes_lote_idx ON public.insumo_lotes (lote);

-- 3. RLS
ALTER TABLE public.insumo_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insumo_lotes_select ON public.insumo_lotes;
DROP POLICY IF EXISTS insumo_lotes_write ON public.insumo_lotes;

CREATE POLICY insumo_lotes_select ON public.insumo_lotes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY insumo_lotes_write ON public.insumo_lotes
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin','operador'))
  WITH CHECK (public.current_user_role() IN ('admin','operador'));

-- 4. Trigger: alimenta insumo_lotes al insertar entradas con lote
CREATE OR REPLACE FUNCTION public.mov_inv_sync_lotes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tipo = 'Entrada'
     AND NEW.insumo_id IS NOT NULL
     AND NEW.lote_insumo IS NOT NULL
     AND length(trim(NEW.lote_insumo)) > 0 THEN
    INSERT INTO public.insumo_lotes (
      insumo_id, lote, cantidad_recibida, costo_unitario, proveedor_id, primer_ingreso, ultimo_ingreso
    ) VALUES (
      NEW.insumo_id,
      trim(NEW.lote_insumo),
      COALESCE(NEW.cantidad, 0),
      NEW.costo_unitario_momento,
      NEW.proveedor_id,
      NEW.fecha,
      NEW.fecha
    )
    ON CONFLICT (insumo_id, lote) DO UPDATE
      SET cantidad_recibida = public.insumo_lotes.cantidad_recibida + EXCLUDED.cantidad_recibida,
          ultimo_ingreso = EXCLUDED.ultimo_ingreso,
          costo_unitario = COALESCE(EXCLUDED.costo_unitario, public.insumo_lotes.costo_unitario),
          proveedor_id = COALESCE(EXCLUDED.proveedor_id, public.insumo_lotes.proveedor_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mov_inv_sync_lotes_trg ON public.movimientos_inventario;
CREATE TRIGGER mov_inv_sync_lotes_trg
  AFTER INSERT ON public.movimientos_inventario
  FOR EACH ROW
  EXECUTE FUNCTION public.mov_inv_sync_lotes();

-- 5. Backfill: reconstruir lotes desde movimientos existentes
INSERT INTO public.insumo_lotes (insumo_id, lote, cantidad_recibida, costo_unitario, proveedor_id, primer_ingreso, ultimo_ingreso)
SELECT
  m.insumo_id,
  trim(m.lote_insumo),
  SUM(m.cantidad),
  MAX(m.costo_unitario_momento),
  (array_agg(m.proveedor_id ORDER BY m.fecha DESC))[1],
  MIN(m.fecha),
  MAX(m.fecha)
FROM public.movimientos_inventario m
WHERE m.tipo = 'Entrada'
  AND m.insumo_id IS NOT NULL
  AND m.lote_insumo IS NOT NULL
  AND length(trim(m.lote_insumo)) > 0
GROUP BY m.insumo_id, trim(m.lote_insumo)
ON CONFLICT (insumo_id, lote) DO NOTHING;