-- =============================================================
-- migracion_v29.sql — Trazabilidad de lotes end-to-end
-- =============================================================
-- Agrega soporte para lote del proveedor en las entradas de insumos.
-- Requerido para trazabilidad INVIMA de recibo de mercancía.
-- =============================================================

-- 1. Columna lote_insumo (opcional)
ALTER TABLE public.movimientos_inventario
  ADD COLUMN IF NOT EXISTS lote_insumo text;

COMMENT ON COLUMN public.movimientos_inventario.lote_insumo IS
  'Lote del proveedor (opcional). Para trazabilidad INVIMA de recibo de mercancía.';

-- 2. Índices para trazabilidad
CREATE INDEX IF NOT EXISTS mov_inv_lote_insumo_idx
  ON public.movimientos_inventario (lote_insumo)
  WHERE lote_insumo IS NOT NULL;

CREATE INDEX IF NOT EXISTS mov_inv_orden_tipo_idx
  ON public.movimientos_inventario (orden_id, tipo)
  WHERE orden_id IS NOT NULL;

-- 3. Wrapper de registrar_entrada con p_lote_insumo
-- Llama a la versión original (6 args) y actualiza el último movimiento
-- de entrada con el lote enviado.
CREATE OR REPLACE FUNCTION public.registrar_entrada(
  p_insumo_id uuid,
  p_cantidad numeric,
  p_proveedor_id uuid,
  p_costo_unitario numeric,
  p_motivo text,
  p_rendimiento_real numeric,
  p_lote_insumo text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_mov_id uuid;
BEGIN
  -- Llamar a la versión original (6 args) — Postgres resuelve por aridad
  v_result := public.registrar_entrada(
    p_insumo_id, p_cantidad, p_proveedor_id, p_costo_unitario, p_motivo, p_rendimiento_real
  );

  -- Actualizar el último movimiento de entrada con el lote
  IF p_lote_insumo IS NOT NULL AND length(trim(p_lote_insumo)) > 0 THEN
    SELECT id INTO v_mov_id
      FROM public.movimientos_inventario
      WHERE insumo_id = p_insumo_id AND tipo = 'Entrada'
      ORDER BY fecha DESC
      LIMIT 1;

    IF v_mov_id IS NOT NULL THEN
      UPDATE public.movimientos_inventario
        SET lote_insumo = trim(p_lote_insumo)
        WHERE id = v_mov_id;
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_entrada(uuid, numeric, uuid, numeric, text, numeric, text) TO authenticated;