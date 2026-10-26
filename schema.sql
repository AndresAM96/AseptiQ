-- =============================================================
-- AseptiQ — Schema completo de backend
-- Versión: 2.4.0
-- Fecha: 2026-10-25
-- =============================================================
-- Este archivo crea TODA la infraestructura del backend:
--   · 14 tablas con constraints e índices
--   · Funciones helper (códigos, roles, costos)
--   · RPCs de negocio (todas las operaciones)
--   · Trigger de creación automática de perfiles
--   · RLS activo + políticas por rol
--
-- USO:
--   1. Crear un proyecto nuevo en Supabase.
--   2. Ir a SQL Editor → New query → pegar este archivo → Run.
--   3. Esperar ~10 segundos.
--   4. Ir a Authentication → Users → Add user (marcar "Auto Confirm User").
--   5. Promover el primer usuario a admin (ver bloque final).
--
-- ES IDEMPOTENTE: se puede correr varias veces sin daño.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================
-- 1. TABLAS
-- =============================================================

CREATE TABLE IF NOT EXISTS public.insumos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  unidad_medida text NOT NULL,
  existencia_actual numeric NOT NULL DEFAULT 0,
  punto_reorden numeric NOT NULL DEFAULT 0 CHECK (punto_reorden > 0::numeric),
  estado_activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  unidad_consumo text,
  factor_conversion numeric,
  unidad_secundaria text,
  factor_secundario numeric,
  costo_unitario numeric NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0::numeric),
  conversiones jsonb NOT NULL DEFAULT '[]'::jsonb,
  tipo_conversion text NOT NULL DEFAULT 'fijo'
    CHECK (tipo_conversion = ANY (ARRAY['fijo','dimensional','variable'])),
  CONSTRAINT insumos_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.productos_terminados (
  codigo_pt text NOT NULL,
  nombre text NOT NULL,
  estado_activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  unidades_por_caja integer NOT NULL DEFAULT 1,
  existencia_actual numeric NOT NULL DEFAULT 0 CHECK (existencia_actual >= 0::numeric),
  precio_venta numeric CHECK (precio_venta IS NULL OR precio_venta >= 0::numeric),
  CONSTRAINT productos_terminados_pkey PRIMARY KEY (codigo_pt)
);

CREATE TABLE IF NOT EXISTS public.subproductos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  estado_activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  existencia_actual numeric NOT NULL DEFAULT 0,
  punto_reorden numeric DEFAULT 0 CHECK (punto_reorden IS NULL OR punto_reorden >= 0::numeric),
  tipo text NOT NULL DEFAULT 'ambos'
    CHECK (tipo = ANY (ARRAY['intermedio','final','ambos'])),
  CONSTRAINT subproductos_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.sys_proveedores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nit text NOT NULL UNIQUE,
  razon_social text NOT NULL,
  contacto text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  direccion text,
  contactos jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT sys_proveedores_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.bom_recetas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  codigo_pt text NOT NULL REFERENCES public.productos_terminados(codigo_pt),
  insumo_id uuid NOT NULL REFERENCES public.insumos(id),
  cantidad_por_unidad numeric NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bom_recetas_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.subproducto_recetas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subproducto_id uuid NOT NULL REFERENCES public.subproductos(id),
  insumo_id uuid NOT NULL REFERENCES public.insumos(id),
  cantidad_por_unidad numeric NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  unidad_receta text,
  factor_receta numeric NOT NULL DEFAULT 1,
  CONSTRAINT subproducto_recetas_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.subproducto_subproductos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subproducto_padre_id uuid NOT NULL REFERENCES public.subproductos(id),
  subproducto_hijo_id uuid NOT NULL REFERENCES public.subproductos(id),
  cantidad_por_unidad numeric NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subproducto_subproductos_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.paquete_subproductos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  codigo_pt text NOT NULL REFERENCES public.productos_terminados(codigo_pt),
  subproducto_id uuid NOT NULL REFERENCES public.subproductos(id),
  cantidad numeric NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paquete_subproductos_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ordenes_semanales (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  codigo_pt text NOT NULL REFERENCES public.productos_terminados(codigo_pt),
  cantidad_proyectada numeric NOT NULL,
  estado_cobertura text NOT NULL DEFAULT 'Cubierta',
  detalle_faltantes jsonb,
  fecha_creacion timestamptz NOT NULL DEFAULT now(),
  numero_op text,
  estado_op text NOT NULL DEFAULT 'Pendiente'
    CHECK (estado_op = ANY (ARRAY['Pendiente','En proceso','Terminada','Cancelada'])),
  cantidad_cajas numeric,
  fecha_completado timestamptz,
  fecha_cancelado timestamptz,
  motivo_cancelacion text,
  lote text,
  prioridad integer,
  fecha_programada date,
  cantidad_producida numeric NOT NULL DEFAULT 0,
  fecha_ultima_entrega timestamptz,
  CONSTRAINT ordenes_semanales_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.movimientos_inventario (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  insumo_id uuid REFERENCES public.insumos(id),
  tipo text NOT NULL DEFAULT 'Entrada',
  cantidad numeric NOT NULL,
  proveedor_id uuid REFERENCES public.sys_proveedores(id),
  fecha timestamptz NOT NULL DEFAULT now(),
  motivo text,
  rendimiento_real numeric,
  unidad_compra text,
  cantidad_compra numeric,
  subproducto_id uuid REFERENCES public.subproductos(id),
  orden_id uuid REFERENCES public.ordenes_semanales(id),
  costo_unitario_momento numeric,
  CONSTRAINT movimientos_inventario_pkey PRIMARY KEY (id),
  CONSTRAINT mov_inv_insumo_o_subproducto_check
    CHECK (insumo_id IS NOT NULL OR subproducto_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.entregas_op (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_semanales(id) ON DELETE CASCADE,
  cantidad numeric NOT NULL CHECK (cantidad > 0::numeric),
  lote_entrega text,
  motivo text,
  usuario_id uuid,
  usuario_email text,
  fecha timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entregas_op_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ajustes_costo_insumo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  insumo_id uuid NOT NULL REFERENCES public.insumos(id) ON DELETE CASCADE,
  costo_anterior numeric NOT NULL,
  costo_nuevo numeric NOT NULL,
  motivo text,
  usuario_id uuid,
  usuario_email text,
  fecha timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ajustes_costo_insumo_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  nombre text,
  role text NOT NULL DEFAULT 'consulta'
    CHECK (role = ANY (ARRAY['admin','operador','consulta'])),
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS public.backup_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid,
  usuario_email text,
  tablas_incluidas jsonb NOT NULL DEFAULT '[]'::jsonb,
  rango_movimientos text,
  total_registros integer NOT NULL DEFAULT 0,
  tamano_bytes bigint,
  fecha timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT backup_log_pkey PRIMARY KEY (id)
);

-- =============================================================
-- 2. ÍNDICES
-- =============================================================

CREATE UNIQUE INDEX IF NOT EXISTS ordenes_semanales_numero_op_unique
  ON public.ordenes_semanales (numero_op) WHERE numero_op IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ordenes_semanales_lote_unique
  ON public.ordenes_semanales (lote) WHERE lote IS NOT NULL;

CREATE INDEX IF NOT EXISTS ordenes_semanales_prioridad_idx
  ON public.ordenes_semanales (prioridad NULLS LAST, fecha_programada NULLS LAST, fecha_creacion DESC);

CREATE INDEX IF NOT EXISTS movimientos_inventario_orden_idx
  ON public.movimientos_inventario (orden_id) WHERE orden_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS entregas_op_orden_idx
  ON public.entregas_op (orden_id, fecha DESC);

CREATE INDEX IF NOT EXISTS ajustes_costo_insumo_fecha_idx
  ON public.ajustes_costo_insumo (fecha DESC);

CREATE INDEX IF NOT EXISTS backup_log_fecha_idx
  ON public.backup_log (fecha DESC);

-- =============================================================
-- 3. FUNCIONES HELPER
-- =============================================================

-- Rol del usuario actual (con fallback a 'consulta')
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE user_id = auth.uid() AND activo = true),
    'consulta'
  );
$$;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

-- Trigger: crear profile al crear usuario en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, nombre, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email),
    'consulta'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

-- Siguiente código disponible con lock (evita colisiones concurrentes)
CREATE OR REPLACE FUNCTION public.siguiente_codigo(p_prefijo text, p_tabla text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_max integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_prefijo || ':' || p_tabla));
  IF p_tabla = 'insumos' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(codigo from char_length(p_prefijo)+1), '\D', '', 'g'), '')::integer), 0)
      INTO v_max FROM public.insumos WHERE codigo LIKE p_prefijo || '%';
  ELSIF p_tabla = 'subproductos' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(codigo from char_length(p_prefijo)+1), '\D', '', 'g'), '')::integer), 0)
      INTO v_max FROM public.subproductos WHERE codigo LIKE p_prefijo || '%';
  ELSIF p_tabla = 'productos_terminados' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(codigo_pt from char_length(p_prefijo)+1), '\D', '', 'g'), '')::integer), 0)
      INTO v_max FROM public.productos_terminados WHERE codigo_pt LIKE p_prefijo || '%';
  END IF;
  RETURN lpad((v_max + 1)::text, 3, '0');
END; $$;
GRANT EXECUTE ON FUNCTION public.siguiente_codigo(text, text) TO anon, authenticated;

-- Costo recursivo de un subproducto
CREATE OR REPLACE FUNCTION public.subproducto_costo(
  p_sub_id uuid,
  p_visited uuid[] DEFAULT ARRAY[]::uuid[]
) RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE rec numeric := 0; hijos numeric := 0;
BEGIN
  IF p_sub_id = ANY(p_visited) THEN RETURN 0; END IF;
  SELECT COALESCE(SUM(
    (SELECT costo_unitario FROM public.insumos WHERE id = sr.insumo_id)
    * sr.cantidad_por_unidad * COALESCE(sr.factor_receta, 1)
  ), 0) INTO rec FROM public.subproducto_recetas sr WHERE sr.subproducto_id = p_sub_id;

  SELECT COALESCE(SUM(
    public.subproducto_costo(ss.subproducto_hijo_id, p_visited || p_sub_id) * ss.cantidad_por_unidad
  ), 0) INTO hijos FROM public.subproducto_subproductos ss WHERE ss.subproducto_padre_id = p_sub_id;

  RETURN rec + hijos;
END; $$;

-- Costo recursivo de un paquete
CREATE OR REPLACE FUNCTION public.paquete_costo(p_pt text)
RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE ins_directos numeric := 0; subs numeric := 0;
BEGIN
  SELECT COALESCE(SUM(
    (SELECT costo_unitario FROM public.insumos WHERE id = br.insumo_id) * br.cantidad_por_unidad
  ), 0) INTO ins_directos FROM public.bom_recetas br WHERE br.codigo_pt = p_pt;

  SELECT COALESCE(SUM(
    public.subproducto_costo(ps.subproducto_id) * ps.cantidad
  ), 0) INTO subs FROM public.paquete_subproductos ps WHERE ps.codigo_pt = p_pt;

  RETURN ins_directos + subs;
END; $$;

-- Mapa completo de costos (subproductos + paquetes)
CREATE OR REPLACE FUNCTION public.costos_todos()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_sub_costo jsonb; v_paq_costo jsonb;
BEGIN
  SELECT jsonb_object_agg(s.id::text, public.subproducto_costo(s.id)) INTO v_sub_costo FROM public.subproductos s;
  SELECT jsonb_object_agg(p.codigo_pt, public.paquete_costo(p.codigo_pt)) INTO v_paq_costo FROM public.productos_terminados p;
  RETURN jsonb_build_object(
    'subproducto_costo', COALESCE(v_sub_costo, '{}'::jsonb),
    'paquete_costo', COALESCE(v_paq_costo, '{}'::jsonb)
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.costos_todos() TO anon, authenticated;

-- =============================================================
-- 4. RPCs DE NEGOCIO
-- =============================================================

-- 4.1 Registrar entrada (insumo) con costo promedio ponderado
CREATE OR REPLACE FUNCTION public.registrar_entrada(
  p_insumo_id uuid, p_cantidad numeric,
  p_proveedor_id uuid DEFAULT NULL,
  p_costo_unitario numeric DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_rendimiento_real numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ins public.insumos%ROWTYPE; v_mov public.movimientos_inventario%ROWTYPE;
  v_cadena jsonb; v_factor_calc numeric := 1; v_factor_usar numeric;
  v_cantidad_consumo numeric; v_costo_por_consumo numeric; v_nuevo_costo numeric; v_eslabones jsonb;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad > 0'; END IF;
  SELECT * INTO v_ins FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;

  v_cadena := COALESCE(v_ins.conversiones, '[]'::jsonb);
  IF jsonb_array_length(v_cadena) > 1 THEN
    SELECT COALESCE(EXP(SUM(LN(GREATEST((elem->>'factor')::numeric, 0.0000001)))), 1) INTO v_factor_calc
    FROM jsonb_array_elements(v_cadena) WITH ORDINALITY AS t(elem, ord)
    WHERE ord < jsonb_array_length(v_cadena);
  END IF;

  IF p_rendimiento_real IS NOT NULL AND p_rendimiento_real > 0 THEN
    v_factor_usar := p_rendimiento_real;
    IF jsonb_array_length(v_cadena) >= 2 THEN
      v_eslabones := (
        SELECT jsonb_agg(
          CASE WHEN ord = jsonb_array_length(v_cadena) - 1
          THEN jsonb_set(elem, '{factor}', to_jsonb(ROUND(((elem->>'factor')::numeric * 0.7 + p_rendimiento_real * 0.3)::numeric, 6)))
          ELSE elem END ORDER BY ord)
        FROM jsonb_array_elements(v_cadena) WITH ORDINALITY AS t(elem, ord)
      );
      UPDATE public.insumos SET conversiones = v_eslabones WHERE id = p_insumo_id;
    END IF;
  ELSE v_factor_usar := v_factor_calc; END IF;

  v_cantidad_consumo := p_cantidad * v_factor_usar;

  IF p_costo_unitario IS NOT NULL AND p_costo_unitario > 0 THEN
    v_costo_por_consumo := p_costo_unitario / v_factor_usar;
    IF (v_ins.existencia_actual + v_cantidad_consumo) > 0 THEN
      v_nuevo_costo := ((v_ins.existencia_actual * v_ins.costo_unitario) + (v_cantidad_consumo * v_costo_por_consumo)) / (v_ins.existencia_actual + v_cantidad_consumo);
    ELSE v_nuevo_costo := v_costo_por_consumo; END IF;
  ELSE v_costo_por_consumo := v_ins.costo_unitario; v_nuevo_costo := v_ins.costo_unitario; END IF;

  UPDATE public.insumos SET existencia_actual = existencia_actual + v_cantidad_consumo, costo_unitario = v_nuevo_costo WHERE id = p_insumo_id;
  INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, proveedor_id, motivo, rendimiento_real, unidad_compra, cantidad_compra, costo_unitario_momento)
    VALUES (p_insumo_id, 'Entrada', v_cantidad_consumo, p_proveedor_id, p_motivo, p_rendimiento_real, (v_cadena->0->>'unidad'), p_cantidad, v_costo_por_consumo)
    RETURNING * INTO v_mov;

  RETURN jsonb_build_object('movimiento_id', v_mov.id, 'existencia_nueva', v_ins.existencia_actual + v_cantidad_consumo, 'costo_unitario', v_nuevo_costo, 'cantidad_consumo', v_cantidad_consumo, 'factor_usado', v_factor_usar);
END; $$;
GRANT EXECUTE ON FUNCTION public.registrar_entrada(uuid, numeric, uuid, numeric, text, numeric) TO anon, authenticated;

-- 4.2 Registrar salida manual
CREATE OR REPLACE FUNCTION public.registrar_salida(p_insumo_id uuid, p_cantidad numeric, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_ins public.insumos%ROWTYPE; v_mov public.movimientos_inventario%ROWTYPE;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad > 0'; END IF;
  SELECT * INTO v_ins FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  IF v_ins.existencia_actual < p_cantidad THEN RAISE EXCEPTION 'Existencia insuficiente: hay % y se intentan sacar %', v_ins.existencia_actual, p_cantidad; END IF;
  UPDATE public.insumos SET existencia_actual = existencia_actual - p_cantidad WHERE id = p_insumo_id;
  INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, motivo) VALUES (p_insumo_id, 'Salida', p_cantidad, p_motivo) RETURNING * INTO v_mov;
  RETURN jsonb_build_object('movimiento_id', v_mov.id, 'existencia_nueva', v_ins.existencia_actual - p_cantidad);
END; $$;
GRANT EXECUTE ON FUNCTION public.registrar_salida(uuid, numeric, text) TO anon, authenticated;

-- 4.3 Guardar subproducto (con receta + hijos)
CREATE OR REPLACE FUNCTION public.guardar_subproducto(
  p_id uuid, p_codigo text, p_nombre text,
  p_existencia numeric, p_punto_reorden numeric,
  p_receta jsonb, p_hijos jsonb DEFAULT '[]'::jsonb, p_tipo text DEFAULT 'ambos'
) RETURNS public.subproductos LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_sub public.subproductos%ROWTYPE; v_row jsonb;
BEGIN
  IF p_nombre IS NULL OR length(trim(p_nombre)) = 0 THEN RAISE EXCEPTION 'Nombre obligatorio'; END IF;
  IF p_tipo NOT IN ('intermedio','final','ambos') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.subproductos (codigo, nombre, existencia_actual, punto_reorden, tipo)
      VALUES (p_codigo, p_nombre, COALESCE(p_existencia, 0), COALESCE(p_punto_reorden, 0), p_tipo) RETURNING * INTO v_sub;
  ELSE
    IF EXISTS (
      WITH RECURSIVE descendientes AS (
        SELECT subproducto_hijo_id AS id FROM public.subproducto_subproductos WHERE subproducto_padre_id = p_id
        UNION ALL
        SELECT ss.subproducto_hijo_id FROM public.subproducto_subproductos ss JOIN descendientes d ON ss.subproducto_padre_id = d.id
      ) SELECT 1 FROM descendientes WHERE id = p_id
    ) THEN RAISE EXCEPTION 'Ciclo detectado'; END IF;

    UPDATE public.subproductos SET nombre = p_nombre, existencia_actual = COALESCE(p_existencia, existencia_actual),
      punto_reorden = COALESCE(p_punto_reorden, 0), tipo = p_tipo WHERE id = p_id RETURNING * INTO v_sub;
    IF NOT FOUND THEN RAISE EXCEPTION 'Subproducto no encontrado'; END IF;
    DELETE FROM public.subproducto_recetas WHERE subproducto_id = p_id;
    DELETE FROM public.subproducto_subproductos WHERE subproducto_padre_id = p_id;
  END IF;

  IF p_receta IS NOT NULL THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_receta) LOOP
      INSERT INTO public.subproducto_recetas (subproducto_id, insumo_id, cantidad_por_unidad, unidad_receta, factor_receta)
      VALUES (v_sub.id, (v_row->>'insumo_id')::uuid, (v_row->>'cantidad')::numeric, NULLIF(v_row->>'unidad_receta',''), COALESCE((v_row->>'factor_receta')::numeric, 1));
    END LOOP;
  END IF;

  IF p_hijos IS NOT NULL THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_hijos) LOOP
      IF (v_row->>'subproducto_id')::uuid = v_sub.id THEN RAISE EXCEPTION 'Auto-referencia'; END IF;
      INSERT INTO public.subproducto_subproductos (subproducto_padre_id, subproducto_hijo_id, cantidad_por_unidad)
      VALUES (v_sub.id, (v_row->>'subproducto_id')::uuid, (v_row->>'cantidad')::numeric);
    END LOOP;
  END IF;

  RETURN v_sub;
END; $$;
GRANT EXECUTE ON FUNCTION public.guardar_subproducto(uuid, text, text, numeric, numeric, jsonb, jsonb, text) TO anon, authenticated;

-- 4.4 Guardar paquete (PT)
CREATE OR REPLACE FUNCTION public.guardar_paquete(
  p_codigo_pt text, p_es_nuevo boolean, p_nombre text,
  p_subproductos jsonb, p_insumos jsonb,
  p_unidades_por_caja integer DEFAULT 1, p_precio_venta numeric DEFAULT NULL
) RETURNS public.productos_terminados LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_prod public.productos_terminados%ROWTYPE; v_row jsonb;
BEGIN
  IF p_nombre IS NULL OR length(trim(p_nombre)) = 0 THEN RAISE EXCEPTION 'Nombre obligatorio'; END IF;
  IF p_unidades_por_caja IS NULL OR p_unidades_por_caja < 1 THEN RAISE EXCEPTION 'Unidades por caja >= 1'; END IF;

  IF p_es_nuevo THEN
    INSERT INTO public.productos_terminados (codigo_pt, nombre, unidades_por_caja, precio_venta)
      VALUES (p_codigo_pt, p_nombre, p_unidades_por_caja, p_precio_venta) RETURNING * INTO v_prod;
  ELSE
    UPDATE public.productos_terminados SET nombre = p_nombre, unidades_por_caja = p_unidades_por_caja, precio_venta = p_precio_venta
      WHERE codigo_pt = p_codigo_pt RETURNING * INTO v_prod;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
    DELETE FROM public.paquete_subproductos WHERE codigo_pt = p_codigo_pt;
    DELETE FROM public.bom_recetas WHERE codigo_pt = p_codigo_pt;
  END IF;

  IF p_subproductos IS NOT NULL THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_subproductos) LOOP
      INSERT INTO public.paquete_subproductos (codigo_pt, subproducto_id, cantidad)
      VALUES (v_prod.codigo_pt, (v_row->>'subproducto_id')::uuid, (v_row->>'cantidad')::numeric);
    END LOOP;
  END IF;

  IF p_insumos IS NOT NULL THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_insumos) LOOP
      INSERT INTO public.bom_recetas (codigo_pt, insumo_id, cantidad_por_unidad)
      VALUES (v_prod.codigo_pt, (v_row->>'insumo_id')::uuid, (v_row->>'cantidad')::numeric);
    END LOOP;
  END IF;

  RETURN v_prod;
END; $$;
GRANT EXECUTE ON FUNCTION public.guardar_paquete(text, boolean, text, jsonb, jsonb, integer, numeric) TO anon, authenticated;

-- 4.5 Eliminar insumo con validación
CREATE OR REPLACE FUNCTION public.eliminar_insumo(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_bom int; v_subre int; v_mov int;
BEGIN
  SELECT COUNT(*) INTO v_bom FROM public.bom_recetas WHERE insumo_id = p_id;
  SELECT COUNT(*) INTO v_subre FROM public.subproducto_recetas WHERE insumo_id = p_id;
  SELECT COUNT(*) INTO v_mov FROM public.movimientos_inventario WHERE insumo_id = p_id;
  IF v_bom > 0 OR v_subre > 0 THEN RAISE EXCEPTION 'En uso en recetas (BOM: %, subproductos: %)', v_bom, v_subre; END IF;
  IF v_mov > 0 THEN RAISE EXCEPTION 'Tiene % movimientos. Desactívalo en lugar de borrarlo.', v_mov; END IF;
  DELETE FROM public.insumos WHERE id = p_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.eliminar_insumo(uuid) TO anon, authenticated;

-- 4.6 Confirmar orden
CREATE OR REPLACE FUNCTION public.confirmar_orden(
  p_codigo_pt text, p_cantidad numeric, p_estado_cobertura text, p_detalle jsonb,
  p_numero_op text DEFAULT NULL, p_cantidad_cajas numeric DEFAULT NULL,
  p_lote text DEFAULT NULL, p_prioridad integer DEFAULT NULL, p_fecha_programada date DEFAULT NULL
) RETURNS public.ordenes_semanales LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_orden public.ordenes_semanales%ROWTYPE;
BEGIN
  INSERT INTO public.ordenes_semanales (codigo_pt, cantidad_proyectada, estado_cobertura, detalle_faltantes, numero_op, cantidad_cajas, lote, prioridad, fecha_programada)
    VALUES (p_codigo_pt, p_cantidad, p_estado_cobertura, p_detalle, p_numero_op, p_cantidad_cajas, p_lote, p_prioridad, p_fecha_programada)
    RETURNING * INTO v_orden;
  RETURN v_orden;
END; $$;
GRANT EXECUTE ON FUNCTION public.confirmar_orden(text, numeric, text, jsonb, text, numeric, text, integer, date) TO anon, authenticated;

-- 4.7 Cancelar orden
CREATE OR REPLACE FUNCTION public.cancelar_orden(p_orden_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_orden public.ordenes_semanales%ROWTYPE;
BEGIN
  SELECT * INTO v_orden FROM public.ordenes_semanales WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;
  IF v_orden.estado_op = 'Terminada' THEN RAISE EXCEPTION 'No se puede cancelar una OP terminada'; END IF;
  IF v_orden.estado_op = 'Cancelada' THEN RAISE EXCEPTION 'La OP ya está cancelada'; END IF;
  UPDATE public.ordenes_semanales SET estado_op = 'Cancelada', fecha_cancelado = now(), motivo_cancelacion = p_motivo WHERE id = p_orden_id;
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.cancelar_orden(uuid, text) TO anon, authenticated;

-- 4.8 Ajustar inventario de insumo
CREATE OR REPLACE FUNCTION public.ajustar_inventario(p_insumo_id uuid, p_nueva_existencia numeric, p_motivo text DEFAULT 'Ajuste por inventario físico')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_ins public.insumos%ROWTYPE; v_diff numeric; v_tipo text;
BEGIN
  SELECT * INTO v_ins FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  v_diff := p_nueva_existencia - v_ins.existencia_actual;
  IF v_diff = 0 THEN RETURN jsonb_build_object('cambio', 0); END IF;
  v_tipo := CASE WHEN v_diff > 0 THEN 'Entrada' ELSE 'Salida' END;
  UPDATE public.insumos SET existencia_actual = p_nueva_existencia WHERE id = p_insumo_id;
  INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, motivo) VALUES (p_insumo_id, v_tipo, ABS(v_diff), p_motivo);
  RETURN jsonb_build_object('cambio', v_diff, 'tipo', v_tipo);
END; $$;
GRANT EXECUTE ON FUNCTION public.ajustar_inventario(uuid, numeric, text) TO anon, authenticated;

-- 4.9 Ajustar inventario de subproducto
CREATE OR REPLACE FUNCTION public.ajustar_subproducto(p_id uuid, p_nueva_existencia numeric, p_motivo text DEFAULT 'Ajuste por inventario físico')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_sub public.subproductos%ROWTYPE; v_diff numeric; v_tipo text;
BEGIN
  SELECT * INTO v_sub FROM public.subproductos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subproducto no encontrado'; END IF;
  v_diff := p_nueva_existencia - v_sub.existencia_actual;
  IF v_diff = 0 THEN RETURN jsonb_build_object('cambio', 0); END IF;
  v_tipo := CASE WHEN v_diff > 0 THEN 'Entrada' ELSE 'Salida' END;
  UPDATE public.subproductos SET existencia_actual = p_nueva_existencia WHERE id = p_id;
  INSERT INTO public.movimientos_inventario (subproducto_id, tipo, cantidad, motivo) VALUES (p_id, v_tipo, ABS(v_diff), p_motivo);
  RETURN jsonb_build_object('cambio', v_diff, 'tipo', v_tipo);
END; $$;
GRANT EXECUTE ON FUNCTION public.ajustar_subproducto(uuid, numeric, text) TO anon, authenticated;

-- 4.10 Producir subproducto
CREATE OR REPLACE FUNCTION public.producir_subproducto(
  p_id uuid, p_cantidad numeric, p_lote text DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub public.subproductos%ROWTYPE; v_row record;
  v_afectados int := 0; v_faltantes jsonb := '[]'::jsonb; v_motivo_comun text;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad > 0'; END IF;
  SELECT * INTO v_sub FROM public.subproductos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subproducto no encontrado'; END IF;

  v_motivo_comun := 'Producción ' || v_sub.codigo ||
    CASE WHEN p_lote IS NOT NULL THEN ' · lote ' || p_lote ELSE '' END ||
    CASE WHEN p_motivo IS NOT NULL THEN ' · ' || p_motivo ELSE '' END;

  -- Validar insumos directos
  FOR v_row IN
    SELECT sr.insumo_id, sr.cantidad_por_unidad * COALESCE(sr.factor_receta,1) * p_cantidad AS cant, i.nombre, i.existencia_actual
    FROM public.subproducto_recetas sr JOIN public.insumos i ON i.id = sr.insumo_id WHERE sr.subproducto_id = p_id
  LOOP
    IF v_row.existencia_actual < v_row.cant THEN
      v_faltantes := v_faltantes || jsonb_build_object('tipo','insumo','nombre',v_row.nombre,'requerido',v_row.cant,'existencia',v_row.existencia_actual);
    END IF;
  END LOOP;

  -- Validar hijos directos
  FOR v_row IN
    SELECT ss.subproducto_hijo_id AS sub_id, ss.cantidad_por_unidad * p_cantidad AS cant, s.nombre, s.existencia_actual
    FROM public.subproducto_subproductos ss JOIN public.subproductos s ON s.id = ss.subproducto_hijo_id WHERE ss.subproducto_padre_id = p_id
  LOOP
    IF v_row.existencia_actual < v_row.cant THEN
      v_faltantes := v_faltantes || jsonb_build_object('tipo','subproducto','nombre',v_row.nombre,'requerido',v_row.cant,'existencia',v_row.existencia_actual);
    END IF;
  END LOOP;

  IF jsonb_array_length(v_faltantes) > 0 THEN RAISE EXCEPTION 'No se puede producir %. Faltantes: %', v_sub.nombre, v_faltantes::text; END IF;

  -- Descontar insumos
  FOR v_row IN
    SELECT sr.insumo_id, sr.cantidad_por_unidad * COALESCE(sr.factor_receta,1) * p_cantidad AS cant FROM public.subproducto_recetas sr WHERE sr.subproducto_id = p_id
  LOOP
    UPDATE public.insumos SET existencia_actual = existencia_actual - v_row.cant WHERE id = v_row.insumo_id;
    INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, motivo) VALUES (v_row.insumo_id, 'Consumo', v_row.cant, v_motivo_comun);
    v_afectados := v_afectados + 1;
  END LOOP;

  -- Descontar hijos
  FOR v_row IN
    SELECT ss.subproducto_hijo_id AS sub_id, ss.cantidad_por_unidad * p_cantidad AS cant FROM public.subproducto_subproductos ss WHERE ss.subproducto_padre_id = p_id
  LOOP
    UPDATE public.subproductos SET existencia_actual = existencia_actual - v_row.cant WHERE id = v_row.sub_id;
    INSERT INTO public.movimientos_inventario (subproducto_id, tipo, cantidad, motivo) VALUES (v_row.sub_id, 'Consumo', v_row.cant, v_motivo_comun);
    v_afectados := v_afectados + 1;
  END LOOP;

  -- Sumar el subproducto
  UPDATE public.subproductos SET existencia_actual = existencia_actual + p_cantidad WHERE id = p_id;
  INSERT INTO public.movimientos_inventario (subproducto_id, tipo, cantidad, motivo) VALUES (p_id, 'Entrada', p_cantidad, v_motivo_comun);

  RETURN jsonb_build_object('ok', true, 'items_afectados', v_afectados, 'existencia_nueva', v_sub.existencia_actual + p_cantidad);
END; $$;
GRANT EXECUTE ON FUNCTION public.producir_subproducto(uuid, numeric, text, text) TO anon, authenticated;

-- 4.11 Registrar devolución a proveedor
CREATE OR REPLACE FUNCTION public.registrar_devolucion(
  p_insumo_id uuid, p_cantidad numeric, p_proveedor_id uuid, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_ins public.insumos%ROWTYPE; v_prov public.sys_proveedores%ROWTYPE; v_mov public.movimientos_inventario%ROWTYPE; v_motivo text;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad > 0'; END IF;
  SELECT * INTO v_ins FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  SELECT * INTO v_prov FROM public.sys_proveedores WHERE id = p_proveedor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor no encontrado'; END IF;
  IF v_ins.existencia_actual < p_cantidad THEN RAISE EXCEPTION 'Existencia insuficiente: hay % y se intentan devolver %', v_ins.existencia_actual, p_cantidad; END IF;

  v_motivo := 'Devolución a ' || v_prov.razon_social || CASE WHEN p_motivo IS NOT NULL AND length(trim(p_motivo))>0 THEN ' · ' || p_motivo ELSE '' END;
  UPDATE public.insumos SET existencia_actual = existencia_actual - p_cantidad WHERE id = p_insumo_id;
  INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, proveedor_id, motivo) VALUES (p_insumo_id, 'Salida', p_cantidad, p_proveedor_id, v_motivo) RETURNING * INTO v_mov;
  RETURN jsonb_build_object('movimiento_id', v_mov.id, 'existencia_nueva', v_ins.existencia_actual - p_cantidad);
END; $$;
GRANT EXECUTE ON FUNCTION public.registrar_devolucion(uuid, numeric, uuid, text) TO anon, authenticated;

-- 4.12 Ajustar costo manual con trazabilidad
CREATE OR REPLACE FUNCTION public.ajustar_costo_insumo(
  p_insumo_id uuid, p_costo_nuevo numeric, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_ins public.insumos%ROWTYPE; v_email text;
BEGIN
  IF p_costo_nuevo IS NULL OR p_costo_nuevo < 0 THEN RAISE EXCEPTION 'Costo no puede ser negativo'; END IF;
  SELECT * INTO v_ins FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.ajustes_costo_insumo (insumo_id, costo_anterior, costo_nuevo, motivo, usuario_id, usuario_email)
    VALUES (p_insumo_id, v_ins.costo_unitario, p_costo_nuevo, p_motivo, auth.uid(), v_email);
  UPDATE public.insumos SET costo_unitario = p_costo_nuevo WHERE id = p_insumo_id;
  RETURN jsonb_build_object('costo_anterior', v_ins.costo_unitario, 'costo_nuevo', p_costo_nuevo);
END; $$;
GRANT EXECUTE ON FUNCTION public.ajustar_costo_insumo(uuid, numeric, text) TO anon, authenticated;

-- 4.13 Registrar entrega parcial (o final) de una OP
CREATE OR REPLACE FUNCTION public.registrar_entrega_op(
  p_orden_id uuid, p_cantidad numeric,
  p_lote_entrega text DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_orden public.ordenes_semanales%ROWTYPE;
  v_detalle jsonb; v_insumos_arr jsonb; v_subs_arr jsonb;
  v_factor numeric; v_producida_antes numeric; v_producida_despues numeric; v_pendiente numeric;
  v_item jsonb; v_ins public.insumos%ROWTYPE; v_sub public.subproductos%ROWTYPE;
  v_consumo_total numeric; v_consumo_parcial numeric;
  v_faltantes jsonb := '[]'::jsonb; v_items_afectados int := 0;
  v_motivo text; v_email text; v_cerrar boolean := false;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad > 0'; END IF;
  SELECT * INTO v_orden FROM public.ordenes_semanales WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;
  IF v_orden.estado_op = 'Terminada' THEN RAISE EXCEPTION 'La orden ya está cerrada'; END IF;
  IF v_orden.estado_op = 'Cancelada' THEN RAISE EXCEPTION 'La orden está cancelada'; END IF;

  v_producida_antes := COALESCE(v_orden.cantidad_producida, 0);
  v_producida_despues := v_producida_antes + p_cantidad;
  IF v_producida_despues > v_orden.cantidad_proyectada THEN
    RAISE EXCEPTION 'Excede la cantidad proyectada. Pendiente: % · Intentando entregar: %', (v_orden.cantidad_proyectada - v_producida_antes), p_cantidad;
  END IF;
  IF v_producida_despues = v_orden.cantidad_proyectada THEN v_cerrar := true; END IF;

  v_detalle := COALESCE(v_orden.detalle_faltantes, '{}'::jsonb);
  IF jsonb_typeof(v_detalle) = 'object' THEN
    v_insumos_arr := COALESCE(v_detalle->'insumos', '[]'::jsonb);
    v_subs_arr := COALESCE(v_detalle->'subproductos', '[]'::jsonb);
  ELSE
    v_insumos_arr := COALESCE(v_detalle, '[]'::jsonb); v_subs_arr := '[]'::jsonb;
  END IF;

  v_factor := p_cantidad / v_orden.cantidad_proyectada;
  v_motivo := 'Entrega OP ' || COALESCE(v_orden.numero_op, v_orden.id::text) ||
    CASE WHEN v_orden.lote IS NOT NULL THEN ' · lote ' || v_orden.lote ELSE '' END ||
    CASE WHEN p_lote_entrega IS NOT NULL AND length(trim(p_lote_entrega))>0 THEN ' · lote entrega ' || p_lote_entrega ELSE '' END ||
    CASE WHEN v_cerrar THEN ' · cierre' ELSE '' END;

  -- FASE 1: Validar
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_insumos_arr) LOOP
    IF (v_item->>'insumo_id') IS NULL OR (v_item->>'consumo_total') IS NULL THEN CONTINUE; END IF;
    v_consumo_total := (v_item->>'consumo_total')::numeric;
    IF v_consumo_total <= 0 THEN CONTINUE; END IF;
    v_consumo_parcial := v_consumo_total * v_factor;
    SELECT * INTO v_ins FROM public.insumos WHERE id = (v_item->>'insumo_id')::uuid;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF v_ins.existencia_actual < v_consumo_parcial THEN
      v_faltantes := v_faltantes || jsonb_build_object('tipo','insumo','nombre',v_ins.nombre,'requerido',v_consumo_parcial,'existencia',v_ins.existencia_actual);
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_subs_arr) LOOP
    IF (v_item->>'subproducto_id') IS NULL OR (v_item->>'requerido') IS NULL THEN CONTINUE; END IF;
    v_consumo_total := (v_item->>'requerido')::numeric;
    IF v_consumo_total <= 0 THEN CONTINUE; END IF;
    v_consumo_parcial := v_consumo_total * v_factor;
    SELECT * INTO v_sub FROM public.subproductos WHERE id = (v_item->>'subproducto_id')::uuid;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF v_sub.existencia_actual < v_consumo_parcial THEN
      v_faltantes := v_faltantes || jsonb_build_object('tipo','subproducto','nombre',v_sub.nombre,'requerido',v_consumo_parcial,'existencia',v_sub.existencia_actual);
    END IF;
  END LOOP;

  IF jsonb_array_length(v_faltantes) > 0 THEN RAISE EXCEPTION 'Stock insuficiente para esta entrega. Faltantes: %', v_faltantes::text; END IF;

  -- FASE 2: Mutar
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_insumos_arr) LOOP
    IF (v_item->>'insumo_id') IS NULL OR (v_item->>'consumo_total') IS NULL THEN CONTINUE; END IF;
    v_consumo_total := (v_item->>'consumo_total')::numeric;
    IF v_consumo_total <= 0 THEN CONTINUE; END IF;
    v_consumo_parcial := v_consumo_total * v_factor;
    UPDATE public.insumos SET existencia_actual = existencia_actual - v_consumo_parcial WHERE id = (v_item->>'insumo_id')::uuid;
    INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, motivo, orden_id, costo_unitario_momento)
      SELECT (v_item->>'insumo_id')::uuid, 'Consumo', v_consumo_parcial, v_motivo, p_orden_id, i.costo_unitario FROM public.insumos i WHERE i.id = (v_item->>'insumo_id')::uuid;
    v_items_afectados := v_items_afectados + 1;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_subs_arr) LOOP
    IF (v_item->>'subproducto_id') IS NULL OR (v_item->>'requerido') IS NULL THEN CONTINUE; END IF;
    v_consumo_total := (v_item->>'requerido')::numeric;
    IF v_consumo_total <= 0 THEN CONTINUE; END IF;
    v_consumo_parcial := v_consumo_total * v_factor;
    UPDATE public.subproductos SET existencia_actual = existencia_actual - v_consumo_parcial WHERE id = (v_item->>'subproducto_id')::uuid;
    INSERT INTO public.movimientos_inventario (subproducto_id, tipo, cantidad, motivo, orden_id) VALUES ((v_item->>'subproducto_id')::uuid, 'Consumo', v_consumo_parcial, v_motivo, p_orden_id);
    v_items_afectados := v_items_afectados + 1;
  END LOOP;

  UPDATE public.productos_terminados SET existencia_actual = COALESCE(existencia_actual, 0) + p_cantidad WHERE codigo_pt = v_orden.codigo_pt;

  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid();

  INSERT INTO public.entregas_op (orden_id, cantidad, lote_entrega, motivo, usuario_id, usuario_email)
    VALUES (p_orden_id, p_cantidad, NULLIF(trim(p_lote_entrega),''), p_motivo, auth.uid(), v_email);

  IF v_cerrar THEN
    UPDATE public.ordenes_semanales SET cantidad_producida = v_producida_despues, fecha_ultima_entrega = now(), estado_op = 'Terminada', fecha_completado = now() WHERE id = p_orden_id;
  ELSE
    UPDATE public.ordenes_semanales SET cantidad_producida = v_producida_despues, fecha_ultima_entrega = now(), estado_op = 'En proceso' WHERE id = p_orden_id;
  END IF;

  v_pendiente := v_orden.cantidad_proyectada - v_producida_despues;

  RETURN jsonb_build_object('ok', true, 'items_afectados', v_items_afectados, 'cantidad_entregada', p_cantidad, 'cantidad_producida', v_producida_despues, 'cantidad_pendiente', v_pendiente, 'op_cerrada', v_cerrar);
END; $$;
GRANT EXECUTE ON FUNCTION public.registrar_entrega_op(uuid, numeric, text, text) TO anon, authenticated;

-- =============================================================
-- 5. TRIGGER
-- =============================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: crear profiles para usuarios existentes sin fila
INSERT INTO public.profiles (user_id, email, nombre, role)
SELECT id, email, COALESCE(raw_user_meta_data->>'nombre', email), 'consulta'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- =============================================================
-- 6. RLS + POLÍTICAS
-- =============================================================

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'insumos','subproductos','productos_terminados','bom_recetas',
    'subproducto_recetas','subproducto_subproductos','paquete_subproductos',
    'ordenes_semanales','movimientos_inventario','sys_proveedores'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rol_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS rol_write ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_all ON public.%I', t);
    EXECUTE format('CREATE POLICY rol_select ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY rol_write ON public.%I FOR ALL TO authenticated USING (public.current_user_role() IN (''admin'',''operador'')) WITH CHECK (public.current_user_role() IN (''admin'',''operador''))', t);
  END LOOP;
END $$;

-- profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_write ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin');
CREATE POLICY profiles_write ON public.profiles FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- entregas_op
ALTER TABLE public.entregas_op ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entregas_op_select ON public.entregas_op;
DROP POLICY IF EXISTS entregas_op_write ON public.entregas_op;
CREATE POLICY entregas_op_select ON public.entregas_op FOR SELECT TO authenticated USING (true);
CREATE POLICY entregas_op_write ON public.entregas_op FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin','operador'))
  WITH CHECK (public.current_user_role() IN ('admin','operador'));

-- ajustes_costo_insumo
ALTER TABLE public.ajustes_costo_insumo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ajustes_costo_select ON public.ajustes_costo_insumo;
DROP POLICY IF EXISTS ajustes_costo_write ON public.ajustes_costo_insumo;
CREATE POLICY ajustes_costo_select ON public.ajustes_costo_insumo FOR SELECT TO authenticated USING (true);
CREATE POLICY ajustes_costo_write ON public.ajustes_costo_insumo FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin','operador'))
  WITH CHECK (public.current_user_role() IN ('admin','operador'));

-- backup_log
ALTER TABLE public.backup_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS backup_log_select ON public.backup_log;
DROP POLICY IF EXISTS backup_log_insert ON public.backup_log;
CREATE POLICY backup_log_select ON public.backup_log FOR SELECT TO authenticated USING (true);
CREATE POLICY backup_log_insert ON public.backup_log FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin','operador'));

-- =============================================================
-- 7. POST-SETUP
-- =============================================================
-- Después de correr este archivo:
--
--   1. Authentication → Users → Add user → Create new user
--      (marcar "Auto Confirm User")
--
--   2. Promover ese usuario a admin:
--      UPDATE public.profiles
--      SET role = 'admin', nombre = 'Nombre del admin'
--      WHERE email = 'correo@ejemplo.com';
--
--   3. Verificar:
--      SELECT email, role, activo FROM public.profiles;
--
-- =============================================================
-- FIN DEL SCHEMA
-- =============================================================

-- =============================================================
-- MIGRACIONES CONSOLIDADAS (v1.3.0 a v2.4.0)
-- =============================================================

-- 1. NUEVAS TABLAS
CREATE TABLE IF NOT EXISTS public.etiquetas_impresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_pt text REFERENCES public.productos_terminados(codigo_pt) ON DELETE CASCADE,
  lote text,
  cantidad_paquetes int,
  cantidad_cajas int,
  usuario_email text,
  fecha timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.devoluciones_pt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_pt text NOT NULL REFERENCES public.productos_terminados(codigo_pt),
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  estado_producto text NOT NULL DEFAULT 'bueno' CHECK (estado_producto IN ('bueno','dañado','cuarentena')),
  motivo text,
  usuario_id uuid,
  usuario_email text,
  fecha timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.evaluaciones_proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid REFERENCES public.sys_proveedores(id) ON DELETE CASCADE,
  proveedor_nombre text,
  proveedor_nit text,
  fecha date DEFAULT CURRENT_DATE,
  evaluador_email text,
  nota_entrega numeric(3,1) DEFAULT 5.0,
  nota_calidad numeric(3,1) DEFAULT 5.0,
  nota_postventa numeric(3,1) DEFAULT 5.0,
  nota_fumigacion numeric(3,1) DEFAULT 5.0,
  nota_precio numeric(3,1) DEFAULT 5.0,
  promedio numeric(3,2),
  resultado text,
  observaciones text,
  creado_en timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insumo_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id uuid NOT NULL REFERENCES public.insumos(id) ON DELETE CASCADE,
  lote text NOT NULL,
  cantidad_recibida numeric NOT NULL DEFAULT 0,
  cantidad_actual numeric NOT NULL DEFAULT 0,
  costo_unitario numeric,
  proveedor_id uuid REFERENCES public.sys_proveedores(id) ON DELETE SET NULL,
  primer_ingreso timestamptz NOT NULL DEFAULT now(),
  ultimo_ingreso timestamptz NOT NULL DEFAULT now(),
  notas text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (insumo_id, lote)
);

CREATE TABLE IF NOT EXISTS public.despachos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_pt text REFERENCES public.productos_terminados(codigo_pt) ON DELETE CASCADE,
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  lote_op text,
  consecutivo text,
  oc text,
  cliente text NOT NULL,
  fecha date DEFAULT CURRENT_DATE,
  fecha_vencimiento text,
  observaciones text,
  usuario_email text,
  creado_en timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cajas_ubicacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_caja text UNIQUE NOT NULL,
  codigo_pt text REFERENCES public.productos_terminados(codigo_pt) ON DELETE CASCADE,
  ubicacion text NOT NULL,
  estado text DEFAULT 'En bodega',
  usuario_email text,
  actualizado_en timestamptz DEFAULT now(),
  creado_en timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sys_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid,
  actualizado_por_email text
);

-- 2. NUEVAS COLUMNAS
ALTER TABLE public.productos_terminados 
  ADD COLUMN IF NOT EXISTS codigo_barras text,
  ADD COLUMN IF NOT EXISTS plantilla_etiqueta text DEFAULT 'esteril_proclides',
  ADD COLUMN IF NOT EXISTS vida_util_meses integer DEFAULT 35,
  ADD COLUMN IF NOT EXISTS registro_invima text;

ALTER TABLE public.movimientos_inventario
  ADD COLUMN IF NOT EXISTS estado_calidad text DEFAULT 'Aprobado',
  ADD COLUMN IF NOT EXISTS observaciones_calidad text,
  ADD COLUMN IF NOT EXISTS numero_factura text,
  ADD COLUMN IF NOT EXISTS numero_oc text,
  ADD COLUMN IF NOT EXISTS numero_entrada_almacen text,
  ADD COLUMN IF NOT EXISTS cantidad_pendiente_oc numeric,
  ADD COLUMN IF NOT EXISTS lote_insumo text;

ALTER TABLE public.ordenes_semanales 
  ADD COLUMN IF NOT EXISTS fecha_fin_programada date;

-- 3. CONSTRAINTS
ALTER TABLE public.productos_terminados DROP CONSTRAINT IF EXISTS productos_terminados_plantilla_etiqueta_check;
ALTER TABLE public.productos_terminados ADD CONSTRAINT productos_terminados_plantilla_etiqueta_check 
  CHECK (plantilla_etiqueta IN ('esteril_proclides','esteril_allmed','noesteril_allmed','noesteril_proclides_grande','noesteril_proclides_mediana'));

-- 4. FUNCIONES Y TRIGGERS

-- 4.1 Trigger Lotes FIFO
CREATE OR REPLACE FUNCTION public.mov_inv_sync_lotes() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_lote text;
BEGIN
  IF NEW.tipo = 'Entrada' AND NEW.insumo_id IS NOT NULL THEN
    v_lote := COALESCE(NULLIF(trim(NEW.lote_insumo), ''), 'SIN LOTE');
    IF NEW.lote_insumo IS NULL OR trim(NEW.lote_insumo) = '' THEN
      UPDATE public.movimientos_inventario SET lote_insumo = v_lote WHERE id = NEW.id;
    END IF;
    INSERT INTO public.insumo_lotes (insumo_id, lote, cantidad_recibida, cantidad_actual, costo_unitario, proveedor_id, primer_ingreso, ultimo_ingreso)
    VALUES (NEW.insumo_id, v_lote, COALESCE(NEW.cantidad, 0), COALESCE(NEW.cantidad, 0), NEW.costo_unitario_momento, NEW.proveedor_id, NEW.fecha, NEW.fecha)
    ON CONFLICT (insumo_id, lote) DO UPDATE
      SET cantidad_recibida = public.insumo_lotes.cantidad_recibida + EXCLUDED.cantidad_recibida,
          cantidad_actual = public.insumo_lotes.cantidad_actual + EXCLUDED.cantidad_actual,
          ultimo_ingreso = EXCLUDED.ultimo_ingreso,
          costo_unitario = COALESCE(EXCLUDED.costo_unitario, public.insumo_lotes.costo_unitario),
          proveedor_id = COALESCE(EXCLUDED.proveedor_id, public.insumo_lotes.proveedor_id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS mov_inv_sync_lotes_trg ON public.movimientos_inventario;
CREATE TRIGGER mov_inv_sync_lotes_trg AFTER INSERT ON public.movimientos_inventario FOR EACH ROW EXECUTE FUNCTION public.mov_inv_sync_lotes();

-- 4.2 Trigger Sys Config
CREATE OR REPLACE FUNCTION public.sys_config_actualizar_meta() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  NEW.actualizado_por := auth.uid();
  SELECT email INTO NEW.actualizado_por_email FROM public.profiles WHERE user_id = auth.uid();
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS sys_config_meta ON public.sys_config;
CREATE TRIGGER sys_config_meta BEFORE UPDATE ON public.sys_config FOR EACH ROW EXECUTE FUNCTION public.sys_config_actualizar_meta();

-- 4.3 Función FIFO
CREATE OR REPLACE FUNCTION public.consumir_insumo_fifo(p_insumo_id uuid, p_cantidad numeric, p_motivo text, p_orden_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_restante numeric := p_cantidad; v_tomar numeric; v_lote record; v_detalle jsonb := '[]'::jsonb;
BEGIN
  FOR v_lote IN SELECT id, lote, cantidad_actual FROM public.insumo_lotes WHERE insumo_id = p_insumo_id AND cantidad_actual > 0 ORDER BY primer_ingreso ASC LOOP
    IF v_restante <= 0 THEN EXIT; END IF;
    v_tomar := LEAST(v_restante, v_lote.cantidad_actual);
    UPDATE public.insumo_lotes SET cantidad_actual = cantidad_actual - v_tomar WHERE id = v_lote.id;
    INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, motivo, orden_id, lote_insumo) VALUES (p_insumo_id, 'Consumo', v_tomar, p_motivo, p_orden_id, v_lote.lote);
    v_restante := v_restante - v_tomar;
    v_detalle := v_detalle || jsonb_build_object('lote', v_lote.lote, 'cantidad', v_tomar);
  END LOOP;
  IF v_restante > 0 THEN
    INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, motivo, orden_id, lote_insumo) VALUES (p_insumo_id, 'Consumo', v_restante, p_motivo, p_orden_id, 'SIN LOTE');
    v_detalle := v_detalle || jsonb_build_object('lote', 'SIN LOTE', 'cantidad', v_restante);
  END IF;
  UPDATE public.insumos SET existencia_actual = existencia_actual - p_cantidad WHERE id = p_insumo_id;
  RETURN jsonb_build_object('consumo_detalle', v_detalle);
END; $$;

-- 4.4 Registrar Entrada (con lote)
CREATE OR REPLACE FUNCTION public.registrar_entrada(p_insumo_id uuid, p_cantidad numeric, p_proveedor_id uuid, p_costo_unitario numeric, p_motivo text, p_rendimiento_real numeric, p_lote_insumo text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_result jsonb; v_mov_id uuid;
BEGIN
  v_result := public.registrar_entrada(p_insumo_id, p_cantidad, p_proveedor_id, p_costo_unitario, p_motivo, p_rendimiento_real);
  IF p_lote_insumo IS NOT NULL AND length(trim(p_lote_insumo)) > 0 THEN
    SELECT id INTO v_mov_id FROM public.movimientos_inventario WHERE insumo_id = p_insumo_id AND tipo = 'Entrada' ORDER BY fecha DESC LIMIT 1;
    IF v_mov_id IS NOT NULL THEN UPDATE public.movimientos_inventario SET lote_insumo = trim(p_lote_insumo) WHERE id = v_mov_id; END IF;
  END IF;
  RETURN v_result;
END; $$;
GRANT EXECUTE ON FUNCTION public.registrar_entrada(uuid, numeric, uuid, numeric, text, numeric, text) TO authenticated;

-- 4.5 Registrar Entrega OP (con FIFO y suma a PT)
CREATE OR REPLACE FUNCTION public.registrar_entrega_op(p_orden_id uuid, p_cantidad numeric, p_lote_entrega text DEFAULT NULL, p_motivo text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_op record; v_detalle jsonb; v_ins record; v_sub record; v_receta record; v_cant_proporcional numeric; v_stock_actual numeric; v_faltante numeric; v_email text; v_producido_antes numeric; v_existencia_pt numeric;
BEGIN
  SELECT * INTO v_op FROM public.ordenes_semanales WHERE id = p_orden_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OP no encontrada'; END IF;
  v_detalle := v_op.detalle_faltantes;
  v_producido_antes := COALESCE(v_op.cantidad_producida, 0);
  v_cant_proporcional := p_cantidad / v_op.cantidad_proyectada;
  FOR v_sub IN SELECT * FROM jsonb_to_recordset(v_detalle->'subproductos') AS x(subproducto_id uuid, requerido numeric) LOOP
    v_faltante := v_sub.requerido * v_cant_proporcional;
    SELECT existencia_actual INTO v_stock_actual FROM public.subproductos WHERE id = v_sub.subproducto_id FOR UPDATE;
    IF v_stock_actual >= v_faltante THEN
      UPDATE public.subproductos SET existencia_actual = existencia_actual - v_faltante WHERE id = v_sub.subproducto_id;
      INSERT INTO public.movimientos_inventario (subproducto_id, tipo, cantidad, motivo, orden_id) VALUES (v_sub.subproducto_id, 'Consumo', v_faltante, 'Consumo OP ' || COALESCE(v_op.numero_op,''), p_orden_id);
    ELSE
      IF v_stock_actual > 0 THEN
        UPDATE public.subproductos SET existencia_actual = 0 WHERE id = v_sub.subproducto_id;
        INSERT INTO public.movimientos_inventario (subproducto_id, tipo, cantidad, motivo, orden_id) VALUES (v_sub.subproducto_id, 'Consumo', v_stock_actual, 'Consumo OP ' || COALESCE(v_op.numero_op,''), p_orden_id);
      END IF;
      v_faltante := v_faltante - v_stock_actual;
      FOR v_receta IN SELECT * FROM public.subproducto_recetas WHERE subproducto_id = v_sub.subproducto_id LOOP
        PERFORM public.consumir_insumo_fifo(v_receta.insumo_id, (v_receta.cantidad_por_unidad * v_faltante), 'Auto-producción para OP ' || COALESCE(v_op.numero_op,''), p_orden_id);
      END LOOP;
    END IF;
  END LOOP;
  FOR v_ins IN SELECT * FROM jsonb_to_recordset(v_detalle->'insumos') AS x(insumo_id uuid, consumo_total numeric) LOOP
    v_faltante := v_ins.consumo_total * v_cant_proporcional;
    PERFORM public.consumir_insumo_fifo(v_ins.insumo_id, v_faltante, 'Consumo OP ' || COALESCE(v_op.numero_op,''), p_orden_id);
  END LOOP;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.entregas_op (orden_id, cantidad, lote_entrega, motivo, usuario_email) VALUES (p_orden_id, p_cantidad, p_lote_entrega, p_motivo, v_email);
  UPDATE public.productos_terminados SET existencia_actual = COALESCE(existencia_actual, 0) + p_cantidad WHERE codigo_pt = v_op.codigo_pt RETURNING existencia_actual INTO v_existencia_pt;
  UPDATE public.ordenes_semanales SET cantidad_producida = v_producido_antes + p_cantidad, estado_op = CASE WHEN (v_producido_antes + p_cantidad) >= cantidad_proyectada THEN 'Terminada' ELSE 'En proceso' END, fecha_completado = CASE WHEN (v_producido_antes + p_cantidad) >= cantidad_proyectada THEN now() ELSE NULL END WHERE id = p_orden_id;
  RETURN jsonb_build_object('ok', true, 'cantidad_producida', v_producido_antes + p_cantidad, 'op_cerrada', (v_producido_antes + p_cantidad) >= v_op.cantidad_proyectada, 'existencia_pt', v_existencia_pt);
END; $$;

-- 4.6 Producir Subproducto (con FIFO)
CREATE OR REPLACE FUNCTION public.producir_subproducto(p_id uuid, p_cantidad numeric, p_lote text DEFAULT NULL, p_motivo text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_sub record; v_receta record; v_hijo record; v_items integer := 0; v_existencia_nueva numeric;
BEGIN
  SELECT * INTO v_sub FROM public.subproductos WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subproducto no encontrado'; END IF;
  FOR v_receta IN SELECT insumo_id, cantidad_por_unidad FROM public.subproducto_recetas WHERE subproducto_id = p_id LOOP
    PERFORM public.consumir_insumo_fifo(v_receta.insumo_id, (v_receta.cantidad_por_unidad * p_cantidad), 'Producción de ' || v_sub.nombre, NULL);
    v_items := v_items + 1;
  END LOOP;
  FOR v_hijo IN SELECT subproducto_hijo_id, cantidad_por_unidad FROM public.subproducto_subproductos WHERE subproducto_padre_id = p_id LOOP
    UPDATE public.subproductos SET existencia_actual = existencia_actual - (v_hijo.cantidad_por_unidad * p_cantidad) WHERE id = v_hijo.subproducto_hijo_id;
    INSERT INTO public.movimientos_inventario (subproducto_id, tipo, cantidad, motivo) VALUES (v_hijo.subproducto_hijo_id, 'Consumo', (v_hijo.cantidad_por_unidad * p_cantidad), 'Producción de ' || v_sub.nombre);
    v_items := v_items + 1;
  END LOOP;
  UPDATE public.subproductos SET existencia_actual = existencia_actual + p_cantidad WHERE id = p_id RETURNING existencia_actual INTO v_existencia_nueva;
  INSERT INTO public.movimientos_inventario (subproducto_id, tipo, cantidad, motivo, lote_insumo) VALUES (p_id, 'Entrada', p_cantidad, COALESCE(p_motivo, 'Producción manual'), p_lote);
  RETURN jsonb_build_object('existencia_nueva', v_existencia_nueva, 'items_afectados', v_items);
END; $$;

-- 4.7 Registrar Salida (FIFO)
CREATE OR REPLACE FUNCTION public.registrar_salida(p_insumo_id uuid, p_cantidad numeric, p_motivo text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_insumo record; v_existencia_nueva numeric;
BEGIN
  SELECT * INTO v_insumo FROM public.insumos WHERE id = p_insumo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  PERFORM public.consumir_insumo_fifo(p_insumo_id, p_cantidad, 'Salida manual: ' || COALESCE(p_motivo,'Sin motivo'), NULL);
  SELECT existencia_actual INTO v_existencia_nueva FROM public.insumos WHERE id = p_insumo_id;
  RETURN jsonb_build_object('existencia_nueva', v_existencia_nueva);
END; $$;

-- 4.8 Registrar Devolución (LIFO/Lote)
DROP FUNCTION IF EXISTS public.registrar_devolucion(uuid, numeric, uuid, text);
CREATE OR REPLACE FUNCTION public.registrar_devolucion(p_insumo_id uuid, p_cantidad numeric, p_proveedor_id uuid, p_motivo text DEFAULT NULL, p_lote text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_insumo record; v_restante numeric := p_cantidad; v_tomar numeric; v_lote_rec record; v_existencia_nueva numeric;
BEGIN
  SELECT * INTO v_insumo FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  IF v_insumo.existencia_actual < p_cantidad THEN RAISE EXCEPTION 'No hay suficiente stock para devolver'; END IF;
  IF p_lote IS NOT NULL THEN
    UPDATE public.insumo_lotes SET cantidad_actual = cantidad_actual - p_cantidad WHERE insumo_id = p_insumo_id AND lote = p_lote;
  ELSE
    FOR v_lote_rec IN SELECT id, lote, cantidad_actual FROM public.insumo_lotes WHERE insumo_id = p_insumo_id AND cantidad_actual > 0 ORDER BY primer_ingreso DESC LOOP
      IF v_restante <= 0 THEN EXIT; END IF;
      v_tomar := LEAST(v_restante, v_lote_rec.cantidad_actual);
      UPDATE public.insumo_lotes SET cantidad_actual = cantidad_actual - v_tomar WHERE id = v_lote_rec.id;
      v_restante := v_restante - v_tomar;
    END LOOP;
  END IF;
  UPDATE public.insumos SET existencia_actual = existencia_actual - p_cantidad WHERE id = p_insumo_id RETURNING existencia_actual INTO v_existencia_nueva;
  INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, proveedor_id, motivo, lote_insumo) VALUES (p_insumo_id, 'Salida', p_cantidad, p_proveedor_id, COALESCE(p_motivo, 'Devolución a proveedor'), p_lote);
  RETURN jsonb_build_object('existencia_nueva', v_existencia_nueva);
END; $$;

-- 4.9 Ajustar Inventario (FIFO)
CREATE OR REPLACE FUNCTION public.ajustar_inventario(p_insumo_id uuid, p_nueva_existencia numeric, p_motivo text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_insumo record; v_dif numeric;
BEGIN
  SELECT * INTO v_insumo FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  v_dif := p_nueva_existencia - v_insumo.existencia_actual;
  IF v_dif = 0 THEN RETURN jsonb_build_object('existencia_nueva', p_nueva_existencia); END IF;
  IF v_dif > 0 THEN
    INSERT INTO public.insumo_lotes (insumo_id, lote, cantidad_recibida, cantidad_actual, costo_unitario, primer_ingreso, ultimo_ingreso)
    VALUES (p_insumo_id, 'AJUSTE', v_dif, v_dif, v_insumo.costo_unitario, now(), now())
    ON CONFLICT (insumo_id, lote) DO UPDATE SET cantidad_actual = public.insumo_lotes.cantidad_actual + EXCLUDED.cantidad_actual;
    INSERT INTO public.movimientos_inventario (insumo_id, tipo, cantidad, motivo, lote_insumo) VALUES (p_insumo_id, 'Entrada', v_dif, COALESCE(p_motivo, 'Ajuste positivo'), 'AJUSTE');
  ELSE
    PERFORM public.consumir_insumo_fifo(p_insumo_id, ABS(v_dif), COALESCE(p_motivo, 'Ajuste negativo'), NULL);
  END IF;
  UPDATE public.insumos SET existencia_actual = p_nueva_existencia WHERE id = p_insumo_id;
  RETURN jsonb_build_object('existencia_nueva', p_nueva_existencia);
END; $$;

-- 4.10 Registrar Devolución PT
CREATE OR REPLACE FUNCTION public.registrar_devolucion_pt(p_codigo_pt text, p_cantidad numeric, p_estado_producto text DEFAULT 'bueno', p_motivo text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_pt public.productos_terminados%ROWTYPE; v_id uuid; v_email text; v_existencia_despues numeric;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad > 0'; END IF;
  SELECT * INTO v_pt FROM public.productos_terminados WHERE codigo_pt = p_codigo_pt FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PT no encontrado'; END IF;
  IF p_estado_producto = 'bueno' THEN
    UPDATE public.productos_terminados SET existencia_actual = COALESCE(existencia_actual, 0) + p_cantidad WHERE codigo_pt = p_codigo_pt;
    v_existencia_despues := COALESCE(v_pt.existencia_actual, 0) + p_cantidad;
  ELSE
    v_existencia_despues := COALESCE(v_pt.existencia_actual, 0);
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.devoluciones_pt (codigo_pt, cantidad, estado_producto, motivo, usuario_id, usuario_email) VALUES (p_codigo_pt, p_cantidad, p_estado_producto, p_motivo, auth.uid(), v_email) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'existencia_nueva', v_existencia_despues, 'afecta_stock', p_estado_producto = 'bueno');
END; $$;

-- 4.11 Registrar Despacho
CREATE OR REPLACE FUNCTION public.registrar_despacho(p_codigo_pt text, p_cantidad numeric, p_cliente text, p_lote_op text DEFAULT NULL, p_consecutivo text DEFAULT NULL, p_oc text DEFAULT NULL, p_fecha date DEFAULT CURRENT_DATE, p_fecha_vencimiento text DEFAULT NULL, p_observaciones text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_pt record; v_existencia_nueva numeric; v_email text;
BEGIN
  SELECT * INTO v_pt FROM public.productos_terminados WHERE codigo_pt = p_codigo_pt FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PT no encontrado'; END IF;
  IF v_pt.existencia_actual < p_cantidad THEN RAISE EXCEPTION 'Stock insuficiente. Disponible: %', v_pt.existencia_actual; END IF;
  UPDATE public.productos_terminados SET existencia_actual = existencia_actual - p_cantidad WHERE codigo_pt = p_codigo_pt RETURNING existencia_actual INTO v_existencia_nueva;
  BEGIN SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid(); EXCEPTION WHEN OTHERS THEN v_email := 'desconocido'; END;
  INSERT INTO public.despachos (codigo_pt, cantidad, cliente, lote_op, consecutivo, oc, fecha, fecha_vencimiento, observaciones, usuario_email) VALUES (p_codigo_pt, p_cantidad, p_cliente, p_lote_op, p_consecutivo, p_oc, p_fecha, p_fecha_vencimiento, p_observaciones, v_email);
  RETURN jsonb_build_object('ok', true, 'existencia_nueva', v_existencia_nueva);
END; $$;

-- 4.12 Registrar Lotes Entrada (Batch)
CREATE OR REPLACE FUNCTION public.registrar_lotes_entrada(p_insumo_id uuid, p_lotes jsonb, p_proveedor_id uuid DEFAULT NULL, p_costo_unitario numeric DEFAULT NULL, p_fecha timestamptz DEFAULT now()) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count integer := 0; v_item jsonb; v_lote text; v_cantidad numeric;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_lotes) LOOP
    v_lote := trim(coalesce(v_item->>'lote','')); v_cantidad := coalesce((v_item->>'cantidad')::numeric, 0);
    IF length(v_lote) = 0 THEN CONTINUE; END IF;
    INSERT INTO public.insumo_lotes (insumo_id, lote, cantidad_recibida, cantidad_actual, costo_unitario, proveedor_id, primer_ingreso, ultimo_ingreso)
    VALUES (p_insumo_id, v_lote, v_cantidad, v_cantidad, p_costo_unitario, p_proveedor_id, p_fecha, p_fecha)
    ON CONFLICT (insumo_id, lote) DO UPDATE SET cantidad_recibida = public.insumo_lotes.cantidad_recibida + EXCLUDED.cantidad_recibida, cantidad_actual = public.insumo_lotes.cantidad_actual + EXCLUDED.cantidad_actual, ultimo_ingreso = EXCLUDED.ultimo_ingreso, costo_unitario = COALESCE(EXCLUDED.costo_unitario, public.insumo_lotes.costo_unitario), proveedor_id = COALESCE(EXCLUDED.proveedor_id, public.insumo_lotes.proveedor_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('lotes_insertados', v_count);
END; $$;

-- 5. RLS PARA NUEVAS TABLAS
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['etiquetas_impresas','devoluciones_pt','evaluaciones_proveedores','insumo_lotes','despachos','cajas_ubicacion','sys_config'])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rol_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS rol_write ON public.%I', t);
    EXECUTE format('CREATE POLICY rol_select ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY rol_write ON public.%I FOR ALL TO authenticated USING (public.current_user_role() IN (''admin'',''operador'')) WITH CHECK (public.current_user_role() IN (''admin'',''operador''))', t);
  END LOOP;
END $$;