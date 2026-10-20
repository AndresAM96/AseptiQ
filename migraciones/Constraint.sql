-- 1. Quitar la restricción vieja
ALTER TABLE public.productos_terminados 
  DROP CONSTRAINT IF EXISTS productos_terminados_plantilla_etiqueta_check;

-- 2. Actualizar los valores existentes que hayan quedado con nombres viejos
UPDATE public.productos_terminados 
SET plantilla_etiqueta = 'noesteril_proclides_grande' 
WHERE plantilla_etiqueta = 'noesteril_grande_proclides';

UPDATE public.productos_terminados 
SET plantilla_etiqueta = 'noesteril_proclides_mediana' 
WHERE plantilla_etiqueta = 'noesteril_pequena_proclides';

UPDATE public.productos_terminados 
SET plantilla_etiqueta = 'esteril_allmed' 
WHERE plantilla_etiqueta = 'esteril_allers';

UPDATE public.productos_terminados 
SET plantilla_etiqueta = 'noesteril_allmed' 
WHERE plantilla_etiqueta = 'noesteril_allers';

-- 3. Crear la restricción nueva con los nombres correctos
ALTER TABLE public.productos_terminados 
  ADD CONSTRAINT productos_terminados_plantilla_etiqueta_check 
  CHECK (plantilla_etiqueta IN (
    'esteril_proclides',
    'esteril_allmed',
    'noesteril_allmed',
    'noesteril_proclides_grande',
    'noesteril_proclides_mediana'
  ));