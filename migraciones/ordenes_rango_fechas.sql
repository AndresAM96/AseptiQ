-- Agregar la columna para la fecha de finalización de la OP
ALTER TABLE public.ordenes_semanales 
ADD COLUMN IF NOT EXISTS fecha_fin_programada date;

-- Opcional: Comentario para documentar
COMMENT ON COLUMN public.ordenes_semanales.fecha_fin_programada IS 
'Fecha en la que se estima terminar la OP. Si es nula, se asume el mismo día de fecha_programada.';