# Contrato de API — ProLog / Control de Inventario

**Versión**: v23
**Última actualización**: 2026-09-30
**Base de datos**: Supabase (PostgreSQL 15)
**Backend a portar**: .NET 8 (Blazor o MAUI según decisión final)

Este documento describe la superficie completa del backend: tablas, RPCs,
políticas RLS y flujos críticos. Cada entrada tiene su equivalente C#
sugerido para que el port sea mecánico.

---

## 1. TABLAS

Todas las tablas viven en el schema `public`. Todas usan RLS activo.

### 1.1 `insumos`
Materia prima y material de empaque.

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `codigo` | text | NOT NULL, UNIQUE |
| `nombre` | text | NOT NULL |
| `unidad_medida` | text | NOT NULL — espejo legacy de la primera unidad de la cadena |
| `existencia_actual` | numeric | NOT NULL DEFAULT 0 — en unidad de consumo |
| `punto_reorden` | numeric | NOT NULL CHECK > 0 — **stock objetivo** |
| `estado_activo` | boolean | NOT NULL DEFAULT true |
| `creado_en` | timestamptz | NOT NULL DEFAULT now() |
| `unidad_consumo` | text | NULL — espejo legacy de la última unidad |
| `factor_conversion` | numeric | NULL — espejo legacy del factor total |
| `unidad_secundaria` | text | NULL |
| `factor_secundario` | numeric | NULL |
| `costo_unitario` | numeric | NOT NULL DEFAULT 0 CHECK >= 0 — por unidad de consumo |
| `conversiones` | jsonb | NOT NULL DEFAULT '[]' — `[{unidad, factor, formula?}]` |
| `tipo_conversion` | text | NOT NULL DEFAULT 'fijo' CHECK IN ('fijo','dimensional','variable') |

**Equivalente C#**: clase `Insumo` con propiedades idénticas.

### 1.2 `subproductos`
Piezas intermedias que se producen y consumen dentro de otras recetas.

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `codigo` | text | NOT NULL, UNIQUE |
| `nombre` | text | NOT NULL |
| `estado_activo` | boolean | NOT NULL DEFAULT true |
| `creado_en` | timestamptz | NOT NULL DEFAULT now() |
| `existencia_actual` | numeric | NOT NULL DEFAULT 0 |
| `punto_reorden` | numeric | NULL (v11) CHECK >= 0 |
| `tipo` | text | NOT NULL DEFAULT 'ambos' CHECK IN ('intermedio','final','ambos') |

### 1.3 `productos_terminados` (PT)
Paquetes que se venden o entregan.

| Columna | Tipo | Constraints |
|---|---|---|
| `codigo_pt` | text | PK |
| `nombre` | text | NOT NULL |
| `estado_activo` | boolean | NOT NULL DEFAULT true |
| `creado_en` | timestamptz | NOT NULL DEFAULT now() |
| `unidades_por_caja` | integer | NOT NULL DEFAULT 1 CHECK >= 1 |
| `existencia_actual` | numeric | NOT NULL DEFAULT 0 (v12) CHECK >= 0 |
| `precio_venta` | numeric | NULL CHECK >= 0 (v21) |

### 1.4 `bom_recetas`
Receta de insumos directa de un PT.

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `codigo_pt` | text | FK → productos_terminados |
| `insumo_id` | uuid | FK → insumos |
| `cantidad_por_unidad` | numeric | NOT NULL |
| `creado_en` | timestamptz | NOT NULL DEFAULT now() |

### 1.5 `subproducto_recetas`
Receta de insumos de un subproducto.

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `subproducto_id` | uuid | FK → subproductos |
| `insumo_id` | uuid | FK → insumos |
| `cantidad_por_unidad` | numeric | NOT NULL |
| `creado_en` | timestamptz | NOT NULL DEFAULT now() |
| `unidad_receta` | text | NULL (v8) |
| `factor_receta` | numeric | NOT NULL DEFAULT 1 (v8) |

### 1.6 `subproducto_subproductos`
Receta recursiva entre subproductos.

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `subproducto_padre_id` | uuid | FK → subproductos |
| `subproducto_hijo_id` | uuid | FK → subproductos |
| `cantidad_por_unidad` | numeric | NOT NULL |
| `creado_en` | timestamptz | NOT NULL DEFAULT now() |

### 1.7 `paquete_subproductos`
Subproductos que componen un PT.

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `codigo_pt` | text | FK → productos_terminados |
| `subproducto_id` | uuid | FK → subproductos |
| `cantidad` | numeric | NOT NULL |
| `creado_en` | timestamptz | NOT NULL DEFAULT now() |

### 1.8 `sys_proveedores`

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `nit` | text | NOT NULL, UNIQUE |
| `razon_social` | text | NOT NULL |
| `contacto` | text | NULL (legacy) |
| `creado_en` | timestamptz | NOT NULL DEFAULT now() |
| `direccion` | text | NULL |
| `contactos` | jsonb | NOT NULL DEFAULT '[]' — `[{nombre, telefono, correo}]` |

### 1.9 `ordenes_semanales`
Órdenes de producción.

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `codigo_pt` | text | FK → productos_terminados |
| `cantidad_proyectada` | numeric | NOT NULL |
| `estado_cobertura` | text | NOT NULL DEFAULT 'Cubierta' |
| `detalle_faltantes` | jsonb | `{insumos:[...], subproductos:[...]}` (v17) o array legacy |
| `fecha_creacion` | timestamptz | NOT NULL DEFAULT now() |
| `numero_op` | text | NULL, UNIQUE parcial (v15) |
| `estado_op` | text | NOT NULL DEFAULT 'Pendiente' CHECK IN ('Pendiente','En proceso','Terminada','Cancelada') |
| `cantidad_cajas` | numeric | NULL |
| `fecha_completado` | timestamptz | NULL (v7) |
| `fecha_cancelado` | timestamptz | NULL (v7) |
| `motivo_cancelacion` | text | NULL (v7) |
| `lote` | text | NULL, UNIQUE parcial (v15) |
| `prioridad` | integer | NULL (v19) — menor = más urgente |
| `fecha_programada` | date | NULL (v19) |

### 1.10 `movimientos_inventario`
Kardex unificado de insumos y subproductos.

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `insumo_id` | uuid | FK → insumos, NULL (v15) |
| `tipo` | text | NOT NULL DEFAULT 'Entrada' |
| `cantidad` | numeric | NOT NULL |
| `proveedor_id` | uuid | FK → sys_proveedores, NULL |
| `fecha` | timestamptz | NOT NULL DEFAULT now() |
| `motivo` | text | NULL |
| `subproducto_id` | uuid | FK → subproductos, NULL (v15) |
| `rendimiento_real` | numeric | NULL (v6) |
| `unidad_compra` | text | NULL (v6) |
| `cantidad_compra` | numeric | NULL (v6) |
| `orden_id` | uuid | FK → ordenes_semanales, NULL (v20) |
| `costo_unitario_momento` | numeric | NULL (v20) — costo congelado al momento del consumo |

**Constraint**: `CHECK (insumo_id IS NOT NULL OR subproducto_id IS NOT NULL)`

### 1.11 `profiles`
Roles y estado de cada usuario. Vinculada 1:1 con `auth.users`.

| Columna | Tipo | Constraints |
|---|---|---|
| `user_id` | uuid | PK, FK → auth.users ON DELETE CASCADE |
| `email` | text | NULL |
| `nombre` | text | NULL |
| `role` | text | NOT NULL DEFAULT 'consulta' CHECK IN ('admin','operador','consulta') |
| `activo` | boolean | NOT NULL DEFAULT true |
| `creado_en` | timestamptz | NOT NULL DEFAULT now() |

---

## 2. RPCs

Todas las funciones viven en `public` con `SECURITY DEFINER`. Los nombres
de parámetros son los que usa PostgREST: `p_nombre` → `nombre` en la
llamada JSON.

### 2.1 `siguiente_codigo(p_prefijo text, p_tabla text) → text`
Devuelve el siguiente código secuencial con lock (advisory) para evitar
colisiones concurrentes. `p_tabla ∈ ('insumos','subproductos','productos_terminados')`.

### 2.2 `registrar_entrada(p_insumo_id uuid, p_cantidad numeric, p_proveedor_id uuid, p_costo_unitario numeric, p_motivo text, p_rendimiento_real numeric) → jsonb`
Registra entrada de insumo. Convierte de unidad de compra a consumo,
recalcula costo promedio ponderado, y crea el movimiento.

Retorna: `{movimiento_id, existencia_nueva, costo_unitario, cantidad_consumo, factor_usado}`

### 2.3 `registrar_salida(p_insumo_id uuid, p_cantidad numeric, p_motivo text) → jsonb`
Descuenta stock en unidad de consumo. Valida existencia suficiente.

Retorna: `{movimiento_id, existencia_nueva}`

### 2.4 `guardar_subproducto(p_id uuid, p_codigo text, p_nombre text, p_existencia numeric, p_punto_reorden numeric, p_receta jsonb, p_hijos jsonb, p_tipo text) → subproductos`
Transaccional. Si `p_id` es NULL crea, si no actualiza. Borra receta e hijos
previos y los recrea. Detecta ciclos en la jerarquía.

`p_receta`: `[{insumo_id, cantidad, unidad_receta, factor_receta}]`
`p_hijos`: `[{subproducto_id, cantidad}]`

### 2.5 `guardar_paquete(p_codigo_pt text, p_es_nuevo boolean, p_nombre text, p_subproductos jsonb, p_insumos jsonb, p_unidades_por_caja integer, p_precio_venta numeric) → productos_terminados`
Transaccional. Análoga a `guardar_subproducto`.

### 2.6 `eliminar_insumo(p_id uuid) → void`
Valida dependencias (BOM, subproducto_recetas, movimientos). Falla con
mensaje si hay referencias.

### 2.7 `confirmar_orden(p_codigo_pt text, p_cantidad numeric, p_estado_cobertura text, p_detalle jsonb, p_numero_op text, p_cantidad_cajas numeric, p_lote text, p_prioridad integer, p_fecha_programada date) → ordenes_semanales`
Inserta una OP en estado Pendiente. `p_numero_op` y `p_lote` deben ser
únicos.

`p_detalle`: `{insumos:[...], subproductos:[...]}` — snapshot del cálculo
de cobertura al momento de confirmar.

### 2.8 `completar_orden(p_orden_id uuid) → jsonb`
**Fase 1**: valida contra el snapshot de `detalle_faltantes`. Si no existe
snapshot, recalcula desde BOM actual.
**Fase 2**: descuenta insumos y subproductos, inserta movimientos con
`orden_id` y `costo_unitario_momento`, suma el PT al inventario, marca la
OP como Terminada.

Retorna: `{ok, items_descontados, pt_producidos, fuente}` donde
`fuente ∈ ('snapshot','recalculo')`.

### 2.9 `cancelar_orden(p_orden_id uuid, p_motivo text) → jsonb`
Marca la OP como Cancelada. No toca el inventario.

### 2.10 `ajustar_inventario(p_insumo_id uuid, p_nueva_existencia numeric, p_motivo text) → jsonb`
Ajuste por conteo físico. Registra movimiento Entrada/Salida con la
diferencia.

Retorna: `{cambio, tipo}`

### 2.11 `ajustar_subproducto(p_id uuid, p_nueva_existencia numeric, p_motivo text) → jsonb`
Análoga para subproductos.

### 2.12 `producir_subproducto(p_id uuid, p_cantidad numeric, p_lote text, p_motivo text) → jsonb`
**Fase 1**: valida stock de insumos directos e hijos directos.
**Fase 2**: descuenta insumos e hijos, suma el subproducto al inventario,
inserta movimiento de entrada con `subproducto_id`.

Retorna: `{ok, items_afectados, existencia_nueva}`

### 2.13 `subproducto_costo(p_sub_id uuid, p_visited uuid[]) → numeric`
Cálculo recursivo. Uso interno de `costos_todos()`.

### 2.14 `paquete_costo(p_pt text) → numeric`
Cálculo recursivo. Uso interno de `costos_todos()`.

### 2.15 `costos_todos() → jsonb`
Devuelve todos los costos en un solo call.

Retorna: `{subproducto_costo: {uuid: number}, paquete_costo: {codigo_pt: number}}`

### 2.16 `current_user_role() → text`
Devuelve el rol del usuario actual (`admin`/`operador`/`consulta`). Uso
interno de las políticas RLS.

### 2.17 `handle_new_user() → trigger`
Trigger sobre `auth.users`. Crea el profile con rol `consulta` por defecto.

---

## 3. POLÍTICAS RLS

### 3.1 Tablas operativas (10)
`insumos`, `subproductos`, `productos_terminados`, `bom_recetas`,
`subproducto_recetas`, `subproducto_subproductos`, `paquete_subproductos`,
`ordenes_semanales`, `movimientos_inventario`, `sys_proveedores`.

| Política | Operación | Quién | Condición |
|---|---|---|---|
| `rol_select` | SELECT | authenticated | `true` |
| `rol_write` | ALL (INSERT/UPDATE/DELETE) | authenticated | `current_user_role() IN ('admin','operador')` |

### 3.2 `profiles`

| Política | Operación | Quién | Condición |
|---|---|---|---|
| `profiles_select` | SELECT | authenticated | `user_id = auth.uid() OR current_user_role() = 'admin'` |
| `profiles_write` | ALL | authenticated | `current_user_role() = 'admin'` |

**Regla de oro**: la seguridad vive en RLS. El frontend es cosmético.

---

## 4. FLUJOS CRÍTICOS

### 4.1 Confirmar → Completar OP

```
[Usuario]            [Frontend]              [Supabase]
   │                     │                       │
   ├─ Click "Calcular" ─►│                       │
   │                     ├─ GET bom_recetas ────►│
   │                     ├─ GET paquete_subs ───►│
   │                     ├─ calcula cobertura    │
   │                     │                       │
   ├─ Confirmar orden ──►│                       │
   │                     ├─ RPC confirmar_orden ►│ ← guarda snapshot
   │                     │  (detalle_faltantes)  │
   │                     │                       │
   ├─ Click "Terminar" ─►│                       │
   │                     ├─ RPC completar_orden ►│ ← Fase 1 valida
   │                     │                       │ ← Fase 2 muta
   │                     │◄─── {ok, fuente} ─────│
   │◄─ toast resultado ──│                       │
```

### 4.2 Entrada de insumo

```
[Usuario]                  [Frontend]              [Supabase]
   │                           │                       │
   ├─ Completa form ──────────►│                       │
   ├─ Click "Registrar" ──────►│                       │
   │                           ├─ RPC registrar_entrada ►│
   │                           │◄── {existencia_nueva} ─│
   │◄─ toast ──────────────────│                       │
```

### 4.3 Producir subproducto

```
[RPC producir_subproducto]
  ↓
  FASE 1: valida stock de insumos y hijos directos
  ↓
  FASE 2 (transacción):
    1. UPDATE insumos SET existencia -= requerido (por cada insumo)
    2. INSERT movimientos_inventario (insumo_id, tipo='Consumo', orden_id=null)
    3. UPDATE subproductos SET existencia -= requerido (por cada hijo)
    4. INSERT movimientos_inventario (subproducto_id, tipo='Consumo')
    5. UPDATE subproductos SET existencia += cantidad (el padre)
    6. INSERT movimientos_inventario (subproducto_id, tipo='Entrada')
  ↓
  Retorna {ok, items_afectados, existencia_nueva}
```

### 4.4 Conteo físico (ajuste)

```
[Usuario]                  [Frontend]              [Supabase]
   │                           │                       │
   ├─ "Cargar existencias" ──►│                       │
   │                           ├─ GET insumos ────────►│
   │                           ├─ GET subproductos ───►│
   │                           │                       │
   ├─ Escribe conteos ───────►│                       │
   ├─ "Aplicar ajustes" ─────►│                       │
   │                           ├─ RPC ajustar_inv ───►│ (por cada uno)
   │                           ├─ RPC ajustar_sub ───►│
   │◄─ toast resumen ──────────│                       │
```

---

## 5. MODELOS C# SUGERIDOS

```csharp
public class Insumo {
    public Guid Id { get; set; }
    public string Codigo { get; set; }
    public string Nombre { get; set; }
    public string UnidadMedida { get; set; }
    public decimal ExistenciaActual { get; set; }
    public decimal PuntoReorden { get; set; }
    public bool EstadoActivo { get; set; }
    public DateTimeOffset CreadoEn { get; set; }
    public string? UnidadConsumo { get; set; }
    public decimal? FactorConversion { get; set; }
    public string? UnidadSecundaria { get; set; }
    public decimal? FactorSecundario { get; set; }
    public decimal CostoUnitario { get; set; }
    public string ConversionesJson { get; set; } // parsear a List<Conversion>
    public TipoConversion TipoConversion { get; set; }

    public List<Conversion> Conversiones =>
        JsonSerializer.Deserialize<List<Conversion>>(ConversionesJson) ?? new();
}

public enum TipoConversion { Fijo, Dimensional, Variable }

public class Conversion {
    public string Unidad { get; set; }
    public decimal Factor { get; set; }
    public Formula? Formula { get; set; }
}

public class Formula {
    public decimal? Ancho { get; set; }
    public decimal? Largo { get; set; }
}

public class Subproducto {
    public Guid Id { get; set; }
    public string Codigo { get; set; }
    public string Nombre { get; set; }
    public bool EstadoActivo { get; set; }
    public DateTimeOffset CreadoEn { get; set; }
    public decimal ExistenciaActual { get; set; }
    public decimal? PuntoReorden { get; set; }
    public TipoSubproducto Tipo { get; set; }
}

public enum TipoSubproducto { Intermedio, Final, Ambos }

public class ProductoTerminado {
    public string CodigoPt { get; set; }
    public string Nombre { get; set; }
    public bool EstadoActivo { get; set; }
    public DateTimeOffset CreadoEn { get; set; }
    public int UnidadesPorCaja { get; set; }
    public decimal ExistenciaActual { get; set; }
    public decimal? PrecioVenta { get; set; }
}

public class OrdenSemanal {
    public Guid Id { get; set; }
    public string CodigoPt { get; set; }
    public decimal CantidadProyectada { get; set; }
    public string EstadoCobertura { get; set; }
    public string? DetalleFaltantesJson { get; set; }
    public DateTimeOffset FechaCreacion { get; set; }
    public string? NumeroOp { get; set; }
    public EstadoOp EstadoOp { get; set; }
    public decimal? CantidadCajas { get; set; }
    public DateTimeOffset? FechaCompletado { get; set; }
    public DateTimeOffset? FechaCancelado { get; set; }
    public string? MotivoCancelacion { get; set; }
    public string? Lote { get; set; }
    public int? Prioridad { get; set; }
    public DateOnly? FechaProgramada { get; set; }
}

public enum EstadoOp { Pendiente, EnProceso, Terminada, Cancelada }

public class MovimientoInventario {
    public Guid Id { get; set; }
    public Guid? InsumoId { get; set; }
    public Guid? SubproductoId { get; set; }
    public string Tipo { get; set; }
    public decimal Cantidad { get; set; }
    public Guid? ProveedorId { get; set; }
    public DateTimeOffset Fecha { get; set; }
    public string? Motivo { get; set; }
    public decimal? RendimientoReal { get; set; }
    public string? UnidadCompra { get; set; }
    public decimal? CantidadCompra { get; set; }
    public Guid? OrdenId { get; set; }
    public decimal? CostoUnitarioMomento { get; set; }
}

public class Profile {
    public Guid UserId { get; set; }
    public string? Email { get; set; }
    public string? Nombre { get; set; }
    public string Role { get; set; }
    public bool Activo { get; set; }
    public DateTimeOffset CreadoEn { get; set; }
}
```

---

## 6. INTERFAZ DE SERVICIO C# SUGERIDA

```csharp
public interface IInventarioService {
    // Catálogo
    Task<List<Insumo>> GetInsumosAsync();
    Task<List<Subproducto>> GetSubproductosAsync();
    Task<List<ProductoTerminado>> GetProductosTerminadosAsync();
    Task<List<Proveedor>> GetProveedoresAsync();

    // BOM
    Task<List<BomReceta>> GetBomRecetasAsync(string codigoPt);
    Task<List<SubproductoReceta>> GetSubproductoRecetasAsync(Guid subproductoId);
    Task<List<PaqueteSubproducto>> GetPaqueteSubproductosAsync(string codigoPt);

    // Cálculos (equivalentes a calcularCostos y calcularCobertura)
    Task<Dictionary<Guid, decimal>> CalcularCostosSubproductosAsync();
    Task<Dictionary<string, decimal>> CalcularCostosPaquetesAsync();
    Task<CoberturaResult> CalcularCoberturaAsync(string codigoPt, decimal cantidad);

    // Operaciones (equivalentes a los RPC)
    Task<EntradaResult> RegistrarEntradaAsync(EntradaRequest req);
    Task<SalidaResult> RegistrarSalidaAsync(SalidaRequest req);
    Task<ProductoTerminado> GuardarPaqueteAsync(GuardarPaqueteRequest req);
    Task<Subproducto> GuardarSubproductoAsync(GuardarSubproductoRequest req);
    Task<OrdenSemanal> ConfirmarOrdenAsync(ConfirmarOrdenRequest req);
    Task<CompletarOrdenResult> CompletarOrdenAsync(Guid ordenId);
    Task CancelarOrdenAsync(Guid ordenId, string? motivo);
    Task<ProducirResult> ProducirSubproductoAsync(ProducirRequest req);
    Task<AjusteResult> AjustarInsumoAsync(Guid insumoId, decimal nuevaExistencia, string motivo);
    Task<AjusteResult> AjustarSubproductoAsync(Guid subId, decimal nuevaExistencia, string motivo);

    // Utilidades
    Task<string> SiguienteCodigoAsync(string prefijo, string tabla);
    Task<CostosTodos> GetCostosTodosAsync();
}
```

---

## 7. NOTAS DE PORT

### 7.1 Capa 1 vs Capa 2
- **Capa 1** (`inventario_core.js`): funciones puras → **traducir a clases helper C#**. Ej: `CostosCalculator`, `CoberturaCalculator`, `Formatter`.
- **Capa 2** (`inventario_v22.js`): render, red, estado de UI → **reescribir como componentes Blazor/MAUI**.

### 7.2 Persistencia
- En web: PostgREST sobre Supabase.
- En .NET: EF Core o Dapper apuntando al mismo Postgres, o llamar a Supabase por HTTP.
- **Recomendación**: usar `Npgsql` + Dapper para llamar a los RPC directamente. Los RPC ya están escritos y probados.

### 7.3 Autenticación
- Web: `@supabase/supabase-js`.
- .NET: `Supabase.Client` (paquete oficial `Supabase` en NuGet).
- Los tokens JWT se pasan igual a las RPC.

### 7.4 Formateo
- `money()` → `value.ToString("C", new CultureInfo("es-CO"))`
- `num(n, dec)` → `value.ToString($"N{dec}", new CultureInfo("es-CO"))`
- `fmtCSV` → cuidado con la coma decimal (Excel español)

### 7.5 Chart.js
- En Blazor: usar `<Chart>` de Blazorise o ChartJS.Blazor.
- En MAUI: usar LiveCharts2 con los mismos `{labels, datasets}` que produce la Capa 1.

### 7.6 RLS
- RLS sigue activo en Postgres.
- En .NET, si usás service role key, bypasea RLS. **No lo hagas** en producción.
- Usá el JWT del usuario autenticado (como hoy).

---

**Fin del contrato.**