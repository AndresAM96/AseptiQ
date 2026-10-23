# AseptiQ

Sistema de gestión de inventario, producción y costos desarrollado para **Proclides Soluciones Estériles S.A.S.**

## Estado

**v2.0.0** — Producción · Octubre 2026

## ¿Qué resuelve?

AseptiQ administra el flujo completo de manufactura:

- **Insumos** con cadena de conversiones (compra → consumo), costo promedio ponderado y stock objetivo.
- **Subproductos** intermedios y finales, con recetas propias y jerarquía anidada.
- **Paquetes terminados (PT)** compuestos por subproductos e insumos, con unidades por caja y precio de venta.
- **Órdenes de producción (OP)** con número y lote únicos, prioridad cualitativa y **entregas parciales**.
- **Movimientos de inventario** con trazabilidad completa: entradas, salidas, consumos, devoluciones y ajustes.
- **Devoluciones** a proveedor (insumos) y de cliente (producto terminado), con estados bueno / cuarentena / dañado.
- **Análisis financiero**: kardex por insumo, costos reales vs teóricos por OP, rentabilidad por producto.
- **Reportes operativos**: compras por proveedor, mermas y ajustes.
- **Backup** completo a un ZIP con 13 tablas en CSV.
- **Interfaz basada en modales** con botón `+` en cada listado, análisis gráfico logístico en la cobertura de OP, y modo claro/oscuro.
- **Sistema de iconos SVG** (sprite Lucide-style) en toda la app — sin emojis.
- **Buscador de módulos en el sidebar** (Enter navega, Escape limpia).
- **Configuración centralizada en el backend** (`sys_config`) — prefijos, unidades y umbrales se comparten entre dispositivos.
- **Notificaciones inteligentes** con marcar-como-vistas y silenciar items individuales.
- **Lotes por insumo** (`insumo_lotes`) con soporte de multi-lote en una sola entrada (útil para rollos que vienen con lotes distintos).
- **Códigos sugeridos inteligentes**: auto-select al enfocar, formato de 4 dígitos (`####`), validación en vivo de disponibilidad.
- **Filtros desde notificaciones**: click en un item abre el módulo filtrado (Urgente, Reorden, Pendientes +5d).
- **Detalle de insumo** con historial de lotes recibidos.
- **Campana de notificaciones** en el sidebar con stock crítico, OPs vencidas y entregas recientes.
- **Dashboard operativo** con widget de stock crítico, timeline de actividad y KPIs visuales.
- **Impresión profesional**: OP con QR + firmas, kardex formato libro, conteo físico, y etiquetas QR configurables (pequeña/mediana/grande).
- **Responsive total**: tablas se convierten en tarjetas en móvil.
- **Trazabilidad de lotes end-to-end**: análisis bidireccional PT → insumos + lotes, e insumo → PTs afectados.
- **Motor de impresión de etiquetas**: 5 plantillas configurables (Proclides/Allmed, Estéril/No Estéril, Grande/Mediana), código de barras del cliente, QR interno de caja y registro de impresiones. Impresión 100% nativa desde el navegador compatible con impresoras Zebra (vía driver de Windows).
- **Zonificación de Bodega (PT)**: Escaneo de QRs con cámara (móvil/tablet) o pistola láser (PC) para asignar ubicaciones físicas.
- **Módulo de Analítica Logística**: Consolidado de Materias Primas (MRP), Programación Semanal (Kanban) y Evaluación de Proveedores.
- **Seguridad y UX**: Temporizador de inactividad (cierre de sesión a los 30 min), desactivación de ítems en lugar de borrado (Soft Delete) y menú lateral configurable (Hover o Clic).
- **Modales apilados**: se pueden abrir modales dentro de otros modales sin perder los datos (ej. crear un subproducto mientras se edita un PT).
- **Gestión de PT mejorada**: código de barras, plantilla, vida útil y registro INVIMA directo en el formulario.
- **Lote del proveedor** en entradas de insumos (opcional) para trazabilidad INVIMA.

## Stack

- **Frontend**: HTML + CSS + JavaScript vanilla (sin build step).
- **Backend**: Supabase (PostgreSQL + Auth + RLS + REST).
- **Gráficos**: Chart.js 4.
- **Compresión ZIP**: JSZip.
- **Deploy**: Vercel (automático desde GitHub).

## Estructura del repositorio

```
AseptiQ/
├── index.html              # Shell de la app + estilos
├── aseptiq_app.js          # Lógica de UI, red, estado
├── aseptiq_core.js         # Lógica de negocio pura (portable a .NET)
├── logo-proclides.png      # Logo institucional (impresión)
├── schema.sql              # Esquema completo del backend (único archivo)
├── migraciones/            # Historial de migraciones (solo referencia)
├── CONTRATO_API.md         # Documentación del backend
├── MANUAL.md               # Manual de usuario
├── SETUP.md                # Guía de instalación
├── PORT_DOTNET.md          # Plan de port a .NET
├── CHANGELOG.md            # Historial de versiones
├── .gitignore
└── README.md
```

## Instalación

Ver [`SETUP.md`](SETUP.md).

Resumen rápido:

1. Crear proyecto en Supabase.
2. Correr `schema.sql` en el SQL Editor.
3. Crear el primer usuario en Authentication → Users → Add user.
4. Promover ese usuario a admin con un `UPDATE`.
5. Clonar el repo, abrir `index.html`, ingresar credenciales.

## Módulos

| Grupo | Módulo | Descripción |
|---|---|---|
| Operación | Dashboard | KPIs y valorización |
| Operación | Cargar orden | Crear OP, calcular cobertura, entregas parciales |
| Operación | Novedades | OP activas con progreso |
| Operación | Entrada mercancía | Insumos (compra) y subproductos (producción) |
| Operación | Devoluciones | A proveedor (insumos) y de cliente (PT) |
| Catálogo | Insumos | Materia prima con conversiones |
| Catálogo | Productos & BOM | Subproductos y paquetes |
| Catálogo | Proveedores | Maestro de proveedores |
| Análisis | Auditoría | Informes y conteo físico |
| Análisis | Kardex | Historial por insumo |
| Análisis | Compras | Compras por proveedor |
| Análisis | Mermas | Pérdidas y ajustes |
| Análisis | Histórico | Gráficos de tendencias |
| Análisis | Costos OP | Teórico vs real |
| Análisis | Rentabilidad | Margen por producto |
| Análisis | Trazabilidad | Lotes end-to-end (forward / backward) |
| Sistema | Configuración | Prefijos, unidades, umbrales |
| Sistema | Backup | Exportación de datos |
| Sistema | Usuarios | Gestión de roles |

## Roles

| Rol | Descripción |
|---|---|
| **Admin** | Acceso total. Gestiona usuarios. Genera backups. |
| **Operador** | CRUD de catálogo y operación. No accede a Usuarios. |
| **Consulta** | Solo lectura, exportación e impresión. |

## Roadmap

- [x] Autenticación con Supabase Auth
- [x] RLS por rol
- [x] Todos los módulos operativos
- [x] Entregas parciales de OP
- [x] Prioridad cualitativa
- [x] Reportes de compras, mermas y costos
- [x] Backup exportable
- [x] Responsive (tablet + móvil)
- [x] Modo claro/oscuro
- [x] Modales genéricos + botón "+" en cada listado
- [x] Cobertura de OP con análisis gráfico logístico
- [x] Devoluciones de producto terminado
- [x] Campana de notificaciones + Dashboard operativo
- [x] Impresión profesional (OP, kardex, conteo, etiquetas QR)
- [x] Responsive mobile (tablas → tarjetas)
- [x] Trazabilidad de lotes end-to-end (aproximada)
- [x] Sistema de iconos SVG (sprite Lucide-style) en toda la app — sin emojis.
- [x] Buscador de módulos en el sidebar (Enter navega, Escape limpia).
- [x] Configuración en backend + notificaciones con vistas/silenciar
- [x] Lotes por insumo (agregado, sin FIFO)
- [x] Códigos sugeridos con auto-select y formato de 4 dígitos
- [ ] FIFO estricto con asignación de lote por consumo
- [ ] Formato INVIMA de recibo de mercancía
- [ ] Port a .NET (Blazor / MAUI)

## Documentación

- [`MANUAL.md`](MANUAL.md) — Guía de uso para el equipo.
- [`SETUP.md`](SETUP.md) — Instalación desde cero.
- [`CONTRATO_API.md`](CONTRATO_API.md) — Backend: tablas, RPCs, RLS.
- [`PORT_DOTNET.md`](PORT_DOTNET.md) — Plan de port a .NET.
- [`CHANGELOG.md`](CHANGELOG.md) — Historial de versiones.

## Licencia

Propietario. © Proclides Soluciones Estériles S.A.S.