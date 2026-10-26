# SETUP — AseptiQ

Guía para levantar AseptiQ desde cero: base de datos, backend, frontend y deploy.

---

## 1. Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Cuenta en [Supabase](https://supabase.com) | Free tier | Base de datos + Auth + API |
| Cuenta en [Vercel](https://vercel.com) | Free tier | Hosting |
| [Git](https://git-scm.com/) | 2.40+ | Control de versiones |
| Navegador moderno | Chrome, Edge, Firefox o Safari | Cliente |

**No se necesita Node, npm, Python ni compiladores.** El frontend es HTML/CSS/JS puro.

---

## 2. Crear el proyecto en Supabase

1. Entrar a [supabase.com](https://supabase.com) → **New Project**.
2. Completar:
   - **Name**: `aseptiq`
   - **Database Password**: guardarla en gestor de contraseñas.
   - **Region**: `South America (São Paulo)` (la más cercana a Colombia).
   - **Plan**: Free.
3. Esperar ~2 minutos.
4. Ir a **Project Settings → API** y copiar:
   - **Project URL** → `https://xxxxx.supabase.co`
   - **anon public key** → `eyJ...`

> **Seguridad**: la `anon key` está diseñada para ser pública. La protección real está en RLS. **Nunca** compartas ni subas la `service_role key` — esa bypasea RLS.

---

## 3. Correr el schema

En **Supabase → SQL Editor → New query**, pegar el contenido de **`schema.sql`** y ejecutar.

Es **un solo archivo** que crea:
- Las 14 tablas con constraints e índices.
- Las funciones helper (códigos, roles, costos).
- Los 15 RPCs de negocio.
- El trigger de creación automática de perfiles.
- RLS activo con políticas por rol.

**Es idempotente**: se puede correr varias veces sin daño.

### Verificación

```sql
-- Debe listar 21 tablas
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Debe listar las funciones RPC
SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace ORDER BY proname;
```

Tablas esperadas:
`ajustes_costo_insumo`, `backup_log`, `bom_recetas`, `entregas_op`, `insumos`, `movimientos_inventario`, `ordenes_semanales`, `paquete_subproductos`, `productos_terminados`, `profiles`, `subproducto_recetas`, `subproducto_subproductos`, `subproductos`, `sys_proveedores`, `etiquetas_impresas`, `devoluciones_pt`, `evaluaciones_proveedores`, `insumo_lotes`, `despachos`, `cajas_ubicacion`, `sys_config`.

### Nota sobre migraciones históricas

La carpeta `migraciones/` contiene los scripts originales que construyeron el esquema paso a paso (v04 a v27). Es **solo referencia histórica** — no se necesita correrlos. El `schema.sql` es la consolidación final.

---

## 4. Crear el primer usuario admin

1. **Authentication → Users → Add user → Create new user**.
2. Completar:
   - **Email**: tu correo real.
   - **Password**: segura.
   - ✅ **Auto Confirm User**.
3. Guardar.

El trigger `on_auth_user_created` creará automáticamente una fila en `profiles` con rol `consulta`.

4. **Promover a admin** con este SQL:

```sql
UPDATE public.profiles
SET role = 'admin', nombre = 'Nombre del Admin'
WHERE email = 'tu-correo@ejemplo.com';
```

5. Verificar:

```sql
SELECT email, role, activo FROM public.profiles;
```

Debe mostrar tu email con `role='admin'` y `activo=true`.

---

## 5. Levantar el frontend en local

1. Clonar el repositorio:

```bash
git clone https://github.com/tu-usuario/AseptiQ.git
cd AseptiQ
```

2. Abrir `index.html`:
   - **Opción A**: doble click (funciona en `file://`).
   - **Opción B**: servidor local con Live Server (VS Code) o `python -m http.server 8000`.

3. En la pantalla de login, ingresar:
   - **URL del proyecto**: `https://xxxxx.supabase.co`
   - **Anon public key**: `eyJ...`
   - **Correo** y **contraseña** del paso anterior.

4. Si entras al Dashboard, todo está correcto.

---

## 6. Deploy en producción (Vercel)

### Opción A — Conectado a GitHub (recomendado)

1. Ir a [vercel.com/new](https://vercel.com/new).
2. **Import Git Repository** → seleccionar el repo `AseptiQ`.
3. Configuración:
   - **Framework Preset**: `Other`
   - **Build Command**: (vacío)
   - **Output Directory**: (vacío)
   - **Install Command**: (vacío)
4. **Deploy**.

Cada `git push` a `main` redespliega automático.

### Opción B — Drag & drop

Arrastrar la carpeta del proyecto a [vercel.com/new](https://vercel.com/new).

### Después del primer deploy

En **Supabase → Authentication → URL Configuration**:
- **Site URL**: `https://tu-app.vercel.app`
- **Redirect URLs**: agregar `https://tu-app.vercel.app/**`

---

## 7. Estructura del proyecto

```
AseptiQ/
├── index.html              # Shell + estilos
├── aseptiq_app.js          # Lógica de UI
├── aseptiq_core.js         # Lógica pura
├── schema.sql              # Esquema del backend
├── migraciones/            # Historial (referencia)
├── CONTRATO_API.md         # API backend
├── MANUAL.md               # Manual de usuario
├── SETUP.md                # Este archivo
├── PORT_DOTNET.md          # Plan de port
├── CHANGELOG.md            # Versiones
└── .gitignore
```

**Archivos que sirve Vercel** (van a la URL pública):
- `index.html`
- `aseptiq_app.js`
- `aseptiq_core.js`

**Archivos internos** (no se sirven):
- Documentación, schema, migraciones.

---

## 8. Troubleshooting

| Problema | Causa | Solución |
|---|---|---|
| `No se pudo conectar: Failed to fetch` | URL mal escrita o proyecto pausado | Verificar URL. Reactivar en Supabase si está pausado (1 semana sin actividad). |
| `Invalid login credentials` | Usuario o contraseña incorrectos | Verificar en Authentication → Users. |
| `Email not confirmed` | Usuario sin confirmar | Authentication → Users → click usuario → Confirm email. |
| `function X does not exist` | Falta correr el `schema.sql` | Correr `schema.sql` completo. |
| `new row violates row-level security policy` | Rol incorrecto | Verificar `SELECT * FROM profiles WHERE email='tu-correo';` |
| Loader queda pegado | Algún render falló | F12 → Console. Activar debug: `localStorage.setItem('aseptiq_debug','1'); location.reload();` |

---

## 9. Backup de la base

### Backup completo (recomendado mensualmente)

En Supabase → **Project Settings → Database → Backups**. Los planes free retienen 7 días.

Para backup manual:

```bash
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" > backup.sql
```

### Export operativo (día a día)

Desde la app, módulo **Backup** (solo admin) → genera un ZIP con 13 tablas en CSV.

---

## 10. Recursos

- **Manual de usuario**: [`MANUAL.md`](MANUAL.md)
- **Contrato de API**: [`CONTRATO_API.md`](CONTRATO_API.md)
- **Port a .NET**: [`PORT_DOTNET.md`](PORT_DOTNET.md)
- **Supabase docs**: [supabase.com/docs](https://supabase.com/docs)

---

**Última actualización:** Octubre 2026