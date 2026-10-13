-- =============================================================
-- migracion_v31.sql — Configuración global del sistema
-- =============================================================
-- Almacena la configuración (prefijos, unidades, umbrales) en
-- una tabla singleton para que se comparta entre dispositivos.
-- =============================================================

-- 1. Tabla singleton (una sola fila siempre)
CREATE TABLE IF NOT EXISTS public.sys_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid,
  actualizado_por_email text
);

COMMENT ON TABLE public.sys_config IS
  'Configuración global del sistema. Fila única (id=1) con un JSON flexible.';

-- 2. Insertar fila inicial si no existe
INSERT INTO public.sys_config (id, config)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS
ALTER TABLE public.sys_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sys_config_select ON public.sys_config;
DROP POLICY IF EXISTS sys_config_write ON public.sys_config;

CREATE POLICY sys_config_select ON public.sys_config
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY sys_config_write ON public.sys_config
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('admin','operador'))
  WITH CHECK (public.current_user_role() IN ('admin','operador'));

-- 4. Trigger para actualizar metadata en cada UPDATE
CREATE OR REPLACE FUNCTION public.sys_config_actualizar_meta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.actualizado_en := now();
  NEW.actualizado_por := auth.uid();
  SELECT email INTO NEW.actualizado_por_email
    FROM public.profiles WHERE user_id = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sys_config_meta ON public.sys_config;
CREATE TRIGGER sys_config_meta
  BEFORE UPDATE ON public.sys_config
  FOR EACH ROW
  EXECUTE FUNCTION public.sys_config_actualizar_meta();