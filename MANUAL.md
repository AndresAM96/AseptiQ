# AseptiQ · Manual del usuario

**Versión:** 1.0
**Última actualización:** Octubre 2026
**Empresa:** Proclides Soluciones Estériles S.A.S.

---

## Índice

1. [¿Qué es AseptiQ?](#1-qué-es-aseptiq)
2. [Cómo entrar al sistema](#2-cómo-entrar-al-sistema)
3. [Roles y permisos](#3-roles-y-permisos)
4. [Glosario de términos](#4-glosario-de-términos)
5. [La pantalla principal](#5-la-pantalla-principal)
6. [Los módulos, uno por uno](#6-los-módulos-uno-por-uno)
   - 6.1 [Dashboard](#61-dashboard)
   - 6.2 [Cargar orden](#62-cargar-orden)
   - 6.3 [Novedades](#63-novedades)
   - 6.4 [Insumos](#64-insumos)
   - 6.5 [Productos & BOM](#65-productos--bom)
   - 6.6 [Entrada mercancía](#66-entrada-mercancía)
   - 6.7 [Devoluciones](#67-devoluciones)
   - 6.8 [Proveedores](#68-proveedores)
   - 6.9 [Auditoría](#69-auditoría)
   - 6.10 [Kardex](#610-kardex)
   - 6.11 [Compras](#611-compras)
   - 6.12 [Mermas y ajustes](#612-mermas-y-ajustes)
   - 6.13 [Histórico](#613-histórico)
   - 6.14 [Costos OP](#614-costos-op)
   - 6.15 [Rentabilidad](#615-rentabilidad)
   - 6.16 [Usuarios](#616-usuarios)
   - 6.17 [Configuración](#617-configuración)
7. [Flujos típicos del día a día](#7-flujos-típicos-del-día-a-día)
8. [Atajos de teclado](#8-atajos-de-teclado)
9. [Uso desde el celular o tablet](#9-uso-desde-el-celular-o-tablet)
10. [Preguntas frecuentes](#10-preguntas-frecuentes)

---

## 1. ¿Qué es AseptiQ?

AseptiQ es el sistema interno de inventario, producción y costos de Proclides Soluciones Estériles S.A.S.

Administra el ciclo completo de manufactura:

- **Insumos** (materia prima y material de empaque).
- **Subproductos** (piezas intermedias que se fabrican dentro del proceso).
- **Paquetes terminados (PT)** (los productos que salen a la venta o entrega).
- **Órdenes de producción (OP)** con entregas parciales.
- **Movimientos de inventario** (entradas, salidas, consumos, devoluciones, ajustes).
- **Análisis** de costos, rentabilidad y valorización.

---

## 2. Cómo entrar al sistema

La app está disponible en la URL que te compartió el administrador. Abrila en cualquier navegador moderno (Chrome, Edge, Firefox, Safari) desde el computador o el celular.

**Pasos:**

1. Abrí la URL.
2. Ingresá:
   - **URL del proyecto Supabase** (ya viene pre-cargada en equipos configurados).
   - **Anon public key** (ídem).
   - **Tu correo electrónico**.
   - **Tu contraseña**.
3. Marcá los dos checkboxes si querés que el sistema recuerde:
   - **Recordar URL y clave del proyecto** — no guarda tu usuario ni contraseña, solo las credenciales del proyecto.
   - **Recordar mi usuario y contraseña** — guarda tus credenciales en este navegador. **Solo usar en equipos de confianza.**
4. Click en **Conectar**.

**Recomendaciones:**

- No compartas tu contraseña.
- Si trabajás en un equipo compartido, no marques "Recordar mi usuario y contraseña".
- Al terminar la jornada, hacé click en **Cerrar sesión** (abajo del sidebar).

---

## 3. Roles y permisos

El sistema tiene 3 roles. El administrador asigna el tuyo.

| Rol | Puede hacer | No puede hacer |
|---|---|---|
| **Admin** | Todo: crear, editar, eliminar, gestionar usuarios | — |
| **Operador** | Crear y editar insumos, subproductos, PT, OP, entradas, devoluciones, ajustes | Gestionar usuarios |
| **Consulta** | Ver todo, exportar CSV, imprimir | Crear, editar, eliminar, ajustar |

Si intentás hacer una acción que tu rol no permite, el sistema te avisa con un mensaje rojo: *"Tu rol es Consulta — solo lectura."*

---

## 4. Glosario de términos

| Término | Significado |
|---|---|
| **Insumo** | Materia prima o material de empaque que se compra a proveedores. |
| **Subproducto** | Pieza que se fabrica dentro del proceso y se usa en otras recetas (ej: batón de corte, absorbente 60×25). |
| **PT (Producto Terminado)** | Paquete final que se vende o entrega (ej: Cirugía General Proclides). |
| **BOM / Receta** | Lista de insumos o subproductos necesarios para fabricar una unidad. |
| **OP (Orden de Producción)** | Orden para fabricar cierta cantidad de un PT. |
| **Entrega parcial** | Entrega de una parte de la OP sin cerrarla. La OP queda "En proceso" hasta completar. |
| **Stock objetivo** | Cantidad de insumo que se considera el nivel ideal. Define los umbrales de alerta. |
| **Urgente** | Existencia por debajo del umbral urgente (configurable, por defecto 20% del stock objetivo). |
| **Reorden** | Existencia por debajo del umbral de reorden (configurable, por defecto 50%). |
| **Cubierto** | Existencia por encima de los umbrales anteriores. |
| **Kardex** | Historial cronológico de movimientos de un insumo, con saldo acumulado. |
| **Costo promedio ponderado** | Costo unitario que se recalcula automáticamente con cada entrada. |
| **Costo congelado** | Costo que se guarda al momento de cada movimiento para poder auditar. |
| **Lote** | Identificador de una tanda de producción. Es único por OP. |
| **OP terminada** | OP con todas sus unidades entregadas. Pasa a histórico. |
| **OP en proceso** | OP con entregas parciales pero aún no completada. |
| **OP pendiente** | OP confirmada pero sin ninguna entrega todavía. |

---

## 5. La pantalla principal

Después de iniciar sesión, ves:

**A la izquierda: el sidebar (menú de navegación)**

Está organizado en 4 grupos:

- **Operación**: Dashboard, Cargar orden, Novedades, Entrada mercancía, Devoluciones.
- **Catálogo**: Insumos, Productos & BOM, Proveedores.
- **Análisis**: Auditoría, Kardex, Compras, Mermas, Histórico, Costos OP, Rentabilidad.
- **Sistema**: Configuración, Usuarios.

Solo un grupo está abierto a la vez. Al hacer click en otro, se cierra el anterior.

**Arriba del sidebar**: el logo AseptiQ y el botón `◀` para colapsar el menú.

**Abajo del sidebar**: tu correo, tu rol, y el botón **Cerrar sesión**.

**En el centro: el contenido del módulo activo.**

---

## 6. Los módulos, uno por uno

### 6.1 Dashboard

Vista general del estado del inventario y los KPIs principales.

**Qué muestra:**

- **Insumos**: cuántos hay activos, cuántos cubiertos, en reorden, urgentes.
- **Subproductos**: cuántos activos, con o sin existencia.
- **Paquetes (PT)**: cuántos en catálogo, con o sin stock.
- **Valorización**: valor total de insumos, subproductos y PT en stock.

Si hay insumos urgentes o en reorden, aparece un **banner de alerta** arriba con un botón "Ver insumos". Podés ocultarlo con la `×`.

**Botón ↻** arriba a la derecha para recargar.

---

### 6.2 Cargar orden

Acá se registran las órdenes de producción.

**Nueva OP:**

1. **Número de OP**: obligatorio. Se sugiere el siguiente disponible, pero podés escribir otro.
2. **Lote**: opcional. Si lo llenás, debe ser único.
3. **Producto terminado**: elegí de la lista.
4. **Cantidad**: en unidades (no en cajas). Debajo se muestra el equivalente en cajas.
5. **Prioridad**: Muy alta / Alta / Normal / Baja. Por defecto Normal.
6. **Fecha programada**: opcional.
7. Click en **Calcular cobertura**.

**Cálculo de cobertura:**

El sistema revisa si hay stock suficiente de todos los insumos y subproductos. Muestra 2 tablas:

- **Insumos directos del PT**: existencia actual vs. lo que se va a consumir.
- **Subproductos que componen el PT**: stock actual vs. lo requerido.

El resultado general puede ser **Cubierto**, **Reorden** o **Urgente**.

Click en **Confirmar orden** para guardarla. Queda en estado **Pendiente**.

**Órdenes registradas:**

Tabla con todas las OPs activas. Columnas:

- **N° OP** (con lote debajo).
- **Prioridad** (badge de color).
- **Producto**.
- **Cantidad** (con equivalente en cajas y progreso de entrega).
- **Programada**.
- **Cobertura**.
- **Estado**.
- **Acciones**: Detalle / Entregar / Cancelar.

**Entregar (parcial o total):**

1. Click en **Entregar**.
2. Se abre un modal que muestra: Proyectado / Ya entregado / Pendiente.
3. Ingresá la cantidad a entregar (viene con el pendiente completo por defecto).
4. Lote de entrega (opcional).
5. Motivo (opcional).
6. Click en **Registrar entrega**.

El sistema descuenta los insumos y subproductos proporcionalmente a lo que estás entregando.

- Si entregás todo → la OP queda **Terminada**.
- Si entregás parte → la OP queda **En proceso** con el progreso visible.

**Cancelar:**

Cancela la OP sin descontar nada. Pide un motivo opcional.

**Últimas 5 OPs:** panel de referencia rápida.

---

### 6.3 Novedades

Historial de órdenes activas (Pendientes y En proceso). Las Terminadas y Canceladas no aparecen acá — esas se ven en Cargar orden marcando el checkbox "Mostrar también las órdenes terminadas y canceladas".

Cada fila muestra el progreso de entrega debajo de la cantidad.

---

### 6.4 Insumos

Acá se gestionan los insumos.

**Nuevo insumo:**

- **Código**: se sugiere el siguiente disponible, pero podés escribir tu propio código. Ej: si querés `INS-0101002`, escribí `0101002` en el campo y el sistema lo prefija automáticamente.
- **Nombre**: descripción del insumo.
- **Existencia inicial**: opcional (por defecto 0).
- **Stock objetivo**: obligatorio. Se usa para calcular los umbrales de alerta.
- **Costo unitario**: en unidad de consumo.
- **Cadena de conversiones**: de unidad de compra a unidad de consumo.

**Cadena de conversiones:**

Permite modelar insumos que se compran en una unidad pero se consumen en otra:

- **Caso simple**: caja → unidad. Ej: `[caja] ×12 → [unidad]`.
- **Caso dimensional**: rollo → m². Ej: `[rollo] ×434 (2.17m × 200m) → [m²]`.
- **Caso variable**: kg → unidad. Activar "rendimiento variable" para que el factor se ajuste en cada lote recibido.

**Acciones:**

- **Editar**.
- **Eliminar**: solo si no está en uso en recetas ni tiene movimientos.
- **Click en el costo**: abre el modal para ajustar el costo manualmente (queda registrado en Auditoría).

---

### 6.5 Productos & BOM

Acá se gestionan subproductos y paquetes terminados.

**Subproductos:**

Piezas intermedias. Tienen su propia receta de insumos y pueden contener otros subproductos.

- **Tipo**:
  - **Intermedio**: se usa dentro de otros subproductos.
  - **Final**: solo se usa en paquetes (PT).
  - **Ambos**.

**Paquetes (PT):**

Productos finales. Se componen de subproductos + insumos directos.

- **Unidades por caja**: solo informativo (para mostrar el equivalente).
- **Precio de venta**: opcional. Se usa en el análisis de Rentabilidad.

**Importante sobre la receta:** las cantidades se expresan **por unidad individual** del PT o subproducto, **no por caja**. Si un paquete va en cajas de 1000 unidades y cada unidad lleva 1 bolsa, en la receta va `1`, no `1000`.

---

### 6.6 Entrada mercancía

Registra lo que llega de proveedores.

**Tipo de entrada:**

- **Insumo** (compra a proveedor).
- **Subproducto** (producción interna).

**Para insumos:**

1. Elegí el insumo.
2. Cantidad en **unidad de compra**.
3. Costo por unidad de compra (opcional — si lo dejás vacío, se mantiene el costo actual).
4. Proveedor.
5. Si el insumo tiene conversión variable, aparece un campo para el **rendimiento real del lote**.
6. Verás en vivo el equivalente en unidad de consumo.
7. Click en **Registrar entrada**.

El sistema recalcula automáticamente el **costo promedio ponderado**.

**Para subproductos:**

Se descuentan los insumos y subproductos hijos de su receta. Es una "producción" que ingresa al inventario.

---

### 6.7 Devoluciones

Registra mercancía devuelta a proveedores.

1. Elegí el insumo.
2. Cantidad a devolver.
3. Proveedor.
4. Motivo (opcional).
5. Verás en vivo cómo quedará la existencia después.
6. Click en **Registrar devolución**.

El sistema descuenta stock y genera un movimiento de tipo **Salida** con referencia al proveedor.

---

### 6.8 Proveedores

Maestro de proveedores.

- **NIT**: único. No se puede repetir.
- **Razón social**.
- **Dirección**.
- **Contactos**: nombre, teléfono, correo. Podés agregar varios.

---

### 6.9 Auditoría

Dos funciones principales:

1. **Registrar salida manual**: para mermas, ajustes, uso interno.
2. **Generar informes** con filtros:
   - **Movimientos de insumos**: entradas, salidas, consumos.
   - **Movimientos de subproductos**.
   - **Ajustes de costo**: cambios manuales de costo.
   - **Existencias (conteo físico)**: para hacer inventario.

**Conteo físico:**

1. Click en **Cargar existencias**.
2. Se listan todos los insumos y subproductos con su existencia actual.
3. En la columna **Conteo físico**, escribí lo que contaste realmente.
4. La columna **Diferencia** se actualiza en vivo (verde si sobra, rojo si falta).
5. Click en **Aplicar ajustes** → el sistema registra los ajustes como Entradas o Salidas.

**Exportar CSV** e **Imprimir / PDF** en cada informe.

---

### 6.10 Kardex

Historial de movimientos de un insumo, con saldo corrido.

1. Elegí el insumo.
2. Filtros: fecha desde/hasta, tipo.
3. Click en **Consultar kardex**.

Muestra:

- **4 KPIs**: saldo antes del rango, entradas en rango, salidas en rango, saldo actual.
- **Tabla**: fecha, tipo, referencia, entrada, salida, saldo.

**Exportar CSV** e **Imprimir / PDF**.

---

### 6.11 Compras

Análisis de compras por proveedor.

- **Filtros**: rango de fechas, proveedor específico.
- **Rangos rápidos**: mes actual, mes anterior, 90 días, año actual.
- **KPIs**: total comprado, entradas, proveedores activos, promedio por entrada.
- **Tabla resumen por proveedor**: total comprado, # entradas, # insumos, promedio, última compra.
- **Drill-down**: click en "Ver detalle" → ver todas las entradas de ese proveedor.
- **Exportar CSV** e **Imprimir / PDF**.

---

### 6.12 Mermas y ajustes

Análisis de pérdidas de inventario (excluye devoluciones y consumos de OP).

- **KPIs**: pérdida total, # movimientos, # insumos afectados, motivo principal.
- **Tabla por motivo**: agrupa los motivos libres en categorías (Merma, Ajuste por conteo físico, Uso interno, Vencimiento, Daño, Error de digitación).
- **Tabla por insumo**: cuanto se perdió de cada insumo, en cantidad y valor.
- **Drill-down**: click en "Ver detalle" → ver los movimientos específicos.
- **Exportar CSV** e **Imprimir / PDF**.

---

### 6.13 Histórico

Tendencias con gráficos.

- **Órdenes por mes** (últimos 12): cantidad de OPs y unidades producidas.
- **Movimientos por tipo** (últimos 30 días): entrada / salida / consumo.
- **Consumo mensual top 5 insumos** (12 meses).
- **Top 10 insumos por valor en stock**.

**Botón ↻** para recargar los datos.

---

### 6.14 Costos OP

Análisis de costo teórico vs. costo real de cada OP terminada.

- **Costo teórico**: se calcula con la receta actual × cantidad.
- **Costo real**: suma de los movimientos de consumo reales de esa OP.
- **Variación**: diferencia porcentual entre ambos.

**Drill-down**: click en **Comparar** → ver el desglose por insumo, con variación de cantidad y costo.

---

### 6.15 Rentabilidad

Margen bruto por producto terminado.

Requiere que el PT tenga **precio de venta** asignado.

- **KPIs**: PT con precio, ingresos estimados, costo de producción, margen bruto.
- **Gráfico**: margen por producto (top 10).
- **Tabla**: detalle por PT.

Los PT sin precio aparecen al final con un aviso.

---

### 6.16 Usuarios

Solo accesible para **admin**.

- Lista de usuarios con: email, nombre, rol, estado.
- **Cambiar rol**: cambiar entre admin / operador / consulta.
- **Activar / Desactivar**: bloquear el acceso al sistema.

**Importante**: no podés cambiar tu propio rol ni desactivar tu propia cuenta (para evitar quedarte fuera del sistema).

Los usuarios se crean desde el dashboard de Supabase (Authentication → Users → Add user).

---

### 6.17 Configuración

Parámetros globales. Se guardan en **este navegador** (no en el servidor).

- **Apariencia**: tema oscuro o claro.
- **Prefijos de códigos**: personalizar `INS-`, `SUB-`, `PT-`, `OP-`.
- **Unidades de medida**: agregar, editar, eliminar.
- **Umbrales de stock**:
  - **Urgente**: % del stock objetivo (por defecto 20%).
  - **Reorden**: % del stock objetivo (por defecto 50%).
  - El sistema marca **Urgente** si la existencia es ≤ urgente% del stock objetivo, **Reorden** si es ≤ reorden% + 1, y **Cubierto** si supera ese valor.

---

## 7. Flujos típicos del día a día

### Flujo A — Recibir mercancía de un proveedor

1. Andá a **Entrada mercancía**.
2. Elegí el insumo.
3. Ingresá la cantidad en unidad de compra.
4. Ingresá el costo (o dejalo vacío si no cambió).
5. Elegí el proveedor.
6. Si es variable, ingresá el rendimiento real del lote.
7. Click en **Registrar entrada**.

### Flujo B — Cargar la OP semanal y entregarla

1. Andá a **Cargar orden**.
2. Llená el formulario de Nueva OP.
3. **Calcular cobertura**.
4. Revisá que todo esté cubierto (o que los faltantes sean esperados).
5. **Confirmar orden** → queda Pendiente.
6. Cuando la producción esté lista, **Entregar** parcialmente.
7. Repetir hasta completar. La última entrega cierra la OP automáticamente.

### Flujo C — Producir un subproducto

1. Andá a **Entrada mercancía**.
2. Elegí **Subproducto** como tipo.
3. Elegí el subproducto.
4. Cantidad a producir.
5. Lote (opcional).
6. Click en **Registrar entrada**.
7. El sistema descuenta automáticamente los insumos y subproductos hijos de su receta.

### Flujo D — Hacer inventario físico

1. Andá a **Auditoría → Existencias (conteo físico)**.
2. Click en **Cargar existencias**.
3. Contá físicamente y escribí los valores en la columna **Conteo físico**.
4. Revisá las diferencias.
5. Click en **Aplicar ajustes**.

### Flujo E — Ajustar un costo con error

1. Andá a **Insumos**.
2. Click directamente sobre el costo del insumo (aparece subrayado punteado).
3. Ingresá el nuevo valor.
4. Ingresá el motivo (ej: "corrección de digitación").
5. Guardar. El cambio queda en **Auditoría → Ajustes de costo**.

### Flujo F — Ver por qué subió el costo de un producto

1. Andá a **Costos OP**.
2. Buscá la OP terminada.
3. Click en **Comparar**.
4. Revisá la tabla de desglose por insumo: qué insumo varió y en qué porcentaje.

---

## 8. Atajos de teclado

Presioná `?` en cualquier parte para ver la ayuda de atajos.

**Navegación rápida** (mantener `G` y luego la tecla):

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
| `G` + `U` | Usuarios |

**Acciones:**

| Atajo | Acción |
|---|---|
| `/` | Enfocar el buscador del módulo |
| `?` | Mostrar la ayuda de atajos |
| `Esc` | Cerrar modales / colapsar panel activo |

---

## 9. Uso desde el celular o tablet

La app se adapta automáticamente a la pantalla.

**En tablet** (641–1024 px):
- KPIs en 2 columnas.
- Tablas con scroll horizontal interno.
- Formularios se ajustan.

**En móvil (hasta 640 px):**
- Aparece un **botón de menú (☰)** arriba a la izquierda.
- Tocalo para abrir el sidebar como panel deslizable.
- Tocá fuera del panel o `Esc` para cerrarlo.
- Se cierra solo al elegir un módulo.
- Los KPIs se apilan en 1 columna.
- Los modales aparecen desde abajo.

**Recomendaciones para móvil:**
- Usá el celular en horizontal (landscape) para tablas más cómodas.
- Para conteo físico, considerá hacerlo en tablet o PC.

---

## 10. Preguntas frecuentes

**No puedo iniciar sesión. Dice "Correo o contraseña incorrectos".**
Verificá mayúsculas y que estés usando el mismo correo con el que te creó el admin. Si olvidaste la contraseña, pedile al admin que la resetee desde Supabase.

**Aparece un mensaje de "Email not confirmed".**
Tu cuenta no está confirmada. Pedile al admin que la marque como confirmada en Supabase.

**Mi rol es "Consulta" pero necesito editar.**
Pedile al admin que te cambie el rol a "Operador" en **Usuarios**.

**El badge de stock del sidebar muestra un número pero no veo qué insumo es.**
Hover sobre el badge → tooltip con "X urgente(s) · Y en reorden". Después andá a Insumos y filtrá por estado.

**Calculé la cobertura pero faltan muchos insumos y sé que tengo stock.**
Verificá que la receta del PT esté bien. La causa más común es haber puesto la cantidad por caja en vez de por unidad individual.

**Terminé una OP por error. ¿Puedo revertirla?**
No desde la interfaz. Contactá al admin para revertirla manualmente desde Supabase.

**El costo del insumo cambió pero no lo edité.**
Se recalculó por el promedio ponderado cuando registraste una entrada a un costo distinto. Es el comportamiento esperado. Si fue un error, ajustá el costo manualmente (click sobre el costo en Insumos).

**No aparece el módulo Usuarios en el sidebar.**
Ese módulo solo es visible para admin. Si no lo ves, tu rol no es admin.

**La app se ve muy pequeña en el celular.**
Probá en horizontal o hacé zoom (pinch). El diseño responsive prioriza la vista vertical, pero las tablas se ven mejor en horizontal.

**Cargué una entrada pero no veo el costo en el reporte de Compras.**
Las entradas antiguas (antes de v1.0) se rellenaron con el costo actual del insumo. Las entradas nuevas guardan el costo real del momento.

---

**Fin del manual v1.0.**

Si encontrás algo que no está en este manual, avisale al administrador para que lo agreguemos.