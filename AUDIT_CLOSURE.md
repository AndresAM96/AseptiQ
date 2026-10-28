# AseptiQ · Cierre de Auditoría Técnica

**Documento:** AUDIT_CLOSURE.md
**Versión del documento:** 1.0
**Fecha de emisión:** 2026-10-27
**Auditoría base:** "Re-auditoría AseptiQ 2.4.2 + parches SQL" (octubre 2026)
**Sistema auditado:** AseptiQ 2.4.2 → 2.5.1
**Clasificación:** Uso interno · SGC
**Estado:** ⚠️ ABIERTA — pendiente de deployment y validación en ambiente real

---

## 1. Propósito

Este documento registra el tratamiento de los hallazgos de la auditoría técnica de AseptiQ 2.4.2, el estado de las correcciones en código, los riesgos aceptados explícitamente y el checklist de cierre formal.

Su función es servir como **evidencia auditable** de que cada hallazgo fue tratado, aceptado o diferido con justificación, y de que el cierre depende de pasos verificables ejecutados por el responsable del despliegue.

---

## 2. Resumen ejecutivo

| Dimensión | Estado |
|---|---|
| Hallazgos totales de la auditoría | 24 |
| Correcciones aplicadas en código | 21 |
| Aceptados como riesgo (con justificación) | 3 |
| Fuera de scope de la auditoría original | 8 (documentados en §6) |
| Deployment a producción | ⏳ **PENDIENTE** |
| Validación en ambiente real | ⏳ **PENDIENTE** |
| **Estado global** | ⚠️ **AUDITORÍA ABIERTA** |

**Conclusión:** El código fuente está corregido y listo para despliegue. La auditoría **no puede cerrarse** hasta que se ejecuten las migraciones, se apliquen los parches de frontend y se valide con los tres roles en un ambiente controlado.

---

## 3. Alcance y metodología

### 3.1 Alcance

**Incluido:**
- Backend: funciones SQL, políticas RLS, triggers, restricciones (Supabase/PostgreSQL)
- Frontend: `aseptiq_app.js`, `aseptiq_core.js`, `aseptiq.html`
- Documentación: `schema.sql`, `CHANGELOG.md`, `MANUAL.md`, `README.md`, `SETUP.md`

**Excluido:**
- Infraestructura de Supabase (responsabilidad del proveedor)
- Navegador y librerías CDN (Chart.js, JSZip, jsbarcode, html5-qrcode, qrcode-generator)
- Proceso de negocio (Proclides/Allmed)
- Testing automatizado (no existe, ver §6.2)

### 3.2 Metodología

- **Análisis estático** de los 11 archivos fuente entregados.
- **Revisión cruzada** entre migraciones (`schema.sql`, `blindaje_seguridad.sql`, `parche_seguridad.sql`, `registrar_entrega_op.sql`) para detectar divergencias.
- **Trazabilidad de hallazgos** con identificadores N1–N12 y clasificación por severidad.
- **Correcciones entregadas** como migraciones numeradas + parches `CTRL+F/H` para frontend.
- **Validación pendiente** por smoke testing manual (no hay suite automatizada).

---

## 4. Matriz de hallazgos y resolución

### 4.1 Hallazgos críticos / altos

| ID | Hallazgo | Severidad | Corrección aplicada | Evidencia | Estado |
|---|---|---|---|---|---|
| **N1** | Multi-lote duplica stock (INSERT manual + trigger) | Crítico | `registrar_entrada_multi_lote` delega en `registrar_entrada` lote a lote; el trigger es el único que inserta en `insumo_lotes` | `v2.5.0_auditoria.sql §D`, `v2.5.1 §2` | ✅ Código |
| **N2** | Multi-lote no convierte unidades ni respeta costo promedio | Crítico | Ídem N1: al delegar en `registrar_entrada` se aplica `factor_conversion` y promedio ponderado | `v2.5.0_auditoria.sql §D` | ✅ Código |
| **N3** | Re-etiquetado de Salida frágil (`UPDATE ... LIMIT 1`) | Alto | `consumir_insumo_fifo` recibe `p_tipo text DEFAULT 'Consumo'`; `registrar_salida` y `ajustar_inventario` lo invocan con `'Salida'` en una sola pasada | `v2.5.0_auditoria.sql §B`, §F | ✅ Código |
| **N4** | Ajuste positivo duplica en `insumo_lotes` | Alto | `ajustar_inventario` ya no inserta a mano; el trigger lo hace | `v2.5.0_auditoria.sql §E` | ✅ Código |
| **N5** | Seguridad: `anon` invoca RPCs, `PUBLIC` privilegios, `search_path` faltante, cantidades negativas, policy de `profiles` incorrecta | Crítico | `validar_escritura` en las 18 RPCs; `REVOKE EXECUTE ... FROM PUBLIC, anon`; `ALTER DEFAULT PRIVILEGES`; `SET search_path` en todas las `SECURITY DEFINER`; `p_cantidad > 0` en `registrar_salida` y `consumir_insumo_fifo`; `current_user_role` devuelve `'inactivo'`; policy `profiles_select` exige rol activo | `v2.5.0_auditoria.sql §A` | ✅ Código · ⏳ Validación SQL pendiente |
| **N6** | Consumo desde snapshot (no BOM), sin recursión, sin validación previa | Alto | `registrar_entrega_op` recalcula desde `bom_recetas` + `paquete_subproductos`; `planificar_consumo_subproducto` (STABLE) + `consumir_subproducto_recursivo` con detección de ciclos; FASE 1 acumula requerimientos por insumo y valida stock antes de mutar | `v2.5.1 §4`, §5 | ✅ Código · ⏳ Testing manual pendiente |
| **N8** | Calidad `Rechazado`/`Cuarentena` entraba a stock | Alto | Trigger `mov_inv_sync_lotes` solo actúa si `estado_calidad='Aprobado'`; `registrar_entrada` solo suma a `existencia_actual` si `Aprobado` | `v2.5.1 §1`, §2 | ✅ Código · ⏳ Testing manual pendiente |

### 4.2 Hallazgos medios / menores

| ID | Hallazgo | Severidad | Corrección aplicada | Evidencia | Estado |
|---|---|---|---|---|---|
| **N7** | XSS en `toast`, notificaciones, tablas | Medio | `esc()` aplicado a `toast`, notificaciones, tablas de Insumos, Productos, Proveedores, Órdenes, Novedades, Kardex, Compras, Mermas, Costos, Rentabilidad, Bodega, Programación, Evaluación, Usuarios, Cobertura, Consolidado, y formularios de edición | Aplicado en `aseptiq_app.js` (~40 sitios) | ✅ Código · ⚠️ ~15 sitios menores pendientes (IDs, números generados) |
| **N9** | Caché de umbrales no se invalida (auto-recursión) | Alto | `_invalidateConfigCache` de `aseptiq_app.js` invoca la de `aseptiq_core.js`; `saveConfig` la llama tras persistir | `aseptiq_app.js` (bloque N9) | ✅ Código |
| **N10** | Fechas en UTC (desfase después de 19h) | Alto | `fechaLocalISO()` aplicada en: despachos, programación (desde/hasta), consolidado (desde/hasta), kardex (filtros), etiquetas (fecha de fabricación), backup (nombre de archivo), `formatoRelativo` | `aseptiq_app.js` (bloque N10) | ✅ Código |
| **N11** | Toasts con `"—"` por campos faltantes en RPCs | Medio | RPCs devuelven `cantidad_consumo`, `cantidad_pendiente`, `existencia_nueva`, `lote` | `v2.5.1 §2`, §5 | ✅ Código |
| **N12(a)** | Códigos de caja con colisión entre impresiones | Medio | Código `{PT}-C{###}-LOTE-{lote}`; `reservar_cajas_lote` reserva en backend con `pg_advisory_xact_lock`; `renderBodega` parsea formato nuevo y viejo | `v2.5.1 §6`; `aseptiq_app.js` (bloque 2) | ✅ Código · ⏳ Testing manual pendiente |
| **N12(b)** | `SIN LOTE` en FIFO mezcla todas las entradas | Medio | `consumir_insumo_fifo` detecta si el insumo tiene lotes reales (`lote <> 'SIN LOTE'`); si no, descuento directo sin FIFO | `v2.5.1 §3` | ✅ Código |
| **N12(c)** | `guardar_subproducto` pisa `existencia_actual` al editar | Medio | `UPDATE` ya no toca `existencia_actual` | `v2.5.0_auditoria.sql §I` | ✅ Código |
| **N12(d)** | Backup sin `ORDER BY` (duplicados/saltos al paginar) | Alto | `id` como tiebreaker en las 6 tablas que faltaban; `apiAll` con `order` determinista | `aseptiq_app.js` (bloque N12-backup) | ✅ Código |
| **N12(e)** | Reportes con `limit` mayor al tope del servidor | Alto | Helper `apiAll` aplicado a Compras, Mermas, Histórico, Auditoría (3 ramas), Programación, Consolidado | `aseptiq_app.js` (bloque final §2.1) | ✅ Código |
| **N12(f)** | `'SIN LOTE'` semántico (todas las entradas sin lote caen al mismo bucket) | Medio | Deshabilitado FIFO para insumos sin lotes reales (N12b); trazabilidad limitada a "saber cuánto salió, no cuál" | `v2.5.1 §3` | ✅ Aceptado como limitación de negocio (§5.1) |
| **N12(g)** | Contraseña vieja en `localStorage`; checkbox "Recordar contraseña" engañoso | Medio | `removeItem('aseptiq_creds')` al arrancar; migración de credencial vieja; checkbox eliminado del HTML | `aseptiq_app.js` y `aseptiq.html` (bloque N12) | ✅ Código |
| **N12(h)** | `TOKEN_REFRESHED` ausente en login nuevo | Medio | Listener agregado en `onAuthStateChange` del `connectBtn` | `aseptiq_app.js` (bloque N12) | ✅ Código |
| **N12(i)** | Backup: lista de "Contenido del backup" desactualizada (14 archivos) | Bajo | Lista completa con las 21 tablas | `aseptiq_app.js` (bloque final §2.3) | ✅ Código |
| **N12(j)** | Función huérfana `registrar_lotes_entrada` | Bajo | `DROP FUNCTION IF EXISTS` documentado | `v2.5.1` (bloque final §2.4) | ⏳ Pendiente ejecutar |

---

## 5. Riesgos aceptados

Los siguientes items **no se corrigen** en esta iteración. Se documentan con justificación y se aceptan explícitamente.

### 5.1 `'SIN LOTE'` semántico en FIFO

**Descripción:** Insumos que no manejan lote real no tienen trazabilidad de "qué lote salió en qué movimiento".

**Justificación:** Decisión de negocio del usuario: *"No podemos exigir lote en la recepción de insumos, ya que no todos los insumos traen un lote."*

**Mitigación aplicada:** FIFO deshabilitado para esos insumos (`v2.5.1 §3`). El stock se descuenta directo sin recorrer lotes. Se evita stock fantasma.

**Aceptado por:** [Nombre del responsable]
**Fecha:** [Fecha]

---

### 5.2 Concurrencia en `registrar_entrega_op`

**Descripción:** FASE 1 (planificación) no toma `FOR UPDATE` sobre el stock. Si entre FASE 1 y FASE 2 otro proceso consume stock, FASE 2 falla y hace rollback.

**Justificación:** Consistencia garantizada por rollback. La UX se degrada (el usuario ve un error tras un cálculo largo) pero no hay corrupción de datos.

**Mitigación:** El error es visible y reintentable. Se puede mejorar tomando `FOR UPDATE` en FASE 1 en una próxima iteración.

**Aceptado por:** [Nombre]
**Fecha:** [Fecha]

---

### 5.3 Testing automatizado

**Descripción:** No existe suite de tests. Cada cambio requiere validación manual.

**Justificación:** Fuera de alcance de la auditoría. El smoke testing manual (§7) cubre los 22 flujos críticos.

**Riesgo:** Regresiones futuras dependen de la disciplina del equipo. Se recomienda planificar la creación de una suite con Playwright o Cypress en el próximo trimestre.

**Aceptado por:** [Nombre]
**Fecha:** [Fecha]

---

## 6. Fuera de scope (nunca estuvo en la auditoría)

Estos items no formaron parte de la auditoría original. Se documentan aquí para que el responsable de calidad decida si abrir una auditoría separada.

### 6.1 Consolidación de migraciones

`schema.sql` mezcla DDL con versiones viejas de funciones. Mitigado con header de advertencia (`schema.sql`, cabecera), pero si alguien lo corre sobre una base migrada, **restituye funciones vulnerables**.

**Decisión:** No consolidar (pedido explícito del usuario).

**Riesgo residual:** Documentado. Requiere disciplina operativa (no correr `schema.sql` sobre bases migradas).

---

### 6.2 Backup sin restauración

Existe export (ZIP con 21 CSVs) pero no import. Recuperación de backup requiere proceso manual.

**Decisión:** No incluir en esta iteración.

---

### 6.3 Auditoría de cambios de rol

Cambiar el rol de un usuario no queda registrado en `auditoria`.

**Decisión:** No incluir en esta iteración.

---

### 6.4 Rate limiting en login

Sin throttling. Fuerza bruta posible (aunque Supabase Auth tiene protección básica).

**Decisión:** Depende de la configuración de Supabase Auth (responsabilidad de infraestructura).

---

### 6.5 Logs estructurados / observabilidad

`console.log` con flag `DEBUG`. Sin observabilidad en producción.

**Decisión:** Fuera de alcance.

---

### 6.6 MFA (autenticación multifactor)

No soportado.

**Decisión:** Depende de Supabase Auth, configuración de infraestructura.

---

### 6.7 Cifrado en reposo / retención de datos

Depende de Supabase. Sin política de purga documentada.

**Decisión:** Fuera de alcance. Requiere decisión de negocio/legal.

---

### 6.8 XSS residual (~15 sitios menores)

IDs autogenerados, números, constantes. No hay datos libres del usuario.

**Decisión:** Costo/beneficio bajo. Se deja documentado.

---

## 7. Checklist de deployment

**⚠️ Este checklist debe completarse ANTES de considerar la auditoría cerrada.**

### 7.1 Migraciones SQL

- [ ] **Backup completo de la base de datos** antes de aplicar migraciones.