-- 1. Agregar la columna de saldo actual a los lotes
ALTER TABLE public.insumo_lotes 
ADD COLUMN IF NOT EXISTS cantidad_actual numeric NOT NULL DEFAULT 0;

-- 2. Inicializar los lotes existentes (asumimos que el saldo actual es igual a lo recibido históricamente para arrancar)
UPDATE public.insumo_lotes SET cantidad_actual = cantidad_recibida WHERE cantidad_actual = 0;

-- 3. Actualizar el Trigger de Entradas para que maneje "SIN LOTE" y actualice el saldo
CREATE OR REPLACE FUNCTION public.mov_inv_sync_lotes()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_lote text;
BEGIN
  IF NEW.tipo = 'Entrada' AND NEW.insumo_id IS NOT NULL THEN
    -- Si viene vacío o nulo, asignamos el lote virtual
    v_lote := COALESCE(NULLIF(trim(NEW.lote_insumo), ''), 'SIN LOTE');
    
    -- Actualizamos el movimiento original para que quede con el nombre del lote asignado
    IF NEW.lote_insumo IS NULL OR trim(NEW.lote_insumo) = '' THEN
      UPDATE public.movimientos_inventario SET lote_insumo = v_lote WHERE id = NEW.id;
    END IF;

    INSERT INTO public.insumo_lotes (
      insumo_id, lote, cantidad_recibida, cantidad_actual, costo_unitario, proveedor_id, primer_ingreso, ultimo_ingreso
    ) VALUES (
      NEW.insumo_id, v_lote, COALESCE(NEW.cantidad, 0), COALESCE(NEW.cantidad, 0), NEW.costo_unitario_momento, NEW.proveedor_id, NEW.fecha, NEW.fecha
    )
    ON CONFLICT (insumo_id, lote) DO UPDATE
      SET cantidad_recibida = public.insumo_lotes.cantidad_recibida + EXCLUDED.cantidad_recibida,
          cantidad_actual = public.insumo_lotes.cantidad_actual + EXCLUDED.cantidad_actual,
          ultimo_ingreso = EXCLUDED.ultimo_ingreso,
          costo_unitario = COALESCE(EXCLUDED.costo_unitario, public.insumo_lotes.costo_unitario),
          proveedor_id = COALESCE(EXCLUDED.proveedor_id, public.insumo_lotes.proveedor_id);
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Crear la función maestra del FIFO
CREATE OR REPLACE FUNCTION public.consumir_insumo_fifo(
  p_insumo_id uuid,
  p_cantidad numeric,
  p_motivo text,
  p_orden_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_restante numeric := p_cantidad;
  v_tomar numeric;
  v_lote record;
  v_detalle jsonb := '[]'::jsonb;
BEGIN
  -- Buscar lotes con saldo, ordenados del más viejo al más nuevo (FIFO)
  FOR v_lote IN 
    SELECT id, lote, cantidad_actual 
    FROM public.insumo_lotes 
    WHERE insumo_id = p_insumo_id AND cantidad_actual > 0 
    ORDER BY primer_ingreso ASC 
  LOOP
    IF v_restante <= 0 THEN EXIT; END IF;
    
    -- Tomamos lo que necesitamos o lo que haya en este lote
    v_tomar := LEAST(v_restante, v_lote.cantidad_actual);
    
    -- Descontar del lote
    UPDATE public.insumo_lotes 
    SET cantidad_actual = cantidad_actual - v_tomar 
    WHERE id = v_lote.id;
    
    -- Registrar el movimiento indicando exactamente de qué lote salió
    INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, motivo, orden_id, lote_insumo)
    VALUES (p_insumo_id, 'Consumo', v_tomar, p_motivo, p_orden_id, v_lote.lote);
    
    v_restante := v_restante - v_tomar;
    v_detalle := v_detalle || jsonb_build_object('lote', v_lote.lote, 'cantidad', v_tomar);
  END LOOP;
  
  -- Si aún queda algo (por inconsistencias de inventario previas), lo consumimos como SIN LOTE
  IF v_restante > 0 THEN
    INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, motivo, orden_id, lote_insumo)
    VALUES (p_insumo_id, 'Consumo', v_restante, p_motivo, p_orden_id, 'SIN LOTE');
    
    v_detalle := v_detalle || jsonb_build_object('lote', 'SIN LOTE', 'cantidad', v_restante);
  END IF;
  
  -- Actualizar el stock general del insumo
  UPDATE public.insumos 
  SET existencia_actual = existencia_actual - p_cantidad 
  WHERE id = p_insumo_id;
  
  RETURN jsonb_build_object('consumo_detalle', v_detalle);
END;
$$;