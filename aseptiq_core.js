/* =========================================================================
 * INVENTARIO CORE
 * -------------------------------------------------------------------------
 * Lógica de negocio pura. Sin dependencias de DOM, fetch, Chart.js ni
 * Supabase. Recibe estructuras de datos y devuelve estructuras de datos.
 *
 * PORTABILIDAD A .NET:
 *   · Cada función es traducible 1:1 a C#.
 *   · `money`, `num`, `fmtCSV` mapean a CultureInfo("es-CO") y ToString("N2").
 *   · `calcularCostos` mapea a un método recursivo con Dictionary<Guid, decimal>.
 *   · `calcConsumoMensualPorInsumo` y familia son LINQ GroupBy + Select.
 *   · No usa callbacks ni promesas: todo es síncrono.
 * ========================================================================= */

/* =========================================================================
 * 1. FORMATEO
 * ========================================================================= */

function money(n){return(Number(n)||0).toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2});}
function num(n,d){if(n===null||n===undefined||isNaN(n))return '—';return Number(n).toLocaleString('es-CO',{maximumFractionDigits:d===undefined?2:d});}
function fmtCSV(v,dec){
  if(v===null||v===undefined)return '';
  if(typeof v==='number')return v.toFixed(dec===undefined?2:dec).replace('.',',');
  return v;
}

/* =========================================================================
 * 2. CADENA DE CONVERSIONES (unidad de compra → unidad de consumo)
 * ========================================================================= */

function getCadena(insumo){
  const c=insumo&&insumo.conversiones;
  if(Array.isArray(c)&&c.length>0)return c;
  return [{unidad:(insumo&&insumo.unidad_medida)||'u',factor:1}];
}
function unidadCompra(i){return getCadena(i)[0].unidad;}
function unidadConsumo(i){const c=getCadena(i);return c[c.length-1].unidad;}
function factorTotal(i){
  const c=getCadena(i);
  if(c.length<=1)return 1;
  return c.slice(0,-1).reduce(function(a,n){return a*(Number(n.factor)||1);},1);
}
function cadenaTexto(i){
  const c=getCadena(i);
  return c.map(function(n,idx){
    const ult=idx===c.length-1;
    if(ult)return '<span class="conv-tag">'+n.unidad+'</span>';
    const dim=n.formula&&n.formula.ancho&&n.formula.largo?' <span style="color:var(--text-muted);font-size:11px;">('+n.formula.ancho+'×'+n.formula.largo+')</span>':'';
    return n.unidad+' <span class="conv-arrow">×'+num(n.factor,4)+dim+' →</span> ';
  }).join('');
}
function formatearExistencia(i){
  const uC=unidadConsumo(i),uP=unidadCompra(i),f=factorTotal(i);
  const base=num(i.existencia_actual)+' '+uC;
  if(f>1)return base+' <span style="color:var(--text-muted);font-size:11.5px;">(≈ '+num(i.existencia_actual/f)+' '+uP+')</span>';
  return base;
}

/* =========================================================================
 * 3. UMBRALES DE STOCK
 * =========================================================================
 * o: objeto con existencia_actual y punto_reorden (stock objetivo).
 * cfg: opcional. Si no se pasa, usa getConfig() si existe en el entorno.
 */

let _cfgCache=null;
function _invalidateConfigCache(){_cfgCache=null;}
function estadoInsumo(o,cfg){
  if(!cfg){
    if(_cfgCache)cfg=_cfgCache;
    else if(typeof getConfig==='function'){cfg=getConfig();_cfgCache=cfg;}
    else cfg={umbralUrgente:20,umbralReorden:50};
  }
  const objetivo=Number(o.punto_reorden)||0;
  const e=Number(o.existencia_actual)||0;
  if(objetivo<=0)return e>0?'Cubierto':'Urgente';
  const uU=objetivo*(Number(cfg.umbralUrgente)||20)/100;
  const uR=objetivo*(Number(cfg.umbralReorden)||50)/100;
  if(e<=uU)return 'Urgente';
  if(e<=uR+1)return 'Reorden';
  return 'Cubierto';
}
function peorEstado(a){
  if(a.includes('Urgente'))return 'Urgente';
  if(a.includes('Reorden'))return 'Reorden';
  return 'Cubierto';
}

/* =========================================================================
 * 4. COSTOS RECURSIVOS
 * =========================================================================
 * Datos de entrada (arrays):
 *   insumos:      [{id, costo_unitario, ...}]
 *   subproductos: [{id, ...}]
 *   recetas:      [{subproducto_id, insumo_id, cantidad_por_unidad, factor_receta}]
 *   hijos:        [{subproducto_padre_id, subproducto_hijo_id, cantidad_por_unidad}]
 *   bom:          [{codigo_pt, insumo_id, cantidad_por_unidad}]
 *   paqueteSubs:  [{codigo_pt, subproducto_id, cantidad}]
 */

function calcularCostos(data){
  const {insumos,subproductos,recetas,hijos,bom,paqueteSubs}=data;
  const insMap={};insumos.forEach(function(i){insMap[i.id]=i;});
  const recMap={};(recetas||[]).forEach(function(r){(recMap[r.subproducto_id]=recMap[r.subproducto_id]||[]).push(r);});
  const hijMap={};(hijos||[]).forEach(function(h){(hijMap[h.subproducto_padre_id]=hijMap[h.subproducto_padre_id]||[]).push(h);});
  const bomMap={};(bom||[]).forEach(function(b){(bomMap[b.codigo_pt]=bomMap[b.codigo_pt]||[]).push(b);});
  const psMap={};(paqueteSubs||[]).forEach(function(p){(psMap[p.codigo_pt]=psMap[p.codigo_pt]||[]).push(p);});
  const subCosto={};
  function calcSub(id,visited){
    if(subCosto[id]!==undefined)return subCosto[id];
    if(visited.indexOf(id)>=0)return 0;
    const nv=visited.concat([id]);
    let total=0;
    (recMap[id]||[]).forEach(function(r){
      const ins=insMap[r.insumo_id];
      if(ins)total+=(ins.costo_unitario||0)*r.cantidad_por_unidad*(r.factor_receta||1);
    });
    (hijMap[id]||[]).forEach(function(h){total+=calcSub(h.subproducto_hijo_id,nv)*h.cantidad_por_unidad;});
    subCosto[id]=total;return total;
  }
  subproductos.forEach(function(s){calcSub(s.id,[]);});
  const paqCosto={};
  const allPT={};Object.keys(psMap).forEach(function(k){allPT[k]=1;});Object.keys(bomMap).forEach(function(k){allPT[k]=1;});
  Object.keys(allPT).forEach(function(pt){
    let t=0;
    (bomMap[pt]||[]).forEach(function(b){const ins=insMap[b.insumo_id];if(ins)t+=(ins.costo_unitario||0)*b.cantidad_por_unidad;});
    (psMap[pt]||[]).forEach(function(p){t+=(subCosto[p.subproducto_id]||0)*p.cantidad;});
    paqCosto[pt]=t;
  });
  return {subCosto:subCosto,paqCosto:paqCosto};
}

/* =========================================================================
 * 5. AGRUPACIONES HISTÓRICAS
 * ========================================================================= */

function _mesLabel(fecha){const d=new Date(fecha);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function _mesesAtras(n){
  const arr=[];const hoy=new Date();
  for(let i=n-1;i>=0;i--){const d=new Date(hoy.getFullYear(),hoy.getMonth()-i,1);arr.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));}
  return arr;
}
function _paleta(i){
  const p=['#ffb020','#6ab7ff','#3ddc84','#ff5c5c','#b48cff','#ff8c42','#42d9c8','#e879d5'];
  return p[i%p.length];
}

function calcConsumoMensualPorInsumo(movs,insumos,top,mesesAtras){
  const meses=_mesesAtras(mesesAtras);
  const porInsumo={};
  movs.forEach(function(m){
    if(m.tipo!=='Consumo')return;
    if(!m.insumo_id)return;
    const mes=_mesLabel(m.fecha);
    if(meses.indexOf(mes)<0)return;
    if(!porInsumo[m.insumo_id])porInsumo[m.insumo_id]={id:m.insumo_id,total:0,serie:{}};
    porInsumo[m.insumo_id].total+=(Number(m.cantidad)||0);
    porInsumo[m.insumo_id].serie[mes]=(porInsumo[m.insumo_id].serie[mes]||0)+(Number(m.cantidad)||0);
  });
  const ordenados=Object.values(porInsumo).sort(function(a,b){return b.total-a.total;}).slice(0,top);
  const datasets=ordenados.map(function(item,i){
    const ins=insumos.find(function(x){return x.id===item.id;});
    return {
      label:ins?ins.nombre:'?',
      data:meses.map(function(m){return item.serie[m]||0;}),
      borderColor:_paleta(i),
      backgroundColor:_paleta(i)+'22',
      tension:0.3,fill:false,pointRadius:2,pointHoverRadius:5
    };
  });
  return {labels:meses,datasets:datasets};
}

function calcOrdenesPorMes(ordenes,mesesAtras){
  const meses=_mesesAtras(mesesAtras);
  const porMes={};
  meses.forEach(function(m){porMes[m]={ops:0,unidades:0};});
  ordenes.forEach(function(o){
    const m=_mesLabel(o.fecha_creacion);
    if(!porMes[m])return;
    porMes[m].ops+=1;
    porMes[m].unidades+=(Number(o.cantidad_proyectada)||0);
  });
  return {
    labels:meses,
    datasets:[
      {label:'N° OPs',data:meses.map(function(m){return porMes[m].ops;}),backgroundColor:'#ffb020',borderRadius:4,yAxisID:'y'},
      {label:'Unidades producidas',data:meses.map(function(m){return porMes[m].unidades;}),backgroundColor:'#6ab7ff',borderRadius:4,yAxisID:'y1'}
    ]
  };
}

function calcMovimientosPorTipo(movs,dias){
  const corte=new Date();corte.setDate(corte.getDate()-dias);
  const conteo={Entrada:0,Salida:0,Consumo:0};
  movs.forEach(function(m){
    if(new Date(m.fecha)<corte)return;
    if(conteo[m.tipo]!==undefined)conteo[m.tipo]+=1;
  });
  return {
    labels:['Entradas','Salidas','Consumos'],
    datasets:[{data:[conteo.Entrada,conteo.Salida,conteo.Consumo],backgroundColor:['#3ddc84','#ff5c5c','#ffb020'],borderColor:'#171b24',borderWidth:2}]
  };
}

function calcTopInsumosPorValor(insumos,top){
  const arr=insumos
    .filter(function(i){return (i.existencia_actual||0)>0 && (i.costo_unitario||0)>0;})
    .map(function(i){return {nombre:i.nombre,valor:(i.existencia_actual||0)*(i.costo_unitario||0)};})
    .sort(function(a,b){return b.valor-a.valor;})
    .slice(0,top);
  return {labels:arr.map(function(x){return x.nombre;}),datasets:[{label:'Valor en stock',data:arr.map(function(x){return x.valor;}),backgroundColor:'#ffb020',borderRadius:4}]};
}

/* =========================================================================
 * 6. COSTOS POR OP
 * ========================================================================= */

function calcCostoTeoricoOP(orden,bom,paquetes,recetas,hijos,insumos,subCosto){
  let costoInsumos=0;
  const detalleInsumos=[];
  (bom||[]).forEach(function(b){
    const ins=insumos.find(function(i){return i.id===b.insumo_id;});
    if(!ins)return;
    const cant=b.cantidad_por_unidad*orden.cantidad_proyectada;
    const sub=(ins.costo_unitario||0)*cant;
    costoInsumos+=sub;
    detalleInsumos.push({nombre:ins.nombre,codigo:ins.codigo,cantidad:cant,unidad:unidadConsumo(ins),costo_u:ins.costo_unitario||0,subtotal:sub});
  });
  let costoSubs=0;
  const detalleSubs=[];
  (paquetes||[]).forEach(function(p){
    const s=subCosto[p.subproducto_id]||0;
    const cant=p.cantidad*orden.cantidad_proyectada;
    const sub=s*cant;
    costoSubs+=sub;
    detalleSubs.push({subproducto_id:p.subproducto_id,cantidad:cant,costo_u:s,subtotal:sub});
  });
  return {total:costoInsumos+costoSubs,costoInsumos:costoInsumos,costoSubs:costoSubs,detalleInsumos:detalleInsumos,detalleSubs:detalleSubs};
}

function calcCostoRealOP(movs){
  let totalIns=0,totalSubs=0;
  const detalleIns=[];const detalleSubs=[];
  movs.forEach(function(m){
    const cant=Number(m.cantidad)||0;
    if(m.insumo_id){
      const cu=Number(m.costo_unitario_momento)||0;
      const sub=cu*cant;totalIns+=sub;
      detalleIns.push({insumo_id:m.insumo_id,nombre:m.insumos?m.insumos.nombre:'?',cantidad:cant,unidad:m.insumos?unidadConsumo(m.insumos):'',costo_u:cu,subtotal:sub});
    } else if(m.subproducto_id){
      detalleSubs.push({subproducto_id:m.subproducto_id,cantidad:cant,nombre:m.subproductos?m.subproductos.nombre:'?',costo_u:0,subtotal:0});
    }
  });
  return {total:totalIns+totalSubs,totalIns:totalIns,totalSubs:totalSubs,detalleIns:detalleIns,detalleSubs:detalleSubs};
}

function calcComparativoInsumos(teorico,real){
  const mapa={};
  teorico.detalleInsumos.forEach(function(d){
    const k=d.codigo||d.nombre;
    mapa[k]={nombre:d.nombre,codigo:d.codigo,cant_teo:d.cantidad,cant_real:0,costo_teo:d.subtotal,costo_real:0,unidad:d.unidad};
  });
  real.detalleIns.forEach(function(d){
    const k=d.nombre;
    if(!mapa[k])mapa[k]={nombre:d.nombre,codigo:'',cant_teo:0,cant_real:0,costo_teo:0,costo_real:0,unidad:d.unidad};
    mapa[k].cant_real+=d.cantidad;
    mapa[k].costo_real+=d.subtotal;
  });
  return Object.values(mapa).map(function(x){
    const difCant=x.cant_real-x.cant_teo;
    const difCosto=x.costo_real-x.costo_teo;
    const pctCosto=x.costo_teo>0?(difCosto/x.costo_teo*100):null;
    return Object.assign({},x,{dif_cant:difCant,dif_costo:difCosto,pct_costo:pctCosto});
  });
}

/* =========================================================================
 * 7. RENTABILIDAD POR PT
 * ========================================================================= */

function calcRentabilidadPorPT(productos,ordenes,costos){
  const porPT={};
  productos.forEach(function(p){
    porPT[p.codigo_pt]={
      codigo_pt:p.codigo_pt,nombre:p.nombre,
      unidades_por_caja:p.unidades_por_caja||1,
      precio_venta:p.precio_venta,
      costo_unitario:costos.paqCosto[p.codigo_pt]||0,
      unidades_producidas:0,unidades_vendidas:0,ops_terminadas:0,
      ingresos:0,costo_produccion:0,margen:0,margen_pct:null
    };
  });
  ordenes.forEach(function(o){
    const r=porPT[o.codigo_pt];if(!r)return;
    const unid=Number(o.cantidad_proyectada)||0;
    r.unidades_producidas+=unid;
    r.ops_terminadas+=1;
    r.costo_produccion+=unid*r.costo_unitario;
  });
  Object.values(porPT).forEach(function(r){
    if(r.precio_venta!=null&&r.precio_venta>0){
      r.ingresos=r.precio_venta*r.unidades_producidas;
      r.margen=r.ingresos-r.costo_produccion;
      r.margen_pct=r.ingresos>0?(r.margen/r.ingresos*100):null;
    } else {
      r.ingresos=0;r.margen=-r.costo_produccion;r.margen_pct=null;
    }
  });
  return Object.values(porPT);
}

function prepararDatosGraficoMargen(analisis,top){
  const conPrecio=analisis.filter(function(a){return a.precio_venta!=null&&a.unidades_producidas>0;});
  const ordenados=conPrecio.slice().sort(function(a,b){return Math.abs(b.margen)-Math.abs(a.margen);});
  const corte=top?ordenados.slice(0,top):ordenados;
  return {
    labels:corte.map(function(a){return a.nombre;}),
    datasets:[{label:'Margen total',data:corte.map(function(a){return a.margen;}),backgroundColor:corte.map(function(a){return a.margen>=0?'#3ddc84':'#ff5c5c';}),borderRadius:4}]
  };
}

/* =========================================================================
 * 8. CÓDIGOS SECUENCIALES
 * ========================================================================= */

function siguienteCodigoLocal(prefijo, arr){
  let max=0;
  (arr||[]).forEach(function(x){
    const c=x.codigo||x.codigo_pt||x.numero_op||'';
    if(c.startsWith(prefijo)){
      const n=parseInt(c.slice(prefijo.length),10);
      if(!isNaN(n)&&n>max)max=n;
    }
  });
  return String(max+1).padStart(3,'0');
}