# AseptiQ · Plan de port a .NET

**Versión del documento:** 1.0
**Fecha:** Octubre 2026
**Estado:** Planificación
**App origen:** AseptiQ v1.0 (web)

---

## Índice

1. [Alcance y objetivos](#1-alcance-y-objetivos)
2. [Decisiones arquitectónicas](#2-decisiones-arquitectónicas)
3. [Mapa de navegación](#3-mapa-de-navegación)
4. [Pantallas: análisis una por una](#4-pantallas-análisis-una-por-una)
5. [Componentes compartidos](#5-componentes-compartidos)
6. [Qué se reescribe, qué se reutiliza](#6-qué-se-reescribe-qué-se-reutiliza)
7. [Consideraciones especiales](#7-consideraciones-especiales)
8. [Plan de ejecución por fases](#8-plan-de-ejecución-por-fases)
9. [Fuera de alcance de la v1.0 del port](#9-fuera-de-alcance-de-la-v10-del-port)

---

## 1. Alcance y objetivos

**Objetivo:** portar AseptiQ v1.0 (aplicación web con vanilla JS + Supabase) a una aplicación .NET que funcione en:

- **PC (Windows)** para la oficina y administración.
- **Android** para la operación en bodega.

**Alcance de la v1.0 del port:** paridad funcional con la web. Ninguna funcionalidad nueva. Cualquier mejora que surja durante el port se anota para la v1.1.

**Criterio de éxito:** la app .NET debe permitir hacer todo lo que hoy se hace en la web, con la misma base de datos Supabase, sin tocar el backend.

---

## 2. Decisiones arquitectónicas

### 2.1 Framework: Blazor vs MAUI

| Criterio | Blazor (WebAssembly o Hybrid) | MAUI (nativo) |
|---|---|---|
| Reutilización de Chart.js | ✅ Vía JSInterop directo | ❌ Requiere LiveCharts2 |
| Reutilización de HTML/CSS | ✅ Alto | ❌ Requiere XAML |
| Performance en Android | ⚠️ Aceptable, no nativo | ✅ Nativo |
| Curva de aprendizaje | Baja si ya sabés web | Media |
| Publicación en Play Store | ✅ Con Blazor Hybrid | ✅ Nativo |
| Instalación en PC | ✅ Como PWA o WebView | ✅ Como instalador .exe |
| Acceso a hardware (cámara, etc.) | ✅ Con plugins | ✅ Nativo |

**Recomendación inicial:** **.NET MAUI Blazor Hybrid**.

Razón: combina lo mejor de ambos. La UI se escribe en Razor (HTML+CSS reusables desde la web) y el contenedor es nativo (MAUI). Chart.js funciona vía WebView local. La lógica de negocio va en C# compartido con la web.

Alternativa: **Blazor WebAssembly + PWA**. Más fácil de arrancar, pero menos nativo en Android.

### 2.2 Backend

**Sin cambios.** Se sigue usando el mismo proyecto Supabase.

- Tablas idénticas.
- RPCs idénticas.
- Políticas RLS idénticas.
- Auth idéntico.

La app .NET se conecta al mismo backend. Si web y .NET operan a la vez, comparten datos en tiempo real.

### 2.3 Cliente de Supabase para .NET

**Paquete:** `Supabase` (NuGet oficial).

- `Supabase.Client` — cliente HTTP.
- `Supabase.Gotrue` — auth.
- `Supabase.Postgrest` — queries REST.
- `Supabase.Storage` — si algún día subimos archivos.

**Alternativa:** `Npgsql` + `Dapper` para conexión directa a Postgres.

- ✅ Más rápido para queries complejas.
- ❌ No pasa por RLS (usa credenciales de service_role).
- ❌ No valida JWT del usuario.

**Recomendación:** usar `Supabase.Client` (HTTP REST + JWT). Mantiene RLS activo sin cambios.

### 2.4 Persistencia local

- **Sesión:** el `Supabase.Client` guarda el JWT automáticamente en almacenamiento seguro.
- **Config del usuario:** guardar en `Preferences` de MAUI (equivalente al `localStorage` de la web).
- **Datos offline:** para v1.0, no. Se deja para v1.1 con sincronización.

### 2.5 Lógica de negocio

**Reutilizable desde `aseptiq_core.js`.** Toda función pura se traduce 1:1 a C#:

- `calcularCostos` → `CostosCalculator.Calcular()`.
- `estadoInsumo` → `InsumoEstado.Calcular()`.
- `formatearExistencia` → `Formatters.Existencia()`.
- `calcularCobertura` → `CoberturaCalculator.Calcular()`.

Esa capa va en un proyecto separado (`AseptiQ.Core`) compartido entre Blazor y MAUI.

### 2.6 Formateo

- **Moneda:** `value.ToString("C", new CultureInfo("es-CO"))`.
- **Números:** `value.ToString("N2", new CultureInfo("es-CO"))`.
- **Fechas:** `value.ToString("dd/MM/yyyy")`.
- **CSV:** usar `CsvHelper` de NuGet, con `;` como separador y BOM UTF-8.

---

## 3. Mapa de navegación

El port debe mantener la misma estructura de navegación. En MAUI Blazor Hybrid se implementa con un `Shell` con `Flyout` lateral.

```
┌─────────────────────────────────────┐
│ AseptiQ v1.0                        │
├─────────────────────────────────────┤
│ ▼ OPERACIÓN                         │
│   · Dashboard                       │
│   · Cargar orden                    │
│   · Novedades                       │
│   · Entrada mercancía               │
│   · Devoluciones                    │
│                                     │
│ ▶ CATÁLOGO                          │
│   · Insumos                         │
│   · Productos & BOM                 │
│   · Proveedores                     │
│                                     │
│ ▶ ANÁLISIS                          │
│   · Auditoría                       │
│   · Kardex                          │
│   · Compras                         │
│   · Mermas                          │
│   · Histórico                       │
│   · Costos OP                       │
│   · Rentabilidad                    │
│                                     │
│ ▶ SISTEMA                           │
│   · Configuración                   │
│   · Usuarios (solo admin)           │
└─────────────────────────────────────┘
```

**Equivalente MAUI:**

- `AppShell.xaml` con `FlyoutItem` por módulo.
- Un `ShellContent` con `ContentTemplate` apuntando al componente Razor correspondiente.

**Equivalente Blazor WASM:**

- `MainLayout.razor` con `NavMenu.razor` reusando la estructura del sidebar.

---

## 4. Pantallas: análisis una por una

Para cada pantalla: estado, decisión de port y notas.

### 4.1 Pantalla de conexión (Login)

**Estado actual:**
- URL Supabase + anon key + email + password.
- Recordar URL/key (checkbox).
- Recordar credenciales de usuario (checkbox con advertencia).
- Loader en el botón Conectar.
- Persistencia de sesión.
- Recuperación automática al reabrir.

**Decisión de port:** **Portar tal cual.**

**Notas .NET:**
- Cambiar `localStorage` por `Preferences.Default` de MAUI.
- La sesión persistente la maneja `Supabase.Client` con `SecureStorage`.
- La URL y la anon key pueden **hardcodearse** en el port (ya no es un usuario final el que las ingresa).
- Rediseñar el checkbox de "recordar URL y key" — en .NET no aplica porque van embebidas.

**Mejora sugerida:** agregar "Olvidé mi contraseña" (envía email). Requiere activar esa feature en Supabase Auth.

---

### 4.2 Dashboard

**Estado actual:**
- Banner de alerta si hay insumos urgentes/reorden.
- 4 tarjetas de KPIs de insumos.
- 2 tarjetas de subproductos.
- 2 tarjetas de PT.
- 4 tarjetas de valorización.
- 3 tablas: insumos, subproductos, PT en inventario.
- Búsqueda y sort por columna.
- Botón refresh.

**Decisión de port:** **Portar tal cual.**

**Notas .NET:**
- Todos los cálculos se hacen en C# (nada de JS).
- Las 3 tablas usan un `DataGrid` con sorting nativo.
- Considerar paginación real (server-side) si la tabla crece.

---

### 4.3 Cargar orden

**Estado actual:**
- Formulario de Nueva OP (número, lote, producto, cantidad, prioridad, fecha programada).
- Preview en vivo de cajas según unidades por caja del PT.
- Validación en vivo de número y lote únicos.
- Cálculo de cobertura.
- Confirmación de orden.
- Lista de órdenes activas con progreso de entrega.
- Modal de entrega parcial.
- Detalle de orden con historial de entregas.
- Filtro de "mostrar terminadas/canceladas".
- Exportar CSV.

**Decisión de port:** **Portar tal cual** con las siguientes mejoras:

- El cálculo de cobertura debe ser un método async en C# puro.
- El modal de entrega se puede hacer con `Modal` de MAUI (más nativo que overlay web).

**Notas .NET:**
- El formulario es el más complejo de la app. Requiere validación cruzada.
- El sort de la tabla de órdenes necesita un `DataGrid` configurable.
- El badge de prioridad (Muy alta/Alta/Normal/Baja) es un componente reusable.

---

### 4.4 Novedades

**Estado actual:**
- Lista de órdenes activas con progreso.
- Drill-down al detalle (reusa `mostrarDetalleOrden`).
- Búsqueda.

**Decisión de port:** **Portar tal cual.**

**Notas .NET:**
- Es prácticamente una vista filtrada de Cargar orden. Considerar unificarla con ese módulo como una pestaña.

---

### 4.5 Insumos

**Estado actual:**
- Formulario de Nuevo insumo / Editar insumo.
- Cadena de conversiones (con niveles ilimitados).
- Editor de fórmula dimensional (ancho × largo).
- Lista con búsqueda, sort, paginación.
- Click en costo para ajustar (con trazabilidad).
- Exportar CSV.

**Decisión de port:** **Portar tal cual.**

**Notas .NET:**
- La cadena de conversiones es la UI más elaborada. Considerar un `CollectionView` con template de nivel.
- El editor de fórmula dimensional necesita inputs numéricos y un label calculado.
- El ajuste de costo usa dos prompts secuenciales → en .NET usar un modal de dos pasos.

---

### 4.6 Productos & BOM

**Estado actual:**
- Formulario de Nuevo subproducto / Editar (con tipo, existencia, receta, hijos).
- Formulario de Nuevo PT / Editar (con unidades por caja, precio, subproductos, insumos).
- Creación inline de insumos y subproductos.
- Listas de subproductos y PT con costos calculados.
- Exportar CSV.

**Decisión de port:** **Portar tal cual.**

**Notas .NET:**
- Es la pantalla más densa. Considerar dividirla en dos pantallas separadas (Subproductos y Paquetes) para mejor UX.
- Las listas usan combo con búsqueda (datalist). En MAUI usar `AutoComplete` o `SearchHandler`.
- Los cálculos de costo consumen `costos_todos` RPC o se calculan en C# puro.

---

### 4.7 Entrada mercancía

**Estado actual:**
- Selector de tipo (Insumo / Subproducto).
- Formulario con campos condicionales.
- Preview en vivo del equivalente en unidad de consumo.
- Modo "proveedor nuevo" inline.
- Lista de últimas 30 entradas.

**Decisión de port:** **Portar tal cual.**

**Notas .NET:**
- El preview en vivo se hace con `INotifyPropertyChanged` o `@bind` de Blazor.
- La lista de entradas recientes necesita paginación si crece.

---

### 4.8 Devoluciones

**Estado actual:**
- Formulario con insumo, cantidad, proveedor, motivo.
- Preview en vivo del impacto en stock.
- Lista de últimas devoluciones.

**Decisión de port:** **Portar tal cual.**

**Notas .NET:** ninguna particular.

---

### 4.9 Proveedores

**Estado actual:**
- Formulario con NIT, razón social, dirección.
- Contactos dinámicos (múltiples).
- Lista con búsqueda, sort.

**Decisión de port:** **Portar tal cual.**

**Notas .NET:**
- La lista de contactos se modela como `ObservableCollection<Contacto>`.
- Validación de NIT único: chequeo pre-POST o capturar el error.

---

### 4.10 Auditoría

**Estado actual:**
- Registrar salida manual.
- Generador de informes con 4 tipos:
  - Movimientos de insumos.
  - Movimientos de subproductos.
  - Ajustes de costo.
  - Existencias (conteo físico).
- Filtros rápidos de fecha.
- Conteo físico con input en línea y diferencia en vivo.
- Botón "Aplicar ajustes".
- Exportar CSV, Imprimir/PDF.

**Decisión de port:** **Portar con rediseño parcial.**

Razón: la pantalla tiene demasiadas responsabilidades. En .NET conviene dividirla:

- **Auditoría → Movimientos**: informes de movimientos.
- **Auditoría → Ajustes de costo**: informe de ajustes.
- **Inventario físico**: pantalla dedicada al conteo.

**Notas .NET:**
- El conteo físico necesita un control con `Entry` numérico por fila. En MAUI usar `CollectionView` con template.
- "Aplicar ajustes" puede ser una operación en background con progress bar.
- Imprimir en Android es distinto (usar `Microsoft.Maui.Graphics` o generar PDF).

---

### 4.11 Kardex

**Estado actual:**
- Selector de insumo.
- Filtros de fecha y tipo.
- Rangos rápidos.
- Tabla con saldo corrido.
- 4 KPIs.
- Exportar CSV, Imprimir/PDF.

**Decisión de port:** **Portar tal cual.**

**Notas .NET:**
- La tabla puede tener miles de filas (fetchAllMovsInsumo pagina de 1000). Mantener esa estrategia.
- Considerar virtualización de la lista para performance.

---

### 4.12 Compras por proveedor

**Estado actual:**
- Filtros con rangos rápidos.
- 4 KPIs.
- Panel de "Proveedor principal".
- Tabla resumen por proveedor.
- Drill-down al detalle.
- Exportar CSV, Imprimir/PDF.

**Decisión de port:** **Portar tal cual.**

**Notas .NET:**
- El drill-down se puede hacer con navegación a una sub-pantalla.
- Si se hace muy grande, considerar exportar a Excel en vez de CSV.

---

### 4.13 Mermas y ajustes

**Estado actual:**
- Análoga a Compras pero del lado de las pérdidas.
- Clasificación automática de motivos.
- Drill-down por insumo.

**Decisión de port:** **Portar tal cual.**

**Notas .NET:** ninguna particular.

---

### 4.14 Histórico

**Estado actual:**
- 4 gráficos con Chart.js:
  - Órdenes por mes (barras dobles).
  - Movimientos por tipo (dona).
  - Consumo mensual top 5 (líneas).
  - Top 10 insumos por valor (barras horizontales).

**Decisión de port:** **Rediseñar.**

**Opciones:**

| Opción | Pros | Cons |
|---|---|---|
| Mantener Chart.js vía WebView | ✅ Mismos gráficos, cero código nuevo | ⚠️ El WebView consume recursos |
| LiveCharts2 | ✅ Nativo, integración C# | ⚠️ Curva de aprendizaje, ~1 semana |
| Syncfusion Charts | ✅ Muy completo | ❌ Licencia de pago |

**Recomendación:** **LiveCharts2** para MAUI. La Capa 1 (`calcConsumoMensualPorInsumo`, etc.) se traduce a C# y alimenta los `Series` de LiveCharts.

---

### 4.15 Costos OP

**Estado actual:**
- Lista de OPs terminadas.
- Comparativo teórico vs. real.
- Gráfico de barras dobles.
- Tabla de desglose por insumo.

**Decisión de port:** **Portar tal cual** (con LiveCharts2).

**Notas .NET:**
- El cálculo de teórico y real son puros. Fácil de traducir.
- El gráfico comparativo usa el mismo patrón que Histórico.

---

### 4.16 Rentabilidad

**Estado actual:**
- KPIs de margen.
- Gráfico horizontal de margen por producto.
- Tabla detallada.
- Aviso de PT sin precio.

**Decisión de port:** **Portar tal cual.**

**Notas .NET:** ninguna particular.

---

### 4.17 Usuarios

**Estado actual:**
- Lista de usuarios.
- Cambiar rol (dropdown).
- Activar / Desactivar.
- Solo admin.

**Decisión de port:** **Portar tal cual.**

**Notas .NET:**
- La creación de usuarios sigue siendo por Supabase dashboard. En v1.0 del port no se hace in-app.
- Considerar para v1.1: crear usuarios desde la app (requiere backend con service_role).

---

### 4.18 Configuración

**Estado actual:**
- Tema (claro/oscuro).
- Prefijos de códigos.
- Unidades de medida.
- Umbrales de stock.

**Decisión de port:** **Portar con cambios.**

**Notas .NET:**
- El tema se maneja con MAUI `Application.Current.UserAppTheme`. No hay "modo web".
- Los prefijos y umbrales van en `Preferences`.
- Las unidades de medida se pueden guardar en una tabla nueva de Supabase para que sean compartidas (hoy están por navegador — un problema cuando alguien usa dos dispositivos).

**Mejora sugerida para el port:** mover config a Supabase para que sea global.

---

## 5. Componentes compartidos

Estos componentes se usan en varias pantallas. Deben ser **reutilizables** desde el inicio del port.

| Componente | Descripción | Pantallas que lo usan |
|---|---|---|
| `PanelCard` | Panel con header, acciones y toggle colapsable | Todas |
| `DataTable` | Tabla con sort, búsqueda, paginación, scroll | Todas |
| `BadgeEstado` | Badge de color (Cubierto/Reorden/Urgente) | Dashboard, Insumos, OP |
| `BadgePrioridad` | Badge (Muy alta/Alta/Normal/Baja) | Cargar orden, Novedades |
| `BadgeOP` | Badge de estado de OP | Cargar orden, Novedades |
| `ModalConfirmacion` | Modal de confirmación con icono y mensaje | Todas |
| `ModalPrompt` | Modal con input de texto | Varias |
| `Toast` | Notificación flotante | Todas |
| `Loader` | Overlay de carga | Todas |
| `SearchBox` | Input de búsqueda con debounce | Todas |
| `ComboSearch` | Combo con búsqueda (datalist) | Productos, BOM, Proveedores |
| `MoneyInput` | Input de dinero formateado | Insumos, PT |
| `NumberInput` | Input numérico con decimales | Múltiples |
| `DynRow` | Fila dinámica con botón × | Recetas, contactos |
| `Money` | Texto formateado como COP | Todas |

---

## 6. Qué se reescribe, qué se reutiliza

### Se reescribe por completo

- Toda la capa de UI (HTML → XAML/Razor).
- Toda la capa de red (fetch → Supabase.Client).
- El sistema de modales y toasts.
- Chart.js → LiveCharts2 (o WebView).

### Se traduce 1:1 a C#

- `aseptiq_core.js` (formateo, cálculos, agrupaciones).
- Toda la lógica de estados de insumo.
- Los cálculos de cobertura y rentabilidad.

### Se reutiliza sin cambios

- La base de datos Supabase.
- Las RPCs.
- Las políticas RLS.
- Los scripts SQL.

### Se descarta

- La pantalla de login actual (en el port, URL y key van embebidas).
- El guardado de credenciales en localStorage.
- La lógica de `localStorage` en general (reemplazado por `Preferences`).

---

## 7. Consideraciones especiales

### 7.1 Autenticación

- El port usa Supabase Auth igual que la web.
- El JWT se guarda con `SecureStorage`.
- La sesión persiste entre reinicios.
- Al abrir la app, si hay JWT válido, entra directo.

### 7.2 RLS

- Sigue activo.
- No tocar políticas.
- La app usa la anon key + JWT del usuario.
- **Nunca** embeber la service_role key en el port.

### 7.3 Impresión en Android

- No hay "imprimir" nativo como en desktop.
- Opciones:
  - Generar PDF en memoria y compartirlo.
  - Usar `Microsoft.Maui.Graphics` para dibujar y exportar.
  - Plugin: `PdfSharpCore` para generar PDFs.

**Recomendación:** generar el PDF y ofrecer "Compartir" vía `Share.Default.RequestAsync()`.

### 7.4 Exportar CSV

- Usar `CsvHelper` para generar.
- Guardar en `FileSystem.CacheDirectory`.
- Compartir con `Share.Default.RequestAsync()`.

### 7.5 Fechas y zonas horarias

- Postgres guarda todo en UTC.
- Mostrar en zona local del dispositivo.
- En C# usar `DateTimeOffset` para timestamps.

### 7.6 Concurrencia

- Web y .NET pueden operar simultáneamente sobre el mismo backend.
- Supabase maneja la concurrencia por transacciones.
- No hace falta locks adicionales.

### 7.7 Cache

- Las listas grandes se pueden cachear en memoria con `MemoryCache`.
- Invalidar al hacer cambios.
- No es prioridad para v1.0.

---

## 8. Plan de ejecución por fases

### Fase 1 — Fundaciones (2 semanas)

- Crear solución .NET con proyectos: `AseptiQ.Core`, `AseptiQ.Data`, `AseptiQ.App`.
- Traducir `aseptiq_core.js` a C# (tests unitarios).
- Implementar cliente Supabase.
- Implementar auth con persistencia.
- Implementar componentes base (Panel, Table, Badge, Modal, Toast).

### Fase 2 — Módulos operativos (3 semanas)

Prioridad por impacto:

- Insumos.
- Productos & BOM.
- Cargar orden + entregas parciales.
- Entrada mercancía.
- Dashboard.
- Novedades.

### Fase 3 — Módulos de catálogo y análisis (2 semanas)

- Proveedores.
- Devoluciones.
- Auditoría + conteo físico.
- Kardex.

### Fase 4 — Reportes (2 semanas)

- Compras.
- Mermas.
- Costos OP.
- Rentabilidad.
- Histórico (con LiveCharts2).

### Fase 5 — Sistema y cierre (1 semana)

- Usuarios.
- Configuración.
- Pulido.
- Publicación en Play Store (interno) y .exe para PC.

**Total estimado:** 10 semanas de desarrollo a tiempo completo.

**Nota:** si el desarrollo es a tiempo parcial (noches, fines de semana), multiplicar por 3-4.

---

## 9. Fuera de alcance de la v1.0 del port

Estas features están en el radar pero **no** se implementan en la v1.0 del port. Se anotan para futuras versiones.

### 9.1 Sincronización offline

- Permitir trabajar sin conexión y sincronizar al reconectar.
- Requiere SQLite local + lógica de merge.
- Complejo, para v1.2+.

### 9.2 Escaneo de códigos de barras / QR

- Para insumos y lotes.
- Usar `ZXing.Net.Maui`.
- Muy útil para bodega con el celular.

### 9.3 Fotos adjuntas a movimientos

- Foto de la mercancía recibida, del daño, etc.
- Requiere Supabase Storage.

### 9.4 Notificaciones push

- Avisos cuando hay insumos urgentes.
- Requiere un backend de notificaciones.

### 9.5 Módulo de ventas

- Hoy no existe. Registro de salidas hacia clientes.
- Análisis de rentabilidad real (no solo teórica).

### 9.6 Módulo de calidad

- Registro de no conformidades.
- Trazabilidad por lote hacia atrás.

### 9.7 Multi-empresa / multi-bodega

- Si Proclides crece.
- Requiere reestructurar RLS.

### 9.8 Reportes programados

- Enviar por email semanalmente.
- Requiere un job scheduler en el backend.

---

## Apéndices

### A — Comandos útiles para empezar el port

```bash
# Crear la solución
dotnet new sln -n AseptiQ

# Crear los proyectos
dotnet new classlib -n AseptiQ.Core -f net8.0
dotnet new classlib -n AseptiQ.Data -f net8.0
dotnet new maui-blazor -n AseptiQ.App -f net8.0

# Agregar al sln
dotnet sln add AseptiQ.Core/AseptiQ.Core.csproj
dotnet sln add AseptiQ.Data/AseptiQ.Data.csproj
dotnet sln add AseptiQ.App/AseptiQ.App.csproj

# Referencias entre proyectos
dotnet add AseptiQ.Data reference AseptiQ.Core
dotnet add AseptiQ.App reference AseptiQ.Data

# NuGet
dotnet add AseptiQ.Data package Supabase
dotnet add AseptiQ.App package LiveChartsCore.SkiaSharpView.Maui
dotnet add AseptiQ.Core package CsvHelper
```

### B — Estructura de carpetas sugerida

```
AseptiQ/
├── AseptiQ.sln
├── AseptiQ.Core/
│   ├── Models/         (Insumo, Subproducto, ProductoTerminado, OP, ...)
│   ├── Services/       (calcularCostos, calcularCobertura, ...)
│   ├── Formatters/     (money, num, fecha, CSV)
│   └── Enums/          (TipoConversion, EstadoOP, PrioridadOP, ...)
├── AseptiQ.Data/
│   ├── SupabaseClient.cs
│   ├── Repositories/
│   └── DTOs/
├── AseptiQ.App/
│   ├── Components/     (Panel, Table, Badge, Modal, Toast)
│   ├── Pages/          (una por módulo)
│   ├── Layout/         (MainLayout, NavMenu)
│   └── Resources/      (iconos, fuentes, temas)
└── AseptiQ.Tests/
    └── Core/           (tests de la lógica pura)
```

### C — Checklist de paridad

Antes de declarar el port v1.0, verificar que **todos** estos flujos funcionan:

- [ ] Login y persistencia de sesión.
- [ ] Dashboard carga y muestra los KPIs.
- [ ] Crear, editar, eliminar insumo.
- [ ] Cadena de conversiones simple, dimensional y variable.
- [ ] Crear subproducto con receta.
- [ ] Crear paquete con BOM.
- [ ] Cargar OP y calcular cobertura.
- [ ] Confirmar OP.
- [ ] Registrar entrega parcial.
- [ ] Cerrar OP con la última entrega.
- [ ] Registrar entrada de mercancía (insumo y subproducto).
- [ ] Registrar devolución a proveedor.
- [ ] Registrar salida manual.
- [ ] Hacer conteo físico y aplicar ajustes.
- [ ] Ajustar costo manualmente.
- [ ] Generar kardex de un insumo.
- [ ] Generar informe de movimientos.
- [ ] Generar informe de compras.
- [ ] Generar informe de mermas.
- [ ] Ver costos teórico vs real de una OP.
- [ ] Ver rentabilidad por PT.
- [ ] Gestionar usuarios (como admin).
- [ ] Cambiar tema.
- [ ] Cambiar umbrales de stock.
- [ ] Exportar CSV en cada listado.
- [ ] Imprimir/PDF en los informes.
- [ ] Todos los roles respetan RLS.

---

**Fin del documento de planeación.**