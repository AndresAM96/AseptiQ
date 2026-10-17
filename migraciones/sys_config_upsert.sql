-- =============================================================
-- migracion_v34.sql — Habilitar UPSERT en sys_config
-- =============================================================
-- Refuerza las policies para que el frontend pueda guardar
-- configuración incluso si la fila inicial no existe.
-- =============================================================

-- Asegurar que la fila existe
INSERT INTO public.sys_config (id, config)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Recrear policies de escritura (INSERT + UPDATE)
DROP POLICY IF EXISTS sys_config_write ON public.sys_config;
DROP POLICY IF EXISTS sys_config_insert ON public.sys_config;

CREATE POLICY sys_config_insert ON public.sys_config
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin','operador'));

CREATE POLICY sys_config_write ON public.sys_config
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('admin','operador'))
  WITH CHECK (public.current_user_role() IN ('admin','operador'));