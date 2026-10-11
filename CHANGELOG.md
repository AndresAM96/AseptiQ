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

## [1.4.0] — 10 Octubre 2026

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

## [1.3.0] — 09 Octubre 2026

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