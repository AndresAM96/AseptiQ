# AseptiQ · Manual del usuario

**Versión:** 1.2
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

**Arriba del sidebar:** logo AseptiQ y botón `◀` para colapsar.

**Abajo:** correo, rol, y **Cerrar sesión**.

**En el centro:** contenido del módulo activo.

**Los paneles se pueden colapsar:** cada panel tiene un botón `▾` arriba a la derecha. Los formularios vienen colapsados; los listados expandidos. El estado se recuerda en el navegador.

---

## 6. Los módulos, uno por uno

### 6.1 Dashboard

- KPIs de insumos (activos, cubiertos, reorden, urgentes).
- KPIs de subproductos (activos, con/sin existencia).
- KPIs de paquetes (en catálogo, con/sin stock).
- Valorización: valor insumos, subproductos, PT y total.
- Banner de alerta si hay insumos urgentes/reorden.
- 3 tablas: insumos, subproductos, PT en inventario.

### 6.2 Cargar orden

**Nueva OP:**

- **Número de OP**: obligatorio. Sugerido automáticamente, editable.
- **Lote**: opcional. Único si se llena.
- **Producto terminado**.
- **Cantidad** (unidades).
- **Prioridad**: Muy alta / Alta / Normal / Baja. Por defecto Normal.
- **Fecha programada**: opcional.

Click en **Calcular cobertura**. Muestra dos tablas: insumos directos y subproductos requeridos, con estado de cada uno.

Click en **Confirmar orden** → queda Pendiente.

**Órdenes registradas:**

- **N° OP** (con lote).
- **Prioridad** (badge con color).
- **Producto**.
- **Cantidad** (con progreso de entrega).
- **Programada**.
- **Cobertura**.
- **Estado**.
- **Acciones**: Detalle / Entregar / Cancelar.

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

**Acciones:**

- **Editar**.
- **Eliminar**: solo si no está en uso.
- **Click en el costo**: ajustar costo manual con trazabilidad en Auditoría.

### 6.5 Productos & BOM

**Subproductos:**

- **Tipo**: Intermedio / Final / Ambos.
- Receta de insumos.
- Subproductos hijos (jerarquía anidada).

**Paquetes (PT):**

- **Unidades por caja**: informativo.
- **Precio de venta**: opcional.
- Composición por subproductos + insumos directos.

**Importante**: las cantidades son **por unidad individual**, no por caja. Si un paquete va en cajas de 1000 y cada unidad lleva 1 bolsa, en la receta va `1`.

### 6.6 Entrada mercancía

**Tipo insumo:**

1. Elegir insumo.
2. Cantidad en unidad de compra.
3. Costo (opcional).
4. Proveedor.
5. Si es variable, rendimiento real.
6. **Registrar entrada** → recalcula costo promedio.

**Tipo subproducto:**

Produce internamente. Descuenta insumos e hijos según la receta.

### 6.7 Devoluciones

Devoluciones a proveedor.

1. Insumo.
2. Cantidad.
3. Proveedor.
4. Motivo (opcional).
5. **Registrar devolución** → descuenta stock.

### 6.8 Proveedores

- **NIT**: único.
- **Razón social**.
- **Dirección**.
- **Contactos**: múltiples.

### 6.9 Auditoría

**Registrar salida manual**: mermas, ajustes, uso interno.

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

**Exportar CSV** e **Imprimir/PDF**.

### 6.10 Kardex

Historial de movimientos de un insumo con saldo corrido.

- Selector de insumo.
- Filtros de fecha y tipo.
- Rangos rápidos.
- 4 KPIs.
- Tabla con fecha, tipo, referencia, entrada, salida, saldo.

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

- **Órdenes por mes** (12 meses).
- **Movimientos por tipo** (30 días).
- **Consumo mensual top 5 insumos** (12 meses).
- **Top 10 insumos por valor**.

### 6.14 Costos OP

Comparativo costo teórico vs. real de OPs terminadas.

- Lista de OPs.
- **Comparar** → desglose por insumo con variación.

### 6.15 Rentabilidad

Margen bruto por PT. Requiere precio de venta.

- KPIs de margen.
- Gráfico de margen por producto.
- Tabla detallada.

### 6.16 Usuarios (solo admin)

- Lista de usuarios.
- **Cambiar rol**.
- **Activar/Desactivar**.

No podés cambiar tu propio rol ni desactivar tu propia cuenta.

### 6.17 Configuración

- **Apariencia**: tema oscuro o claro.
- **Prefijos de códigos**.
- **Unidades de medida**.
- **Umbrales de stock** (urgente %, reorden %).

### 6.18 Backup (solo admin)

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

**Tablet (641–1024 px):** KPIs en 2 columnas, tablas con scroll horizontal.

**Móvil (hasta 640 px):**
- Botón **☰** arriba a la izquierda para abrir el menú.
- Los grupos se ven como drawer.
- KPIs en 1 columna.
- Modales desde abajo.

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

---

**Fin del manual.**

Si encontrás algo que no está acá, avisale al administrador para agregarlo.