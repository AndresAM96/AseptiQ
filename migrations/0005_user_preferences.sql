-- =============================================================
-- 0005_user_preferences.sql
-- Preferencias por usuario (notif vistos/silenciados).
--
-- Cierra #M6 del audit v2.5.1: vistos/silenciados vivían en
-- sys_config compartida → read-modify-write con pérdida de cambios
-- entre usuarios, y el rol Consulta no podía limpiar su badge.
--
-- Aplicar DESPUÉS de 0004.
-- =============================================================

-- 1. Tabla
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notif_vistos jsonb NOT NULL DEFAULT '{}'::jsonb,
  notif_silenciados jsonb NOT NULL DEFAULT '{}'::jsonb,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- 2. Trigger de updated_at
CREATE OR REPLACE FUNCTION public.user_preferences_actualizar_meta()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS user_preferences_meta ON public.user_preferences;
CREATE TRIGGER user_preferences_meta
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.user_preferences_actualizar_meta();

-- 3. RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS up_select_self ON public.user_preferences;
DROP POLICY IF EXISTS up_write_self ON public.user_preferences;
DROP POLICY IF EXISTS up_select_admin ON public.user_preferences;

-- Cada usuario accede solo a su fila
CREATE POLICY up_select_self ON public.user_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY up_write_self ON public.user_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admin puede leer todas (para auditoría, no para escribir en nombre de otro)
CREATE POLICY up_select_admin ON public.user_preferences FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

-- 4. Función one-shot de migración de datos huérfanos.
-- Los vistos/silenciados históricos están en sys_config.config->'notif',
-- pero como sys_config es global, no sabemos de qué usuario son.
-- El admin actual puede "adoptarlos" ejecutando esta función manualmente.
CREATE OR REPLACE FUNCTION public.migrar_notif_prefs_desde_config()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_cfg jsonb;
  v_vistos jsonb;
  v_silenciados jsonb;
  v_count_v int := 0;
  v_count_s int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Debe estar autenticado';
  END IF;

  SELECT config INTO v_cfg FROM public.sys_config WHERE id = 1;
  IF NOT FOUND OR v_cfg->'notif' IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'msg', 'No hay datos que migrar en sys_config');
  END IF;

  v_vistos := COALESCE(v_cfg->'notif'->'vistos', '{}'::jsonb);
  v_silenciados := COALESCE(v_cfg->'notif'->'silenciados', '{}'::jsonb);

  -- Solo migramos si las llaves existen
  IF jsonb_typeof(v_vistos) != 'object' THEN v_vistos := '{}'::jsonb; END IF;
  IF jsonb_typeof(v_silenciados) != 'object' THEN v_silenciados := '{}'::jsonb; END IF;

  SELECT COUNT(*) INTO v_count_v FROM jsonb_object_keys(v_vistos);
  SELECT COUNT(*) INTO v_count_s FROM jsonb_object_keys(v_silenciados);

  IF v_count_v = 0 AND v_count_s = 0 THEN
    RETURN jsonb_build_object('ok', true, 'msg', 'No hay vistos ni silenciados que migrar');
  END IF;

  INSERT INTO public.user_preferences (user_id, notif_vistos, notif_silenciados)
  VALUES (v_user_id, v_vistos, v_silenciados)
  ON CONFLICT (user_id) DO UPDATE
    SET notif_vistos = EXCLUDED.notif_vistos,
        notif_silenciados = EXCLUDED.notif_silenciados;

  -- Limpiar sys_config para evitar doble fuente de verdad
  UPDATE public.sys_config
    SET config = config #- '{notif}'::text[]
    WHERE id = 1;

  RETURN jsonb_build_object(
    'ok', true,
    'vistos_migrados', v_count_v,
    'silenciados_migrados', v_count_s,
    'usuario', (SELECT email FROM public.profiles WHERE user_id = v_user_id)
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.migrar_notif_prefs_desde_config() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.migrar_notif_prefs_desde_config() TO authenticated;

-- Verificación post-instalación
SELECT 'user_preferences creada' AS check,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'user_preferences'
       ) THEN 'OK' ELSE 'FALTA' END AS estado;