# Contrato de API — AseptiQ

**Versión:** 1.2
**Última actualización:** Octubre 2026
**Base de datos:** Supabase (PostgreSQL 15)
**Backend destino del port:** .NET 8 (Blazor o MAUI)

Documento de referencia del backend: tablas, RPCs, políticas RLS y flujos críticos.

---

## 1. Tablas

Todas en el schema `public`, todas con RLS activo.

### 1.1 `insumos`

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `codigo` | text | NOT NULL, UNIQUE |
| `nombre` | text | NOT NULL |
| `unidad_medida` | text | NOT NULL — primera unidad de la cadena |
| `existencia_actual` | numeric | NOT NULL DEFAULT 0 — en unidad de consumo |
| `punto_reorden` | numeric | NOT NULL CHECK > 0 — stock objetivo |
| `estado_activo` | boolean | NOT NULL DEFAULT true |
| `creado_en` | timestamptz | NOT NULL DEFAULT now() |
| `unidad_consumo` | text | NULL — espejo legacy del último eslabón |
| `factor_conversion` | numeric | NULL — espejo legacy |
| `unidad_secundaria` | text | NULL |
| `factor_secundario` | numeric | NULL |
| `costo_unitario` | numeric | NOT NULL DEFAULT 0 CHECK >= 0 — por unidad de consumo |
| `conversiones` | jsonb | NOT NULL DEFAULT '[]' — `[{unidad, factor, formula?}]` |
| `tipo_conversion` | text | NOT NULL DEFAULT 'fijo' — `fijo` / `dimensional` / `variable` |

### 1.2 `subproductos`

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `codigo` | text | NOT NULL, UNIQUE |
| `nombre` | text | NOT NULL |
| `estado_activo` | boolean | NOT NULL DEFAULT true |
| `existencia_actual` | numeric | NOT NULL DEFAULT 0 |
| `punto_reorden` | numeric | DEFAULT 0, CHECK >= 0 |
| `tipo` | text | NOT NULL DEFAULT 'ambos' — `intermedio` / `final` / `ambos` |

### 1.3 `productos_terminados`

| Columna | Tipo | Constraints |
|---|---|---|
| `codigo_pt` | text | PK |
| `nombre` | text | NOT NULL |
| `estado_activo` | boolean | NOT NULL DEFAULT true |
| `unidades_por_caja` | integer | NOT NULL DEFAULT 1 |
| `existencia_actual` | numeric | NOT NULL DEFAULT 0 |
| `precio_venta` | numeric | NULL, CHECK >= 0 |

### 1.4 `bom_recetas`

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `codigo_pt` | text | FK → productos_terminados |
| `insumo_id` | uuid | FK → insumos |
| `cantidad_por_unidad` | numeric | NOT NULL |

### 1.5 `subproducto_recetas`

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `subproducto_id` | uuid | FK → subproductos |
| `insumo_id` | uuid | FK → insumos |
| `cantidad_por_unidad` | numeric | NOT NULL |
| `unidad_receta` | text | NULL |
| `factor_receta` | numeric | NOT NULL DEFAULT 1 |

### 1.6 `subproducto_subproductos`

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `subproducto_padre_id` | uuid | FK → subproductos |
| `subproducto_hijo_id` | uuid | FK → subproductos |
| `cantidad_por_unidad` | numeric | NOT NULL |

### 1.7 `paquete_subproductos`

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `codigo_pt` | text | FK → productos_terminados |
| `subproducto_id` | uuid | FK → subproductos |
| `cantidad` | numeric | NOT NULL |

### 1.8 `sys_proveedores`

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `nit` | text | NOT NULL, UNIQUE |
| `razon_social` | text | NOT NULL |
| `direccion` | text | NULL |
| `contactos` | jsonb | NOT NULL DEFAULT '[]' — `[{nombre, telefono, correo}]` |

### 1.9 `ordenes_semanales`

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `codigo_pt` | text | FK → productos_terminados |
| `cantidad_proyectada` | numeric | NOT NULL |
| `estado_cobertura` | text | NOT NULL DEFAULT 'Cubierta' |
| `detalle_faltantes` | jsonb | snapshot de cobertura |
| `numero_op` | text | UNIQUE parcial |
| `estado_op` | text | CHECK IN (`Pendiente`,`En proceso`,`Terminada`,`Cancelada`) |
| `lote` | text | UNIQUE parcial |
| `prioridad` | integer | 1=Muy alta, 2=Alta, 3=Normal, 4=Baja |
| `fecha_programada` | date | |
| `cantidad_producida` | numeric | NOT NULL DEFAULT 0 |
| `fecha_ultima_entrega` | timestamptz | |

### 1.10 `movimientos_inventario`

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `insumo_id` | uuid | FK → insumos, NULL |
| `subproducto_id` | uuid | FK → subproductos, NULL |
| `tipo` | text | Entrada / Salida / Consumo |
| `cantidad` | numeric | NOT NULL |
| `proveedor_id` | uuid | FK → sys_proveedores, NULL |
| `orden_id` | uuid | FK → ordenes_semanales, NULL |
| `costo_unitario_momento` | numeric | NULL — costo congelado |
| `fecha` | timestamptz | |

Constraint: `CHECK (insumo_id IS NOT NULL OR subproducto_id IS NOT NULL)`.

### 1.11 `entregas_op`

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `orden_id` | uuid | FK → ordenes_semanales |
| `cantidad` | numeric | CHECK > 0 |
| `lote_entrega` | text | NULL |
| `motivo` | text | NULL |
| `usuario_id` | uuid | NULL |
| `usuario_email` | text | NULL |
| `fecha` | timestamptz | NOT NULL DEFAULT now() |

### 1.12 `ajustes_costo_insumo`

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `insumo_id` | uuid | FK → insumos |
| `costo_anterior` | numeric | NOT NULL |
| `costo_nuevo` | numeric | NOT NULL |
| `motivo` | text | NULL |
| `usuario_id` | uuid | NULL |
| `usuario_email` | text | NULL |
| `fecha` | timestamptz | NOT NULL DEFAULT now() |

### 1.13 `profiles`

| Columna | Tipo | Constraints |
|---|---|---|
| `user_id` | uuid | PK, FK → auth.users |
| `email` | text | NULL |
| `nombre` | text | NULL |
| `role` | text | NOT NULL DEFAULT 'consulta' |
| `activo` | boolean | NOT NULL DEFAULT true |
| `creado_en` | timestamptz | NOT NULL DEFAULT now() |

### 1.14 `backup_log`

| Columna | Tipo | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `usuario_id` | uuid | NULL |
| `usuario_email` | text | NULL |
| `tablas_incluidas` | jsonb | NOT NULL DEFAULT '[]' |
| `rango_movimientos` | text | NULL |
| `total_registros` | integer | NOT NULL DEFAULT 0 |
| `tamano_bytes` | bigint | NULL |
| `fecha` | timestamptz | NOT NULL DEFAULT now() |

---

## 2. RPCs

Todas con `SECURITY DEFINER`. Los parámetros usan prefijo `p_` en la firma y se llaman sin prefijo desde el cliente HTTP.

### 2.1 `siguiente_codigo(p_prefijo text, p_tabla text) → text`

Siguiente código con lock. `p_tabla ∈ ('insumos','subproductos','productos_terminados')`.

### 2.2 `registrar_entrada(p_insumo_id, p_cantidad, p_proveedor_id, p_costo_unitario, p_motivo, p_rendimiento_real) → jsonb`

Registra entrada de insumo. Convierte a unidad de consumo, recalcula costo promedio ponderado, guarda `costo_unitario_momento`.

Retorna: `{movimiento_id, existencia_nueva, costo_unitario, cantidad_consumo, factor_usado}`

### 2.3 `registrar_salida(p_insumo_id, p_cantidad, p_motivo) → jsonb`

Salida manual. Valida existencia.

### 2.4 `guardar_subproducto(p_id, p_codigo, p_nombre, p_existencia, p_punto_reorden, p_receta jsonb, p_hijos jsonb, p_tipo) → subproductos`

Transaccional. Crea/actualiza subproducto con receta e hijos. Detecta ciclos.

### 2.5 `guardar_paquete(p_codigo_pt, p_es_nuevo, p_nombre, p_subproductos jsonb, p_insumos jsonb, p_unidades_por_caja, p_precio_venta) → productos_terminados`

Transaccional. Crea/actualiza PT con composición.

### 2.6 `eliminar_insumo(p_id) → void`

Valida dependencias antes de borrar.

### 2.7 `confirmar_orden(p_codigo_pt, p_cantidad, p_estado_cobertura, p_detalle jsonb, p_numero_op, p_cantidad_cajas, p_lote, p_prioridad, p_fecha_programada) → ordenes_semanales`

Inserta OP en estado Pendiente.

### 2.8 `registrar_entrega_op(p_orden_id, p_cantidad, p_lote_entrega, p_motivo) → jsonb`

**Núcleo del sistema de entregas parciales.**

1. Valida que no exceda `cantidad_proyectada`.
2. Calcula factor = `p_cantidad / cantidad_proyectada`.
3. Valida stock **de esa fracción**.
4. Descuenta insumos y subproductos proporcionalmente.
5. Ingresa el PT al inventario.
6. Registra en `entregas_op`.
7. Si cierra → `Terminada`. Si no → `En proceso`.

Retorna: `{ok, items_afectados, cantidad_entregada, cantidad_producida, cantidad_pendiente, op_cerrada}`

### 2.9 `cancelar_orden(p_orden_id, p_motivo) → jsonb`

Cancela OP. No toca inventario.

### 2.10 `ajustar_inventario(p_insumo_id, p_nueva_existencia, p_motivo) → jsonb`

Ajuste por conteo físico. Registra movimiento Entrada o Salida según diferencia.

### 2.11 `ajustar_subproducto(p_id, p_nueva_existencia, p_motivo) → jsonb`

Análoga para subproductos.

### 2.12 `producir_subproducto(p_id, p_cantidad, p_lote, p_motivo) → jsonb`

Valida y descuenta insumos directos e hijos directos del subproducto.

### 2.13 `registrar_devolucion(p_insumo_id, p_cantidad, p_proveedor_id, p_motivo) → jsonb`

Devolución a proveedor. Descuenta stock y registra Salida con `proveedor_id`.

### 2.14 `ajustar_costo_insumo(p_insumo_id, p_costo_nuevo, p_motivo) → jsonb`

Ajuste manual de costo con trazabilidad en `ajustes_costo_insumo`.

### 2.15 `costos_todos() → jsonb`

Mapa completo de costos.

Retorna: `{subproducto_costo: {uuid: number}, paquete_costo: {codigo_pt: number}}`

### 2.16 `subproducto_costo(p_sub_id, p_visited)` y `paquete_costo(p_pt)`

Helpers internos para `costos_todos`.

### 2.17 `current_user_role() → text`

Rol del usuario actual. Uso interno de RLS.

### 2.18 `handle_new_user() → trigger`

Trigger sobre `auth.users`. Crea profile con rol `consulta` por defecto.

---

## 3. Políticas RLS

### 3.1 Tablas operativas (10)

`insumos`, `subproductos`, `productos_terminados`, `bom_recetas`, `subproducto_recetas`, `subproducto_subproductos`, `paquete_subproductos`, `ordenes_semanales`, `movimientos_inventario`, `sys_proveedores`.

| Política | Operación | Quién | Condición |
|---|---|---|---|
| `rol_select` | SELECT | authenticated | `true` |
| `rol_write` | ALL | authenticated | `current_user_role() IN ('admin','operador')` |

### 3.2 `profiles`

| Política | Operación | Condición |
|---|---|---|
| `profiles_select` | SELECT | `user_id = auth.uid() OR current_user_role() = 'admin'` |
| `profiles_write` | ALL | `current_user_role() = 'admin'` |

### 3.3 `entregas_op`, `ajustes_costo_insumo`, `backup_log`

- SELECT: authenticated.
- WRITE: `current_user_role() IN ('admin','operador')`.

---

## 4. Flujos críticos

### 4.1 Confirmar → Entregar (parcial o total) → Completar

```
[Usuario]          [Frontend]              [Supabase]
   │                   │                       │
   ├─ Calcular ───────►│                       │
   │                   ├─ GET bom_recetas ────►│
   │                   ├─ GET paquete_subs ───►│
   │                   ├─ calcula cobertura    │
   │                   │                       │
   ├─ Confirmar OP ───►│                       │
   │                   ├─ RPC confirmar_orden ►│ ← guarda snapshot
   │                   │                       │
   ├─ Entrega parcial ►│                       │
   │                   ├─ RPC registrar_entrega_op ►│ ← valida, descuenta proporcional
   │                   │◄── {op_cerrada:false} ─│
   │                   │                       │
   ├─ Entrega final ──►│                       │
   │                   ├─ RPC registrar_entrega_op ►│ ← cierra OP
   │                   │◄── {op_cerrada:true} ──│
```

### 4.2 Entrada de insumo

```
RPC registrar_entrada:
  1. Valida cantidad > 0.
  2. Bloquea el insumo.
  3. Convierte cantidad de compra a consumo.
  4. Recalcula costo promedio ponderado.
  5. Actualiza insumos.
  6. Registra movimiento con costo_unitario_momento.
```

### 4.3 Producir subproducto

```
RPC producir_subproducto:
  FASE 1: valida insumos e hijos directos.
  FASE 2:
    1. Descuenta insumos.
    2. Descuenta subproductos hijos.
    3. Suma el subproducto al inventario.
    4. Registra movimientos.
```

### 4.4 Conteo físico

```
1. Cargar existencias (GET insumos + subproductos).
2. Usuario escribe conteos.
3. Aplicar ajustes → N llamadas RPC ajustar_*.
```

### 4.5 Backup

```
Frontend:
  1. Fetch todas las tablas.
  2. Convierte a CSV.
  3. Arma ZIP en cliente con JSZip.
  4. Descarga.
  5. Registra en backup_log.
```

---

## 5. Modelos C# sugeridos

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
    public decimal CostoUnitario { get; set; }
    public string ConversionesJson { get; set; }
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
    public decimal ExistenciaActual { get; set; }
    public decimal? PuntoReorden { get; set; }
    public TipoSubproducto Tipo { get; set; }
}

public enum TipoSubproducto { Intermedio, Final, Ambos }

public class ProductoTerminado {
    public string CodigoPt { get; set; }
    public string Nombre { get; set; }
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
    public string? NumeroOp { get; set; }
    public EstadoOp EstadoOp { get; set; }
    public string? Lote { get; set; }
    public int? Prioridad { get; set; }
    public DateOnly? FechaProgramada { get; set; }
    public decimal CantidadProducida { get; set; }
    public DateTimeOffset? FechaUltimaEntrega { get; set; }
}

public enum EstadoOp { Pendiente, EnProceso, Terminada, Cancelada }

public class EntregaOp {
    public Guid Id { get; set; }
    public Guid OrdenId { get; set; }
    public decimal Cantidad { get; set; }
    public string? LoteEntrega { get; set; }
    public string? Motivo { get; set; }
    public string? UsuarioEmail { get; set; }
    public DateTimeOffset Fecha { get; set; }
}
```

---

## 6. Interfaz de servicio C# sugerida

```csharp
public interface IAseptiqService {
    // Catálogo
    Task<List<Insumo>> GetInsumosAsync();
    Task<List<Subproducto>> GetSubproductosAsync();
    Task<List<ProductoTerminado>> GetProductosTerminadosAsync();
    Task<List<Proveedor>> GetProveedoresAsync();

    // BOM
    Task<List<BomReceta>> GetBomRecetasAsync(string codigoPt);
    Task<List<SubproductoReceta>> GetSubproductoRecetasAsync(Guid subproductoId);
    Task<List<PaqueteSubproducto>> GetPaqueteSubproductosAsync(string codigoPt);

    // Cálculos
    Task<Dictionary<Guid, decimal>> CalcularCostosSubproductosAsync();
    Task<Dictionary<string, decimal>> CalcularCostosPaquetesAsync();
    Task<CoberturaResult> CalcularCoberturaAsync(string codigoPt, decimal cantidad);

    // Operaciones
    Task<EntradaResult> RegistrarEntradaAsync(EntradaRequest req);
    Task<SalidaResult> RegistrarSalidaAsync(SalidaRequest req);
    Task<ProductoTerminado> GuardarPaqueteAsync(GuardarPaqueteRequest req);
    Task<Subproducto> GuardarSubproductoAsync(GuardarSubproductoRequest req);
    Task<OrdenSemanal> ConfirmarOrdenAsync(ConfirmarOrdenRequest req);
    Task<EntregaResult> RegistrarEntregaOpAsync(Guid ordenId, decimal cantidad, string? lote, string? motivo);
    Task CancelarOrdenAsync(Guid ordenId, string? motivo);
    Task<ProducirResult> ProducirSubproductoAsync(ProducirRequest req);
    Task<AjusteResult> AjustarInsumoAsync(Guid insumoId, decimal nuevaExistencia, string motivo);
    Task<AjusteResult> AjustarSubproductoAsync(Guid subId, decimal nuevaExistencia, string motivo);
    Task<DevolucionResult> RegistrarDevolucionAsync(DevolucionRequest req);
    Task<AjusteCostoResult> AjustarCostoAsync(Guid insumoId, decimal nuevoCosto, string? motivo);

    // Utilidades
    Task<string> SiguienteCodigoAsync(string prefijo, string tabla);
    Task<CostosTodos> GetCostosTodosAsync();
}
```

---

## 7. Notas de port

### 7.1 Capas
- **Capa 1** (`aseptiq_core.js`): funciones puras → traducir a C#. Ej: `CostosCalculator`, `CoberturaCalculator`, `Formatter`.
- **Capa 2** (`aseptiq_app.js`): UI, red, estado → reescribir como componentes Razor / XAML.

### 7.2 Persistencia
- Web: PostgREST.
- .NET: `Supabase.Client` (NuGet oficial) o `Npgsql` + Dapper.
- Recomendado: `Supabase.Client` para mantener RLS activo.

### 7.3 Autenticación
- `Supabase.Client.Auth.SignInWithPasswordAsync(email, password)`.
- El JWT se persiste con `SecureStorage` de MAUI.
- La URL y la anon key se embeben en el port (no son user-provided).

### 7.4 Formateo
- `money()` → `value.ToString("C", new CultureInfo("es-CO"))`
- `num()` → `value.ToString("N2", new CultureInfo("es-CO"))`
- CSV con `CsvHelper` y separador `;`.

### 7.5 Gráficos
- Web: Chart.js.
- .NET: LiveCharts2 (MAUI/WPF) o Chart.js por WebView.

### 7.6 RLS
- Sigue activo.
- No usar service_role key en el port.
- Siempre enviar el JWT del usuario.

---

**Fin del contrato.**