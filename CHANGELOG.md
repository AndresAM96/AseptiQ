## [2.5.1] — Octubre 2026

### Seguridad (Crítico)
- **`current_user_role()` detecta inactivos**: ahora devuelve `'inactivo'` si el usuario tiene `activo=false`. Bloquea lectura en todas las tablas de negocio.
- **`REVOKE EXECUTE … FROM PUBLIC, anon`**: cierra el bypass que tenía el intento de v2.4.1. `ALTER DEFAULT PRIVILEGES` para funciones futuras.
- **`consumir_insumo_fifo` revocada de `authenticated`**: es función interna, ningún usuario debe invocarla directo.
- **`registrar_entrada_multi_lote` delega en `registrar_entrada`**: elimina el doble conteo del trigger y respeta `factor_conversion` + costo promedio ponderado.
- **`mov_inv_sync_lotes` solo actúa con `estado_calidad='Aprobado'`**: Rechazado/Cuarentena ya no entra a stock ni a lotes.
- **`registrar_entrada` ya no inserta manualmente en `insumo_lotes`**: lo hace exclusivamente el trigger (evita duplicación).

### Integridad de inventario
- **FIFO con `p_tipo`**: `consumir_insumo_fifo` recibe `'Consumo'` o `'Salida'`; `registrar_salida` y `ajustar_inventario` lo usan en una sola pasada (elimina el `UPDATE … ORDER BY fecha DESC LIMIT 1` frágil).
- **Ajuste positivo sin duplicación**: `ajustar_inventario` delega en `registrar_entrada` cuando `diff > 0`.
- **FIFO deshabilitado para insumos sin lotes reales**: si el insumo no tiene ningún lote ≠ `'SIN LOTE'`, el consumo es directo (sin pasar por FIFO).
- **`registrar_devolucion` registra `costo_unitario_momento`** en el movimiento de salida.

### Consumo desde BOM (recursión + validación)
- **`registrar_entrega_op` recalcula desde `bom_recetas` + `paquete_subproductos`**: ya no depende de `detalle_faltantes` (snapshot).
- **`planificar_consumo_subproducto` (STABLE)**: preview recursivo sin mutar, para validar stock antes de tocar datos.
- **`consumir_subproducto_recursivo`**: auto-producción recursiva con detección de ciclos (`p_visited uuid[]`).
- **FASE 1 agrupada**: los requerimientos se acumulan por `insumo_id` antes de validar (antes se validaban uno por uno y podía pasar stock negativo).
- **Validación de stock antes de mutar**: si algún insumo no alcanza, la entrega falla con `Faltantes: [...]` y no deja estado parcial.

### Cajas con lote (trazabilidad)
- **`reservar_cajas_lote`**: reserva códigos atómicamente con `pg_advisory_xact_lock`. Formato `{PT}-C{###}-LOTE-{lote}`.
- **`siguiente_codigo_caja`**: cuenta solo los códigos del lote actual. Lote `3619` y `4000` tienen secuencias separadas.
- **`abrirModalEtiquetas`**: reserva los códigos en el backend antes de imprimir; bloquea la impresión de cajas si no hay lote.
- **`imprimirEtiquetasPT`**: usa los códigos reservados (no genera `C001` a mano).
- **`renderBodega`**: parsea formato nuevo (`PT-0001-C001-LOTE-3619`) y viejo (`PT-0001-C001`) con regex.

### Frontend (XSS, fechas, paginación)
- **`esc()` aplicado a ~40 sitios**: `toast`, notificaciones, tablas de Insumos/Productos/Proveedores/Órdenes/Novedades/Kardex/Compras/Mermas/Costos/Rentabilidad/Bodega/Programación/Evaluación/Usuarios/Cobertura/Consolidado, y formularios de edición.
- **`fechaLocalISO` en 8 lugares**: despachos, programación, consolidado, kardex, etiquetas, backup, `formatoRelativo`.
- **`apiAll` (helper de paginación)**: aplicado a Compras, Mermas, Histórico, Auditoría (3 ramas), Programación y Consolidado. Reportes con > 1000 filas ya no truncan.
- **Backup con `order` determinista**: `id` como tiebreaker en las 6 tablas que faltaban. Paginación `offset/limit` estable.
- **`_invalidateConfigCache` correcto**: invoca el de `aseptiq_core.js`. Los cambios de umbral se reflejan sin recargar.
- **`removeItem('aseptiq_creds')`**: elimina contraseña vieja de `localStorage`. Migración del JSON.
- **`TOKEN_REFRESHED`** agregado al listener de login (antes solo en sesión restaurada).

### Corregido
- **`guardar_subproducto` no pisa `existencia_actual` al editar** (bug equivalente al que se había corregido en `insumos`).
- **Toasts con `"—"`**: los RPCs devuelven `cantidad_consumo` y `cantidad_pendiente`.
- **Lista "Contenido del backup"**: agregadas las 7 tablas nuevas (`etiquetas_impresas`, `insumo_lotes`, `devoluciones_pt`, `evaluaciones_proveedores`, `despachos`, `cajas_ubicacion`, `sys_config`).

### Limpieza
- **Eliminado checkbox "Recordar mi usuario y contraseña"** del login (era engañoso desde v2.4.1).
- **`DROP FUNCTION registrar_lotes_entrada(...)`** (huérfana desde v2.5.1).
- **Header de `schema.sql`**: advertencia de no ejecutarlo sobre una base ya migrada.

### Notas de despliegue
- Aplicar `migraciones/v2.5.0_auditoria.sql` **primero**, luego `migraciones/v2.5.1_cajas_fifo_recursivo.sql`.
- Verificar con el SQL pre-flight de `AUDIT_CLOSURE.md §7.2`.
- Hacer backup pre-deploy: `pg_dump … > pre_v251.sql`.

---

## [2.5.0] — Octubre 2026

### Seguridad (Crítico)
- **`validar_escritura` en las 18 RPCs de escritura**: `confirmar_orden`, `cancelar_orden`, `guardar_subproducto`, `guardar_paquete`, `eliminar_insumo`, `ajustar_inventario`, `ajustar_subproducto`, `ajustar_costo_insumo`, `producir_subproducto`, `registrar_devolucion`, `registrar_devolucion_pt`, `registrar_despacho`, `registrar_entrada`, `registrar_salida`, `registrar_entrega_op`, `consumir_insumo_fifo`, `registrar_entrada_multi_lote`, `siguiente_codigo`. Cierra el bypass del intento de v2.4.1.
- **`SET search_path = public` en todas las `SECURITY DEFINER`**: mitiga search-path hijacking.
- **Cantidades > 0**: `registrar_salida` y `consumir_insumo_fifo` rechazan `p_cantidad <= 0` (antes subían el stock con valores negativos).
- **Policy `profiles_select` corregida**: exige rol activo. Los inactivos no leen correos ni roles.
- **Policies SELECT en las 19 tablas de negocio**: exigen `current_user_role() IN ('admin','operador','consulta')`. Bloquea a los inactivos.

### Integridad
- **`registrar_entrada_multi_lote` delega en `registrar_entrada`**: elimina el doble conteo del trigger y respeta conversión de unidades + costo promedio.
- **`consumir_insumo_fifo` con `p_tipo`**: reemplaza el `UPDATE … LIMIT 1` frágil por un parámetro explícito.
- **`ajustar_inventario` sin INSERT manual en `insumo_lotes`**: el trigger es la única fuente.
- **`registrar_entrega_op` recalcula desde BOM**: no usa el snapshot `detalle_faltantes` que se desincronizaba.

### Calidad
- **`registrar_entrada` con `p_estado_calidad`**: `Rechazado` y `Cuarentena` no suman a `existencia_actual` ni a `insumo_lotes`. Solo `Aprobado` entra al stock.
- **`mov_inv_sync_lotes` (trigger) respeta la calidad**: idem.

### Frontend
- **`esc()` en hotspots críticos**: `toast`, notificaciones, tablas de Insumos/Productos/Proveedores/Órdenes/Novedades/Kardex/Compras/Mermas/Costos/Rentabilidad/Usuarios/Cobertura, y formularios de edición.
- **`fechaLocalISO` aplicado**: despachos, programación, consolidado, kardex, etiquetas, backup.
- **`_invalidateConfigCache` correcto**: invoca el de `aseptiq_core.js`.
- **`apiAll` para paginación**: Compras, Mermas, Histórico, Auditoría (3 ramas), Programación, Consolidado.
- **Backup con `order` determinista**: `id` como tiebreaker.
- **`removeItem('aseptiq_creds')` + `TOKEN_REFRESHED` en login**: contraseña vieja eliminada, refresh de sesión correcto.

### Corregido
- **`guardar_subproducto` no pisa existencia al editar**.
- **Toasts con `"—"`**: RPCs devuelven `cantidad_consumo` y `cantidad_pendiente`.
- **Contenido del backup**: lista actualizada a 21 tablas.

### Limpieza
- **Checkbox "Recordar mi usuario y contraseña" eliminado** del HTML.
- **`DROP FUNCTION registrar_lotes_entrada(...)`** (huérfana).
- **Header de `schema.sql`**: advertencia sobre reinstalación.

---


## [2.4.2] — Octubre 2026

### Añadido
- **Lotes en Despachos**: El campo "Lote OP" en el modal de despacho ahora es un autocompletado (datalist) que sugiere los lotes que ya fueron entregados para ese Producto Terminado, evitando errores de tipeo.

### Corregido
- **Zona Horaria (Timezone)**: Se implementó la función `fechaLocalISO()` para evitar que las fechas de despacho, programación y reportes se adelanten un día después de las 7:00 PM (hora Colombia).
- **Unidades en Entrada Mercancía**: El campo de cantidad ahora aclara explícitamente en su *placeholder* que se debe ingresar en unidad de compra (ej: "Cantidad en Caja"), para evitar confusiones con la unidad de consumo.
- **Backup**: Se actualizó el texto informativo (ahora indica que el backup incluye 18 tablas, no 13).

### Limpieza
- Eliminación de código duplicado en el frontend (`calcularVencimiento` estaba definida dos veces).

## [2.4.1] — Octubre 2026

### Seguridad (Crítico)
- **RPCs protegidos**: Se revocó el acceso a `anon` y se agregó `validar_escritura()` a todas las funciones que modifican datos. Ahora es imposible saltarse la UI llamando a la API directamente si no se tiene el rol adecuado.
- **Perfiles inactivos bloqueados**: Los usuarios con `activo=false` ya no pueden leer datos (política RLS actualizada).
- **Contraseña en texto plano eliminada**: Se quitó la opción de guardar la contraseña en `localStorage`. Solo se recuerda el correo electrónico.
- **Sesión auto-renovable**: Se agregó el listener `TOKEN_REFRESHED` para evitar que la sesión se caiga a la hora sin motivo.

### Integridad de Inventario (Crítico)
- **FIFO con Costos**: La función `consumir_insumo_fifo` ahora guarda el `costo_unitario_momento` en los movimientos de salida. Esto repara los reportes de Mermas y Costos OP que estaban dando $0.
- **Entrada Multi-lote sin duplicados**: Se creó el RPC `registrar_entrada_multi_lote` que actualiza el stock y los lotes de forma atómica, eliminando el doble conteo.
- **Stock a prueba de ediciones**: El formulario de edición de insumos ya no permite modificar la existencia a mano (se bloquea el input). Solo se ajusta mediante Entradas o Auditoría.
- **Validación de Entregas**: `registrar_entrega_op` ahora verifica que no se entregue más cantidad de la pendiente y respeta el `factor_receta` en la auto-producción.
- **Bodega PT arreglada**: El `split('-')` fue reemplazado por `lastIndexOf('-')`, por lo que ahora reconoce correctamente el código del PT al escanear cajas.

### Corregido (Frontend)
- **Backup sin truncar**: Ahora pagina las consultas (offset/limit) para traer todos los registros, incluso si superan los 1000. Además, incluye las tablas nuevas.
- **Falsos positivos de "Error"**: Se corrigió la función `withLoading` que interpretaba un guardado exitoso como un error si la función no retornaba datos.
- **Consolidado MP**: Ahora filtra correctamente las OPs que caen en el rango de fechas y solo calcula sobre la cantidad pendiente (no la proyectada total).
- **Caché de umbrales**: Al cambiar los umbrales en Configuración, los colores de Urgente/Reorden en Insumos se actualizan de inmediato.
- **Trazabilidad Exacta**: La vista "¿De dónde vino?" ahora consulta los consumos reales de la OP (vía `orden_id` + `lote_insumo`), mostrando exactamente qué lote se usó, en lugar de adivinar con el stock actual.

## [2.4.0] — Octubre 2026

### Añadido
- **FIFO Estricto**: El consumo de insumos ahora descuenta de los lotes más antiguos primero. La función `consumir_insumo_fifo` maneja esto y registra en el Kardex de qué lote salió cada unidad.
- **Módulo de Despachos**: Nueva pantalla para registrar salidas de producto terminado a clientes. Incluye generación del PDF "Reporte de Entregas Diarias" con firmas del Jefe de Logística y Conductor.
- **Mapa Visual de Bodega**: Agrupación de cajas por ubicación física en el módulo de Zonificación.
- **Consolidado de MP**: Generación de PDF con los requerimientos de materias primas por semana.
- **Multi-lote en Entrada**: Capacidad de recibir un insumo dividiéndolo en varias filas con cantidades individuales por lote.
- **Formato FO-AP-04**: Generación del formato oficial de recibo de mercancía con casillas de Aprobado/Rechazado/Cuarentena.

### Cambiado
- **Rediseño de Programación Semanal**: Ajustado a 5 días hábiles (Lunes a Viernes), con soporte para OPs multi-día (Iniciar/Continuar/Terminar) y firmas de Producción, Logística y Gerencia.
- **Sidebar**: Reorganizado en Operación, Catálogo, Logística y Calidad (absorbe Análisis), y Sistema.
- **Schema.sql**: Consolidación de todas las migraciones v1.3.0 a v2.4.0 en un solo archivo para facilitar nuevas instalaciones.

### Corregido
- Fix en `registrar_entrega_op`: ahora suma correctamente el Producto Terminado al stock al finalizar una OP.
- Fix en Modal "Nueva OP" que se quedaba detrás del modal de Cobertura.
- Fix de redondeo a enteros en insumos con unidades discretas (UND, CAJA, etc.) en el cálculo de cobertura.

## [2.3.0] — Octubre 2026

### Añadido
- **Formato FO-AP-04**: Botón de impresión en el historial de entradas de mercancía para generar el documento de "Entrada de Insumos al Almacén" con casillas de calidad (Aprobado, Rechazado, Cuarentena).
- **Mapa Visual de Bodega**: Pestaña en el módulo Bodega PT que agrupa las cajas por su ubicación física (Estantes) y muestra la cantidad en tiempo real.
- **Redondeo Inteligente**: El cálculo de cobertura ahora redondea hacia arriba (Math.ceil) los insumos con unidades discretas (UND, Caja, Rollo) para evitar decimales en elementos indivisibles.
- **Campos de Calidad**: Selección de estado de calidad y observaciones directamente en el formulario de Entrada Mercancía.

### Cambiado
- **Descuento de Inventario**: Se eliminó el descuento al crear la OP. Ahora el inventario se descuenta al registrar la entrega (parcial o total).
- **Auto-producción**: Si se entrega una OP y faltan subproductos, el sistema descuenta la materia prima necesaria para fabricarlos al vuelo.
- **Recálculo de Cobertura**: El modal de detalle de la OP ahora recalcula dinámicamente el stock actual antes de mostrar los faltantes.
- **Sidebar**: Reorganización de los menús (Operación, Catálogo, Logística y Calidad, Sistema) para mejorar la usabilidad.
- **Limpieza UI**: Se eliminó el badge de alertas del menú de Insumos (la campana ya cumple esa función) y se movió el "Campo de Lote" a un lugar más accesible.

## [2.2.0] — Octubre 2026

### Añadido
- **Documentos en Entrada Mercancía**: Campos para `numero_factura`, `numero_oc`, `numero_entrada_almacen` y `cantidad_pendiente_oc`.
- **Asignación de OP en Entrada Manual**: Al producir un subproducto manualmente, se puede indicar a qué OP pertenece para trazabilidad.

### Cambiado (Breaking Change)
- **Lógica de Descuento de Inventario**: Se modificó el RPC `confirmar_orden` para que NO descuente inventario al crear la OP.
- **Consumo en Entregas**: Se modificó el RPC `registrar_entrega_op` para que descuente insumos y subproductos proporcionalmente al momento de la entrega real.
- **Producción al Vuelo**: Si al entregar una OP falta subproducto, el sistema consume los insumos directos para autogenerar ese subproducto y cumple con la entrega sin bloqueos.

## [2.1.0] — Octubre 2026

### Añadido
- **Órdenes Multi-día**: Soporte para `fecha_fin_programada` en OPs. El Kanban y el PDF ahora indican "Iniciar", "Continuar" o "Terminar" según corresponda al día.
- **Formato SGC de Proveedores**: Formulario de evaluación (CYC-GEF-FR-06) con cálculo de promedio, sugerencia de calidad y generación de PDF oficial para firmas.
- **Consolidado de MP**: Generación de PDF profesional para el reporte de faltantes por semana.
- **Programación Semanal**: Filtros rápidos (Semana anterior, actual, siguiente), restricción del calendario a Lunes-Viernes y firmas actualizadas en el PDF (Producción, Logística, Gerencia).

### Cambiado
- Se eliminó el bloqueo de creación de OPs cuando hay faltantes de stock (ahora se crean en estado Pendiente y pasan al Consolidado de Compras).
- El modal de Cobertura ahora se apila correctamente sobre el de Nueva OP.
- El prefijo "O.P." fue eliminado del PDF de programación para evitar redundancia con el código (Ej: OP-0001).

## [2.0.0] — Octubre 2026

### Añadido
- **Seguridad**: Temporizador de inactividad (30 min) y manejo automático de expiración de tokens (redirige al login).
- **Soft Delete**: Posibilidad de desactivar y activar Insumos, Subproductos y Paquetes sin borrar su historial.
- **UX Sidebar**: Configuración para elegir si el menú lateral se colapsa con botón o si se expande al pasar el mouse (Hover).
- **Análisis Logístico**:
  - Consolidado de Materias Primas (MRP) para compras.
  - Programación Semanal (Kanban de producción y entregas).
  - Evaluación de Proveedores (Tasa de devoluciones y volumen).
- **Zonificación de Bodega (PT)**: Escaneo de QR vía cámara (móvil/tablet) o pistola láser (PC) para rastrear la ubicación física de las cajas en bodega.
- **Botones compactos (Icon-only)**: Las tablas y tarjetas usan botones con íconos (con tooltips) para evitar el scroll horizontal en pantallas pequeñas.

### Corregido
- Modales de confirmación que mostraban el código SVG crudo en lugar del ícono.
- Error de persistencia al guardar configuración en backend (ahora usa UPSERT).

## [1.9.0] — Octubre 2026

### Añadido
- **Impresión directa por navegador (nativa)**: Se descartó QZ Tray/ZPL en favor de la impresión HTML/CSS con `@page`. Esto garantiza que los SVGs, logos y códigos de barras salgan con la máxima calidad y sin necesidad de drivers adicionales, siempre que la Zebra tenga configurado el tamaño de papel en Windows.

### Corregido
- Rotación y escalado incorrecto en la impresora Zebra al imprimir etiquetas.
- Tamaño físico de la etiqueta mediana (80x44mm) forzado correctamente en el CSS de impresión.
- Superposición de etiquetas de paquete y caja al imprimir en lote.

### Limpieza
- Eliminación de todo el código de QZ Tray (ZPL y conexiones websocket) que quedó obsoleto tras migrar a impresión nativa.

## [1.8.0] — Octubre 2026

### Añadido
- **Nuevo motor de etiquetas PT**:
  - 5 plantillas rediseñadas con HTML/CSS precisos (Proclides Estéril, Allmed Estéril, Allmed No Estéril, Proclides No Estéril Grande y Mediana).
  - Íconos de STERILE|EO, FAB, VENC y No Reuso rediseñados en HTML/SVG nítido.
  - Filtro automático de materiales de empaque (PGM, BOLSA, ETIQUETA, CAJA) en el listado de contenido.
  - Generación de **Etiqueta de Caja** con QR único por caja y formato idéntico al del paquete pero indicando "CAJA X N PAQUETES".
  - Lógica de fechas calculada: 3 años - 1 mes - 1 día (35 meses exactos).
- **Código de barras del cliente**:
  - Nuevo campo `codigo_barras` en el formulario de PT.
  - Generación con JsBarcode si el cliente lo provee, si no, se omite (en paquetes).
- **Modales Apilados**:
  - El motor de modales ahora soporta múltiples capas. Se puede abrir el modal de "Crear subproducto" o "Crear insumo" desde el modal de PT sin cerrar ni perder los datos del PT.
- **Trazabilidad de impresión**:
  - Nueva tabla `etiquetas_impresas` para llevar un registro histórico.
  - Modal de confirmación post-impresión: pregunta al usuario "¿Se imprimieron correctamente?" antes de registrar el conteo en la base de datos.
- **Migración v35** (implícita en el flujo): columnas `codigo_barras`, `plantilla_etiqueta`, `vida_util_meses`, `registro_invima` en `productos_terminados`.

### Cambiado
- Búsqueda en combos (autocompletar): ahora busca de forma exacta tanto por nombre como por código del ítem.
- Se eliminó el "Crear subproducto rápido" (formulario inline) en favor del modal completo.

### Corregido
- Problema donde la vida útil del producto calculaba mal la fecha de vencimiento.
- Búsqueda difusa en recetas que arrojaba coincidencias parciales (ej. buscar 0102006 traía 0102007).
- Redimensionamiento del QR en la etiqueta Mediana para que no se salga del margen físico.

## [1.7.1] — Octubre 2026

### Corregido
- **Configuración en backend no persistía correctamente**: 
  - `saveConfig` ahora usa UPSERT (`POST` + `Prefer: resolution=merge-duplicates`) en vez de PATCH.
  - Antes el PATCH podía devolver 200 sin afectar filas (RLS, fila inexistente) y la config se perdía silenciosamente.
- Migración `sys_config_upsert.sql`: agrega policy de INSERT y asegura que la fila inicial existe.
- `cargarConfig` ahora loguea en consola lo que lee del backend (útil para diagnosticar).

## [1.7.0] — Octubre 2026

### Añadido
- **Configuración centralizada en backend** (`sys_config` en Supabase):
  - Prefijos, unidades y umbrales se comparten entre dispositivos.
  - Migración automática desde localStorage en la primera carga.
  - Cache en memoria + fallback offline a localStorage.
- **Notificaciones con marcar-como-vistas**:
  - Al abrir la campana, las notificaciones actuales quedan marcadas como vistas.
  - El badge solo cuenta las **nuevas** (no vistas).
  - Hash por item incluye estado, así un insumo que pasa de Reorden a Urgente vuelve a aparecer.
  - Limpieza automática de vistos mayores a 60 días.
- **Silenciar notificaciones**:
  - Botón × en cada item para silenciar individualmente.
  - Sección "Silenciados" al final del dropdown con opción de reactivar.
- **Lotes por insumo** (`insumo_lotes`):
  - Nueva tabla con cantidad acumulada por lote y proveedor.
  - Trigger `mov_inv_sync_lotes` alimenta la tabla automáticamente al registrar entradas.
  - Backfill de lotes históricos desde `movimientos_inventario`.
  - Sección "Lotes recibidos" en el detalle de insumo.
  - RPC `registrar_lotes_entrada` para insertar múltiples lotes de una vez.
- **Modo multi-lote en Entrada mercancía**:
  - Toggle "Recibir varios lotes (uno por línea)" debajo del campo Lote.
  - Ideal para rollos que vienen con lotes distintos (Tela SMS).
  - La cantidad total se divide por igual entre los N lotes.
- **Códigos sugeridos mejorados**:
  - Formato de 4 dígitos (`0001`–`9999`).
  - Auto-select al enfocar el campo: escribir reemplaza el sugerido.
  - Validación en vivo de disponibilidad (✓ / ✕).
  - Cálculo local desde el rango existente (no depende del RPC).
- **Filtros desde notificaciones**:
  - Click en un item de la campana abre el módulo filtrado.
  - Insumos: filtro por Urgente o Reorden.
  - Cargar orden: filtro por "Pendientes +5 días".
  - Chip visible arriba del listado con botón × para quitar.
- **Header de subproductos y paquetes** con contador (`N subproductos`, `N paquetes`).
- **Footer de paginación** unificado: "Mostrando X de Y registros".

### Cambiado
- **Modales solo se cierran con ESC o botones** (click fuera ya no los cierra).
- **Toast por encima de modales** (z-index 600).
- **Campana en móvil** movida al header (ya no queda tapada por el sidebar).
- **Listados detalle**: botón "Editar" renombrado a **"Detalles"**; dentro del modal hay botón Editar.
- **Preservación de scroll** al guardar cambios en Insumos y Productos & BOM:
  - Se captura el scroll del panel específico (por `data-panel-key`).
  - Se restaura exactamente donde estaba.
  - Prioridad de `localStorage` sobre `force-collapsed` en la apertura de paneles.
- **Search-box pegada arriba** al scrollear dentro de un panel.
- **`saveConfig` es async** (guarda en backend + backup local).
- **KPIs en móvil** forzados a 1 columna con `!important`.

### Corregido
- El panel de Insumos volvía al inicio al editar y guardar.
- Los lotes de la Trazabilidad ahora muestran cantidad acumulada por lote (no solo la última entrada).
- "Ver N restantes" en notificaciones ya lleva al módulo con filtro aplicado.

### Migraciones
- `v31_sys_config.sql` — tabla singleton de configuración.
- `v32_insumo_lotes.sql` — tabla de lotes + trigger + backfill.
- `v33_registrar_lotes_entrada.sql` — RPC para insertar N lotes.

### Backlog
- Multi-lote con textboxes individuales (cantidad por lote).
- Etiquetas Zebra configurables (Fase 4 completa).
- Formato INVIMA de recibo de mercancía.
- FIFO estricto para trazabilidad exacta.

## [1.6.0] — Octubre 2026

### Añadido
- **Sistema de iconos SVG** (sprite Lucide-style, MIT):
  - 36 iconos lineales coherentes con el tema oscuro/claro.
  - Heredan color del contexto vía `currentColor`.
  - Helper `icono(nombre, size)` en JS.
  - Clases `.icon`, `.icon-sm`, `.icon-lg`, `.icon-xl`.
- **Buscador de módulos en el sidebar**:
  - Filtra items y oculta grupos sin coincidencias.
  - Mensaje "Sin resultados para..." cuando no hay match.
  - `Enter` navega al primer resultado, `Escape` limpia.
  - Botón `×` para limpiar búsqueda.
- Icono de descarga en todos los botones "Exportar CSV".

### Cambiado
- **Sidebar:** el highlight ahora marca el grupo **abierto** (no el que contiene el item activo).
- **Branding mobile:** el "AseptiQ" del header ahora es clickeable y lleva al Dashboard.
- **Modales:** el icono del header acepta HTML (SVG) además de texto.
- **Botones de creación:** "+ Nuevo" ahora muestra icono `+` en SVG; al editar cambia a lápiz.

### Eliminado
- Todos los emojis de la interfaz (campana, timeline, trazabilidad, botones, modales).

### Notas
- El sprite vive en `aseptiq.html` dentro de un `<svg class="svg-sprite">` oculto.
- Los botones con solo icono (`.icon-only`) tienen padding reducido para verse cuadrados.

## [1.5.0] — Octubre 2026

### Añadido
- **Módulo Trazabilidad** (nuevo, en el grupo Análisis):
  - Modo Forward: PT → insumos + lotes + subproductos anidados (árbol recursivo).
  - Modo Backward: insumo → PTs directos + subproductos que lo usan + PTs vía subproductos.
  - Árbol expandible con `<details>` nativo (sin JS de colapso).
  - Chips de lote verdes con lote + cantidad + proveedor.
  - Disclaimer técnico sobre aproximación (no hay FIFO estricto aún).
- **Lote del proveedor** (opcional) en Entradas de insumos:
  - Nueva columna `lote_insumo` en `movimientos_inventario`.
  - Índice parcial para queries de trazabilidad.
  - Wrapper `registrar_entrada` de 7 argumentos (compatible con el original de 6).
  - Campo visible tanto en Insumos como en Subproductos con etiqueta contextual.
- **Atajo `G` + `T`** para abrir Trazabilidad.
- **Icono SVG** en el sidebar colapsado para Trazabilidad.
- Migración `v29_trazabilidad_lotes.sql`.

### Cambiado
- Formulario Entrada mercancía: ahora usa `form-grid labels-bottom` (labels debajo de las cajas para evitar desalineación cuando los labels son largos).
- CSS: nueva clase reutilizable `.form-grid.labels-bottom`.

### Notas técnicas
- La trazabilidad por lote es **aproximada**: muestra los lotes disponibles para cada insumo, no el lote exacto consumido. La trazabilidad exacta requiere FIFO estricto con asignación de lote por consumo (roadmap futuro).
- El wrapper de `registrar_entrada` con 7 args es **retrocompatible**: Postgres resuelve por aridad, así que las llamadas de 6 args siguen funcionando.

## [1.4.0] — Octubre 2026

### Añadido
- Campana de notificaciones en el sidebar con badge inteligente:
  - Stock urgente, OPs pendientes hace +5 días, insumos en reorden, entregas últimas 24h.
  - Dropdown con secciones y cada item navega al módulo correspondiente.
  - Animación "shake" sutil cuando hay alertas críticas.
- Widget "Stock crítico del día" en el Dashboard (top 5 con barra de cobertura %).
- Timeline "Actividad reciente" en el Dashboard (últimos 15 eventos con tiempo relativo).
- Impresión profesional con iframe aislado (no contamina la vista actual):
  - **OP**: formato formal con QR de trazabilidad, tablas, 3 firmas.
  - **Kardex**: formato libro contable con saldo acumulado.
  - **Conteo físico**: formato en blanco para llenar a mano.
  - **Etiquetas QR**: 3 tamaños (pequeña/mediana/grande) con campos configurables.
- Logo institucional Proclides en todos los formatos de impresión.
- Botón "🖨 Imprimir OP" en el modal de detalle.
- Botón "🏷 Etiquetas" en Insumos y Paquetes.
- Fallback en el doughnut de "Movimientos por tipo": muestra mensaje explicativo si solo hay 1 categoría con datos.
- Tablas responsive: en móvil se convierten en tarjetas con etiquetas.
- Filtros semana / mes / año en los gráficos del Histórico.

### Cambiado
- Auditoría: botón "Imprimir / PDF" renombrado a "🖨 Imprimir informe"; ahora imprime el informe generado (no la pantalla completa).
- Impresión: espaciados compactados para evitar que las firmas queden solas en otra página.
- Conteo físico: columna "Firma" eliminada (las 3 firmas al final son suficientes).
- Configuración: slider de tema compacto con icono luna/sol en el thumb.
- KPIs en móvil: forzar 1 columna con `!important` para pisar estilos inline.

### Corregido
- Modal de nuevo proveedor desde Entrada mercancía: botón Cancelar funcionaba mal por conflicto body/footer.
- Grid de KPIs en móvil: el estilo inline rompía el responsive.
- Doughnut vacío que mostraba anillo naranja completo cuando había 1 sola categoría.

### Infraestructura
- `logo-proclides.png` agregado a la raíz del proyecto (usado por impresión).
- Librería `qrcode-generator@1.4.4` vía CDN.

## [1.3.0] — Octubre 2026

### Añadido
- Devoluciones de producto terminado (bueno / cuarentena / dañado).
- Cobertura de OP con 3 gráficos de análisis logístico (cobertura %, top consumo, faltantes).
- Modal genérico reutilizable con callbacks `onOpen` / `onClose`.
- Botón `+` con modal en Insumos, Proveedores, Productos & BOM, Auditoría (salida manual).
- Creación rápida de proveedor desde Entrada mercancía (modal completo con contactos).
- Detalle de OP y Novedades en modal con historial async.
- Toggle de tema compacto en Configuración.
- Modal de unidades de medida (agregar / renombrar / eliminar).
- Modal de umbrales de stock.
- Filtros semana / mes / año en Histórico.

### Cambiado
- Productos & BOM: estructura reorganizada (crear arriba, listas colapsadas al final).
- Insumos, Proveedores, Productos & BOM, Auditoría: formularios movidos a modales.
- Configuración: prefijos colapsados por defecto; apariencia como toggle compacto.
- Usuarios: cambio de rol con desplegable.
- Transiciones de paneles suavizadas (`ease-out` + fade coordinado).
- Histórico: gráficos Consumo y Top 10 colapsados; Resumen expandido.

### Corregido
- Botón "Cancelar" del modal de nuevo proveedor desde Entrada mercancía.
- Animación de cierre de modales sincronizada con `_cerrarOverlay`.