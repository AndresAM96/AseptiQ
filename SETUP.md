# SETUP — AseptiQ

Guía completa para levantar AseptiQ desde cero: base de datos, backend, frontend y deploy.

---

## 1. Requisitos previos

| Herramienta | Versión recomendada | Para qué |
|---|---|---|
| Cuenta en [Supabase](https://supabase.com) | Free tier alcanza | Base de datos + Auth + API REST |
| Cuenta en [Vercel](https://vercel.com) | Free tier | Hosting del frontend |
| [Git](https://git-scm.com/) | 2.40+ | Control de versiones |
| Editor de código | VS Code, Cursor o similar | Desarrollo |
| Navegador moderno | Chrome, Edge, Firefox, Safari | Cliente |

**No se necesita**: Node, npm, Python, ni compiladores. El frontend es HTML/CSS/JS puro.

---

## 2. Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá un **New Project**.
2. Completá:
   - **Name**: `aseptiq` (o el que prefieras).
   - **Database Password**: guardala en un gestor de contraseñas — la vas a necesitar si usás la CLI de Supabase.
   - **Region**: `South America (São Paulo)` es la más cercana a Colombia.
   - **Plan**: Free.
3. Esperá ~2 minutos a que el proyecto se aprovisione.
4. En **Project Settings → API**, copiá:
   - **Project URL** → algo como `https://xxxxx.supabase.co`
   - **anon public key** → un JWT largo que empieza con `eyJ...`

**Guardá ambos valores.** Son las credenciales que vas a pegar en la pantalla de login de la app.

> **Aviso de seguridad**: la `anon key` está diseñada para ser pública. La protección real vive en RLS. **Nunca** subas al repositorio ni compartas la `service_role key` — esa bypasea RLS.

---

## 3. Correr las migraciones

En **Supabase → SQL Editor**, ejecutá los scripts **en el orden exacto** que aparecen abajo. Cada uno se corre una sola vez.

### Bloque 1 — Esquema base
```
migraciones/schema.sql
```
Crea las tablas principales: `insumos`, `subproductos`, `productos_terminados`, `bom_recetas`, `subproducto_recetas`, `subproducto_subproductos`, `paquete_subproductos`, `ordenes_semanales`, `movimientos_inventario`, `sys_proveedores`.

### Bloque 2 — Migraciones incrementales

Se corren en este orden:

| Orden | Archivo | Qué agrega |
|---|---|---|
| 1 | `migracion_v04.sql` | RPCs atómicas, `siguiente_codigo` con advisory lock |
| 2 | `migracion_v05.sql` | Costo unitario en insumos, traducción de errores |
| 3 | `migracion_v06.sql` | Cadena de conversiones (`conversiones` JSONB) + rendimiento variable |
| 4 | `migracion_v07.sql` | Estados de OP, `completar_orden` v1, tipos de subproducto, `unidades_por_caja` |
| 5 | `migracion_v08.sql` | Tipos de subproducto (`intermedio`/`final`/`ambos`), `unidad_receta` y `factor_receta` en recetas |
| 6 | `migracion_v09.sql` | Ajustes de inventario (`ajustar_inventario`, `ajustar_subproducto`) |
| 7 | `migracion_v11.sql` | Subproductos sin punto de reorden obligatorio |
| 8 | `migracion_v12.sql` | Existencia de PT, `completar_orden` carga el PT al inventario |
| 9 | `migracion_v13.sql` | Umbrales de stock configurables, entrada de subproductos, lote en OP |
| 10 | `migracion_v14.sql` | `producir_subproducto` con descuento de insumos e hijos |
| 11 | `migracion_v15.sql` | Número de OP obligatorio y único, lote único |
| 12 | `migracion_v16.sql` | `producir_subproducto` valida y descuenta hijos directos |
| 13 | `migracion_v17.sql` | Cobertura MRP nivel por nivel |
| 14 | `migracion_v18.sql` | `completar_orden` valida primero, muta después |
| 15 | `migracion_v19.sql` | Prioridad y fecha programada en OP |
| 16 | `migracion_v20.sql` | `orden_id` y `costo_unitario_momento` en movimientos |
| 17 | `migracion_v21.sql` | Precio de venta en PT |
| 18 | `migracion_v22.sql` | Auth + RLS básico (todas las tablas) |
| 19 | `migracion_v23.sql` | Roles (`admin`/`operador`/`consulta`) + tabla `profiles` + RLS por rol |
| 20 | `migracion_v24.sql` | Tabla `ajustes_costo_insumo` + RPC `ajustar_costo_insumo` |

**Después de correr todo**, verificá con:

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

Debe listar 12 tablas:
- `ajustes_costo_insumo`
- `bom_recetas`
- `insumos`
- `movimientos_inventario`
- `ordenes_semanales`
- `paquete_subproductos`
- `productos_terminados`
- `profiles`
- `subproducto_recetas`
- `subproducto_subproductos`
- `subproductos`
- `sys_proveedores`

---

## 4. Crear el primer usuario (admin)

1. En Supabase, andá a **Authentication → Users**.
2. Click en **Add user → Create new user**.
3. Completá:
   - **Email**: tu correo real.
   - **Password**: una contraseña segura.
   - ✅ **Auto Confirm User** (marcalo — así no hay que confirmar por email).
4. Click **Create user**.
5. El trigger `on_auth_user_created` (definido en `migracion_v23.sql`) va a crear automáticamente una fila en `profiles` con rol `consulta` por defecto.

6. **Promové ese usuario a admin** con este SQL:

```sql
UPDATE public.profiles
SET role = 'admin', nombre = 'Tu Nombre'
WHERE email = 'tu-correo@ejemplo.com';
```

7. Verificá:

```sql
SELECT email, role, activo FROM public.profiles;
```

Debe mostrar tu email con `role = 'admin'` y `activo = true`.

---

## 5. Levantar el frontend en local

1. Cloná el repositorio:

```bash
git clone https://github.com/AndresAM96/AseptiQ.git
cd AseptiQ
```

2. Abrí `aseptiq.html` en el navegador:
   - **Opción A**: doble click sobre el archivo (funciona en `file://`).
   - **Opción B** (recomendado): servidor local simple:
     ```bash
     # Con Python
     python -m http.server 8000
     
     # O con VS Code → Live Server extension
     ```
   - Abrí `http://localhost:8000` en el navegador.

3. En la pantalla de login, llená:
   - **URL del proyecto**: `https://xxxxx.supabase.co`
   - **Anon public key**: `eyJ...`
   - **Correo**: el del paso anterior.
   - **Contraseña**: la del paso anterior.

4. ✅ **Si entraste al Dashboard, el setup está completo.**

---

## 6. Deploy en producción (Vercel)

### Opción A — Desde el dashboard de Vercel

1. Andá a [vercel.com/new](https://vercel.com/new).
2. **Import Git Repository** → seleccioná el repo `AseptiQ`.
3. Configuración del proyecto:
   - **Framework Preset**: `Other`
   - **Build Command**: *(dejar vacío)*
   - **Output Directory**: *(dejar vacío, es la raíz)*
   - **Install Command**: *(dejar vacío)*
4. Click **Deploy**.
5. En ~30 segundos te da una URL tipo `https://aseptiq.vercel.app`.

### Opción B — Drag & drop

1. En [vercel.com/new](https://vercel.com/new), buscá la opción **"Deploy from template"** o directamente arrastrá la carpeta con `aseptiq.html` a la zona de drop.
2. Vercel detecta que es estático y lo publica.

### Después del primer deploy

1. En **Supabase → Authentication → URL Configuration**:
   - **Site URL**: `https://tu-app.vercel.app`
   - **Redirect URLs**: agregá `https://tu-app.vercel.app/**`
2. Guardá.

Sin esto, funcionalidades futuras como "recuperar contraseña" o "magic link" van a fallar silenciosamente.

---

## 7. Estructura del proyecto

```
AseptiQ/
├── aseptiq.html            # Shell de la app
├── aseptiq_app.js          # Lógica de UI, red, estado
├── inventario_core.js      # Lógica de negocio pura (portable a .NET)
├── migraciones/            # Scripts SQL (no se sirven, son para el admin)
│   ├── schema.sql
│   ├── migracion_v04.sql
│   └── ...
├── CONTRATO_API.md         # Documentación del backend
├── SETUP.md                # Este archivo
├── CHANGELOG.md            # Historial de versiones
├── .gitignore
└── README.md
```

**Archivos que sirve Vercel** (van a la URL pública):
- `aseptiq.html`
- `aseptiq_app.js`
- `aseptiq_core.js`

**Archivos internos** (nunca se sirven):
- Todo lo demás (docs, migraciones, config).

---

## 8. Troubleshooting

### "No se pudo conectar: TypeError Failed to fetch"
- **Causa**: URL de Supabase mal escrita o proyecto pausado.
- **Fix**: verificar la URL en el dashboard de Supabase. Los proyectos free se pausan tras 1 semana de inactividad — se reactivan con un click.

### "Invalid login credentials"
- **Causa**: usuario no existe, o contraseña incorrecta.
- **Fix**: verificar el email en **Authentication → Users**. Si olvidaste la contraseña, reseteala desde ahí.

### "Email not confirmed"
- **Causa**: el usuario se creó sin marcar **Auto Confirm User**.
- **Fix**: en **Authentication → Users**, click en el usuario → **Confirm email**.

### "function X does not exist"
- **Causa**: falta correr alguna migración.
- **Fix**: correr la migración que menciona la función faltante. Verificá con:
  ```sql
  SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace ORDER BY proname;
  ```

### "new row violates row-level security policy"
- **Causa**: tu usuario no tiene el rol correcto.
- **Fix**: verificar en `profiles`:
  ```sql
  SELECT email, role FROM public.profiles WHERE email = 'tu-correo';
  ```
  Si dice `consulta`, actualizar a `admin` o `operador` (ver paso 4).

### La app carga pero el loader queda pegado
- **Causa**: algún `render*` falló silenciosamente.
- **Fix**: abrir la consola del navegador (F12) y buscar errores. Activar modo debug con `localStorage.setItem('aseptiq_debug','1'); location.reload();` para ver más detalle.

### Sidebar colapsado muestra texto roto
- **Causa**: falta el SVG del ícono.
- **Fix**: verificar que `aseptiq_app.js` tenga los `--ic:url(...)` correspondientes. Limpiar caché del navegador (Ctrl+Shift+R).

---

## 9. Backup y export

### Exportar la base de datos completa

Desde **Supabase → Project Settings → Database**:

1. Click en **Backups** → ver los automáticos diarios (retención de 7 días en free).
2. Para backup manual, usá `pg_dump`:
   ```bash
   pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" > backup.sql
   ```
   Necesitás la contraseña de la DB (la del paso 2).

### Exportar los datos vía REST

Los listados de la app tienen botón **"Exportar CSV"** en cada módulo. Es lo más simple para respaldos operativos.

---

## 10. Próximo paso: port a .NET

Cuando retomes el port a .NET (Blazor o MAUI), el contrato completo de tablas, RPCs y políticas RLS está documentado en `CONTRATO_API.md`. Ese archivo es el punto de partida:

- Cada RPC de PostgreSQL tiene su equivalente C# sugerido.
- Cada tabla tiene su modelo C# sugerido.
- Cada flujo crítico está diagramado.

El port idealmente:
1. Reutiliza Supabase como backend (mismo proyecto).
2. Implementa la misma superficie de RPC llamándolos vía `Npgsql` + Dapper.
3. Reescribe la capa de UI en Blazor (web) o MAUI (móvil/desktop).

---

**Última actualización**: 2026-10-04