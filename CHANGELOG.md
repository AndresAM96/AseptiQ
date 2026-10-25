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