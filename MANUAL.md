# AseptiQ · Manual del usuario

**Versión:** 1.8
**Última actualización:** Octubre 2026
**Empresa:** Proclides Soluciones Estériles S.A.S.

---

## Índice

1. [¿Qué es AseptiQ?](#1-qué-es-aseptiq)
2. [Cómo entrar al sistema](#2-cómo-entrar-al-sistema)
3. [Roles y permisos](#3-roles-y-permisos)
4. [Glosario](#4-glosario)
5. [La pantalla principal](#5-la-pantalla-principal)
6. [Los módulos, uno por uno](#6-los-módulos-uno-por-uno)
7. [Flujos típicos](#7-flujos-típicos)
8. [Atajos de teclado](#8-atajos-de-teclado)
9. [Uso desde el celular o tablet](#9-uso-desde-el-celular-o-tablet)
10. [Preguntas frecuentes](#10-preguntas-frecuentes)

---

## 1. ¿Qué es AseptiQ?

Sistema interno de inventario, producción y costos de Proclides Soluciones Estériles S.A.S.

Administra el ciclo completo:

- **Insumos** (materia prima y material de empaque).
- **Subproductos** (piezas intermedias que se fabrican dentro del proceso).
- **Paquetes terminados (PT)**.
- **Órdenes de producción (OP)** con entregas parciales.
- **Movimientos de inventario** (entradas, salidas, consumos, devoluciones, ajustes).
- **Análisis** de costos, rentabilidad y valorización.
- **Backup** exportable.

---

## 2. Cómo entrar al sistema

1. Abrir la URL de AseptiQ en un navegador moderno.
2. Ingresar:
   - **URL del proyecto Supabase** (pre-cargada en equipos configurados).
   - **Anon public key** (ídem).
   - **Correo electrónico**.
   - **Contraseña**.
3. Marcar opcionalmente:
   - **Recordar URL y clave del proyecto**.
   - **Recordar mi usuario y contraseña** — solo en equipos de confianza.
4. Click en **Conectar**.

Al terminar la jornada, usar **Cerrar sesión** (abajo del sidebar).

---

## 3. Roles y permisos

| Rol | Puede | No puede |
|---|---|---|
| **Admin** | Todo, gestionar usuarios, generar backup | — |
| **Operador** | Crear y editar catálogo y operación | Gestionar usuarios ni backups |
| **Consulta** | Ver todo, exportar, imprimir | Crear, editar, eliminar |

Si intentás una acción no permitida, aparece: *"Tu rol es Consulta — solo lectura."*

---

## 4. Glosario

| Término | Significado |
|---|---|
| **Insumo** | Materia prima o material de empaque |
| **Subproducto** | Pieza que se fabrica internamente y se usa en otras recetas |
| **PT** | Paquete terminado que sale a venta o entrega |
| **BOM / Receta** | Lista de insumos o subproductos para fabricar una unidad |
| **OP** | Orden de producción |
| **Entrega parcial** | Entrega de una parte de la OP sin cerrarla |
| **Stock objetivo** | Cantidad ideal de insumo. Define umbrales de alerta |
| **Urgente** | Existencia ≤ umbral urgente (% del stock objetivo) |
| **Reorden** | Existencia ≤ umbral de reorden |
| **Cubierto** | Existencia por encima de los umbrales anteriores |
| **Kardex** | Historial cronológico de movimientos con saldo |
| **Costo promedio ponderado** | Costo recalculado con cada entrada |
| **Lote** | Identificador único de una tanda |

---

## 5. La pantalla principal

**Sidebar (izquierda):** menú organizado en 4 grupos:

- **Operación**: Dashboard, Cargar orden, Novedades, Entrada mercancía, Devoluciones.
- **Catálogo**: Insumos, Productos & BOM, Proveedores.
- **Análisis**: Auditoría, Kardex, Compras, Mermas, Histórico, Costos OP, Rentabilidad.
- **Sistema**: Configuración, Backup, Usuarios.

Solo un grupo abierto a la vez. Al hacer click en otro, se cierra el anterior.

**Arriba del sidebar:** logo AseptiQ, campana de notificaciones 🔔 y botón `◀` para colapsar.

**Buscador del sidebar:** justo debajo del logo hay un input con lupa. Escribí el nombre del módulo (ej: "kardex", "trazabilidad") y el sidebar filtra en vivo. `Enter` navega al primer resultado. `Escape` o el botón `×` limpia.

**Campana de notificaciones:** cuando hay stock urgente u OPs pendientes hace más de 5 días, la campana se sacude suavemente y muestra un badge rojo con el total. Click en la campana abre un panel con:
- **Stock urgente** — insumos por debajo del umbral.
- **OPs pendientes hace +5 días**.
- **En reorden** — insumos cerca del mínimo.
- **Entregas últimas 24h**.
Cada item es clickeable y **lleva al módulo ya filtrado** (solo urgentes, solo reorden, solo OPs vencidas). Se cierra con `Escape` o click fuera.

**Marcar como vistas:** al abrir la campana, todas las notificaciones actuales se marcan como vistas y el badge se limpia. El badge solo vuelve a aparecer cuando hay **nuevas** (por ejemplo, si un insumo pasa de Reorden a Urgente, o si aparece una nueva OP vencida).

**Silenciar:** cada item tiene un botón **×** para silenciarlo. Los silenciados dejan de aparecer hasta que los reactives desde la sección **"Silenciados"** al final del dropdown.

**Abajo:** correo, rol, y **Cerrar sesión**.

**En el centro:** contenido del módulo activo.

**Los paneles se pueden colapsar:** cada panel tiene un botón `▾` arriba a la derecha. Algunos paneles arrancan expandidos por defecto (listados, KPIs y resúmenes) y otros colapsados (prefijos, unidades, umbrales). El estado se recuerda en el navegador.

**Modales:** los formularios de creación y edición se abren en modales. Buscá el botón `+` en la esquina superior derecha de cada listado (Insumos, Productos & BOM, Proveedores, Configuración → Unidades y Umbrales), o el botón `+ Registrar salida` en Auditoría.

---

## 6. Los módulos, uno por uno

### 6.1 Dashboard

- KPIs de insumos (activos, cubiertos, reorden, urgentes).
- KPIs de subproductos (activos, con/sin existencia).
- KPIs de paquetes (en catálogo, con/sin stock).
- Valorización: valor insumos, subproductos, PT y total.
- Banner de alerta si hay insumos urgentes/reorden.
- **Widget "🔴 Stock crítico del día"** — top 5 insumos urgentes/reorden con barra de cobertura % y botón "Ver todos".
- **Timeline "🕒 Actividad reciente"** — últimos 15 eventos (entradas, salidas, consumos, entregas) con tiempo relativo ("Hace 5 min", "Hace 2 h").
- 3 tablas: insumos, subproductos, PT en inventario.

### 6.2 Cargar orden

**Nueva OP:**

- **Número de OP**: obligatorio. Sugerido automáticamente, editable.
- **Lote**: opcional. Único si se llena.
- **Producto terminado**.
- **Cantidad** (unidades).
- **Prioridad**: Muy alta / Alta / Normal / Baja. Por defecto Normal.
- **Fecha programada**: opcional.

**Los paneles se pueden colapsar:** cada panel tiene un botón `▾` arriba a la derecha. Algunos paneles arrancan expandidos por defecto (listados, KPIs y resúmenes) y otros colapsados (prefijos, unidades, umbrales). El estado se recuerda en el navegador.

**Modales:** los formularios de creación y edición se abren en modales. Buscá el botón `+` en la esquina superior derecha de cada listado (Insumos, Productos & BOM, Proveedores, Configuración → Unidades y Umbrales), o el botón `+ Registrar salida` en Auditoría.

**Órdenes registradas:**

- **N° OP** (con lote).
- **Prioridad** (badge con color).
- **Producto**.
- **Cantidad** (con progreso de entrega).
- **Programada**.
- **Cobertura**.
- **Estado**.
- **Acciones**: Detalle / Entregar / Cancelar.

**Detalle:** abre un modal con KPIs de progreso (proyectado / entregado % / pendiente), tablas de insumos proyectados y subproductos requeridos, e historial completo de entregas.

**🖨 Imprimir OP** (dentro del modal de detalle): genera un documento formal con logo, QR de trazabilidad, tablas, y 3 firmas (Elaboró / Revisó / Aprobó).

**Entregas parciales:**

1. Click en **Entregar**.
2. Modal muestra: Proyectado / Ya entregado / Pendiente.
3. Ingresar cantidad (viene con el pendiente completo).
4. Lote de entrega (opcional).
5. Motivo (opcional).
6. Click en **Registrar entrega**.

El sistema descuenta insumos y subproductos **proporcionalmente** a lo que estás entregando.

- Si entregás todo → OP queda **Terminada**.
- Si entregás parte → OP queda **En proceso** con progreso visible.

**Cancelar:** cancela la OP sin descontar nada.

### 6.3 Novedades

Historial de OPs activas (Pendientes y En proceso). Muestra el progreso de entrega. Las Terminadas y Canceladas se ven en Cargar orden marcando el checkbox.

El botón **Ver detalle** abre el mismo modal que en Cargar orden: KPIs de progreso, insumos proyectados, subproductos requeridos e historial de entregas.

### 6.4 Insumos

**Nuevo insumo:**

- **Código**: sugerido automáticamente. Podés escribir tu propio código (ej: `0101002` → se prefija a `INS-0101002`).
- **Nombre**.
- **Existencia inicial** (opcional).
- **Stock objetivo**: obligatorio.
- **Costo unitario**.
- **Cadena de conversiones**.

**Cadena de conversiones:**

- **Caso simple**: caja → unidad. Ej: `[caja] ×12 → [unidad]`.
- **Caso dimensional**: rollo → m². Ej: `[rollo] ×434 (2.17m × 200m) → [m²]`.
- **Caso variable**: kg → unidad. Activar "rendimiento variable".

**Crear / editar:** click en el botón `+` (arriba a la derecha del listado) o en **Editar** de cualquier fila → se abre un modal con el formulario completo (datos + cadena de conversiones).

**Código sugerido:** el campo Código viene precargado con el siguiente número disponible en **4 dígitos** (ej: `0089`). Al hacer click en el campo, se selecciona todo el texto; al empezar a tipear, el sugerido se reemplaza automáticamente. Debajo aparece la validación en vivo: "✓ Código disponible" o "✕ Ya existe un registro con este código".

**Acciones:**

- **🏷 Etiquetas**: imprime etiquetas QR. Los insumos usan la etiqueta pequeña (50x25mm). Los paquetes (PT) usan plantillas de 150x100mm o 80x44mm.
- **Impresión de cajas**: en el modal de impresión de un PT, se puede indicar cuántas cajas se van a imprimir. El sistema generará las etiquetas de caja con un QR único para trazabilidad y un contador que registra cuántas etiquetas se imprimieron en total.
- **Detalles**: abre el modal con la ficha técnica del insumo, incluyendo la sección **"Lotes recibidos"** con la cantidad acumulada por lote y su proveedor.
- **Eliminar**: solo si no está en uso.
- **Click en el costo**: ajustar costo manual con trazabilidad en Auditoría.

### 6.5 Productos & BOM

**Estructura de la pantalla:**

1. Panel **Crear nuevo** con botones `+ Nuevo subproducto` y `+ Nuevo paquete (PT)`.
2. Lista de **Subproductos existentes** (colapsable).
3. Lista de **Paquetes existentes** (colapsable).

**Crear o editar:** los botones superiores y el botón **Editar** de cada ítem abren el mismo modal con el formulario completo.

**Subproductos:**

- **Tipo**: Intermedio / Final / Ambos.
- Receta de insumos.
- Subproductos hijos (jerarquía anidada).

**Paquetes (PT):**

- **Unidades por caja**: informativo.
- **Precio de venta**: opcional.
- Composición por subproductos + insumos directos.

**Importante**: las cantidades son **por unidad individual**, no por caja. Si un paquete va en cajas de 1000 y cada unidad lleva 1 bolsa, en la receta va `1`.

**Configuración de etiquetas:**
Cada PT guarda la información necesaria para imprimir su etiqueta:
- **Plantilla**: Proclides Estéril/No Estéril (Grande/Mediana) o Allmed (Estéril/No Estéril).
- **Vida útil**: por defecto es de 35 meses (que equivale a 3 años - 1 mes - 1 día).
- **Registro INVIMA**: cada producto elige cuál de los configurados en el sistema lleva.
- **Código de barras del cliente**: si se llena, se imprimirá el código de barras. Si se deja vacío, se generará un QR interno en las cajas pero no en el paquete.
- **Modales apilados**: al hacer click en "+ Crear subproducto" o "+ Crear insumo" dentro del PT, se abrirá el formulario completo encima del actual sin perder lo que llevabas escrito.

**🏷 Etiquetas**: cada paquete tiene un botón 🏷 en su fila para imprimir etiquetas QR configurables (igual que en Insumos).

### 6.6 Entrada mercancía

**Tipo insumo:**

1. Elegir insumo.
2. Cantidad en unidad de compra.
3. Costo (opcional).
4. Proveedor. Si no está en la lista, click en **"+ El proveedor no está en la lista, crear uno nuevo"** → se abre un modal con el formulario completo (NIT, razón social, dirección y contactos múltiples). Al guardar, el nuevo proveedor queda seleccionado automáticamente.
5. **Lote del proveedor** (opcional): el número de lote que viene en la factura o remisión.
6. Si es variable, rendimiento real.
7. **Registrar entrada** → recalcula costo promedio.

**Recibir varios lotes:** si el insumo viene en rollos o unidades cada uno con su propio lote (típico en Tela SMS), click en **"Recibir varios lotes (uno por línea)"** debajo del campo Lote. Aparece un textarea grande donde pegás un lote por línea:

````
LOTE-001
LOTE-002
LOTE-003
````

La cantidad total se divide por igual entre los N lotes. La cantidad total se registra como una sola entrada de inventario, pero cada lote queda en el historial del insumo. Para volver al modo normal, click en "Volver a un solo lote".

**Tipo subproducto:**

Igual que antes, pero el campo de lote se llama **"Lote de producción"** y es el que identifica la tanda interna que estás fabricando.

**Tipo subproducto:**

Produce internamente. Descuenta insumos e hijos según la receta.

### 6.7 Devoluciones

Pantalla con dos pestañas: **A proveedor (insumo)** y **De cliente (producto terminado)**.

**A proveedor (insumo):**

1. Insumo.
2. Cantidad.
3. Proveedor.
4. Motivo (opcional).
5. **Registrar devolución** → descuenta stock del insumo.

**De cliente (producto terminado):**

1. Producto terminado.
2. Cantidad devuelta.
3. Estado del producto:
   - **Bueno** → vuelve al stock vendible.
   - **Cuarentena** → queda registrado sin afectar stock.
   - **Dañado** → queda registrado sin afectar stock.
4. Motivo (opcional).
5. **Registrar devolución**.

Cada pestaña muestra el historial de las últimas devoluciones registradas.

### 6.8 Proveedores

- **NIT**: único.
- **Razón social**.
- **Dirección**.
- **Contactos**: múltiples.

### 6.9 Auditoría

**Registrar salida manual**: botón `+ Registrar salida` arriba a la derecha del módulo → abre un modal con insumo, cantidad y motivo. Se usa para mermas, ajustes y uso interno.

**Generar informes**:

- **Movimientos de insumos**.
- **Movimientos de subproductos**.
- **Ajustes de costo**.
- **Existencias (conteo físico)**.

**Conteo físico:**

1. **Cargar existencias**.
2. Escribir el conteo real en la columna **Conteo físico**.
3. Diferencia en vivo.
4. **Aplicar ajustes**.

**Exportar CSV** e **🖨 Imprimir informe** (imprime el informe generado con formato profesional).

**🖨 Imprimir formato** (dentro del conteo físico): genera un formato en blanco con columnas Sistema / Conteo / Dif. para llenar a mano, con firmas de Contó / Revisó / Aprobó al final.

### 6.10 Kardex

Historial de movimientos de un insumo con saldo corrido.

- Selector de insumo.
- Filtros de fecha y tipo.
- Rangos rápidos.
- 4 KPIs: saldo antes del rango / entradas / salidas / saldo actual.
- Tabla con fecha, tipo, referencia, entrada, salida, saldo.

**🖨 Imprimir informe**: genera un documento en formato libro contable con logo, info general, KPIs y tabla completa de movimientos.

### 6.11 Compras

Análisis de compras por proveedor.

- Filtros: rango de fechas, proveedor.
- Rangos rápidos: mes actual, mes anterior, 90 días, año.
- KPIs: total, entradas, proveedores, promedio.
- Tabla resumen por proveedor.
- Drill-down al detalle.
- Exportar CSV / Imprimir.

### 6.12 Mermas

Análisis de pérdidas (salidas manuales y ajustes por conteo).

- KPIs: pérdida total, movimientos, insumos afectados, motivo principal.
- Tabla por motivo (agrupación automática).
- Tabla por insumo.
- Drill-down.
- Exportar CSV / Imprimir.

### 6.13 Histórico

- **Órdenes por período**: filtro superior con semana / mes / año (por defecto mes).
- **Movimientos por tipo**: filtro superior con semana / mes / año (por defecto mes). Si solo hay un tipo de movimiento en el período, muestra un mensaje explicativo en vez del anillo.
- **Consumo mensual top 5 insumos** (12 meses) — panel colapsable.
- **Top 10 insumos por valor** — panel colapsable.
- **Resumen del período** — panel expandido por defecto.

### 6.14 Costos OP

Comparativo costo teórico vs. real de OPs terminadas.

- Lista de OPs.
- **Comparar** → desglose por insumo con variación.

### 6.15 Rentabilidad

Margen bruto por PT. Requiere precio de venta.

- KPIs de margen.
- Gráfico de margen por producto.
- Tabla detallada.

### 6.16 Trazabilidad

Análisis bidireccional de lotes. Atajo: `G` + `T`.

**Modo Forward (🔍 ¿De dónde vino?):**

1. Elegís un PT y una cantidad.
2. Se expande un árbol con:
   - **Insumos directos** del PT, con sus lotes registrados (chip verde con lote + proveedor).
   - **Subproductos** anidados recursivamente (2 niveles abiertos por defecto, el resto colapsables).
3. Los lotes mostrados son los de las últimas entradas registradas con lote. Si un insumo nunca tuvo lote, muestra "Sin entradas registradas".

**Modo Backward (↩ ¿A dónde fue?):**

1. Elegís un insumo.
2. Se muestran tres bloques:
   - PTs donde el insumo se usa **directamente**.
   - Subproductos que lo usan (cadena recursiva).
   - PTs que lo contienen **vía subproductos**.

**Nota técnica:** la trazabilidad es aproximada — muestra los lotes disponibles y su cantidad acumulada, no el lote exacto consumido en cada OP (eso requeriría FIFO estricto). El disclaimer está al pie del árbol. Los datos vienen de la tabla `insumo_lotes`, que se alimenta automáticamente cada vez que se registra una entrada con lote.

### 6.17 Usuarios (solo admin)

- Lista de usuarios.
- **Cambiar rol**: abre un modal con un desplegable (Admin / Operador / Consulta).
- **Activar/Desactivar**.

No podés cambiar tu propio rol ni desactivar tu propia cuenta.

### 6.18 Configuración

- **Apariencia**: toggle deslizante compacto a la derecha del panel. Click cambia entre tema oscuro y claro; el icono del thumb alterna luna / sol. Los gráficos se adaptan automáticamente.
- **Prefijos de códigos** — panel colapsado por defecto.
- **Unidades de medida** — botón `+` abre un modal con la lista y opciones de agregar / renombrar / eliminar.
- **Umbrales de stock** (urgente %, reorden %) — botón `+` abre un modal con los inputs.

**Importante:** toda la configuración (prefijos, unidades, umbrales y el estado de notificaciones) se guarda en el **backend** (`sys_config`). Si cambiás la config en un dispositivo, los demás la ven al refrescar.

### 6.19 Backup (solo admin)

- Genera un ZIP con 13 tablas en CSV.
- Selector de rango de movimientos (30d / 6m / 1a / todo / sin movimientos).
- Historial de backups.
- Los archivos se abren en Excel, Google Sheets o Power BI.

---

## 7. Flujos típicos

### A — Recibir mercancía

1. **Entrada mercancía**.
2. Elegir insumo.
3. Cantidad en unidad de compra.
4. Costo (o dejar vacío).
5. Proveedor.
6. **Registrar entrada**.

### B — Cargar OP y entregarla

1. **Cargar orden**.
2. Llenar Nueva OP.
3. **Calcular cobertura**.
4. **Confirmar orden**.
5. Cuando esté lista, **Entregar** parcialmente.
6. Repetir hasta completar. La última entrega cierra la OP.

### C — Producir subproducto

1. **Entrada mercancía**.
2. Tipo **Subproducto**.
3. Elegir subproducto.
4. Cantidad.
5. **Registrar entrada**.

### D — Inventario físico

1. **Auditoría → Existencias**.
2. **Cargar existencias**.
3. Escribir conteos.
4. **Aplicar ajustes**.

### E — Ajustar costo con error

1. **Insumos**.
2. Click sobre el costo del insumo.
3. Nuevo valor + motivo.
4. Guardar → queda en Auditoría.

### F — Ver por qué subió el costo de un producto

1. **Costos OP**.
2. Buscar la OP.
3. **Comparar**.
4. Revisar tabla de desglose.

---

## 8. Atajos de teclado

Presionar `?` para ver la ayuda.

| Atajo | Va a |
|---|---|
| `G` + `D` | Dashboard |
| `G` + `O` | Cargar orden |
| `G` + `N` | Novedades |
| `G` + `I` | Insumos |
| `G` + `P` | Productos & BOM |
| `G` + `E` | Entrada mercancía |
| `G` + `X` | Devoluciones |
| `G` + `V` | Proveedores |
| `G` + `A` | Auditoría |
| `G` + `K` | Kardex |
| `G` + `B` | Compras |
| `G` + `M` | Mermas |
| `G` + `H` | Histórico |
| `G` + `C` | Costos OP |
| `G` + `R` | Rentabilidad |
| `G` + `T` | Trazabilidad |
| `G` + `Y` | Backup |
| `G` + `U` | Usuarios |

**Acciones:**

| Atajo | Acción |
|---|---|
| `/` | Enfocar buscador |
| `?` | Ayuda de atajos |
| `Esc` | Cerrar modales / colapsar panel activo |

---

## 9. Uso desde celular o tablet

**Tablet (641–1024 px):** KPIs en 2 columnas, tablas completas.

**Móvil (hasta 640 px):**
- Botón **☰** arriba a la izquierda para abrir el menú.
- Los grupos se ven como drawer.
- KPIs en 1 columna.
- **Tablas se convierten en tarjetas apiladas** con etiqueta arriba de cada valor (no hace falta scroll horizontal).
- Modales desde abajo.
- La campana de notificaciones aparece al lado del toggle, y el dropdown ocupa el ancho completo.

**Recomendaciones:**
- Usar en horizontal para tablas.
- El conteo físico es más cómodo en tablet o PC.

---

## 10. Preguntas frecuentes

**No puedo iniciar sesión.**
Verificá mayúsculas y el correo con el que te creó el admin.

**Mi rol es Consulta pero necesito editar.**
Pedile al admin que te cambie el rol en **Usuarios**.

**Calculé la cobertura pero faltan insumos y sé que tengo stock.**
Revisá la receta del PT. La causa más común es haber puesto la cantidad por caja en vez de por unidad.

**Terminé una OP por error. ¿Puedo revertirla?**
No desde la interfaz. Contactar al admin.

**El costo del insumo cambió sin editarlo.**
Se recalculó por promedio ponderado al registrar una entrada. Si fue un error, ajustar el costo manualmente.

**No aparece el módulo Usuarios/Backup.**
Solo visible para admin.

**Cargué una entrada pero el reporte de Compras no muestra el costo.**
Las entradas anteriores a v1.0 se rellenaron con el costo actual. Las nuevas guardan el costo real del momento.

**Al imprimir en PDF me aparece la URL del archivo y el número de página.**
Son los "encabezados y pies de página" del navegador. En el diálogo de impresión, abrí **Más configuraciones** y desmarcá esa opción.

**El bloque de firmas se va solo a la última página.**
Actualizado en v1.4.0: los espaciados se compactaron para que quepa junto con la tabla. Si tu tabla es muy larga, es normal que las firmas queden solas — el formato está diseñado así para darles espacio.

**Cambié un prefijo/unidad/umbral en Configuración pero no lo veo reflejado.**
La configuración se guarda en el backend. Al cambiarla, se aplica a todos los dispositivos en el próximo refresco. Si editás desde el celular y no ves el cambio en el PC, refrescá la página (Ctrl+Shift+R).

**Silencié un insumo pero lo quiero recuperar.**
Abrí la campana → al final del dropdown hay una sección **"Silenciados"**. Expandila y click en **Reactivar** en el item correspondiente.

**Cada vez que abro la app, la campana tiene el mismo número.**
Actualizado en v1.7.0: al abrir la campana, las notificaciones se marcan como vistas y el badge se limpia. Solo vuelve a aparecer cuando hay **nuevas** (por ejemplo, un insumo que cambia de Reorden a Urgente, o una nueva OP vencida).

**Cargué una entrada con un solo lote pero quiero dividirlo entre varios lotes.**
Andá a **Entrada mercancía**, seleccioná el insumo, y en el campo Lote click en **"Recibir varios lotes (uno por línea)"**. Pegá cada lote en una línea y la cantidad total se divide por igual entre ellos.

**¿Por qué la Trazabilidad muestra varios lotes para el mismo insumo?**
Porque el sistema no asigna lotes exactos a cada consumo (eso requeriría FIFO estricto). La vista muestra los lotes que **existen** para ese insumo en las últimas entradas registradas. Sirve para saber qué lotes podrían haber sido consumidos, no cuál fue exactamente.

**¿Qué pasa si no pongo lote en una entrada?**
Nada — el campo es opcional. Ese insumo aparecerá en Trazabilidad con "Sin entradas registradas" en lugar de un chip de lote. Para INVIMA, se recomienda registrar el lote siempre.

---

**Fin del manual.**

Si encontrás algo que no está acá, avisale al administrador para agregarlo.