# AseptiQ

Sistema de gestión de inventario, producción y costos desarrollado para **Proclides Soluciones Estériles S.A.S.**

## ¿Qué resuelve?

AseptiQ administra el flujo completo de manufactura:
- **Insumos** con cadena de conversiones (compra → consumo), costo promedio ponderado y punto de reorden configurable.
- **Subproductos** intermedios y finales, con recetas propias y jerarquía anidada.
- **Paquetes terminados (PT)** compuestos por subproductos e insumos, con unidades por caja.
- **Órdenes de producción (OP)** con número y lote únicos, prioridad, fecha programada y validación de cobertura.
- **Movimientos de inventario** con trazabilidad completa: entradas, salidas, consumos, devoluciones y ajustes.
- **Análisis financiero**: kardex por insumo, costos reales vs teóricos por OP, rentabilidad por producto.

## Stack

- **Frontend**: HTML + CSS + JavaScript vanilla (sin build, sin dependencias excepto Chart.js y supabase-js por CDN).
- **Backend**: Supabase (PostgreSQL + Auth + RLS).
- **Gráficos**: Chart.js.
- **Deploy**: Vercel.

## Estructura

AseptiQ/
├── index.html # Shell de la app
├── aseptiq_app.js # Lógica de UI, red, estado
├── inventario_core.js # Lógica de negocio pura (portable a .NET)
├── migraciones/ # Scripts SQL en orden de aplicación
│ ├── schema.sql
│ ├── migracion_v04.sql
│ ├── ...
│ └── migracion_v24.sql
├── CONTRATO_API.md # Documentación del backend (tablas, RPCs, RLS)
└── CHANGELOG.md # Historial de versiones


## Roadmap

- [x] Autenticación con email/password y roles (admin / operador / consulta)
- [x] RLS activo en todas las tablas
- [x] Módulos operativos completos
- [x] Modo claro/oscuro, atajos de teclado, sidebar colapsable
- [ ] Reportes de compras por proveedor y de mermas
- [ ] Extracción de `inventario_core.js` como módulo ESM
- [ ] Port a .NET 8 (Blazor o MAUI) para uso en PC y Android