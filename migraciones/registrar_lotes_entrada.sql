-- =============================================================
-- migracion_v33.sql — RPC para registrar múltiples lotes
-- =============================================================
-- Complementa la v32. Permite insertar N lotes de una sola vez
-- cuando se recibe un insumo con varios lotes (ej: 100 rollos
-- de Tela SMS cada uno con su propio lote).
-- =============================================================

CREATE OR REPLACE FUNCTION public.registrar_lotes_entrada(
  p_insumo_id uuid,
  p_lotes jsonb,
  p_proveedor_id uuid DEFAULT NULL,
  p_costo_unitario numeric DEFAULT NULL,
  p_fecha timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_item jsonb;
  v_lote text;
  v_cantidad numeric;
BEGIN
  IF p_lotes IS NULL OR jsonb_array_length(p_lotes) = 0 THEN
    RAISE EXCEPTION 'Debe enviar al menos un lote';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_lotes)
  LOOP
    v_lote := trim(coalesce(v_item->>'lote',''));
    v_cantidad := coalesce((v_item->>'cantidad')::numeric, 0);

    IF length(v_lote) = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.insumo_lotes (
      insumo_id, lote, cantidad_recibida, costo_unitario, proveedor_id, primer_ingreso, ultimo_ingreso
    ) VALUES (
      p_insumo_id, v_lote, v_cantidad, p_costo_unitario, p_proveedor_id, p_fecha, p_fecha
    )
    ON CONFLICT (insumo_id, lote) DO UPDATE
      SET cantidad_recibida = public.insumo_lotes.cantidad_recibida + EXCLUDED.cantidad_recibida,
          ultimo_ingreso = EXCLUDED.ultimo_ingreso,
          costo_unitario = COALESCE(EXCLUDED.costo_unitario, public.insumo_lotes.costo_unitario),
          proveedor_id = COALESCE(EXCLUDED.proveedor_id, public.insumo_lotes.proveedor_id);

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('lotes_insertados', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_lotes_entrada(uuid, jsonb, uuid, numeric, timestamptz) TO authenticated;