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