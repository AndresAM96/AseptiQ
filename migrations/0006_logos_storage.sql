-- =============================================================
-- 0006_logos_storage.sql
-- Mueve los logos de etiquetas de sys_config (base64) a
-- Supabase Storage (bucket 'logos', público para lectura).
--
-- Cierra #M5 del audit v2.5.1: con 3 logos de 100 KB en base64 +
-- config acumulada, el payload podía acercarse al límite de 1 MB
-- de PostgREST. saveConfig advierte desde ~900 KB.
--
-- Aplicar DESPUÉS de 0005.
-- La migración de logos base64 → Storage se hace una vez desde el
-- front (modal "Datos de etiquetas" → botón "Migrar").
-- =============================================================

-- 1. Bucket 'logos' (público para lectura)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2097152,  -- 2 MB por archivo
  ARRAY['image/png','image/jpeg','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Policies en storage.objects
DROP POLICY IF EXISTS "logos_select_public" ON storage.objects;
CREATE POLICY "logos_select_public" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'logos');

DROP POLICY IF EXISTS "logos_insert_admin" ON storage.objects;
CREATE POLICY "logos_insert_admin" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "logos_update_admin" ON storage.objects;
CREATE POLICY "logos_update_admin" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'logos' AND public.current_user_role() = 'admin')
  WITH CHECK (bucket_id = 'logos' AND public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "logos_delete_admin" ON storage.objects;
CREATE POLICY "logos_delete_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'logos' AND public.current_user_role() = 'admin');

-- 3. Detector: qué logos en config siguen siendo base64
CREATE OR REPLACE FUNCTION public.logos_base64_pendientes()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_logos jsonb;
  v_result jsonb := '{}'::jsonb;
  v_key text;
  v_val text;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Solo admin puede consultar los logos pendientes';
  END IF;
  SELECT config->'etiquetas'->'logos' INTO v_logos
    FROM public.sys_config WHERE id = 1;
  IF v_logos IS NULL OR jsonb_typeof(v_logos) <> 'object' THEN
    RETURN v_result;
  END IF;
  FOR v_key, v_val IN SELECT * FROM jsonb_each_text(v_logos) LOOP
    IF v_val LIKE 'data:image/%' THEN
      v_result := v_result || jsonb_build_object(v_key, octet_length(v_val));
    END IF;
  END LOOP;
  RETURN v_result;
END; $$;
REVOKE EXECUTE ON FUNCTION public.logos_base64_pendientes() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.logos_base64_pendientes() TO authenticated;

-- 4. Verificación
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'logos') THEN
    RAISE EXCEPTION 'Bucket logos no se creó';
  END IF;
  RAISE NOTICE 'OK: bucket logos + policies + detector listos.';
END $$;