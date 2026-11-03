## Estado actual

| Migración | Estado | Staging | Producción |
|---|---|---|---|
| `0001_rectificar_calidad.sql` | ✅ Aplicada | 2026-11-01 | 2026-11-01 |
| `0002_seguridad.sql`         | ✅ Aplicada | 2026-11-01 | 2026-11-01 |
| `0003_rpcs.sql`              | ✅ Aplicada | 2026-11-01 | 2026-11-01 |
| `0004_triggers_rls.sql`      | ✅ Aplicada | 2026-11-01 | 2026-11-01 |
| `0005_user_preferences.sql`  | ✅ Aplicada | 2026-11-02 | 🟡 Pendiente |
| `0006_logos_storage.sql`     | ✅ Aplicada | 2026-11-02 | 🟡 Pendiente |

> Ajustar fechas y estados según el entorno real. Actualizar cada vez
> que se aplique una migración.

## Migraciones one-shot (opcionales, correr una vez)

Estas funciones se ejecutan **manualmente** después de aplicar la
migración correspondiente, porque dependen de datos que solo el
usuario puede decidir migrar.

### `migrar_notif_prefs_desde_config()` (después de `0005`)

Adopta los `vistos`/`silenciados` históricos de
`sys_config.config.notif` hacia la fila del usuario actual en
`user_preferences`. Solo el admin lo corre; los demás usuarios
arrancan con notifs limpias.

```sql
-- Logueado como admin en la app, en SQL Editor:
SELECT public.migrar_notif_prefs_desde_config();
-- Esperado: {"ok": true, "vistos_migrados": N, "silenciados_migrados": M, ...}