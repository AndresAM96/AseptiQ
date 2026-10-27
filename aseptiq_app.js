/* =========================================================
   INVENTARIO APP
   ========================================================= */
/* Pon DEBUG=true en la consola del navegador para ver logs internos:
   localStorage.setItem('aseptiq_debug','1'); location.reload(); */
const DEBUG = (function(){try{return localStorage.getItem('aseptiq_debug')==='1';}catch(e){return false;}})();
function log(){ if(DEBUG) console.log.apply(console, arguments); }
let SUPA_URL='', SUPA_KEY='';
let SUPA_CLIENT=null, SUPA_SESSION=null;
let SUPA_ROLE=null, SUPA_PROFILE=null;
let _cerrandoPorExpiracion = false;

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>'"]/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[m];
  });
}

async function manejarSesionExpirada() {
  if (_cerrandoPorExpiracion) return;
  _cerrandoPorExpiracion = true;
  
  try { if(SUPA_CLIENT) await SUPA_CLIENT.auth.signOut(); } catch(e) {}
  /* No borramos 'aseptiq_creds' aquí, para que el checkbox de recordar contraseña siga activo */
  
  alert('Tu sesión ha expirado por seguridad. Por favor, inicia sesión nuevamente.');
  location.reload();
}

function apiHeaders(extra){
  const token=SUPA_SESSION&&SUPA_SESSION.access_token?SUPA_SESSION.access_token:SUPA_KEY;
  return Object.assign({'apikey':SUPA_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json'},extra||{});
}
async function api(path,options){
  const res=await fetch(SUPA_URL.replace(/\/$/,'')+'/rest/v1/'+path,Object.assign({headers:apiHeaders()},options||{}));
  const t=await res.text();let b=null;if(t){try{b=JSON.parse(t);}catch(e){}}
  
  if(res.status === 401){
    manejarSesionExpirada();
    throw new Error('Sesión expirada');
  }
  
  if(!res.ok)throw new Error((b&&b.message)?b.message:('Error '+res.status));
  return b;
}
async function rpc(fn,params){
  const res=await fetch(SUPA_URL.replace(/\/$/,'')+'/rest/v1/rpc/'+fn,{method:'POST',headers:apiHeaders(),body:JSON.stringify(params||{})});
  const t=await res.text();let b=null;if(t){try{b=JSON.parse(t);}catch(e){}}
  
  if(res.status === 401){
    manejarSesionExpirada();
    throw new Error('Sesión expirada');
  }

  if(!res.ok){
    const raw=(b&&(b.message||b.hint||b.details))||('Error '+res.status);
    throw new Error(traducirError(raw));
  }
  return b;
}
function traducirError(m){
  if(!m)return 'Error desconocido.';
  if(/duplicate key.*insumos_codigo/i.test(m))return 'Ya existe un insumo con ese código.';
  if(/duplicate key.*subproductos_codigo/i.test(m))return 'Ya existe un subproducto con ese código.';
  if(/duplicate key.*productos_terminados/i.test(m))return 'Ya existe un paquete con ese código.';
  if(/duplicate key.*sys_proveedores_nit/i.test(m))return 'Ya existe un proveedor con ese NIT.';
  if(/ordenes_semanales_numero_op_unique/i.test(m))return 'Ya existe una OP con ese número.';
  if(/ordenes_semanales_lote_unique/i.test(m))return 'Ya existe una OP con ese lote.';
  if(/violates foreign key/i.test(m))return 'No se puede completar: hay registros relacionados.';
  if(/insumos_punto_reorden_check/i.test(m))return 'El punto de reorden debe ser mayor a cero.';
  if(/subproductos_punto_reorden_check/i.test(m))return 'Punto de reorden inválido en subproducto.';
  if(/ordenes_semanales_estado_op_check/i.test(m))return 'Estado de OP inválido.';
  if(/violates check constraint/i.test(m))return 'Datos inválidos, revisa los campos.';
  if(/function .* does not exist/i.test(m))return 'Falta una función en Supabase. ¿Corriste la migración v11?';
  if(/JWT|api key|apikey/i.test(m))return 'Sesión expirada o clave inválida.';
  return m;
}
async function withLoading(btn,fn){
  if(!btn)return fn();
  const orig=btn.innerHTML;
  btn.disabled=true;btn.innerHTML='Guardando…';
  try{
    const r=await fn();
    if (r === false) {
      throw new Error('La acción no se completó. Revisa los datos.');
    }
    btn.classList.add('btn-ok');btn.innerHTML='✓ Guardado';
    setTimeout(function(){btn.classList.remove('btn-ok');btn.innerHTML=orig;btn.disabled=false;},1400);
    return r;
  }catch(e){
    btn.classList.add('btn-err');btn.innerHTML='✕ Error';
    setTimeout(function(){btn.classList.remove('btn-err');btn.innerHTML=orig;btn.disabled=false;},2000);
    throw e;
  }
}
/* ============ SISTEMA DE ICONOS ============ */
/* Devuelve el markup SVG listo para insertar en HTML.
   icono('bell')            →  <svg class="icon"><use href="#ic-bell"/></svg>
   icono('bell','lg')       →  con clase .icon-lg
   icono('bell','xl')       →  con clase .icon-xl                          */
function icono(nombre, size){
  const cls = 'icon' + (size ? ' icon-'+size : '');
  return '<svg class="'+cls+'" aria-hidden="true"><use href="#ic-'+nombre+'"/></svg>';
}

function debounce(fn,wait){let t;return function(){clearTimeout(t);const a=arguments,c=this;t=setTimeout(function(){fn.apply(c,a);},wait||200);};}
function toast(msg,type){
  const area=document.getElementById('toastArea');
  const e=document.createElement('div');
  e.className='toast '+(type||'');
  const ic=type==='success'?'✓':type==='error'?'✕':'ⓘ';
  e.innerHTML='<span class="ic">'+ic+'</span><span class="msg">'+msg+'</span>';
  area.appendChild(e);
  setTimeout(function(){e.remove();},type==='error'?6500:4500);
}
async function toggleEstadoItem(tabla, id, estadoActual, nombre) {
  const accion = estadoActual !== false ? 'desactivar' : 'activar';
  const ok = await confirmar({
    title: (estadoActual !== false ? 'Desactivar' : 'Activar') + ' "' + nombre + '"',
    message: estadoActual !== false 
      ? 'El ítem se ocultará de las listas. Sus datos e historial se conservarán.' 
      : 'El ítem volverá a aparecer en las listas.',
    icon: estadoActual !== false ? icono('eye-off','lg') : icono('check-circle','lg'),
    variant: estadoActual !== false ? 'warn' : 'info',
    okText: (estadoActual !== false ? 'Desactivar' : 'Activar')
  });
  if(!ok) return;

  try {
    await api(tabla + '?id=eq.' + id, {
      method: 'PATCH',
      body: JSON.stringify({ estado_activo: estadoActual === false })
    });
    toast('Estado actualizado correctamente.', 'success');
    return true;
  } catch(e) {
    toast('Error al actualizar: ' + e.message, 'error');
    return false;
  }
}

async function confirmarEliminar(nombre){
  const r=await confirmar({
    title:'Eliminar "'+nombre+'"',
    message:'Esta acción no se puede deshacer.',
    icon:'✕',
    variant:'danger',
    okText:'Eliminar',
    danger:true
  });
  return r!==null;
}
function scrollToEl(id){const el=document.getElementById(id);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});}

/* ============ CLICK GUARD ============ */
document.addEventListener('click',function(ev){
  if(SUPA_ROLE!=='consulta')return;
  const t=ev.target.closest('button');
  if(!t||t.disabled)return;
  const esEscritura =
    t.dataset.delInsumo||t.dataset.delSub||t.dataset.delProd||t.dataset.delProv||t.dataset.delUnidad||
    t.dataset.editInsumo||t.dataset.editSub||t.dataset.editProd||t.dataset.editProv||t.dataset.editUnidad||
    t.dataset.ordenCompletar||t.dataset.ordenCancelar||
    t.dataset.toggleActivo||t.dataset.editRol||
    ['btnRegistrarEntrada','btnRegistrarSalida','btnAplicarAjustes','btnConfirmarOrden','entregaConfirmar','btnGenerarBackup',
     'btnGuardarInsumo','btnGuardarSubproducto','btnGuardarProducto','btnGuardarProveedor',
     'btnGuardarPrefijos','btnGuardarUmbrales','btnGuardarPrefijoOP','btnAgregarFilaInsumoSub',
     'btnAgregarFilaSubHijo','btnAgregarFilaSub','btnAgregarFilaInsumo','btnAgregarContacto',
     'btnAgregarNivelConv','btnCrearInsumoInline','btnCrearSubproductoInline','btnAgregarUnidad',
     'btnGuardarPrefijo','btnGuardarUnidad'].indexOf(t.id)>=0;
  if(esEscritura){
    ev.preventDefault();
    ev.stopPropagation();
    toast('Tu rol es Consulta — solo lectura.','error');
  }
},true);

/* ============ FILTROS DE MÓDULO (desde notificaciones) ============ */
let _filtroModulo = null;

function irATabConFiltro(tab, filtro){
  _filtroModulo = {tab:tab, filtro:filtro};
  irATab(tab);
}
function limpiarFiltroModulo(){
  _filtroModulo = null;
}

/* ============ CAMPANA DE NOTIFICACIONES ============ */
let _notifData=null;
let _notifAbierto=false;

async function actualizarCampana(){
  try{
    const [insumos,ordenes,entregasHoy]=await Promise.all([
      api('insumos?select=id,codigo,nombre,existencia_actual,punto_reorden,unidad_medida,unidad_consumo,conversiones&estado_activo=eq.true&order=nombre'),
      api('ordenes_semanales?select=id,numero_op,lote,fecha_creacion,prioridad,codigo_pt,productos_terminados(nombre)&estado_op=in.(Pendiente,En%20proceso)&order=fecha_creacion.asc'),
      api('entregas_op?select=id,fecha,cantidad,lote_entrega,ordenes_semanales(numero_op)&order=fecha.desc&limit=5')
    ]);

    /* Leer config para saber qué está silenciado y qué ya se vio */
    const cfg=getConfig();
    const notifCfg=(cfg.notif && typeof cfg.notif==='object') ? cfg.notif : {};
    const silenciados=notifCfg.silenciados || {};
    const vistos=notifCfg.vistos || {};

    /* Clasificar insumos (excluyendo silenciados) */
    const urgentes=[],reorden=[];
    insumos.forEach(function(i){
      if(silenciados['insumo:'+i.id]) return;
      const e=estadoInsumo(i);
      if(e==='Urgente')urgentes.push(i);
      else if(e==='Reorden')reorden.push(i);
    });

    /* OPs pendientes hace más de 5 días */
    const ahora=Date.now();
    const opsVencidas=ordenes.filter(function(o){
      if(silenciados['op:'+o.id]) return false;
      const dias=(ahora-new Date(o.fecha_creacion).getTime())/(1000*60*60*24);
      return dias>=5;
    });

    /* Entregas registradas en las últimas 24h */
    const hace24h=ahora-24*60*60*1000;
    const entregasRecientes=entregasHoy.filter(function(e){
      if(silenciados['entrega:'+e.id]) return false;
      return new Date(e.fecha).getTime()>=hace24h;
    });

    _notifData={urgentes:urgentes,reorden:reorden,opsVencidas:opsVencidas,entregasRecientes:entregasRecientes};

    /* Calcular hashes actuales (id + estado) para detectar nuevos */
    function _hashInsumo(i){return 'insumo:'+i.id+':'+estadoInsumo(i);}
    function _hashOp(o){return 'op:'+o.id+':vencida';}

    let nuevos=0;
    urgentes.forEach(function(i){if(!vistos[_hashInsumo(i)]) nuevos++;});
    reorden.forEach(function(i){if(!vistos[_hashInsumo(i)]) nuevos++;});
    opsVencidas.forEach(function(o){if(!vistos[_hashOp(o)]) nuevos++;});
    /* Entregas no cuentan para el badge (son informativas) */

    /* Badge: solo los NUEVOS (no vistos) */
    const totalAlerta=nuevos;
    const badges=document.querySelectorAll('.campana-badge');
    const botones=document.querySelectorAll('.sidebar-bell');
    if(!badges.length)return;
    if(totalAlerta<=0){
      badges.forEach(function(b){b.style.display='none';});
      botones.forEach(function(b){b.classList.remove('has-alerts');});
    } else {
      badges.forEach(function(b){
        b.textContent=totalAlerta>99?'99+':String(totalAlerta);
        b.className='sidebar-bell-badge campana-badge'+(urgentes.length>0?'':' warning');
        b.style.display='flex';
      });
      botones.forEach(function(b){b.classList.add('has-alerts');});
    }
    /* Si el dropdown está abierto, re-renderizarlo con datos frescos */
    if(_notifAbierto) renderNotifPanel();
  }catch(e){
    log('No se pudo actualizar la campana:',e);
  }
}

function _renderNotifItemHTML(icon, variant, title, sub, tabTarget, filtro){
  return '<div class="notif-item '+variant+'" data-notif-tab="'+(tabTarget||'')+'"'+(filtro?' data-notif-filtro="'+filtro+'"':'')+'>'
    +'<div class="notif-item-icon">'+icon+'</div>'
    +'<div class="notif-item-content">'
    +'<div class="notif-item-title">'+title+'</div>'
    +'<div class="notif-item-sub">'+sub+'</div>'
    +'</div>'
    +'</div>';
}

function renderNotifPanel(){
  const body=document.getElementById('notifBody');
  const header=document.getElementById('notifHeaderMeta');
  if(!body||!header||!_notifData)return;

  const {urgentes,reorden,opsVencidas,entregasRecientes}=_notifData;
  const cfg=getConfig();
  const notifCfg=(cfg.notif && typeof cfg.notif==='object') ? cfg.notif : {};
  const silenciados=notifCfg.silenciados || {};

  const totalAtencion=urgentes.length+reorden.length+opsVencidas.length;
  header.textContent=totalAtencion>0
    ? totalAtencion+' pendiente'+(totalAtencion===1?'':'s')
    : 'Todo en orden';

  const blocks=[];

  /* Helper: botón × de silenciar */
  function btnSilenciar(tipo, id, label){
    return '<button class="notif-silenciar" data-silenciar-tipo="'+tipo+'" data-silenciar-id="'+id+'" title="Silenciar '+label+'" aria-label="Silenciar">×</button>';
  }

  if(urgentes.length>0){
    blocks.push('<div class="notif-section">'
      +'<div class="notif-section-title">'+icono('alert-circle','sm')+' Stock urgente · '+urgentes.length+'</div>'
      +urgentes.slice(0,5).map(function(i){
        return '<div class="notif-item danger" data-notif-tab="insumos" data-notif-filtro="Urgente">'
          +'<div class="notif-item-icon">'+icono('alert-circle')+'</div>'
          +'<div class="notif-item-content">'
          +'<div class="notif-item-title">'+i.nombre+' ('+num(i.existencia_actual)+' '+unidadConsumo(i)+')</div>'
          +'<div class="notif-item-sub">Por debajo del umbral urgente · objetivo '+num(i.punto_reorden)+' '+unidadConsumo(i)+'</div>'
          +'</div>'
          +btnSilenciar('insumo', i.id, 'este insumo')
          +'</div>';
      }).join('')
      +(urgentes.length>5?'<div class="notif-item info" data-notif-tab="insumos" data-notif-filtro="Urgente"><div class="notif-item-icon">'+icono('arrow-right')+'</div><div class="notif-item-content"><div class="notif-item-title">Ver los '+(urgentes.length-5)+' restantes</div><div class="notif-item-sub">Ir a Insumos filtrado por Urgentes</div></div></div>':'')
      +'</div>');
  }

  if(opsVencidas.length>0){
    blocks.push('<div class="notif-section">'
      +'<div class="notif-section-title">'+icono('clipboard','sm')+' OPs pendientes hace +5 días · '+opsVencidas.length+'</div>'
      +opsVencidas.slice(0,5).map(function(o){
        const dias=Math.floor((Date.now()-new Date(o.fecha_creacion).getTime())/(1000*60*60*24));
        const prod=o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt;
        return '<div class="notif-item warning" data-notif-tab="orden">'
          +'<div class="notif-item-icon">'+icono('clock')+'</div>'
          +'<div class="notif-item-content">'
          +'<div class="notif-item-title">'+(o.numero_op||'OP')+' · '+prod+'</div>'
          +'<div class="notif-item-sub">Pendiente hace '+dias+' día'+(dias===1?'':'s')+'</div>'
          +'</div>'
          +btnSilenciar('op', o.id, 'esta OP')
          +'</div>';
      }).join('')
      +(opsVencidas.length>5?'<div class="notif-item info" data-notif-tab="orden" data-notif-filtro="vencidas"><div class="notif-item-icon">'+icono('arrow-right')+'</div><div class="notif-item-content"><div class="notif-item-title">Ver las '+(opsVencidas.length-5)+' restantes</div><div class="notif-item-sub">Ir a Cargar orden filtrado por antigüedad</div></div></div>':'')
      +'</div>');
  }

  if(reorden.length>0){
    blocks.push('<div class="notif-section">'
      +'<div class="notif-section-title">'+icono('alert-triangle','sm')+' En reorden · '+reorden.length+'</div>'
      +reorden.slice(0,5).map(function(i){
        return '<div class="notif-item warning" data-notif-tab="insumos" data-notif-filtro="Reorden">'
          +'<div class="notif-item-icon">'+icono('alert-triangle')+'</div>'
          +'<div class="notif-item-content">'
          +'<div class="notif-item-title">'+i.nombre+'</div>'
          +'<div class="notif-item-sub">Existencia '+num(i.existencia_actual)+' '+unidadConsumo(i)+' · cerca del mínimo</div>'
          +'</div>'
          +btnSilenciar('insumo', i.id, 'este insumo')
          +'</div>';
      }).join('')
      +(reorden.length>5?'<div class="notif-item info" data-notif-tab="insumos" data-notif-filtro="Reorden"><div class="notif-item-icon">'+icono('arrow-right')+'</div><div class="notif-item-content"><div class="notif-item-title">Ver los '+(reorden.length-5)+' restantes</div><div class="notif-item-sub">Ir a Insumos filtrado por Reorden</div></div></div>':'')
      +'</div>');
  }

  if(entregasRecientes.length>0){
    blocks.push('<div class="notif-section">'
      +'<div class="notif-section-title">'+icono('sparkles','sm')+' Entregas últimas 24h · '+entregasRecientes.length+'</div>'
      +entregasRecientes.slice(0,5).map(function(e){
        const op=e.ordenes_semanales?e.ordenes_semanales.numero_op:'OP';
        return '<div class="notif-item success" data-notif-tab="orden">'
          +'<div class="notif-item-icon">'+icono('sparkles')+'</div>'
          +'<div class="notif-item-content">'
          +'<div class="notif-item-title">Entrega registrada · '+num(e.cantidad)+' u</div>'
          +'<div class="notif-item-sub">'+(op||'')+(e.lote_entrega?' · lote '+e.lote_entrega:'')+' · '+new Date(e.fecha).toLocaleString('es-CO',{hour:'2-digit',minute:'2-digit'})+'</div>'
          +'</div>'
          +btnSilenciar('entrega', e.id, 'esta entrega')
          +'</div>';
      }).join('')
      +'</div>');
  }

  if(blocks.length===0){
    body.innerHTML='<div class="notif-empty">'
      +'<span class="notif-empty-icon">'+icono('check-circle','xl')+'</span>'
      +'Todo en orden. No hay notificaciones pendientes.'
      +'</div>';
  } else {
    body.innerHTML=blocks.join('');
  }

  /* Sección de silenciados (si hay) */
  const silenciadosKeys=Object.keys(silenciados).filter(function(k){return silenciados[k];});
  if(silenciadosKeys.length>0){
    const silenciadosHTML='<div class="notif-section notif-section-silenciados">'
      +'<div class="notif-section-title">'
        +'<button type="button" class="notif-silenciados-toggle" id="notifSilenciadosToggle">'
        +icono('eye-off','sm')+' Silenciados ('+silenciadosKeys.length+')'
        +'<span style="margin-left:auto;font-size:10px;opacity:.7;">▾</span>'
        +'</button>'
      +'</div>'
      +'<div id="notifSilenciadosList" style="display:none;">'
        +silenciadosKeys.map(function(k){
          const parts=k.split(':');
          const tipo=parts[0];
          const id=parts[1];
          const label=tipo==='insumo'?'Insumo':(tipo==='op'?'OP':'Entrega');
          return '<div class="notif-item neutral">'
            +'<div class="notif-item-icon">'+icono('eye-off')+'</div>'
            +'<div class="notif-item-content">'
            +'<div class="notif-item-title">'+label+' silenciado</div>'
            +'<div class="notif-item-sub" style="font-family:\'IBM Plex Mono\',monospace;font-size:10.5px;">'+id.slice(0,8)+'…</div>'
            +'</div>'
            +'<button class="notif-reactivar" data-reactivar="'+k+'" title="Reactivar">Reactivar</button>'
            +'</div>';
        }).join('')
      +'</div>'
      +'</div>';
    body.innerHTML+=silenciadosHTML;
  }

  /* Binds — items clickeables */
  body.querySelectorAll('[data-notif-tab]').forEach(function(el){
    el.addEventListener('click',function(ev){
      /* Ignorar si el click fue en el botón de silenciar */
      if(ev.target.closest('[data-silenciar-id]')) return;
      const tab=el.dataset.notifTab;
      const filtro=el.dataset.notifFiltro;
      if(!tab) return;
      cerrarCampana();
      if(filtro) irATabConFiltro(tab,filtro);
      else irATab(tab);
    });
  });

  /* Binds — botones × silenciar */
  body.querySelectorAll('[data-silenciar-id]').forEach(function(btn){
    btn.addEventListener('click',function(ev){
      ev.stopPropagation();
      silenciarNotif(btn.dataset.silenciarTipo, btn.dataset.silenciarId);
    });
  });

  /* Binds — botones reactivar */
  body.querySelectorAll('[data-reactivar]').forEach(function(btn){
    btn.addEventListener('click',function(ev){
      ev.stopPropagation();
      dessilenciarNotif(btn.dataset.reactivar);
    });
  });

  /* Bind — toggle de silenciados */
  const toggle=document.getElementById('notifSilenciadosToggle');
  if(toggle){
    toggle.addEventListener('click',function(){
      const list=document.getElementById('notifSilenciadosList');
      if(list) list.style.display = list.style.display==='none' ? 'block' : 'none';
    });
  }
}

/* Marca todas las notificaciones actuales como vistas */
async function marcarNotifsVistas(){
  if(!_notifData) return;
  const cfg=getConfig();
  const notifCfg=(cfg.notif && typeof cfg.notif==='object') ? JSON.parse(JSON.stringify(cfg.notif)) : {};
  const vistos=notifCfg.vistos || {};
  const ahora=Date.now();

  /* Insumos */
  _notifData.urgentes.forEach(function(i){vistos['insumo:'+i.id+':'+estadoInsumo(i)]=ahora;});
  _notifData.reorden.forEach(function(i){vistos['insumo:'+i.id+':'+estadoInsumo(i)]=ahora;});
  /* OPs vencidas */
  _notifData.opsVencidas.forEach(function(o){vistos['op:'+o.id+':vencida']=ahora;});
  /* Entregas */
  _notifData.entregasRecientes.forEach(function(e){vistos['entrega:'+e.id]=ahora;});

  /* Limpieza: eliminar hashes mayores a 60 días para no crecer infinito */
  const limite=ahora-60*24*60*60*1000;
  Object.keys(vistos).forEach(function(k){
    if(vistos[k]<limite) delete vistos[k];
  });

  notifCfg.vistos=vistos;
  cfg.notif=notifCfg;
  try{await saveConfig(cfg);}catch(e){log('No se pudo marcar como vistas:',e);}
}

/* Silenciar un item (permanente) */
async function silenciarNotif(tipo, id){
  const cfg=getConfig();
  const notifCfg=(cfg.notif && typeof cfg.notif==='object') ? JSON.parse(JSON.stringify(cfg.notif)) : {};
  const silenciados=notifCfg.silenciados || {};
  silenciados[tipo+':'+id]=true;
  notifCfg.silenciados=silenciados;
  cfg.notif=notifCfg;
  try{
    await saveConfig(cfg);
    toast('Notificación silenciada.','success');
    await actualizarCampana();
    if(_notifAbierto) renderNotifPanel();
  }catch(e){toast('No se pudo silenciar: '+e.message,'error');}
}

/* Reactivar un item silenciado */
async function dessilenciarNotif(clave){
  const cfg=getConfig();
  const notifCfg=(cfg.notif && typeof cfg.notif==='object') ? JSON.parse(JSON.stringify(cfg.notif)) : {};
  const silenciados=notifCfg.silenciados || {};
  delete silenciados[clave];
  notifCfg.silenciados=silenciados;
  cfg.notif=notifCfg;
  try{
    await saveConfig(cfg);
    toast('Notificación reactivada.','success');
    await actualizarCampana();
    if(_notifAbierto) renderNotifPanel();
  }catch(e){toast('No se pudo reactivar: '+e.message,'error');}
}

function abrirCampana(){
  const ov=document.getElementById('notifOverlay');
  if(!ov)return;
  const sb=document.getElementById('sidebarPrincipal');
  const panel=ov.querySelector('.notif-panel');

  if(panel){
    if(typeof esMobile==='function' && esMobile()){
      /* En móvil el CSS controla el layout (left/right:12px). Limpiar cualquier
         estilo inline que haya quedado de una apertura anterior en desktop. */
      panel.style.left='';
      panel.style.right='';
      panel.style.width='';
    } else if(sb){
      /* En desktop: pegado al lado del sidebar */
      const isCol=sb.classList.contains('collapsed');
      panel.style.left=isCol?'76px':'236px';
      panel.style.right='';
      panel.style.width='';
    }
  }

  ov.classList.add('open');
  _notifAbierto=true;
  renderNotifPanel();
  /* Marcar como vistas todas las actuales y refrescar el badge */
  marcarNotifsVistas().then(function(){
    actualizarCampana();
  });
}

function cerrarCampana(){
  const ov=document.getElementById('notifOverlay');
  if(!ov)return;
  ov.classList.remove('open');
  _notifAbierto=false;
}

(function initCampana(){
  const ov=document.getElementById('notifOverlay');
  if(!ov)return;
  /* Bindear todos los botones de campana (sidebar + mobile) */
  document.querySelectorAll('.sidebar-bell').forEach(function(btn){
    btn.addEventListener('click',function(ev){
      ev.stopPropagation();
      if(_notifAbierto)cerrarCampana();
      else abrirCampana();
    });
  });
  ov.addEventListener('click',function(ev){
    /* Click fuera del panel cierra (es un dropdown, no modal) */
    if(ev.target===ov) cerrarCampana();
  });
  document.addEventListener('keydown',function(ev){
    if(ev.key==='Escape'&&_notifAbierto)cerrarCampana();
  });
})();

/* ============ RECUPERAR SESIÓN AL CARGAR ============ */
async function intentarSesionExistente(){
  try{
    const s=JSON.parse(localStorage.getItem('inv_supa_creds'));
    if(!s||!s.url||!s.key) return false;
    if(typeof supabase==='undefined') return false;

    SUPA_URL=s.url;
    SUPA_KEY=s.key;
    SUPA_CLIENT=supabase.createClient(s.url,s.key,{auth:{persistSession:true,autoRefreshToken:true}});
    
    SUPA_CLIENT.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && !_cerrandoPorExpiracion) {
        manejarSesionExpirada();
      } else if (event === 'TOKEN_REFRESHED' && session) {
        SUPA_SESSION = session; // Actualizamos la sesión con el token nuevo
      }
    });

    const {data}=await SUPA_CLIENT.auth.getSession();
    const session=data && data.session;
    if(!session || !session.user) return false;

    SUPA_SESSION=session;
    await cargarRol();
    await cargarConfig();

    if(SUPA_PROFILE && SUPA_PROFILE.activo === false){
      await SUPA_CLIENT.auth.signOut();
      SUPA_SESSION=null;
      return false;
    }

    /* Sesión válida: entrar directo y restaurar la pestaña */
    const tabGuardado = localStorage.getItem('aseptiq_tab') || 'dashboard';
    document.getElementById('bootScreen').style.display='none';
    document.getElementById('connectScreen').style.display='none';
    document.getElementById('app').style.display='block';
    aplicarTema();
    aplicarSidebarColapsado();
    dialogInit();
    activarNavItem(tabGuardado);
    renderTab(tabGuardado);
    setTimeout(actualizarCampana, 800);
    return true;
  }catch(e){
    if(typeof log==='function') log('No se pudo recuperar sesión:',e);
    return false;
  }
}

function activarNavItem(tab){
  document.querySelectorAll('.nav-item').forEach(function(b){
    b.classList.toggle('active', b.dataset.tab===tab);
  });
  if(typeof abrirGrupoDelTab==='function') abrirGrupoDelTab(tab);
}

/* ============ ROLES Y PERMISOS ============ */
async function cargarRol(){
  try{
    if(!SUPA_SESSION || !SUPA_SESSION.user){ SUPA_ROLE='consulta'; return; }
    const userId=SUPA_SESSION.user.id;
    const rows=await api('profiles?user_id=eq.'+userId+'&select=*');
    if(rows && rows.length){
      SUPA_PROFILE=rows[0];
      SUPA_ROLE=rows[0].role||'consulta';
    } else {
      SUPA_PROFILE={user_id:userId,email:SUPA_SESSION.user.email,role:'consulta',activo:true};
      SUPA_ROLE='consulta';
    }
  }catch(e){
    log('No se pudo cargar el rol:',e);
    SUPA_ROLE='consulta';
  }
}
function badgeRol(r){
  const m={admin:'warning',operador:'info',consulta:'neutral'};
  return '<span class="badge '+(m[r]||'neutral')+'">'+r+'</span>';
}
function aplicarPermisos(){
  if(!SUPA_ROLE) return;
  const soloLectura = SUPA_ROLE === 'consulta';
  const esAdmin = SUPA_ROLE === 'admin';

  // Badge en el sidebar
  const elEmail = document.getElementById('sidebarUserEmail');
  const elRole = document.getElementById('sidebarUserRole');
  if(elEmail && SUPA_PROFILE) elEmail.textContent = SUPA_PROFILE.email || SUPA_PROFILE.nombre || '—';
  if(elRole){
    elRole.textContent = SUPA_ROLE;
    elRole.className = 'badge ' + (esAdmin?'warning':(SUPA_ROLE==='operador'?'info':'neutral'));
  }

  // Item de menú "Usuarios": solo admin
  document.querySelectorAll('[data-rol-requerido="admin"]').forEach(function(el){
    el.style.display = esAdmin ? '' : 'none';
  });

  // Paneles de creación: ocultar en modo lectura
  document.querySelectorAll('.require-write').forEach(function(el){
    el.style.display = soloLectura ? 'none' : '';
  });

  // Botones de acción en listas (editar / eliminar): ocultar en modo lectura
  if(soloLectura){
    const sels = [
      '[data-del-insumo]','[data-del-sub]','[data-del-prod]','[data-del-prov]','[data-del-unidad]',
      '[data-edit-insumo]','[data-edit-sub]','[data-edit-prod]','[data-edit-prov]','[data-edit-unidad]',
      '[data-orden-completar]','[data-orden-cancelar]',
      '[data-toggle-activo]','[data-edit-rol]'
    ];
    document.querySelectorAll(sels.join(',')).forEach(function(el){ el.style.display='none'; });
  }
}

/* ============ EXPORTAR CSV ============ */
function exportarCSV(nombre, headers, filas){
  const esc=function(v){
    if(v===null||v===undefined)return '';
    let s=String(v);
    if(s.indexOf('"')>=0||s.indexOf(';')>=0||s.indexOf('\n')>=0||s.indexOf('\r')>=0){
      s='"'+s.replace(/"/g,'""')+'"';
    }
    return s;
  };
  const sep=';'; // Excel en español usa ; como separador de columnas
  const lineas=[];
  lineas.push(headers.map(esc).join(sep));
  filas.forEach(function(f){lineas.push(f.map(esc).join(sep));});
  const csv='\uFEFF'+lineas.join('\r\n'); // BOM UTF-8 para que Excel respete tildes
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=nombre+'_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Archivo generado: '+nombre+'.csv','success');
}


/* ============ AUX CÓDIGOS SUGERIDOS ============ */
/* Formato de 4 dígitos con ceros a la izquierda.
   Ej: 1 → '0001', 12 → '0012', 9999 → '9999', 10000 → '10000'.
   Si supera 4 dígitos, ya no rellena. */
function _formatoCodigo(n){
  const s=String(n);
  return s.length>=4 ? s : s.padStart(4,'0');
}

/* Extrae el sufijo numérico de un código, quitando el prefijo.
   Tolerante a formatos viejos (3 dígitos, prefijos faltantes, etc.). */
function _sufijoNumerico(codigo, prefijo){
  if(!codigo) return null;
  let s=String(codigo);
  if(prefijo && s.indexOf(prefijo)===0) s=s.slice(prefijo.length);
  /* Quedarnos solo con los dígitos */
  const m=s.match(/\d+/);
  if(!m) return null;
  const n=parseInt(m[0],10);
  return isNaN(n)?null:n;
}

/* Calcula el próximo código a partir de una lista de items.
   - items: array de objetos.
   - getCodigo(item): función que devuelve el string del código del item.
   - prefijo: prefijo esperado (ej 'INS-').
   Devuelve un string de 4 dígitos (o más si supera 9999). */
function siguienteCodigoDeRango(items, getCodigo, prefijo){
  let max=0;
  (items||[]).forEach(function(it){
    const n=_sufijoNumerico(getCodigo(it), prefijo);
    if(n!=null && n>max) max=n;
  });
  return _formatoCodigo(max+1);
}

async function siguienteOPDisponible(prefijo){
  try{
    const r=await api('ordenes_semanales?select=numero_op&numero_op=not.is.null');
    return siguienteCodigoDeRango(r, function(x){return x.numero_op;}, prefijo);
  }catch(e){return null;}
}

/* Verifica en vivo si un código ya existe en una tabla.
   Devuelve un elemento HTML con el estado. */
async function validarDisponibilidadCodigo(inputEl, statusEl, tabla, campo, prefijo){
  if(!inputEl || !statusEl) return;
  const sufijo=inputEl.value.trim().replace(prefijo,'').trim();
  if(!sufijo){statusEl.className='field-validate';statusEl.textContent='';return;}
  const completo=prefijo+sufijo;
  try{
    const r=await api(tabla+'?'+campo+'=eq.'+encodeURIComponent(completo)+'&select='+campo+'&limit=1');
    if(r.length){statusEl.className='field-validate err';statusEl.textContent='✕ Ya existe un registro con este código';}
    else{statusEl.className='field-validate ok';statusEl.textContent='✓ Código disponible';}
  }catch(e){statusEl.className='field-validate';statusEl.textContent='';}
}

/* Habilita el comportamiento "click → select all → escribir reemplaza".
   El input arranca con el valor sugerido; al enfocar se selecciona todo;
   al tipear el primer carácter se reemplaza el valor completo. */
function bindAutoSelect(inputEl){
  if(!inputEl) return;
  /* Guardamos el sugerido original para saber si el usuario "tocó" el campo */
  inputEl.dataset.sugeridoOriginal=inputEl.dataset.sugeridoOriginal || inputEl.value;
  inputEl.addEventListener('focus',function(){
    /* Seleccionar todo el texto: cualquier tecla reemplaza el sugerido */
    setTimeout(function(){inputEl.select();},0);
  });
}
/* ============ DIÁLOGO Y LOADER ============ */
let dialogResolve=null;
function dialogInit(){
  const overlay=document.getElementById('dialogModal');
  if(!overlay||overlay.dataset.init)return;
  overlay.dataset.init='1';
  document.getElementById('dialogOk').addEventListener('click',function(){
    const wrap=document.getElementById('dialogInputWrap');
    const showInput=wrap.style.display!=='none';
    if(showInput){
      closeDialog(true,document.getElementById('dialogInput').value);
    } else {
      closeDialog(true,true);
    }
  });
  document.getElementById('dialogCancel').addEventListener('click',function(){closeDialog(false,null);});
  /* Click fuera NO cierra el modal: solo botones o ESC */
  document.addEventListener('keydown',function(ev){
    if(!overlay.classList.contains('open'))return;
    if(ev.key==='Escape'){closeDialog(false,null);}
    else if(ev.key==='Enter'){
      const wrap=document.getElementById('dialogInputWrap');
      const showInput=wrap.style.display!=='none';
      if(showInput){
        closeDialog(true,document.getElementById('dialogInput').value);
      } else {
        closeDialog(true,true);
      }
    }
  });
}
function closeDialog(ok,val){
  const overlay=document.getElementById('dialogModal');
  _cerrarOverlay('dialogModal');
  const r=dialogResolve;dialogResolve=null;
  if(r)r(ok?val:null);
}
function confirmar(opts){
  return new Promise(function(resolve){
    dialogInit();
    dialogResolve=resolve;
    const overlay=document.getElementById('dialogModal');
    document.getElementById('dialogIcon').className='modal-icon '+(opts.variant||'warn');
    document.getElementById('dialogIcon').innerHTML=opts.icon||'?';
    document.getElementById('dialogTitle').textContent=opts.title||'Confirmación';
    document.getElementById('dialogMsg').textContent=opts.message||'';
    document.getElementById('dialogInputWrap').style.display='none';
    document.getElementById('dialogCancel').style.display=opts.showCancel===false?'none':'';
    document.getElementById('dialogOk').textContent=opts.okText||'Aceptar';
    document.getElementById('dialogOk').className=opts.danger?'danger-btn':'';
    _abrirOverlay('dialogModal');
  });
}
function promptear(opts){
  return new Promise(function(resolve){
    dialogInit();
    dialogResolve=resolve;
    const overlay=document.getElementById('dialogModal');
    document.getElementById('dialogIcon').className='modal-icon '+(opts.variant||'info');
    document.getElementById('dialogIcon').innerHTML=opts.icon||'✎';
    document.getElementById('dialogTitle').textContent=opts.title||'Entrada';
    document.getElementById('dialogMsg').textContent=opts.message||'';
    document.getElementById('dialogInputWrap').style.display='block';
    document.getElementById('dialogCancel').style.display='';
    document.getElementById('dialogOk').textContent=opts.okText||'Aceptar';
    document.getElementById('dialogOk').className='';
    const input=document.getElementById('dialogInput');
    input.value=opts.value||'';
    input.placeholder=opts.placeholder||'';
    _abrirOverlay('dialogModal');
    setTimeout(function(){input.focus();input.select();},80);
  });
}
let loaderCount=0;
function showLoader(msg){
  loaderCount++;
  const o=document.getElementById('loaderOverlay');
  if(msg)document.getElementById('loaderText').textContent=msg;
  else document.getElementById('loaderText').textContent='Cargando…';
  o.classList.add('open');
}
function hideLoader(){
  loaderCount=Math.max(0,loaderCount-1);
  if(loaderCount===0)document.getElementById('loaderOverlay').classList.remove('open');
}
function showFaltantesModal(faltantes){
  const overlay=document.getElementById('faltantesModal');
  const body=document.getElementById('faltantesBody');
  if(!overlay||!body)return;
  body.innerHTML=faltantes.map(function(f){
    const esInsumo=f.tipo==='insumo';
    const badge=esInsumo?'<span class="badge info">Insumo</span>':'<span class="badge warning">Subproducto</span>';
    const faltan=Number(f.requerido)-Number(f.existencia);
    return '<div class="faltante-row">'
      +'<div class="faltante-top"><div class="faltante-nombre">'+f.nombre+'</div>'+badge+'</div>'
      +'<div class="faltante-detalle">'
      +'<span>Requerido: <b>'+num(f.requerido)+'</b></span>'
      +'<span>Existencia: <b>'+num(f.existencia)+'</b></span>'
      +'<span class="faltante-cant">Faltan: '+num(faltan)+'</span>'
      +'</div></div>';
  }).join('');
  _abrirOverlay('faltantesModal');
  document.getElementById('faltantesCerrar').onclick=function(){_cerrarOverlay('faltantesModal');};
  /* Click fuera NO cierra el modal: solo botones o ESC */
}
function parsearFaltantes(msg){
  const idx=msg.indexOf('Faltantes: ');
  if(idx<0)return null;
  try{
    return JSON.parse(msg.slice(idx+'Faltantes: '.length));
  }catch(e){return null;}
}
/* ============ IMPRESIÓN / PDF ============ */
const PRINT_LOGO_SVG = '<img src="logo-proclides.png" alt="Proclides" class="print-logo">';

const PRINT_CSS_BASE = `
  *{box-sizing:border-box;}
  body{
    font-family:'Helvetica','Arial',sans-serif;
    color:#111;background:#fff;
    margin:0;padding:0;
    font-size:10.5pt;line-height:1.4;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
  }
  .print-doc{padding:0;}
  .print-header{
    display:flex;align-items:flex-start;justify-content:space-between;
    gap:16px;padding-bottom:10px;
    border-bottom:2px solid #111;margin-bottom:16px;
  }
  .print-brand{display:flex;align-items:center;gap:12px;}
  .print-logo{height:52px;width:auto;display:block;flex-shrink:0;}
  .print-company{font-size:11.5pt;font-weight:700;letter-spacing:-.01em;line-height:1.2;}
  .print-company small{display:block;font-size:8.5pt;font-weight:400;color:#666;margin-top:2px;letter-spacing:.02em;}
  .print-title{text-align:right;}
  .print-title h1{
    margin:0;font-size:14pt;font-weight:700;
    text-transform:uppercase;letter-spacing:.03em;
  }
  .print-title .meta{font-size:9pt;color:#555;margin-top:3px;line-height:1.4;}
  .print-section-title{
    font-size:9.5pt;font-weight:700;text-transform:uppercase;
    letter-spacing:.05em;color:#333;
    margin:12px 0 6px;padding-bottom:3px;
    border-bottom:1px solid #ccc;
    page-break-after:avoid;
  }
  .print-info-grid{
    display:grid;grid-template-columns:repeat(3,1fr);
    gap:10px 20px;font-size:10pt;margin-bottom:14px;
  }
  .print-info-grid .lbl{
    font-size:8pt;text-transform:uppercase;letter-spacing:.05em;
    color:#888;font-weight:600;margin-bottom:2px;
  }
  .print-info-grid .val{font-weight:500;color:#111;overflow-wrap:anywhere;}
  table.print-table{
    width:100%;border-collapse:collapse;
    font-size:9.5pt;margin-bottom:14px;
  }
  table.print-table th{
    text-align:left;background:#efefef;color:#222;
    font-weight:700;font-size:8pt;text-transform:uppercase;
    letter-spacing:.03em;padding:4px 6px;border:1px solid #bbb;
  }
  table.print-table td{
    padding:4px 6px;border:1px solid #ddd;vertical-align:top;
    font-size:9pt;
  }
  table.print-table td.num,
  table.print-table th.num{
    text-align:right;font-family:'Courier New',monospace;white-space:nowrap;
  }
  table.print-table tr:nth-child(even) td{background:#fafafa;}
  .print-signatures{
    display:grid;grid-template-columns:repeat(3,1fr);
    gap:30px;margin-top:20px;padding-top:12px;
    page-break-inside:avoid;
    break-inside:avoid;
  }
  .print-signature{
    border-top:1px solid #111;padding-top:5px;
    font-size:9pt;text-align:center;
  }
  .print-signature .name{
    font-weight:700;color:#111;text-transform:uppercase;letter-spacing:.03em;
  }
  .print-signature .role{color:#666;font-size:8.5pt;margin-top:2px;}
  .print-qr-block{
    display:flex;align-items:center;gap:10px;
    font-size:8.5pt;color:#555;margin-bottom:14px;
    padding:8px 10px;border:1px dashed #bbb;border-radius:4px;
  }
  .print-qr-block svg{display:block;}
  .print-footer{
    display:flex;justify-content:space-between;
    font-size:8pt;color:#888;
    border-top:1px solid #ddd;padding-top:6px;
    margin-top:24px;
  }
  @page{ size:letter portrait; margin:14mm 12mm; }
  @media print{
    body{background:#fff !important;}
    table.print-table tr{page-break-inside:avoid;}
    table.print-table{page-break-inside:auto;}
    .print-signatures{page-break-inside:avoid;page-break-before:avoid;break-before:avoid;}
    .print-header,.print-info-grid,.print-qr-block{page-break-after:avoid;}
    /* Empujar firmas hacia arriba si es la última página */
    .print-signatures + .print-footer{page-break-before:avoid;}
  }
`;

function qrSVG(texto, tam){
  tam = tam || 64;
  try{
    if(typeof qrcode==='undefined') return '';
    const qr = qrcode(0, 'M');
    qr.addData(String(texto));
    qr.make();
    return qr.createSvgTag({cellSize: 2, margin: 0, scalable: true})
      .replace('<svg', '<svg style="width:'+tam+'px;height:'+tam+'px;"');
  }catch(e){ return ''; }
}

function printHeaderHTML(titulo, subtitulo){
  return '<div class="print-header">'
    +'<div class="print-brand">'+PRINT_LOGO_SVG
    +'<div><div class="print-company">Proclides Soluciones Estériles S.A.S.<small>AseptiQ · Sistema de gestión</small></div></div>'
    +'</div>'
    +'<div class="print-title">'
    +'<h1>'+titulo+'</h1>'
    +(subtitulo?'<div class="meta">'+subtitulo+'</div>':'')
    +'</div>'
    +'</div>';
}

function printFooterHTML(){
  const fecha = new Date().toLocaleString('es-CO');
  const usuario = SUPA_PROFILE ? (SUPA_PROFILE.email || SUPA_PROFILE.nombre || '') : '';
  return '<div class="print-footer">'
    +'<span>AseptiQ · '+fecha+'</span>'
    +'<span>'+(usuario||'')+'</span>'
    +'</div>';
}

function imprimirHTML(contenidoHTML, tituloVentana, cssExtra){
  const iframe = document.createElement('iframe');
  iframe.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write('<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>'+(tituloVentana||'Imprimir')+'</title>');
  doc.write('<style>'+PRINT_CSS_BASE+(cssExtra||'')+'</style>');
  doc.write('</head><body><div class="print-doc">');
  doc.write(contenidoHTML);
  doc.write('</div></body></html>');
  doc.close();
  setTimeout(function(){
    try{
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }catch(e){console.warn('Error al imprimir:',e);}
    setTimeout(function(){
      if(iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 2000);
  }, 450);
}

/* ============ CONFIGURACIÓN GLOBAL ============ */
/* La config vive en sys_config (Supabase). Cacheamos en memoria
   para no consultar en cada acceso. Fallback: localStorage si la
   tabla no existe (compatibilidad con versiones viejas). */
const CONFIG_DEFAULT={
  prefijoInsumo:'INS-',
  sidebar_behavior: 'click',
  prefijoSubproducto:'SUB-',
  prefijoProducto:'PT-',
  prefijoOP:'OP-',
  unidades:['u','m','kg','l','caja','rollo','m²'],
  umbralUrgente:30,
  umbralReorden:60
};

let _configCache=null;
let _configCargando=null;

function getConfig(){
  /* Síncrono: usa el cache si está disponible, si no el default.
     La primera vez hay que llamar a cargarConfig() (async). */
  if(_configCache) return Object.assign({},CONFIG_DEFAULT,_configCache);
  /* Fallback a localStorage para no romper llamadas tempranas */
  try{
    const s=JSON.parse(localStorage.getItem('inv_config'));
    return s ? Object.assign({},CONFIG_DEFAULT,s) : Object.assign({},CONFIG_DEFAULT);
  }catch(e){return Object.assign({},CONFIG_DEFAULT);}
}

async function cargarConfig(){
  /* Si ya está cargada, no hacer nada. Si hay una carga en curso, esperarla. */
  if(_configCache) return _configCache;
  if(_configCargando) return _configCargando;

  _configCargando=(async function(){
    try{
      const rows=await api('sys_config?id=eq.1&select=config');
      console.log('[AseptiQ] Config leída del backend:',rows);
      if(rows && rows.length && rows[0].config && Object.keys(rows[0].config).length>0){
        _configCache=rows[0].config;
        /* Sincronizar a localStorage como backup offline */
        try{localStorage.setItem('inv_config',JSON.stringify(_configCache));}catch(e){}
        console.log('[AseptiQ] Config cargada del backend:',_configCache);
        return _configCache;
      }
      /* Tabla vacía: migrar la config de localStorage si existe */
      let local=null;
      try{local=JSON.parse(localStorage.getItem('inv_config'));}catch(e){}
      if(local && Object.keys(local).length>0){
        _configCache=Object.assign({},CONFIG_DEFAULT,local);
        console.log('[AseptiQ] Migrando config de localStorage a backend:',_configCache);
        try{
          await api('sys_config',{
            method:'POST',
            headers:apiHeaders({'Prefer':'resolution=merge-duplicates'}),
            body:JSON.stringify({id:1,config:_configCache})
          });
        }catch(err){console.error('[AseptiQ] ERROR al migrar config:',err);}
        return _configCache;
      }
      _configCache=Object.assign({},CONFIG_DEFAULT);
      console.log('[AseptiQ] Config default aplicada (backend vacío):',_configCache);
      return _configCache;
    }catch(e){
      console.error('[AseptiQ] ERROR al leer config del backend:',e);
      try{
        const s=JSON.parse(localStorage.getItem('inv_config'));
        _configCache=s?Object.assign({},CONFIG_DEFAULT,s):Object.assign({},CONFIG_DEFAULT);
      }catch(err){_configCache=Object.assign({},CONFIG_DEFAULT);}
      return _configCache;
    }finally{
      _configCargando=null;
    }
  })();

  return _configCargando;
}

async function saveConfig(c){
  /* Guarda en Supabase y mantiene localStorage como backup */
  _configCache=Object.assign({},CONFIG_DEFAULT,c||{});
  try{localStorage.setItem('inv_config',JSON.stringify(_configCache));}catch(e){}

  const payloadStr = JSON.stringify({id:1,config:_configCache});
  if(payloadStr.length > 900 * 1024){
    const kb = Math.round(payloadStr.length / 1024);
    throw new Error('La configuración es demasiado grande ('+kb+' KB). Supabase tiene un límite de 1 MB. Si cargaste logos, usá archivos de menos de 100 KB o eliminalos.');
  }

  try{
    /* UPSERT: inserta si no existe, actualiza si existe.
       PostgREST lo hace con POST + Prefer: resolution=merge-duplicates */
    const res=await api('sys_config',{
      method:'POST',
      headers:apiHeaders({'Prefer':'resolution=merge-duplicates,return=representation'}),
      body:payloadStr
    });
    console.log('[AseptiQ] Config guardada en backend:',res);
  }catch(e){
    console.error('[AseptiQ] ERROR al guardar config en backend:',e);
    throw e;
  }
}

/* Invalida el cache de la app y del core (para que los umbrales cambien de inmediato) */
function _invalidateConfigCache(){
  _configCache=null;
  if(typeof window._invalidateConfigCache === 'function') {
    try { window._invalidateConfigCache(); } catch(e) {}
  }
}

/* ============ TEMA CLARO/OSCURO ============ */
function getTema(){
  try{return localStorage.getItem('aseptiq_tema')||'dark';}
  catch(e){return 'dark';}
}
function setTema(t){
  try{localStorage.setItem('aseptiq_tema',t);}catch(e){}
}
function aplicarTema(t){
  t=t||getTema();
  document.documentElement.setAttribute('data-theme',t);
  /* Si hay gráficos activos, los re-renderizamos con los colores nuevos */
  if(typeof Chart!=='undefined' && Object.keys(chartInstances).length>0){
    /* Reaplicar defaults leyendo las nuevas variables CSS */
    window._chartDefaultsDone=false;
    Object.keys(chartInstances).forEach(function(id){
      const c=chartInstances[id];
      if(!c) return;
      const cs=getComputedStyle(document.documentElement);
      const borderColor=cs.getPropertyValue('--border').trim()||'#2b3140';
      const textColor=cs.getPropertyValue('--text-secondary').trim()||'#8d95a6';
      const surface3=cs.getPropertyValue('--surface-3').trim()||'#262c3b';
      /* Ejes */
      if(c.options.scales){
        Object.keys(c.options.scales).forEach(function(k){
          const sc=c.options.scales[k];
          if(sc.grid && sc.grid.color) sc.grid.color=borderColor;
          if(sc.grid && sc.grid.display!==false) sc.grid.color=borderColor;
          if(sc.ticks) sc.ticks.color=textColor;
        });
      }
      /* Tooltips */
      if(c.options.plugins && c.options.plugins.tooltip){
        c.options.plugins.tooltip.backgroundColor=surface3;
        c.options.plugins.tooltip.borderColor=borderColor;
        c.options.plugins.tooltip.titleColor=cs.getPropertyValue('--text-primary').trim()||'#edeff3';
        c.options.plugins.tooltip.bodyColor=cs.getPropertyValue('--text-primary').trim()||'#edeff3';
      }
      /* Leyendas */
      if(c.options.plugins && c.options.plugins.legend && c.options.plugins.legend.labels){
        c.options.plugins.legend.labels.color=textColor;
      }
      c.update('none');
    });
  }
  /* Actualizar el icono del slider de configuración si está visible */
  if(typeof actualizarIconoTema==='function') actualizarIconoTema();
}

/* ============ PANELES COLAPSABLES ============ */
function _slug(str){
  return String(str||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,40);
}
function prepararPaneles(){
  const main=document.getElementById('mainContent');
  if(!main) return;
  const tabActivo=(document.querySelector('.nav-item.active')||{}).dataset ?
                  (document.querySelector('.nav-item.active').dataset.tab||'') : '';
  let idx=0;
  main.querySelectorAll('.panel').forEach(function(panel){
    /* Evitar doble preparación en el MISMO panel vivo.
       Si el HTML se re-renderizó, el panel es un nodo nuevo, sin panelReady. */
    if(panel.dataset.panelReady==='1'){idx++;return;}

    const header=panel.querySelector('.panel-header');
    if(!header){idx++;return;}

    /* Envolver el contenido posterior al header en .panel-body > .panel-body-inner.
       El wrapper externo maneja la animación de colapso; el interno el scroll. */
    const body=document.createElement('div');
    body.className='panel-body';
    const inner=document.createElement('div');
    inner.className='panel-body-inner';
    body.appendChild(inner);
    let node=header.nextSibling;
    while(node){
      const next=node.nextSibling;
      inner.appendChild(node);
      node=next;
    }
    panel.appendChild(body);

    /* Identificador estable por panel */
    const titulo=header.querySelector('h3') ? header.querySelector('h3').textContent : ('panel'+idx);
    const key='aseptiq_panel_'+tabActivo+'_'+_slug(titulo);
    panel.dataset.panelKey=key;

    /* Envolver todas las acciones del header en un contenedor alineado a la derecha.
       Así el header queda con exactamente 2 grupos: título (izq) y acciones (der). */
    const childrenNoTitulo=Array.from(header.children).filter(function(c){
      return c.tagName!=='H3';
    });
    let actionsWrap=header.querySelector('.panel-actions');
    if(!actionsWrap){
      actionsWrap=document.createElement('div');
      actionsWrap.className='panel-actions';
      childrenNoTitulo.forEach(function(c){ actionsWrap.appendChild(c); });
      header.appendChild(actionsWrap);
    }

    /* Botón toggle */
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='panel-toggle';
    btn.title='Colapsar / expandir';
    btn.setAttribute('aria-label','Colapsar panel');
    btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
    actionsWrap.appendChild(btn);

    /* Marcar el panel como scrollable si contiene una tabla grande
       o un listado largo de .list-item. */
    /* Marcar el panel como scrollable si contiene una tabla grande
       o un listado largo de .list-item. */
    const listItems=body.querySelectorAll('.list-item');
    const tieneListado=listItems.length>5;
    if((body.querySelector('table')||tieneListado) && !panel.classList.contains('no-scroll')){
      panel.classList.add('panel--scroll');
    }

    /* ¿Tiene tabla? entonces por defecto expandido. Si no, colapsado si es formulario */
    const tieneTabla=!!body.querySelector('table');

    /* Restaurar estado guardado, o elegir por default */
    let estadoGuardado=null;
    try{ estadoGuardado=localStorage.getItem(key); }catch(e){}
    const forceExpand=panel.classList.contains('force-expanded');
    const forceCollapse=panel.classList.contains('force-collapsed');
    /* Prioridad: localStorage (si el usuario ya decidió) > .force-* > heurística.
       Los .force-* son solo valores por defecto para el primer render. */
    if(estadoGuardado==='collapsed'){ panel.classList.add('collapsed'); }
    else if(estadoGuardado==='expanded'){ panel.classList.remove('collapsed'); }
    else if(forceCollapse){ panel.classList.add('collapsed'); }
    else if(forceExpand){ panel.classList.remove('collapsed'); }
    else {
      if(!tieneTabla) panel.classList.add('collapsed');
    }

    /* Click del toggle */
    btn.addEventListener('click',function(ev){
      ev.stopPropagation();
      const colapsado=panel.classList.toggle('collapsed');
      try{ localStorage.setItem(key, colapsado?'collapsed':'expanded'); }catch(e){}
    });

    panel.dataset.panelReady='1';
    idx++;
  });
}

/* Atajo: Esc colapsa el panel activo (el primero sin colapsar) */
document.addEventListener('keydown',function(ev){
  if(ev.key!=='Escape') return;
  const modal=document.querySelector('.modal-overlay.open');
  if(modal) return;
  const enCampo=ev.target && (ev.target.tagName==='INPUT'||ev.target.tagName==='TEXTAREA'||ev.target.tagName==='SELECT');
  if(enCampo) return;
  /* Si hay algún panel expandido que no sea listado (formulario), colapsarlo */
  const formularios=Array.from(document.querySelectorAll('.panel:not(.collapsed)'))
    .filter(function(p){ return !p.classList.contains('panel--scroll'); });
  if(formularios.length){
    const p=formularios[formularios.length-1];
    p.classList.add('collapsed');
    if(p.dataset.panelKey){
      try{ localStorage.setItem(p.dataset.panelKey,'collapsed'); }catch(e){}
    }
  }
});

/* ============ BOTÓN ACTUALIZAR ============ */
function botonRefreshHTML(tab){
  return '<button class="btn-refresh" data-refresh-tab="'+tab+'" title="Actualizar datos"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M3 4v5h5"/><path d="M21 20v-5h-5"/></svg></button>';
}
document.addEventListener('click',function(ev){
  const btn=ev.target.closest('[data-refresh-tab]');
  if(!btn) return;
  ev.preventDefault();
  btn.classList.add('spinning');
  const tab=btn.dataset.refreshTab;
  const main=document.getElementById('mainContent');
  showLoader('Actualizando…');
  Promise.resolve(renderTab(tab))
    .finally(function(){
      hideLoader();
      prepararPaneles();
      setTimeout(function(){btn.classList.remove('spinning');},350);
    });
});

/* ============ SORT ============ */
const sortState={};
function getSortState(k){if(!sortState[k])sortState[k]={key:'nombre',dir:'asc'};return sortState[k];}
function setSortState(listKey,colKey){
  const s=getSortState(listKey);
  if(s.key===colKey)s.dir=s.dir==='asc'?'desc':'asc';
  else{s.key=colKey;s.dir='asc';}
}
function applySort(items,listKey,getters){
  const s=getSortState(listKey);
  const g=getters[s.key]||getters.nombre||function(x){return x.nombre||'';};
  const arr=(items||[]).slice();
  arr.sort(function(a,b){
    const va=g(a),vb=g(b);
    if(typeof va==='number'&&typeof vb==='number')return s.dir==='asc'?va-vb:vb-va;
    const sa=String(va==null?'':va).toLowerCase(),sb=String(vb==null?'':vb).toLowerCase();
    return s.dir==='asc'?sa.localeCompare(sb,'es'):sb.localeCompare(sa,'es');
  });
  return arr;
}
function thSort(label,colKey,listKey,alignRight){
  const s=getSortState(listKey);
  const active=s.key===colKey;
  const arrow=active?(s.dir==='asc'?'▲':'▼'):'';
  const style=alignRight?'text-align:right;':'';
  return '<th class="sortable'+(alignRight?' num':'')+'" data-sort-key="'+colKey+'" data-sort-list="'+listKey+'" style="'+style+'" title="Ordenar por '+label+'">'+label+(arrow?' <span style="font-size:10px;color:var(--accent);">'+arrow+'</span>':'')+'</th>';
}
function bindSortHeaders(reRenderFn){
  document.querySelectorAll('th[data-sort-key]').forEach(function(th){
    th.addEventListener('click',function(){setSortState(th.dataset.sortList,th.dataset.sortKey);reRenderFn();});
  });
}
const PAGINACION_LIMITE=25;
function paginarTabla(tableId,pageSize){
  pageSize=pageSize||PAGINACION_LIMITE;
  const table=document.getElementById(tableId);
  if(!table)return;
  const allRows=Array.from(table.querySelectorAll('tr')).filter(function(tr){return !tr.querySelector('th');});
  const existing=document.querySelector('[data-pag-for="'+tableId+'"]');
  if(existing)existing.remove();
  if(allRows.length<=pageSize)return;
  let visible=pageSize;
  function render(){
    allRows.forEach(function(tr,i){tr.style.display=i<visible?'':'none';});
    let container=document.querySelector('[data-pag-for="'+tableId+'"]');
    if(!container){
      container=document.createElement('div');
      container.setAttribute('data-pag-for',tableId);
      container.style.padding='14px 18px';
      container.style.textAlign='center';
      container.style.borderTop='1px solid var(--border)';
      container.style.color='var(--text-secondary)';
      container.style.fontSize='12.5px';
      table.parentNode.appendChild(container);
    }
    if(visible>=allRows.length){
      container.innerHTML='<span style="color:var(--text-muted);">Mostrando <b style="color:var(--text-secondary);">'+allRows.length+'</b> de <b style="color:var(--text-secondary);">'+allRows.length+'</b> registros</span>';
    } else {
      container.innerHTML='<span style="color:var(--text-muted);margin-right:12px;">Mostrando <b style="color:var(--text-secondary);">'+visible+'</b> de <b style="color:var(--text-secondary);">'+allRows.length+'</b> registros</span>'
        +'<button class="secondary small" style="margin-left:8px;">Cargar más ('+(allRows.length-visible)+')</button>';
      container.querySelector('button').onclick=function(){visible+=pageSize;render();};
    }
  }
  render();
}
function filtrarTabla(inputId,tableId){
  const input=document.getElementById(inputId);if(!input)return;
  input.addEventListener('input',debounce(function(){
    const q=input.value.toLowerCase();
    const table=document.getElementById(tableId);
    if(!table)return;
    const rows=Array.from(table.querySelectorAll('tr')).filter(function(tr){return !tr.querySelector('th');});
    const pag=document.querySelector('[data-pag-for="'+tableId+'"]');
    if(!q){
      if(pag)pag.remove();
      paginarTabla(tableId);
      return;
    }
    rows.forEach(function(tr){
      tr.style.display=tr.textContent.toLowerCase().includes(q)?'':'none';
    });
    if(pag){
      const visibles=rows.filter(function(tr){return tr.style.display!=='none';}).length;
      pag.innerHTML='<span style="color:var(--text-muted);">Mostrando <b style="color:var(--text-secondary);">'+visibles+'</b> de <b style="color:var(--text-secondary);">'+rows.length+'</b> registros (filtrados)</span>';
    }
  },150));
}
function filtrarDivs(inputId,prefix){
  const input=document.getElementById(inputId);if(!input)return;
  const todos=document.querySelectorAll('[id^="'+prefix+'"]');
  /* Insertar contador si no existe */
  const box=input.closest('.panel');
  let cont=box?box.querySelector('[data-filter-count]'):null;
  if(box&&!cont){
    cont=document.createElement('div');
    cont.setAttribute('data-filter-count','1');
    cont.style.cssText='padding:0 18px 10px;font-size:11.5px;color:var(--text-muted);';
    input.parentNode.insertAdjacentElement('afterend',cont);
  }
  function actualizar(){
    const visibles=Array.from(todos).filter(function(d){return d.style.display!=='none';}).length;
    if(cont) cont.innerHTML='Mostrando <b style="color:var(--text-secondary);">'+visibles+'</b> de <b style="color:var(--text-secondary);">'+todos.length+'</b> registros';
  }
  actualizar();
  input.addEventListener('input',debounce(function(){
    const q=input.value.toLowerCase();
    todos.forEach(function(d){d.style.display=d.textContent.toLowerCase().includes(q)?'':'none';});
    actualizar();
  },150));
}

/* ============ COMBO ============ */
function comboInput(prefix,idx,options,selectedId,placeholder){
  const sel=(options||[]).find(function(o){return o.id===selectedId;});
  const display=sel?sel.nombre:'';
  const dlId=prefix+'_dl_'+idx;
  const opts=(options||[]).map(function(o){
    /* El texto visible tendrá nombre y código para búsqueda exacta */
    const txt = o.nombre + (o.codigo ? ' ('+o.codigo+')' : '');
    return '<option value="'+String(txt).replace(/"/g,'&quot;')+'" data-id="'+o.id+'" data-name="'+String(o.nombre).replace(/"/g,'&quot;')+'" data-codigo="'+String(o.codigo||'')+'"></option>';
  }).join('');
  return '<input type="text" class="combo" id="'+prefix+'_sel_'+idx+'" list="'+dlId+'" value="'+String(display).replace(/"/g,'&quot;')+'" placeholder="'+(placeholder||'Buscar…')+'"><datalist id="'+dlId+'">'+opts+'</datalist>';
}
function getComboValue(inputId){
  const el=document.getElementById(inputId);if(!el)return '';
  const dl=document.getElementById(el.getAttribute('list'));if(!dl)return '';
  const v=el.value.trim();
  /* Buscar por valor exacto, o por nombre, o por código si el usuario tipeó solo el código */
  let found=Array.from(dl.options).find(function(o){return o.value===v;});
  if(!found){
    found=Array.from(dl.options).find(function(o){return o.dataset.name===v || o.dataset.codigo===v;});
  }
  return found?found.dataset.id:'';
}

/* ============ LOGIN ============ */
/* Enter en cualquier campo del login = conectar */
['supaUrl','supaKey','supaEmail','supaPassword'].forEach(function(id){
  const el=document.getElementById(id);
  if(el) el.addEventListener('keydown',function(ev){
    if(ev.key==='Enter'){ev.preventDefault();document.getElementById('connectBtn').click();}
  });
});
document.getElementById('connectBtn').addEventListener('click',async function(){
  const btn=this;
  const url=document.getElementById('supaUrl').value.trim();
  const key=document.getElementById('supaKey').value.trim();
  const email=document.getElementById('supaEmail').value.trim();
  const password=document.getElementById('supaPassword').value;
  const errBox=document.getElementById('connectError');
  errBox.style.display='none';
  if(!url||!key){errBox.textContent='Completa la URL y la anon key.';errBox.style.display='block';return;}
  if(!email||!password){errBox.textContent='Ingresa tu correo y contraseña.';errBox.style.display='block';return;}
  if(typeof supabase==='undefined'){errBox.textContent='No se pudo cargar supabase-js. Revisa tu conexión.';errBox.style.display='block';return;}

  btn.classList.add('btn-loading');
  btn.disabled=true;

  SUPA_URL=url;SUPA_KEY=key;
  SUPA_CLIENT=supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true}});
  
  SUPA_CLIENT.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' && !_cerrandoPorExpiracion) {
      manejarSesionExpirada();
    }
  });

  try{
    /* Delay mínimo de 400ms para que el spinner no parpadee en logins instantáneos */
    const minDelay=new Promise(function(r){setTimeout(r,400);});
    const authPromise=SUPA_CLIENT.auth.signInWithPassword({email:email,password:password});
    const [authResult]=await Promise.all([authPromise,minDelay]);
    const {data,error}=authResult;
    if(error) throw new Error(error.message);

    SUPA_SESSION=data.session;
    await cargarRol();

    if(SUPA_PROFILE && SUPA_PROFILE.activo === false){
      await SUPA_CLIENT.auth.signOut();
      SUPA_SESSION=null;
      throw new Error('Tu cuenta está desactivada. Contacta al administrador.');
    }

    /* URL + anon key */
    if(document.getElementById('rememberMe').checked){
      try{localStorage.setItem('inv_supa_creds',JSON.stringify({url:url,key:key}));}catch(e){}
    } else {
      try{localStorage.removeItem('inv_supa_creds');}catch(e){}
    }
    /* Email + contraseña */
    /* Seguridad: Eliminamos por completo el guardado de contraseña en localStorage */
    try{localStorage.removeItem('aseptiq_creds');}catch(e){}

    /* Transición a la app */
    try{localStorage.setItem('aseptiq_tab','dashboard');}catch(e){}
    const boot=document.getElementById('bootScreen');
    if(boot) boot.style.display='none';
    document.getElementById('connectScreen').style.display='none';
    document.getElementById('app').style.display='block';
    if(typeof aplicarTema==='function') aplicarTema();
    if(typeof aplicarSidebarColapsado==='function') aplicarSidebarColapsado();
    if(typeof activarNavItem==='function') activarNavItem('dashboard');
    dialogInit();
    renderTab('dashboard');
    initInactivityTracker();
    setTimeout(actualizarCampana, 800);
  }catch(e){
    const m=String(e.message||e);
    if(/Invalid login credentials/i.test(m)) errBox.textContent='Correo o contraseña incorrectos.';
    else if(/Email not confirmed/i.test(m)) errBox.textContent='El correo no está confirmado. Márcalo como confirmado en Supabase.';
    else errBox.textContent='No se pudo iniciar sesión: '+m;
    errBox.style.display='block';
  }finally{
    btn.classList.remove('btn-loading');
    btn.disabled=false;
  }
});

/* Aplicar tema guardado apenas carga la página */
(function(){ try{document.documentElement.setAttribute('data-theme',getTema());}catch(e){} })();

/* Toggle del aviso cuando se activa/desactiva el checkbox */
document.getElementById('rememberCreds').addEventListener('change',function(e){
  document.getElementById('credsWarning').style.display=e.target.checked?'block':'none';
});

/* ============ TABLAS RESPONSIVE ============ */
/* Marca automáticamente cada tabla nueva con:
   - clase .responsive-table
   - data-label en cada <td> (tomado del <th> de su columna)
   - clase .row-header en la fila que contiene los <th>
   Esto permite que en móvil el CSS las convierta en tarjetas. */
(function initResponsiveTables(){
  function procesarTabla(tabla){
    if(!tabla || tabla.dataset.responsiveReady==='1') return;
    if(tabla.classList.contains('no-responsive')) return;
    /* Fila de encabezados: la primera <tr> que tenga <th> */
    const filas=tabla.querySelectorAll('tr');
    let filaHeader=null;
    for(let i=0;i<filas.length;i++){
      if(filas[i].querySelector('th')){filaHeader=filas[i];break;}
    }
    if(!filaHeader) return;
    const headers=Array.from(filaHeader.querySelectorAll('th')).map(function(th){
      return th.textContent.replace(/[▲▼]/g,'').trim();
    });
    if(!headers.length) return;

    tabla.classList.add('responsive-table');
    filaHeader.classList.add('row-header');

    filas.forEach(function(tr){
      if(tr===filaHeader) return;
      if(tr.querySelector('th')){tr.classList.add('row-header');return;}
      Array.from(tr.children).forEach(function(td,i){
        if(headers[i]!==undefined && headers[i]!=='') td.setAttribute('data-label',headers[i]);
      });
    });
    tabla.dataset.responsiveReady='1';
  }

  function procesarTodo(){
    document.querySelectorAll('table').forEach(procesarTabla);
  }

  /* Procesar todo lo que ya existe */
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',procesarTodo);
  } else {
    procesarTodo();
  }

  /* Observar cambios en el DOM para tablas nuevas (modales, re-renders) */
  const obs=new MutationObserver(function(muts){
    let hayNuevas=false;
    muts.forEach(function(m){
      if(!m.addedNodes||!m.addedNodes.length)return;
      m.addedNodes.forEach(function(n){
        if(n.nodeType!==1)return;
        if(n.tagName==='TABLE'||(n.querySelector&&n.querySelector('table'))){hayNuevas=true;}
      });
    });
    if(hayNuevas) procesarTodo();
  });
  if(document.body){
    obs.observe(document.body,{childList:true,subtree:true});
  } else {
    document.addEventListener('DOMContentLoaded',function(){
      obs.observe(document.body,{childList:true,subtree:true});
    });
  }

  /* Exponer para llamar a mano si hiciera falta */
  window._procesarTablasResponsive=procesarTodo;
})();

/* ============ DRAWER MÓVIL ============ */
function esMobile(){
  return window.matchMedia('(max-width: 640px)').matches;
}
function abrirDrawer(){
  const sb=document.getElementById('sidebarPrincipal');
  const ov=document.getElementById('drawerOverlay');
  if(sb) sb.classList.add('drawer-open');
  if(ov) ov.classList.add('open');
  document.body.style.overflow='hidden';
}
function cerrarDrawer(){
  const sb=document.getElementById('sidebarPrincipal');
  const ov=document.getElementById('drawerOverlay');
  if(sb) sb.classList.remove('drawer-open');
  if(ov) ov.classList.remove('open');
  document.body.style.overflow='';
}
(function initDrawer(){
  const btn=document.getElementById('btnMobileMenu');
  const ov=document.getElementById('drawerOverlay');
  if(btn){
    btn.addEventListener('click',function(){
      const sb=document.getElementById('sidebarPrincipal');
      if(sb && sb.classList.contains('drawer-open')) cerrarDrawer();
      else abrirDrawer();
    });
  }
  if(ov){
    ov.addEventListener('click',cerrarDrawer);
  }
  /* Cerrar drawer con Escape */
  document.addEventListener('keydown',function(ev){
    if(ev.key==='Escape'){
      const sb=document.getElementById('sidebarPrincipal');
      if(sb && sb.classList.contains('drawer-open')) cerrarDrawer();
    }
  });
  /* Al cambiar de tamaño: si pasamos a desktop, cerramos drawer por las dudas.
     Si hay notificaciones abiertas, limpiamos el left inline para que el CSS móvil aplique. */
  window.addEventListener('resize', debounce(function(){
    if(!esMobile()) cerrarDrawer();
    const panel=document.querySelector('#notifOverlay .notif-panel');
    if(panel){
      if(esMobile()){
        panel.style.left='';
        panel.style.right='';
        panel.style.width='';
      } else {
        const sb=document.getElementById('sidebarPrincipal');
        if(sb){
          const isCol=sb.classList.contains('collapsed');
          panel.style.left=isCol?'76px':'236px';
        }
      }
    }
  }, 200));
})();

/* ============ SIDEBAR COLAPSABLE ============ */
function getSidebarColapsado(){
  try{return localStorage.getItem('aseptiq_sidebar_collapsed')==='1';}
  catch(e){return false;}
}
function setSidebarColapsado(v){
  try{localStorage.setItem('aseptiq_sidebar_collapsed', v?'1':'0');}catch(e){}
  const sb=document.getElementById('sidebarPrincipal');
  if(sb) sb.classList.toggle('collapsed', !!v);
  const btn=document.getElementById('btnToggleSidebar');
  if(btn) btn.title = v?'Expandir menú':'Minimizar menú';
}
function aplicarSidebarColapsado(){
  /* En móvil el sidebar es drawer, no se colapsa */
  if(typeof esMobile==='function' && esMobile()){
    const sb=document.getElementById('sidebarPrincipal');
    if(sb) {
      sb.classList.remove('collapsed');
      sb.classList.remove('sidebar-hover-mode');
    }
    return;
  }
  
  const cfg = getConfig();
  const sb = document.getElementById('sidebarPrincipal');
  const btn = document.getElementById('btnToggleSidebar');
  
  if (cfg.sidebar_behavior === 'hover') {
    if(sb) {
      sb.classList.add('sidebar-hover-mode');
      sb.classList.add('collapsed'); /* Forzamos colapsado para que funcione el hover */
    }
    if(btn) btn.style.display = 'none';
  } else {
    if(sb) sb.classList.remove('sidebar-hover-mode');
    if(btn) btn.style.display = '';
    setSidebarColapsado(getSidebarColapsado());
  }
}
(function(){
  const btn=document.getElementById('btnToggleSidebar');
  if(btn){
    btn.addEventListener('click',function(){
      setSidebarColapsado(!getSidebarColapsado());
    });
  } else {
    console.warn('[AseptiQ] btnToggleSidebar no encontrado. Revisa el HTML del sidebar.');
  }
})();

/* Click en el logo lleva al Dashboard */
(function(){
  const ir=function(){
    if(typeof irATab==='function') irATab('dashboard');
  };
  /* Brand del sidebar */
  const brand=document.getElementById('brandHome');
  if(brand){
    brand.addEventListener('click',ir);
    brand.addEventListener('keydown',function(ev){
      if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();ir();}
    });
  }
  /* Brand del header móvil */
  const mobileBrand=document.querySelector('.mobile-brand');
  if(mobileBrand){
    mobileBrand.style.cursor='pointer';
    mobileBrand.setAttribute('role','button');
    mobileBrand.setAttribute('tabindex','0');
    mobileBrand.setAttribute('title','Ir al Dashboard');
    mobileBrand.addEventListener('click',ir);
    mobileBrand.addEventListener('keydown',function(ev){
      if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();ir();}
    });
  }
})();

/* ============ ATAJOS DE TECLADO ============ */
document.addEventListener('keydown',function(ev){
  /* Ignorar si el foco está en un input/textarea/select o hay un modal abierto */
  const t=ev.target;
  const enCampo=t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable);
  const modalAbierto=document.querySelector('.modal-overlay.open');
  if(enCampo||modalAbierto) return;
  /* Ignorar combinaciones con Ctrl/Alt/Meta */
  if(ev.ctrlKey||ev.altKey||ev.metaKey) return;

  const k=ev.key.toLowerCase();

  /* "/" → enfocar el buscador del módulo activo */
  if(k==='/'){
    ev.preventDefault();
    const input=document.querySelector('.search-box input, input[id^="buscar_"]');
    if(input){input.focus();input.select();}
    return;
  }

  /* "g" + tecla → navegación rápida */
  if(k==='g'){
    window._gPressed=true;
    clearTimeout(window._gTimeout);
    window._gTimeout=setTimeout(function(){window._gPressed=false;},1500);
    return;
  }
  if(window._gPressed){
    window._gPressed=false;
    clearTimeout(window._gTimeout);
    const mapa={d:'dashboard',o:'orden',n:'novedades',i:'insumos',p:'productos',e:'entradas',x:'devoluciones',v:'proveedores',a:'auditoria',k:'kardex',b:'compras',m:'mermas',h:'historico',c:'costos',r:'rentabilidad',t:'trazabilidad',y:'backup',u:'usuarios'};
    const tab=mapa[k];
    if(tab){
      ev.preventDefault();
      irATab(tab);
    }
    return;
  }
});

/* ============ AJUSTE DE COSTO MANUAL ============ */
document.addEventListener('click',async function(ev){
  const el=ev.target.closest('[data-ajuste-costo]');
  if(!el) return;
  if(SUPA_ROLE==='consulta'){toast('Tu rol es Consulta — solo lectura.','error');return;}
  const insumoId=el.dataset.ajusteCosto;
  const costoActual=parseFloat(el.dataset.costo)||0;
  const nombre=el.dataset.nombre;

  /* 1. Pedir el nuevo costo */
  const valor=await promptear({
    title:'Ajustar costo unitario',
    message:nombre+' · costo actual: '+money(costoActual),
    icon:'$',
    variant:'info',
    value:String(costoActual),
    placeholder:'Nuevo costo (por unidad de consumo)',
    okText:'Continuar'
  });
  if(valor===null) return;
  const nuevo=parseFloat(String(valor).replace(',','.'));
  if(isNaN(nuevo)||nuevo<0){toast('Ingresa un valor numérico no negativo.','error');return;}
  if(Math.abs(nuevo-costoActual)<0.001){toast('El costo no cambió.','error');return;}

  /* 2. Pedir motivo (opcional) */
  const motivo=await promptear({
    title:'Motivo del ajuste',
    message:'El cambio quedará registrado en la auditoría con tu usuario y fecha.',
    icon:'✎',
    variant:'info',
    value:'',
    placeholder:'Ej: corrección de digitación, costo nuevo del proveedor',
    okText:'Guardar ajuste'
  });
  if(motivo===null) return;

  /* 3. Ejecutar */
  try{
    const r=await rpc('ajustar_costo_insumo',{
      p_insumo_id:insumoId,
      p_costo_nuevo:nuevo,
      p_motivo:(motivo&&motivo.trim())?motivo.trim():null
    });
    toast('Costo ajustado: '+money(r.costo_anterior)+' → '+money(r.costo_nuevo),'success');
    renderInsumos();
  }catch(e){toast(e.message,'error');}
});

/* ============ MODAL GENÉRICO (SOPORTA APILAMIENTO) ============ */
let _modalCounter = 0;
const _modalStack = [];

function abrirModalGenerico(opts){
  const modalId = 'genModal_' + (++_modalCounter);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = modalId;
  overlay.innerHTML = `
    <div class="modal-box" id="${modalId}Box">
      <div class="modal-header">
        <div class="modal-icon info" id="${modalId}Icon"></div>
        <div style="flex:1;min-width:0;">
          <h3 id="${modalId}Title"></h3>
          <p id="${modalId}Subtitle"></p>
        </div>
        <button class="ghost small" id="${modalId}Close" title="Cerrar" style="padding:6px 10px;">×</button>
      </div>
      <div class="modal-body" id="${modalId}Body"></div>
      <div class="modal-footer" id="${modalId}Footer" style="display:none;"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const box = overlay.querySelector(`#${modalId}Box`);
  const icon = overlay.querySelector(`#${modalId}Icon`);
  const title = overlay.querySelector(`#${modalId}Title`);
  const subtitle = overlay.querySelector(`#${modalId}Subtitle`);
  const body = overlay.querySelector(`#${modalId}Body`);
  const footer = overlay.querySelector(`#${modalId}Footer`);

  box.className = 'modal-box' + (opts.size === 'md' ? ' modal-md' : (opts.size === 'wide' ? ' modal-wide' : ''));
  icon.className = 'modal-icon ' + (opts.variant || 'info');
  icon.innerHTML = opts.icon || icono('info');
  title.textContent = opts.title || '';
  
  if (opts.subtitle) {
    subtitle.textContent = opts.subtitle;
    subtitle.style.display = 'block';
  } else {
    subtitle.textContent = '';
    subtitle.style.display = 'none';
  }

  body.innerHTML = opts.body || '';

  if (opts.footer) {
    footer.innerHTML = opts.footer;
    footer.style.display = 'flex';
  } else {
    footer.innerHTML = '';
    footer.style.display = 'none';
  }

  overlay.querySelector(`#${modalId}Close`).onclick = () => cerrarModalGenerico(modalId);
  
  const keydownHandler = (ev) => {
    if (ev.key === 'Escape' && overlay.classList.contains('open')) {
      cerrarModalGenerico(modalId);
    }
  };
  document.addEventListener('keydown', keydownHandler);

  _modalStack.push({ id: modalId, overlay: overlay, onClose: opts.onClose, keydownHandler: keydownHandler });

  _abrirOverlay(modalId);

  if (typeof opts.onOpen === 'function') {
    setTimeout(() => opts.onOpen(body), 30);
  }

  return modalId;
}

function cerrarModalGenerico(modalId){
  let index = -1;
  
  /* Si nos pasan un string válido (como el ID del modal), buscamos ese modal.
     Si nos pasan un Evento (por un addEventListener) o nada, cerramos el último (el de arriba). */
  if (typeof modalId === 'string') {
    index = _modalStack.findIndex(m => m.id === modalId);
  }
  
  /* Si no encontramos el ID o no nos pasaron uno, cerramos el modal superior de la pila */
  if (index === -1 && _modalStack.length > 0) {
    index = _modalStack.length - 1;
  }

  if (index === -1) return;
  
  const modal = _modalStack[index];
  _cerrarOverlay(modal.id);
  
  document.removeEventListener('keydown', modal.keydownHandler);

  setTimeout(() => {
    if (modal.overlay.parentNode) modal.overlay.parentNode.removeChild(modal.overlay);
  }, 400);

  _modalStack.splice(index, 1);

  if (typeof modal.onClose === 'function') {
    try { modal.onClose(); } catch(e) { console.warn('onClose error',e); }
  }
}

/* Helper universal para modal overlays con fade-out */
function _abrirOverlay(id){
  const ov=document.getElementById(id);
  if(!ov) return;
  ov.style.display='flex';
  /* Forzar reflow para que la transición arranque */
  void ov.offsetWidth;
  ov.classList.add('open');
}
function _cerrarOverlay(id){
  const ov=document.getElementById(id);
  if(!ov) return;
  ov.classList.remove('open');
  /* Esperar a que termine la transición antes de ocultar.
     420ms > 380ms de transición de .modal-box → margen de seguridad. */
  setTimeout(function(){
    if(!ov.classList.contains('open')) ov.style.display='none';
  },420);
}

/* ============ MODAL DE ATAJOS ============ */
(function(){
  const overlay=document.getElementById('shortcutsModal');
  if(!overlay) return;
  function abrir(){_abrirOverlay('shortcutsModal');}
  function cerrar(){_cerrarOverlay('shortcutsModal');}
  document.getElementById('shortcutsCerrar').addEventListener('click',cerrar);
  /* Click fuera NO cierra el modal: solo botones o ESC */

  /* Abrir con "?" (Shift + /) */
  document.addEventListener('keydown',function(ev){
    const t=ev.target;
    const enCampo=t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable);
    if(enCampo) return;
    if(ev.key==='?'){
      ev.preventDefault();
      abrir();
    } else if(ev.key==='Escape' && overlay.classList.contains('open')){
      cerrar();
    }
  });
})();

/* ============ NAVEGACIÓN SIDEBAR ============ */

/* ============ BÚSQUEDA EN EL SIDEBAR ============ */
(function initSidebarSearch(){
  const input=document.getElementById('sidebarSearch');
  const clear=document.getElementById('sidebarSearchClear');
  const nav=document.getElementById('sidebarNav');
  if(!input||!nav) return;

  /* Guardar el estado original de los grupos para restaurar al limpiar */
  function limpiarBusqueda(){
    input.value='';
    clear.style.display='none';
    nav.classList.remove('searching');
    nav.querySelectorAll('.nav-item.hidden, .nav-group.hidden').forEach(function(el){
      el.classList.remove('hidden');
    });
    const noRes=nav.querySelector('.sidebar-no-results');
    if(noRes) noRes.remove();
    /* Restaurar qué grupo estaba abierto antes de la búsqueda */
    document.querySelectorAll('.nav-group').forEach(function(g){
      g.classList.toggle('open', g===_grupoAbiertoAntes);
    });
  }

  let _grupoAbiertoAntes=null;

  function filtrar(){
    const q=input.value.trim().toLowerCase();
    if(!q){ limpiarBusqueda(); return; }

    /* Recordar el grupo abierto solo la primera vez que se activa la búsqueda */
    if(!nav.classList.contains('searching')){
      _grupoAbiertoAntes=nav.querySelector('.nav-group.open');
    }

    clear.style.display='flex';
    nav.classList.add('searching');

    let totalVisible=0;
    nav.querySelectorAll('.nav-group').forEach(function(grupo){
      let visiblesEnGrupo=0;
      grupo.querySelectorAll('.nav-item').forEach(function(item){
        const txt=(item.textContent+' '+(item.title||'')).toLowerCase();
        if(txt.indexOf(q)>=0){
          item.classList.remove('hidden');
          visiblesEnGrupo++;
        } else {
          item.classList.add('hidden');
        }
      });
      if(visiblesEnGrupo>0){
        grupo.classList.remove('hidden');
        totalVisible+=visiblesEnGrupo;
      } else {
        grupo.classList.add('hidden');
      }
    });

    /* Mensaje de "sin resultados" */
    let noRes=nav.querySelector('.sidebar-no-results');
    if(totalVisible===0){
      if(!noRes){
        noRes=document.createElement('div');
        noRes.className='sidebar-no-results';
        nav.appendChild(noRes);
      }
      noRes.textContent='Sin resultados para "'+input.value+'".';
    } else if(noRes){
      noRes.remove();
    }
  }

  input.addEventListener('input',debounce(filtrar,120));

  input.addEventListener('keydown',function(ev){
    if(ev.key==='Escape'){
      ev.preventDefault();
      input.blur();
      limpiarBusqueda();
    } else if(ev.key==='Enter'){
      ev.preventDefault();
      /* Navegar al primer item visible */
      const primero=nav.querySelector('.nav-item:not(.hidden)');
      if(primero){
        primero.click();
        input.blur();
        limpiarBusqueda();
      }
    }
  });

  clear.addEventListener('click',function(){
    input.value='';
    filtrar();
    input.focus();
  });

  /* Atajo: al presionar "/" cuando el focus no está en un campo,
     si el sidebar está visible, enfocar el buscador del sidebar.
     (Se mantiene el atajo existente que busca en el módulo activo;
      este solo actúa como fallback cuando NO hay buscador de módulo visible) */
})();

/* ============ NAVEGACIÓN CON GRUPOS ============ */
/* Helper universal: ir a una pestaña sin depender del botón del sidebar */
function irATab(tab){
  /* Marcar el item activo si existe */
  document.querySelectorAll('.nav-item').forEach(function(b){
    if(b.dataset.tab===tab) b.classList.add('active');
    else b.classList.remove('active');
  });
  /* Guardar preferencia */
  try{localStorage.setItem('aseptiq_tab',tab);}catch(e){}
  /* Abrir el grupo correspondiente (si existe) */
  if(typeof abrirGrupoDelTab==='function') abrirGrupoDelTab(tab);
  /* Renderizar el módulo */
  renderTab(tab);
  /* Cerrar el drawer en móvil */
  if(typeof esMobile==='function' && esMobile() && typeof cerrarDrawer==='function'){
    cerrarDrawer();
  }
}

function abrirGrupoDelTab(tab){
  const item=document.querySelector('.nav-item[data-tab="'+tab+'"]');
  /* Limpiar has-active de todos los grupos */
  document.querySelectorAll('.nav-group').forEach(function(g){
    g.classList.remove('has-active');
  });
  if(!item) return;
  const grupo=item.closest('.nav-group');
  if(!grupo) return;
  grupo.classList.add('has-active');
  document.querySelectorAll('.nav-group').forEach(function(g){
    g.classList.toggle('open', g===grupo);
  });
  setTimeout(function(){
    const nav=document.getElementById('sidebarNav');
    if(nav && item){
      const itemTop=item.offsetTop;
      const itemBottom=itemTop+item.offsetHeight;
      if(itemTop<nav.scrollTop || itemBottom>nav.scrollTop+nav.clientHeight){
        item.scrollIntoView({block:'nearest',behavior:'smooth'});
      }
    }
  }, 50);
}

document.querySelectorAll('.nav-group-title').forEach(function(btn){
  btn.addEventListener('click',function(){
    const grupo=btn.closest('.nav-group');
    const estabaAbierto=grupo.classList.contains('open');
    document.querySelectorAll('.nav-group').forEach(function(g){
      g.classList.remove('open');
    });
    if(!estabaAbierto){
      grupo.classList.add('open');
    }
  });
});

document.querySelectorAll('.nav-item').forEach(function(btn){
  btn.addEventListener('click',function(){
    limpiarFiltroModulo();
    irATab(btn.dataset.tab);
  });
});

document.getElementById('btnCerrarSesion').addEventListener('click',async function(){
  _cerrandoPorExpiracion = true; // Evita que el listener de SIGNED_OUT muestre la alerta
  try{ if(SUPA_CLIENT) await SUPA_CLIENT.auth.signOut(); }catch(e){}
  try{ localStorage.removeItem('aseptiq_creds'); }catch(e){}
  try{
    Object.keys(localStorage).forEach(function(k){
      if(k.indexOf('sb-')===0 && k.indexOf('-auth-token')>=0) localStorage.removeItem(k);
    });
  }catch(e){}
  location.reload();
});

/* ============ ARRANQUE AUTOMÁTICO ============ */
/* ============ TEMPORIZADOR DE INACTIVIDAD ============ */
let _inactivityTimer = null;
let _inactivityTimeoutMs = 30 * 60 * 1000; // 30 minutos

function resetInactivityTimer() {
  if (_inactivityTimer) clearTimeout(_inactivityTimer);
  
  // Solo activar si hay una sesión iniciada
  if (!SUPA_SESSION) return;
  
  _inactivityTimer = setTimeout(() => {
    alert('Tu sesión se ha cerrado automáticamente por inactividad (30 minutos).');
    manejarSesionExpirada();
  }, _inactivityTimeoutMs);
}

function initInactivityTracker() {
  const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
  events.forEach(evt => {
    document.addEventListener(evt, resetInactivityTimer, { passive: true });
  });
  resetInactivityTimer();
}

(async function auto(){
  /* Prellenar URL y anon key */
  try{
    const s=JSON.parse(localStorage.getItem('inv_supa_creds'));
    if(s&&s.url&&s.key){
      document.getElementById('supaUrl').value=s.url;
      document.getElementById('supaKey').value=s.key;
      document.getElementById('rememberMe').checked=true;
    }
  }catch(e){}
  /* Prellenar email (la contraseña ya no se guarda por seguridad) */
  try{
    const c=JSON.parse(localStorage.getItem('aseptiq_creds'));
    if(c&&c.email){
      document.getElementById('supaEmail').value=c.email;
    }
  }catch(e){}

  /* Aplicar tema antes de cualquier render para evitar flash de color */
  try{ document.documentElement.setAttribute('data-theme',getTema()); }catch(e){}

  /* Intentar recuperar sesión existente. Si falla, mostrar login. */
  const ok = await intentarSesionExistente();
  if(!ok){
    const boot=document.getElementById('bootScreen');
    if(boot) boot.style.display='none';
    document.getElementById('connectScreen').style.display='flex';
    setTimeout(function(){
      const el=document.getElementById('supaPassword');
      if(el) el.focus();
    },80);
  } else {
    initInactivityTracker();
  }
})();

async function renderTab(tab){
  const main=document.getElementById('mainContent');
  const nombres={dashboard:'Cargando dashboard…',orden:'Cargando órdenes…',novedades:'Cargando novedades…',insumos:'Cargando insumos…',productos:'Cargando productos…',entradas:'Cargando entradas…',devoluciones:'Cargando devoluciones…',despachos:'Cargando despachos…',proveedores:'Cargando proveedores…',auditoria:'Cargando auditoría…',kardex:'Cargando kardex…',compras:'Cargando compras…',mermas:'Cargando mermas…',historico:'Cargando histórico…',costos:'Cargando análisis de costos…',rentabilidad:'Cargando rentabilidad…',trazabilidad:'Cargando trazabilidad…',consolidado:'Cargando consolidado…',programacion:'Cargando programación…',evaluacion_prov:'Cargando evaluación…',bodega:'Cargando bodega…',ordenes_compra:'Cargando órdenes…',backup:'Cargando backup…',usuarios:'Cargando usuarios…',config:'Cargando configuración…'};
  const r={dashboard:renderDashboard,orden:renderOrden,novedades:renderNovedades,insumos:renderInsumos,productos:renderProductos,entradas:renderEntradas,devoluciones:renderDevoluciones,despachos:renderDespachos,proveedores:renderProveedores,auditoria:renderAuditoria,kardex:renderKardex,compras:renderCompras,mermas:renderMermas,historico:renderHistorico,costos:renderCostosOP,rentabilidad:renderRentabilidad,trazabilidad:renderTrazabilidad,consolidado:renderConsolidado,programacion:renderProgramacion,evaluacion_prov:renderEvaluacionProv,bodega:renderBodega,ordenes_compra:renderOrdenesCompra,backup:renderBackup,usuarios:renderUsuarios,config:renderConfig};
  main.innerHTML='<div class="empty-state">Cargando…</div>';
  showLoader(nombres[tab]||'Cargando…');
  try{
    await (r[tab]||renderDashboard)();
  }catch(e){
    main.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
  }finally{
    hideLoader();
    aplicarPermisos();
    prepararPaneles();
    /* Refrescar los indicadores en segundo plano. No bloquea el render. */
    setTimeout(actualizarCampana, 200);
  }
}

/* ============ PRIORIDADES DE OP ============ */
const PRIORIDADES_OP={
  1:{label:'Muy alta',badge:'danger'},
  2:{label:'Alta',    badge:'warning'},
  3:{label:'Normal',  badge:'info'},
  4:{label:'Baja',    badge:'success'}
};
function prioridadLabel(v){
  if(v===null||v===undefined) return null;
  const p=PRIORIDADES_OP[Number(v)];
  return p?p.label:('#'+v);
}
function prioridadBadge(v){
  if(v===null||v===undefined) return '<span style="color:var(--text-muted);">—</span>';
  const p=PRIORIDADES_OP[Number(v)];
  if(!p) return '<span class="badge neutral">#'+v+'</span>';
  return '<span class="badge '+p.badge+'">'+p.label+'</span>';
}
function prioridadOptionsHTML(selected){
  return [1,2,3,4].map(function(n){
    const p=PRIORIDADES_OP[n];
    return '<option value="'+n+'" '+(Number(selected)===n?'selected':'')+'>'+p.label+'</option>';
  }).join('');
}

/* ============ BADGES ============ */

function badgeFor(e){const m={Cubierto:'success',Cubierta:'success',Reorden:'warning',Urgente:'danger'};return '<span class="badge '+(m[e]||'neutral')+'">'+e+'</span>';}
function badgeTipo(t){const m={Entrada:'success',Salida:'danger',Consumo:'warning'};return '<span class="badge '+(m[t]||'neutral')+'">'+t+'</span>';}
function badgeOP(e){const m={'Pendiente':'neutral','En proceso':'info','Terminada':'success','Cancelada':'danger'};return '<span class="badge '+(m[e]||'neutral')+'">'+(e||'Pendiente')+'</span>';}
function badgeTipoSub(t){const m={intermedio:'info',final:'warning',ambos:'neutral'};return '<span class="badge '+(m[t]||'neutral')+'">'+t+'</span>';}
function badgeTipoItem(t){return t==='insumo'?'<span class="badge info">Insumo</span>':'<span class="badge warning">Subprod</span>';}
/* v11: badge específico para subproductos (sin reorden) */
/* v12: badge de stock de PT */
function badgeStockPT(p){
  const n=Number(p.existencia_actual)||0;
  const pc=p.unidades_por_caja||1;
  if(n<=0) return '<span class="badge neutral">Sin stock</span>';
  const cajas=pc>1?' · ≈ '+Math.floor(n/pc)+' cajas':'';
  return '<span class="badge success">'+num(n)+' en stock'+cajas+'</span>';
}
function badgeStockSub(s){
  const n=Number(s.existencia_actual)||0;
  return n>0 ? '<span class="badge success">Disponible</span>' : '<span class="badge danger">Sin stock</span>';
}

/* ============ COBERTURA ============ */
/* Redondea al entero superior si la unidad es discreta (UND, CAJA, etc.) */
function redondearConsumo(cantidad, unidad) {
  if (!cantidad) return 0;
  const u = String(unidad).toLowerCase().trim();
  const discretas = ['u', 'und', 'unidad', 'unidades', 'caja', 'cajas', 'par', 'pares', 'rollo', 'rollos', 'bolsa', 'bolsas', 'etiqueta', 'etiquetas', 'paquete', 'paquetes', 'pieza', 'piezas', 'bulto', 'bultos'];
  
  if (discretas.includes(u)) {
    return Math.ceil(cantidad); // Redondea hacia arriba (ej: 49.8 -> 50)
  }
  // Si es continua (metros, kg, litros), dejamos hasta 4 decimales
  return Number(Number(cantidad).toFixed(4));
}

async function calcularCobertura(codigo_pt,cantidad){
  const insConsumo={};
  const subConsumo={};

  const [bomDir,compSub]=await Promise.all([
    api('bom_recetas?codigo_pt=eq.'+encodeURIComponent(codigo_pt)+'&select=cantidad_por_unidad,insumos(id,codigo,nombre,unidad_medida,unidad_consumo,conversiones,existencia_actual,punto_reorden)'),
    api('paquete_subproductos?codigo_pt=eq.'+encodeURIComponent(codigo_pt)+'&select=cantidad,subproducto_id,subproductos!paquete_subproductos_subproducto_id_fkey(id,codigo,nombre,tipo,existencia_actual)')
  ]);

  log('[cobertura MRP] PT',codigo_pt,'→ insumos directos:',bomDir.length,'subproductos:',compSub.length);

  bomDir.forEach(function(r){
    const id=r.insumos.id;
    if(!insConsumo[id])insConsumo[id]={insumo:r.insumos,total:0};
    insConsumo[id].total+=r.cantidad_por_unidad*cantidad;
  });

  compSub.forEach(function(r){
    const s=r.subproductos;
    if(!s)return;
    const id=s.id;
    if(!subConsumo[id])subConsumo[id]={sub:s,total:0};
    subConsumo[id].total+=r.cantidad*cantidad;
  });

  const detalle=Object.values(insConsumo).map(function(it){
    const ins=it.insumo;
    const u = unidadConsumo(ins);
    
    // Aplicamos el redondeo a la cantidad requerida
    const total = redondearConsumo(it.total, u); 
    
    const disp=ins.existencia_actual-total;
    let est='Cubierto';
    if(disp<0)est='Urgente';else if(disp<=ins.punto_reorden)est='Reorden';
    return {insumo_id:ins.id,nombre:ins.nombre,unidad:u,existencia_consumo:ins.existencia_actual,consumo_total:total,faltante:disp<0?Math.abs(disp):0,estado:est};
  });

  const detalleSub=Object.values(subConsumo).map(function(it){
    const s=it.sub;
    // Los subproductos se miden en unidades, aplicamos redondeo
    const req = redondearConsumo(it.total, 'u');
    const stock=Number(s.existencia_actual)||0;
    const delStock=Math.min(stock,req);
    const faltante=req-delStock;
    let est='Cubierto';
    if(faltante>0)est='Urgente';else if(stock<=req)est='Reorden';
    return {subproducto_id:s.id,nombre:s.nombre,codigo:s.codigo,tipo:s.tipo||'ambos',requerido:req,stock_actual:stock,a_consumir_del_stock:delStock,faltante:faltante,estado:est};
  });

  log('[cobertura MRP] insumos:',detalle.length,'· subproductos:',detalleSub.length);
  const estados=detalle.map(function(d){return d.estado;}).concat(detalleSub.map(function(d){return d.estado;}));
  const eg=estados.length?peorEstado(estados):'Cubierto';
  return {detalle:detalle,detalleSub:detalleSub,estado_general:eg};
}

/* ============ DATA LOADER ============ */
async function loadAllProductosData(){
  const [insumos,subproductos,productos,recetas,hijos,bom,paqueteSubs]=await Promise.all([
    api('insumos?select=id,codigo,nombre,unidad_medida,unidad_consumo,conversiones,existencia_actual,punto_reorden,costo_unitario&order=nombre'),
    api('subproductos?select=*&order=nombre'),
    api('productos_terminados?select=*&order=nombre'),
    api('subproducto_recetas?select=subproducto_id,insumo_id,cantidad_por_unidad,unidad_receta,factor_receta'),
    api('subproducto_subproductos?select=subproducto_padre_id,subproducto_hijo_id,cantidad_por_unidad'),
    api('bom_recetas?select=codigo_pt,insumo_id,cantidad_por_unidad'),
    api('paquete_subproductos?select=codigo_pt,subproducto_id,cantidad')
  ]);
  const costosRaw=await rpc('costos_todos',{});
const costos={
  subCosto:costosRaw.subproducto_costo||{},
  paqCosto:costosRaw.paquete_costo||{}
};
  return {insumos:insumos,subproductos:subproductos,productos:productos,recetas:recetas,hijos:hijos,bom:bom,paqueteSubs:paqueteSubs,costos:costos};
}

/* ============ CONFIGURACIÓN ============ */
async function renderConfig(){
  const main=document.getElementById('mainContent');
  await cargarConfig();
  const cfg=getConfig();
  const umbralU=cfg.umbralUrgente||30;
  const umbralR=cfg.umbralReorden||60;
  main.innerHTML=`
    <h2 class="page-title">Configuración</h2>
    <p class="page-sub">Parámetros globales del sistema. Los cambios se guardan en este navegador.</p>

    <div class="panel force-expanded no-scroll">
      <div class="panel-header"><h3>Apariencia</h3></div>
      
      <div style="padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--border);">
        <div style="min-width:0;">
          <div style="font-size:13px;color:var(--text-primary);font-weight:500;">Tema de la aplicación</div>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">Oscuro o claro. Se guarda en este navegador.</div>
        </div>
        <div class="theme-toggle" id="cfgThemeSlider" role="button" tabindex="0" aria-label="Cambiar tema">
          <div class="theme-toggle-thumb">
            <svg id="cfgThemeThumbIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"></svg>
          </div>
        </div>
      </div>

      <div style="padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="min-width:0;">
          <div style="font-size:13px;color:var(--text-primary);font-weight:500;">Comportamiento del menú</div>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">Elegí si el menú lateral se abre con botón o al pasar el mouse.</div>
        </div>
        <select id="cfg_sidebar_mode" style="width:auto; min-width:180px; margin:0;">
          <option value="click" ${cfg.sidebar_behavior === 'hover' ? '' : 'selected'}>Botón (Manual)</option>
          <option value="hover" ${cfg.sidebar_behavior === 'hover' ? 'selected' : ''}>Hover (Automático)</option>
        </select>
      </div>
    </div>

    <div class="panel force-collapsed">
      <div class="panel-header"><h3>Prefijos de códigos</h3></div>
      <div class="form-grid">
        <div><label>Insumos</label><input id="cfg_pi" value="${cfg.prefijoInsumo}"></div>
        <div><label>Subproductos</label><input id="cfg_ps" value="${cfg.prefijoSubproducto}"></div>
        <div><label>Paquetes (PT)</label><input id="cfg_pp" value="${cfg.prefijoProducto}"></div>
        <div><label>Órdenes de producción (OP)</label><input id="cfg_po" value="${cfg.prefijoOP}"></div>
      </div>
      <div class="form-actions"><button id="btnGuardarPrefijos" title="Guardar todos los prefijos">Guardar prefijos</button></div>
    </div>

    <div class="panel force-collapsed">
      <div class="panel-header"><h3>Unidades de medida</h3><button class="btn-add" id="btnGestionarUnidades" title="Gestionar unidades">+</button></div>
      <div style="padding:14px 18px;font-size:12.5px;color:var(--text-secondary);line-height:1.5;">
        Haz click en <b>+</b> para agregar, editar o eliminar unidades del catálogo.
      </div>
    </div>

    <div class="panel force-collapsed">
      <div class="panel-header"><h3>Umbrales de stock</h3><button class="btn-add" id="btnEditarUmbrales" title="Editar umbrales">+</button></div>
      <div style="padding:14px 18px;font-size:12.5px;color:var(--text-secondary);line-height:1.5;">
        Urgente: <b style="color:var(--danger);font-family:'IBM Plex Mono',monospace;">${umbralU}%</b> del stock objetivo ·
        Reorden: <b style="color:var(--warning);font-family:'IBM Plex Mono',monospace;">${umbralR}%</b> del stock objetivo.
        <br>Haz click en <b>+</b> para editarlos.
      </div>
    </div>

    <div class="panel force-collapsed">
      <div class="panel-header"><h3>Datos de etiquetas</h3><button class="btn-add" id="btnEditarEtiquetas" title="Editar datos de etiquetas">+</button></div>
      <div style="padding:14px 18px;font-size:12.5px;color:var(--text-secondary);line-height:1.5;">
        Empresas (Proclides, Allers), registros INVIMA, tamaños de etiqueta y logos.
        <br>Haz click en <b>+</b> para editarlos.
      </div>
    </div>
  `;

  /* Cambiar comportamiento del sidebar */
  document.getElementById('cfg_sidebar_mode').addEventListener('change', async function(e) {
    const c = getConfig();
    c.sidebar_behavior = e.target.value;
    await saveConfig(c);
    aplicarSidebarColapsado();
    toast('Comportamiento del menú actualizado.', 'success');
  });

  /* Slider de tema */
  const slider=document.getElementById('cfgThemeSlider');
  function toggleTema(){
    const t=getTema()==='dark'?'light':'dark';
    setTema(t);
    aplicarTema(t);
    toast('Tema '+t+' aplicado.','success');
  }
  if(slider){
    slider.addEventListener('click',toggleTema);
    slider.addEventListener('keydown',function(ev){
      if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();toggleTema();}
    });
    actualizarIconoTema();
  }

  /* Prefijos */
  document.getElementById('btnGuardarPrefijos').addEventListener('click',async function(ev){
    await withLoading(ev.currentTarget,async function(){
      const c=getConfig();
      c.prefijoInsumo=document.getElementById('cfg_pi').value.trim()||'INS-';
      c.prefijoSubproducto=document.getElementById('cfg_ps').value.trim()||'SUB-';
      c.prefijoProducto=document.getElementById('cfg_pp').value.trim()||'PT-';
      c.prefijoOP=document.getElementById('cfg_po').value.trim()||'OP-';
      await saveConfig(c);
    });
    toast('Prefijos guardados.','success');
  });

  /* Botones "+" que abren modales */
  document.getElementById('btnGestionarUnidades').addEventListener('click',abrirModalUnidades);
  document.getElementById('btnEditarUmbrales').addEventListener('click',abrirModalUmbrales);
  document.getElementById('btnEditarEtiquetas').addEventListener('click',abrirModalDatosEtiquetas);
}

function actualizarIconoTema(){
  const icono=document.getElementById('cfgThemeThumbIcon');
  if(!icono) return;
  if(getTema()==='light'){
    icono.innerHTML='<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>';
  } else {
    icono.innerHTML='<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
}

function abrirModalUnidades(){
  abrirModalGenerico({
    title:'Unidades de medida',
    subtitle:'Agrega, edita o elimina unidades del catálogo.',
    icon:icono('ruler','lg'),
    variant:'info',
    size:'md',
    body:`
      <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:20px;">
        <div style="flex:1;min-width:0;">
          <label>Nueva unidad</label>
          <input id="uni_nueva" placeholder="ej: caja, rollo, galón" style="margin-bottom:0;">
        </div>
        <button class="secondary" id="uni_agregar" style="flex-shrink:0;">+ Agregar</button>
      </div>
      <div class="divider-label" style="padding-left:0;padding-top:8px;">Unidades actuales</div>
      <div id="uni_lista"></div>`,
    footer:'<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button id="uni_cerrar">Cerrar</button></div>',
    onOpen:function(){
      function renderLista(){
        const cfg=getConfig();
        const cont=document.getElementById('uni_lista');
        if(!cfg.unidades.length){
          cont.innerHTML='<div class="empty-state" style="padding:16px 0;">No hay unidades.</div>';
          return;
        }
        cont.innerHTML='<div style="display:flex;flex-direction:column;gap:6px;">'+cfg.unidades.map(function(u,idx){
          return '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border);">'
            +'<span style="flex:1;font-size:13px;">'+u+'</span>'
            +'<button class="ghost small" data-edit-u="'+idx+'" title="Renombrar">Editar</button>'
            +'<button class="danger-btn small" data-del-u="'+idx+'" title="Eliminar">Eliminar</button>'
            +'</div>';
        }).join('')+'</div>';
        cont.querySelectorAll('[data-edit-u]').forEach(function(btn){
          btn.addEventListener('click',async function(){
            const idx=+btn.dataset.editU;
            const cfg2=getConfig();
            const nuevo=await promptear({title:'Renombrar unidad',message:'Nombre actual: '+cfg2.unidades[idx],icon:'✎',variant:'info',value:cfg2.unidades[idx],okText:'Guardar'});
            if(!nuevo||!nuevo.trim())return;
            cfg2.unidades[idx]=nuevo.trim();
            try{await saveConfig(cfg2);toast('Unidad actualizada.','success');renderLista();}
            catch(e){toast('No se pudo guardar: '+e.message,'error');}
          });
        });
        cont.querySelectorAll('[data-del-u]').forEach(function(btn){
          btn.addEventListener('click',async function(){
            const idx=+btn.dataset.delU;
            if(!await confirmar({title:'Eliminar unidad',message:'Esta acción la quita del catálogo global. Los insumos ya creados con ella no cambian.',icon:'✕',variant:'danger',okText:'Eliminar',danger:true}))return;
            const cfg2=getConfig();
            cfg2.unidades.splice(idx,1);
            try{await saveConfig(cfg2);toast('Unidad eliminada.','success');renderLista();}
            catch(e){toast('No se pudo guardar: '+e.message,'error');}
          });
        });
      }
      renderLista();
      document.getElementById('uni_agregar').addEventListener('click',async function(){
        const inp=document.getElementById('uni_nueva');
        const n=inp.value.trim();
        if(!n){toast('Escribe una unidad primero.','error');return;}
        const cfg=getConfig();
        if(cfg.unidades.includes(n)){toast('Esa unidad ya existe.','error');return;}
        cfg.unidades.push(n);
        try{
          await saveConfig(cfg);
          inp.value='';
          toast('Unidad agregada.','success');
          renderLista();
        }catch(e){toast('No se pudo guardar: '+e.message,'error');}
      });
      document.getElementById('uni_cerrar').addEventListener('click',function(){
        cerrarModalGenerico();
        renderConfig();
      });
    }
  });
}

function abrirModalDatosEtiquetas(){
  const etq = getEtiquetasConfig();
  const empresas = etq.empresas;
  const invimas = etq.invimas;
  const medidas = etq.medidas;
  const logos = etq.logos;

  function _empresaHTML(id, emp){
    return '<div class="etq-empresa-block">'
      +'<div class="etq-empresa-title">'+(id==='proclides'?'Proclides':'Allers / Allmed')+'</div>'
      +'<div class="form-grid" style="padding:0;">'
        +'<div><label>Razón social</label><input id="etq_'+id+'_razon" value="'+(emp.razonSocial||'').replace(/"/g,'&quot;')+'"></div>'
        +'<div><label>NIT</label><input id="etq_'+id+'_nit" value="'+(emp.nit||'').replace(/"/g,'&quot;')+'"></div>'
        +'<div class="full-span"><label>Dirección</label><input id="etq_'+id+'_dir" value="'+(emp.direccion||'').replace(/"/g,'&quot;')+'"></div>'
        +'<div><label>Teléfono</label><input id="etq_'+id+'_tel" value="'+(emp.telefono||'').replace(/"/g,'&quot;')+'"></div>'
        +'<div><label>Web</label><input id="etq_'+id+'_web" value="'+(emp.web||'').replace(/"/g,'&quot;')+'"></div>'
        +'<div class="full-span"><label>Correos (uno por línea)</label><textarea id="etq_'+id+'_correos" rows="2" style="font-family:inherit;">'+((emp.correos||[]).join('\n'))+'</textarea></div>'
      +'</div>'
    +'</div>';
  }

  function _logoUploadHTML(id, label, dataUrl){
    const preview = dataUrl ? '<img src="'+dataUrl+'" alt="'+label+'" class="etq-logo-preview">' : '<span class="etq-logo-empty">Sin imagen</span>';
    return '<div class="etq-logo-row">'
      +'<div class="etq-logo-info">'
        +'<div class="det-lbl">'+label+'</div>'
        +'<div class="etq-logo-box">'+preview+'</div>'
      +'</div>'
      +'<div class="etq-logo-actions">'
        +'<input type="file" id="etq_logo_'+id+'" accept="image/png,image/jpeg,image/svg+xml" style="display:none;">'
        +'<button type="button" class="secondary small" data-etq-pick-logo="'+id+'">Elegir archivo</button>'
        +'<button type="button" class="ghost small" data-etq-clear-logo="'+id+'" '+(dataUrl?'':'style="display:none;"')+'>Quitar</button>'
      +'</div>'
    +'</div>';
  }

  const bodyHTML =
    '<div class="det-section-title" style="margin-top:0;padding-top:0;border-top:none;">Empresas</div>'
    + _empresaHTML('proclides', empresas.proclides)
    + _empresaHTML('allers', empresas.allers)

    + '<div class="det-section-title">Registros INVIMA</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;line-height:1.5;">'
      +'Cada PT elige su registro INVIMA desde Productos &amp; BOM. Si un producto no requiere registro, dejalo sin asignar.'
    +'</div>'
    + '<div id="etq_invima_list"></div>'
    + '<div style="margin-top:10px;"><button type="button" class="secondary small" id="etq_add_invima">+ Agregar registro INVIMA</button></div>'

    + '<div class="det-section-title">Medidas de etiquetas</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;line-height:1.5;">'
      +'Ancho × alto en milímetros. Ajustar según la impresora Zebra.'
    +'</div>'
    + '<div class="form-grid" style="padding:0;">'
      +'<div><label>Pequeña — ancho (mm)</label><input id="etq_med_peq_w" type="number" min="20" max="200" value="'+(medidas.pequena.w||50)+'"></div>'
      +'<div><label>Pequeña — alto (mm)</label><input id="etq_med_peq_h" type="number" min="15" max="200" value="'+(medidas.pequena.h||25)+'"></div>'
      +'<div><label>Mediana — ancho (mm)</label><input id="etq_med_med_w" type="number" min="30" max="250" value="'+(medidas.mediana.w||80)+'"></div>'
      +'<div><label>Mediana — alto (mm)</label><input id="etq_med_med_h" type="number" min="20" max="250" value="'+(medidas.mediana.h||44)+'"></div>'
      +'<div><label>Grande — ancho (mm)</label><input id="etq_med_gra_w" type="number" min="50" max="300" value="'+(medidas.grande.w||150)+'"></div>'
      +'<div><label>Grande — alto (mm)</label><input id="etq_med_gra_h" type="number" min="50" max="300" value="'+(medidas.grande.h||100)+'"></div>'
    +'</div>'

    + '<div class="det-section-title">Logos</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;line-height:1.5;">'
      +'PNG, JPG o SVG. Peso máximo recomendado: 200 KB por archivo. Se guardan en el backend y aplican a todos los dispositivos.'
    +'</div>'
    + _logoUploadHTML('proclides', 'Logo Proclides', logos.proclides)
    + _logoUploadHTML('allmed', 'Logo Allmed', logos.allmed)
    + _logoUploadHTML('allers', 'Logo Allers Group', logos.allers);

  abrirModalGenerico({
    title:'Datos de etiquetas',
    subtitle:'Empresas, INVIMA, medidas y logos usados en la impresión.',
    icon: icono('tag','lg'),
    variant:'info',
    size:'wide',
    body: bodyHTML,
    footer:'<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button class="ghost" id="etq_cancelar">Cancelar</button><button id="etq_guardar">Guardar datos</button></div>',
    onOpen: function(body){
      /* Estado local de logos (para no perder cambios si el usuario navega) */
      const logosLocal = {
        proclides: logos.proclides||'',
        allmed: logos.allmed||'',
        allers: logos.allers||''
      };
      /* Estado local de INVIMAs */
      let invimasLocal = invimas.slice();

      /* Render de INVIMAs */
      function renderInvimas(){
        const cont = body.querySelector('#etq_invima_list');
        if(!invimasLocal.length){
          cont.innerHTML = '<div class="empty-state" style="padding:12px 0;">Sin registros INVIMA.</div>';
          return;
        }
        cont.innerHTML = invimasLocal.map(function(inv, idx){
          return '<div class="dyn-row conv-recipe" style="padding:6px 0;">'
            +'<input id="etq_inv_nom_'+idx+'" placeholder="Nombre (ej: Paquetes)" value="'+(inv.nombre||'').replace(/"/g,'&quot;')+'">'
            +'<input id="etq_inv_num_'+idx+'" placeholder="Número (ej: 2026DM-0032255)" value="'+(inv.numero||'').replace(/"/g,'&quot;')+'" style="font-family:\'IBM Plex Mono\',monospace;">'
            +'<span></span>'
            +'<button type="button" class="danger-btn small" data-etq-del-invima="'+idx+'">×</button>'
            +'</div>';
        }).join('');
        cont.querySelectorAll('[data-etq-del-invima]').forEach(function(btn){
          btn.addEventListener('click',function(){
            syncInvimas();
            invimasLocal.splice(parseInt(btn.dataset.etqDelInvima,10),1);
            renderInvimas();
          });
        });
      }
      function syncInvimas(){
        invimasLocal = invimasLocal.map(function(_,idx){
          return {
            id: invimasLocal[idx].id || ('inv-'+idx+'-'+Date.now()),
            nombre: (body.querySelector('#etq_inv_nom_'+idx)||{}).value||'',
            numero: (body.querySelector('#etq_inv_num_'+idx)||{}).value||''
          };
        });
      }
      renderInvimas();
      body.querySelector('#etq_add_invima').addEventListener('click',function(){
        syncInvimas();
        invimasLocal.push({ id: 'inv-'+Date.now(), nombre:'', numero:'' });
        renderInvimas();
      });

      /* Logos: file input → data URL */
      ['proclides','allmed','allers'].forEach(function(id){
        const input = body.querySelector('#etq_logo_'+id);
        const pickBtn = body.querySelector('[data-etq-pick-logo="'+id+'"]');
        if(pickBtn && input){
          pickBtn.addEventListener('click', function(){ input.click(); });
        }
        if(!input) return;
        input.addEventListener('change', function(){
          const file = input.files && input.files[0];
          if(!file) return;
          if(file.size > 100*1024){
            toast('El archivo supera 100 KB. Reducilo antes de subirlo.','error');
            input.value='';
            return;
          }
          const reader = new FileReader();
          reader.onload = function(ev){
            logosLocal[id] = ev.target.result;
            /* Actualizar preview */
            const row = input.closest('.etq-logo-row');
            if(row){
              const box = row.querySelector('.etq-logo-box');
              if(box) box.innerHTML = '<img src="'+logosLocal[id]+'" alt="logo" class="etq-logo-preview">';
              const clearBtn = row.querySelector('[data-etq-clear-logo]');
              if(clearBtn) clearBtn.style.display='';
            }
          };
          reader.readAsDataURL(file);
        });
      });

      /* Quitar logo */
      body.querySelectorAll('[data-etq-clear-logo]').forEach(function(btn){
        btn.addEventListener('click',function(){
          const id = btn.dataset.etqClearLogo;
          logosLocal[id] = '';
          const row = btn.closest('.etq-logo-row');
          if(row){
            const box = row.querySelector('.etq-logo-box');
            if(box) box.innerHTML = '<span class="etq-logo-empty">Sin imagen</span>';
            btn.style.display='none';
          }
        });
      });

      /* Cancelar */
      document.getElementById('etq_cancelar').addEventListener('click',cerrarModalGenerico);

      /* Guardar */
      document.getElementById('etq_guardar').addEventListener('click',async function(ev){
        syncInvimas();
        const getVal=function(id){const el=body.querySelector('#'+id);return el?el.value:'';};
        const parseCorreos=function(str){return String(str||'').split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean);};

        const nuevas = {
          empresas: {
            proclides: {
              razonSocial: getVal('etq_proclides_razon').trim(),
              nit: getVal('etq_proclides_nit').trim(),
              direccion: getVal('etq_proclides_dir').trim(),
              telefono: getVal('etq_proclides_tel').trim(),
              correos: parseCorreos(getVal('etq_proclides_correos')),
              web: getVal('etq_proclides_web').trim()
            },
            allers: {
              razonSocial: getVal('etq_allers_razon').trim(),
              nit: getVal('etq_allers_nit').trim(),
              direccion: getVal('etq_allers_dir').trim(),
              telefono: getVal('etq_allers_tel').trim(),
              correos: parseCorreos(getVal('etq_allers_correos')),
              web: getVal('etq_allers_web').trim()
            }
          },
          invimas: invimasLocal.filter(function(i){return i.nombre||i.numero;}),
          medidas: {
            pequena: {
              w: parseInt(body.querySelector('#etq_med_peq_w').value,10)||50,
              h: parseInt(body.querySelector('#etq_med_peq_h').value,10)||25
            },
            mediana: {
              w: parseInt(body.querySelector('#etq_med_med_w').value,10)||80,
              h: parseInt(body.querySelector('#etq_med_med_h').value,10)||44
            },
            grande: {
              w: parseInt(body.querySelector('#etq_med_gra_w').value,10)||150,
              h: parseInt(body.querySelector('#etq_med_gra_h').value,10)||100
            }
          },
          logos: logosLocal
        };

        try{
          await withLoading(ev.currentTarget, async function(){
            const cfg = getConfig();
            cfg.etiquetas = nuevas;
            await saveConfig(cfg);
          });
          toast('Datos de etiquetas guardados.','success');
          cerrarModalGenerico();
          renderConfig();
        }catch(e){toast('Error al guardar: '+e.message,'error');}
      });
    }
  });
}

function abrirModalUmbrales(){
  const cfg=getConfig();
  const uU=cfg.umbralUrgente||30;
  const uR=cfg.umbralReorden||60;
  abrirModalGenerico({
    title:'Umbrales de stock',
    subtitle:'Porcentaje del stock objetivo para clasificar el estado.',
    icon:icono('scale','lg'),
    variant:'info',
    size:'md',
    body:`
      <div class="form-grid" style="padding:0;">
        <div><label>Urgente (% del stock objetivo)</label><input id="umb_urgente" type="number" min="1" max="99" value="${uU}"></div>
        <div><label>Reorden (% del stock objetivo)</label><input id="umb_reorden" type="number" min="1" max="99" value="${uR}"></div>
        <div class="full-span" style="font-size:11.5px;color:var(--text-muted);line-height:1.5;padding-top:6px;">
          El sistema marca <b>Urgente</b> si la existencia ≤ urgente% del objetivo; <b>Reorden</b> si ≤ reorden%; <b>Cubierto</b> en otro caso. Urgente debe ser menor que Reorden.
        </div>
      </div>`,
    footer:'<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button class="ghost" id="umb_cancelar">Cancelar</button><button id="umb_guardar">Guardar</button></div>',
    onOpen:function(){
      document.getElementById('umb_cancelar').addEventListener('click',cerrarModalGenerico);
      document.getElementById('umb_guardar').addEventListener('click',async function(ev){
        const uU2=parseInt(document.getElementById('umb_urgente').value,10);
        const uR2=parseInt(document.getElementById('umb_reorden').value,10);
        if(!uU2||uU2<1||uU2>99){toast('Urgente debe estar entre 1 y 99.','error');return;}
        if(!uR2||uR2<1||uR2>99){toast('Reorden debe estar entre 1 y 99.','error');return;}
        if(uU2>=uR2){toast('El umbral de urgente debe ser menor que el de reorden.','error');return;}
        try{
          await withLoading(ev.currentTarget,async function(){
            const c=getConfig();
            c.umbralUrgente=uU2;
            c.umbralReorden=uR2;
            await saveConfig(c);
          });
          toast('Umbrales guardados.','success');
          cerrarModalGenerico();
          renderConfig();
        }catch(e){toast('No se pudo guardar: '+e.message,'error');}
      });
    }
  });
}


/* =========================================================
   DASHBOARD v11 — Valor real de existencias (sin PT como stock)
   ========================================================= */
async function renderDashboard(){
  const main=document.getElementById('mainContent');
  try{
    const data=await loadAllProductosData();
    let cIns=0,rIns=0,uIns=0;
    data.insumos.forEach(function(i){const e=estadoInsumo(i);if(e==='Cubierto')cIns++;else if(e==='Reorden')rIns++;else uIns++;});
    let conStock=0,sinStock=0;
    data.subproductos.forEach(function(s){((s.existencia_actual||0)>0)?conStock++:sinStock++;});
    let ptConStock=0,ptSinStock=0;
    data.productos.forEach(function(p){((p.existencia_actual||0)>0)?ptConStock++:ptSinStock++;});

    /* v12: Valorización real (insumos + subproductos + PT en stock) */
    let valorIns=0,valorSub=0,valorPT=0;
    data.insumos.forEach(function(i){valorIns+=(i.existencia_actual||0)*(i.costo_unitario||0);});
    data.subproductos.forEach(function(s){valorSub+=(s.existencia_actual||0)*(data.costos.subCosto[s.id]||0);});
    data.productos.forEach(function(p){valorPT+=(p.existencia_actual||0)*(data.costos.paqCosto[p.codigo_pt]||0);});
    const valorTotal=valorIns+valorSub+valorPT;

    const insView=applySort(data.insumos,'dash_ins',{nombre:function(i){return i.nombre;},existencia:function(i){return i.existencia_actual;},costo:function(i){return i.costo_unitario||0;},valor:function(i){return(i.existencia_actual||0)*(i.costo_unitario||0);}});
    const subView=applySort(data.subproductos,'dash_sub',{nombre:function(s){return s.nombre;},tipo:function(s){return s.tipo||'';},existencia:function(s){return s.existencia_actual;},costo:function(s){return data.costos.subCosto[s.id]||0;},valor:function(s){return(s.existencia_actual||0)*(data.costos.subCosto[s.id]||0);}});
    const paqView=applySort(data.productos,'dash_paq',{nombre:function(p){return p.nombre;},caja:function(p){return p.unidades_por_caja||1;},existencia:function(p){return p.existencia_actual;},costo:function(p){return data.costos.paqCosto[p.codigo_pt]||0;},valor:function(p){return(p.existencia_actual||0)*(data.costos.paqCosto[p.codigo_pt]||0);}});

    main.innerHTML=`
      <div class="page-header-flex">
        <div>
          <h2 class="page-title">Dashboard</h2>
          <p class="page-sub">Estado de existencias y valorización del inventario.</p>
        </div>
        ${botonRefreshHTML('dashboard')}
      </div>

      ${(uIns+rIns)>0?(()=>{const total=uIns+rIns;const esUrgente=uIns>0;return `<div class="alert-banner ${esUrgente?'danger':'warning'}" id="alertStockBanner" data-total="${total}"><div class="alert-icon">${esUrgente?'⚠':'!'}</div><div class="alert-body"><strong>${total} insumo${total===1?'':'s'} ${esUrgente?'en estado urgente':'en reorden'}.</strong><span>Revisa existencias y programa reposición.</span></div><button class="alert-action" data-goto-tab="insumos">Ver insumos</button><button class="alert-close" data-dismiss-alert title="Ocultar por esta sesión">×</button></div>`;})():''}

      ${(()=>{
        const criticos=data.insumos.filter(function(i){const e=estadoInsumo(i);return e==='Urgente'||e==='Reorden';})
          .sort(function(a,b){const ea=estadoInsumo(a)==='Urgente'?0:1;const eb=estadoInsumo(b)==='Urgente'?0:1;if(ea!==eb)return ea-eb;return (a.existencia_actual/(a.punto_reorden||1))-(b.existencia_actual/(b.punto_reorden||1));})
          .slice(0,5);
        if(!criticos.length) return '';
        return `<div class="panel force-expanded no-scroll" style="border-left:3px solid ${uIns>0?'var(--danger)':'var(--warning)'};">
          <div class="panel-header"><h3 style="display:flex;align-items:center;gap:6px;">${icono('alert-circle','sm')} Stock crítico del día</h3><button class="secondary small" data-goto-tab="insumos">Ver todos</button></div>
          <table>
            <thead><tr><th>Insumo</th><th class="num">Existencia</th><th class="num">Mínimo</th><th>Cobertura</th><th>Estado</th></tr></thead>
            <tbody>
            ${criticos.map(function(i){
              const ex=Number(i.existencia_actual)||0;
              const pr=Number(i.punto_reorden)||0;
              const pct=pr>0?Math.min(100,Math.round(ex/pr*100)):0;
              const color=estadoInsumo(i)==='Urgente'?'var(--danger)':'var(--warning)';
              return '<tr><td>'+i.nombre+' <span class="mono" style="color:var(--text-muted);font-size:11px;">'+i.codigo+'</span></td>'
                +'<td class="num" style="color:'+color+';font-weight:600;">'+num(ex)+' '+unidadConsumo(i)+'</td>'
                +'<td class="num">'+num(pr)+' '+unidadConsumo(i)+'</td>'
                +'<td style="min-width:120px;"><div style="background:var(--surface-3);border-radius:6px;height:6px;overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:'+color+';"></div></div><span style="font-size:10.5px;color:var(--text-muted);">'+pct+'%</span></td>'
                +'<td>'+badgeFor(estadoInsumo(i))+'</td></tr>';
            }).join('')}
            </tbody>
          </table>
        </div>`;
      })()}

      <h3 class="section-title">Insumos</h3>
      <div class="grid-cards">
        <div class="stat-card neutral"><p class="stat-label">Insumos activos</p><p class="stat-value">${data.insumos.length}</p></div>
        <div class="stat-card success"><p class="stat-label">Cubiertos</p><p class="stat-value">${cIns}</p></div>
        <div class="stat-card warning"><p class="stat-label">En reorden</p><p class="stat-value">${rIns}</p></div>
        <div class="stat-card danger"><p class="stat-label">Urgentes</p><p class="stat-value">${uIns}</p></div>
      </div>

      <h3 class="section-title">Subproductos <span style="text-transform:none;font-weight:400;color:var(--text-muted);">· se producen por OP, sin reorden</span></h3>
      <div class="grid-cards g2">
        <div class="stat-card neutral"><p class="stat-label">Subproductos activos</p><p class="stat-value">${data.subproductos.length}</p></div>
        <div class="stat-card success"><p class="stat-label">Con existencia / sin existencia</p><p class="stat-value"><span style="color:var(--success);">${conStock}</span> / <span style="color:var(--danger);">${sinStock}</span></p></div>
      </div>

      <h3 class="section-title">Paquetes (PT) <span style="text-transform:none;font-weight:400;color:var(--text-muted);">· ingresan al inventario al terminar una OP</span></h3>
      <div class="grid-cards g2">
        <div class="stat-card neutral"><p class="stat-label">Paquetes en catálogo</p><p class="stat-value">${data.productos.length}</p></div>
        <div class="stat-card success"><p class="stat-label">Con stock / sin stock</p><p class="stat-value"><span style="color:var(--success);">${ptConStock}</span> / <span style="color:var(--danger);">${ptSinStock}</span></p></div>
      </div>

      <h3 class="section-title">Valorización de existencias</h3>
      <div class="grid-cards">
        <div class="stat-card info"><p class="stat-label">Valor insumos</p><p class="stat-value" style="font-size:18px;">${money(valorIns)}</p></div>
        <div class="stat-card info"><p class="stat-label">Valor subproductos</p><p class="stat-value" style="font-size:18px;">${money(valorSub)}</p></div>
        <div class="stat-card info"><p class="stat-label">Valor PT (stock)</p><p class="stat-value" style="font-size:18px;">${money(valorPT)}</p></div>
        <div class="stat-card neutral" style="background:var(--surface-1);border:1px solid var(--accent);"><p class="stat-label" style="color:var(--accent);">Valor total del inventario</p><p class="stat-value" style="font-size:20px;color:var(--accent);">${money(valorTotal)}</p></div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Insumos</h3></div>
        <div class="search-box"><input id="buscar_dash_ins" placeholder="Buscar insumo…"></div>
        ${data.insumos.length===0?'<div class="empty-state">Aún no hay insumos.</div>':`
        <table id="tabla_dash_ins"><tr>
          ${thSort('Insumo','nombre','dash_ins')}
          <th>Cadena</th>
          ${thSort('Existencia','existencia','dash_ins',true)}
          <th class="num">Reorden</th>
          ${thSort('Costo','costo','dash_ins',true)}
          ${thSort('Valor','valor','dash_ins',true)}
          <th>Estado</th>
        </tr>
          ${insView.map(function(i){return '<tr><td>'+i.nombre+' <span class="mono" style="color:var(--text-muted);font-size:11.5px;">'+i.codigo+'</span></td><td style="font-size:11.5px;">'+cadenaTexto(i)+'</td><td class="num">'+formatearExistencia(i)+'</td><td class="num">'+num(i.punto_reorden)+' '+unidadConsumo(i)+'</td><td class="num">'+money(i.costo_unitario)+'</td><td class="num">'+money((i.existencia_actual||0)*(i.costo_unitario||0))+'</td><td>'+badgeFor(estadoInsumo(i))+'</td></tr>';}).join('')}
        </table>`}
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Subproductos</h3></div>
        <div class="search-box"><input id="buscar_dash_sub" placeholder="Buscar subproducto…"></div>
        ${data.subproductos.length===0?'<div class="empty-state">Aún no hay subproductos.</div>':`
        <table id="tabla_dash_sub"><tr>
          ${thSort('Subproducto','nombre','dash_sub')}
          ${thSort('Tipo','tipo','dash_sub')}
          ${thSort('Existencia','existencia','dash_sub',true)}
          ${thSort('Costo u.','costo','dash_sub',true)}
          ${thSort('Valor','valor','dash_sub',true)}
          <th>Estado</th>
        </tr>
          ${subView.map(function(s){return '<tr><td>'+s.nombre+' <span class="mono" style="color:var(--text-muted);font-size:11.5px;">'+s.codigo+'</span></td><td>'+badgeTipoSub(s.tipo||'ambos')+'</td><td class="num">'+num(s.existencia_actual)+'</td><td class="num">'+money(data.costos.subCosto[s.id]||0)+'</td><td class="num">'+money((s.existencia_actual||0)*(data.costos.subCosto[s.id]||0))+'</td><td>'+badgeStockSub(s)+'</td></tr>';}).join('')}
        </table>`}
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Paquetes (PT) en inventario</h3></div>
        <div class="search-box"><input id="buscar_dash_paq" placeholder="Buscar paquete…"></div>
        ${data.productos.length===0?'<div class="empty-state">Aún no hay paquetes.</div>':`
        <table id="tabla_dash_paq"><tr>
          ${thSort('Paquete','nombre','dash_paq')}
          ${thSort('Unid./caja','caja','dash_paq',true)}
          ${thSort('Existencia','existencia','dash_paq',true)}
          ${thSort('Costo u.','costo','dash_paq',true)}
          ${thSort('Valor stock','valor','dash_paq',true)}
          <th>Estado</th>
        </tr>
          ${paqView.map(function(p){const cu=data.costos.paqCosto[p.codigo_pt]||0;const pc=p.unidades_por_caja||1;const ex=p.existencia_actual||0;return '<tr><td>'+p.nombre+' <span class="mono" style="color:var(--text-muted);font-size:11.5px;">'+p.codigo_pt+'</span></td><td class="num">'+pc+'</td><td class="num">'+num(ex)+'</td><td class="num">'+money(cu)+'</td><td class="num">'+money(ex*cu)+'</td><td>'+badgeStockPT(p)+'</td></tr>';}).join('')}
        </table>`}
      </div>

      <div class="panel" id="panelTimeline">
        <div class="panel-header"><h3 style="display:flex;align-items:center;gap:6px;">${icono('clock','sm')} Actividad reciente</h3></div>
        <div class="timeline-body" id="timelineBody"><div class="empty-state">Cargando actividad…</div></div>
      </div>`;
    filtrarTabla('buscar_dash_ins','tabla_dash_ins');
    filtrarTabla('buscar_dash_sub','tabla_dash_sub');
    filtrarTabla('buscar_dash_paq','tabla_dash_paq');
    bindSortHeaders(renderDashboard);

    /* Timeline async — no bloquea el render */
    construirTimeline(15).then(function(eventos){
      const cont=document.getElementById('timelineBody');
      if(!cont)return;
      if(!eventos.length){
        cont.innerHTML='<div class="empty-state">Sin actividad reciente.</div>';
        return;
      }
      cont.innerHTML='<div class="timeline-list">'+eventos.map(function(ev){
        return '<div class="timeline-item timeline-'+ev.variant+'">'
          +'<div class="timeline-icon">'+ev.icon+'</div>'
          +'<div class="timeline-content">'
          +'<div class="timeline-title">'+ev.titulo+'</div>'
          +'<div class="timeline-sub">'+ev.sub+'</div>'
          +'</div>'
          +'<div class="timeline-time">'+formatoRelativo(ev.fecha)+'</div>'
          +'</div>';
      }).join('')+'</div>';
    }).catch(function(err){
      const cont=document.getElementById('timelineBody');
      if(cont) cont.innerHTML='<div class="empty-state">No se pudo cargar la actividad.</div>';
    });
    
    /* Alerta de stock: bind de acciones */
    /* Bind "Ver todos" del widget de stock crítico */
    document.querySelectorAll('.panel [data-goto-tab="insumos"]').forEach(function(btn){
      btn.addEventListener('click',function(){
        const item=document.querySelector('.nav-item[data-tab="insumos"]');
        if(item) item.click();
      });
    });

    const alertAction=document.querySelector('[data-goto-tab="insumos"]');
    if(alertAction){
      /* Ocultar si el usuario ya la descartó esta sesión */
      const banner=document.getElementById('alertStockBanner');
      const descartada=sessionStorage.getItem('aseptiq_alert_stock_dismissed')==='1';
      if(descartada && banner) banner.style.display='none';
      alertAction.addEventListener('click',function(){
        document.querySelector('.nav-item[data-tab="insumos"]').click();
      });
      const btnClose=document.querySelector('[data-dismiss-alert]');
      if(btnClose){
        btnClose.addEventListener('click',function(){
          if(banner) banner.style.display='none';
          try{sessionStorage.setItem('aseptiq_alert_stock_dismissed','1');}catch(e){}
        });
      }
    }
  }catch(e){main.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';}
}

/* ============ ETIQUETAS QR ============ */
function abrirModalEtiquetas(tipo,item,data){
  const nombre = item.nombre || '';
  const codigo = item.codigo || item.codigo_pt || '';
  
  if(tipo === 'pt') {
    const cfg = getConfig();
    const etqCfg = getEtiquetasConfig();
    const plantilla = item.plantilla_etiqueta || 'esteril_proclides';
    const plantillasNombres = {
      'esteril_proclides': 'Estéril Proclides (150×100mm)',
      'esteril_allmed': 'Estéril Allmed (150×100mm)',
      'noesteril_allmed': 'No Estéril Allmed (150×100mm)',
      'noesteril_proclides_grande': 'No Estéril Proclides Grande (150×100mm)',
      'noesteril_proclides_mediana': 'No Estéril Proclides Mediana (80×44mm)'
    };
    const hoy = new Date().toISOString().slice(0,10);

    const undsPorCaja = item.unidades_por_caja || 1;

    abrirModalGenerico({
      title: 'Imprimir etiquetas PT',
      subtitle: codigo + ' · ' + nombre,
      icon: icono('tag','lg'),
      variant: 'info',
      size: 'md',
      body: '<div class="form-grid" style="padding:0;">'
        +'<div class="full-span" style="margin-bottom:12px; padding:10px; background:var(--surface-2); border-radius:8px; border:1px solid var(--border);">'
          +'<div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:600; margin-bottom:4px;">Plantilla asignada</div>'
          +'<div style="font-size:14px; font-weight:600; color:var(--accent);">'+ (plantillasNombres[plantilla] || plantilla) +'</div>'
        +'</div>'
        +'<div><label>Paquetes a imprimir</label><input id="etq_cantidad" type="number" min="1" max="1000" value="1" oninput="document.getElementById(\'etq_cajas\').value = Math.ceil(this.value / '+undsPorCaja+')"></div>'
        +'<div><label>Cajas a imprimir</label><input id="etq_cajas" type="number" min="0" max="100" value="'+(undsPorCaja>1?1:0)+'"></div>'
        +'<div><label>Lote de producción</label><input id="etq_lote" placeholder="Ej: 3619"></div>'
        +'<div><label>Fecha de fabricación</label><input id="etq_fecha_fab" type="date" value="'+hoy+'"></div>'
        +'<div class="full-span" style="font-size:11px; color:var(--text-muted); line-height:1.4; margin-top:6px;">'
          +'Si el producto tiene '+undsPorCaja+' paquetes por caja, se generarán las etiquetas de caja automáticamente.'
        +'</div>'
        +'</div>',
      footer: '<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button class="ghost" id="etq_cancelar">Cancelar</button><button id="etq_imprimir">'+icono('printer','sm')+' Imprimir etiquetas</button></div>',
      onOpen: function(){
        document.getElementById('etq_cancelar').addEventListener('click', cerrarModalGenerico);
        document.getElementById('etq_imprimir').addEventListener('click', async function(ev){
          const cantidad = Math.max(1, parseInt(document.getElementById('etq_cantidad').value,10)||1);
          const cantidadCajas = Math.max(0, parseInt(document.getElementById('etq_cajas').value,10)||0);
          const lote = document.getElementById('etq_lote').value.trim() || 'SIN LOTE';
          const fechaFab = document.getElementById('etq_fecha_fab').value;
          
          try {
            imprimirEtiquetasPT(item, data, plantilla, {cantidad, cantidadCajas, lote, fechaFab});
            toast('Ventana de impresión abierta.', 'success');
          } catch(err) {
            toast(err.message, 'error');
            return; /* Detener si falla la impresión */
          }
          
          cerrarModalGenerico();

          /* Preguntar al usuario si la impresión se realizó correctamente */
          setTimeout(async function() {
            const confirmado = await confirmar({
              title: 'Registrar impresión',
              message: '¿Las etiquetas se imprimieron correctamente? Si confirmas, se registrará el conteo para trazabilidad.',
              icon: '🖨',
              variant: 'info',
              okText: 'Sí, registrar'
            });

            if (confirmado) {
              try {
                await api('etiquetas_impresas', {
                  method:'POST',
                  body: JSON.stringify({
                    codigo_pt: item.codigo_pt,
                    lote: lote,
                    cantidad_paquetes: cantidad,
                    cantidad_cajas: cantidadCajas,
                    usuario_email: SUPA_PROFILE ? SUPA_PROFILE.email : 'desconocido'
                  })
                });
                toast('Impresión registrada exitosamente','success');
              } catch(err) {
                console.warn('No se pudo registrar la impresión:', err);
                toast('Error al registrar la impresión en la base de datos', 'error');
              }
            }
          }, 1500); // 1.5s de margen para que el diálogo de impresión aparezca y el usuario decida
        });
      }
    });
    return;
  }

  // Si no es PT (es insumo), usa el modal genérico original
  abrirModalGenerico({
    title: 'Imprimir etiquetas QR',
    subtitle: codigo + ' · ' + nombre,
    icon: icono('tag','lg'),
    variant: 'info',
    size: 'md',
    body: '<div class="form-grid" style="padding:0;">'
      +'<div><label>Cantidad de etiquetas</label><input id="etq_cantidad" type="number" min="1" max="200" value="1"></div>'
      +'<div><label>Tamaño de etiqueta</label><select id="etq_tamano">'
      +'<option value="small" selected>Pequeña · 50 × 25 mm (4 por fila)</option>'
      +'</select></div>'
      +'<div class="full-span"><label>Campos a incluir</label>'
      +'<label class="check-row" style="margin:6px 0;"><input type="checkbox" id="etq_codigo" checked><span>Código</span></label>'
      +'<label class="check-row" style="margin:6px 0;"><input type="checkbox" id="etq_nombre" checked><span>Nombre</span></label>'
      +'<label class="check-row" style="margin:6px 0;"><input type="checkbox" id="etq_unidad" checked><span>Unidad de consumo</span></label>'
      +'<label class="check-row" style="margin:6px 0;"><input type="checkbox" id="etq_lote"><span>Línea para escribir lote</span></label>'
      +'<label class="check-row" style="margin:6px 0;"><input type="checkbox" id="etq_fecha"><span>Línea para escribir fecha</span></label>'
      +'</div>'
      +'</div>',
    footer: '<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button class="ghost" id="etq_cancelar">Cancelar</button><button id="etq_imprimir">'+icono('printer','sm')+' Imprimir etiquetas</button></div>',
    onOpen: function(){
      document.getElementById('etq_cancelar').addEventListener('click', cerrarModalGenerico);
      document.getElementById('etq_imprimir').addEventListener('click', function(){
        const cantidad = Math.max(1, Math.min(200, parseInt(document.getElementById('etq_cantidad').value,10)||1));
        const tamano = document.getElementById('etq_tamano').value;
        const campos = {
          codigo: document.getElementById('etq_codigo').checked,
          nombre: document.getElementById('etq_nombre').checked,
          unidad: document.getElementById('etq_unidad').checked,
          lote: document.getElementById('etq_lote').checked,
          fecha: document.getElementById('etq_fecha').checked
        };
        imprimirEtiquetas(tipo, item, cantidad, tamano, campos);
        cerrarModalGenerico();
      });
    }
  });
}

function imprimirEtiquetas(tipo, item, cantidad, tamano, campos){
  const sizes = {
    small:{w:'48mm',h:'25mm',cols:4, qr:34, fsCod:'7pt', fsNom:'6.5pt', fsUni:'6pt'},
    medium:{w:'63mm',h:'38mm',cols:3, qr:52, fsCod:'9pt', fsNom:'8pt', fsUni:'7.5pt'},
    large:{w:'99mm',h:'38mm',cols:2, qr:68, fsCod:'10.5pt', fsNom:'9.5pt', fsUni:'8.5pt'}
  };
  const s = sizes[tamano] || sizes.medium;

  const nombre = item.nombre || '';
  const codigo = item.codigo || item.codigo_pt || '';
  const unidad = tipo === 'insumo' ? unidadConsumo(item) : 'u';

  const qr = qrSVG(codigo, s.qr);
  const qrBox = qr ? '<div class="etiqueta-qr">'+qr+'</div>' : '';

  let etiquetas = '';
  for(let i = 0; i < cantidad; i++){
    etiquetas += '<div class="etiqueta">'
      + qrBox
      + '<div class="etiqueta-info">'
      +(campos.codigo ? '<div class="etiqueta-codigo">'+codigo+'</div>' : '')
      +(campos.nombre ? '<div class="etiqueta-nombre">'+nombre+'</div>' : '')
      +(campos.unidad ? '<div class="etiqueta-unidad">'+unidad+'</div>' : '')
      +(campos.lote ? '<div class="etiqueta-linea"><span>Lote:</span><span class="linea"></span></div>' : '')
      +(campos.fecha ? '<div class="etiqueta-linea"><span>Fecha:</span><span class="linea"></span></div>' : '')
      + '</div>'
      + '</div>';
  }

  const cssEtiquetas = `
    @page{ size:letter portrait; margin:10mm; }
    body{margin:0;padding:0;background:#fff;font-family:'Helvetica','Arial',sans-serif;color:#000;}
    .hoja-etiquetas{
      display:grid;
      grid-template-columns:repeat(${s.cols},1fr);
      gap:2mm;
    }
    .etiqueta{
      width:${s.w};height:${s.h};
      border:1px solid #999;border-radius:3px;
      padding:2mm;
      display:flex;align-items:center;gap:2mm;
      overflow:hidden;background:#fff;
      page-break-inside:avoid;
      box-sizing:border-box;
    }
    .etiqueta-qr{flex-shrink:0;display:flex;align-items:center;justify-content:center;}
    .etiqueta-qr svg{display:block;}
    .etiqueta-info{flex:1;min-width:0;overflow:hidden;line-height:1.15;}
    .etiqueta-codigo{
      font-family:'Courier New',monospace;font-weight:700;
      font-size:${s.fsCod};color:#000;letter-spacing:.02em;
      margin-bottom:1mm;
    }
    .etiqueta-nombre{
      font-size:${s.fsNom};font-weight:500;color:#111;margin-bottom:.5mm;
      display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
      overflow:hidden;
    }
    .etiqueta-unidad{
      font-size:${s.fsUni};color:#555;text-transform:uppercase;letter-spacing:.05em;
    }
    .etiqueta-linea{
      display:flex;align-items:baseline;gap:1.5mm;
      font-size:${s.fsUni};color:#555;margin-top:1mm;
    }
    .etiqueta-linea .linea{flex:1;border-bottom:1px solid #999;height:1em;min-width:10mm;}
    @media print{ .etiqueta{border:1px solid #999 !important;} }
  `;

  imprimirHTML('<div class="hoja-etiquetas">'+etiquetas+'</div>', 'Etiquetas '+codigo, cssEtiquetas);
}

/* ============ GENERADORES DE ETIQUETAS PT ============ */
function imprimirEtiquetasPT(prod, data, plantilla, opts){
  const etqCfg = getEtiquetasConfig();
  const empPro = etqCfg.empresas.proclides;
  const empAll = etqCfg.empresas.allers;
  
  const fFab = new Date(opts.fechaFab + 'T12:00:00');
  const fVenc = calcularVencimiento(fFab);
  const strFab = formatoMesAnio(fFab);
  const strVenc = formatoMesAnio(fVenc);
  const lote = opts.lote;
  const undsPorCaja = prod.unidades_por_caja || 1;

  const regexEmpaque = /PGM|BOLSA|ETIQUETA|CAJA/i;
  let contenido = [];
  if(data && data.paqueteSubs && data.subproductos) {
    const comp = data.paqueteSubs.filter(x => x.codigo_pt === prod.codigo_pt);
    contenido = comp.map(c => {
      const sub = data.subproductos.find(x => x.id === c.subproducto_id);
      return { cant: c.cantidad, nombre: sub ? sub.nombre : '?' };
    }).filter(c => !regexEmpaque.test(c.nombre));
  }

  let barcodeHtml = '';
  if (prod.codigo_barras && prod.codigo_barras.trim() !== '') {
    barcodeHtml = `<div style="width:100%; height:12mm;">${barcodeSVG(prod.codigo_barras, {alto:40, ancho:1.5})}</div>`;
  }

  const htmls = [];

  // Paquetes
  for(let i=0; i<opts.cantidad; i++) {
    if(plantilla === 'esteril_proclides') htmls.push(_tplEsterilProclides(prod, empPro, lote, strFab, strVenc, contenido, etqCfg, false, undsPorCaja));
    else if(plantilla === 'esteril_allmed') htmls.push(_tplEsterilAllmed(prod, empAll, empPro, lote, strFab, strVenc, contenido, barcodeHtml, etqCfg, false, undsPorCaja));
    else if(plantilla === 'noesteril_allmed') htmls.push(_tplNoEsterilAllmed(prod, empAll, lote, strVenc, barcodeHtml, etqCfg, false, undsPorCaja));
    else if(plantilla === 'noesteril_proclides_grande') htmls.push(_tplNoEsterilProclidesGrande(prod, empPro, lote, strVenc, barcodeHtml, etqCfg, false, undsPorCaja));
    else if(plantilla === 'noesteril_proclides_mediana') htmls.push(_tplNoEsterilProclidesMediana(prod, empPro, lote, strVenc, barcodeHtml, etqCfg, false, undsPorCaja));
  }

  // Cajas
  if (opts.cantidadCajas > 0 && undsPorCaja > 1) {
    for(let i=1; i<=opts.cantidadCajas; i++) {
      const boxCode = prod.codigo_pt + '-C' + String(i).padStart(3,'0');
      /* El QR es un poco más pequeño para la etiqueta mediana (80x44mm) */
      const isMediana = plantilla === 'noesteril_proclides_mediana';
      const qrTam = isMediana ? 40 : 60;
      /* Convertimos píxeles a milímetros para que encaje perfecto */
      const qrHtml = `<div style="width:${qrTam * 0.264583}mm; height:${qrTam * 0.264583}mm;">${qrSVG(boxCode, qrTam)}</div>`;
      
      if(plantilla === 'esteril_proclides') htmls.push(_tplEsterilProclides(prod, empPro, lote, strFab, strVenc, contenido, etqCfg, true, undsPorCaja, i, qrHtml));
      else if(plantilla === 'esteril_allmed') htmls.push(_tplEsterilAllmed(prod, empAll, empPro, lote, strFab, strVenc, contenido, barcodeHtml, etqCfg, true, undsPorCaja, i, qrHtml));
      else if(plantilla === 'noesteril_allmed') htmls.push(_tplNoEsterilAllmed(prod, empAll, lote, strVenc, barcodeHtml, etqCfg, true, undsPorCaja, i, qrHtml));
      else if(plantilla === 'noesteril_proclides_grande') htmls.push(_tplNoEsterilProclidesGrande(prod, empPro, lote, strVenc, barcodeHtml, etqCfg, true, undsPorCaja, i, qrHtml));
      else if(plantilla === 'noesteril_proclides_mediana') htmls.push(_tplNoEsterilProclidesMediana(prod, empPro, lote, strVenc, barcodeHtml, etqCfg, true, undsPorCaja, i, qrHtml));
    }
  }

  const w = plantilla === 'noesteril_proclides_mediana' ? 80 : 150;
  const h = plantilla === 'noesteril_proclides_mediana' ? 44 : 100;
  const css = `
    @page { size: ${w}mm ${h}mm; margin: 0; }
    html, body { margin:0 !important; padding:0 !important; background:#fff; font-family:Arial,Helvetica,sans-serif; color:#000; -webkit-print-color-adjust:exact; }
    .etq-wrapper { 
      position: relative;
      width:${w}mm; 
      height:${h}mm; 
      box-sizing:border-box; 
      display:flex; 
      flex-direction:column; 
      page-break-after:always; 
      page-break-inside:avoid;
      overflow:hidden; 
      border:0.5mm solid #000; 
      margin: 0;
    }
    .etq-wrapper:last-child { page-break-after:auto; }
    .barcode svg { width:100%; height:100%; }
  `;
  imprimirHTML(htmls.join(''), 'Etiquetas PT', css);
}

// --- PLANTILLAS UNIFICADAS ---

function _tplEsterilProclides(prod, emp, lote, fFab, fVenc, contenido, cfg, isCaja, undsPorCaja, cajaNum, qrHtml){
  const logo = cfg.logos.proclides || 'logo-proclides.png';
  const contList = contenido.map(c => `<div>- ${c.cant} ${c.nombre}</div>`).join('');
  
  return `
    <div class="etq-wrapper" style="flex-direction:row; padding:4mm;">
      ${!isCaja ? `
      <div style="flex:1; border:2px solid #000; display:flex; flex-direction:column; padding:2mm;">
        <div style="font-weight:bold; font-size:12pt; border-bottom:1px solid #000; padding-bottom:1mm; margin-bottom:2mm;">CONTENIDO</div>
        <div style="font-size:9pt; line-height:1.3; flex:1; overflow:hidden;">${contList}</div>
        <div style="font-size:6pt; margin-top:1mm; line-height:1.2;">Conservese en un lugar fresco, seco y libre de polvo.</div>
      </div>
      ` : `
      <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between; padding-right:4mm;">
         <div style="font-size:14pt; font-weight:bold;">CAJA #${cajaNum}</div>
         <div style="font-size:24pt; font-weight:bold; line-height:1;">CAJA X<br>${undsPorCaja} PAQUETES</div>
         ${qrHtml}
      </div>
      `}
      <div style="width:65mm; padding-left:4mm; display:flex; flex-direction:column; justify-content:space-between;">
        <div style="text-align:center;">
          <div style="font-weight:bold; font-size:10pt; text-transform:uppercase; line-height:1.1; margin-bottom:2mm;">${prod.nombre}</div>
          <div style="font-size:9pt; font-family:monospace;">${prod.codigo_pt}</div>
        </div>
        <div style="text-align:center;"><img src="${logo}" style="max-height:20mm; max-width:100%;"></div>
        <div style="text-align:center; margin:1mm 0;">
          ${iconosEsterilHTML()}
          <div style="font-size:7pt; border:1px solid #000; padding:1mm; margin-top:1mm;">INVIMA: ${prod.registro_invima || 'No requiere'}</div>
        </div>
        <div style="font-size:8pt; line-height:1.5;">
          <div style="display:flex; align-items:center; margin-bottom:1mm;"><span style="width:18mm;">LOTE:</span><div style="flex:1; border:1px solid #000; height:5mm; text-align:center; line-height:5mm; font-weight:bold;">${lote}</div></div>
          <div style="display:flex; align-items:center; margin-bottom:1mm;"><span style="width:6mm;">${iconoFechaFabHTML()}</span><div style="flex:1; border:1px solid #000; height:5mm; text-align:center; line-height:5mm;">${fFab}</div></div>
          <div style="display:flex; align-items:center; margin-bottom:1mm;"><span style="width:6mm;">${iconoFechaVencHTML()}</span><div style="flex:1; border:1px solid #000; height:5mm; text-align:center; line-height:5mm;">${fVenc}</div></div>
          <div style="display:flex; align-items:center;"><span style="width:18mm;">LOTE EO:</span><div style="flex:1; border:1px solid #000; height:5mm;"></div></div>
        </div>
        <div style="font-size:5.5pt; text-align:center; line-height:1.1; margin-top:1mm;">
          Fabricado y Distribuido por:<br><b>${emp.razonSocial}</b><br>${emp.direccion}<br>${emp.telefono} · ${emp.correos.join(' / ')}
        </div>
      </div>
    </div>
  `;
}

function _tplEsterilAllmed(prod, empAll, empPro, lote, fFab, fVenc, contenido, barcodeHtml, cfg, isCaja, undsPorCaja, cajaNum, qrHtml){
  const logo = cfg.logos.allmed || 'logo-allmed.png';
  const contList = contenido.map(c => `<div>- ${c.cant} ${c.nombre}</div>`).join('');
  return `
    <div class="etq-wrapper" style="flex-direction:row; padding:4mm;">
      ${!isCaja ? `
      <div style="flex:1; display:flex; flex-direction:column;">
        <div style="font-weight:bold; font-size:11pt; margin-bottom:1mm;">${prod.nombre}</div>
        <div style="font-size:10pt; font-family:monospace; margin-bottom:2mm;">${prod.codigo_pt}</div>
        <div style="border:2px solid #000; padding:2mm; flex:1;">
          <div style="font-weight:bold; font-size:10pt; border-bottom:1px solid #000; padding-bottom:1mm; margin-bottom:2mm;">CONTENIDO</div>
          <div style="font-size:8pt; line-height:1.3;">${contList}</div>
        </div>
      </div>
      ` : `
      <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between; padding-right:4mm;">
         <div style="font-size:14pt; font-weight:bold;">CAJA #${cajaNum}</div>
         <div style="font-size:24pt; font-weight:bold; line-height:1;">CAJA X<br>${undsPorCaja} PAQUETES</div>
         ${qrHtml}
      </div>
      `}
      <div style="width:65mm; padding-left:4mm; display:flex; flex-direction:column; justify-content:space-between;">
        <div style="text-align:center;"><img src="${logo}" style="max-height:20mm; max-width:100%;"></div>
        <div style="text-align:center; margin:1mm 0;">
          ${iconosEsterilHTML()}
          <div style="font-size:7pt; border:1px solid #000; padding:1mm; margin-top:1mm;">INVIMA: ${prod.registro_invima || 'No requiere'}</div>
        </div>
        <div style="font-size:8pt; line-height:1.5;">
          <div style="display:flex; align-items:center; margin-bottom:1mm;"><span style="width:18mm;">LOTE:</span><div style="flex:1; border:1px solid #000; height:5mm; text-align:center; line-height:5mm; font-weight:bold;">${lote}</div></div>
          <div style="display:flex; align-items:center; margin-bottom:1mm;"><span style="width:6mm;">${iconoFechaFabHTML()}</span><div style="flex:1; border:1px solid #000; height:5mm; text-align:center; line-height:5mm;">${fFab}</div></div>
          <div style="display:flex; align-items:center; margin-bottom:1mm;"><span style="width:6mm;">${iconoFechaVencHTML()}</span><div style="flex:1; border:1px solid #000; height:5mm; text-align:center; line-height:5mm;">${fVenc}</div></div>
          <div style="display:flex; align-items:center;"><span style="width:18mm;">LOTE EO:</span><div style="flex:1; border:1px solid #000; height:5mm;"></div></div>
        </div>
        <div style="margin:1mm 0;">${barcodeHtml}</div>
        <div style="font-size:5.5pt; text-align:right; line-height:1.1;">
          Fabricado por: <b>${empPro.razonSocial}</b><br>
          Distribuido por: <b>${empAll.razonSocial}</b> · NIT: ${empAll.nit}<br>${empAll.direccion}
        </div>
      </div>
    </div>
  `;
}

function _tplNoEsterilProclidesGrande(prod, emp, lote, fVenc, barcodeHtml, cfg, isCaja, undsPorCaja, cajaNum, qrHtml){
  const logo = cfg.logos.proclides || 'logo-proclides.png';
  return `
    <div class="etq-wrapper" style="padding:4mm; flex-direction:row;">
      <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="text-align:left; font-size:9pt; margin-bottom:2mm;">
            <b>Fabricado por:</b><br>${emp.razonSocial}<br>${emp.direccion}
          </div>
          <table style="width:100%; font-size:9pt; border-collapse:collapse; margin-bottom:2mm;">
            <tr><td style="width:30mm; padding:1mm 0;">Nombre del Producto:</td><td style="font-weight:bold;">${prod.nombre}</td></tr>
            <tr><td style="padding:1mm 0;">Código PT:</td><td style="font-weight:bold;">${prod.codigo_pt}</td></tr>
            <tr><td style="padding:1mm 0;">Marca:</td><td style="font-weight:bold;">PROCLIDES S.A.S</td></tr>
            <tr><td style="padding:1mm 0;">Lote:</td><td style="font-weight:bold;">${lote}</td></tr>
            <tr><td style="padding:1mm 0;">Fecha de Vencimiento:</td><td style="font-weight:bold;">${fVenc}</td></tr>
          </table>
        </div>
        <div style="font-size:8pt; line-height:1.4;">
          <b>Advertencias</b><br>- Almacenar a temperatura inferior a 30°<br>- No requiere registro INVIMA<br>- Producto desechable usar solo una vez
        </div>
        ${isCaja ? `<div style="font-size:14pt; font-weight:bold; margin-top:4mm;">CAJA #${cajaNum}</div>` : ''}
      </div>
      <div style="width:55mm; display:flex; flex-direction:column; justify-content:space-between; align-items:center; text-align:center; padding-top:5mm; padding-bottom:2mm; height:100%;">
        <div style="display:flex; flex-direction:column; align-items:center;">
          <img src="${logo}" style="max-width:100%; max-height:35mm; margin-bottom:5mm;">
          ${isCaja ? `<div style="font-size:22pt; font-weight:bold; line-height:1; text-align:center;">CAJA X<br>${undsPorCaja} PAQUETES</div>` : `<div style="transform: scale(1.5); margin-top:10mm;">${iconoNoReusoHTML()}</div>`}
        </div>
        <div style="width:100%; display:flex; justify-content:flex-end; align-items:flex-end;">
          ${isCaja ? qrHtml : `<div style="font-size:7pt; width:100%; text-align:center;">${emp.web}</div>`}
        </div>
      </div>
    </div>
  `;
}

function _tplNoEsterilAllmed(prod, empAll, lote, fVenc, barcodeHtml, cfg, isCaja, undsPorCaja, cajaNum, qrHtml){
  const logo = cfg.logos.allmed || 'logo-allmed.png';
  return `
    <div class="etq-wrapper" style="padding:4mm; flex-direction:row;">
      ${!isCaja ? `
      <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between;">
        <div style="text-align:center; margin-bottom:2mm;"><img src="${logo}" style="max-height:18mm;"></div>
        <div style="font-weight:bold; font-size:12pt; text-transform:uppercase; text-align:center; margin-bottom:2mm;">${prod.nombre}</div>
        <div style="display:flex; justify-content:space-between; font-size:9pt; margin-bottom:2mm;">
          <span><b>PT:</b> ${prod.codigo_pt}</span>
          <span><b>LOTE:</b> ${lote}</span>
          <span><b>VENCE:</b> ${fVenc}</span>
        </div>
        <div style="flex:1; display:flex; align-items:center; justify-content:center; flex-direction:column;">
          <div style="width:100%;">${barcodeHtml}</div>
        </div>
        <div style="font-size:8pt; text-align:center; margin-bottom:2mm;">PRESENTACIONES E IMPORTACIONES</div>
        <div style="font-size:6.5pt; text-align:center; line-height:1.2;">
          DISTRIBUIDO POR: <b>${empAll.razonSocial}</b> · NIT: ${empAll.nit} · ${empAll.direccion}<br>${empAll.telefono} · ${empAll.web}
        </div>
        <div style="border-top:2px solid #000; margin-top:2mm; padding-top:1mm; text-align:center; font-size:7pt; font-weight:bold;">
          MADE IN COLOMBIA - NO REQUIERE REGISTRO INVIMA
        </div>
      </div>
      <div style="width:40mm; padding-left:4mm; display:flex; flex-direction:column; justify-content:center; align-items:center;">
        <div style="transform:scale(1.2);">${iconoNoReusoHTML()}</div>
      </div>
      ` : `
      <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="text-align:center; margin-bottom:2mm;"><img src="${logo}" style="max-height:18mm;"></div>
          <div style="font-weight:bold; font-size:14pt; text-transform:uppercase; text-align:center; margin-bottom:2mm;">${prod.nombre}</div>
          
          <div style="display:flex; justify-content:center; margin-bottom:2mm;">
             <div style="transform:scale(1.2);">${iconoNoReusoHTML()}</div>
          </div>
          
          <div style="display:flex; justify-content:space-between; font-size:10pt; margin-bottom:2mm;">
            <span><b>PT:</b> ${prod.codigo_pt}</span>
            <span><b>LOTE:</b> ${lote}</span>
            <span><b>VENCE:</b> ${fVenc}</span>
          </div>
        </div>
        <div>
          <div style="font-size:8pt; text-align:center; margin-bottom:1mm;">PRESENTACIONES E IMPORTACIONES</div>
          <div style="font-size:7pt; text-align:center; line-height:1.2;">
            DISTRIBUIDO POR: <b>${empAll.razonSocial}</b> · NIT: ${empAll.nit} · ${empAll.direccion}<br>${empAll.telefono} · ${empAll.web}
          </div>
          <div style="border-top:2px solid #000; margin-top:2mm; padding-top:1mm; text-align:center; font-size:7.5pt; font-weight:bold;">
            MADE IN COLOMBIA - NO REQUIERE REGISTRO INVIMA
          </div>
          <div style="font-size:14pt; font-weight:bold; margin-top:4mm;">CAJA #${cajaNum}</div>
        </div>
      </div>
      <div style="width:70mm; padding-left:4mm; display:flex; flex-direction:column; justify-content:flex-start; align-items:center; text-align:center; padding-top:10mm;">
        <div style="font-size:32pt; font-weight:bold; line-height:1; text-align:center; width:100%;">CAJA X<br>${undsPorCaja} PAQUETES</div>
        <div style="margin-top:8mm;">${qrHtml}</div>
      </div>
      `}
    </div>
  `;
}

function _tplNoEsterilProclidesMediana(prod, emp, lote, fVenc, barcodeHtml, cfg, isCaja, undsPorCaja, cajaNum, qrHtml){
  const txtUnidades = isCaja ? `CAJA X ${undsPorCaja} PAQUETES` : `UNIDADES: ${undsPorCaja || 1}`;
  return `
    <div class="etq-wrapper" style="padding:2mm; text-align:center; display:flex; flex-direction:column; height:100%;">
      <div style="font-size:7.5pt; font-weight:bold; line-height:1.1;">${emp.razonSocial}</div>
      <div style="font-size:6pt; line-height:1.1; margin-bottom:1.5mm;">${emp.direccion}<br>${emp.telefono} · ${emp.correos.join(' / ')}</div>
      
      <div style="font-size:7.5pt; font-weight:bold; line-height:1.3; margin-bottom:1.5mm;">
        REF: ${prod.nombre.toUpperCase()}<br>
        ${prod.codigo_pt}<br>
        LOTE: ${lote} | VENCE: ${fVenc}<br>
        ${txtUnidades}
      </div>
      
      <div style="font-size:5.5pt; line-height:1.2;">
        Advertencia:<br>
        - Almacenar a temperatura inferior a 30°<br>
        - Producto desechable usar solo una vez<br>
        - No requiere Registro Invima
      </div>
      ${!isCaja && barcodeHtml ? `<div style="margin-top:1mm; display:flex; justify-content:center;">${barcodeHtml}</div>` : ''}
      
      ${isCaja ? `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:auto; width:100%; padding-top:1mm;">
          <div style="font-size:8pt; font-weight:bold;">CAJA #${cajaNum}</div>
          ${qrHtml}
        </div>
      ` : ''}
    </div>
  `;
}
/* Genera un código de barras SVG a partir de un texto. */
function barcodeSVG(texto, opts){
  opts = opts || {};
  const ancho = opts.ancho || 1.8;   // px por módulo
  const alto = opts.alto || 50;      // alto en px
  const mostrarTexto = opts.mostrarTexto !== false;
  const svgNS = 'http://www.w3.org/2000/svg';
  try{
    if(typeof JsBarcode === 'undefined') return '';
    /* Creamos un SVG temporal en memoria */
    const svg = document.createElementNS(svgNS, 'svg');
    JsBarcode(svg, String(texto), {
      format: 'CODE128',
      width: ancho,
      height: alto,
      displayValue: mostrarTexto,
      fontSize: 12,
      margin: 4,
      font: 'Helvetica'
    });
    return svg.outerHTML;
  }catch(e){
    console.warn('Error generando barcode:', e);
    return '';
  }
}

/* Icono SVG inline del símbolo "ESTERILE EO" + temperatura + no reuso.
   Es una tira que va horizontal en las etiquetas esteriles. */
function iconosEsterilHTML(){
  return `<div class="etq-iconos" style="display:flex; gap:2mm; align-items:center; justify-content:center;">
    <div style="display:flex; border:1.5px solid #000; font-family:Arial, sans-serif; font-weight:bold; font-size:8pt; line-height:1;">
      <div style="padding:1mm 1.5mm; border-right:1.5px solid #000;">STERILE</div>
      <div style="padding:1mm 1.5mm;">EO</div>
    </div>
    <svg viewBox="0 0 24 24" width="6mm" height="6mm">
      <path d="M9 4v10a3 3 0 1 0 6 0V4a3 3 0 1 0-6 0z" fill="none" stroke="#000" stroke-width="1.5"/>
      <path d="M12 10v4" stroke="#000" stroke-width="1.5"/>
      <text x="12" y="22" font-family="Arial" font-size="6" text-anchor="middle">30°</text>
    </svg>
    <svg viewBox="0 0 24 24" width="6mm" height="6mm">
      <path d="M12 3c-4 0-7 3-7 7h14c0-4-3-7-7-7z" fill="none" stroke="#000" stroke-width="1.5"/>
      <path d="M12 10v8a2 2 0 0 1-2 2h-1" fill="none" stroke="#000" stroke-width="1.5"/>
    </svg>
    <svg viewBox="0 0 24 24" width="6mm" height="6mm">
      <circle cx="12" cy="12" r="9" fill="none" stroke="#000" stroke-width="1.5"/>
      <text x="12" y="15" font-family="Arial" font-size="9" text-anchor="middle" font-weight="bold">2</text>
      <line x1="5" y1="5" x2="19" y2="19" stroke="#000" stroke-width="1.5"/>
    </svg>
  </div>`;
}

function iconoNoReusoHTML(){
  return `<svg viewBox="0 0 24 24" width="8mm" height="8mm">
    <circle cx="12" cy="12" r="9" fill="none" stroke="#000" stroke-width="1.5"/>
    <text x="12" y="15" font-family="Arial" font-size="9" text-anchor="middle" font-weight="bold">2</text>
    <line x1="5" y1="5" x2="19" y2="19" stroke="#000" stroke-width="1.5"/>
  </svg>`;
}

function iconoFechaFabHTML() {
  return `<svg viewBox="0 0 24 24" width="6mm" height="6mm">
    <rect x="3" y="6" width="18" height="15" rx="2" fill="none" stroke="#000" stroke-width="1.5"/>
    <path d="M8 3v4M16 3v4M3 10h18" stroke="#000" stroke-width="1.5"/>
    <text x="12" y="18" font-family="Arial" font-size="7" text-anchor="middle" font-weight="bold">FAB</text>
  </svg>`;
}

function iconoFechaVencHTML() {
  return `<svg viewBox="0 0 24 24" width="6mm" height="6mm">
    <rect x="3" y="6" width="18" height="15" rx="2" fill="none" stroke="#000" stroke-width="1.5"/>
    <path d="M8 3v4M16 3v4M3 10h18" stroke="#000" stroke-width="1.5"/>
    <text x="12" y="18" font-family="Arial" font-size="7" text-anchor="middle" font-weight="bold">EXP</text>
  </svg>`;
}

function formatoMesAnio(fecha){
  if(!fecha) return '';
  const d = (fecha instanceof Date) ? fecha : new Date(fecha);
  if(isNaN(d.getTime())) return '';
  return String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
}

/* Vida útil: 3 años - 1 mes - 1 día = 35 meses - 1 día */
function calcularVencimiento(fechaFab) {
  if(!fechaFab) return null;
  const d = new Date(fechaFab);
  d.setMonth(d.getMonth() + 35);
  d.setDate(d.getDate() - 1);
  return d;
}

/* Vida útil: 3 años - 1 mes - 1 día = 35 meses - 1 día */
function calcularVencimiento(fechaFab) {
  if(!fechaFab) return null;
  const d = new Date(fechaFab);
  d.setMonth(d.getMonth() + 35);
  d.setDate(d.getDate() - 1);
  return d;
}

/* Devuelve true si el config tiene los logos cargados. */
function etiquetasTienenLogos(cfg){
  const e = (cfg && cfg.etiquetas) || {};
  const l = e.logos || {};
  return !!(l.proclides || l.allmed || l.allers);
}

/* Devuelve los datos de etiquetas desde la config (o defaults). */
function getEtiquetasConfig(){
  const cfg = getConfig();
  const def = {
    empresas: {
      proclides: {
        razonSocial: 'PROCLIDES SOLUCIONES ESTÉRILES S.A.S',
        nit: '901.849.726-1',
        direccion: 'Acopí Yumbo, Valle del Cauca - Colombia',
        telefono: '+57 315 493 2658',
        correos: ['gestion@proclides.co','logistica@proclides.co','dtproclides@gmail.com'],
        web: 'www.proclides.co'
      },
      allers: {
        razonSocial: 'ALLERS S.A.S',
        nit: '890.312.452-4',
        direccion: 'Carrera 67 N° 1B-35, Cali - Colombia',
        telefono: '(602) 4890000',
        correos: ['allers@allers.com.co'],
        web: 'www.allers.com.co'
      }
    },
    invimas: [
      { id: 'paquetes', nombre: 'Paquetes', numero: '2026DM-0032255' },
      { id: 'campos',   nombre: 'Campos',   numero: '2026DM-0032276' }
    ],
    medidas: {
      pequena: { w: 50, h: 25 },
      mediana: { w: 80, h: 44 },
      grande:  { w: 150, h: 100 }
    },
    logos: {
      proclides: '',
      allmed: '',
      allers: ''
    }
  };
  return Object.assign({}, def, (cfg.etiquetas||{}));
}

/* ============ TIMELINE DE ACTIVIDAD (Dashboard) ============ */
async function construirTimeline(limit){
  limit=limit||15;
  const [movs,entregas]=await Promise.all([
    api('movimientos_inventario?select=id,fecha,tipo,cantidad,motivo,insumos(nombre,unidad_consumo,unidad_medida),subproductos(nombre),sys_proveedores(razon_social)&order=fecha.desc&limit='+limit),
    api('entregas_op?select=id,fecha,cantidad,lote_entrega,ordenes_semanales(numero_op,productos_terminados(nombre))&order=fecha.desc&limit='+limit)
  ]);

  const eventos=[];
  movs.forEach(function(m){
    let icon=icono('info'),variant='info',titulo='',sub='';
    const esSub=!!m.subproducto_id;
    if(m.tipo==='Entrada'){
      icon=icono('tray-down');variant='success';
      const nombre=esSub?(m.subproductos?m.subproductos.nombre:'Subproducto'):(m.insumos?m.insumos.nombre:'Insumo');
      titulo='Entrada · '+nombre;
      sub='+'+num(m.cantidad)+' '+(esSub?'u':(m.insumos?unidadConsumo(m.insumos):''))+(m.sys_proveedores?' · '+m.sys_proveedores.razon_social:(m.motivo?' · '+m.motivo:''));
    } else if(m.tipo==='Salida'){
      icon=icono('tray-up');variant=m.proveedor_id?'info':'danger';
      const nombre=m.insumos?m.insumos.nombre:'Insumo';
      titulo=(m.proveedor_id?'Devolución a proveedor · ':'Salida · ')+nombre;
      sub='−'+num(m.cantidad)+' '+(m.insumos?unidadConsumo(m.insumos):'')+(m.motivo?' · '+m.motivo:'');
    } else if(m.tipo==='Consumo'){
      icon=icono('gear');variant='warning';
      const nombre=esSub?(m.subproductos?m.subproductos.nombre:'Subproducto'):(m.insumos?m.insumos.nombre:'Insumo');
      titulo='Consumo · '+nombre;
      sub='−'+num(m.cantidad)+' '+(esSub?'u':(m.insumos?unidadConsumo(m.insumos):''))+(m.motivo?' · '+m.motivo:'');
    } else {
      titulo=m.tipo+' · '+(m.insumos?m.insumos.nombre:'—');
      sub=num(m.cantidad);
    }
    eventos.push({fecha:m.fecha,icon:icon,variant:variant,titulo:titulo,sub:sub});
  });
  entregas.forEach(function(e){
    const op=e.ordenes_semanales?e.ordenes_semanales.numero_op:'OP';
    const prod=e.ordenes_semanales&&e.ordenes_semanales.productos_terminados?e.ordenes_semanales.productos_terminados.nombre:'';
    eventos.push({
      fecha:e.fecha,
      icon:icono('sparkles'),
      variant:'success',
      titulo:'Entrega de OP · '+op+(prod?' · '+prod:''),
      sub:'+'+num(e.cantidad)+' u entregadas'+(e.lote_entrega?' · lote '+e.lote_entrega:'')
    });
  });

  eventos.sort(function(a,b){return new Date(b.fecha)-new Date(a.fecha);});
  return eventos.slice(0,limit);
}

function formatoRelativo(fechaISO){
  const diff=Date.now()-new Date(fechaISO).getTime();
  const min=Math.floor(diff/60000);
  if(min<1)return 'Hace instantes';
  if(min<60)return 'Hace '+min+' min';
  const hr=Math.floor(min/60);
  if(hr<24)return 'Hace '+hr+' h';
  const d=Math.floor(hr/24);
  if(d<7)return 'Hace '+d+' d';
  return new Date(fechaISO).toLocaleDateString('es-CO');
}

/* ============ INSUMOS ============ */
let editandoInsumoId=null;
let cadenaEdicion=[{unidad:'u',factor:1,formula:null}];
let tipoConversionEdicion='fijo';

async function renderInsumos(){
  const scrollActual=window.scrollY;
  /* Capturar scroll de TODOS los paneles scrolleados */
  const scrollsPaneles=[];
  document.querySelectorAll('.panel--scroll .panel-body-inner').forEach(function(el){
    if(el.scrollTop>0){
      const panel=el.closest('.panel');
      if(panel && panel.dataset.panelKey){
        scrollsPaneles.push({key:panel.dataset.panelKey, top:el.scrollTop});
      }
    }
  });
  const main=document.getElementById('mainContent');
  const insumos=await api('insumos?select=*&order=nombre');
  const cfg=getConfig();
  
  /* Filtro de inactivos */
  window._mostrarInactivosIns = window._mostrarInactivosIns || false;
  const insumosFiltrados = window._mostrarInactivosIns 
    ? insumos 
    : insumos.filter(i => i.estado_activo !== false);

  /* Filtro activo desde notificaciones */
  const filtroActivo=(_filtroModulo && _filtroModulo.tab==='insumos') ? _filtroModulo.filtro : null;
  const insumosView = filtroActivo
    ? insumosFiltrados.filter(function(i){return estadoInsumo(i)===filtroActivo;})
    : insumosFiltrados;
  const view=applySort(insumosView,'lista_insumos',{nombre:function(i){return i.nombre;},codigo:function(i){return i.codigo;},existencia:function(i){return i.existencia_actual;},costo:function(i){return i.costo_unitario||0;},valor:function(i){return(i.existencia_actual||0)*(i.costo_unitario||0);}});
  main.innerHTML=`
    <h2 class="page-title">Insumos</h2>
    <p class="page-sub">Cadena de conversiones: de unidad de compra a unidad de consumo.</p>
    <div class="panel">
      <div class="panel-header"><h3>Listado</h3><div class="panel-actions"><span class="badge info" style="font-size:11px;">${insumosView.length} ${insumosView.length===1?'insumo':'insumos'}</span><button class="secondary small" id="btnExportInsumos" title="Descargar CSV">${icono('download','sm')} Exportar CSV</button>${botonRefreshHTML('insumos')}<button class="btn-add require-write" id="btnNuevoInsumo" title="Crear insumo">+</button></div></div>
      <div class="search-box">
        <input id="buscar_insumos" placeholder="Buscar por nombre o código…">
        <label class="check-row" style="margin:0; white-space:nowrap;">
          <input type="checkbox" id="chk_inactivos_ins" ${window._mostrarInactivosIns?'checked':''}>
          <span style="font-size:12px;">Mostrar inactivos</span>
        </label>
      </div>
      ${filtroActivo?`<div class="filter-chip-bar"><span class="filter-chip">${filtroActivo==='Urgente'?icono('alert-circle','sm')+' Urgentes':icono('alert-triangle','sm')+' En reorden'} (${insumosView.length}) <button data-clear-filtro title="Quitar filtro">×</button></span></div>`:''}
      ${insumosView.length===0?(filtroActivo?'<div class="empty-state">No hay insumos con este filtro.</div>':'<div class="empty-state">No hay insumos todavía.</div>'):`
      <table id="tablaInsumos"><tr>
        ${thSort('Código','codigo','lista_insumos')}
        ${thSort('Nombre','nombre','lista_insumos')}
        <th class="col-hide-md">Cadena</th>
        ${thSort('Existencia','existencia','lista_insumos',true)}
        <th class="num">Reorden</th>
        ${thSort('Costo','costo','lista_insumos',true)}
        ${thSort('Valor','valor','lista_insumos',true).replace('<th', '<th class="col-hide-md"')}
        <th>Estado</th><th class="actions"></th>
      </tr>
        ${view.map(function(i){
          const isInactivo = i.estado_activo === false;
          const rowStyle = isInactivo ? 'opacity:0.5; background:var(--surface-2);' : '';
          const btnAccion = isInactivo 
            ? '<button class="success-btn small" data-toggle-insumo="'+i.id+'" data-estado="false" data-nombre="'+i.nombre+'">Activar</button>'
            : '<button class="ghost small" data-toggle-insumo="'+i.id+'" data-estado="true" data-nombre="'+i.nombre+'">Desactivar</button>';
            
          return `<tr style="${rowStyle}"><td class="mono">${i.codigo}</td><td>${i.nombre}${isInactivo?' <span class="badge neutral">Inactivo</span>':''}</td><td class="col-hide-md" style="font-size:11px;">${cadenaTexto(i)}</td><td class="num">${formatearExistencia(i)}</td><td class="num">${num(i.punto_reorden)} ${unidadConsumo(i)}</td><td class="num"><span class="costo-click" data-ajuste-costo="${i.id}" data-costo="${i.costo_unitario||0}" data-nombre="${String(i.nombre).replace(/"/g,'&quot;')}" title="Click para ajustar el costo">${money(i.costo_unitario)}</span></td><td class="num col-hide-md">${money((i.existencia_actual||0)*(i.costo_unitario||0))}</td><td>${badgeFor(estadoInsumo(i))}</td><td class="actions">
  <button class="ghost small icon-only" data-print-insumo="${i.id}" title="Imprimir etiquetas QR">${icono('tag')}</button>
  <button class="ghost small icon-only" data-detalle-insumo="${i.id}" title="Ver detalles">${icono('eye')}</button>
  <button class="${isInactivo?'success-btn':'ghost'} small icon-only" data-toggle-insumo="${i.id}" data-estado="${isInactivo?'false':'true'}" data-nombre="${i.nombre}" title="${isInactivo?'Activar':'Desactivar'}">${isInactivo?icono('check'):icono('eye-off')}</button>
  <button class="danger-btn small icon-only" data-del-insumo="${i.id}" data-del-nombre="${i.nombre}" title="Eliminar insumo">${icono('trash')}</button>
</td></tr>`;
        }).join('')}
      </table>`}
    </div>`;
  filtrarTabla('buscar_insumos','tablaInsumos');
  bindSortHeaders(renderInsumos);
  paginarTabla('tablaInsumos');
  const clearFiltro=document.querySelector('[data-clear-filtro]');
  if(clearFiltro){
    clearFiltro.addEventListener('click',function(){
      limpiarFiltroModulo();
      renderInsumos();
    });
  }
  /* Re-aplicar clases de scroll a los paneles re-renderizados */
  if(typeof prepararPaneles==='function') prepararPaneles();

  /* Restaurar posición de scroll si venimos de un guardado.
     Doble rAF asegura que el layout y las clases ya estén aplicadas. */
  if(window._preservarScroll){
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        window.scrollTo(0,scrollActual);
        scrollsPaneles.forEach(function(s){
          const panelNuevo=document.querySelector('.panel[data-panel-key="'+s.key+'"]');
          if(panelNuevo){
            const innerNuevo=panelNuevo.querySelector('.panel-body-inner');
            if(innerNuevo) innerNuevo.scrollTop=s.top;
          }
        });
      });
    });
    window._preservarScroll=false;
  }
  document.getElementById('chk_inactivos_ins').addEventListener('change', function(e) {
    window._mostrarInactivosIns = e.target.checked;
    renderInsumos();
  });

  document.querySelectorAll('[data-toggle-insumo]').forEach(function(btn){
    btn.addEventListener('click', async function(){
      const isActivo = btn.dataset.estado === 'true';
      if (await toggleEstadoItem('insumos', btn.dataset.toggleInsumo, isActivo, btn.dataset.nombre)) {
        renderInsumos();
      }
    });
  });

  document.getElementById('btnExportInsumos').addEventListener('click',function(){
    const headers=['Código','Nombre','Cadena','Unidad consumo','Existencia','Stock objetivo','Costo unitario','Valor stock','Estado'];
    const filas=view.map(function(i){
      return [
        i.codigo,
        i.nombre,
        getCadena(i).map(function(n){return n.unidad+'×'+n.factor;}).join('→'),
        unidadConsumo(i),
        fmtCSV(i.existencia_actual,4),
        fmtCSV(i.punto_reorden,4),
        fmtCSV(i.costo_unitario,2),
        fmtCSV((i.existencia_actual||0)*(i.costo_unitario||0),2),
        estadoInsumo(i)
      ];
    });
    exportarCSV('insumos',headers,filas);
  });
  document.getElementById('btnNuevoInsumo').addEventListener('click',function(){
    editandoInsumoId=null;
    abrirModalInsumo(null,insumos,cfg);
  });
  document.querySelectorAll('[data-detalle-insumo]').forEach(function(btn){
    btn.addEventListener('click',async function(){
      const ins=insumos.find(function(x){return x.id===btn.dataset.detalleInsumo;});
      if(ins) await abrirModalDetalleInsumo(ins,insumos,cfg);
    });
  });
  document.querySelectorAll('[data-print-insumo]').forEach(function(btn){
    btn.addEventListener('click',function(){
      const ins=insumos.find(function(x){return x.id===btn.dataset.printInsumo;});
      if(ins) abrirModalEtiquetas('insumo',ins);
    });
  });
  document.querySelectorAll('[data-del-insumo]').forEach(function(btn){
    btn.addEventListener('click',async function(){
      if(!await confirmarEliminar(btn.dataset.delNombre))return;
      try{await withLoading(btn,async function(){await rpc('eliminar_insumo',{p_id:btn.dataset.delInsumo});});toast('Insumo eliminado.','success');renderInsumos();}
      catch(e){toast(e.message,'error');}
    });
  });
}

function _htmlFormInsumo(insumo,cfg,numSug){
  return `
    <div class="form-grid" style="padding:0;">
      <div><label>Código</label><div class="codigo-compuesto"><span class="codigo-prefijo">${cfg.prefijoInsumo}</span><input id="ins_codigo_num" value="${numSug}" ${insumo?'disabled':''} autocomplete="off"></div><div class="field-validate" id="ins_codigo_status"></div></div>
      <div><label>Nombre</label><input id="ins_nombre" placeholder="Tela SMS" value="${insumo?insumo.nombre:''}"></div>
      <div><label>Existencia actual ${insumo?'<span style="color:var(--text-muted);font-weight:400;">(solo lectura)</span>':'<span style="color:var(--text-muted);font-weight:400;">(opcional)</span>'}</label><input id="ins_existencia" type="number" step="0.0001" value="${insumo?insumo.existencia_actual:''}" placeholder="0" ${insumo?'disabled title="Usa Entrada Mercancía o Auditoría para ajustar el stock"':''}></div>
      <div><label>Stock objetivo</label><input id="ins_reorden" type="number" step="0.0001" min="0.0001" value="${insumo?insumo.punto_reorden:''}" placeholder="Ej: 100" title="El sistema calcula los umbrales de urgente y reorden como % de este valor (configurable en Configuración)"></div>
      <div><label>Costo Und. (Unidad de consumo)</label><input id="ins_costo" type="number" step="0.01" min="0" value="${insumo?insumo.costo_unitario:0}"></div>
    </div>
    <div class="divider-label">Cadena de conversiones</div>
    <div class="conv-chain">
      <div id="convChainContainer"></div>
      <div style="display:flex;gap:8px;padding-top:6px;flex-wrap:wrap;">
        <button type="button" class="secondary small" id="btnAgregarNivelConv" title="Agregar nivel de conversión">+ Agregar nivel</button>
        <span style="font-size:11.5px;color:var(--text-muted);align-self:center;">Primera = compra · Última = consumo.</span>
      </div>
    </div>`;
}

async function abrirModalDetalleInsumo(ins,insumos,cfg){
  const cadena = (Array.isArray(ins.conversiones)&&ins.conversiones.length)
    ? ins.conversiones.map(function(n){return n.unidad+' × '+n.factor;}).join('  →  ')
    : (ins.unidad_medida||'—');
  const estado = estadoInsumo(ins);
  const valor = (ins.existencia_actual||0)*(ins.costo_unitario||0);

  /* Cargar lotes recibidos (async, no bloquea) */
  let lotesIns=[];
  try{
    lotesIns=await api('insumo_lotes?insumo_id=eq.'+ins.id+'&select=*,sys_proveedores(razon_social)&order=ultimo_ingreso.desc');
  }catch(e){ /* tabla puede no existir en instalaciones viejas */ }

  abrirModalGenerico({
    title: ins.nombre,
    subtitle: ins.codigo,
    icon: icono('box','lg'),
    variant: 'info',
    size: 'md',
    body:
      '<div class="det-section-title">Identificación</div>'
      +'<div class="det-grid">'
        +'<div><div class="det-lbl">Código</div><div class="det-val mono">'+ins.codigo+'</div></div>'
        +'<div><div class="det-lbl">Estado</div><div class="det-val">'+badgeFor(estado)+'</div></div>'
        +'<div><div class="det-lbl">Unidad de medida</div><div class="det-val">'+(ins.unidad_medida||'—')+'</div></div>'
        +'<div><div class="det-lbl">Unidad de consumo</div><div class="det-val">'+unidadConsumo(ins)+'</div></div>'
        +'<div class="full-span" style="grid-column:1/-1;"><div class="det-lbl">Cadena de conversiones</div><div class="det-val mono">'+cadena+'</div></div>'
        +'<div><div class="det-lbl">Tipo de conversión</div><div class="det-val">'+(ins.tipo_conversion||'fijo')+'</div></div>'
      +'</div>'
      +'<div class="det-section-title">Inventario y costo</div>'
      +'<div class="det-grid">'
        +'<div><div class="det-lbl">Existencia</div><div class="det-val">'+num(ins.existencia_actual)+' '+unidadConsumo(ins)+'</div></div>'
        +'<div><div class="det-lbl">Stock objetivo</div><div class="det-val">'+num(ins.punto_reorden)+' '+unidadConsumo(ins)+'</div></div>'
        +'<div><div class="det-lbl">Costo unitario</div><div class="det-val">'+money(ins.costo_unitario)+'</div></div>'
        +'<div><div class="det-lbl">Valor en stock</div><div class="det-val">'+money(valor)+'</div></div>'
      +'</div>'
      +'<div class="det-section-title">Lotes recibidos'+(lotesIns.length?' · '+lotesIns.length:'')+'</div>'
      +(lotesIns.length===0
        ? '<div class="det-val empty">Este insumo no tiene lotes registrados. Los lotes se crean automáticamente al recibir mercancía con lote del proveedor.</div>'
        : '<div style="overflow-x:auto;"><table class="print-table" style="margin:0;font-size:12px;">'
          +'<thead><tr>'
            +'<th>Lote</th>'
            +'<th class="num">Recibido</th>'
            +'<th>Proveedor</th>'
            +'<th>Último ingreso</th>'
          +'</tr></thead>'
          +'<tbody>'
          +lotesIns.map(function(l){
            return '<tr>'
              +'<td class="mono" style="font-weight:600;">'+l.lote+'</td>'
              +'<td class="num">'+num(l.cantidad_recibida)+' '+unidadConsumo(ins)+'</td>'
              +'<td>'+(l.sys_proveedores?l.sys_proveedores.razon_social:'—')+'</td>'
              +'<td class="mono" style="font-size:11px;color:var(--text-muted);">'+new Date(l.ultimo_ingreso).toLocaleDateString('es-CO')+'</td>'
              +'</tr>';
          }).join('')
          +'</tbody>'
          +'</table></div>'
          +'<div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.5;">'
          +'<b>Nota:</b> las cantidades mostradas son la <b>suma acumulada de todas las entradas</b> con ese lote. La trazabilidad exacta por consumo requiere FIFO (pendiente).'
          +'</div>'),
    footer: '<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button class="ghost" id="det_ins_cerrar">Cerrar</button><button class="require-write" id="det_ins_editar">'+icono('pencil','sm')+' Editar</button></div>',
    onOpen: function(){
      document.getElementById('det_ins_cerrar').addEventListener('click',cerrarModalGenerico);
      document.getElementById('det_ins_editar').addEventListener('click',function(){
        cerrarModalGenerico();
        setTimeout(function(){ abrirModalInsumo(ins.id,insumos,cfg); },260);
      });
    }
  });
}

function abrirModalDetalleSubproducto(sub,data,cfg){
  const rec=data.recetas.filter(function(r){return r.subproducto_id===sub.id;});
  const hij=data.hijos.filter(function(h){return h.subproducto_padre_id===sub.id;});
  const costo=data.costos.subCosto[sub.id]||0;
  const valor=(sub.existencia_actual||0)*costo;
  const recHTML=rec.length
    ? '<table class="print-table" style="margin:0;"><thead><tr><th>Insumo</th><th class="num">Cantidad</th><th>Unidad</th></tr></thead><tbody>'
      +rec.map(function(r){
        const ins=data.insumos.find(function(x){return x.id===r.insumo_id;});
        const u=r.unidad_receta||(ins?unidadConsumo(ins):'—');
        return '<tr><td>'+(ins?ins.nombre:'?')+'</td><td class="num">'+num(r.cantidad_por_unidad,4)+'</td><td>'+u+(r.factor_receta&&r.factor_receta!==1?' ×'+num(r.factor_receta,4):'')+'</td></tr>';
      }).join('')
      +'</tbody></table>'
    : '<div class="det-val empty">Sin receta definida.</div>';
  const hijosHTML=hij.length
    ? '<table class="print-table" style="margin:0;"><thead><tr><th>Subproducto</th><th class="num">Cantidad</th></tr></thead><tbody>'
      +hij.map(function(h){
        const hh=data.subproductos.find(function(x){return x.id===h.subproducto_hijo_id;});
        return '<tr><td>'+(hh?hh.nombre+' ('+hh.codigo+')':'?')+'</td><td class="num">'+num(h.cantidad_por_unidad,4)+'</td></tr>';
      }).join('')
      +'</tbody></table>'
    : '';
  abrirModalGenerico({
    title: sub.nombre,
    subtitle: sub.codigo+' · '+(sub.tipo||'ambos'),
    icon: icono('wrench','lg'),
    variant: 'info',
    size: 'md',
    body:
      '<div class="det-section-title">Identificación</div>'
      +'<div class="det-grid">'
        +'<div><div class="det-lbl">Código</div><div class="det-val mono">'+sub.codigo+'</div></div>'
        +'<div><div class="det-lbl">Tipo</div><div class="det-val">'+badgeTipoSub(sub.tipo||'ambos')+'</div></div>'
        +'<div><div class="det-lbl">Existencia</div><div class="det-val">'+num(sub.existencia_actual)+' u</div></div>'
        +'<div><div class="det-lbl">Estado</div><div class="det-val">'+badgeStockSub(sub)+'</div></div>'
      +'</div>'
      +'<div class="det-section-title">Valorización</div>'
      +'<div class="det-grid">'
        +'<div><div class="det-lbl">Costo unitario</div><div class="det-val">'+money(costo)+'</div></div>'
        +'<div><div class="det-lbl">Valor en stock</div><div class="det-val">'+money(valor)+'</div></div>'
      +'</div>'
      +'<div class="det-section-title">Composición · Insumos</div>'
      +recHTML
      +(hijosHTML?'<div class="det-section-title">Composición · Subproductos hijos</div>'+hijosHTML:''),
    footer: '<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button class="ghost" id="det_sub_cerrar">Cerrar</button><button class="require-write" id="det_sub_editar">'+icono('pencil','sm')+' Editar</button></div>',
    onOpen: function(){
      document.getElementById('det_sub_cerrar').addEventListener('click',cerrarModalGenerico);
      document.getElementById('det_sub_editar').addEventListener('click',function(){
        cerrarModalGenerico();
        setTimeout(function(){ abrirModalSubproducto(sub.id,data,cfg); },260);
      });
    }
  });
}

function abrirModalDetallePaquete(prod,data,cfg){
  const costo=data.costos.paqCosto[prod.codigo_pt]||0;
  const pc=prod.unidades_por_caja||1;
  const ex=Number(prod.existencia_actual)||0;
  const comp=data.paqueteSubs.filter(function(x){return x.codigo_pt===prod.codigo_pt;});
  const bom=data.bom.filter(function(x){return x.codigo_pt===prod.codigo_pt;});
  const precio=prod.precio_venta;
  const margen=precio!=null&&precio>0?precio-costo:null;
  const compHTML=comp.length
    ? '<table class="print-table" style="margin:0;"><thead><tr><th>Subproducto</th><th class="num">Cantidad / u</th></tr></thead><tbody>'
      +comp.map(function(c){
        const s=data.subproductos.find(function(x){return x.id===c.subproducto_id;});
        return '<tr><td>'+(s?s.nombre+' ('+s.codigo+')':'?')+'</td><td class="num">'+num(c.cantidad,4)+'</td></tr>';
      }).join('')
      +'</tbody></table>'
    : '<div class="det-val empty">Sin subproductos.</div>';
  const bomHTML=bom.length
    ? '<table class="print-table" style="margin:0;"><thead><tr><th>Insumo</th><th class="num">Cantidad / u</th></tr></thead><tbody>'
      +bom.map(function(b){
        const ins=data.insumos.find(function(x){return x.id===b.insumo_id;});
        return '<tr><td>'+(ins?ins.nombre:'?')+'</td><td class="num">'+num(b.cantidad_por_unidad,4)+' '+(ins?unidadConsumo(ins):'')+'</td></tr>';
      }).join('')
      +'</tbody></table>'
    : '';
  abrirModalGenerico({
    title: prod.nombre,
    subtitle: prod.codigo_pt,
    icon: icono('package','lg'),
    variant: 'info',
    size: 'md',
    body:
      '<div class="det-section-title">Identificación</div>'
      +'<div class="det-grid">'
        +'<div><div class="det-lbl">Código PT</div><div class="det-val mono">'+prod.codigo_pt+'</div></div>'
        +'<div><div class="det-lbl">Unidades por caja</div><div class="det-val">'+pc+'</div></div>'
        +'<div><div class="det-lbl">Existencia</div><div class="det-val">'+num(ex)+' u</div></div>'
        +'<div><div class="det-lbl">Estado</div><div class="det-val">'+badgeStockPT(prod)+'</div></div>'
      +'</div>'
      +'<div class="det-section-title">Comercial y valorización</div>'
      +'<div class="det-grid">'
        +'<div><div class="det-lbl">Precio de venta</div><div class="det-val">'+(precio!=null?money(precio):'<span class="empty">Sin precio</span>')+'</div></div>'
        +'<div><div class="det-lbl">Costo unitario</div><div class="det-val">'+money(costo)+'</div></div>'
        +'<div><div class="det-lbl">Costo por caja</div><div class="det-val">'+money(costo*pc)+'</div></div>'
        +'<div><div class="det-lbl">Margen unitario</div><div class="det-val">'+(margen!=null?money(margen):'<span class="empty">—</span>')+'</div></div>'
      +'</div>'
      +'<div class="det-section-title">Composición · Subproductos</div>'
      +compHTML
      +(bomHTML?'<div class="det-section-title">Composición · Insumos directos</div>'+bomHTML:''),
    footer: '<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button class="ghost" id="det_paq_cerrar">Cerrar</button><button class="require-write" id="det_paq_editar">'+icono('pencil','sm')+' Editar</button></div>',
    onOpen: function(){
      document.getElementById('det_paq_cerrar').addEventListener('click',cerrarModalGenerico);
      document.getElementById('det_paq_editar').addEventListener('click',function(){
        cerrarModalGenerico();
        setTimeout(function(){ abrirModalPaquete(prod.codigo_pt,data,cfg); },260);
      });
    }
  });
}

async function abrirModalInsumo(insumoId,insumos,cfg,onSaveCallback){
  const insumo=insumoId?insumos.find(function(i){return i.id===insumoId;}):null;
  if(insumoId&&!insumo){toast('Insumo no encontrado.','error');return;}

  /* Preparar estado de edición */
  if(insumo){
    cadenaEdicion=(Array.isArray(insumo.conversiones)&&insumo.conversiones.length)?JSON.parse(JSON.stringify(insumo.conversiones)):[{unidad:insumo.unidad_medida||'u',factor:1,formula:null}];
    tipoConversionEdicion=insumo.tipo_conversion||'fijo';
  } else {
    cadenaEdicion=[{unidad:cfg.unidades[0]||'u',factor:1,formula:null}];
    tipoConversionEdicion='fijo';
  }

  /* Código sugerido (4 dígitos, calculado localmente desde el rango existente) */
  let numSug;
  if(insumo){
    numSug=insumo.codigo.replace(cfg.prefijoInsumo,'');
  } else {
    numSug=siguienteCodigoDeRango(insumos, function(i){return i.codigo;}, cfg.prefijoInsumo);
  }

  abrirModalGenerico({
    title: insumo?'Editar insumo':'Nuevo insumo',
    subtitle: 'Cadena de conversiones: de unidad de compra a unidad de consumo.',
    icon: icono(insumo?'pencil':'plus','lg'),
    variant: 'info',
    size: 'md',
    body: _htmlFormInsumo(insumo,cfg,numSug),
    footer: '<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button class="ghost" id="ins_cancelar">Cancelar</button><button id="ins_guardar">'+(insumo?'Guardar cambios':'Crear insumo')+'</button></div>',
    onOpen: function(){
      renderCadenaEditor();

      /* Código sugerido: auto-select + validación en vivo */
      const inputCod=document.getElementById('ins_codigo_num');
      const statusCod=document.getElementById('ins_codigo_status');
      if(inputCod && !insumo){
        bindAutoSelect(inputCod);
        inputCod.addEventListener('input',debounce(function(){
          validarDisponibilidadCodigo(inputCod,statusCod,'insumos','codigo',cfg.prefijoInsumo);
        },400));
      }

      document.getElementById('btnAgregarNivelConv').addEventListener('click',function(){
        sincronizarCadenaDesdeDOM();
        if(cadenaEdicion.length>=1){const u=cadenaEdicion[cadenaEdicion.length-1];if(!u.factor||u.factor<=0)u.factor=1;}
        cadenaEdicion.push({unidad:'',factor:1,formula:null});
        renderCadenaEditor();
      });

      document.getElementById('ins_cancelar').addEventListener('click',cerrarModalGenerico);

      document.getElementById('ins_guardar').addEventListener('click',async function(ev){
        sincronizarCadenaDesdeDOM();
        const cAct=getConfig();
        const pr=parseFloat(document.getElementById('ins_reorden').value);
        if(!pr||pr<=0){toast('Punto de reorden obligatorio y mayor a cero.','error');return false;}
        if(cadenaEdicion.length===0||!cadenaEdicion[0].unidad){toast('Define al menos la unidad de compra.','error');return false;}
        for(let i=0;i<cadenaEdicion.length;i++){
          const n=cadenaEdicion[i];
          if(!n.unidad){toast('Nivel '+(i+1)+': falta unidad.','error');return;}
          if(i<cadenaEdicion.length-1&&(!n.factor||n.factor<=0)){toast('Nivel '+(i+1)+': el factor debe ser > 0.','error');return;}
        }
        const esVar=tipoConversionEdicion==='variable';
        const tieneDim=cadenaEdicion.some(function(n){return n.formula&&n.formula.ancho&&n.formula.largo;});
        const tipo=esVar?'variable':(tieneDim?'dimensional':'fijo');
                const body={
          nombre:document.getElementById('ins_nombre').value.trim(),
          unidad_medida:cadenaEdicion[0].unidad,
          unidad_consumo:cadenaEdicion.length>1?cadenaEdicion[cadenaEdicion.length-1].unidad:null,
          factor_conversion:cadenaEdicion.length>1?factorTotal({conversiones:cadenaEdicion}):null,
          punto_reorden:pr,
          costo_unitario:parseFloat(document.getElementById('ins_costo').value)||0,
          conversiones:cadenaEdicion,
          tipo_conversion:tipo
        };
        
        /* Solo enviamos la existencia si es un insumo nuevo */
        if(!insumo) body.existencia_actual = parseFloat(document.getElementById('ins_existencia').value)||0;
        
        if(!body.nombre){toast('Completa el nombre.','error');return false;}
        try{
          await withLoading(ev.currentTarget,async function(){
            if(insumo){
              await api('insumos?id=eq.'+insumo.id,{method:'PATCH',body:JSON.stringify(body)});
            }else{
              const numManual=(document.getElementById('ins_codigo_num').value||'').trim();
              if(numManual){
                let limpio=numManual;
                if(limpio.indexOf(cAct.prefijoInsumo)===0){limpio=limpio.slice(cAct.prefijoInsumo.length);}
                if(!limpio){toast('El código no puede estar vacío.','error');return false;}
                body.codigo=cAct.prefijoInsumo+limpio;
              }else{
                let n2;try{n2=await rpc('siguiente_codigo',{p_prefijo:cAct.prefijoInsumo,p_tabla:'insumos'});}catch(e){n2=siguienteCodigoLocal(cAct.prefijoInsumo,insumos);}
                body.codigo=cAct.prefijoInsumo+n2;
              }
              await api('insumos',{method:'POST',body:JSON.stringify(body)});
            }
          });
          toast(insumo?'Insumo actualizado.':'Insumo creado.','success');
          
          if (onSaveCallback) {
            const nuevos = await api('insumos?order=nombre');
            const item = nuevos.find(x => x.codigo === body.codigo);
            onSaveCallback(item);
            cerrarModalGenerico();
          } else {
            cerrarModalGenerico();
            window._preservarScroll=true;
            renderInsumos();
          }
        }catch(e){toast('Error: '+traducirError(e.message),'error');}
      });
    }
  });
}

function renderCadenaEditor(){
  const cont=document.getElementById('convChainContainer');if(!cont)return;
  const cfg=getConfig();
  cont.innerHTML=cadenaEdicion.map(function(nivel,idx){
    const ult=idx===cadenaEdicion.length-1;
    const pri=idx===0;
    let row='<div class="conv-level"><span class="conv-arrow">'+(pri?'📦':'↳')+'</span><select data-conv-unidad="'+idx+'"><option value="">— unidad —</option>'+cfg.unidades.map(function(u){return '<option value="'+u+'" '+(nivel.unidad===u?'selected':'')+'>'+u+'</option>';}).join('')+'</select>';
    if(pri)row+='<span class="conv-tag">compra</span>';
    row+=ult?'<span class="conv-final">← consumo (existencia aquí)</span>':'';
    if(!ult){
      row+='<span class="conv-arrow">×</span><input type="number" step="0.0001" min="0" data-conv-factor="'+idx+'" value="'+(nivel.factor||'')+'" placeholder="factor"><label class="conv-check"><input type="checkbox" data-conv-formula-toggle="'+idx+'" '+(nivel.formula?'checked':'')+'> dimensional</label>';
      if(cadenaEdicion.length>1)row+='<button type="button" class="ghost small" data-remove-conv="'+idx+'" title="Quitar nivel">×</button>';
    }
    row+='</div>';
    if(nivel.formula){
      const f=nivel.formula;
      const calc=(f.ancho&&f.largo)?(f.ancho*f.largo):null;
      row+='<div class="conv-formula">Ancho <input type="number" step="0.001" data-conv-ancho="'+idx+'" value="'+(f.ancho||'')+'" placeholder="2.17"> m × Largo <input type="number" step="0.001" data-conv-largo="'+idx+'" value="'+(f.largo||'')+'" placeholder="200"> m = <span class="mono" data-conv-resultado="'+idx+'">'+(calc?num(calc,4):'—')+'</span></div>';
    }
    return row;
  }).join('')+'<div class="conv-level"><label class="conv-check" style="font-size:12.5px;"><input type="checkbox" id="conv_variable" '+(tipoConversionEdicion==='variable'?'checked':'')+'><span>Rendimiento <strong>variable</strong> por lote (kg → unidades).</span></label></div>';
  bindCadena();
}
function bindCadena(){
  document.querySelectorAll('[data-conv-unidad]').forEach(function(el){el.addEventListener('change',function(){cadenaEdicion[+el.dataset.convUnidad].unidad=el.value;});});
  document.querySelectorAll('[data-conv-factor]').forEach(function(el){el.addEventListener('input',function(){cadenaEdicion[+el.dataset.convFactor].factor=parseFloat(el.value)||0;});});
  document.querySelectorAll('[data-conv-formula-toggle]').forEach(function(el){
    el.addEventListener('change',function(){
      const idx=+el.dataset.convFormulaToggle;
      cadenaEdicion[idx].formula=el.checked?{ancho:null,largo:null}:null;
      renderCadenaEditor();
    });
  });
  document.querySelectorAll('[data-conv-ancho], [data-conv-largo]').forEach(function(el){
    el.addEventListener('input',function(){
      const isA=el.hasAttribute('data-conv-ancho');
      const idx=parseInt(isA?el.dataset.convAncho:el.dataset.convLargo,10);
      const campo=isA?'ancho':'largo';
      if(!cadenaEdicion[idx].formula)cadenaEdicion[idx].formula={ancho:null,largo:null};
      cadenaEdicion[idx].formula[campo]=parseFloat(el.value)||null;
      const f=cadenaEdicion[idx].formula;
      if(f.ancho&&f.largo){
        const c=f.ancho*f.largo;cadenaEdicion[idx].factor=c;
        const r=document.querySelector('[data-conv-resultado="'+idx+'"]');if(r)r.textContent=num(c,4);
        const fa=document.querySelector('[data-conv-factor="'+idx+'"]');if(fa)fa.value=c;
      }
    });
  });
  document.querySelectorAll('[data-remove-conv]').forEach(function(el){
    el.addEventListener('click',function(){sincronizarCadenaDesdeDOM();cadenaEdicion.splice(+el.dataset.removeConv,1);renderCadenaEditor();});
  });
  const v=document.getElementById('conv_variable');
  if(v)v.addEventListener('change',function(){tipoConversionEdicion=v.checked?'variable':'fijo';});
}
function sincronizarCadenaDesdeDOM(){
  cadenaEdicion=cadenaEdicion.map(function(n,idx){
    const sel=document.querySelector('[data-conv-unidad="'+idx+'"]');
    const fac=document.querySelector('[data-conv-factor="'+idx+'"]');
    const an=document.querySelector('[data-conv-ancho="'+idx+'"]');
    const la=document.querySelector('[data-conv-largo="'+idx+'"]');
    const out=Object.assign({},n);
    if(sel)out.unidad=sel.value;
    if(fac)out.factor=parseFloat(fac.value)||0;
    if(out.formula){
      out.formula={ancho:an?parseFloat(an.value)||null:(out.formula.ancho||null),largo:la?parseFloat(la.value)||null:(out.formula.largo||null)};
      if(out.formula.ancho&&out.formula.largo)out.factor=out.formula.ancho*out.formula.largo;
    }
    return out;
  });
}

/* ============ PRODUCTOS & BOM ============ */
let editandoSubproductoId=null;
let editandoProductoCodigo=null;
let filasSubproducto=[{subproducto_id:'',cantidad:''}];
let filasInsumoBom=[{insumo_id:'',cantidad:''}];
let filasInsumoSub=[{insumo_id:'',cantidad:'',conversion:false,unidad_receta:'',factor_receta:1}];
let filasSubproductoHijo=[{subproducto_id:'',cantidad:''}];
let tipoSubEdicion='ambos';

async function renderProductos(){
  const scrollActual=window.scrollY;
  /* Capturar scroll de TODOS los paneles scrolleados */
  const scrollsPaneles=[];
  document.querySelectorAll('.panel--scroll .panel-body-inner').forEach(function(el){
    if(el.scrollTop>0){
      const panel=el.closest('.panel');
      if(panel && panel.dataset.panelKey){
        scrollsPaneles.push({key:panel.dataset.panelKey, top:el.scrollTop});
      }
    }
  });
  const main=document.getElementById('mainContent');
  const cfg=getConfig();
  const data=await loadAllProductosData();
  const subproductos=data.subproductos,productos=data.productos,insumos=data.insumos;

  window._mostrarInactivosProd = window._mostrarInactivosProd || false;
  const subsFiltrados = window._mostrarInactivosProd ? subproductos : subproductos.filter(s => s.estado_activo !== false);
  const prodsFiltrados = window._mostrarInactivosProd ? productos : productos.filter(p => p.estado_activo !== false);

  const subsView=applySort(subsFiltrados,'lista_subs',{nombre:function(s){return s.nombre;},codigo:function(s){return s.codigo;},tipo:function(s){return s.tipo||'';},existencia:function(s){return s.existencia_actual;},costo:function(s){return data.costos.subCosto[s.id]||0;}});
  const prodsView=applySort(prodsFiltrados,'lista_prods',{nombre:function(p){return p.nombre;},codigo:function(p){return p.codigo_pt;},costo:function(p){return data.costos.paqCosto[p.codigo_pt]||0;}});

  main.innerHTML=`
    <h2 class="page-title">Productos &amp; BOM</h2>
    <p class="page-sub">Insumos → Subproductos → Paquetes (PT). Los subproductos pueden contener otros subproductos.</p>

    <div class="panel force-expanded no-scroll">
      <div class="panel-header"><h3>Crear nuevo</h3></div>
      <div class="form-actions" style="padding:14px 18px;gap:10px;">
        <button class="require-write" id="btnNuevoSubproducto" title="Crear nuevo subproducto">+ Nuevo subproducto</button>
        <button class="require-write" id="btnNuevoPT" title="Crear nuevo paquete (PT)">+ Nuevo paquete (PT)</button>
      </div>
    </div>

    <div class="panel force-collapsed">
      <div class="panel-header"><h3>Subproductos existentes</h3><div class="panel-actions"><span class="badge info" style="font-size:11px;">${subsFiltrados.length} ${subsFiltrados.length===1?'subproducto':'subproductos'}</span><button class="secondary small" id="btnExportSubs" title="Descargar CSV">${icono('download','sm')} Exportar CSV</button></div></div>
      <div class="search-box">
        <input id="buscar_subproductos" placeholder="Buscar subproducto…">
        <label class="check-row" style="margin:0; white-space:nowrap;">
          <input type="checkbox" id="chk_inactivos_prod" ${window._mostrarInactivosProd?'checked':''}>
          <span style="font-size:12px;">Mostrar inactivos</span>
        </label>
      </div>
      ${subsFiltrados.length===0?'<div class="empty-state">No hay subproductos activos.</div>':subsView.map(function(s){
        const costo=data.costos.subCosto[s.id]||0;
        const valor=(s.existencia_actual||0)*costo;
        const isInactivo = s.estado_activo === false;
        const rowStyle = isInactivo ? 'opacity:0.5;' : '';
        const btnAccion = isInactivo 
            ? '<button class="success-btn small" data-toggle-sub="'+s.id+'" data-estado="false" data-nombre="'+s.nombre+'">Activar</button>'
            : '<button class="ghost small" data-toggle-sub="'+s.id+'" data-estado="true" data-nombre="'+s.nombre+'">Desactivar</button>';
            
        return '<div class="list-item" style="'+rowStyle+'" id="subRow_'+s.id+'"><div class="list-item-head"><div><strong>'+s.nombre+' <span class="mono" style="color:var(--text-muted);font-size:11.5px;">'+s.codigo+'</span></strong> '+(isInactivo?'<span class="badge neutral">Inactivo</span>':'')+' '+badgeStockSub(s)+' '+badgeTipoSub(s.tipo||'ambos')+'</div><div class="item-actions"><button class="ghost small icon-only" data-detalle-sub="'+s.id+'" title="Ver detalles">'+icono('eye')+'</button><button class="'+(isInactivo?'success-btn':'ghost')+' small icon-only" data-toggle-sub="'+s.id+'" data-estado="'+(isInactivo?'false':'true')+'" data-nombre="'+s.nombre+'" title="'+(isInactivo?'Activar':'Desactivar')+'">'+(isInactivo?icono('check'):icono('eye-off'))+'</button><button class="danger-btn small icon-only" data-del-sub="'+s.id+'" data-del-nombre="'+s.nombre+'" title="Eliminar subproducto">'+icono('trash')+'</button></div></div><div class="list-item-meta"><span>Existencia: <b>'+num(s.existencia_actual)+'</b></span><span class="cost">Costo u.: '+money(costo)+'</span><span class="valor">Valor: '+money(valor)+'</span></div><div class="composicion-list"></div></div>';
      }).join('')}
    </div>

    <div class="panel force-collapsed">
      <div class="panel-header"><h3>Paquetes existentes</h3><div class="panel-actions"><span class="badge info" style="font-size:11px;">${productos.length} ${productos.length===1?'paquete':'paquetes'}</span><button class="secondary small" id="btnExportPaq" title="Descargar CSV">${icono('download','sm')} Exportar CSV</button></div></div>
      <div class="search-box"><input id="buscar_paquetes" placeholder="Buscar paquete…"></div>
      ${prodsFiltrados.length===0?'<div class="empty-state">No hay paquetes activos.</div>':prodsView.map(function(p){
        const costo=data.costos.paqCosto[p.codigo_pt]||0;
        const pc=p.unidades_por_caja||1;
        const ex=Number(p.existencia_actual)||0;
        const precio=p.precio_venta;
        const margen=precio!=null&&precio>0?precio-costo:null;
        const margenPct=margen!=null&&precio>0?(margen/precio*100):null;
        const precioTxt=precio!=null?'<span style="color:var(--info);font-family:\'IBM Plex Mono\',monospace;font-size:14px;font-weight:600;">Precio: '+money(precio)+'</span>':'<span style="color:var(--text-muted);font-size:12px;">Sin precio</span>';
        const margenTxt=margen!=null?'<span style="color:'+(margen>=0?'var(--success)':'var(--danger)')+';font-family:\'IBM Plex Mono\',monospace;font-size:14px;font-weight:600;">Margen: '+money(margen)+' ('+num(margenPct,1)+'%)</span>':'';
        const isInactivo = p.estado_activo === false;
        const rowStyle = isInactivo ? 'opacity:0.5;' : '';
        const btnAccion = isInactivo 
            ? '<button class="success-btn small" data-toggle-prod="'+p.codigo_pt+'" data-estado="false" data-nombre="'+p.nombre+'">Activar</button>'
            : '<button class="ghost small" data-toggle-prod="'+p.codigo_pt+'" data-estado="true" data-nombre="'+p.nombre+'">Desactivar</button>';
            
        return '<div class="list-item" style="'+rowStyle+'" id="prodRow_'+p.codigo_pt+'"><div class="list-item-head"><div><strong>'+p.nombre+' <span class="mono" style="color:var(--text-muted);font-size:11.5px;">'+p.codigo_pt+'</span> <span class="badge info">caja ×'+pc+'</span></strong> '+(isInactivo?'<span class="badge neutral">Inactivo</span>':'')+' '+badgeStockPT(p)+'</div><div class="item-actions">'+
  '<button class="ghost small icon-only" data-print-prod="'+p.codigo_pt+'" title="Imprimir etiquetas QR">'+icono('tag')+'</button>'+
  '<button class="ghost small icon-only" data-detalle-prod="'+p.codigo_pt+'" title="Ver detalles">'+icono('eye')+'</button>'+
  '<button class="'+(isInactivo?'success-btn':'ghost')+' small icon-only" data-toggle-prod="'+p.codigo_pt+'" data-estado="'+(isInactivo?'false':'true')+'" data-nombre="'+p.nombre+'" title="'+(isInactivo?'Activar':'Desactivar')+'">'+(isInactivo?icono('check'):icono('eye-off'))+'</button>'+
  '<button class="danger-btn small icon-only" data-del-prod="'+p.codigo_pt+'" data-del-nombre="'+p.nombre+'" title="Eliminar paquete">'+icono('trash')+'</button>'+
'</div></div><div class="list-item-meta"><span>Existencia: <b>'+num(ex)+'</b></span><span class="cost">Costo u.: '+money(costo)+'</span><span class="valor">Costo caja: '+money(costo*pc)+'</span>'+precioTxt+margenTxt+'</div><div class="composicion-list"></div></div>';
      }).join('')}
    </div>`;

  filtrarDivs('buscar_subproductos','subRow_');
  filtrarDivs('buscar_paquetes','prodRow_');
  bindSortHeaders(renderProductos);

  /* Botones "+" para crear */
  document.getElementById('btnNuevoSubproducto').addEventListener('click',function(){
    abrirModalSubproducto(null,data,cfg);
  });
  document.getElementById('btnNuevoPT').addEventListener('click',function(){
    abrirModalPaquete(null,data,cfg);
  });

  /* Exportaciones CSV */
  document.getElementById('chk_inactivos_prod').addEventListener('change', function(e) {
    window._mostrarInactivosProd = e.target.checked;
    renderProductos();
  });

  document.querySelectorAll('[data-toggle-sub]').forEach(function(btn){
    btn.addEventListener('click', async function(){
      const isActivo = btn.dataset.estado === 'true';
      if (await toggleEstadoItem('subproductos', btn.dataset.toggleSub, isActivo, btn.dataset.nombre)) {
        renderProductos();
      }
    });
  });

  document.querySelectorAll('[data-toggle-prod]').forEach(function(btn){
    btn.addEventListener('click', async function(){
      const isActivo = btn.dataset.estado === 'true';
      if (await toggleEstadoItem('productos_terminados', btn.dataset.toggleProd, isActivo, btn.dataset.nombre)) {
        renderProductos();
      }
    });
  });

  document.getElementById('btnExportSubs').addEventListener('click',function(){
    const headers=['Código','Nombre','Tipo','Existencia','Costo unitario','Valor stock','Insumos (receta)','Subproductos hijos'];
    const filasCSV=subsView.map(function(s){
      const costo=data.costos.subCosto[s.id]||0;
      const valor=(s.existencia_actual||0)*costo;
      const rec=data.recetas.filter(function(r){return r.subproducto_id===s.id;});
      const hij=data.hijos.filter(function(h){return h.subproducto_padre_id===s.id;});
      const recTxt=rec.map(function(r){
        const ins=insumos.find(function(x){return x.id===r.insumo_id;});
        const n=ins?ins.nombre:'?';
        const u=r.unidad_receta||(ins?unidadConsumo(ins):'');
        const f=r.factor_receta&&r.factor_receta!==1?' ×'+r.factor_receta:'';
        return n+' ('+r.cantidad_por_unidad+' '+u+f+')';
      }).join(' | ');
      const hijTxt=hij.map(function(h){
        const hh=subproductos.find(function(x){return x.id===h.subproducto_hijo_id;});
        return (hh?hh.nombre:'?')+' ('+h.cantidad_por_unidad+')';
      }).join(' | ');
      return [
        s.codigo,
        s.nombre,
        s.tipo||'ambos',
        fmtCSV(s.existencia_actual,4),
        fmtCSV(costo,2),
        fmtCSV(valor,2),
        recTxt,
        hijTxt
      ];
    });
    exportarCSV('subproductos',headers,filasCSV);
  });

  document.getElementById('btnExportPaq').addEventListener('click',function(){
    const headers=['Código PT','Nombre','Unidades/caja','Existencia (u)','Cajas aprox.','Costo unitario','Costo por caja','Valor stock','Subproductos','Insumos directos'];
    const filasCSV=prodsView.map(function(p){
      const costo=data.costos.paqCosto[p.codigo_pt]||0;
      const pc=p.unidades_por_caja||1;
      const ex=Number(p.existencia_actual)||0;
      const cajas=ex>0&&pc>1?Math.floor(ex/pc):'';
      const comp=data.paqueteSubs.filter(function(x){return x.codigo_pt===p.codigo_pt;});
      const bom=data.bom.filter(function(x){return x.codigo_pt===p.codigo_pt;});
      const compTxt=comp.map(function(c){
        const s=subproductos.find(function(x){return x.id===c.subproducto_id;});
        return (s?s.nombre:'?')+' ('+c.cantidad+')';
      }).join(' | ');
      const bomTxt=bom.map(function(b){
        const ins=insumos.find(function(x){return x.id===b.insumo_id;});
        return (ins?ins.nombre:'?')+' ('+b.cantidad_por_unidad+' '+(ins?unidadConsumo(ins):'')+')';
      }).join(' | ');
      return [
        p.codigo_pt,
        p.nombre,
        pc,
        fmtCSV(ex,4),
        cajas,
        fmtCSV(costo,2),
        fmtCSV(costo*pc,2),
        fmtCSV(ex*costo,2),
        compTxt,
        bomTxt
      ];
    });
    exportarCSV('paquetes',headers,filasCSV);
  });

  /* Editar / eliminar subproductos */
  document.querySelectorAll('[data-detalle-sub]').forEach(function(btn){
    btn.addEventListener('click',function(){
      const s=data.subproductos.find(function(x){return x.id===btn.dataset.detalleSub;});
      if(s) abrirModalDetalleSubproducto(s,data,cfg);
    });
  });
  document.querySelectorAll('[data-del-sub]').forEach(function(btn){
    btn.addEventListener('click',async function(){
      if(!await confirmarEliminar(btn.dataset.delNombre))return;
      try{await withLoading(btn,async function(){await api('subproductos?id=eq.'+btn.dataset.delSub,{method:'DELETE'});});toast('Subproducto eliminado.','success');renderProductos();}
      catch(e){toast('No se pudo eliminar: '+traducirError(e.message),'error');}
    });
  });
  document.querySelectorAll('[data-detalle-prod]').forEach(function(btn){
    btn.addEventListener('click',function(){
      const p=data.productos.find(function(x){return x.codigo_pt===btn.dataset.detalleProd;});
      if(p) abrirModalDetallePaquete(p,data,cfg);
    });
  });
  document.querySelectorAll('[data-print-prod]').forEach(function(btn){
    btn.addEventListener('click',function(){
      const p=productos.find(function(x){return x.codigo_pt===btn.dataset.printProd;});
      if(p) abrirModalEtiquetas('pt',p,data);
    });
  });
  document.querySelectorAll('[data-del-prod]').forEach(function(btn){
    btn.addEventListener('click',async function(){
      if(!await confirmarEliminar(btn.dataset.delNombre))return;
      try{await withLoading(btn,async function(){await api('productos_terminados?codigo_pt=eq.'+encodeURIComponent(btn.dataset.delProd),{method:'DELETE'});});toast('Paquete eliminado.','success');renderProductos();}
      catch(e){toast('No se pudo eliminar: '+traducirError(e.message),'error');}
    });
  });

  /* Composición visible en cada list-item */
  subsView.forEach(function(s){
    const cont=document.getElementById('subRow_'+s.id);if(!cont)return;
    const rec=data.recetas.filter(function(r){return r.subproducto_id===s.id;});
    const hij=data.hijos.filter(function(h){return h.subproducto_padre_id===s.id;});
    const compHtml=(rec.length?'<em>Insumos:</em> '+rec.map(function(r){
      const ins=insumos.find(function(x){return x.id===r.insumo_id;});
      const nombre=ins?ins.nombre:'?';
      const u=r.unidad_receta||(ins?unidadConsumo(ins):'');
      return nombre+' ('+num(r.cantidad_por_unidad,4)+' '+u+(r.factor_receta&&r.factor_receta!==1?' ×'+num(r.factor_receta,4):'')+')';
    }).join(', ')+'<br>':'')+(hij.length?'<em>Subproductos:</em> '+hij.map(function(h){
      const hh=subproductos.find(function(x){return x.id===h.subproducto_hijo_id;});
      return (hh?hh.nombre:'?')+' ('+num(h.cantidad_por_unidad,4)+')';
    }).join(', '):'');
    cont.querySelector('.composicion-list').innerHTML=compHtml||'<span style="color:var(--text-muted);">Sin composición definida.</span>';
  });
  prodsView.forEach(function(p){
    const cont=document.getElementById('prodRow_'+p.codigo_pt);if(!cont)return;
    const comp=data.paqueteSubs.filter(function(x){return x.codigo_pt===p.codigo_pt;});
    const bom=data.bom.filter(function(x){return x.codigo_pt===p.codigo_pt;});
    const html=(comp.length?'<em>Subproductos:</em> '+comp.map(function(c){
      const s=subproductos.find(function(x){return x.id===c.subproducto_id;});
      return (s?s.nombre:'?')+' ('+num(c.cantidad,4)+')';
    }).join(', ')+'<br>':'')+(bom.length?'<em>Insumos directos:</em> '+bom.map(function(b){
      const ins=insumos.find(function(x){return x.id===b.insumo_id;});
      return (ins?ins.nombre:'?')+' ('+num(b.cantidad_por_unidad,4)+' '+(ins?unidadConsumo(ins):'')+')';
    }).join(', '):'');
    cont.querySelector('.composicion-list').innerHTML=html||'<span style="color:var(--text-muted);">Sin composición definida.</span>';
  });

  /* Re-aplicar clases de scroll a los paneles re-renderizados */
  if(typeof prepararPaneles==='function') prepararPaneles();

  /* Restaurar posición de scroll si venimos de un guardado.
     Doble rAF asegura que el layout y las clases ya estén aplicadas. */
  if(window._preservarScroll){
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        window.scrollTo(0,scrollActual);
        scrollsPaneles.forEach(function(s){
          const panelNuevo=document.querySelector('.panel[data-panel-key="'+s.key+'"]');
          if(panelNuevo){
            const innerNuevo=panelNuevo.querySelector('.panel-body-inner');
            if(innerNuevo) innerNuevo.scrollTop=s.top;
          }
        });
      });
    });
    window._preservarScroll=false;
  }
}

function sincronizarSub(){filasSubproducto=filasSubproducto.map(function(_,idx){return {subproducto_id:getComboValue('subprod_sel_'+idx),cantidad:document.getElementById('subprod_cant_'+idx)?document.getElementById('subprod_cant_'+idx).value:''};});}
function sincronizarInsBom(){filasInsumoBom=filasInsumoBom.map(function(_,idx){return {insumo_id:getComboValue('insbom_sel_'+idx),cantidad:document.getElementById('insbom_cant_'+idx)?document.getElementById('insbom_cant_'+idx).value:''};});}
function sincronizarInsumoSub(){
  filasInsumoSub=filasInsumoSub.map(function(_,idx){
    const convEl=document.getElementById('inssub_conv_'+idx);
    return {
      insumo_id:getComboValue('inssub_sel_'+idx),
      cantidad:document.getElementById('inssub_cant_'+idx)?document.getElementById('inssub_cant_'+idx).value:'',
      conversion:convEl?convEl.checked:false,
      unidad_receta:document.getElementById('inssub_u_'+idx)?document.getElementById('inssub_u_'+idx).value:'',
      factor_receta:document.getElementById('inssub_f_'+idx)?document.getElementById('inssub_f_'+idx).value:1
    };
  });
}
function sincronizarSubHijo(){filasSubproductoHijo=filasSubproductoHijo.map(function(_,idx){return {subproducto_id:getComboValue('subhijo_sel_'+idx),cantidad:document.getElementById('subhijo_cant_'+idx)?document.getElementById('subhijo_cant_'+idx).value:''};});}

async function abrirModalSubproducto(subproductoId,data,cfg,onSaveCallback){
  const sub=subproductoId?data.subproductos.find(function(s){return s.id===subproductoId;}):null;
  if(subproductoId&&!sub){toast('Subproducto no encontrado.','error');return;}

  /* Poblar estado global de filas */
  if(sub){
    const rec=data.recetas.filter(function(r){return r.subproducto_id===sub.id;});
    const hij=data.hijos.filter(function(h){return h.subproducto_padre_id===sub.id;});
    filasInsumoSub=rec.length?rec.map(function(r){
      const tieneConv=!!(r.unidad_receta||(r.factor_receta&&r.factor_receta!==1));
      return {insumo_id:r.insumo_id,cantidad:r.cantidad_por_unidad,conversion:tieneConv,unidad_receta:r.unidad_receta||'',factor_receta:r.factor_receta||1};
    }):[{insumo_id:'',cantidad:'',conversion:false,unidad_receta:'',factor_receta:1}];
    filasSubproductoHijo=hij.length?hij.map(function(h){return {subproducto_id:h.subproducto_hijo_id,cantidad:h.cantidad_por_unidad};}):[{subproducto_id:'',cantidad:''}];
    tipoSubEdicion=sub.tipo||'ambos';
  } else {
    filasInsumoSub=[{insumo_id:'',cantidad:'',conversion:false,unidad_receta:'',factor_receta:1}];
    filasSubproductoHijo=[{subproducto_id:'',cantidad:''}];
    tipoSubEdicion='ambos';
  }

  /* Código sugerido (4 dígitos, calculado localmente) */
  let numSubSug;
  if(sub){
    numSubSug=sub.codigo.replace(cfg.prefijoSubproducto,'');
  } else {
    numSubSug=siguienteCodigoDeRango(data.subproductos, function(s){return s.codigo;}, cfg.prefijoSubproducto);
  }

  /* Opciones para combos */
  const insumoOpts=data.insumos.map(function(i){return {id:i.id,nombre:i.nombre+' ('+unidadConsumo(i)+')'};});
  const subsParaHijos=data.subproductos.filter(function(s){return (!sub||s.id!==sub.id)&&(s.tipo==='intermedio'||s.tipo==='ambos'||!s.tipo);});
  const subOptsParaHijos=subsParaHijos.map(function(s){return {id:s.id,nombre:s.nombre+' ('+s.codigo+')'};});

  abrirModalGenerico({
    title: sub?'Editar subproducto':'Nuevo subproducto',
    subtitle: 'Subproducto con receta de insumos y/o subproductos hijos.',
    icon: icono(sub?'pencil':'plus','lg'),
    variant: 'info',
    size: 'wide',
    body: `
      <div class="form-grid" style="padding:0;">
        <div><label>Código</label><div class="codigo-compuesto"><span class="codigo-prefijo">${cfg.prefijoSubproducto}</span><input id="sub_codigo_num" value="${numSubSug}" ${sub?'disabled':''} autocomplete="off"></div><div class="field-validate" id="sub_codigo_status"></div></div>
        <div><label>Nombre</label><input id="sub_nombre" placeholder="Batón americano" value="${sub?sub.nombre:''}"></div>
        <div><label>Tipo</label><select id="sub_tipo">
          <option value="intermedio" ${tipoSubEdicion==='intermedio'?'selected':''}>Intermedio (usable en otros subproductos)</option>
          <option value="final" ${tipoSubEdicion==='final'?'selected':''}>Final (solo en paquetes)</option>
          <option value="ambos" ${tipoSubEdicion==='ambos'?'selected':''}>Ambos</option>
        </select></div>
        <div><label>Existencia inicial <span style="color:var(--text-muted);font-weight:400;">(opcional)</span></label><input id="sub_existencia" type="number" value="${sub?sub.existencia_actual:''}" placeholder="0"></div>
      </div>
      <div class="divider-label">Receta de insumos</div>
      <div id="filasInsumoSubContainer"></div>
      <div class="dyn-row-add">
        <button class="secondary small" id="btnAgregarFilaInsumoSub" title="Agregar insumo a la receta">+ Agregar insumo</button>
        <button class="ghost small" id="btnCrearInsumoInline" title="Crear un insumo nuevo">+ Crear insumo nuevo</button>
      </div>
      <div id="inlineInsumoContainer"></div>
      <div class="divider-label">Subproductos hijos (solo tipo Intermedio o Ambos)</div>
      <div id="filasSubproductoHijoContainer"></div>
      <div class="dyn-row-add"><button class="secondary small" id="btnAgregarFilaSubHijo" title="Agregar subproducto hijo">+ Agregar subproducto hijo</button></div>`,
    footer: '<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button class="ghost" id="sub_cancelar">Cancelar</button><button id="sub_guardar">'+(sub?'Guardar cambios':'Crear subproducto')+'</button></div>',
    onOpen: function(body){
      renderFilasInsumoSub(insumoOpts);
      renderFilasSubproductoHijo(subOptsParaHijos);

      /* Código sugerido: auto-select + validación en vivo */
      const inputCod=document.getElementById('sub_codigo_num');
      const statusCod=document.getElementById('sub_codigo_status');
      if(inputCod && !sub){
        bindAutoSelect(inputCod);
        inputCod.addEventListener('input',debounce(function(){
          validarDisponibilidadCodigo(inputCod,statusCod,'subproductos','codigo',cfg.prefijoSubproducto);
        },400));
      }

      document.getElementById('btnAgregarFilaInsumoSub').addEventListener('click',function(){sincronizarInsumoSub();filasInsumoSub.push({insumo_id:'',cantidad:'',conversion:false,unidad_receta:'',factor_receta:1});renderFilasInsumoSub(insumoOpts);});
      document.getElementById('btnAgregarFilaSubHijo').addEventListener('click',function(){sincronizarSubHijo();filasSubproductoHijo.push({subproducto_id:'',cantidad:''});renderFilasSubproductoHijo(subOptsParaHijos);});

      /* Crear insumo (llamando al modal completo) */
      document.getElementById('btnCrearInsumoInline').addEventListener('click',function(){
        abrirModalInsumo(null, data.insumos, cfg, function(nuevoIns){
          data.insumos.push(nuevoIns);
          filasInsumoSub.push({insumo_id: nuevoIns.id, cantidad: '1', conversion: false, unidad_receta: '', factor_receta: 1});
          const insumoOpts = data.insumos.map(i => ({id: i.id, nombre: i.nombre + ' (' + unidadConsumo(i) + ')'}));
          renderFilasInsumoSub(insumoOpts);
        });
      });

      document.getElementById('sub_cancelar').addEventListener('click',cerrarModalGenerico);

      document.getElementById('sub_guardar').addEventListener('click',async function(ev){
        sincronizarInsumoSub();sincronizarSubHijo();
        const nombre=document.getElementById('sub_nombre').value.trim();
        const tipo=document.getElementById('sub_tipo').value;
        if(!nombre){toast('Escribe el nombre del subproducto.','error');return;}
        const receta=filasInsumoSub.filter(function(f){return f.insumo_id&&f.cantidad;}).map(function(f){
          return {insumo_id:f.insumo_id,cantidad:parseFloat(f.cantidad),unidad_receta:f.conversion?(f.unidad_receta||null):null,factor_receta:f.conversion?(parseFloat(f.factor_receta)||1):1};
        });
        const hijos=filasSubproductoHijo.filter(function(f){return f.subproducto_id&&f.cantidad;}).map(function(f){return {subproducto_id:f.subproducto_id,cantidad:parseFloat(f.cantidad)};});
        try{
          await withLoading(ev.currentTarget,async function(){
            let cod=sub?sub.codigo:null;
            if(!cod){
              const numManual=(document.getElementById('sub_codigo_num').value||'').trim();
              if(numManual){
                let limpio=numManual;
                if(limpio.indexOf(cfg.prefijoSubproducto)===0){limpio=limpio.slice(cfg.prefijoSubproducto.length);}
                if(!limpio){toast('El código no puede estar vacío.','error');return false;}
                cod=cfg.prefijoSubproducto+limpio;
              }else{
                try{cod=cfg.prefijoSubproducto+await rpc('siguiente_codigo',{p_prefijo:cfg.prefijoSubproducto,p_tabla:'subproductos'});}catch(e){cod=cfg.prefijoSubproducto+siguienteCodigoLocal(cfg.prefijoSubproducto,data.subproductos);}
              }
            }
            await rpc('guardar_subproducto',{p_id:sub?sub.id:null,p_codigo:cod,p_nombre:nombre,p_existencia:parseFloat(document.getElementById('sub_existencia').value)||0,p_punto_reorden:0,p_receta:receta,p_hijos:hijos,p_tipo:tipo});
          });
          toast(sub?'Subproducto actualizado.':'Subproducto creado.','success');
          
          if (onSaveCallback) {
            const nuevos = await api('subproductos?order=nombre');
            const item = nuevos.find(x => x.codigo === cod);
            onSaveCallback(item);
            cerrarModalGenerico();
          } else {
            cerrarModalGenerico();
            window._preservarScroll=true;
            renderProductos();
          }
        }catch(e){toast(e.message,'error');}
      });
    }
  });
}

async function abrirModalPaquete(codigoPT,data,cfg,draft){
  const prod=codigoPT?data.productos.find(function(p){return p.codigo_pt===codigoPT;}):null;
  if(codigoPT&&!prod){toast('Paquete no encontrado.','error');return;}

  if(draft){
    filasSubproducto = draft.filasSub;
    filasInsumoBom = draft.filasIns;
  } else if(prod){
    const cs=data.paqueteSubs.filter(function(p){return p.codigo_pt===prod.codigo_pt;});
    const bi=data.bom.filter(function(b){return b.codigo_pt===prod.codigo_pt;});
    filasSubproducto=cs.length?cs.map(function(r){return {subproducto_id:r.subproducto_id,cantidad:r.cantidad};}):[{subproducto_id:'',cantidad:''}];
    filasInsumoBom=bi.length?bi.map(function(r){return {insumo_id:r.insumo_id,cantidad:r.cantidad_por_unidad};}):[{insumo_id:'',cantidad:''}];
  } else {
    filasSubproducto=[{subproducto_id:'',cantidad:''}];
    filasInsumoBom=[{insumo_id:'',cantidad:''}];
  }

  let numProdSug;
  if(prod){
    numProdSug=prod.codigo_pt.replace(cfg.prefijoProducto,'');
  } else {
    numProdSug=siguienteCodigoDeRango(data.productos, function(p){return p.codigo_pt;}, cfg.prefijoProducto);
  }

  const insumoOpts=data.insumos.map(function(i){return {id:i.id,nombre:i.nombre+' ('+unidadConsumo(i)+')'};});
  const subOptsPaq=data.subproductos.filter(function(s){return s.tipo!=='intermedio';}).map(function(s){return {id:s.id,nombre:s.nombre+' ('+s.codigo+')'};});

  abrirModalGenerico({
    title: prod?'Editar paquete (PT)':'Nuevo paquete (PT)',
    subtitle: 'Composición del paquete: subproductos + insumos directos.',
    icon: icono(prod?'pencil':'plus','lg'),
    variant: 'info',
    size: 'wide',
    body: `
      <div class="form-grid" style="padding:0;">
        <div><label>Código PT</label><div class="codigo-compuesto"><span class="codigo-prefijo">${cfg.prefijoProducto}</span><input id="prod_codigo_num" value="${numProdSug}" ${prod?'disabled':''} autocomplete="off"></div><div class="field-validate" id="prod_codigo_status"></div></div>
        <div><label>Nombre del paquete</label><input id="prod_nombre" placeholder="Cirugía General Proclides" value="${draft?draft.nombre:(prod?prod.nombre:'')}"></div>
        <div><label>Unidades por caja</label><input id="prod_por_caja" type="number" min="1" step="1" value="${draft?draft.pc:(prod?prod.unidades_por_caja:1)}"></div>
        <div><label>Precio de venta <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">(por unidad, opcional)</span></label><input id="prod_precio" type="number" step="0.01" min="0" value="${draft?draft.precio:(prod&&prod.precio_venta!=null?prod.precio_venta:'')}" placeholder="Ej: 12500"></div>
      </div>
      
      <div class="divider-label">Configuración de etiquetas</div>
      <div class="form-grid" style="padding:0;">
        <div class="full-span">
          <label>Código de barras del cliente <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">(opcional, si lo tiene)</span></label>
          <input id="prod_codigo_barras" placeholder="Ej: 7707333721666" value="${draft?draft.codigo_barras:(prod&&prod.codigo_barras?prod.codigo_barras:'')}" style="font-family:'IBM Plex Mono',monospace;">
        </div>
        <div>
          <label>Plantilla de etiqueta</label>
          <select id="prod_plantilla">
            <option value="esteril_proclides" ${(!draft&&!prod||(draft&&draft.plantilla==='esteril_proclides')||(prod&&prod.plantilla_etiqueta==='esteril_proclides'))?'selected':''}>Estéril Proclides (Grande)</option>
            <option value="esteril_allmed" ${(draft&&draft.plantilla==='esteril_allmed')||(prod&&prod.plantilla_etiqueta==='esteril_allmed')?'selected':''}>Estéril Allmed (Grande)</option>
            <option value="noesteril_allmed" ${(draft&&draft.plantilla==='noesteril_allmed')||(prod&&prod.plantilla_etiqueta==='noesteril_allmed')?'selected':''}>No Estéril Allmed (Grande)</option>
            <option value="noesteril_proclides_grande" ${(draft&&draft.plantilla==='noesteril_proclides_grande')||(prod&&prod.plantilla_etiqueta==='noesteril_proclides_grande')?'selected':''}>No Estéril Proclides (Grande)</option>
            <option value="noesteril_proclides_mediana" ${(draft&&draft.plantilla==='noesteril_proclides_mediana')||(prod&&prod.plantilla_etiqueta==='noesteril_proclides_mediana')?'selected':''}>No Estéril Proclides (Mediana)</option>
          </select>
        </div>
        <div>
          <label>Vida útil (meses)</label>
          <input id="prod_vida_util" type="number" min="1" value="${draft?draft.vida_util:(prod&&prod.vida_util_meses!=null?prod.vida_util_meses:35)}">
        </div>
        <div class="full-span">
          <label>Registro INVIMA</label>
          <select id="prod_invima">
            <option value="">— No requiere registro —</option>
            ${(getEtiquetasConfig().invimas||[]).map(function(inv){
              return '<option value="'+inv.numero+'" '+((draft&&draft.invima===inv.numero)||(prod&&prod.registro_invima===inv.numero)?'selected':'')+'>'+inv.nombre+' ('+inv.numero+')</option>';
            }).join('')}
          </select>
        </div>
      </div>
      <div class="divider-label">Subproductos que componen el paquete</div>
      <div id="filasSubproductoContainer"></div>
      <div class="dyn-row-add">
        <button class="secondary small" id="btnAgregarFilaSub" title="Agregar subproducto al paquete">+ Agregar subproducto</button>
        <button class="ghost small" id="btnCrearSubproductoInline" title="Crear un subproducto nuevo">+ Crear subproducto nuevo</button>
      </div>
      <div id="inlineSubproductoContainer"></div>
      <div class="divider-label">Receta de insumos directa del paquete (cantidad por unidad individual, no por caja)</div>
      <div style="font-size:11.5px;color:var(--text-muted);padding:0 0 8px;line-height:1.5;"><b>Ejemplo:</b> si un paquete se entrega en cajas ×1000 y cada unidad individual consume 1 bolsa, aquí va <b>1</b>, no 1000.</div>
      <div id="filasInsumoContainer"></div>
      <div class="dyn-row-add">
        <button class="secondary small" id="btnAgregarFilaInsumo" title="Agregar insumo directo">+ Agregar insumo</button>
        <button class="ghost small" id="btnCrearInsumoInlinePT" title="Crear un insumo nuevo">+ Crear insumo nuevo</button>
      </div>`,
    footer: '<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button class="ghost" id="prod_cancelar">Cancelar</button><button id="prod_guardar">'+(prod?'Guardar cambios':'Crear paquete')+'</button></div>',
    onOpen: function(body){
      renderFilasSubproducto(subOptsPaq);
      renderFilasInsumo(insumoOpts);

      /* Código sugerido: auto-select + validación en vivo */
      const inputCod=document.getElementById('prod_codigo_num');
      const statusCod=document.getElementById('prod_codigo_status');
      if(inputCod && !prod){
        bindAutoSelect(inputCod);
        inputCod.addEventListener('input',debounce(function(){
          validarDisponibilidadCodigo(inputCod,statusCod,'productos_terminados','codigo_pt',cfg.prefijoProducto);
        },400));
      }

      document.getElementById('btnAgregarFilaSub').addEventListener('click',function(){sincronizarSub();filasSubproducto.push({subproducto_id:'',cantidad:''});renderFilasSubproducto(subOptsPaq);});
      document.getElementById('btnAgregarFilaInsumo').addEventListener('click',function(){sincronizarInsBom();filasInsumoBom.push({insumo_id:'',cantidad:''});renderFilasInsumo(insumoOpts);});

      /* Crear insumo apilado */
      document.getElementById('btnCrearInsumoInlinePT').addEventListener('click',function(){
        abrirModalInsumo(null, data.insumos, cfg, function(nuevoIns) {
          data.insumos.push(nuevoIns);
          filasInsumoBom.push({ insumo_id: nuevoIns.id, cantidad: '1' });
          const insumoOpts = data.insumos.map(i => ({id: i.id, nombre: i.nombre + ' (' + unidadConsumo(i) + ')'}));
          renderFilasInsumo(insumoOpts);
        });
      });

      /* Crear subproducto apilado */
      document.getElementById('btnCrearSubproductoInline').addEventListener('click',function(){
        abrirModalSubproducto(null, data, cfg, function(nuevoSub) {
          data.subproductos.push(nuevoSub);
          filasSubproducto.push({ subproducto_id: nuevoSub.id, cantidad: '1' });
          const subOptsPaq = data.subproductos.filter(s => s.tipo !== 'intermedio').map(s => ({id: s.id, nombre: s.nombre + ' (' + s.codigo + ')'}));
          renderFilasSubproducto(subOptsPaq);
        });
      });

      document.getElementById('prod_cancelar').addEventListener('click',cerrarModalGenerico);

      document.getElementById('prod_guardar').addEventListener('click',async function(ev){
        sincronizarSub();sincronizarInsBom();
        const nombre=document.getElementById('prod_nombre').value.trim();
        const pc=parseInt(document.getElementById('prod_por_caja').value,10)||1;
        const precioRaw=document.getElementById('prod_precio').value.trim();
        const precio=precioRaw?parseFloat(precioRaw):null;
        if(!nombre){toast('Escribe el nombre del paquete.','error');return;}
        if(pc<1){toast('Unidades por caja debe ser al menos 1.','error');return;}
        if(precio!==null&&precio<0){toast('El precio de venta no puede ser negativo.','error');return;}
        const subs=filasSubproducto.filter(function(f){return f.subproducto_id&&f.cantidad;}).map(function(f){return {subproducto_id:f.subproducto_id,cantidad:parseFloat(f.cantidad)};});
        const ins=filasInsumoBom.filter(function(f){return f.insumo_id&&f.cantidad;}).map(function(f){return {insumo_id:f.insumo_id,cantidad:parseFloat(f.cantidad)};});
        const plantilla=document.getElementById('prod_plantilla').value;
        const vidaUtil=parseInt(document.getElementById('prod_vida_util').value,10)||36;
        const invima=document.getElementById('prod_invima').value||null;

        try{
          await withLoading(ev.currentTarget,async function(){
            let cod=prod?prod.codigo_pt:null;
            if(!cod){
              const numManual=(document.getElementById('prod_codigo_num').value||'').trim();
              if(numManual){
                let limpio=numManual;
                if(limpio.indexOf(cfg.prefijoProducto)===0){limpio=limpio.slice(cfg.prefijoProducto.length);}
                if(!limpio){toast('El código no puede estar vacío.','error');return false;}
                cod=cfg.prefijoProducto+limpio;
              }else{
                try{cod=cfg.prefijoProducto+await rpc('siguiente_codigo',{p_prefijo:cfg.prefijoProducto,p_tabla:'productos_terminados'});}catch(e){cod=cfg.prefijoProducto+siguienteCodigoLocal(cfg.prefijoProducto,data.productos);}
              }
            }
            /* 1. Guardar la composición y datos base (RPC) */
            await rpc('guardar_paquete',{p_codigo_pt:cod,p_es_nuevo:!prod,p_nombre:nombre,p_subproductos:subs,p_insumos:ins,p_unidades_por_caja:pc,p_precio_venta:precio});
            
            /* 2. Actualizar los campos nuevos de etiquetas con un PATCH */
            await api('productos_terminados?codigo_pt=eq.'+encodeURIComponent(cod), {
              method:'PATCH',
              body:JSON.stringify({
                plantilla_etiqueta: plantilla,
                vida_util_meses: vidaUtil,
                registro_invima: invima,
                codigo_barras: document.getElementById('prod_codigo_barras').value.trim() || null
              })
            });
          });
          toast(prod?'Paquete actualizado.':'Paquete creado.','success');
          cerrarModalGenerico();
          window._preservarScroll=true;
          renderProductos();
        }catch(e){toast(e.message,'error');}
      });
    }
  });
}

function renderFilasSubproducto(disponibles){
  const cont=document.getElementById('filasSubproductoContainer');if(!cont)return;
  cont.innerHTML=filasSubproducto.map(function(fila,idx){
    return '<div class="dyn-row">'+comboInput('subprod',idx,disponibles,fila.subproducto_id,'Buscar subproducto…')+'<input id="subprod_cant_'+idx+'" type="number" step="0.0001" placeholder="Cantidad" value="'+fila.cantidad+'"><button type="button" class="ghost small" data-remove-fila-sub="'+idx+'" title="Quitar">×</button></div>';
  }).join('');
  cont.querySelectorAll('[data-remove-fila-sub]').forEach(function(btn){btn.addEventListener('click',function(){sincronizarSub();filasSubproducto.splice(parseInt(btn.dataset.removeFilaSub,10),1);if(filasSubproducto.length===0)filasSubproducto=[{subproducto_id:'',cantidad:''}];renderFilasSubproducto(disponibles);});});
}
function renderFilasInsumo(disponibles){
  const cont=document.getElementById('filasInsumoContainer');if(!cont)return;
  cont.innerHTML=filasInsumoBom.map(function(fila,idx){
    return '<div class="dyn-row">'+comboInput('insbom',idx,disponibles,fila.insumo_id,'Buscar insumo…')+'<input id="insbom_cant_'+idx+'" type="number" step="0.0001" placeholder="Por unidad de PT" value="'+fila.cantidad+'"><button type="button" class="ghost small" data-remove-fila-ins="'+idx+'" title="Quitar">×</button></div>';
  }).join('');
  cont.querySelectorAll('[data-remove-fila-ins]').forEach(function(btn){btn.addEventListener('click',function(){sincronizarInsBom();filasInsumoBom.splice(parseInt(btn.dataset.removeFilaIns,10),1);if(filasInsumoBom.length===0)filasInsumoBom=[{insumo_id:'',cantidad:''}];renderFilasInsumo(disponibles);});});
}
function renderFilasInsumoSub(disponibles){
  const cont=document.getElementById('filasInsumoSubContainer');if(!cont)return;
  cont.innerHTML=filasInsumoSub.map(function(fila,idx){
    const ins=disponibles.find(function(i){return i.id===fila.insumo_id;});
    const m=ins?ins.nombre.match(/\(([^)]+)\)/):null;
    const unidad=m?m[1]:'u';
    const conv=fila.conversion===true;
    const extra=conv?'<input id="inssub_u_'+idx+'" type="text" placeholder="'+unidad+'" value="'+(fila.unidad_receta||'')+'" title="Unidad de receta"><input id="inssub_f_'+idx+'" type="number" step="0.0001" placeholder="1" value="'+(fila.factor_receta||1)+'" title="Factor de conversión">':'<input type="hidden" id="inssub_u_'+idx+'" value=""><input type="hidden" id="inssub_f_'+idx+'" value="1">';
    return '<div class="dyn-row conv-recipe">'+comboInput('inssub',idx,disponibles,fila.insumo_id,'Buscar insumo…')+'<input id="inssub_cant_'+idx+'" type="number" step="0.0001" placeholder="Por unidad del subproducto" value="'+fila.cantidad+'"><label class="conv-check" style="justify-self:start;"><input type="checkbox" id="inssub_conv_'+idx+'" '+(conv?'checked':'')+'> conversión</label>'+extra+'<button type="button" class="ghost small" data-remove-fila-inssub="'+idx+'" title="Quitar">×</button></div>';
  }).join('');
  cont.querySelectorAll('[data-remove-fila-inssub]').forEach(function(btn){btn.addEventListener('click',function(){sincronizarInsumoSub();filasInsumoSub.splice(parseInt(btn.dataset.removeFilaInssub,10),1);if(filasInsumoSub.length===0)filasInsumoSub=[{insumo_id:'',cantidad:'',conversion:false,unidad_receta:'',factor_receta:1}];renderFilasInsumoSub(disponibles);});});
  cont.querySelectorAll('[id^="inssub_conv_"]').forEach(function(chk){
    chk.addEventListener('change',function(){
      const idx=parseInt(chk.id.replace('inssub_conv_',''),10);
      sincronizarInsumoSub();
      filasInsumoSub[idx].conversion=chk.checked;
      renderFilasInsumoSub(disponibles);
    });
  });
}
function renderFilasSubproductoHijo(disponibles){
  const cont=document.getElementById('filasSubproductoHijoContainer');if(!cont)return;
  if(disponibles.length===0){cont.innerHTML='<div class="empty-state" style="padding:8px 18px;">No hay otros subproductos intermedios para agregar.</div>';return;}
  cont.innerHTML=filasSubproductoHijo.map(function(fila,idx){
    return '<div class="dyn-row">'+comboInput('subhijo',idx,disponibles,fila.subproducto_id,'Buscar subproducto…')+'<input id="subhijo_cant_'+idx+'" type="number" step="0.0001" placeholder="Cantidad por unidad" value="'+fila.cantidad+'"><button type="button" class="ghost small" data-remove-fila-subhijo="'+idx+'" title="Quitar">×</button></div>';
  }).join('');
  cont.querySelectorAll('[data-remove-fila-subhijo]').forEach(function(btn){btn.addEventListener('click',function(){sincronizarSubHijo();filasSubproductoHijo.splice(parseInt(btn.dataset.removeFilaSubhijo,10),1);if(filasSubproductoHijo.length===0)filasSubproductoHijo=[{subproducto_id:'',cantidad:''}];renderFilasSubproductoHijo(disponibles);});});
}

/* ============ CARGAR ORDEN ============ */
let mostrarFinalizadas=false;

let _nuevaOPCtx=null;

async function renderOrden(){
  const main=document.getElementById('mainContent');
  const cfg=getConfig();
  const filtro=mostrarFinalizadas?'':'&estado_op=in.(Pendiente,En%20proceso)';
  const [productos,ordenesRaw,ultimas]=await Promise.all([
    api('productos_terminados?select=*&estado_activo=eq.true&order=nombre'),
    api('ordenes_semanales?select=*,productos_terminados(nombre,unidades_por_caja)&order=prioridad.asc.nullslast,fecha_programada.asc.nullslast,fecha_creacion.desc&limit=200'+filtro),
    api('ordenes_semanales?select=numero_op,lote,fecha_creacion,fecha_programada,prioridad,codigo_pt,productos_terminados(nombre)&order=fecha_creacion.desc&limit=5')
  ]);

  /* Filtro activo desde notificaciones */
  const filtroActivo=(_filtroModulo && _filtroModulo.tab==='orden') ? _filtroModulo.filtro : null;
  const ordenes = (filtroActivo==='vencidas')
    ? ordenesRaw.filter(function(o){
        const dias=(Date.now()-new Date(o.fecha_creacion).getTime())/(1000*60*60*24);
        return dias>=5;
      })
    : ordenesRaw;

  const ordView=applySort(ordenes,'lista_ordenes',{op:function(o){return o.numero_op||'';},prioridad:function(o){return Number(o.prioridad)||99;},producto:function(o){return o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt;},cantidad:function(o){return o.cantidad_proyectada;},fecha:function(o){return new Date(o.fecha_creacion).getTime();},estado:function(o){return o.estado_op||'';}});
  main.innerHTML=`
    <h2 class="page-title">Cargar orden semanal</h2>
    <p class="page-sub">El sistema explota insumos directos y los de cada subproducto (recursivo).</p>

    <div class="panel force-collapsed">
      <div class="panel-header"><h3>Referencia · últimas 5 OPs cargadas</h3></div>
      ${ultimas.length===0?'<div class="empty-state">Aún no hay OPs cargadas.</div>':`
      <table><tr><th>N° OP</th><th>Lote</th><th>Producto</th><th class="num">Prior.</th><th>Programada</th><th>Fecha carga</th></tr>
        ${ultimas.map(function(o){
          const prod=o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt;
          const prioridad=prioridadLabel(o.prioridad)||'—';
          const fechaProg=o.fecha_programada?new Date(o.fecha_programada+'T00:00:00').toLocaleDateString('es-CO'):'—';
          return '<tr><td class="mono">'+(o.numero_op||'—')+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+(o.lote||'—')+'</td><td>'+prod+'</td><td class="num">'+prioridad+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+fechaProg+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+new Date(o.fecha_creacion).toLocaleDateString('es-CO')+'</td></tr>';
        }).join('')}
      </table>`}
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Órdenes registradas</h3><div style="display:flex;gap:6px;align-items:center;"><button class="secondary small" id="btnExportOrdenes" title="Descargar CSV">${icono('download','sm')} Exportar CSV</button>${botonRefreshHTML('orden')}<button class="btn-add require-write" id="btnNuevaOP" title="Crear nueva OP">+</button></div></div>
      <div class="search-box"><input id="buscar_ordenes" placeholder="Buscar por OP o producto…"></div>
      ${filtroActivo==='vencidas'?`<div class="filter-chip-bar"><span class="filter-chip">${icono('clock','sm')} Pendientes hace +5 días (${ordenes.length}) <button data-clear-filtro title="Quitar filtro">×</button></span></div>`:''}
      <label class="filter-toggle"><input type="checkbox" id="toggleFinalizadas" ${mostrarFinalizadas?'checked':''}><span>Mostrar también las órdenes terminadas y canceladas</span></label>
      ${ordenes.length===0?'<div class="empty-state">No hay órdenes para mostrar.</div>':`
      <table id="tablaOrdenes"><tr>
        ${thSort('N° OP','op','lista_ordenes')}
        ${thSort('Prior.','prioridad','lista_ordenes')}
        ${thSort('Producto','producto','lista_ordenes')}
        ${thSort('Cantidad','cantidad','lista_ordenes',true)}
        <th>Programada</th>
        <th>Cobertura</th>
        ${thSort('Estado','estado','lista_ordenes')}
        <th class="actions"></th>
      </tr>
        ${ordView.map(function(o){
          const prod=o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt;
          const pc=o.productos_terminados?(o.productos_terminados.unidades_por_caja||1):1;
          const cajas=o.cantidad_proyectada&&pc>1?Math.ceil(o.cantidad_proyectada/pc):null;
          const fin=o.estado_op==='Terminada'||o.estado_op==='Cancelada';
          const producida=Number(o.cantidad_producida)||0;
          const proyectada=Number(o.cantidad_proyectada)||0;
          const pendiente=proyectada-producida;
          const hayProgreso=producida>0&&producida<proyectada;
          const progresoTxt=proyectada>0?'<br><span style="color:'+(producida>=proyectada?'var(--success)':'var(--info)')+';font-size:11px;">'+num(producida)+'/'+num(proyectada)+' entregado'+(producida>=proyectada?' ✓':'')+'</span>':'';
          const prioridad=prioridadBadge(o.prioridad);
          const fechaProg=o.fecha_programada?new Date(o.fecha_programada+'T00:00:00').toLocaleDateString('es-CO'):'<span style="color:var(--text-muted);">—</span>';
          return '<tr><td class="mono">'+(o.numero_op||'—')+(o.lote?'<br><span style="font-size:11px;color:var(--text-muted);">'+o.lote+'</span>':'')+'</td><td>'+prioridad+'</td><td>'+prod+'</td><td class="num">'+num(o.cantidad_proyectada)+(cajas?'<br><span style="color:var(--text-muted);font-size:11px;">≈ '+cajas+' cajas</span>':'')+progresoTxt+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+fechaProg+'</td><td>'+badgeFor(o.estado_cobertura)+'</td><td>'+badgeOP(o.estado_op)+'</td><td class="actions"><button class="ghost small" data-orden-detalle="'+o.id+'" title="Ver detalle de la OP">Detalle</button><button class="success-btn small" data-orden-entregar="'+o.id+'" '+(fin||pendiente<=0?'disabled':'')+' title="Registrar entrega">'+(hayProgreso?'Entrega parcial':'Entregar')+'</button><button class="danger-btn small" data-orden-cancelar="'+o.id+'" '+(fin?'disabled':'')+' title="Cancelar">Cancelar</button></td></tr>';
        }).join('')}
      </table>`}
    </div>`;
  filtrarTabla('buscar_ordenes','tablaOrdenes');
  bindSortHeaders(renderOrden);
  paginarTabla('tablaOrdenes');
  document.getElementById('toggleFinalizadas').addEventListener('change',function(e){mostrarFinalizadas=e.target.checked;renderOrden();});

  /* Chip de filtro activo: botón × para quitar */
  const clearFiltro=document.querySelector('[data-clear-filtro]');
  if(clearFiltro){
    clearFiltro.addEventListener('click',function(){
      limpiarFiltroModulo();
      renderOrden();
    });
  }

  /* Botón "+" → abre modal de Nueva OP */
  document.getElementById('btnNuevaOP').addEventListener('click',function(){
    abrirModalNuevaOP(productos,cfg);
  });

  /* Export CSV */
  document.getElementById('btnExportOrdenes').addEventListener('click',function(){
    const headers=['N° OP','Lote','Prioridad','Producto','Unidades','Cajas aprox.','Cobertura','Estado OP','Programada','Fecha carga','Fecha completado','Fecha cancelado','Motivo cancelación'];
    const filas=ordView.map(function(o){
      const prod=o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt;
      const pc=o.productos_terminados?(o.productos_terminados.unidades_por_caja||1):1;
      const cajas=o.cantidad_proyectada&&pc>1?Math.ceil(o.cantidad_proyectada/pc):'';
      return [
        o.numero_op||'',
        o.lote||'',
        o.prioridad!=null?(prioridadLabel(o.prioridad)||''):'',
        prod,
        fmtCSV(o.cantidad_proyectada,0),
        cajas,
        o.estado_cobertura||'',
        o.estado_op||'',
        o.fecha_programada||'',
        o.fecha_creacion?new Date(o.fecha_creacion).toLocaleDateString('es-CO'):'',
        o.fecha_completado?new Date(o.fecha_completado).toLocaleDateString('es-CO'):'',
        o.fecha_cancelado?new Date(o.fecha_cancelado).toLocaleDateString('es-CO'):'',
        o.motivo_cancelacion||''
      ];
    });
    exportarCSV('ordenes',headers,filas);
  });

  /* Acciones sobre la tabla */
  document.querySelectorAll('[data-orden-detalle]').forEach(function(btn){
    btn.addEventListener('click',function(){
      const o=ordenes.find(function(x){return x.id===btn.dataset.ordenDetalle;});
      abrirModalDetalleOrden(o);
    });
  });
  document.querySelectorAll('[data-orden-entregar]').forEach(function(btn){
    btn.addEventListener('click',function(){
      const o=ordenes.find(function(x){return x.id===btn.dataset.ordenEntregar;});
      if(!o) return;
      abrirModalEntrega(o);
    });
  });
  document.querySelectorAll('[data-orden-cancelar]').forEach(function(btn){
    btn.addEventListener('click',async function(){
      const motivo=await promptear({title:'Cancelar OP',message:'Escribe el motivo (opcional). Puedes dejarlo en blanco.',icon:'✕',variant:'warn',placeholder:'Ej: cliente canceló, error de digitación…',okText:'Cancelar OP'});
      if(motivo===null)return;
      try{await withLoading(btn,async function(){await rpc('cancelar_orden',{p_orden_id:btn.dataset.ordenCancelar,p_motivo:motivo||null});});toast('OP cancelada.','success');renderOrden();}
      catch(e){toast(e.message,'error');}
    });
  });
}

async function abrirModalNuevaOP(productos,cfg){
  if(!productos.length){
    toast('Primero crea al menos un paquete (PT) en Productos & BOM.','error');
    return;
  }

  /* Sugerir número de OP */
  const sugerido=await siguienteOPDisponible(cfg.prefijoOP);

  abrirModalGenerico({
    title:'Nueva orden de producción',
    subtitle:'El sistema explota insumos y subproductos al calcular la cobertura.',
    icon:icono('plus','lg'),
    variant:'info',
    size:'md',
    body:`
      <div class="form-grid labels-bottom" style="padding:0;">
        <div>
          <label>Número de OP <span style="color:var(--danger);">*</span></label>
          <div class="codigo-compuesto"><span class="codigo-prefijo">${cfg.prefijoOP}</span><input id="orden_numero" placeholder="Ej: 045" title="Obligatorio. No se puede repetir." required autocomplete="off"></div>
          <div class="field-validate" id="orden_numero_status"></div>
          <div class="field-hint">Sugerido: <b class="mono" id="orden_sugerido">${sugerido||'—'}</b>${sugerido?' <button type="button" class="subtle-toggle" id="btnUsarSugerido" title="Rellenar con el número sugerido">usar</button>':''}</div>
        </div>
        <div>
          <label>Lote <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">(opcional, único si se llena)</span></label>
          <input id="orden_lote" placeholder="Ej: L-2026-014" autocomplete="off">
          <div class="field-validate" id="orden_lote_status"></div>
        </div>
        <div><label>Producto terminado</label><select id="orden_pt">${productos.map(function(p){return '<option value="'+p.codigo_pt+'" data-caja="'+(p.unidades_por_caja||1)+'">'+p.nombre+' (caja ×'+(p.unidades_por_caja||1)+')</option>';}).join('')}</select></div>
        <div>
          <label>Cantidad (unidades)</label>
          <input id="orden_cantidad" type="number" placeholder="1200">
          <div class="field-hint" id="orden_cantidad_preview"></div>
        </div>
        <div><label>Prioridad</label><select id="orden_prioridad">${prioridadOptionsHTML(3)}</select></div>
        <div><label>Fecha inicio <span style="color:var(--danger);">*</span></label><input id="orden_fecha_programada" type="date" required></div>
        <div><label>Fecha fin <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">(opcional)</span></label><input id="orden_fecha_fin" type="date"></div>
      </div>`,
    footer:'<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button class="ghost" id="nuevaop_cancelar">Cancelar</button><button id="nuevaop_calcular">Calcular cobertura</button></div>',
    onOpen:function(){
      const inputNum=document.getElementById('orden_numero');
      const inputLote=document.getElementById('orden_lote');
      const statNum=document.getElementById('orden_numero_status');
      const statLote=document.getElementById('orden_lote_status');
      const selPT=document.getElementById('orden_pt');
      const inputCantidad=document.getElementById('orden_cantidad');
      const previewCantidad=document.getElementById('orden_cantidad_preview');

      /* Auto-rellenar con sugerido */
      if(sugerido && inputNum && !inputNum.value.trim()){
        inputNum.value = sugerido;
      }

      /* Validación en vivo: número OP */
      const validarNum=debounce(async function(){
        const v=inputNum.value.trim().replace(cfg.prefijoOP,'');
        if(!v){statNum.className='field-validate';statNum.textContent='';return;}
        const completo=cfg.prefijoOP+v;
        try{
          const r=await api('ordenes_semanales?numero_op=eq.'+encodeURIComponent(completo)+'&select=id&limit=1');
          if(r.length){statNum.className='field-validate err';statNum.textContent='✕ Ya existe una OP con este número';}
          else{statNum.className='field-validate ok';statNum.textContent='✓ Número disponible';}
        }catch(e){statNum.className='field-validate';statNum.textContent='';}
      },400);

      /* Validación en vivo: lote */
      const validarLote=debounce(async function(){
        const v=inputLote.value.trim();
        if(!v){statLote.className='field-validate';statLote.textContent='';return;}
        try{
          const r=await api('ordenes_semanales?lote=eq.'+encodeURIComponent(v)+'&select=id&limit=1');
          if(r.length){statLote.className='field-validate err';statLote.textContent='✕ Ya existe una OP con este lote';}
          else{statLote.className='field-validate ok';statLote.textContent='✓ Lote disponible';}
        }catch(e){statLote.className='field-validate';statLote.textContent='';}
      },400);

      inputNum.addEventListener('input',validarNum);
      inputLote.addEventListener('input',validarLote);

      /* Preview en vivo de cajas */
      function actualizarPreviewCantidad(){
        const opt=selPT.options[selPT.selectedIndex];
        if(!opt){previewCantidad.textContent='';return;}
        const caja=parseInt(opt.dataset.caja,10)||1;
        const cant=parseFloat(inputCantidad.value)||0;
        if(cant>0&&caja>1){
          const cajas=Math.ceil(cant/caja);
          previewCantidad.textContent='≈ '+cajas+' caja'+(cajas===1?'':'s')+' de '+caja;
        } else {
          previewCantidad.textContent='';
        }
      }
      selPT.addEventListener('change',actualizarPreviewCantidad);
      inputCantidad.addEventListener('input',actualizarPreviewCantidad);
      actualizarPreviewCantidad();

      /* Botón "usar sugerido" */
      const btnUsar=document.getElementById('btnUsarSugerido');
      if(btnUsar){
        btnUsar.addEventListener('click',function(){
          inputNum.value=sugerido;
          inputNum.dispatchEvent(new Event('input'));
        });
      }

      /* Botón calcular cobertura */
      document.getElementById('nuevaop_calcular').addEventListener('click',async function(ev){
        const codigo_pt=selPT.value;
        const cantidad=parseFloat(inputCantidad.value);
        const numOp=inputNum.value.trim();
        const lote=inputLote.value.trim();
        if(!codigo_pt||!cantidad||cantidad<=0){toast('Selecciona producto y una cantidad válida.','error');return;}
        if(!numOp){toast('El número de OP es obligatorio.','error');return;}

        /* Guardar contexto para el modal de cobertura y para cobConfirmar */
        const optPT=selPT.options[selPT.selectedIndex];
        const fechaIni = document.getElementById('orden_fecha_programada').value||null;
        const fechaFin = document.getElementById('orden_fecha_fin').value||null;

        if(!fechaIni) {
          toast('Debes asignar una fecha de inicio para programar la OP.', 'error');
          return;
        }

        if(fechaIni && fechaFin && fechaFin < fechaIni) {
          toast('La fecha de fin no puede ser anterior a la de inicio.', 'error');
          return;
        }

        _nuevaOPCtx={
          codigo_pt:codigo_pt,
          cantidad:cantidad,
          numOp:numOp,
          lote:lote||null,
          nombrePT:optPT?optPT.textContent:'',
          prioridad:document.getElementById('orden_prioridad').value,
          fecha_programada:fechaIni,
          fecha_fin_programada:fechaFin
        };

        await withLoading(ev.currentTarget,async function(){
          try{
            const res=await calcularCobertura(codigo_pt,cantidad);
            abrirModalCobertura(res,_nuevaOPCtx);
          }catch(e){toast('Error calculando cobertura: '+traducirError(e.message),'error');}
        });
      });

      document.getElementById('nuevaop_cancelar').addEventListener('click',function(){
        _nuevaOPCtx=null;
        cerrarModalGenerico();
      });
    },
    onClose:function(){
      /* Limpiar contexto si el usuario cierra sin confirmar
         (pero solo si el modal de cobertura NO está abierto encima) */
      setTimeout(function(){
        const cob=document.getElementById('coberturaModal');
        if(!cob || !cob.classList.contains('open')){
          _nuevaOPCtx=null;
        }
      },200);
    }
  });
}

/* ============ MODAL DE COBERTURA ============ */
let _cobCtx=null;

function abrirModalCobertura(res,ctx){
  _cobCtx={res:res,codigo_pt:ctx.codigo_pt,cantidad:ctx.cantidad,numOp:ctx.numOp,nombrePT:ctx.nombrePT};

  /* Variables derivadas (usadas en el resto de la función) */
  const codigo_pt=ctx.codigo_pt;
  const cantidad=ctx.cantidad;
  const numOp=ctx.numOp;
  const nombrePT=ctx.nombrePT;
  const overlay=document.getElementById('coberturaModal');
  if(!overlay) return;

  const detalle=res.detalle||[];
  const detalleSub=res.detalleSub||[];
  const eg=res.estado_general;

  /* Header */
  document.getElementById('cobIcon').className='modal-icon '+(eg==='Cubierto'?'success':(eg==='Reorden'?'warn':'danger'));
  document.getElementById('cobIcon').textContent=eg==='Cubierto'?'✓':(eg==='Reorden'?'!':'⚠');
  document.getElementById('cobTitle').textContent='Cobertura: '+eg;
  document.getElementById('cobSubtitle').textContent=nombrePT+' · '+num(cantidad)+' u'+(numOp?' · OP '+numOp:'');

  /* KPIs */
  const nCub=detalle.filter(function(d){return d.estado==='Cubierto';}).length;
  const nReo=detalle.filter(function(d){return d.estado==='Reorden';}).length;
  const nUrg=detalle.filter(function(d){return d.estado==='Urgente';}).length;
  document.getElementById('cobKpis').innerHTML=
    '<span class="badge success">'+nCub+' cubiertos</span>'+
    '<span class="badge warning">'+nReo+' en reorden</span>'+
    '<span class="badge danger">'+nUrg+' urgentes</span>'+
    '<span style="color:var(--text-muted);font-size:12px;">'+detalle.length+' insumo'+(detalle.length===1?'':'s')+' · '+detalleSub.length+' subproducto'+(detalleSub.length===1?'':'s')+'</span>';

  /* --- Data para los gráficos --- */
  // Existencia vs consumo: top 12 por consumo
  const topIns=detalle.slice().sort(function(a,b){return b.consumo_total-a.consumo_total;}).slice(0,12);
  // Cobertura %: insumos más críticos (menor ratio existencia/consumo)
  const coberturaIns=detalle
    .filter(function(d){return d.consumo_total>0;})
    .map(function(d){
      const pct=d.consumo_total>0?(d.existencia_consumo/d.consumo_total)*100:0;
      return Object.assign({},d,{cobertura_pct:pct});
    })
    .sort(function(a,b){return a.cobertura_pct-b.cobertura_pct;})
    .slice(0,12);
  // Faltantes: solo los que tienen faltante > 0
  const faltantesIns=detalle.filter(function(d){return d.faltante>0;}).sort(function(a,b){return b.faltante-a.faltante;}).slice(0,12);

  /* --- Tablas --- */
  const tablaInsumos=(detalle.length===0?'<div class="empty-state">Sin insumos directos en la receta.</div>':'<table><tr><th>Insumo</th><th class="num">Existencia</th><th class="num">Consumo</th><th class="num">Faltante</th><th>Estado</th></tr>'+detalle.map(function(d){return '<tr><td>'+d.nombre+'</td><td class="num">'+num(d.existencia_consumo)+' '+d.unidad+'</td><td class="num">'+num(d.consumo_total)+' '+d.unidad+'</td><td class="num">'+(d.faltante>0?'<span style="color:var(--danger);">'+num(d.faltante)+' '+d.unidad+'</span>':'—')+'</td><td>'+badgeFor(d.estado)+'</td></tr>';}).join('')+'</table>');
  const tablaSubs=(detalleSub.length===0?'':'<div class="divider-label">Subproductos requeridos (se consumen de su stock)</div><table><tr><th>Subproducto</th><th>Tipo</th><th class="num">Stock actual</th><th class="num">Requerido</th><th class="num">Faltante</th><th>Estado</th></tr>'+detalleSub.map(function(s){
    return '<tr><td>'+s.nombre+' <span class="mono" style="color:var(--text-muted);font-size:11.5px;">'+s.codigo+'</span></td><td>'+badgeTipoSub(s.tipo)+'</td><td class="num">'+num(s.stock_actual)+'</td><td class="num">'+num(s.requerido)+' u</td><td class="num">'+(s.faltante>0?'<span style="color:var(--danger);">'+num(s.faltante)+' u</span>':'—')+'</td><td>'+badgeFor(s.estado)+'</td></tr>';
  }).join('')+'</table>');

  /* --- Bloques de gráficos --- */
  const chartCoberturaHTML=(coberturaIns.length>=2)?'<div class="chart-cell"><div class="section-title" style="padding:0 0 6px;margin:0;">Cobertura más crítica (existencia / consumo)</div><div style="position:relative;height:220px;"><canvas id="cobChartCobertura"></canvas></div></div>':'';
  const chartsRow1=chartCoberturaHTML?'<div class="cob-charts-row">'+chartCoberturaHTML+'</div>':'';
  const chartTopHTML=(topIns.length>=3)?'<div class="divider-label">Top insumos por consumo · existencia vs requerido</div><div style="padding:14px 18px;"><div style="position:relative;height:'+Math.max(180,topIns.length*32)+'px;"><canvas id="cobChart"></canvas></div></div>':'';
  const chartFaltHTML=(faltantesIns.length>=1)?'<div class="divider-label">Magnitud de faltantes por insumo</div><div style="padding:14px 18px;"><div style="position:relative;height:'+Math.max(160,faltantesIns.length*34)+'px;"><canvas id="cobChartFaltantes"></canvas></div></div>':'';

  /* Banner */
  const hayFaltantes = detalle.some(function(d){return d.faltante>0;}) || detalleSub.some(function(s){return s.faltante>0;});
  const bannerHTML = hayFaltantes
    ? '<div class="alert-banner danger" style="margin-bottom:16px;"><div class="alert-icon">⚠</div><div class="alert-body"><strong>Faltantes detectados.</strong><span>Hay insumos o subproductos sin existencia suficiente. Revisá el detalle abajo antes de confirmar la OP.</span></div></div>'
    : (eg==='Reorden'
        ? '<div class="alert-banner warning" style="margin-bottom:16px;"><div class="alert-icon">!</div><div class="alert-body"><strong>Todo cubierto, algunos en reorden.</strong><span>Los insumos listados alcanzan para esta OP, pero quedarían por debajo del punto de reorden. Considera reponer.</span></div></div>'
        : '');

  document.getElementById('cobBody').innerHTML=
    bannerHTML+
    chartsRow1+
    chartTopHTML+
    chartFaltHTML+
    tablaInsumos+
    tablaSubs;

  /* Footer */
  const btnConfirmar=document.getElementById('cobConfirmar');
  btnConfirmar.disabled = false; /* Siempre permitimos confirmar */
  btnConfirmar.textContent = (eg==='Urgente') ? 'Confirmar (con faltantes)' : 'Confirmar orden';
  btnConfirmar.title = (eg==='Urgente') ? 'La OP se guardará en estado Pendiente y aparecerá en el consolidado de compras.' : 'Guardar la OP';

  /* MOVER AL FINAL DEL BODY PARA QUE QUEDE ENCIMA DEL MODAL DINÁMICO */
  const cobModal = document.getElementById('coberturaModal');
  if (cobModal) document.body.appendChild(cobModal);

  _abrirOverlay('coberturaModal');

  /* --- Render de gráficos --- */
  setTimeout(function(){
    if(typeof Chart==='undefined')return;
    _initChartDefaults();
    const cs=getComputedStyle(document.documentElement);
    const borderC=cs.getPropertyValue('--border').trim()||'#2b3140';
    const textC=cs.getPropertyValue('--text-secondary').trim()||'#8d95a6';
    const surf3=cs.getPropertyValue('--surface-3').trim()||'#262c3b';

    /* Bar horizontal: cobertura % de los insumos más críticos */
    const elCob=document.getElementById('cobChartCobertura');
    if(elCob && coberturaIns.length>=2){
      _destroyChart('cobChartCobertura');
      const labels=coberturaIns.map(function(d){return d.nombre.length>30?d.nombre.slice(0,28)+'…':d.nombre;});
      const data=coberturaIns.map(function(d){return Number(d.cobertura_pct.toFixed(1));});
      const colors=data.map(function(p){return p>=100?'#3ddc84':(p>=50?'#ffb020':'#ff5c5c');});
      chartInstances['cobChartCobertura']=new Chart(elCob,{
        type:'bar',
        data:{labels:labels,datasets:[{label:'Cobertura %',data:data,backgroundColor:colors,borderRadius:4}]},
        options:{
          responsive:true,maintainAspectRatio:false,indexAxis:'y',
          plugins:{
            legend:{display:false},
            tooltip:{
              backgroundColor:surf3,borderColor:borderC,borderWidth:1,padding:10,
              callbacks:{label:function(c){
                const d=coberturaIns[c.dataIndex];
                return [
                  'Cobertura: '+c.parsed.x+'%',
                  'Existencia: '+num(d.existencia_consumo)+' '+d.unidad,
                  'Consumo: '+num(d.consumo_total)+' '+d.unidad
                ];
              }}
            }
          },
          scales:{
            x:{grid:{color:borderC},ticks:{color:textC,callback:function(v){return v+'%';}},beginAtZero:true},
            y:{grid:{display:false},ticks:{color:textC,autoSkip:false,font:{size:11}}}
          }
        }
      });
    }

    /* (C) Bar horizontal: top insumos por consumo vs existencia */
    const elTop=document.getElementById('cobChart');
    if(elTop && topIns.length>=3){
      _destroyChart('cobChart');
      chartInstances['cobChart']=new Chart(elTop,{
        type:'bar',
        data:{
          labels:topIns.map(function(d){return d.nombre;}),
          datasets:[
            {label:'Existencia',data:topIns.map(function(d){return Number(d.existencia_consumo)||0;}),backgroundColor:'#3ddc84',borderRadius:4},
            {label:'Consumo requerido',data:topIns.map(function(d){return Number(d.consumo_total)||0;}),backgroundColor:'#ffb020',borderRadius:4}
          ]
        },
        options:{
          responsive:true,maintainAspectRatio:false,indexAxis:'y',
          plugins:{
            legend:{position:'bottom'},
            tooltip:{backgroundColor:surf3,borderColor:borderC,borderWidth:1,padding:10}
          },
          scales:{
            x:{grid:{color:borderC},ticks:{color:textC},beginAtZero:true},
            y:{grid:{display:false},ticks:{color:textC,autoSkip:false,font:{size:11}}}
          }
        }
      });
    }

    /* (D) Bar horizontal: magnitud de faltantes */
    const elFalt=document.getElementById('cobChartFaltantes');
    if(elFalt && faltantesIns.length>=1){
      _destroyChart('cobChartFaltantes');
      chartInstances['cobChartFaltantes']=new Chart(elFalt,{
        type:'bar',
        data:{
          labels:faltantesIns.map(function(d){return d.nombre;}),
          datasets:[{label:'Faltante',data:faltantesIns.map(function(d){return Number(d.faltante)||0;}),backgroundColor:'#ff5c5c',borderRadius:4}]
        },
        options:{
          responsive:true,maintainAspectRatio:false,indexAxis:'y',
          plugins:{
            legend:{display:false},
            tooltip:{
              backgroundColor:surf3,borderColor:borderC,borderWidth:1,padding:10,
              callbacks:{label:function(c){
                const d=faltantesIns[c.dataIndex];
                return 'Faltan: '+num(c.parsed.x)+' '+d.unidad;
              }}
            }
          },
          scales:{
            x:{grid:{color:borderC},ticks:{color:textC},beginAtZero:true},
            y:{grid:{display:false},ticks:{color:textC,autoSkip:false,font:{size:11}}}
          }
        }
      });
    }
  },60);
}

function cerrarModalCobertura(){
  const overlay=document.getElementById('coberturaModal');
  if(overlay) _cerrarOverlay('coberturaModal');
  _destroyChart('cobChart');
  _destroyChart('cobChartCobertura');
  _destroyChart('cobChartFaltantes');
  _cobCtx=null;
  
  /* Si la pila de modales está vacía (es decir, ya no está Nueva OP detrás),
     limpiamos el contexto de la OP. Si el usuario canceló la cobertura,
     la pila sigue teniendo el modal de Nueva OP, así que NO limpiamos el contexto. */
  if(_modalStack.length === 0){
    _nuevaOPCtx=null;
  }
}

(function initModalCobertura(){
  const overlay=document.getElementById('coberturaModal');
  if(!overlay) return;
  document.getElementById('cobClose').addEventListener('click',cerrarModalCobertura);
  document.getElementById('cobCancelar').addEventListener('click',cerrarModalCobertura);
  /* Click fuera NO cierra el modal: solo botones o ESC */
  document.addEventListener('keydown',function(ev){
    if(ev.key==='Escape' && overlay.classList.contains('open')) cerrarModalCobertura();
  });

  document.getElementById('cobConfirmar').addEventListener('click',async function(ev2){
    if(!_cobCtx) return;
    const {res,codigo_pt,cantidad,numOp,nombrePT}=_cobCtx;
    const cfg=getConfig();
    const numOpLimpio=String(numOp||'').replace(cfg.prefijoOP,'').trim();
    if(!numOpLimpio){
      toast('El número de OP es obligatorio. Cerralo y llenalo antes de confirmar.','error');
      return;
    }
    const numeroCompletoPrev=cfg.prefijoOP+numOpLimpio;
    /* Los datos de lote/prioridad/fecha vienen del contexto de Nueva OP,
       porque el formulario puede estar cerrado o fuera de foco. */
    const ctx=_nuevaOPCtx||{};
    const lotePrev=(ctx.lote||'').trim();
    try{
      const dupOP=await api('ordenes_semanales?numero_op=eq.'+encodeURIComponent(numeroCompletoPrev)+'&select=id&limit=1');
      if(dupOP.length){toast('Ya existe una OP con ese número.','error');return;}
      if(lotePrev){
        const dupLote=await api('ordenes_semanales?lote=eq.'+encodeURIComponent(lotePrev)+'&select=id&limit=1');
        if(dupLote.length){toast('Ya existe una OP con ese lote.','error');return;}
      }
    }catch(e){console.warn('Chequeo de duplicado falló:',e);}

    await withLoading(ev2.currentTarget,async function(){
      try{
        const numeroCompleto=cfg.prefijoOP+numOpLimpio;
        const lote=lotePrev||null;
        const detalleGuardar={insumos:res.detalle,subproductos:res.detalleSub};
        const prioridadRaw=ctx.prioridad!=null?String(ctx.prioridad):'3';
        const prioridad=prioridadRaw?parseInt(prioridadRaw,10):3;
        const fechaProg=ctx.fecha_programada||null;
        const fechaFinProg=ctx.fecha_fin_programada||null;

        await rpc('confirmar_orden',{
          p_codigo_pt:codigo_pt,
          p_cantidad:cantidad,
          p_estado_cobertura:res.estado_general,
          p_detalle:detalleGuardar,
          p_numero_op:numeroCompleto,
          p_cantidad_cajas:null,
          p_lote:lote,
          p_prioridad:prioridad,
          p_fecha_programada:fechaProg
        });

        /* Actualizar la fecha fin (ya que el RPC no la recibe por retrocompatibilidad) */
        if(fechaFinProg) {
          await api('ordenes_semanales?numero_op=eq.'+encodeURIComponent(numeroCompleto), {
            method: 'PATCH',
            body: JSON.stringify({ fecha_fin_programada: fechaFinProg })
          });
        }
        /* Actualizar explícitamente las fechas en la BD para asegurar que se guarden */
        if(fechaProg) {
          await api('ordenes_semanales?numero_op=eq.'+encodeURIComponent(numeroCompleto), {
            method: 'PATCH',
            body: JSON.stringify({ 
              fecha_programada: fechaProg,
              fecha_fin_programada: fechaFinProg || null
            })
          });
        }

        toast('Orden registrada.','success');
        cerrarModalCobertura();
        _nuevaOPCtx=null;
        
        /* Cerrar también el modal de Nueva OP si sigue abierto detrás */
        if(_modalStack.length > 0){
          cerrarModalGenerico();
        }
        renderOrden();
      }catch(e){toast(e.message,'error');}
    });
  });
})();

async function abrirModalDetalleOrden(orden){
  if(!orden)return;

  const producida=Number(orden.cantidad_producida)||0;
  const proyectada=Number(orden.cantidad_proyectada)||0;
  const pendiente=proyectada-producida;
  const pct=proyectada>0?Math.round(producida/proyectada*100):0;

  let insumosDet = [];
  let subsDet = [];
  let estadoReal = orden.estado_cobertura || 'Cubierto';

  if (pendiente > 0) {
    showLoader('Recalculando stock en tiempo real...');
    try {
      // Calcular cobertura solo para lo que FALTA producir
      const res = await calcularCobertura(orden.codigo_pt, pendiente);
      insumosDet = res.detalle || [];
      subsDet = res.detalleSub || [];
      estadoReal = res.estado_general;

      // Si el estado cambió (ej. de Urgente a Cubierto), lo actualizamos en la base de datos
      if (orden.estado_cobertura !== estadoReal) {
        await api('ordenes_semanales?id=eq.'+orden.id, {
          method: 'PATCH',
          body: JSON.stringify({
            estado_cobertura: estadoReal,
            detalle_faltantes: {insumos: insumosDet, subproductos: subsDet}
          })
        });
        // Actualizamos el objeto local
        orden.estado_cobertura = estadoReal;
        orden.detalle_faltantes = {insumos: insumosDet, subproductos: subsDet};
      }
    } catch(e) {
      console.warn('Error recalculando cobertura, usando datos estáticos:', e);
      const d = orden.detalle_faltantes || {};
      insumosDet = Array.isArray(d) ? d : (d.insumos || []);
      subsDet = Array.isArray(d) ? [] : (d.subproductos || []);
    } finally {
      hideLoader();
    }
  } else {
    estadoReal = 'Terminada';
  }

  const prodNombre=orden.productos_terminados?orden.productos_terminados.nombre:orden.codigo_pt;
  const titulo=(orden.numero_op||'OP —')+(orden.lote?' · lote '+orden.lote:'');

  const progresoHtml='<div class="grid-cards" style="margin:0 0 16px;grid-template-columns:repeat(3,minmax(0,1fr));">'+
    '<div class="stat-card neutral"><p class="stat-label">Proyectado</p><p class="stat-value" style="font-size:18px;">'+num(proyectada)+' u</p></div>'+
    '<div class="stat-card '+(producida>=proyectada?'success':'info')+'"><p class="stat-label">Entregado ('+pct+'%)</p><p class="stat-value" style="font-size:18px;">'+num(producida)+' u</p></div>'+
    '<div class="stat-card '+(pendiente>0?'warning':'neutral')+'"><p class="stat-label">Pendiente</p><p class="stat-value" style="font-size:18px;">'+num(pendiente)+' u</p></div>'+
    '</div>';

  const tablaIns=(insumosDet.length===0?'<div class="divider-label" style="padding-left:0;">Insumos proyectados</div><div class="empty-state" style="padding:16px 0;">Sin insumos en el detalle.</div>':'<div class="divider-label" style="padding-left:0;">Insumos proyectados</div><table><tr><th>Insumo</th><th class="num">Consumo</th><th class="num">Faltante</th><th>Estado</th></tr>'+insumosDet.map(function(x){return '<tr><td>'+x.nombre+'</td><td class="num">'+num(x.consumo_total)+' '+(x.unidad||'')+'</td><td class="num">'+(x.faltante>0?'<span style="color:var(--danger);">'+num(x.faltante)+' '+(x.unidad||'')+'</span>':'—')+'</td><td>'+badgeFor(x.estado)+'</td></tr>';}).join('')+'</table>');
  const tablaSubs=(subsDet.length===0?'':'<div class="divider-label" style="padding-left:0;">Subproductos requeridos</div><table><tr><th>Subproducto</th><th class="num">Requerido</th><th class="num">Stock al confirmar</th><th class="num">Faltante</th><th>Estado</th></tr>'+subsDet.map(function(x){return '<tr><td>'+x.nombre+' <span class="mono" style="color:var(--text-muted);font-size:11.5px;">'+(x.codigo||'')+'</span></td><td class="num">'+num(x.requerido)+' u</td><td class="num">'+num(x.stock_actual)+'</td><td class="num">'+(x.faltante>0?'<span style="color:var(--danger);">'+num(x.faltante)+' u</span>':'—')+'</td><td>'+badgeFor(x.estado)+'</td></tr>';}).join('')+'</table>');

  abrirModalGenerico({
    title: titulo,
    subtitle: prodNombre,
    icon: '📋',
    variant: 'info',
    size: 'wide',
    body: progresoHtml + tablaIns + tablaSubs + '<div id="modalDetalleEntregas"></div>',
    footer: '<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button class="ghost" id="det_imprimir" title="Imprimir orden de producción">'+icono('printer','sm')+' Imprimir OP</button><button id="det_cerrar">Cerrar</button></div>',
    onOpen: function(){
      document.getElementById('det_cerrar').addEventListener('click',cerrarModalGenerico);
      document.getElementById('det_imprimir').addEventListener('click',function(){ imprimirOP(orden); });

      /* Cargar entregas async (no bloquea el render del modal) */
      const contEnt=document.getElementById('modalDetalleEntregas');
      contEnt.innerHTML='<div class="divider-label" style="padding-left:0;">Historial de entregas</div><div style="padding:16px 0;text-align:center;color:var(--text-muted);font-size:12.5px;">Cargando…</div>';
      (async function(){
        try{
          const entregas=await api('entregas_op?orden_id=eq.'+orden.id+'&select=*&order=fecha.asc');
          if(entregas.length===0){
            contEnt.innerHTML='<div class="divider-label" style="padding-left:0;">Historial de entregas</div><div class="empty-state" style="padding:16px 0;">Sin entregas registradas todavía.</div>';
          } else {
            contEnt.innerHTML='<div class="divider-label" style="padding-left:0;">Historial de entregas · '+entregas.length+'</div>'+
              '<table><tr><th>#</th><th>Fecha</th><th class="num">Cantidad</th><th>Lote</th><th>Motivo</th><th>Usuario</th></tr>'+
              entregas.map(function(e,idx){
                return '<tr><td class="mono">'+(idx+1)+'</td>'+
                  '<td class="mono" style="font-size:12px;color:var(--text-secondary);">'+new Date(e.fecha).toLocaleString('es-CO')+'</td>'+
                  '<td class="num">'+num(e.cantidad)+' u</td>'+
                  '<td class="mono" style="font-size:12px;">'+(e.lote_entrega||'—')+'</td>'+
                  '<td style="color:var(--text-secondary);font-size:12px;">'+(e.motivo||'—')+'</td>'+
                  '<td style="color:var(--text-secondary);font-size:12px;">'+(e.usuario_email||'—')+'</td>'+
                  '</tr>';
              }).join('')+'</table>';
          }
        }catch(err){
          contEnt.innerHTML='<div class="divider-label" style="padding-left:0;">Historial de entregas</div><div class="empty-state" style="padding:16px 0;">No se pudo cargar el historial.</div>';
        }
      })();
    }
  });
}


function imprimirOP(orden){
  if(!orden) return;
  const d = orden.detalle_faltantes || {};
  const insumosDet = Array.isArray(d) ? d : (d.insumos || []);
  const subsDet = Array.isArray(d) ? [] : (d.subproductos || []);
  const prodNombre = orden.productos_terminados ? orden.productos_terminados.nombre : orden.codigo_pt;
  const proyectada = Number(orden.cantidad_proyectada) || 0;
  const producida = Number(orden.cantidad_producida) || 0;
  const pendiente = proyectada - producida;

  const infoGrid = '<div class="print-info-grid">'
    +'<div><div class="lbl">N° de OP</div><div class="val">'+(orden.numero_op||'—')+'</div></div>'
    +'<div><div class="lbl">Lote</div><div class="val">'+(orden.lote||'—')+'</div></div>'
    +'<div><div class="lbl">Prioridad</div><div class="val">'+(prioridadLabel(orden.prioridad)||'—')+'</div></div>'
    +'<div><div class="lbl">Producto</div><div class="val">'+prodNombre+'</div></div>'
    +'<div><div class="lbl">Cantidad proyectada</div><div class="val">'+num(proyectada)+' u</div></div>'
    +'<div><div class="lbl">Estado</div><div class="val">'+(orden.estado_op||'—')+'</div></div>'
    +'<div><div class="lbl">Producido</div><div class="val">'+num(producida)+' u</div></div>'
    +'<div><div class="lbl">Pendiente</div><div class="val">'+num(pendiente)+' u</div></div>'
    +'<div><div class="lbl">Fecha inicio</div><div class="val">'+(orden.fecha_programada ? new Date(orden.fecha_programada+'T00:00:00').toLocaleDateString('es-CO') : '—')+'</div></div>'
    +'<div><div class="lbl">Fecha fin</div><div class="val">'+(orden.fecha_fin_programada ? new Date(orden.fecha_fin_programada+'T00:00:00').toLocaleDateString('es-CO') : '—')+'</div></div>'
    +'</div>';

  const qrText = 'OP:'+(orden.numero_op||'')+'|LOTE:'+(orden.lote||'')+'|PT:'+(orden.codigo_pt||'')+'|CANT:'+proyectada;
  const qr = qrSVG(qrText, 80);
  const qrBlock = qr ? '<div class="print-qr-block">'+qr
    +'<div><b>Código de trazabilidad</b><br>OP '+(orden.numero_op||'')+(orden.lote?' · Lote '+orden.lote:'')+'</div></div>' : '';

  let tablaIns = '';
  if(insumosDet.length){
    tablaIns = '<div class="print-section-title">Insumos proyectados</div>'
      +'<table class="print-table"><thead><tr>'
      +'<th>Insumo</th><th class="num">Consumo requerido</th><th class="num">Existencia al confirmar</th><th class="num">Faltante</th><th>Estado</th>'
      +'</tr></thead><tbody>'
      +insumosDet.map(function(x){
        const uni = x.unidad || '';
        const ex = x.existencia_consumo != null ? num(x.existencia_consumo) : (x.existencia != null ? num(x.existencia) : '—');
        return '<tr>'
          +'<td>'+x.nombre+'</td>'
          +'<td class="num">'+num(x.consumo_total)+' '+uni+'</td>'
          +'<td class="num">'+ex+' '+uni+'</td>'
          +'<td class="num">'+(x.faltante>0?num(x.faltante)+' '+uni:'—')+'</td>'
          +'<td>'+(x.estado||'')+'</td>'
          +'</tr>';
      }).join('')
      +'</tbody></table>';
  }

  let tablaSubs = '';
  if(subsDet.length){
    tablaSubs = '<div class="print-section-title">Subproductos requeridos</div>'
      +'<table class="print-table"><thead><tr>'
      +'<th>Subproducto</th><th>Tipo</th><th class="num">Requerido</th><th class="num">Stock al confirmar</th><th class="num">Faltante</th><th>Estado</th>'
      +'</tr></thead><tbody>'
      +subsDet.map(function(x){
        return '<tr>'
          +'<td>'+x.nombre+' <small style="color:#666;">'+(x.codigo||'')+'</small></td>'
          +'<td>'+(x.tipo||'')+'</td>'
          +'<td class="num">'+num(x.requerido)+' u</td>'
          +'<td class="num">'+num(x.stock_actual)+'</td>'
          +'<td class="num">'+(x.faltante>0?num(x.faltante)+' u':'—')+'</td>'
          +'<td>'+(x.estado||'')+'</td>'
          +'</tr>';
      }).join('')
      +'</tbody></table>';
  }

  const firmas = '<div class="print-signatures">'
    +'<div class="print-signature"><div class="name">Elaboró</div><div class="role">Producción</div></div>'
    +'<div class="print-signature"><div class="name">Revisó</div><div class="role">Calidad</div></div>'
    +'<div class="print-signature"><div class="name">Aprobó</div><div class="role">Dirección Técnica</div></div>'
    +'</div>';

  const html = printHeaderHTML('Orden de Producción',
      'N° '+(orden.numero_op||'—')+(orden.lote?' · Lote '+orden.lote:''))
    + infoGrid
    + qrBlock
    + tablaIns
    + tablaSubs
    + firmas
    + printFooterHTML();

  imprimirHTML(html, 'OP '+(orden.numero_op||''));
}

/* ============ ENTREGA PARCIAL DE OP ============ */
let entregaOrdenActual=null;

function abrirModalEntrega(orden){
  if(!orden) return;
  entregaOrdenActual=orden;
  const overlay=document.getElementById('entregaModal');
  if(!overlay) return;

  const producida=Number(orden.cantidad_producida)||0;
  const proyectada=Number(orden.cantidad_proyectada)||0;
  const pendiente=proyectada-producida;

  if(pendiente<=0){
    toast('Esta OP ya tiene todo entregado.','error');
    return;
  }

  const prodNombre=orden.productos_terminados?orden.productos_terminados.nombre:orden.codigo_pt;
  document.getElementById('entregaTitulo').textContent='Registrar entrega · '+prodNombre;
  document.getElementById('entregaSubtitulo').textContent=
    (orden.numero_op||'')+(orden.lote?' · lote '+orden.lote:'');

  document.getElementById('entregaInfo').innerHTML=
    '<div class="grid-cards" style="margin:0;grid-template-columns:repeat(3,minmax(0,1fr));">'+
      '<div class="stat-card neutral"><p class="stat-label">Proyectado</p><p class="stat-value" style="font-size:16px;">'+num(proyectada)+'</p></div>'+
      '<div class="stat-card success"><p class="stat-label">Ya entregado</p><p class="stat-value" style="font-size:16px;">'+num(producida)+'</p></div>'+
      '<div class="stat-card warning"><p class="stat-label">Pendiente</p><p class="stat-value" style="font-size:16px;">'+num(pendiente)+'</p></div>'+
    '</div>';

  const inp=document.getElementById('entregaCantidad');
  inp.value=String(pendiente);
  inp.max=String(pendiente);
  inp.min='0.0001';

  document.getElementById('entregaLote').value='';
  document.getElementById('entregaMotivo').value='';
  document.getElementById('entregaError').style.display='none';
  document.getElementById('entregaError').textContent='';

  _abrirOverlay('entregaModal');
  setTimeout(function(){inp.focus();inp.select();},80);
}

function cerrarModalEntrega(){
  const overlay=document.getElementById('entregaModal');
  if(overlay) _cerrarOverlay('entregaModal');
  entregaOrdenActual=null;
}

(function initModalEntrega(){
  const overlay=document.getElementById('entregaModal');
  if(!overlay) return;

  document.getElementById('entregaCancelar').addEventListener('click',cerrarModalEntrega);
  /* Click fuera NO cierra el modal: solo botones o ESC */
  document.addEventListener('keydown',function(ev){
    if(ev.key==='Escape' && overlay.classList.contains('open')) cerrarModalEntrega();
  });

  document.getElementById('entregaConfirmar').addEventListener('click',async function(ev){
    if(!entregaOrdenActual) return;
    const orden=entregaOrdenActual;
    const cantidad=parseFloat(document.getElementById('entregaCantidad').value);
    const lote=document.getElementById('entregaLote').value.trim()||null;
    const motivo=document.getElementById('entregaMotivo').value.trim()||null;
    const errBox=document.getElementById('entregaError');
    errBox.style.display='none';

    const producida=Number(orden.cantidad_producida)||0;
    const pendiente=Number(orden.cantidad_proyectada)-producida;

    if(!cantidad||cantidad<=0){
      errBox.textContent='Ingresa una cantidad mayor a cero.';
      errBox.style.display='block';
      return;
    }
    if(cantidad>pendiente){
      errBox.textContent='La cantidad excede el pendiente ('+num(pendiente)+').';
      errBox.style.display='block';
      return;
    }

    await withLoading(ev.currentTarget,async function(){
      try{
        const r=await rpc('registrar_entrega_op',{
          p_orden_id:orden.id,
          p_cantidad:cantidad,
          p_lote_entrega:lote,
          p_motivo:motivo
        });
        if(r.op_cerrada){
          toast('Entrega registrada · OP CERRADA ('+num(r.cantidad_producida)+'/'+num(orden.cantidad_proyectada)+')','success');
        } else {
          toast('Entrega registrada · '+num(r.cantidad_producida)+'/'+num(orden.cantidad_proyectada)+' · Pendiente: '+num(r.cantidad_pendiente),'success');
        }
        cerrarModalEntrega();
        renderOrden();
      }catch(e){
        const arr=parsearFaltantes(e.message||'');
        if(arr&&arr.length){
          const detalle=arr.map(function(f){return '· '+f.tipo+': '+f.nombre+' (req. '+num(f.requerido)+', hay '+num(f.existencia)+')';}).join('\n');
          errBox.textContent='Stock insuficiente para esta entrega:\n'+detalle;
          errBox.style.display='block';
          errBox.style.whiteSpace='pre-line';
        } else {
          errBox.textContent=e.message;
          errBox.style.display='block';
        }
      }
    });
  });
})();

/* ============ NOVEDADES ============ */
async function renderNovedades(){
  const main=document.getElementById('mainContent');
  const ordenes=await api('ordenes_semanales?select=*,productos_terminados(nombre)&estado_op=in.(Pendiente,En%20proceso)&order=prioridad.asc.nullslast,fecha_creacion.desc');
  const view=applySort(ordenes,'lista_nov',{op:function(o){return o.numero_op||'';},producto:function(o){return o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt;},cantidad:function(o){return o.cantidad_proyectada;},fecha:function(o){return new Date(o.fecha_creacion).getTime();}});
  main.innerHTML=`
    <h2 class="page-title">Novedades de órdenes</h2>
    <p class="page-sub">Historial de órdenes activas (pendientes y en proceso).</p>
    <div class="panel">
      <div class="panel-header"><h3>Órdenes activas</h3>${botonRefreshHTML('novedades')}</div>
      <div class="search-box"><input id="buscar_novedades" placeholder="Buscar por OP o producto…"></div>
      ${ordenes.length===0?'<div class="empty-state">No hay órdenes activas actualmente.</div>':`
      <table id="tablaNovedades"><tr>
        ${thSort('N° OP','op','lista_nov')}
        ${thSort('Producto','producto','lista_nov')}
        ${thSort('Cantidad','cantidad','lista_nov',true)}
        ${thSort('Fecha','fecha','lista_nov')}
        <th>Cobertura</th>
        <th>Estado</th>
        <th class="actions"></th>
      </tr>
        ${view.map(function(o){
          const producida=Number(o.cantidad_producida)||0;
          const proyectada=Number(o.cantidad_proyectada)||0;
          const progresoTxt=proyectada>0&&producida>0?'<br><span style="color:var(--info);font-size:11px;">'+num(producida)+'/'+num(proyectada)+' entregado</span>':'';
          return '<tr><td class="mono">'+(o.numero_op||'—')+'</td><td>'+(o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt)+'</td><td class="num">'+num(o.cantidad_proyectada)+progresoTxt+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+new Date(o.fecha_creacion).toLocaleDateString('es-CO')+'</td><td>'+badgeFor(o.estado_cobertura)+'</td><td>'+badgeOP(o.estado_op)+'</td><td><button class="ghost small" data-nov-detalle="'+o.id+'" title="Ver detalle">Ver detalle</button></td></tr>';
        }).join('')}
      </table>`}
    </div>`;
  filtrarTabla('buscar_novedades','tablaNovedades');
  bindSortHeaders(renderNovedades);
  paginarTabla('tablaNovedades');
    document.querySelectorAll('[data-nov-detalle]').forEach(function(btn){
    btn.addEventListener('click',function(){
      const o=ordenes.find(function(x){return x.id===btn.dataset.novDetalle;});
      abrirModalDetalleOrden(o);
    });
  });
}

/* ============ ENTRADAS ============ */
function imprimirFormatoEntradaAlmacen(mov, nombreInsumo, nombreProveedor) {
  const colorAzul = '#1b75bb';
  const fRecep = new Date(mov.fecha).toLocaleDateString('es-CO');
  
  // Armar el string de lotes
  let lotesStr = mov.lote_insumo || '—';
  
  const cssPrint = `
    @page { size: letter portrait; margin: 15mm; }
    body { padding: 0; font-family: Helvetica, Arial, sans-serif; color: ${colorAzul}; }
    .form-box { border: 2px solid ${colorAzul}; padding: 0; width: 100%; box-sizing: border-box; }
    .form-table { width: 100%; border-collapse: collapse; }
    .form-table td { border: 1px solid ${colorAzul}; padding: 8px 12px; font-size: 10pt; }
    .form-label { font-weight: normal; color: ${colorAzul}; font-size: 10pt; margin-bottom: 4px; display: block; }
    .form-value { font-weight: bold; font-size: 11pt; border-bottom: 1px solid ${colorAzul}; display: block; padding-bottom: 2px; min-height: 18px; }
    .check-box { display: inline-block; width: 40px; border-bottom: 1px solid ${colorAzul}; margin-left: 10px; }
  `;

  const html = `
    <div class="form-box">
      <table class="form-table" style="border: none;">
        <tr>
          <td style="width: 25%; border: none; border-bottom: 1px solid ${colorAzul}; border-right: 1px solid ${colorAzul}; text-align: center;">
            <img src="logo-proclides.png" style="height: 40px;"><br>
            <span style="font-size: 8pt;">Soluciones Estériles</span>
          </td>
          <td colspan="2" style="width: 50%; border: none; border-bottom: 1px solid ${colorAzul}; border-right: 1px solid ${colorAzul}; text-align: center;">
            <div style="font-weight: bold; font-size: 12pt;">ENTRADA DE INSUMOS AL ALMACÉN</div>
            <div style="font-size: 16pt; font-weight: bold; margin-top: 5px;">Nº <span style="color: red;">${mov.numero_entrada_almacen || '______'}</span></div>
          </td>
          <td style="width: 25%; border: none; border-bottom: 1px solid ${colorAzul}; vertical-align: top; font-size: 9pt;">
            Código: FO-AP-04<br>
            Fecha de aprobación: <br>
            Versión 2
          </td>
        </tr>
        
        <tr>
          <td colspan="4" style="border-left:none; border-right:none; border-top:none;">
            <span class="form-label">Descripción del insumo o producto:</span>
            <span class="form-value">${nombreInsumo}</span>
          </td>
        </tr>
        <tr>
          <td colspan="4" style="border-left:none; border-right:none; border-top:none;">
            <span class="form-label">Proveedor:</span>
            <span class="form-value">${nombreProveedor || '—'}</span>
          </td>
        </tr>
        <tr>
          <td colspan="4" style="border-left:none; border-right:none; border-top:none;">
            <span class="form-label">Lote (s):</span>
            <span class="form-value">${lotesStr}</span>
          </td>
        </tr>
        <tr>
          <td colspan="4" style="border-left:none; border-right:none; border-top:none;">
            <span class="form-label">OC:</span>
            <span class="form-value">${mov.numero_oc || '—'}</span>
          </td>
        </tr>
        <tr>
          <td colspan="4" style="border-left:none; border-right:none; border-top:none;">
            <span class="form-label">Número de factura:</span>
            <span class="form-value">${mov.numero_factura || '—'}</span>
          </td>
        </tr>
        
        <tr>
          <td style="width: 33%; border-left:none; text-align: center;">
            <span class="form-label" style="margin:0;">Fecha de recepción</span>
            <div class="form-value" style="border:none; margin-top: 5px;">${fRecep}</div>
          </td>
          <td style="width: 33%; text-align: center;">
            <span class="form-label" style="margin:0;">Cantidad total</span>
            <div class="form-value" style="border:none; margin-top: 5px;">${num(mov.cantidad)}</div>
          </td>
          <td style="width: 33%; border-right:none; text-align: center;">
            <span class="form-label" style="margin:0;">Unidad de empaque</span>
            <div class="form-value" style="border:none; margin-top: 5px;">${mov.unidad_compra || 'UND'}</div>
          </td>
        </tr>
        
        <tr>
          <td colspan="2" style="width: 50%; border-left:none; vertical-align: top;">
            <span class="form-label" style="font-weight:bold; font-size:11pt; margin-bottom: 10px;">Decisión final:</span>
            <div style="margin-bottom: 8px; font-size: 11pt;">Aprobado <span class="check-box" style="text-align:center;">${mov.estado_calidad === 'Aprobado' ? 'X' : ''}</span></div>
            <div style="margin-bottom: 8px; font-size: 11pt;">Rechazado <span class="check-box" style="text-align:center;">${mov.estado_calidad === 'Rechazado' ? 'X' : ''}</span></div>
            <div style="font-size: 11pt;">Cuarentena <span class="check-box" style="text-align:center;">${mov.estado_calidad === 'Cuarentena' ? 'X' : ''}</span></div>
          </td>
          <td colspan="2" style="width: 50%; border-right:none; vertical-align: top;">
            <span class="form-label" style="font-weight:bold; font-size:11pt;">Fecha de aprobación / rechazo / cuarentena</span>
            <div style="margin-top: 15px;"></div>
          </td>
        </tr>
        
        <tr>
          <td colspan="4" style="border-left:none; border-right:none; height: 150px; vertical-align: top;">
            <span class="form-label">Observaciones:</span>
            <div style="font-size: 10pt; margin-top: 5px;">${mov.observaciones_calidad || ''}</div>
          </td>
        </tr>
        
        <tr>
          <td colspan="4" style="border-left:none; border-right:none; border-bottom:none; height: 80px; vertical-align: bottom;">
            <span class="form-label" style="font-weight:bold; font-size:12pt;">Firma</span>
          </td>
        </tr>
      </table>
    </div>
  `;

  imprimirHTML(html, 'Entrada Almacen', cssPrint);
}

async function renderEntradas(){
  const main=document.getElementById('mainContent');
  const [insumos,subproductos,proveedores,movimientos,opsActivas]=await Promise.all([
    api('insumos?select=id,codigo,nombre,unidad_medida,unidad_consumo,conversiones,tipo_conversion,costo_unitario&estado_activo=eq.true&order=nombre'),
    api('subproductos?select=id,codigo,nombre,existencia_actual&order=nombre'),
    api('sys_proveedores?select=id,razon_social&order=razon_social'),
    api('movimientos_inventario?select=*,insumos(nombre,unidad_medida,unidad_consumo),subproductos(nombre,codigo),sys_proveedores(razon_social)&tipo=eq.Entrada&order=fecha.desc&limit=30'),
    api('ordenes_semanales?select=id,numero_op,productos_terminados(nombre)&estado_op=in.(Pendiente,En%20proceso)&order=numero_op.asc')
  ]);
  main.innerHTML=`
    <h2 class="page-title">Entrada de mercancía</h2>
    <p class="page-sub">Insumos: compra a proveedor. Subproductos: producción interna (descuenta los insumos de su receta).</p>
    <div class="panel require-write">
      <div class="form-grid">
        <div><label>Tipo de entrada</label><select id="ent_tipo">
          <option value="insumo">Insumo (compra a proveedor)</option>
          <option value="subproducto">Subproducto (producción interna)</option>
        </select></div>
        <div><label>Item</label><select id="ent_item"></select></div>
        <div><label>Cantidad (<span id="ent_unidad_label">—</span>)</label><input id="ent_cantidad" type="number" step="0.0001" placeholder="1"></div>
        
        <div id="ent_costo_wrap"><label>Costo por unidad de compra</label><input id="ent_costo" type="number" step="0.01" min="0" placeholder="Opcional"></div>
        <div id="ent_prov_wrap"><label>Proveedor</label><select id="ent_proveedor"><option value="">— Sin especificar —</option>${proveedores.map(function(p){return '<option value="'+p.id+'">'+p.razon_social+'</option>';}).join('')}</select></div>
        
        <div id="ent_lote_wrap">
          <label id="ent_lote_label">Lote</label>
          <input id="ent_lote" placeholder="Ej: L-2026-014">
          <div class="field-hint" id="ent_lote_hint" style="display:none; margin-top:6px;">
            <button type="button" class="subtle-toggle" id="btnToggleMultiLote" style="font-size:11.5px; color:var(--accent);">+ Recibir varios lotes</button>
          </div>
        </div>
        
        <div id="ent_motivo_wrap" style="display:none;"><label>Motivo</label><input id="ent_motivo" placeholder="Ej: producción interna, ajuste"></div>

        <!-- Documentos e Información de OC (solo para insumos) -->
        <div id="ent_docs_wrap" class="full-span" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; background:var(--surface-2); padding:14px; border-radius:8px; border:1px solid var(--border); margin-top:8px;">
          <div><label>N° Factura</label><input id="ent_factura" placeholder="Ej: FV-8520"></div>
          <div><label>N° Orden de Compra (OC)</label><input id="ent_oc" placeholder="Ej: OC-2026-014"></div>
          <div><label>N° Entrada Almacén</label><input id="ent_entrada_almacen" placeholder="Ej: EA-1024" title="Puede ser el número de remisión o entrada interna"></div>
          <div><label>Saldo Pendiente de OC</label><input id="ent_pendiente_oc" type="number" step="0.0001" placeholder="Cant. que falta por entregar"></div>
          
          <!-- Nuevos campos de Calidad -->
          <div><label>Decisión de Calidad</label><select id="ent_estado_calidad">
            <option value="Aprobado">Aprobado</option>
            <option value="Rechazado">Rechazado</option>
            <option value="Cuarentena">Cuarentena</option>
          </select></div>
          <div class="full-span"><label>Observaciones de Calidad</label><input id="ent_obs_calidad" placeholder="Ej: Empaque en buen estado, cumple especificaciones..."></div>
        </div>
        
        <div id="ent_motivo_wrap" style="display:none;"><label>Motivo</label><input id="ent_motivo" placeholder="Ej: producción interna, ajuste"></div>
        <div id="ent_op_wrap" style="display:none;"><label>Pertenece a la OP</label><select id="ent_op_id"><option value="">— Sin OP asignada —</option>${opsActivas.map(o => `<option value="${o.id}">${o.numero_op || 'S/N'} - ${o.productos_terminados ? o.productos_terminados.nombre : ''}</option>`).join('')}</select></div>

        <!-- Bloque multi-lote separado para que no rompa el grid principal -->
        <div id="ent_multi_lote_wrap" class="full-span" style="display:none; background:var(--surface-2); padding:14px; border-radius:8px; border:1px solid var(--border); margin-top:8px;">
          <label style="margin-bottom:10px; display:block;">Desglose de Lotes y Cantidades</label>
          <div id="ent_lotes_rows_container" style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;"></div>
          
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <button type="button" class="secondary small" id="btnAddLoteRow">+ Agregar otro lote</button>
            <div style="font-weight:600; font-size:14px; color:var(--accent);">Total a ingresar: <span id="ent_total_multi">0</span></div>
          </div>
          <div class="field-hint" style="margin-top:10px; text-align:right;">
            <button type="button" class="subtle-toggle" id="btnVolverLoteUnico" style="color:var(--danger);">Cancelar y volver a un solo lote</button>
          </div>
        </div>
      </div>
      <div class="form-grid" id="ent_rend_box" style="padding-top:0;display:none;"><div class="full-span"><label>Rendimiento real del lote (unidades de consumo por unidad de compra)</label><input id="ent_rendimiento" type="number" step="0.0001" placeholder="Ej: unidades por kg"></div></div>
      <div class="form-grid" id="ent_prov_link_wrap" style="padding-top:0;"><div class="full-span"><button type="button" class="subtle-toggle" id="btnAbrirNuevoProveedor" title="Crear proveedor">+ El proveedor no está en la lista, crear uno nuevo</button></div></div>
      <div id="ent_preview" style="padding:0 18px 8px;font-size:12.5px;color:var(--text-secondary);"></div>
      <div class="form-actions"><button id="btnRegistrarEntrada" title="Registrar entrada">Registrar entrada</button></div>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Movimientos de entrada recientes</h3></div>
      ${movimientos.length===0?'<div class="empty-state">Sin movimientos.</div>':`
      <table><tr><th>Tipo</th><th>Item</th><th class="num">Cantidad</th><th>Proveedor / Motivo</th><th>OC / Factura</th><th>Fecha</th></tr>
        ${movimientos.map(function(m){
          const esSub=!!m.subproducto_id;
          const tipoBadge=esSub?'<span class="badge warning">Subproducto</span>':'<span class="badge info">Insumo</span>';
          const item=esSub?(m.subproductos?m.subproductos.nombre+' <span class="mono" style="color:var(--text-muted);font-size:11.5px;">'+m.subproductos.codigo+'</span>':'(subproducto)'):(m.insumos?m.insumos.nombre:'(insumo)');
          const cant=esSub?('+'+num(m.cantidad)+' u'):('+'+num(m.cantidad)+' '+(m.insumos?(m.insumos.unidad_consumo||m.insumos.unidad_medida):''));
          const ref=esSub?(m.motivo||'—'):(m.sys_proveedores?m.sys_proveedores.razon_social:(m.motivo||'—'));
          const docs = esSub ? '—' : `<span style="font-size:11px;">${m.numero_oc ? 'OC: '+m.numero_oc : ''} ${m.numero_factura ? ' / Fact: '+m.numero_factura : ''}</span>`;
          const btnPrint = esSub ? '' : `<button class="ghost small icon-only" data-print-entrada="${m.id}" title="Imprimir FO-AP-04">${icono('printer')}</button>`;
          return '<tr><td>'+tipoBadge+'</td><td>'+item+'</td><td class="num">'+cant+'</td><td style="color:var(--text-secondary);font-size:12px;">'+ref+'</td><td>'+docs+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+new Date(m.fecha).toLocaleDateString('es-CO')+'</td><td class="actions">'+btnPrint+'</td></tr>';
        }).join('')}
      </table>`}
    </div>`;
  const selTipo=document.getElementById('ent_tipo');
  const selItem=document.getElementById('ent_item');
  const labelU=document.getElementById('ent_unidad_label');
  const inputCosto=document.getElementById('ent_costo');
  const inputCant=document.getElementById('ent_cantidad');
  const inputRend=document.getElementById('ent_rendimiento');
  const inputMotivo=document.getElementById('ent_motivo');
  const inputLote=document.getElementById('ent_lote');
  const rendBox=document.getElementById('ent_rend_box');
  const costoWrap=document.getElementById('ent_costo_wrap');
  const provWrap=document.getElementById('ent_prov_wrap');
  const provLinkWrap=document.getElementById('ent_prov_link_wrap');
  const motivoWrap=document.getElementById('ent_motivo_wrap');
  const loteWrap=document.getElementById('ent_lote_wrap');
  const loteHint=document.getElementById('ent_lote_hint');
  const multiWrap=document.getElementById('ent_multi_lote_wrap');
  const rowsContainer = document.getElementById('ent_lotes_rows_container');
  const preview=document.getElementById('ent_preview');
  let modoMultiLote=false;

  /* Función para agregar una fila de lote */
  function addLoteRow() {
    const row = document.createElement('div');
    row.className = 'dyn-row conv-recipe';
    row.style.gridTemplateColumns = '1fr 100px auto';
    row.style.padding = '0';
    row.innerHTML = `
      <input type="text" class="multi-lote-name" placeholder="Número de lote" style="margin:0; font-family:'IBM Plex Mono',monospace;">
      <input type="number" class="multi-lote-cant" placeholder="Cant." step="0.0001" min="0.0001" style="margin:0;">
      <button type="button" class="ghost small" title="Quitar" style="margin:0;">×</button>
    `;
    // Bind para actualizar el total
    row.querySelector('.multi-lote-cant').addEventListener('input', actualizarTotalMulti);
    // Bind para eliminar la fila
    row.querySelector('button').addEventListener('click', function(){
      row.remove();
      actualizarTotalMulti();
    });
    rowsContainer.appendChild(row);
    row.querySelector('.multi-lote-name').focus();
  }

  /* Función para calcular el total */
  function actualizarTotalMulti() {
    let total = 0;
    rowsContainer.querySelectorAll('.multi-lote-cant').forEach(inp => {
      total += parseFloat(inp.value) || 0;
    });
    document.getElementById('ent_total_multi').textContent = num(total);
    
    // Reflejar el total en el campo de cantidad principal para que sea visible
    inputCant.value = total > 0 ? total : '';
  }

  function popularItems(){
    if(selTipo.value==='insumo'){
      if(!insumos.length){selItem.innerHTML='<option value="">No hay insumos</option>';}
      else{selItem.innerHTML=insumos.map(function(i){return '<option value="'+i.id+'">'+i.nombre+' ('+unidadConsumo(i)+')</option>';}).join('');}
    } else {
      if(!subproductos.length){selItem.innerHTML='<option value="">No hay subproductos</option>';}
      else{selItem.innerHTML=subproductos.map(function(s){return '<option value="'+s.id+'">'+s.nombre+' ('+s.codigo+')</option>';}).join('');}
    }
    actualizarContexto();
  }
  function actualizarContexto(){
    const esInsumo=selTipo.value==='insumo';
    costoWrap.style.display=esInsumo?'block':'none';
    provWrap.style.display=esInsumo?'block':'none';
    provLinkWrap.style.display=esInsumo?'grid':'none';
    motivoWrap.style.display=esInsumo?'none':'block';
    
    /* Mostrar/Ocultar el selector de OP según el tipo */
    const opWrap = document.getElementById('ent_op_wrap');
    if(opWrap) opWrap.style.display = esInsumo ? 'none' : 'block';
    
    const docsWrap = document.getElementById('ent_docs_wrap');
    if(docsWrap) docsWrap.style.display = esInsumo ? 'grid' : 'none';
    /* Modo multi-lote solo aplica a insumos */
    if(!esInsumo) modoMultiLote=false;

        if(modoMultiLote && esInsumo){
      loteWrap.style.display='none';
      multiWrap.style.display='block';
      inputCant.readOnly = true; // No se oculta, solo se bloquea
      inputCant.style.opacity = '0.6';
      inputCant.style.cursor = 'not-allowed';
    } else {
      loteWrap.style.display='block';
      multiWrap.style.display='none';
      inputCant.readOnly = false;
      inputCant.style.opacity = '1';
      inputCant.style.cursor = 'text';
      
      const loteLabel=document.getElementById('ent_lote_label');
      if(esInsumo){
        if(loteLabel) loteLabel.textContent='Lote del proveedor (opcional)';
        if(loteHint) loteHint.style.display='block';
        inputLote.placeholder='Ej: L-2026-014';
      } else {
        if(loteLabel) loteLabel.textContent='Lote de producción (opcional)';
        if(loteHint) loteHint.style.display='none';
        inputLote.placeholder='Ej: L-2026-014';
        // Si cambiamos a subproducto, forzamos la salida del modo multi-lote
        if (modoMultiLote) {
          document.getElementById('btnVolverLoteUnico').click();
        }
      }
    }
    if(esInsumo){
      const ins=insumos.find(function(i){return i.id===selItem.value;});
      if(!ins){preview.innerHTML='';return;}
      const uC=unidadCompra(ins),uCons=unidadConsumo(ins),f=factorTotal(ins);
      labelU.textContent=uCons;
      inputCosto.placeholder=(ins.costo_unitario&&ins.costo_unitario>0)?'Actual: '+money(ins.costo_unitario*f)+' por '+uC:'Opcional';
      const esVar=ins.tipo_conversion==='variable';
      rendBox.style.display=esVar?'grid':'none';
      if(!esVar)inputRend.value='';
      const cant=parseFloat(inputCant.value)||0;
      const rend=parseFloat(inputRend.value)||f;
      preview.innerHTML=cant>0?'Recibirás <strong>'+num(cant)+' '+uC+'</strong> ≈ <strong>'+num(cant*rend)+' '+uCons+'</strong>'+(esVar?' <span style="color:var(--accent);">(rendimiento por lote)</span>':''):'';
    } else {
      labelU.textContent='unidades';
      rendBox.style.display='none';
      const s=subproductos.find(function(x){return x.id===selItem.value;});
      if(s){
        preview.innerHTML='Al producir <strong>'+num(parseFloat(inputCant.value)||0)+'</strong> se descontarán los insumos y subproductos hijos de su receta. Existencia actual: <strong>'+num(s.existencia_actual)+'</strong>';
      } else preview.innerHTML='';
    }
  }
  selTipo.addEventListener('change',popularItems);
  selItem.addEventListener('change',actualizarContexto);
  inputCant.addEventListener('input',actualizarContexto);
  inputRend.addEventListener('input',actualizarContexto);

  /* Toggle multi-lote */
  const btnToggleMulti=document.getElementById('btnToggleMultiLote');
  const btnVolverUnico=document.getElementById('btnVolverLoteUnico');
  const btnAddRow = document.getElementById('btnAddLoteRow');
  
  if(btnToggleMulti){
    btnToggleMulti.addEventListener('click',function(){
      modoMultiLote=true;
      inputLote.value='';
      rowsContainer.innerHTML = '';
      addLoteRow(); // Agregar la primera fila vacía
      actualizarContexto();
      actualizarTotalMulti();
    });
  }
  if(btnAddRow){
    btnAddRow.addEventListener('click', addLoteRow);
  }
  if(btnVolverUnico){
    btnVolverUnico.addEventListener('click',function(){
      modoMultiLote=false;
      rowsContainer.innerHTML = '';
      inputCant.value = ''; // Limpiar el total
      document.getElementById('ent_multi_lote_wrap').style.display = 'none';
      document.getElementById('ent_lote_wrap').style.display = 'block';
      inputCant.readOnly = false;
      inputCant.style.opacity = '1';
      inputCant.style.cursor = 'text';
      actualizarContexto();
    });
  }

  popularItems();

  /* Bind para imprimir el formato FO-AP-04 */
  document.querySelectorAll('[data-print-entrada]').forEach(btn => {
    btn.addEventListener('click', function() {
      const movId = btn.dataset.printEntrada;
      const mov = movimientos.find(m => m.id === movId);
      if (mov) {
        // Buscar nombre del insumo y proveedor
        const ins = insumos.find(i => i.id === mov.insumo_id);
        const nombreIns = ins ? ins.nombre : '(Insumo)';
        const nombreProv = mov.sys_proveedores ? mov.sys_proveedores.razon_social : '—';
        imprimirFormatoEntradaAlmacen(mov, nombreIns, nombreProv);
      }
    });
  });

  document.getElementById('btnAbrirNuevoProveedor').addEventListener('click',function(){
    abrirModalNuevoProveedor();
  });
  document.getElementById('btnRegistrarEntrada').addEventListener('click',async function(ev){
    const tipo=selTipo.value;
    const itemId=selItem.value;
    const cantidad=parseFloat(inputCant.value);
    if(!itemId||!cantidad||cantidad<=0){toast('Selecciona item y cantidad válida.','error');return;}
    try{
      if(tipo==='insumo'){
        const proveedor_id=document.getElementById('ent_proveedor').value||null;
        const costo=inputCosto.value?parseFloat(inputCosto.value):null;
        const rend=inputRend.value?parseFloat(inputRend.value):null;

        // Recopilar datos de documentos
        const factura = document.getElementById('ent_factura') ? document.getElementById('ent_factura').value.trim() : null;
        const oc = document.getElementById('ent_oc') ? document.getElementById('ent_oc').value.trim() : null;
        const entrada_almacen = document.getElementById('ent_entrada_almacen') ? document.getElementById('ent_entrada_almacen').value.trim() : null;
        const pendiente_oc = document.getElementById('ent_pendiente_oc') ? parseFloat(document.getElementById('ent_pendiente_oc').value) : null;
        const estado_calidad = document.getElementById('ent_estado_calidad') ? document.getElementById('ent_estado_calidad').value : 'Aprobado';
        const obs_calidad = document.getElementById('ent_obs_calidad') ? document.getElementById('ent_obs_calidad').value.trim() : null;

        if(modoMultiLote){
          /* Modo multi-lote: leer las filas dinámicas */
          const filas = [];
          const loteSet = new Set();
          let errorValidacion = false;
          let cantidadTotalMulti = 0;

          rowsContainer.querySelectorAll('.dyn-row').forEach(row => {
            const lote = row.querySelector('.multi-lote-name').value.trim();
            const cant = parseFloat(row.querySelector('.multi-lote-cant').value);
            
            if(lote || cant) { // Si la fila no está completamente vacía
              if(!lote) { toast('Falta el número de lote en una fila.', 'error'); errorValidacion = true; return; }
              if(!cant || cant <= 0) { toast('Cantidad inválida en el lote ' + lote, 'error'); errorValidacion = true; return; }
              if(loteSet.has(lote)) { toast('El lote ' + lote + ' está duplicado.', 'error'); errorValidacion = true; return; }
              
              loteSet.add(lote);
              filas.push({ lote: lote, cantidad: cant });
              cantidadTotalMulti += cant;
            }
          });

          if(errorValidacion) return;
          if(filas.length === 0) { toast('Agregá al menos un lote con su cantidad.', 'error'); return; }

          const r=await withLoading(ev.currentTarget,async function(){
            /* Llamamos al NUEVO RPC unificado (evita doble conteo y actualiza el stock general) */
            await rpc('registrar_entrada_multi_lote',{
              p_insumo_id:itemId,
              p_lotes:filas,
              p_proveedor_id:proveedor_id,
              p_costo_unitario:costo
            });
            return {n:filas.length};
          });
          toast('Entrada OK · '+num(cantidadTotalMulti)+' en consumo · '+r.n+' lote'+(r.n===1?'':'s')+' registrado'+(r.n===1?'':'s'),'success');
          
          /* Actualizar documentos en el último movimiento */
          try {
            const lastMov = await api(`movimientos_inventario?insumo_id=eq.${itemId}&order=fecha.desc&limit=1`);
            if(lastMov.length > 0) {
              await api(`movimientos_inventario?id=eq.${lastMov[0].id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  numero_factura: factura,
                  numero_oc: oc,
                  numero_entrada_almacen: entrada_almacen,
                  cantidad_pendiente_oc: pendiente_oc,
                  estado_calidad: estado_calidad,
                  observaciones_calidad: obs_calidad
                })
              });
            }
          } catch(err) { console.warn('No se pudieron guardar los docs', err); }

          toast('Entrada OK · '+num(cantidadTotalMulti)+' en consumo · '+r.n+' lote'+(r.n===1?'':'s')+' registrado'+(r.n===1?'':'s'),'success');
        } else {
          /* Modo normal: 1 solo lote */
          const lote=inputLote.value.trim()||null;
          const r=await withLoading(ev.currentTarget,async function(){return await rpc('registrar_entrada',{p_insumo_id:itemId,p_cantidad:cantidad,p_proveedor_id:proveedor_id,p_costo_unitario:costo,p_motivo:null,p_rendimiento_real:rend,p_lote_insumo:lote});});
          
          /* Actualizar documentos en el último movimiento */
          try {
            const lastMov = await api(`movimientos_inventario?insumo_id=eq.${itemId}&order=fecha.desc&limit=1`);
            if(lastMov.length > 0) {
              await api(`movimientos_inventario?id=eq.${lastMov[0].id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  numero_factura: factura,
                  numero_oc: oc,
                  numero_entrada_almacen: entrada_almacen,
                  cantidad_pendiente_oc: pendiente_oc
                })
              });
            }
          } catch(err) { console.warn('No se pudieron guardar los docs', err); }

          toast('Entrada OK · '+num(r.cantidad_consumo)+' en consumo · Existencia: '+num(r.existencia_nueva),'success');
        }
      } else {
        const lote=inputLote.value.trim()||null;
        const motivo=inputMotivo.value.trim()||null;
        const opId = document.getElementById('ent_op_id') ? document.getElementById('ent_op_id').value : null;
        
        const r=await withLoading(ev.currentTarget,async function(){
          /* Llamamos al RPC original de producción */
          const res = await rpc('producir_subproducto',{p_id:itemId,p_cantidad:cantidad,p_lote:lote,p_motivo:motivo});
          
          /* Si se asignó una OP, vinculamos el último movimiento a esa OP */
          if(opId) {
            const lastMov = await api(`movimientos_inventario?subproducto_id=eq.${itemId}&order=fecha.desc&limit=1`);
            if(lastMov.length > 0) {
              await api(`movimientos_inventario?id=eq.${lastMov[0].id}`, {
                method: 'PATCH',
                body: JSON.stringify({ orden_id: opId })
              });
            }
          }
          return res;
        });
        toast('Subproducto producido · '+r.items_afectados+' items descontados · Existencia: '+num(r.existencia_nueva),'success');
      }
      renderEntradas();
    }catch(e){toast(e.message,'error');}
  });
} 

/* ============ DEVOLUCIONES A PROVEEDOR ============ */

/* ============ MODAL DE NUEVO PROVEEDOR ============ */
function abrirModalNuevoProveedor(){
  abrirModalGenerico({
    title:'Nuevo proveedor',
    subtitle:'Se agregará al maestro y quedará seleccionado en el formulario.',
    icon:'🚚',
    variant:'info',
    size:'md',
    body:`
      <div class="form-grid" style="padding:0;">
        <div><label>NIT <span style="color:var(--danger);">*</span></label><input id="mp_nit" placeholder="900123456-1" autocomplete="off"></div>
        <div><label>Razón social <span style="color:var(--danger);">*</span></label><input id="mp_razon" placeholder="Empaques del Valle S.A.S." autocomplete="off"></div>
        <div class="full-span"><label>Dirección <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">(opcional)</span></label><input id="mp_direccion" placeholder="Cra 1 # 2-34, Cali" autocomplete="off"></div>
      </div>
      <div class="divider-label">Contactos <span style="font-weight:400;text-transform:none;">(opcional)</span></div>
      <div id="mp_contactos"></div>
      <div style="padding:4px 18px 12px;"><button type="button" class="secondary small" id="mp_add_contacto">+ Agregar contacto</button></div>`,
    footer:`
      <div style="display:flex;justify-content:flex-end;gap:8px;width:100%;">
        <button class="ghost" id="mp_cancelar">Cancelar</button>
        <button id="mp_guardar">Crear proveedor</button>
      </div>`,
    onOpen:function(body){
      /* Editor de contactos */
      let contactos=[{nombre:'',telefono:'',correo:''}];
      function renderContactos(){
        const cont=body.querySelector('#mp_contactos');
        cont.innerHTML=contactos.map(function(c,idx){
          return '<div class="dyn-row conv-recipe">'+
            '<input id="mpc_nombre_'+idx+'" placeholder="Nombre" value="'+(c.nombre||'')+'">'+
            '<input id="mpc_tel_'+idx+'" placeholder="Teléfono" value="'+(c.telefono||'')+'">'+
            '<input id="mpc_mail_'+idx+'" placeholder="Correo" value="'+(c.correo||'')+'">'+
            '<span></span>'+
            '<button type="button" class="ghost small" data-remove-mpc="'+idx+'">×</button>'+
            '</div>';
        }).join('');
        cont.querySelectorAll('[data-remove-mpc]').forEach(function(btn){
          btn.addEventListener('click',function(){
            syncContactos();
            contactos.splice(parseInt(btn.dataset.removeMpc,10),1);
            if(contactos.length===0) contactos=[{nombre:'',telefono:'',correo:''}];
            renderContactos();
          });
        });
      }
      function syncContactos(){
        contactos=contactos.map(function(_,idx){
          return {
            nombre:(body.querySelector('#mpc_nombre_'+idx)||{}).value||'',
            telefono:(body.querySelector('#mpc_tel_'+idx)||{}).value||'',
            correo:(body.querySelector('#mpc_mail_'+idx)||{}).value||''
          };
        });
      }
      renderContactos();
      body.querySelector('#mp_add_contacto').addEventListener('click',function(){
        syncContactos();
        contactos.push({nombre:'',telefono:'',correo:''});
        renderContactos();
      });
      document.getElementById('mp_cancelar').addEventListener('click',cerrarModalGenerico);
      document.getElementById('mp_guardar').addEventListener('click',async function(ev){
        syncContactos();
        const nit=body.querySelector('#mp_nit').value.trim();
        const razon=body.querySelector('#mp_razon').value.trim();
        const direccion=body.querySelector('#mp_direccion').value.trim()||null;
        const contactosLimpios=contactos.filter(function(c){return c.nombre||c.telefono||c.correo;});
        if(!nit){toast('Completa el NIT.','error');return;}
        if(!razon){toast('Completa la razón social.','error');return;}
        await withLoading(ev.currentTarget,async function(){
          try{
            const existe=await api('sys_proveedores?nit=eq.'+encodeURIComponent(nit)+'&select=id&limit=1');
            if(existe.length) throw new Error('Ya existe un proveedor con ese NIT.');
            const creado=await api('sys_proveedores',{
              method:'POST',
              headers:apiHeaders({'Prefer':'return=representation'}),
              body:JSON.stringify({nit:nit,razon_social:razon,direccion:direccion,contactos:contactosLimpios})
            });
            toast('Proveedor creado.','success');
            cerrarModalGenerico();
            /* Refrescar el módulo y seleccionar el nuevo */
            await renderEntradas();
            if(creado&&creado[0]){
              const selProv=document.getElementById('ent_proveedor');
              if(selProv) selProv.value=creado[0].id;
            }
          }catch(e){toast(e.message,'error');}
        });
      });
    }
  });
}

/* ============ DEVOLUCIONES (a proveedor y de PT) ============ */
async function renderDespachos(){
  const main=document.getElementById('mainContent');
  const hoy = new Date().toISOString().slice(0,10);
  main.innerHTML='<div class="empty-state">Cargando despachos…</div>';

  try{
    const [despachos, productos] = await Promise.all([
      api('despachos?select=*,productos_terminados(nombre,unidades_por_caja)&order=fecha.desc,creado_en.desc&limit=100'),
      api('productos_terminados?select=codigo_pt,nombre,unidades_por_caja,existencia_actual&estado_activo=eq.true&order=nombre')
    ]);

    main.innerHTML=`
      <div class="page-header-flex">
        <div>
          <h2 class="page-title">Despachos y Entregas</h2>
          <p class="page-sub">Registra la salida de producto terminado hacia los clientes.</p>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="secondary" id="btnPrintDespachos">${icono('printer','sm')} Imprimir Reporte del Día</button>
          <button class="btn-add require-write" id="btnNuevoDespacho" title="Registrar Despacho">+</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Historial de Despachos</h3></div>
        <div class="search-box"><input id="buscar_despachos" placeholder="Buscar por cliente, producto o lote…"></div>
        
        ${despachos.length === 0 ? '<div class="empty-state">No hay despachos registrados.</div>' : `
        <table id="tablaDespachos">
          <thead><tr>
            <th>Fecha</th>
            <th>Cliente</th>
            <th>Producto</th>
            <th class="num">Cant.</th>
            <th>Lote OP</th>
            <th>Consecutivo</th>
            <th>OC</th>
          </tr></thead>
          <tbody>
            ${despachos.map(d => {
              const prod = d.productos_terminados ? d.productos_terminados.nombre : d.codigo_pt;
              return `<tr>
                <td class="mono" style="font-size:12px;">${new Date(d.fecha+'T12:00:00').toLocaleDateString('es-CO')}</td>
                <td style="font-weight:600;">${d.cliente}</td>
                <td>${prod}</td>
                <td class="num">${num(d.cantidad)}</td>
                <td class="mono" style="font-size:11px;">${d.lote_op || '—'}</td>
                <td class="mono" style="font-size:11px;">${d.consecutivo || '—'}</td>
                <td class="mono" style="font-size:11px;">${d.oc || '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>
    `;

    filtrarTabla('buscar_despachos', 'tablaDespachos');

    document.getElementById('btnNuevoDespacho').addEventListener('click', function() {
      abrirModalNuevoDespacho(productos);
    });

    document.getElementById('btnPrintDespachos').addEventListener('click', function() {
      imprimirReporteDespachos(despachos, hoy);
    });

  } catch(e) {
    main.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
  }
}

function abrirModalNuevoDespacho(productos) {
  const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,10);
  abrirModalGenerico({
    title:'Registrar Nuevo Despacho',
    subtitle:'El sistema descontará el stock del producto terminado.',
    icon: icono('truck','lg'),
    variant: 'info',
    size: 'md',
    body: `
      <div class="form-grid labels-bottom" style="padding:0;">
        <div><label>Cliente</label><input id="desp_cliente" placeholder="Nombre del cliente o destino"></div>
        <div>
          <label>Producto Terminado</label>
          <select id="desp_pt">${productos.map(p => `<option value="${p.codigo_pt}" data-stock="${p.existencia_actual}" data-caja="${p.unidades_por_caja||1}">${p.nombre} (Stock: ${num(p.existencia_actual)})</option>`).join('')}</select>
        </div>
        <div><label>Cantidad</label><input id="desp_cantidad" type="number" min="1" placeholder="0"></div>
        <div><label>Lote OP</label><input id="desp_lote" placeholder="Ej: 3619"></div>
        <div><label>Consecutivo</label><input id="desp_consecutivo" placeholder="Ej: 134 (1), 141 (6)"></div>
        <div><label>Orden de Compra (OC)</label><input id="desp_oc" placeholder="Ej: 80089"></div>
        <div><label>Fecha</label><input id="desp_fecha" type="date" value="${hoy}"></div>
        <div><label>Fecha Vencimiento (MM/YY)</label><input id="desp_fv" placeholder="Ej: 08/29"></div>
        <div class="full-span"><label>Observaciones</label><input id="desp_obs" placeholder="Observaciones de entrega..."></div>
      </div>`,
    footer: `<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;">
      <button class="ghost" id="desp_cancelar">Cancelar</button>
      <button id="desp_guardar">Registrar Despacho</button>
    </div>`,
    onOpen: function() {
      document.getElementById('desp_cancelar').onclick = cerrarModalGenerico;
      
      document.getElementById('desp_guardar').onclick = async function(ev) {
        const cliente = document.getElementById('desp_cliente').value.trim();
        const pt = document.getElementById('desp_pt').value;
        const cantidad = parseFloat(document.getElementById('desp_cantidad').value);
        const lote = document.getElementById('desp_lote').value.trim() || null;
        const cons = document.getElementById('desp_consecutivo').value.trim() || null;
        const oc = document.getElementById('desp_oc').value.trim() || null;
        const fecha = document.getElementById('desp_fecha').value;
        const fv = document.getElementById('desp_fv').value.trim() || null;
        const obs = document.getElementById('desp_obs').value.trim() || null;

        if(!cliente) { toast('El nombre del cliente es obligatorio.', 'error'); return; }
        if(!pt || !cantidad || cantidad <= 0) { toast('Selecciona un producto y una cantidad válida.', 'error'); return; }

        try {
          await withLoading(ev.currentTarget, async function() {
            await rpc('registrar_despacho', {
              p_codigo_pt: pt,
              p_cantidad: cantidad,
              p_cliente: cliente,
              p_lote_op: lote,
              p_consecutivo: cons,
              p_oc: oc,
              p_fecha: fecha,
              p_fecha_vencimiento: fv,
              p_observaciones: obs
            });
          });
          toast('Despacho registrado correctamente.', 'success');
          cerrarModalGenerico();
          renderDespachos();
        } catch (error) {
          toast(error.message, 'error'); // Muestra el error real en un toast rojo
        }
      };
    }
  });
}

function imprimirReporteDespachos(despachos, fechaFiltro) {
  // Filtrar solo los del día seleccionado (por defecto hoy)
  const despachosDelDia = despachos.filter(d => d.fecha === fechaFiltro);
  
  if (despachosDelDia.length === 0) {
    toast('No hay despachos para la fecha de hoy.', 'info');
    return;
  }

  const fechaFormat = new Date(fechaFiltro + 'T12:00:00').toLocaleDateString('es-CO');
  
  let tabla = '<table class="print-table" style="width:100%; border-collapse:collapse; font-size:9pt;">';
  tabla += '<thead><tr>';
  tabla += '<th style="border:1px solid #000; background:#a5c7e9; padding:6px; text-align:left;">ITEM</th>';
  tabla += '<th style="border:1px solid #000; background:#a5c7e9; padding:6px; text-align:left;">CÓDIGO PT</th>';
  tabla += '<th style="border:1px solid #000; background:#a5c7e9; padding:6px; text-align:center;">FV</th>';
  tabla += '<th style="border:1px solid #000; background:#a5c7e9; padding:6px; text-align:right;">UND.</th>';
  tabla += '<th style="border:1px solid #000; background:#a5c7e9; padding:6px; text-align:right;">CAJAS</th>';
  tabla += '<th style="border:1px solid #000; background:#a5c7e9; padding:6px; text-align:center;">LOTE OP</th>';
  tabla += '<th style="border:1px solid #000; background:#a5c7e9; padding:6px; text-align:center;">CONSECUTIVO</th>';
  tabla += '<th style="border:1px solid #000; background:#a5c7e9; padding:6px; text-align:center;">OC</th>';
  tabla += '<th style="border:1px solid #000; background:#a5c7e9; padding:6px; text-align:left;">CLIENTE</th>';
  tabla += '</tr></thead><tbody>';

  despachosDelDia.forEach(d => {
    const prod = d.productos_terminados ? d.productos_terminados.nombre : d.codigo_pt;
    const caja = d.productos_terminados ? d.productos_terminados.unidades_por_caja : 1;
    const cajas = caja > 1 ? Math.floor(d.cantidad / caja) : d.cantidad;
    
    tabla += `<tr>
      <td style="border:1px solid #000; padding:6px;">${prod}</td>
      <td style="border:1px solid #000; padding:6px; font-family:monospace;">${d.codigo_pt}</td>
      <td style="border:1px solid #000; padding:6px; text-align:center; font-family:monospace;">${d.fecha_vencimiento || '—'}</td>
      <td style="border:1px solid #000; padding:6px; text-align:right; font-family:monospace;">${num(d.cantidad)}</td>
      <td style="border:1px solid #000; padding:6px; text-align:right; font-family:monospace;">${num(cajas)}</td>
      <td style="border:1px solid #000; padding:6px; text-align:center; font-family:monospace;">${d.lote_op || '—'}</td>
      <td style="border:1px solid #000; padding:6px; text-align:center; font-family:monospace;">${d.consecutivo || '—'}</td>
      <td style="border:1px solid #000; padding:6px; text-align:center; font-family:monospace;">${d.oc || '—'}</td>
      <td style="border:1px solid #000; padding:6px;">${d.cliente}</td>
    </tr>`;
  });

  // Llenar filas vacías hasta 8 (opcional, para que se vea como el formato físico)
  const filasRestantes = 8 - despachosDelDia.length;
  if (filasRestantes > 0) {
    for(let i=0; i<filasRestantes; i++) {
      tabla += `<tr>
        <td style="border:1px solid #000; padding:10px;"></td><td style="border:1px solid #000;"></td>
        <td style="border:1px solid #000;"></td><td style="border:1px solid #000;"></td>
        <td style="border:1px solid #000;"></td><td style="border:1px solid #000;"></td>
        <td style="border:1px solid #000;"></td><td style="border:1px solid #000;"></td>
        <td style="border:1px solid #000;"></td>
      </tr>`;
    }
  }
  tabla += '</tbody></table>';

  const obs = despachosDelDia.map(d => d.observaciones).filter(Boolean).join(' | ');

  const firmas = `
    <div class="print-signatures" style="grid-template-columns: 1fr 1fr; margin-top:60px;">
      <div class="print-signature">
        <div class="name">JEFE DE LOGÍSTICA</div>
      </div>
      <div class="print-signature">
        <div class="name">CONDUCTOR / RECIBE</div>
      </div>
    </div>
  `;

  const html = `
    <div style="font-family: Arial; color:#000;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #1b75bb; padding-bottom:10px; margin-bottom:20px;">
        <div><img src="logo-proclides.png" style="height:50px;"></div>
        <div style="text-align:right; font-size:10pt;">
          <b>Entregas para el día:</b> ${fechaFormat}
        </div>
      </div>
      
      ${tabla}

      <div style="margin-top:20px; font-size:9.5pt;">
        <b>Observaciones:</b><br>
        <div style="border-bottom:1px solid #000; padding:10px 0; min-height:30px;">${obs || 'Sin observaciones adicionales.'}</div>
      </div>

      ${firmas}
    </div>
  `;

  const cssPrint = `
    @page { size: letter landscape; margin: 15mm; }
    body { padding: 0; font-family: Helvetica, Arial, sans-serif; }
  `;

  imprimirHTML(html, 'Despachos Diarios', cssPrint);
}

async function renderDevoluciones(){
  const main=document.getElementById('mainContent');
  const [insumos,productos,proveedores,devolucionesProv,devolucionesPT]=await Promise.all([
    api('insumos?select=id,codigo,nombre,unidad_medida,unidad_consumo,conversiones,existencia_actual,punto_reorden&estado_activo=eq.true&order=nombre'),
    api('productos_terminados?select=codigo_pt,nombre,unidades_por_caja,existencia_actual&order=nombre'),
    api('sys_proveedores?select=id,razon_social&order=razon_social'),
    api('movimientos_inventario?select=*,insumos(nombre,unidad_consumo,unidad_medida),sys_proveedores(razon_social)&tipo=eq.Salida&proveedor_id=not.is.null&order=fecha.desc&limit=20'),
    api('devoluciones_pt?select=*,productos_terminados(nombre,unidades_por_caja)&order=fecha.desc&limit=20')
  ]);

  main.innerHTML=`
    <div class="page-header-flex">
      <div>
        <h2 class="page-title">Devoluciones</h2>
        <p class="page-sub">Registra devoluciones a proveedores (insumos) o de clientes (producto terminado).</p>
      </div>
      ${botonRefreshHTML('devoluciones')}
    </div>

    <div class="panel force-expanded no-scroll">
      <div class="panel-header"><h3>Tipo de devolución</h3></div>
      <div style="padding:14px 18px;">
        <div class="tabs" style="display:flex;gap:6px;">
          <button class="secondary small tab-btn active" data-dev-tipo="prov">A proveedor (insumo)</button>
          <button class="secondary small tab-btn" data-dev-tipo="pt">De cliente (producto)</button>
        </div>
      </div>
    </div>

    <div id="devProvWrap">
      <div class="panel force-expanded no-scroll require-write">
        <div class="panel-header"><h3>Nueva devolución a proveedor</h3></div>
        <div class="form-grid">
          <div><label>Insumo</label><select id="dev_insumo">${insumos.length?insumos.map(function(i){return '<option value="'+i.id+'">'+i.nombre+' ('+unidadConsumo(i)+')</option>';}).join(''):'<option value="">No hay insumos</option>'}</select></div>
          <div><label>Cantidad (<span id="dev_unidad_label">—</span>)</label><input id="dev_cantidad" type="number" step="0.0001" placeholder="0"></div>
          <div><label>Proveedor</label><select id="dev_proveedor"><option value="">— Selecciona —</option>${proveedores.map(function(p){return '<option value="'+p.id+'">'+p.razon_social+'</option>';}).join('')}</select></div>
          <div><label>Lote a devolver <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">(opcional)</span></label><select id="dev_lote"><option value="">— Cualquiera (LIFO) —</option></select></div>
          <div><label>Motivo <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">(opcional)</span></label><input id="dev_motivo" placeholder="Ej: producto defectuoso"></div>
        </div>
        <div id="dev_preview" style="padding:0 18px 8px;font-size:12.5px;color:var(--text-secondary);"></div>
        <div class="form-actions"><button id="btnRegistrarDevolucion">Registrar devolución</button></div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Últimas devoluciones a proveedor</h3></div>
        ${devolucionesProv.length===0?'<div class="empty-state">Sin devoluciones registradas.</div>':`
        <table><tr><th>Insumo</th><th class="num">Cantidad</th><th>Proveedor</th><th>Motivo</th><th>Fecha</th></tr>
          ${devolucionesProv.map(function(m){
            const cant=num(m.cantidad)+' '+(m.insumos?(m.insumos.unidad_consumo||m.insumos.unidad_medida):'');
            const prov=m.sys_proveedores?m.sys_proveedores.razon_social:'—';
            return '<tr><td>'+(m.insumos?m.insumos.nombre:'(insumo)')+'</td><td class="num">-'+cant+'</td><td>'+prov+'</td><td style="color:var(--text-secondary);font-size:12.5px;">'+(m.motivo||'—')+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+new Date(m.fecha).toLocaleDateString('es-CO')+'</td></tr>';
          }).join('')}
        </table>`}
      </div>
    </div>

    <div id="devPTWrap" style="display:none;">
      <div class="panel force-expanded no-scroll require-write">
        <div class="panel-header"><h3>Nueva devolución de cliente</h3></div>
        <div class="form-grid">
          <div><label>Producto terminado</label><select id="devpt_producto">${productos.length?productos.map(function(p){return '<option value="'+p.codigo_pt+'" data-caja="'+(p.unidades_por_caja||1)+'" data-existencia="'+(p.existencia_actual||0)+'">'+p.nombre+' ('+p.codigo_pt+')</option>';}).join(''):'<option value="">No hay productos</option>'}</select></div>
          <div><label>Cantidad devuelta</label><input id="devpt_cantidad" type="number" step="0.0001" placeholder="0"></div>
          <div><label>Estado del producto</label><select id="devpt_estado">
            <option value="bueno">Bueno — vuelve al stock</option>
            <option value="cuarentena">En cuarentena — no vuelve al stock</option>
            <option value="dañado">Dañado — no vuelve al stock</option>
          </select></div>
          <div><label>Motivo <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">(opcional)</span></label><input id="devpt_motivo" placeholder="Ej: sobrante de obra, error de despacho"></div>
        </div>
        <div id="devpt_preview" style="padding:0 18px 8px;font-size:12.5px;color:var(--text-secondary);"></div>
        <div class="form-actions"><button id="btnRegistrarDevolucionPT">Registrar devolución</button></div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Últimas devoluciones de cliente</h3></div>
        ${devolucionesPT.length===0?'<div class="empty-state">Sin devoluciones registradas.</div>':`
        <table><tr><th>Producto</th><th class="num">Cantidad</th><th>Estado</th><th>Motivo</th><th>Fecha</th></tr>
          ${devolucionesPT.map(function(d){
            const p=d.productos_terminados||{};
            const badgeEstado={bueno:'success',cuarentena:'warning','dañado':'danger'}[d.estado_producto]||'neutral';
            return '<tr><td>'+(p.nombre||d.codigo_pt)+'</td><td class="num">+'+num(d.cantidad)+' u</td><td><span class="badge '+badgeEstado+'">'+d.estado_producto+'</span></td><td style="color:var(--text-secondary);font-size:12.5px;">'+(d.motivo||'—')+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+new Date(d.fecha).toLocaleDateString('es-CO')+'</td></tr>';
          }).join('')}
        </table>`}
      </div>
    </div>`;

  /* Tabs */
  document.querySelectorAll('[data-dev-tipo]').forEach(function(b){
    b.addEventListener('click',function(){
      const tipo=b.dataset.devTipo;
      document.querySelectorAll('[data-dev-tipo]').forEach(function(x){x.classList.toggle('active',x===b);});
      document.getElementById('devProvWrap').style.display = tipo==='prov'?'block':'none';
      document.getElementById('devPTWrap').style.display = tipo==='pt'?'block':'none';
    });
  });

  /* --- Devoluciones a proveedor --- */
  const selInsumo=document.getElementById('dev_insumo');
  const selProv=document.getElementById('dev_proveedor');
  const inputCant=document.getElementById('dev_cantidad');
  const inputMotivo=document.getElementById('dev_motivo');
  const labelU=document.getElementById('dev_unidad_label');
  const preview=document.getElementById('dev_preview');

  function actualizarContexto(){
    const ins=insumos.find(function(i){return i.id===selInsumo.value;});
    if(!ins){labelU.textContent='—';preview.innerHTML='';return;}
    const uC=unidadConsumo(ins);
    labelU.textContent=uC;
    const cant=parseFloat(inputCant.value)||0;
    if(cant>0){
      const quedaria=(Number(ins.existencia_actual)||0)-cant;
      const color=quedaria<0?'var(--danger)':(quedaria<=Number(ins.punto_reorden||0)?'var(--warning)':'var(--success)');
      preview.innerHTML='Existencia actual: <strong>'+num(ins.existencia_actual)+' '+uC+'</strong> → después: <strong style="color:'+color+';">'+num(quedaria)+' '+uC+'</strong>';
    } else preview.innerHTML='Existencia actual: <strong>'+num(ins.existencia_actual)+' '+uC+'</strong>';
  }
  const selLote = document.getElementById('dev_lote');
  
  async function cargarLotesDevolucion() {
    selLote.innerHTML = '<option value="">— Cualquiera (LIFO) —</option>';
    const insId = selInsumo.value;
    if(!insId) return;
    try {
      const lotes = await api('insumo_lotes?insumo_id=eq.'+insId+'&cantidad_actual=gt.0&select=lote,cantidad_actual&order=primer_ingreso.desc');
      lotes.forEach(l => {
        selLote.innerHTML += `<option value="${l.lote}">${l.lote} (${num(l.cantidad_actual)} disp.)</option>`;
      });
    } catch(e) { console.warn('Error cargando lotes', e); }
  }

  selInsumo.addEventListener('change',function(){ actualizarContexto(); cargarLotesDevolucion(); });
  inputCant.addEventListener('input',actualizarContexto);
  actualizarContexto();
  cargarLotesDevolucion();

  document.getElementById('btnRegistrarDevolucion').addEventListener('click',async function(ev){
    const insumo_id=selInsumo.value;
    const proveedor_id=selProv.value;
    const cantidad=parseFloat(inputCant.value);
    const motivo=inputMotivo.value.trim()||null;
    if(!insumo_id){toast('Selecciona un insumo.','error');return;}
    if(!proveedor_id){toast('Selecciona un proveedor.','error');return;}
    if(!cantidad||cantidad<=0){toast('Ingresa una cantidad válida.','error');return;}
    if(!await confirmar({title:'Registrar devolución a proveedor',message:'Se van a descontar '+num(cantidad)+' del insumo seleccionado.',icon:'↩',variant:'warn',okText:'Registrar'})) return;
    try{
      const lote = selLote ? selLote.value : null;
      const r=await withLoading(ev.currentTarget,async function(){
        return await rpc('registrar_devolucion',{p_insumo_id:insumo_id,p_cantidad:cantidad,p_proveedor_id:proveedor_id,p_motivo:motivo,p_lote:lote});
      });
      toast('Devolución registrada. Existencia: '+num(r.existencia_nueva),'success');
      renderDevoluciones();
    }catch(e){toast(e.message,'error');}
  });

  /* --- Devoluciones de PT --- */
  const selPT=document.getElementById('devpt_producto');
  const inputCantPT=document.getElementById('devpt_cantidad');
  const selEstado=document.getElementById('devpt_estado');
  const previewPT=document.getElementById('devpt_preview');

  function actualizarPreviewPT(){
    const opt=selPT.options[selPT.selectedIndex];
    if(!opt){previewPT.innerHTML='';return;}
    const ex=Number(opt.dataset.existencia)||0;
    const pc=Number(opt.dataset.caja)||1;
    const cant=parseFloat(inputCantPT.value)||0;
    const estado=selEstado.value;
    const afecta=estado==='bueno';
    const nuevaEx=afecta?ex+cant:ex;
    if(cant>0){
      previewPT.innerHTML='Stock actual: <strong>'+num(ex)+' u</strong>'+
        (afecta?' → después: <strong style="color:var(--success);">'+num(nuevaEx)+' u</strong>':' <span style="color:var(--warning);">(no afecta stock)</span>')+
        (pc>1?' · Equivale a ≈ '+num(cant/pc,2)+' cajas':'');
    } else previewPT.innerHTML='Stock actual: <strong>'+num(ex)+' u</strong>';
  }
  selPT.addEventListener('change',actualizarPreviewPT);
  inputCantPT.addEventListener('input',actualizarPreviewPT);
  selEstado.addEventListener('change',actualizarPreviewPT);
  actualizarPreviewPT();

  document.getElementById('btnRegistrarDevolucionPT').addEventListener('click',async function(ev){
    const codigo_pt=selPT.value;
    const cantidad=parseFloat(inputCantPT.value);
    const estado_producto=selEstado.value;
    const motivo=document.getElementById('devpt_motivo').value.trim()||null;
    if(!codigo_pt){toast('Selecciona un producto.','error');return;}
    if(!cantidad||cantidad<=0){toast('Ingresa una cantidad válida.','error');return;}
    const afecta=estado_producto==='bueno';
    const msg=afecta
      ? 'Se sumarán '+num(cantidad)+' unidades al stock de este producto.'
      : 'La devolución queda registrada pero NO suma stock (estado: '+estado_producto+').';
    if(!await confirmar({title:'Registrar devolución de cliente',message:msg,icon:'↩',variant:afecta?'info':'warn',okText:'Registrar'})) return;
    try{
      const r=await withLoading(ev.currentTarget,async function(){
        return await rpc('registrar_devolucion_pt',{p_codigo_pt:codigo_pt,p_cantidad:cantidad,p_estado_producto:estado_producto,p_motivo:motivo});
      });
      toast(afecta?'Devolución registrada. Stock: '+num(r.existencia_nueva):'Devolución registrada (sin impacto en stock).','success');
      renderDevoluciones();
    }catch(e){toast(e.message,'error');}
  });
}

/* ============ PROVEEDORES ============ */
let editandoProveedorId=null;
let filasContacto=[{nombre:'',telefono:'',correo:''}];

async function renderProveedores(){
  const main=document.getElementById('mainContent');
  const proveedores=await api('sys_proveedores?select=*&order=razon_social');
  const view=applySort(proveedores,'lista_prov',{nit:function(p){return p.nit;},razon:function(p){return p.razon_social;},nombre:function(p){return p.razon_social;}});
  main.innerHTML=`
    <h2 class="page-title">Proveedores</h2>
    <p class="page-sub">Maestro de proveedores con dirección y contactos.</p>
    <div class="panel">
      <div class="panel-header"><h3>Listado</h3><div style="display:flex;gap:6px;align-items:center;">${botonRefreshHTML('proveedores')}<button class="btn-add require-write" id="btnNuevoProveedor" title="Crear proveedor">+</button></div></div>
      <div class="search-box"><input id="buscar_proveedores" placeholder="Buscar por razón social o NIT…"></div>
      ${proveedores.length===0?'<div class="empty-state">No hay proveedores.</div>':`
      <table id="tablaProveedores"><tr>
        ${thSort('NIT','nit','lista_prov')}
        ${thSort('Razón social','razon','lista_prov')}
        <th>Dirección</th>
        <th>Contactos</th><th class="actions"></th>
      </tr>
        ${view.map(function(p){return '<tr><td class="mono">'+p.nit+'</td><td>'+p.razon_social+'</td><td style="color:var(--text-secondary);">'+(p.direccion||'—')+'</td><td style="color:var(--text-secondary);font-size:12px;">'+((p.contactos||[]).map(function(c){return (c.nombre||'')+(c.telefono?' · '+c.telefono:'')+(c.correo?' · '+c.correo:'');}).join('<br>')||'—')+'</td><td class="actions"><button class="ghost small" data-edit-prov="'+p.id+'" title="Editar proveedor">Editar</button><button class="danger-btn small" data-del-prov="'+p.id+'" data-del-nombre="'+p.razon_social+'" title="Eliminar proveedor">Eliminar</button></td></tr>';}).join('')}
      </table>`}
    </div>`;
  filtrarTabla('buscar_proveedores','tablaProveedores');
  bindSortHeaders(renderProveedores);
  paginarTabla('tablaProveedores');
  document.getElementById('btnNuevoProveedor').addEventListener('click',function(){
    editandoProveedorId=null;
    abrirModalProveedor(null,proveedores);
  });
  document.querySelectorAll('[data-edit-prov]').forEach(function(btn){
    btn.addEventListener('click',function(){
      editandoProveedorId=btn.dataset.editProv;
      abrirModalProveedor(btn.dataset.editProv,proveedores);
    });
  });
  document.querySelectorAll('[data-del-prov]').forEach(function(btn){
    btn.addEventListener('click',async function(){
      if(!await confirmarEliminar(btn.dataset.delNombre))return;
      try{await withLoading(btn,async function(){await api('sys_proveedores?id=eq.'+btn.dataset.delProv,{method:'DELETE'});});toast('Proveedor eliminado.','success');renderProveedores();}
      catch(e){toast('No se pudo eliminar: '+traducirError(e.message),'error');}
    });
  });
}

function _htmlFormProveedor(prov){
  return `
    <div class="form-grid" style="padding:0;">
      <div><label>NIT</label><input id="prov_nit" placeholder="900123456-1" value="${prov?prov.nit:''}"></div>
      <div><label>Razón social</label><input id="prov_nombre" placeholder="Empaques del Valle" value="${prov?prov.razon_social:''}"></div>
      <div class="full-span"><label>Dirección</label><input id="prov_direccion" placeholder="Cra 1 # 2-34, Cali" value="${prov&&prov.direccion?prov.direccion:''}"></div>
    </div>
    <div class="divider-label">Contactos</div>
    <div id="filasContactoContainer"></div>
    <div class="dyn-row-add"><button class="secondary small" id="btnAgregarContacto" title="Agregar contacto">+ Agregar contacto</button></div>`;
}

function abrirModalProveedor(proveedorId,proveedores){
  const prov=proveedorId?proveedores.find(function(p){return p.id===proveedorId;}):null;
  if(proveedorId&&!prov){toast('Proveedor no encontrado.','error');return;}
  filasContacto=(prov&&prov.contactos&&prov.contactos.length)?prov.contactos.slice():[{nombre:'',telefono:'',correo:''}];

  abrirModalGenerico({
    title: prov?'Editar proveedor':'Nuevo proveedor',
    subtitle: 'Maestro de proveedores con dirección y contactos.',
    icon: icono(prov?'pencil':'plus','lg'),
    variant: 'info',
    size: 'md',
    body: _htmlFormProveedor(prov),
    footer: '<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button class="ghost" id="prov_cancelar">Cancelar</button><button id="prov_guardar">'+(prov?'Guardar cambios':'Crear proveedor')+'</button></div>',
    onOpen: function(){
      renderFilasContacto();
      document.getElementById('btnAgregarContacto').addEventListener('click',function(){sincronizarContactos();filasContacto.push({nombre:'',telefono:'',correo:''});renderFilasContacto();});
      document.getElementById('prov_cancelar').addEventListener('click',cerrarModalGenerico);
      document.getElementById('prov_guardar').addEventListener('click',async function(ev){
        sincronizarContactos();
        const body={nit:document.getElementById('prov_nit').value.trim(),razon_social:document.getElementById('prov_nombre').value.trim(),direccion:document.getElementById('prov_direccion').value.trim()||null,contactos:filasContacto.filter(function(c){return c.nombre||c.telefono||c.correo;})};
        if(!body.nit||!body.razon_social){toast('Completa NIT y razón social.','error');return;}
        try{
          await withLoading(ev.currentTarget,async function(){
            if(!prov){
              const existe=await api('sys_proveedores?nit=eq.'+encodeURIComponent(body.nit)+'&select=id&limit=1');
              if(existe.length)throw new Error('Ya existe un proveedor con ese NIT.');
            }
            if(prov){await api('sys_proveedores?id=eq.'+prov.id,{method:'PATCH',body:JSON.stringify(body)});}
            else{await api('sys_proveedores',{method:'POST',body:JSON.stringify(body)});}
          });
          toast(prov?'Proveedor actualizado.':'Proveedor creado.','success');
          cerrarModalGenerico();
          renderProveedores();
        }catch(e){toast('Error: '+traducirError(e.message),'error');}
      });
    }
  });
}

function sincronizarContactos(){filasContacto=filasContacto.map(function(_,idx){return {nombre:document.getElementById('cont_nombre_'+idx)?document.getElementById('cont_nombre_'+idx).value:'',telefono:document.getElementById('cont_telefono_'+idx)?document.getElementById('cont_telefono_'+idx).value:'',correo:document.getElementById('cont_correo_'+idx)?document.getElementById('cont_correo_'+idx).value:''};});}
function renderFilasContacto(){
  const cont=document.getElementById('filasContactoContainer');if(!cont)return;
  cont.innerHTML=filasContacto.map(function(fila,idx){
    return '<div class="dyn-row conv-recipe"><input id="cont_nombre_'+idx+'" placeholder="Nombre del contacto" value="'+(fila.nombre||'')+'"><input id="cont_telefono_'+idx+'" placeholder="Teléfono" value="'+(fila.telefono||'')+'"><input id="cont_correo_'+idx+'" placeholder="Correo" value="'+(fila.correo||'')+'"><span></span><button type="button" class="ghost small" data-remove-contacto="'+idx+'" title="Quitar">×</button></div>';
  }).join('');
  cont.querySelectorAll('[data-remove-contacto]').forEach(function(btn){btn.addEventListener('click',function(){sincronizarContactos();filasContacto.splice(parseInt(btn.dataset.removeContacto,10),1);if(filasContacto.length===0)filasContacto=[{nombre:'',telefono:'',correo:''}];renderFilasContacto();});});
}

/* ============ HISTÓRICO — CAPA 2 (RENDER) ============ */
const chartInstances={};
function _destroyChart(id){
  if(chartInstances[id]){
    try{chartInstances[id].destroy();}catch(e){}
    delete chartInstances[id];
  }
}
function _initChartDefaults(){
  if(window._chartDefaultsDone)return;
  if(typeof Chart==='undefined')return;
  const cs=getComputedStyle(document.documentElement);
  Chart.defaults.color=cs.getPropertyValue('--text-secondary').trim()||'#8d95a6';
  Chart.defaults.borderColor=cs.getPropertyValue('--border').trim()||'#2b3140';
  Chart.defaults.font.family="'Space Grotesk',sans-serif";
  Chart.defaults.font.size=12;
  Chart.defaults.plugins.legend.labels.boxWidth=10;
  Chart.defaults.plugins.legend.labels.padding=14;
  window._chartDefaultsDone=true;
}

function renderChartLine(id,data){
  _destroyChart(id);
  _initChartDefaults();
  const ctx=document.getElementById(id);
  if(!ctx||typeof Chart==='undefined')return;
  chartInstances[id]=new Chart(ctx,{
    type:'line',
    data:data,
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{position:'bottom'},
        tooltip:{
          backgroundColor:getComputedStyle(document.documentElement).getPropertyValue('--surface-3').trim()||'#262c3b',
          borderColor:getComputedStyle(document.documentElement).getPropertyValue('--border').trim()||'#2b3140',
          borderWidth:1,
          padding:10,
          titleColor:'#edeff3',
          bodyColor:'#edeff3'
        }
      },
      scales:{
        x:{grid:{color:'var(--border)'},ticks:{color:'var(--text-secondary)'}},
        y:{grid:{color:'var(--border)'},ticks:{color:'var(--text-secondary)'},beginAtZero:true}
      }
    }
  });
}

function renderChartBar(id,data,horizontal){
  _destroyChart(id);
  _initChartDefaults();
  const ctx=document.getElementById(id);
  if(!ctx||typeof Chart==='undefined')return;
  chartInstances[id]=new Chart(ctx,{
    type:'bar',
    data:data,
    options:{
      responsive:true,
      maintainAspectRatio:false,
      indexAxis:horizontal?'y':'x',
      plugins:{
        legend:{position:'bottom'},
        tooltip:{
          backgroundColor:getComputedStyle(document.documentElement).getPropertyValue('--surface-3').trim()||'#262c3b',
          borderColor:getComputedStyle(document.documentElement).getPropertyValue('--border').trim()||'#2b3140',
          borderWidth:1,
          padding:10,
          callbacks:horizontal?{
            label:function(c){return money(c.parsed.x);}
          }:undefined
        }
      },
      scales:horizontal?{
        x:{grid:{color:'#2b3140'},ticks:{color:'#8d95a6',callback:function(v){return money(v);}},beginAtZero:true},
        y:{grid:{display:false},ticks:{color:'#8d95a6'}}
      }:{
        x:{grid:{color:'var(--border)'},ticks:{color:'var(--text-secondary)'}},
        y:{grid:{color:'var(--border)'},ticks:{color:'var(--text-secondary)'},beginAtZero:true},
        y1:{position:'right',grid:{display:false},ticks:{color:'#8d95a6'},beginAtZero:true}
      }
    }
  });
}

function renderChartDoughnut(id,data){
  _destroyChart(id);
  _initChartDefaults();
  const ctx=document.getElementById(id);
  if(!ctx||typeof Chart==='undefined')return;

  /* Contenedor padre: div con position:relative y altura fija */
  const wrapper=ctx.parentElement;
  if(!wrapper) return;

  /* Quitar mensaje previo si existe (por re-render con filtro) */
  const oldMsg=wrapper.querySelector('.chart-empty-msg');
  if(oldMsg) oldMsg.remove();

  /* Analizar cuántas categorías tienen datos */
  const valores=(data.datasets&&data.datasets[0]&&data.datasets[0].data)||[];
  const total=valores.reduce(function(a,b){return a+Number(b||0);},0);
  const categoriasConDatos=valores.filter(function(v){return Number(v)>0;}).length;

  /* Fallback: 0 o 1 categoría con datos → mensaje en vez de anillo */
  if(categoriasConDatos<=1){
    ctx.style.display='none';
    const labels=data.labels||[];
    const idxConDato=valores.findIndex(function(v){return Number(v)>0;});
    const nombreCategoria=idxConDato>=0?labels[idxConDato]:null;
    const valorCategoria=idxConDato>=0?valores[idxConDato]:0;
    let html;
    if(total===0){
      html='<div class="chart-empty-msg">'
        +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M9.5 14.5s.8-1 2.5-1 2.5 1 2.5 1"/></svg>'
        +'<div class="chart-empty-title">Sin movimientos</div>'
        +'<div class="chart-empty-sub">No se registraron movimientos en este período.</div>'
        +'</div>';
    } else {
      html='<div class="chart-empty-msg">'
        +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
        +'<div class="chart-empty-title">Datos insuficientes para comparar</div>'
        +'<div class="chart-empty-sub">Solo hay movimientos de tipo <b>'+nombreCategoria+'</b> ('+valorCategoria+') en este período.</div>'
        +'<div class="chart-empty-hint">Se necesita al menos un movimiento de otro tipo para mostrar la distribución.</div>'
        +'</div>';
    }
    wrapper.insertAdjacentHTML('beforeend',html);
    return;
  }

  /* 2+ categorías con datos → renderizar normalmente */
  ctx.style.display='';
  chartInstances[id]=new Chart(ctx,{
    type:'doughnut',
    data:data,
    options:{
      responsive:true,
      maintainAspectRatio:false,
      cutout:'62%',
      plugins:{
        legend:{position:'bottom'},
        tooltip:{
          backgroundColor:getComputedStyle(document.documentElement).getPropertyValue('--surface-3').trim()||'#262c3b',
          borderColor:getComputedStyle(document.documentElement).getPropertyValue('--border').trim()||'#2b3140',
          borderWidth:1,
          padding:10,
          callbacks:{
            label:function(c){
              const total=c.dataset.data.reduce(function(a,b){return a+b;},0);
              const pct=total?Math.round(c.parsed/total*100):0;
              return c.label+': '+c.parsed+' ('+pct+'%)';
            }
          }
        }
      }
    }
  });
}

/* Pantalla del Histórico */
function calcOrdenesPorPeriodo(ordenes, periodo){
  const ahora = new Date();
  let keyFn, labelFn, orderedKeys = [];
  if(periodo === 'semana'){
    keyFn = function(d){
      const t = new Date(d);
      t.setHours(0,0,0,0);
      const day = t.getDay();
      const diff = t.getDate() - day + (day === 0 ? -6 : 1);
      t.setDate(diff);
      return t.toISOString().slice(0,10);
    };
    labelFn = function(key){
      const d = new Date(key+'T00:00:00');
      return d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit'});
    };
    for(let i = 7; i >= 0; i--){
      const d = new Date(ahora);
      d.setDate(d.getDate() - i*7);
      orderedKeys.push(keyFn(d));
    }
  } else if(periodo === 'anio'){
    keyFn = function(d){return String(d.getFullYear());};
    labelFn = function(key){return key;};
    for(let i = 4; i >= 0; i--){
      orderedKeys.push(String(ahora.getFullYear()-i));
    }
  } else {
    keyFn = function(d){
      return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    };
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    labelFn = function(key){
      const parts = key.split('-');
      return meses[parseInt(parts[1],10)-1]+' '+parts[0].slice(2);
    };
    for(let i = 11; i >= 0; i--){
      const d = new Date(ahora.getFullYear(), ahora.getMonth()-i, 1);
      orderedKeys.push(keyFn(d));
    }
  }
  const counts = {};
  orderedKeys.forEach(function(k){counts[k]=0;});
  ordenes.forEach(function(o){
    if(!o.fecha_creacion) return;
    const k = keyFn(new Date(o.fecha_creacion));
    if(counts[k] !== undefined) counts[k]++;
  });
  return {
    labels: orderedKeys.map(labelFn),
    datasets: [{
      label: 'Órdenes',
      data: orderedKeys.map(function(k){return counts[k];}),
      backgroundColor: '#ffb020',
      borderRadius: 4
    }]
  };
}

function calcMovimientosPorTipoPeriodo(movs, periodo){
  const ahora = new Date();
  let cutoff;
  if(periodo === 'semana'){
    cutoff = new Date(ahora); cutoff.setDate(cutoff.getDate() - 7);
  } else if(periodo === 'anio'){
    cutoff = new Date(ahora.getFullYear(), 0, 1);
  } else {
    cutoff = new Date(ahora); cutoff.setDate(cutoff.getDate() - 30);
  }
  const filtrados = movs.filter(function(m){return new Date(m.fecha) >= cutoff;});
  const counts = {Entrada:0, Salida:0, Consumo:0};
  filtrados.forEach(function(m){
    if(counts[m.tipo] !== undefined) counts[m.tipo]++;
  });
  return {
    labels: ['Entradas','Salidas','Consumos'],
    datasets: [{
      data: [counts.Entrada, counts.Salida, counts.Consumo],
      backgroundColor: ['#3ddc84','#ff5c5c','#ffb020'],
      borderWidth: 0
    }]
  };
}

async function renderHistorico(){
  const main=document.getElementById('mainContent');
  if(typeof Chart==='undefined'){
    main.innerHTML='<div class="empty-state">No se pudo cargar la librería de gráficos. Verifica tu conexión a internet.</div>';
    return;
  }
  main.innerHTML='<div class="empty-state">Cargando datos históricos…</div>';

  try{
    const [insumos,movs,ordenes]=await Promise.all([
      api('insumos?select=id,codigo,nombre,unidad_medida,unidad_consumo,conversiones,existencia_actual,costo_unitario&order=nombre'),
      api('movimientos_inventario?select=id,insumo_id,subproducto_id,tipo,cantidad,fecha,motivo&order=fecha.desc&limit=5000'),
      api('ordenes_semanales?select=id,numero_op,codigo_pt,cantidad_proyectada,estado_op,fecha_creacion&order=fecha_creacion.desc&limit=1000')
    ]);

    const dataConsumo=calcConsumoMensualPorInsumo(movs,insumos,5,12);
    const dataTopValor=calcTopInsumosPorValor(insumos,10);

    main.innerHTML=`
      <div class="page-header-flex">
        <div>
          <h2 class="page-title">Histórico</h2>
          <p class="page-sub">Tendencias de consumo, producción y valorización. Se actualiza en vivo con cada movimiento.</p>
        </div>
        ${botonRefreshHTML('historico')}
      </div>

      <div class="grid-cards g2" style="align-items:start;">
        <div class="panel force-expanded no-scroll" style="margin-bottom:0;">
          <div class="panel-header">
            <h3>Órdenes por período</h3>
            <select id="chOrdenesFiltro" style="width:auto;margin:0;padding:6px 10px;font-size:12px;">
              <option value="semana">Últimas 8 semanas</option>
              <option value="mes" selected>Últimos 12 meses</option>
              <option value="anio">Últimos 5 años</option>
            </select>
          </div>
          <div style="padding:16px 18px;">
            <div style="position:relative;height:280px;"><canvas id="chOrdenes"></canvas></div>
          </div>
        </div>
        <div class="panel force-expanded no-scroll" style="margin-bottom:0;">
          <div class="panel-header">
            <h3>Movimientos por tipo</h3>
            <select id="chTiposFiltro" style="width:auto;margin:0;padding:6px 10px;font-size:12px;">
              <option value="semana">Última semana</option>
              <option value="mes" selected>Últimos 30 días</option>
              <option value="anio">Año actual</option>
            </select>
          </div>
          <div style="padding:16px 18px;">
            <div style="position:relative;height:280px;"><canvas id="chTipos"></canvas></div>
          </div>
        </div>
      </div>

      <div class="panel force-collapsed">
        <div class="panel-header"><h3>Consumo mensual · top 5 insumos · últimos 12 meses</h3></div>
        <div style="padding:16px 18px;">
          <div style="position:relative;height:340px;"><canvas id="chConsumo"></canvas></div>
        </div>
      </div>

      <div class="panel force-collapsed">
        <div class="panel-header"><h3>Top 10 insumos por valor en stock</h3></div>
        <div style="padding:16px 18px;">
          <div style="position:relative;height:${Math.max(240,dataTopValor.labels.length*36)}px;"><canvas id="chTopValor"></canvas></div>
        </div>
      </div>

      <div class="panel force-expanded no-scroll">
        <div class="panel-header"><h3>Resumen del período</h3></div>
        <div class="grid-cards" style="margin:0;padding:16px 18px 0;grid-template-columns:repeat(4,minmax(0,1fr));">
          <div class="stat-card neutral"><p class="stat-label">Movimientos analizados</p><p class="stat-value">${movs.length}</p></div>
          <div class="stat-card neutral"><p class="stat-label">Órdenes analizadas</p><p class="stat-value">${ordenes.length}</p></div>
          <div class="stat-card info"><p class="stat-label">Valor total en stock</p><p class="stat-value" style="font-size:18px;">${money(dataTopValor.datasets[0].data.reduce(function(a,b){return a+b;},0))}</p></div>
          <div class="stat-card neutral"><p class="stat-label">Insumos con stock</p><p class="stat-value">${insumos.filter(function(i){return (i.existencia_actual||0)>0;}).length}</p></div>
        </div>
        <div style="height:16px;"></div>
      </div>
    `;

    /* Render de los 4 gráficos */
    renderChartBar('chOrdenes', calcOrdenesPorPeriodo(ordenes, document.getElementById('chOrdenesFiltro').value), false);
    renderChartDoughnut('chTipos', calcMovimientosPorTipoPeriodo(movs, document.getElementById('chTiposFiltro').value));
    renderChartLine('chConsumo', dataConsumo);
    renderChartBar('chTopValor', dataTopValor, true);

    /* Listeners de los filtros */
    document.getElementById('chOrdenesFiltro').addEventListener('change', function(e){
      renderChartBar('chOrdenes', calcOrdenesPorPeriodo(ordenes, e.target.value), false);
    });
    document.getElementById('chTiposFiltro').addEventListener('change', function(e){
      renderChartDoughnut('chTipos', calcMovimientosPorTipoPeriodo(movs, e.target.value));
    });
  }catch(e){
    main.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
  }
}


/* ============ RENTABILIDAD — CAPA 2 (RENDER) ============ */
async function renderRentabilidad(){
  const main=document.getElementById('mainContent');
  main.innerHTML='<div class="empty-state">Cargando análisis de rentabilidad…</div>';

  try{
    const [productos,ordenes,insumos,subproductos,recetas,hijos,bom,paqueteSubs]=await Promise.all([
      api('productos_terminados?select=*&order=nombre'),
      api('ordenes_semanales?select=id,codigo_pt,cantidad_proyectada,estado_op,fecha_completado&estado_op=eq.Terminada&limit=2000'),
      api('insumos?select=id,codigo,nombre,unidad_medida,unidad_consumo,conversiones,existencia_actual,punto_reorden,costo_unitario&order=nombre'),
      api('subproductos?select=id,codigo,nombre,tipo,existencia_actual'),
      api('subproducto_recetas?select=subproducto_id,insumo_id,cantidad_por_unidad,unidad_receta,factor_receta'),
      api('subproducto_subproductos?select=subproducto_padre_id,subproducto_hijo_id,cantidad_por_unidad'),
      api('bom_recetas?select=codigo_pt,insumo_id,cantidad_por_unidad'),
      api('paquete_subproductos?select=codigo_pt,subproducto_id,cantidad')
    ]);

    const costos=calcularCostos({insumos:insumos,subproductos:subproductos,recetas:recetas,hijos:hijos,bom:bom,paqueteSubs:paqueteSubs});
    const analisis=calcRentabilidadPorPT(productos,ordenes,costos);
    const conPrecio=analisis.filter(function(a){return a.precio_venta!=null&&a.precio_venta>0;});
    const sinPrecio=analisis.filter(function(a){return a.precio_venta==null||a.precio_venta<=0;});

    let ingresoTotal=0,costoTotal=0;
    conPrecio.forEach(function(a){ingresoTotal+=a.ingresos;costoTotal+=a.costo_produccion;});
    const margenTotal=ingresoTotal-costoTotal;
    const margenPctTotal=ingresoTotal>0?(margenTotal/ingresoTotal*100):0;

    const conMovimiento=analisis.filter(function(a){return a.unidades_producidas>0;}).sort(function(a,b){return b.margen-a.margen;});
    const dataGrafico=prepararDatosGraficoMargen(analisis,10);

    main.innerHTML=`
      <h2 class="page-title">Rentabilidad por producto</h2>
      <p class="page-sub">Margen bruto por PT, basado en el precio de venta y el costo teórico de la receta, sobre las órdenes terminadas.</p>

      <div class="grid-cards">
        <div class="stat-card neutral"><p class="stat-label">PT con precio</p><p class="stat-value">${conPrecio.length} / ${analisis.length}</p></div>
        <div class="stat-card info"><p class="stat-label">Ingresos estimados</p><p class="stat-value" style="font-size:18px;">${money(ingresoTotal)}</p></div>
        <div class="stat-card warning"><p class="stat-label">Costo de producción</p><p class="stat-value" style="font-size:18px;">${money(costoTotal)}</p></div>
        <div class="stat-card ${margenTotal>=0?'success':'danger'}"><p class="stat-label">Margen bruto</p><p class="stat-value" style="font-size:18px;">${money(margenTotal)}<br><span style="font-size:12px;opacity:.75;">${num(margenPctTotal,1)}%</span></p></div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Margen por producto · top 10</h3></div>
        <div style="padding:16px 18px;">
          <div style="position:relative;height:${Math.max(280,dataGrafico.labels.length*38)}px;"><canvas id="chMargen"></canvas></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Detalle por producto</h3></div>
        <div class="search-box"><input id="buscar_rent" placeholder="Buscar producto…"></div>
        ${analisis.length===0?'<div class="empty-state">No hay productos.</div>':`
        <table id="tablaRent">
          <tr>
            <th>Producto</th>
            <th class="num">Precio venta</th>
            <th class="num">Costo unitario</th>
            <th class="num">Margen u.</th>
            <th class="num">Margen %</th>
            <th class="num">Unid. producidas</th>
            <th class="num">Ingresos</th>
            <th class="num">Margen total</th>
          </tr>
          ${conMovimiento.concat(analisis.filter(function(a){return a.unidades_producidas===0;})).map(function(a){
            const sinPrecio=a.precio_venta==null||a.precio_venta<=0;
            const margenU=sinPrecio?null:(a.precio_venta-a.costo_unitario);
            const margenUPct=sinPrecio?null:(a.precio_venta>0?(margenU/a.precio_venta*100):0);
            const colorM=margenU==null?'color:var(--text-muted);':(margenU>=0?'color:var(--success);':'color:var(--danger);');
            const colorT=a.margen>=0?'color:var(--success);':'color:var(--danger);';
            return '<tr>'
              +'<td>'+a.nombre+' <span class="mono" style="color:var(--text-muted);font-size:11px;">'+a.codigo_pt+'</span></td>'
              +'<td class="num">'+(sinPrecio?'<span style="color:var(--text-muted);">—</span>':money(a.precio_venta))+'</td>'
              +'<td class="num">'+money(a.costo_unitario)+'</td>'
              +'<td class="num" style="'+colorM+'">'+(margenU==null?'—':money(margenU))+'</td>'
              +'<td class="num" style="'+colorM+'">'+(margenUPct==null?'—':num(margenUPct,1)+'%')+'</td>'
              +'<td class="num">'+num(a.unidades_producidas)+'</td>'
              +'<td class="num">'+(sinPrecio?'<span style="color:var(--text-muted);">—</span>':money(a.ingresos))+'</td>'
              +'<td class="num" style="'+colorT+'"><b>'+(sinPrecio?'—':money(a.margen))+'</b></td>'
              +'</tr>';
          }).join('')}
        </table>`}
      </div>

      ${sinPrecio.length>0?`<div class="panel"><div class="panel-header"><h3>Productos sin precio de venta (${sinPrecio.length})</h3></div><div class="empty-state" style="text-align:left;padding:16px 18px;">Estos PT no participan del cálculo de margen. Ve a <b>Productos &amp; BOM</b>, edita cada uno y asigna un <b>precio de venta</b>.<br><br>${sinPrecio.map(function(a){return '<span class="badge neutral" style="margin:3px;">'+a.nombre+'</span>';}).join('')}</div></div>`:''}
    `;

    filtrarTabla('buscar_rent','tablaRent');
    paginarTabla('tablaRent');

    if(typeof Chart!=='undefined'&&dataGrafico.labels.length){
      _destroyChart('chMargen');
      _initChartDefaults();
      chartInstances['chMargen']=new Chart(document.getElementById('chMargen'),{
        type:'bar',
        data:dataGrafico,
        options:{
          responsive:true,
          maintainAspectRatio:false,
          indexAxis:'y',
          plugins:{
            legend:{display:false},
            tooltip:{
              backgroundColor:'#262c3b',
              borderColor:'#2b3140',
              borderWidth:1,
              padding:10,
              callbacks:{label:function(c){return money(c.parsed.x);}}
            }
          },
          scales:{
            x:{grid:{color:'#2b3140'},ticks:{color:'#8d95a6',callback:function(v){return money(v);}},beginAtZero:true},
            y:{grid:{display:false},ticks:{color:'#8d95a6'}}
          }
        }
      });
    }
  }catch(e){
    main.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
  }
}
/* ============ TRAZABILIDAD ============ */
let _trazaCacheData=null;

async function cargarDataTrazabilidad(){
  if(_trazaCacheData) return _trazaCacheData;
  const [insumos,subproductos,productos,recetas,hijos,bom,paqueteSubs,proveedores]=await Promise.all([
    api('insumos?select=id,codigo,nombre,unidad_medida,unidad_consumo,conversiones,costo_unitario&order=nombre'),
    api('subproductos?select=id,codigo,nombre,tipo&order=nombre'),
    api('productos_terminados?select=codigo_pt,nombre,unidades_por_caja&order=nombre'),
    api('subproducto_recetas?select=subproducto_id,insumo_id,cantidad_por_unidad,unidad_receta,factor_receta'),
    api('subproducto_subproductos?select=subproducto_padre_id,subproducto_hijo_id,cantidad_por_unidad'),
    api('bom_recetas?select=codigo_pt,insumo_id,cantidad_por_unidad'),
    api('paquete_subproductos?select=codigo_pt,subproducto_id,cantidad'),
    api('sys_proveedores?select=id,razon_social&order=razon_social')
  ]);
  _trazaCacheData={insumos:insumos,subproductos:subproductos,productos:productos,recetas:recetas,hijos:hijos,bom:bom,paqueteSubs:paqueteSubs,proveedores:proveedores};
  return _trazaCacheData;
}

function _trazaInsumoHTML(ins, cant, lotesInfo){
  const u=unidadConsumo(ins);
  const lotes=lotesInfo&&lotesInfo.length
    ? '<div class="traza-lotes">'
      + lotesInfo.slice(0,3).map(function(l){
          return '<span class="traza-lote-chip">'
            +'<b>'+(l.lote_insumo||'sin lote')+'</b>'
            +' · '+num(l.cantidad,2)+' '+u
            +(l.sys_proveedores?' · '+l.sys_proveedores.razon_social:'')
            +'</span>';
        }).join('')
      + (lotesInfo.length>3?'<span class="traza-lote-chip traza-lote-more">+'+(lotesInfo.length-3)+' más</span>':'')
      + '</div>'
    : '<div class="traza-lotes"><span class="traza-lote-chip traza-lote-empty">Sin entradas registradas</span></div>';
  return '<div class="traza-insumo">'
    +'<div class="traza-insumo-head">'
      +'<span class="traza-icon">'+icono('box')+'</span>'
      +'<span class="traza-insumo-nombre">'+ins.nombre+' <small class="mono">'+ins.codigo+'</small></span>'
      +'<span class="traza-cantidad">'+num(cant,4)+' '+u+'</span>'
    +'</div>'
    +lotes
    +'</div>';
}

function _trazaSubproductoHTML(sub, cant, data, depth, lotesPorInsumo){
  depth=depth||0;
  if(depth>10) return '<div class="traza-insumo"><i>Profundidad máxima alcanzada</i></div>';
  const hijos=data.hijos.filter(function(h){return h.subproducto_padre_id===sub.id;});
  const rec=data.recetas.filter(function(r){return r.subproducto_id===sub.id;});
  let inner='';
  rec.forEach(function(r){
    const ins=data.insumos.find(function(x){return x.id===r.insumo_id;});
    if(!ins) return;
    const cantReal=Number(r.cantidad_por_unidad)*cant;
    const lotes=lotesPorInsumo[ins.id]||[];
    inner+=_trazaInsumoHTML(ins,cantReal,lotes);
  });
  hijos.forEach(function(h){
    const sub2=data.subproductos.find(function(x){return x.id===h.subproducto_hijo_id;});
    if(!sub2) return;
    const cantReal=Number(h.cantidad_por_unidad)*cant;
    inner+=_trazaSubproductoHTML(sub2,cantReal,data,depth+1,lotesPorInsumo);
  });
  const abierto=depth<2?' open':'';
  return '<details class="traza-node traza-sub"'+abierto+'>'
    +'<summary>'
      +'<span class="traza-icon">'+icono('wrench')+'</span>'
      +'<span class="traza-node-nombre">'+sub.nombre+' <small class="mono">'+sub.codigo+'</small></span>'
      +'<span class="traza-cantidad">'+num(cant,4)+' u</span>'
      +'<span class="traza-count">'+(rec.length+hijos.length)+' componentes</span>'
    +'</summary>'
    +'<div class="traza-children">'+inner+'</div>'
    +'</details>';
}

function imprimirProgramacionSemanal(desde, hasta, dias, fechas, ordenes, entregas){
  // Formatear el título de la semana: "SEMANA 19 AL 23 DE OCTUBRE"
  const fDesde = fechas[0];
  const fHasta = fechas[4]; // El viernes ahora es el índice 4 (antes era el 6)
  const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  let tituloSemana = '';
  if (fDesde.getMonth() === fHasta.getMonth()) {
    tituloSemana = `SEMANA ${fDesde.getDate()} AL ${fHasta.getDate()} DE ${meses[fDesde.getMonth()]}`;
  } else {
    tituloSemana = `SEMANA ${fDesde.getDate()} DE ${meses[fDesde.getMonth()]} AL ${fHasta.getDate()} DE ${meses[fHasta.getMonth()]}`;
  }

  let tabla = '<table class="print-table" style="width:100%; border-collapse:collapse; font-size:9.5pt; margin-top:20px;">';
  tabla += '<thead><tr><th style="width:20%; border:1px solid #000; padding:8px; background:#eee;">DÍA</th><th style="border:1px solid #000; padding:8px; background:#eee;">TAREAS POR EJECUTAR</th></tr></thead><tbody>';

  fechas.forEach((fecha, idx) => {
    const fechaStr = fecha.toISOString().slice(0,10);
    const opsDia = ordenes.filter(o => {
      const ini = o.fecha_programada;
      const fin = o.fecha_fin_programada || o.fecha_programada;
      return ini && fechaStr >= ini && fechaStr <= fin;
    });
    
    // Formato del día: "Lunes 12 de octubre"
    const nombreDia = dias[idx];
    const nombreMes = meses[fecha.getMonth()].toLowerCase();
    const labelFecha = `${nombreDia} ${fecha.getDate()} de ${nombreMes}`;

    tabla += `<tr>
      <td style="border:1px solid #000; padding:8px; font-weight:bold; vertical-align:top;">${labelFecha}</td>
      <td style="border:1px solid #000; padding:8px; vertical-align:top; line-height:1.5;">`;

    if(opsDia.length === 0) {
      tabla += '<span style="color:#999; font-style:italic;">—</span>';
    } else {
      opsDia.forEach(o => {
        const numOP = o.numero_op || 'S/N';
        const prod = o.productos_terminados ? o.productos_terminados.nombre : o.codigo_pt;
        const cant = o.cantidad_proyectada;
        const fin = o.fecha_fin_programada || o.fecha_programada;
        
        let tarea = 'Continuar';
        if (fechaStr === o.fecha_programada && fechaStr === fin) tarea = 'Hacer';
        else if (fechaStr === o.fecha_programada) tarea = 'Iniciar';
        else if (fechaStr === fin) tarea = 'Terminar';
        
        tabla += `<div style="margin-bottom:6px;">
          <b>${numOP}:</b> ${tarea} ${num(cant)} ${prod}
        </div>`;
      });
    }
    tabla += `</td></tr>`;
  });

  // Fila inferior para las Entregas
  tabla += `<tr>
    <td colspan="2" style="border:1px solid #000; padding:0;">
      <table style="width:100%; border-collapse:collapse;">
        <tr><td colspan="2" style="background:#eee; border-bottom:1px solid #000; padding:6px 8px; font-weight:bold; text-align:center;">FECHAS DE ENTREGA DE PRODUCTOS</td></tr>`;

  // Agrupar entregas por día
  const entregasPorDia = {};
  entregas.forEach(e => {
    const d = new Date(e.fecha);
    const idx = fechas.findIndex(f => f.toISOString().slice(0,10) === d.toISOString().slice(0,10));
    if(idx !== -1) {
      if(!entregasPorDia[idx]) entregasPorDia[idx] = [];
      entregasPorDia[idx].push(e);
    }
  });

  let hayEntregas = false;
  fechas.forEach((fecha, idx) => {
    if(entregasPorDia[idx] && entregasPorDia[idx].length > 0) {
      hayEntregas = true;
      const nombreDia = dias[idx].toUpperCase();
      const txtEntregas = entregasPorDia[idx].map(e => {
        const prod = e.ordenes_semanales && e.ordenes_semanales.productos_terminados ? e.ordenes_semanales.productos_terminados.nombre : 'Producto';
        return `${num(e.cantidad)} ${prod}`;
      }).join(', ');

      tabla += `<tr>
        <td style="border-bottom:1px solid #000; border-right:1px solid #000; padding:6px 8px; font-weight:bold; width:20%;">${nombreDia}:</td>
        <td style="border-bottom:1px solid #000; padding:6px 8px;">${txtEntregas}</td>
      </tr>`;
    }
  });

  if(!hayEntregas) {
    tabla += `<tr><td colspan="2" style="padding:10px; text-align:center; color:#666;">No hay entregas programadas.</td></tr>`;
  }

  tabla += `</table></td></tr></tbody></table>`;

  // Firmas
  const firmas = `
    <div class="print-signatures" style="grid-template-columns: 1fr 1fr 1fr; margin-top:60px;">
      <div class="print-signature">
        <div class="name">JEFE DE PRODUCCIÓN</div>
      </div>
      <div class="print-signature">
        <div class="name">JEFE DE LOGÍSTICA</div>
      </div>
      <div class="print-signature">
        <div class="name">GERENTE DE OPERACIONES</div>
      </div>
    </div>
  `;

  const html = printHeaderHTML('ORDENES DE PRODUCCIÓN', tituloSemana)
    + tabla
    + firmas
    + printFooterHTML();

  const cssPrint = `
    @page { size: letter portrait; margin: 15mm; }
    body { padding: 0; font-family: Arial, Helvetica, sans-serif; }
    .print-header { margin-bottom: 20px; }
    .print-table td { font-size: 9.5pt; }
  `;

  imprimirHTML(html, 'Programacion Semanal', cssPrint);
}

let html5QrCode = null; // Variable global para el escáner

async function renderOrdenesCompra(){
  const main=document.getElementById('mainContent');
  main.innerHTML='<div class="empty-state">Cargando órdenes de compra…</div>';

  try{
    // Traer todas las entradas que tengan número de OC
    const entradas = await api('movimientos_inventario?select=*,insumos(nombre,codigo,unidad_consumo),sys_proveedores(razon_social)&tipo=eq.Entrada&numero_oc=not.is.null&order=fecha.desc');

    // Agrupar por OC
    const agrupado = {};
    entradas.forEach(e => {
      const oc = e.numero_oc.trim();
      if(!agrupado[oc]) {
        agrupado[oc] = {
          numero_oc: oc,
          proveedor: e.sys_proveedores ? e.sys_proveedores.razon_social : '—',
          items: [],
          ultima_fecha: e.fecha,
          pendiente: 0
        };
      }
      agrupado[oc].items.push(e);
      
      // Tomar el pendiente de la entrada más reciente
      if (new Date(e.fecha) >= new Date(agrupado[oc].ultima_fecha)) {
        agrupado[oc].ultima_fecha = e.fecha;
        agrupado[oc].pendiente = e.cantidad_pendiente_oc || 0;
      }
    });

    const listaOCs = Object.values(agrupado).sort((a,b) => new Date(b.ultima_fecha) - new Date(a.ultima_fecha));

    main.innerHTML=`
      <div class="page-header-flex">
        <div>
          <h2 class="page-title">Órdenes de Compra</h2>
          <p class="page-sub">Seguimiento de entregas parciales y saldos pendientes por proveedor.</p>
        </div>
        ${botonRefreshHTML('ordenes_compra')}
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Listado de OCs</h3></div>
        <div class="search-box"><input id="buscar_oc" placeholder="Buscar por N° OC o proveedor…"></div>
        
        ${listaOCs.length === 0 ? '<div class="empty-state">No hay Órdenes de Compra registradas en las entradas de mercancía.</div>' : `
        <table id="tablaOCs">
          <thead><tr>
            <th>N° OC</th>
            <th>Proveedor</th>
            <th>Último Ingreso</th>
            <th class="num">Ítems Recibidos</th>
            <th class="num">Saldo Pendiente</th>
            <th>Estado</th>
            <th class="actions"></th>
          </tr></thead>
          <tbody>
            ${listaOCs.map(oc => {
              const enProceso = oc.pendiente > 0;
              return `<tr>
                <td class="mono" style="font-weight:bold; font-size:13px;">${oc.numero_oc}</td>
                <td>${oc.proveedor}</td>
                <td class="mono" style="font-size:12px; color:var(--text-secondary);">${new Date(oc.ultima_fecha).toLocaleDateString('es-CO')}</td>
                <td class="num">${oc.items.length}</td>
                <td class="num" style="font-weight:bold; color:${enProceso ? 'var(--warning)' : 'var(--success)'};">
                  ${enProceso ? num(oc.pendiente,4) : 'Completada'}
                </td>
                <td>
                  ${enProceso ? '<span class="badge warning">Pendiente</span>' : '<span class="badge success">Cerrada</span>'}
                </td>
                <td class="actions">
                  <button class="ghost small" data-ver-oc="${oc.numero_oc}">Ver Detalle</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>

      <div id="ocDetalleContainer"></div>
    `;

    filtrarTabla('buscar_oc', 'tablaOCs');

    // Bind para ver el detalle de una OC
    document.querySelectorAll('[data-ver-oc]').forEach(btn => {
      btn.addEventListener('click', function() {
        const numOC = btn.dataset.verOc;
        const ocData = agrupado[numOC];
        mostrarDetalleOC(ocData);
      });
    });

  } catch(e) {
    main.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
  }
}

function mostrarDetalleOC(oc) {
  const box = document.getElementById('ocDetalleContainer');
  
  const filas = oc.items.sort((a,b) => new Date(b.fecha) - new Date(a.fecha)).map(e => {
    const ins = e.insumos || {};
    const u = ins.unidad_consumo || 'UND';
    return `<tr>
      <td class="mono" style="font-size:12px;">${new Date(e.fecha).toLocaleDateString('es-CO')}</td>
      <td class="mono" style="font-size:12px; color:var(--info);">${e.numero_factura || '—'}</td>
      <td>${ins.nombre || '?'}</td>
      <td class="num" style="color:var(--success); font-weight:bold;">+${num(e.cantidad,4)} ${u}</td>
      <td class="mono" style="font-size:11px;">${e.lote_insumo || '—'}</td>
      <td>${e.estado_calidad === 'Aprobado' ? '<span class="badge success">Aprobado</span>' : (e.estado_calidad === 'Rechazado' ? '<span class="badge danger">Rechazado</span>' : '<span class="badge warning">Cuarentena</span>')}</td>
    </tr>`;
  }).join('');

  box.innerHTML = `
    <div class="panel force-expanded" style="border: 1px solid var(--accent);">
      <div class="panel-header" style="background: var(--surface-2);">
        <h3>Historial de Entregas · OC ${oc.numero_oc} <span style="font-size:12px; font-weight:400; color:var(--text-muted);">(${oc.proveedor})</span></h3>
        <button class="ghost small" id="btnCerrarDetalleOC">Cerrar</button>
      </div>
      <table>
        <thead><tr>
          <th>Fecha Recepción</th>
          <th>Factura</th>
          <th>Insumo</th>
          <th class="num">Cant. Recibida</th>
          <th>Lote</th>
          <th>Calidad</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `;

  document.getElementById('btnCerrarDetalleOC').onclick = function() {
    box.innerHTML = '';
  };
  
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function renderBodega(){
  const main=document.getElementById('mainContent');
  
  // Detener la cámara si estaba encendida
  if(html5QrCode && html5QrCode.isScanning) {
    try { await html5QrCode.stop(); html5QrCode.clear(); } catch(e){}
  }

  const isTouchDevice = ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  main.innerHTML=`
    <div class="page-header-flex">
      <div>
        <h2 class="page-title">Bodega PT</h2>
        <p class="page-sub">Escaneá cajas o visualizá el mapa de ubicaciones.</p>
      </div>
      ${botonRefreshHTML('bodega')}
    </div>

    <div class="panel force-expanded no-scroll">
      <div style="padding:14px 18px;">
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="secondary small tab-btn active" data-bodega-tab="escaner">📷 Escanear Caja</button>
          <button class="secondary small tab-btn" data-bodega-tab="mapa">🗺 Mapa Visual</button>
        </div>
      </div>
    </div>

    <!-- Pestaña 1: Escáner -->
    <div id="bodegaEscanerWrap">
      <div class="grid-cards g2" style="align-items:start;">
        <div class="panel force-expanded">
          <div class="panel-header"><h3>Escanear Caja</h3></div>
          <div style="padding:16px; text-align:center;">
            
            <!-- Vista para PC (Escáner USB) -->
            <div id="scanPCContainer" style="display:${isTouchDevice ? 'none' : 'block'};">
              <div style="font-size:48px; margin-bottom:12px; color:var(--text-muted);">⌨️</div>
              <label style="font-size:13px; margin-bottom:8px; display:block;">Usa tu pistola láser o escribe el código</label>
              <input id="scanInputPC" placeholder="Clic aquí y escanea el código..." style="text-align:center; font-size:18px; font-family:monospace; letter-spacing:1px; padding:12px;">
              <div class="field-hint" style="margin-top:6px;">El campo se limpia automáticamente al leer.</div>
            </div>

            <!-- Vista para Tablet/Móvil (Cámara) -->
            <div id="scanMobileContainer" style="display:${isTouchDevice ? 'block' : 'none'};">
              <div id="reader" style="width:100%; max-width:400px; margin:0 auto; border-radius:12px; overflow:hidden; border:1px solid var(--border); display:none;"></div>
              <button id="btnStartScan" class="full" style="max-width:300px; margin:0 auto; margin-bottom:8px;">Encender Cámara</button>
              <button id="btnCancelScan" class="danger-btn full" style="max-width:300px; margin:0 auto; display:none;">Cancelar escaneo</button>
            </div>

            <!-- Panel de resultado -->
            <div id="scanResult" style="margin-top:20px; display:none;">
              <div class="alert-banner success" style="margin-bottom:10px;"><div class="alert-icon">✓</div><div class="alert-body"><strong>Caja escaneada:</strong> <span id="scanCode" style="font-family:monospace; font-size:16px;"></span></div></div>
              <div class="form-grid" style="padding:0; text-align:left;">
                <div class="full-span"><label>Ubicación Física (Estante, Nivel, etc.)</label><input id="scanLocation" placeholder="Ej: Estante A - Nivel 2"></div>
                <div class="full-span"><label>Estado de la caja</label><select id="scanStatus"><option value="En bodega">En bodega</option><option value="Despachada">Despachada</option><option value="Cuarentena">En cuarentena</option></select></div>
              </div>
              <button id="btnSaveLocation" class="success-btn full" style="margin-top:10px;">Guardar Ubicación</button>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header"><h3>Últimos Movimientos</h3></div>
          <div class="search-box"><input id="buscar_bodega" placeholder="Buscar por código o ubicación…"></div>
          <div id="bodegaListado"><div class="empty-state">Cargando movimientos…</div></div>
        </div>
      </div>
    </div>

    <!-- Pestaña 2: Mapa Visual -->
    <div id="bodegaMapaWrap" style="display:none;">
      <div class="panel force-expanded">
        <div class="panel-header"><h3>Mapa de Bodega (Cajas activas)</h3></div>
        <div class="search-box"><input id="buscar_mapa" placeholder="Buscar por ubicación…"></div>
        <div id="bodegaMapaListado" class="bodega-map-grid">
          <div class="empty-state" style="grid-column:1/-1;">Cargando mapa…</div>
        </div>
      </div>
    </div>`;

  // Tabs
  document.querySelectorAll('[data-bodega-tab]').forEach(b => {
    b.addEventListener('click', function() {
      document.querySelectorAll('[data-bodega-tab]').forEach(x => x.classList.toggle('active', x === b));
      const tab = b.dataset.bodegaTab;
      document.getElementById('bodegaEscanerWrap').style.display = tab === 'escaner' ? 'block' : 'none';
      document.getElementById('bodegaMapaWrap').style.display = tab === 'mapa' ? 'block' : 'none';
    });
  });

  // Cargar el listado de cajas (Tabla)
  async function cargarCajas() {
    const box = document.getElementById('bodegaListado');
    try {
      const cajas = await api('cajas_ubicacion?select=*&order=actualizado_en.desc&limit=50');
      if(!cajas.length) {
        box.innerHTML = '<div class="empty-state">Aún no hay cajas ubicadas.</div>';
        return;
      }
      box.innerHTML = '<table id="tablaBodega" style="font-size:12px;"><tr><th>Caja</th><th>Ubicación</th><th>Estado</th><th>Últ. Mov.</th></tr>' +
        cajas.map(c => `<tr>
          <td class="mono" style="font-size:11px;">${c.codigo_caja}</td>
          <td style="font-weight:500;">${c.ubicacion}</td>
          <td>${c.estado === 'En bodega' ? '<span class="badge success">En bodega</span>' : (c.estado === 'Despachada' ? '<span class="badge neutral">Despachada</span>' : '<span class="badge warning">Cuarentena</span>')}</td>
          <td class="mono" style="font-size:10.5px; color:var(--text-muted);">${new Date(c.actualizado_en).toLocaleString('es-CO', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}</td>
        </tr>`).join('') + '</table>';
      filtrarTabla('buscar_bodega', 'tablaBodega');
    } catch(e) { box.innerHTML = '<div class="empty-state">Error al cargar.</div>'; }
  }

  // Cargar el Mapa Visual (Grid)
  async function cargarMapa() {
    const box = document.getElementById('bodegaMapaListado');
    try {
      const cajas = await api('cajas_ubicacion?select=*&estado=eq.En bodega');
      if(!cajas.length) {
        box.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No hay cajas activas en bodega.</div>';
        return;
      }

      // Agrupar por ubicación
      const ubicaciones = {};
      cajas.forEach(c => {
        const ub = c.ubicacion.trim() || 'Sin ubicación asignada';
        if(!ubicaciones[ub]) ubicaciones[ub] = [];
        ubicaciones[ub].push(c);
      });

      // Renderizar tarjetas
      box.innerHTML = Object.keys(ubicaciones).sort().map(ub => {
        const items = ubicaciones[ub];
        return `<div class="bodega-map-card" data-ubicacion="${ub.toLowerCase()}">
          <div class="bodega-map-header">
            <div class="bodega-map-title">📍 ${ub}</div>
            <div class="bodega-map-count">${items.length} caja${items.length===1?'':'s'}</div>
          </div>
          <div class="bodega-map-body">
            ${items.map(c => `<div class="bodega-map-item">
              <span class="bodega-map-code">${c.codigo_caja}</span>
              <span style="font-size:11px; color:var(--text-muted);">${c.codigo_pt}</span>
            </div>`).join('')}
          </div>
        </div>`;
      }).join('');

      // Filtro simple para el mapa
      const inp = document.getElementById('buscar_mapa');
      inp.addEventListener('input', function() {
        const q = this.value.toLowerCase();
        document.querySelectorAll('.bodega-map-card').forEach(card => {
          card.style.display = card.dataset.ubicacion.includes(q) ? 'block' : 'none';
        });
      });

    } catch(e) { box.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">Error al cargar mapa.</div>'; }
  }

  cargarCajas();
  cargarMapa();

  const resultDiv = document.getElementById('scanResult');

  function procesarCodigoEscaneado(codigo) {
    if (!codigo) return;
    document.getElementById('scanCode').textContent = codigo;
    resultDiv.style.display = 'block';
    document.getElementById('scanLocation').value = '';
    document.getElementById('scanLocation').focus();
    window._codigoCajaEscaneada = codigo;
  }

  if (!isTouchDevice) {
    const inputPC = document.getElementById('scanInputPC');
    inputPC.focus();
    inputPC.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const codigo = this.value.trim();
        if (codigo) {
          procesarCodigoEscaneado(codigo);
          this.value = '';
        }
      }
    });
    document.getElementById('scanPCContainer').addEventListener('click', () => inputPC.focus());
  }

  if (isTouchDevice) {
    const btnStart = document.getElementById('btnStartScan');
    const btnCancel = document.getElementById('btnCancelScan');
    const readerDiv = document.getElementById('reader');

    btnStart.onclick = async function() {
      btnStart.style.display = 'none';
      btnCancel.style.display = 'block';
      readerDiv.style.display = 'block';
      if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            html5QrCode.stop().then(() => {
              readerDiv.style.display = 'none';
              btnStart.style.display = 'block';
              btnStart.textContent = 'Escanear otra caja';
              btnCancel.style.display = 'none';
              procesarCodigoEscaneado(decodedText);
            }).catch(err => console.error(err));
          },
          (errorMessage) => { }
        );
      } catch (err) {
        toast("Error al encender la cámara: " + err, "error");
        readerDiv.style.display = 'none';
        btnStart.style.display = 'block';
        btnCancel.style.display = 'none';
      }
    };

    btnCancel.onclick = async function() {
      if (html5QrCode && html5QrCode.isScanning) {
        try { await html5QrCode.stop(); html5QrCode.clear(); } catch(e) { console.error(e); }
      }
      readerDiv.style.display = 'none';
      btnStart.style.display = 'block';
      btnCancel.style.display = 'none';
      toast('Escaneo cancelado', 'info');
    };
  }

  document.getElementById('btnSaveLocation').onclick = async function() {
    const codigo = window._codigoCajaEscaneada;
    const ubicacion = document.getElementById('scanLocation').value.trim();
    const estado = document.getElementById('scanStatus').value;
    
    if(!ubicacion) { toast('Escribí una ubicación física.', 'error'); return; }
    const codigoPT = codigo.substring(0, codigo.lastIndexOf('-'));

    try {
      await withLoading(this, async function() {
        await api('cajas_ubicacion?on_conflict=codigo_caja', {
          method: 'POST',
          headers: apiHeaders({'Prefer': 'resolution=merge-duplicates'}),
          body: JSON.stringify({
            codigo_caja: codigo,
            codigo_pt: codigoPT,
            ubicacion: ubicacion,
            estado: estado,
            usuario_email: SUPA_PROFILE ? SUPA_PROFILE.email : 'desconocido',
            actualizado_en: new Date().toISOString()
          })
        });
        toast('Ubicación guardada correctamente.', 'success');
        resultDiv.style.display = 'none';
        
        if (!isTouchDevice) {
            const inputPC = document.getElementById('scanInputPC');
            if (inputPC) inputPC.focus();
        }
        
        // Refrescar ambas vistas
        cargarCajas();
        cargarMapa();
      });
    } catch(e) {
      toast('Error al guardar: ' + e.message, 'error');
    }
  };
}

function abrirModalEvaluacion(prov, arrStats) {
  const hoy = new Date().toISOString().slice(0,10);
  
  // Sugerencia automática de calidad basada en tasa de devolución
  let sugerenciaCalidad = 5.0;
  if (prov.tasa_dev > 10) sugerenciaCalidad = 2.0;
  else if (prov.tasa_dev > 5) sugerenciaCalidad = 3.0;
  else if (prov.tasa_dev > 2) sugerenciaCalidad = 4.0;

  const inputScore = (id, val) => `
    <input type="number" id="${id}" min="0" max="5" step="0.1" value="${val.toFixed(1)}" 
           style="text-align:center; font-weight:bold; font-size:16px; font-family:'IBM Plex Mono',monospace;">
  `;

  abrirModalGenerico({
    title:'Evaluación de Proveedor',
    subtitle: prov.nombre + ' · NIT: ' + prov.nit,
    icon: icono('clipboard','lg'),
    variant: 'info',
    size: 'md',
    body: `
      <div style="font-size:12px; color:var(--text-secondary); margin-bottom:16px; line-height:1.5; background:var(--surface-2); padding:10px; border-radius:8px;">
        <b>Código: CYC-GEF-FR-06</b> · Califique de 0.0 a 5.0 según los criterios establecidos en el SGC.
      </div>
      <div class="form-grid labels-bottom" style="padding:0;">
        <div><label>Fecha de Evaluación</label><input id="eval_fecha" type="date" value="${hoy}"></div>
        <div><label>Evaluador</label><input id="eval_evaluador" value="${SUPA_PROFILE ? SUPA_PROFILE.email : ''}" disabled></div>
        
        <div><label>Cumplimiento y Entrega</label>${inputScore('eval_entrega', 5.0)}</div>
        
        <div>
          <label>Calidad y Especificaciones</label>
          ${inputScore('eval_calidad', sugerenciaCalidad)}
          <div class="field-hint" style="text-align:center;">Sugerido por historial: ${sugerenciaCalidad}</div>
        </div>
        
        <div><label>Servicio Postventa</label>${inputScore('eval_postventa', 5.0)}</div>
        
        <div>
          <label>Certificado de Fumigación</label>
          <select id="eval_fumigacion" style="width:100%; height:42px;">
            <option value="5.0">Sí aplica (Envía) - 5.0</option>
            <option value="3.5">Sí aplica (No envía) - 3.5</option>
            <option value="5.0">No aplica - 5.0</option>
          </select>
        </div>
        
        <div><label>Precio</label>${inputScore('eval_precio', 5.0)}</div>
        
        <div class="full-span" style="grid-column: 1 / -1; margin-top:10px;">
          <label>Observaciones</label>
          <textarea id="eval_obs" rows="3" placeholder="Escribe aquí el plan de mejora o comentarios adicionales..."></textarea>
        </div>
      </div>
    `,
    footer: `<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;">
      <button class="ghost" id="eval_cancelar">Cancelar</button>
      <button id="eval_guardar">Guardar y Calcular Nota</button>
    </div>`,
    onOpen: function() {
      document.getElementById('eval_cancelar').onclick = cerrarModalGenerico;
      
      document.getElementById('eval_guardar').onclick = async function(ev) {
        // Validar que los inputs no estén vacíos o fuera de rango
        const obtenerNota = (id) => {
          let val = parseFloat(document.getElementById(id).value);
          if (isNaN(val)) val = 0;
          if (val < 0) val = 0;
          if (val > 5) val = 5;
          return val;
        };

        const entrega = obtenerNota('eval_entrega');
        const calidad = obtenerNota('eval_calidad');
        const postventa = obtenerNota('eval_postventa');
        const fumigacion = parseFloat(document.getElementById('eval_fumigacion').value);
        const precio = obtenerNota('eval_precio');
        
        const promedio = (entrega + calidad + postventa + fumigacion + precio) / 5;
        let resultado = 'No Confiable';
        if (promedio >= 4.5) resultado = 'Excelente';
        else if (promedio >= 3.9) resultado = 'Bueno';
        else if (promedio >= 3.0) resultado = 'Regular';

        await withLoading(ev.currentTarget, async function() {
          await api('evaluaciones_proveedores', {
            method: 'POST',
            body: JSON.stringify({
              proveedor_id: prov.id,
              proveedor_nombre: prov.nombre,
              proveedor_nit: prov.nit,
              fecha: document.getElementById('eval_fecha').value,
              evaluador_email: document.getElementById('eval_evaluador').value,
              nota_entrega: entrega,
              nota_calidad: calidad,
              nota_postventa: postventa,
              nota_fumigacion: fumigacion,
              nota_precio: precio,
              promedio: promedio,
              resultado: resultado,
              observaciones: document.getElementById('eval_obs').value.trim()
            })
          });
        });
        toast(`Evaluación guardada. Promedio: ${promedio.toFixed(1)} (${resultado})`, 'success');
        cerrarModalGenerico();
        renderEvaluacionProv();
      };
    }
  });
}

function imprimirEvaluacionProveedor(ev) {
  const colorRes = ev.resultado === 'Excelente' ? '#28a745' : (ev.resultado === 'Bueno' ? '#17a2b8' : (ev.resultado === 'Regular' ? '#ffc107' : '#dc3545'));
  
  const html = `
    <div class="print-header">
      <div class="print-brand">
        <img src="logo-proclides.png" style="height:40px;">
        <div class="print-company">PROCLIDES SOLUCIONES ESTERILES S.A.S<small>EVALUACIÓN DE PROVEEDORES</small></div>
      </div>
      <div class="print-title">
        <div style="font-size:9pt; text-align:left; line-height:1.4;">
          <b>Código:</b> CYC-GEF-FR-06<br>
          <b>Versión:</b> 1<br>
          <b>Vigente desde:</b> 2025-01-01
        </div>
      </div>
    </div>

    <div class="print-info-grid">
      <div><div class="lbl">Nombre / Razón Social</div><div class="val">${ev.proveedor_nombre}</div></div>
      <div><div class="lbl">C.C. o NIT</div><div class="val">${ev.proveedor_nit}</div></div>
      <div><div class="lbl">Fecha Evaluación</div><div class="val">${new Date(ev.fecha+'T12:00:00').toLocaleDateString('es-CO')}</div></div>
    </div>

    <p style="font-size:9pt; margin:10px 0;">Verificado el cumplimiento o no de los factores de evaluación establecidos en la siguiente tabla, se calificará al Proveedor con un Puntaje entre 0.0 a 5.0 puntos.</p>

    <table class="print-table" style="font-size:9pt;">
      <thead>
        <tr>
          <th style="width:40%;">CARACTERÍSTICAS</th>
          <th style="width:45%;">CRITERIO</th>
          <th style="width:15%; text-align:center;">PUNTAJE</th>
        </tr>
      </thead>
      <tbody>
        <tr><td rowspan="3"><b>CUMPLIMIENTO Y ENTREGA</b></td><td>Excelente / Bueno (A tiempo o antes)</td><td style="text-align:center;">${num(ev.nota_entrega,1)}</td></tr>
        <tr><td>Regular (Retraso menor al 20%)</td><td style="text-align:center;">—</td></tr>
        <tr><td>No Cumple (Retraso mayor al 20%)</td><td style="text-align:center;">—</td></tr>
        
        <tr><td rowspan="3"><b>CALIDAD Y ESPECIFICACIONES</b></td><td>Excelente / Bueno (Cumple requisitos)</td><td style="text-align:center;">${num(ev.nota_calidad,1)}</td></tr>
        <tr><td>Regular (Subsanó a tiempo)</td><td style="text-align:center;">—</td></tr>
        <tr><td>No Cumple (Inconformidad grave)</td><td style="text-align:center;">—</td></tr>

        <tr><td rowspan="3"><b>SERVICIO POSTVENTA</b></td><td>Excelente / Bueno (Atento)</td><td style="text-align:center;">${num(ev.nota_postventa,1)}</td></tr>
        <tr><td>Regular (Atiende desobligado)</td><td style="text-align:center;">—</td></tr>
        <tr><td>No Cumple (Desatiende)</td><td style="text-align:center;">—</td></tr>

        <tr><td><b>CERTIFICADO DE FUMIGACIÓN</b></td><td>Sí Aplica (Envía) / No Aplica</td><td style="text-align:center;">${num(ev.nota_fumigacion,1)}</td></tr>
        <tr><td><b>PRECIO</b></td><td>Excelente (Competitivo)</td><td style="text-align:center;">${num(ev.nota_precio,1)}</td></tr>
      </tbody>
    </table>

    <div style="display:flex; gap:20px; margin-top:20px;">
      <div style="flex:1; border:1px solid #000; padding:10px; text-align:center;">
        <div style="font-size:8pt; text-transform:uppercase; color:#666;">PROMEDIO</div>
        <div style="font-size:24pt; font-weight:bold;">${num(ev.promedio,1)}</div>
      </div>
      <div style="flex:2; border:1px solid #000; padding:10px; display:flex; flex-direction:column; justify-content:center;">
        <div style="font-size:8pt; text-transform:uppercase; color:#666;">RESULTADO</div>
        <div style="font-size:14pt; font-weight:bold; color:${colorRes};">${ev.resultado.toUpperCase()}</div>
        <div style="font-size:8pt; color:#444; margin-top:4px;">
          ${ev.resultado === 'Regular' ? 'Condicionado. Debe presentar plan de mejora.' : (ev.resultado === 'No Confiable' ? 'Restringido. Buscar reemplazo.' : 'Proveedor confiable y recomendado.')}
        </div>
      </div>
    </div>

    <div class="print-section-title">OBSERVACIONES:</div>
    <div style="border:1px solid #000; padding:10px; min-height:50px; font-size:9pt;">${ev.observaciones || 'Sin observaciones adicionales.'}</div>

    <div class="print-signatures" style="grid-template-columns:1fr 1fr;">
      <div class="print-signature"><div class="name">EVALUADOR</div><div class="role">${ev.evaluador_email || 'Firma'}</div></div>
      <div class="print-signature"><div class="name">COORDINADORA DE OPERACIONES</div><div class="role">Firma</div></div>
    </div>
    
    ${printFooterHTML()}
  `;
  
  // Forzamos márgenes más amplios y ajustamos el cuerpo para que no quede pegado al borde
  const cssPrint = `
    @page { size: letter portrait; margin: 20mm 20mm; }
    body { padding: 0; }
    .print-header { margin-bottom: 25px; }
    .print-table { margin-bottom: 20px; }
    .print-signatures { margin-top: 40px; }
  `;
  
  imprimirHTML(html, 'Evaluacion Proveedor', cssPrint);
}

async function renderEvaluacionProv(){
  const main=document.getElementById('mainContent');
  main.innerHTML='<div class="empty-state">Cargando evaluación de proveedores…</div>';

  try{
    const [compras, devoluciones, proveedores, evaluaciones] = await Promise.all([
      api('movimientos_inventario?select=proveedor_id,cantidad,costo_unitario_momento&tipo=eq.Entrada&proveedor_id=not.is.null'),
      api('movimientos_inventario?select=proveedor_id,cantidad,costo_unitario_momento&tipo=eq.Salida&proveedor_id=not.is.null'),
      api('sys_proveedores?select=id,razon_social,nit&order=razon_social'),
      api('evaluaciones_proveedores?select=*&order=fecha.desc')
    ]);

    // --- Calcular Análisis Automático ---
    const stats = {};
    proveedores.forEach(p => {
      stats[p.id] = { id: p.id, nombre: p.razon_social, nit: p.nit, total_comprado: 0, valor_comprado: 0, total_devuelto: 0, valor_devuelto: 0, pedidos: 0 };
    });

    compras.forEach(c => {
      if(!stats[c.proveedor_id]) return;
      const cant = Number(c.cantidad) || 0;
      const costo = Number(c.costo_unitario_momento) || 0;
      stats[c.proveedor_id].total_comprado += cant;
      stats[c.proveedor_id].valor_comprado += (cant * costo);
      stats[c.proveedor_id].pedidos++;
    });

    devoluciones.forEach(d => {
      if(!stats[d.proveedor_id]) return;
      const cant = Number(d.cantidad) || 0;
      const costo = Number(d.costo_unitario_momento) || 0;
      stats[d.proveedor_id].total_devuelto += cant;
      stats[d.proveedor_id].valor_devuelto += (cant * costo);
    });

    const arrStats = Object.values(stats).map(s => {
      s.tasa_dev = s.valor_comprado > 0 ? (s.valor_devuelto / s.valor_comprado) * 100 : 0;
      const evalProv = evaluaciones.find(e => e.proveedor_id === s.id);
      s.ultima_eval = evalProv;
      return s;
    }).filter(s => s.pedidos > 0).sort((a,b) => b.valor_comprado - a.valor_comprado);

    const totalCompradoGlobal = arrStats.reduce((acc, s) => acc + s.valor_comprado, 0);

    main.innerHTML=`
      <div class="page-header-flex">
        <div>
          <h2 class="page-title">Evaluación de Proveedores</h2>
          <p class="page-sub">Gestión de calidad y análisis histórico.</p>
        </div>
        ${botonRefreshHTML('evaluacion_prov')}
      </div>

      <div class="panel force-expanded no-scroll">
        <div style="padding:14px 18px;">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="secondary small tab-btn active" data-eval-tab="metricas">📊 Análisis Automático</button>
            <button class="secondary small tab-btn" data-eval-tab="formales">📋 Evaluaciones Formales (SGC)</button>
          </div>
        </div>
      </div>

      <div id="evalMetricas">
        <div class="grid-cards">
          <div class="stat-card info"><p class="stat-label">Proveedores Activos</p><p class="stat-value">${arrStats.length}</p></div>
          <div class="stat-card neutral"><p class="stat-label">Volumen Total Comprado</p><p class="stat-value" style="font-size:18px;">${money(totalCompradoGlobal)}</p></div>
        </div>
        <div class="panel">
          <div class="panel-header"><h3>Desempeño por Proveedor</h3></div>
          <table>
            <thead><tr>
              <th>Proveedor</th>
              <th class="num">Compras ($)</th>
              <th class="num">Tasa Devolución</th>
              <th>Última Evaluación</th>
              <th class="actions"></th>
            </tr></thead>
            <tbody>
              ${arrStats.map(s => {
                const ultEval = s.ultima_eval;
                let badgeEval = '<span class="badge neutral" style="font-size:10px;">Sin eval.</span>';
                if(ultEval) {
                  const color = ultEval.resultado === 'Excelente' ? 'success' : (ultEval.resultado === 'Bueno' ? 'info' : (ultEval.resultado === 'Regular' ? 'warning' : 'danger'));
                  badgeEval = `<span class="badge ${color}">${ultEval.resultado} (${num(ultEval.promedio,1)})</span>`;
                }
                return `<tr>
                  <td>${s.nombre} <span class="mono" style="font-size:11px;color:var(--text-muted);">${s.nit}</span></td>
                  <td class="num">${money(s.valor_comprado)}</td>
                  <td class="num" style="color:${s.tasa_dev>5?'var(--danger)':'var(--success)'}; font-weight:600;">${num(s.tasa_dev, 2)}%</td>
                  <td>${badgeEval}</td>
                  <td class="actions"><button class="ghost small" data-nueva-eval="${s.id}">Evaluar</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div id="evalFormales" style="display:none;">
        <div class="panel">
          <div class="panel-header"><h3>Historial de Evaluaciones Formales</h3></div>
          <table>
            <thead><tr><th>Fecha</th><th>Proveedor</th><th class="num">Promedio</th><th>Resultado</th><th>Evaluador</th><th class="actions"></th></tr></thead>
            <tbody>
              ${evaluaciones.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:16px; color:var(--text-muted);">No hay evaluaciones registradas.</td></tr>' : 
                evaluaciones.map(ev => {
                  const color = ev.resultado === 'Excelente' ? 'success' : (ev.resultado === 'Bueno' ? 'info' : (ev.resultado === 'Regular' ? 'warning' : 'danger'));
                  return `<tr>
                    <td class="mono">${new Date(ev.fecha+'T12:00:00').toLocaleDateString('es-CO')}</td>
                    <td>${ev.proveedor_nombre}</td>
                    <td class="num" style="font-weight:bold;">${num(ev.promedio, 1)}</td>
                    <td><span class="badge ${color}">${ev.resultado}</span></td>
                    <td style="font-size:12px; color:var(--text-muted);">${ev.evaluador_email||'—'}</td>
                    <td class="actions"><button class="ghost small" data-print-eval="${ev.id}">PDF</button></td>
                  </tr>`;
                }).join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Tabs
    document.querySelectorAll('[data-eval-tab]').forEach(b => {
      b.addEventListener('click', function() {
        document.querySelectorAll('[data-eval-tab]').forEach(x => x.classList.toggle('active', x === b));
        const tab = b.dataset.evalTab;
        document.getElementById('evalMetricas').style.display = tab === 'metricas' ? 'block' : 'none';
        document.getElementById('evalFormales').style.display = tab === 'formales' ? 'block' : 'none';
      });
    });

    // Bind nuevo botón de Evaluar
    document.querySelectorAll('[data-nueva-eval]').forEach(btn => {
      btn.addEventListener('click', function() {
        const prov = arrStats.find(x => x.id === btn.dataset.nuevaEval);
        abrirModalEvaluacion(prov, arrStats);
      });
    });

    // Bind imprimir evaluaciones
    document.querySelectorAll('[data-print-eval]').forEach(btn => {
      btn.addEventListener('click', function() {
        const ev = evaluaciones.find(x => x.id === btn.dataset.printEval);
        imprimirEvaluacionProveedor(ev);
      });
    });

  }catch(e){
    main.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
  }
}

async function renderProgramacion(){
  const main=document.getElementById('mainContent');
  main.innerHTML='<div class="empty-state">Cargando programación…</div>';

  try{
    const hoy = new Date();
    // Calcular lunes y domingo de esta semana
    const diaSemana = hoy.getDay() || 7; 
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diaSemana + 1);
    const viernes = new Date(lunes);
    viernes.setDate(lunes.getDate() + 4); // Solo de Lunes a Viernes
    
    const defaultDesde = lunes.toISOString().slice(0,10);
    const defaultHasta = viernes.toISOString().slice(0,10);

    main.innerHTML=`
      <div class="page-header-flex">
        <div>
          <h2 class="page-title">Programación Semanal</h2>
          <p class="page-sub">Planificación de tareas por día y resumen de entregas.</p>
        </div>
        ${botonRefreshHTML('programacion')}
      </div>

      <div class="panel force-expanded no-scroll">
        <div class="panel-header"><h3>Semana a programar</h3></div>
        <div class="form-grid">
          <div><label>Desde (Lunes)</label><input id="prog_desde" type="date" value="${defaultDesde}"></div>
          <div><label>Hasta (Viernes)</label><input id="prog_hasta" type="date" value="${defaultHasta}"></div>
        </div>
        <div style="padding:0 18px 12px;display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="ghost small" data-prog-rango="semana_anterior">← Semana anterior</button>
          <button type="button" class="ghost small" data-prog-rango="semana_actual">Semana actual</button>
          <button type="button" class="ghost small" data-prog-rango="semana_siguiente">Semana siguiente →</button>
        </div>
        <div class="form-actions">
          <button id="btnProgGenerar">Generar programación</button>
          <button class="secondary" id="btnProgPrint" style="display:none;">${icono('printer','sm')} Imprimir PDF</button>
        </div>
      </div>

      <div id="progResultado"><div class="empty-state">Elegí la semana y presioná "Generar programación".</div></div>`;

    /* Lógica de filtros rápidos */
    document.querySelectorAll('[data-prog-rango]').forEach(function(b){
      b.addEventListener('click', function(){
        const r = b.dataset.progRango;
        const hoy = new Date();
        const diaSemana = hoy.getDay() || 7; 
        const lunesBase = new Date(hoy);
        lunesBase.setDate(hoy.getDate() - diaSemana + 1);
        
        let lunesTarget = new Date(lunesBase);
        if (r === 'semana_anterior') lunesTarget.setDate(lunesBase.getDate() - 7);
        else if (r === 'semana_siguiente') lunesTarget.setDate(lunesBase.getDate() + 7);

        const viernesTarget = new Date(lunesTarget);
        viernesTarget.setDate(lunesTarget.getDate() + 4);

        document.getElementById('prog_desde').value = lunesTarget.toISOString().slice(0,10);
        document.getElementById('prog_hasta').value = viernesTarget.toISOString().slice(0,10);
      });
    });

    document.getElementById('btnProgGenerar').addEventListener('click', async function(ev){
      const desdeStr = document.getElementById('prog_desde').value;
      const hastaStr = document.getElementById('prog_hasta').value;
      if(!desdeStr || !hastaStr) { toast('Selecciona ambas fechas.', 'error'); return; }

      const box = document.getElementById('progResultado');
      box.innerHTML = '<div class="empty-state">Calculando programación…</div>';

      await withLoading(ev.currentTarget, async function(){
        try {
          // 1. Obtener OPs programadas (incluye las que se cruzan con la semana)
          const ordenesRaw = await api(`ordenes_semanales?select=*,productos_terminados(nombre)&estado_op=in.(Pendiente,En%20proceso)&fecha_programada=lte.${hastaStr}&order=fecha_programada.asc`);
          
          // Filtrar las que realmente tocan esta semana (inician antes del fin y terminan después del inicio)
          const ordenes = ordenesRaw.filter(o => {
            const ini = o.fecha_programada;
            const fin = o.fecha_fin_programada || o.fecha_programada;
            return ini && fin && ini <= hastaStr && fin >= desdeStr;
          });

          // OPs pendientes pero sin fecha programada
          const opsSinFecha = await api(`ordenes_semanales?select=*,productos_terminados(nombre)&estado_op=in.(Pendiente,En%20proceso)&fecha_programada=is.null&order=fecha_creacion.desc`);
          
          // 2. Obtener entregas realizadas en esa semana (por fecha de entrega)
          const entregas = await api(`entregas_op?select=*,ordenes_semanales(numero_op,productos_terminados(nombre))&fecha=gte.${desdeStr}T00:00:00&fecha=lte.${hastaStr}T23:59:59&order=fecha.asc`);

          // 3. Agrupar por día (Lunes a Domingo)
          const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
          const fechas = [];
          const base = new Date(desdeStr + 'T12:00:00');
          for(let i=0; i<5; i++){ // Solo 5 días hábiles
            const d = new Date(base);
            d.setDate(base.getDate() + i);
            fechas.push(d);
          }

          let gridHTML = '<div class="prog-grid">';
          
          fechas.forEach((fecha, idx) => {
            const fechaStr = fecha.toISOString().slice(0,10);
            
            // Buscar OPs que estén activas este día
            const opsDia = ordenes.filter(o => {
              const ini = o.fecha_programada;
              const fin = o.fecha_fin_programada || o.fecha_programada;
              return ini && fechaStr >= ini && fechaStr <= fin;
            });

            gridHTML += `<div class="prog-col">
              <div class="prog-col-header">
                <div class="prog-day-name">${dias[idx]}</div>
                <div class="prog-day-date">${fecha.toLocaleDateString('es-CO', {day:'2-digit', month:'short'})}</div>
              </div>
              <div class="prog-col-body">
                ${opsDia.length === 0 ? '<div class="prog-empty">Libre</div>' : ''}
                ${opsDia.map(o => {
                  const fin = o.fecha_fin_programada || o.fecha_programada;
                  let tarea = 'Continuar';
                  if (fechaStr === o.fecha_programada && fechaStr === fin) tarea = 'Hacer';
                  else if (fechaStr === o.fecha_programada) tarea = 'Iniciar';
                  else if (fechaStr === fin) tarea = 'Terminar';

                  return `
                  <div class="prog-card">
                    <div class="prog-op">${o.numero_op || 'OP'}</div>
                    <div class="prog-prod"><b>${tarea}:</b> ${o.productos_terminados ? o.productos_terminados.nombre : o.codigo_pt}</div>
                    <div class="prog-cant">${num(o.cantidad_proyectada)} u</div>
                    ${badgeOP(o.estado_op)}
                  </div>
                `}).join('')}
              </div>
            </div>`;
          });
          gridHTML += '</div>';

          // 4. Entregas por día (Resumen)
          let entregasHTML = '<div class="panel force-expanded no-scroll" style="margin-top:20px;">';
          entregasHTML += '<div class="panel-header"><h3>Resumen de Entregas de la Semana</h3></div>';
          entregasHTML += '<table><thead><tr><th>Fecha</th><th>OP</th><th>Producto</th><th class="num">Cantidad</th><th>Lote</th></tr></thead><tbody>';
          
          if(entregas.length === 0) {
            entregasHTML += '<tr><td colspan="5" style="text-align:center; padding:16px; color:var(--text-muted);">No hay entregas registradas en esta semana.</td></tr>';
          } else {
            entregas.forEach(e => {
              const op = e.ordenes_semanales ? e.ordenes_semanales.numero_op : '—';
              const prod = e.ordenes_semanales && e.ordenes_semanales.productos_terminados ? e.ordenes_semanales.productos_terminados.nombre : '—';
              entregasHTML += `<tr>
                <td class="mono">${new Date(e.fecha).toLocaleString('es-CO', {weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}</td>
                <td class="mono">${op}</td>
                <td>${prod}</td>
                <td class="num" style="color:var(--success); font-weight:bold;">+${num(e.cantidad)} u</td>
                <td class="mono">${e.lote_entrega || '—'}</td>
              </tr>`;
            });
          }
          entregasHTML += '</tbody></table></div>';

          // 6. Panel de OPs sin fecha
          let sinFechaHTML = '';
          if (opsSinFecha.length > 0) {
            sinFechaHTML = `
              <div class="alert-banner warning" style="margin-bottom:20px; flex-direction:column; align-items:stretch;">
                <div style="display:flex; align-items:center; gap:12px;">
                  <div class="alert-icon">!</div>
                  <div class="alert-body">
                    <strong>Atención: Hay ${opsSinFecha.length} orden(es) sin fecha programada.</strong>
                    <span>Estas OPs no se pueden ubicar en el calendario hasta que les asignes una fecha.</span>
                  </div>
                </div>
                <div style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap;">
                  ${opsSinFecha.map(o => `<span class="badge neutral" style="font-size:11px;">OP ${o.numero_op || 'S/N'} - ${o.productos_terminados ? o.productos_terminados.nombre : o.codigo_pt}</span>`).join('')}
                </div>
              </div>
            `;
          }

          box.innerHTML = sinFechaHTML + gridHTML + entregasHTML;
          document.getElementById('btnProgPrint').style.display = 'inline-block';

          // 5. Bind de impresión
          document.getElementById('btnProgPrint').onclick = function() {
            imprimirProgramacionSemanal(desdeStr, hastaStr, dias, fechas, ordenes, entregas);
          };

        } catch(e) { box.innerHTML = '<div class="empty-state">Error: '+e.message+'</div>'; }
      });
    });

  } catch(e) {
    main.innerHTML = '<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
  }
}

function imprimirConsolidadoMP(desde, hasta, resultado) {
  const fechaHoy = new Date().toLocaleString('es-CO');
  
  let tabla = '<table class="print-table" style="width:100%; border-collapse:collapse; font-size:9.5pt; margin-top:15px;">';
  tabla += '<thead><tr>';
  tabla += '<th style="border:1px solid #000; padding:6px; background:#eee; text-align:left;">Código</th>';
  tabla += '<th style="border:1px solid #000; padding:6px; background:#eee; text-align:left;">Insumo</th>';
  tabla += '<th style="border:1px solid #000; padding:6px; background:#eee; text-align:right;">Requerido</th>';
  tabla += '<th style="border:1px solid #000; padding:6px; background:#eee; text-align:right;">En Stock</th>';
  tabla += '<th style="border:1px solid #000; padding:6px; background:#eee; text-align:right;">A Comprar</th>';
  tabla += '<th style="border:1px solid #000; padding:6px; background:#eee; text-align:center;">Estado</th>';
  tabla += '</tr></thead><tbody>';

  resultado.forEach(r => {
    const u = unidadConsumo(r.ins);
    // Si el faltante es 0, no mostramos el número sino un guion
    const txtFaltante = r.faltante > 0 ? `${num(r.faltante, 4)} ${u}` : '—';
    const colorFaltante = r.faltante > 0 ? '#dc3545' : '#28a745';
    
    tabla += `<tr>
      <td style="border:1px solid #000; padding:6px; font-family:monospace;">${r.ins.codigo}</td>
      <td style="border:1px solid #000; padding:6px;">${r.ins.nombre}</td>
      <td style="border:1px solid #000; padding:6px; text-align:right;">${num(r.requerido, 4)} ${u}</td>
      <td style="border:1px solid #000; padding:6px; text-align:right;">${num(r.stock, 4)} ${u}</td>
      <td style="border:1px solid #000; padding:6px; text-align:right; font-weight:bold; color:${colorFaltante};">${txtFaltante}</td>
      <td style="border:1px solid #000; padding:6px; text-align:center;">${r.faltante > 0 ? 'Comprar' : 'Cubierto'}</td>
    </tr>`;
  });

  tabla += '</tbody></table>';

  const firmas = `
    <div class="print-signatures" style="grid-template-columns: 1fr 1fr; margin-top:60px;">
      <div class="print-signature">
        <div class="name">JEFE DE COMPRAS</div>
      </div>
      <div class="print-signature">
        <div class="name">COORDINADOR DE PRODUCCIÓN</div>
      </div>
    </div>
  `;

  const html = printHeaderHTML('CONSOLIDADO DE MATERIAS PRIMAS', `Semana del ${desde} al ${hasta}`)
    + `<div style="font-size:9pt; color:#555; margin-bottom:10px;">Generado el: ${fechaHoy}</div>`
    + tabla
    + firmas
    + printFooterHTML();

  const cssPrint = `
    @page { size: letter portrait; margin: 15mm; }
    body { padding: 0; font-family: Arial, Helvetica, sans-serif; }
    .print-header { margin-bottom: 20px; }
    .print-table td { font-size: 9.5pt; }
  `;

  imprimirHTML(html, 'Consolidado Materias Primas', cssPrint);
}

async function renderConsolidado(){
  const main=document.getElementById('mainContent');
  main.innerHTML='<div class="empty-state">Cargando datos de consolidado…</div>';

  try{
    const data=await loadAllProductosData();
    const hoy = new Date();
    
    // Calcular lunes y domingo de esta semana
    const diaSemana = hoy.getDay() || 7; 
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diaSemana + 1);
    const viernes = new Date(lunes);
    viernes.setDate(lunes.getDate() + 4); // Solo de Lunes a Viernes
    
    const defaultDesde = lunes.toISOString().slice(0,10);
    const defaultHasta = viernes.toISOString().slice(0,10);

    main.innerHTML=`
      <div class="page-header-flex">
        <div>
          <h2 class="page-title">Consolidado de Materias Primas</h2>
          <p class="page-sub">Requerimiento total de insumos según las OPs programadas para una semana.</p>
        </div>
        ${botonRefreshHTML('consolidado')}
      </div>

      <div class="panel force-expanded no-scroll">
        <div class="panel-header"><h3>Filtros</h3></div>
        <div class="form-grid">
          <div><label>Desde</label><input id="cons_desde" type="date" value="${defaultDesde}"></div>
          <div><label>Hasta</label><input id="cons_hasta" type="date" value="${defaultHasta}"></div>
        </div>
        <div style="padding:0 18px 12px;display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="ghost small" data-cons-rango="semana_actual">Semana actual</button>
          <button type="button" class="ghost small" data-cons-rango="semana_siguiente">Próxima semana</button>
        </div>
        <div class="form-actions">
          <button id="btnConsGenerar">Generar consolidado</button>
          <button class="secondary" id="btnConsExport" style="display:none;">${icono('download','sm')} Exportar CSV</button>
          <button class="secondary" id="btnConsPrint" style="display:none;">${icono('printer','sm')} Imprimir PDF</button>
        </div>
      </div>

      <div id="consResultado"><div class="empty-state">Elegí un rango y presioná "Generar consolidado".</div></div>`;

    // Lógica de rangos rápidos
    document.querySelectorAll('[data-cons-rango]').forEach(function(b){
      b.addEventListener('click',function(){
        const r=b.dataset.consRango;
        const hoy = new Date();
        const diaSemana = hoy.getDay() || 7; 
        const lunes = new Date(hoy);
        lunes.setDate(hoy.getDate() - diaSemana + 1);
        
        if(r==='semana_actual'){
          const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
          document.getElementById('cons_desde').value = lunes.toISOString().slice(0,10);
          document.getElementById('cons_hasta').value = domingo.toISOString().slice(0,10);
        } else if (r==='semana_siguiente'){
          const lunesSig = new Date(lunes); lunesSig.setDate(lunes.getDate() + 7);
          const domingoSig = new Date(lunesSig); domingoSig.setDate(lunesSig.getDate() + 6);
          document.getElementById('cons_desde').value = lunesSig.toISOString().slice(0,10);
          document.getElementById('cons_hasta').value = domingoSig.toISOString().slice(0,10);
        }
      });
    });

    document.getElementById('btnConsGenerar').addEventListener('click', async function(ev){
      const desde = document.getElementById('cons_desde').value;
      const hasta = document.getElementById('cons_hasta').value;
      if(!desde || !hasta) { toast('Selecciona ambas fechas.', 'error'); return; }

      const box = document.getElementById('consResultado');
      box.innerHTML = '<div class="empty-state">Calculando requerimientos…</div>';

      await withLoading(ev.currentTarget, async function(){
        try {
          // 1. Obtener TODAS las OPs pendientes/proceso y filtrarlas localmente (más exacto)
          let q = 'ordenes_semanales?select=*,productos_terminados(nombre)&estado_op=in.(Pendiente,En%20proceso)';
          const ordenesRaw = await api(q);
          
          const ordenes = ordenesRaw.filter(o => {
            // Si tiene fecha programada, usamos esa; si no, usamos la fecha de creación
            const fIni = o.fecha_programada || o.fecha_creacion.split('T')[0];
            const fFin = o.fecha_fin_programada || fIni;
            return fIni <= hasta && fFin >= desde;
          });

          if(!ordenes.length){
            box.innerHTML = '<div class="empty-state">No hay órdenes en este rango.</div>';
            document.getElementById('btnConsExport').style.display='none';
            document.getElementById('btnConsPrint').style.display='none';
            return;
          }

          // 2. Explotar BOMs
          const requerimientos = {}; // { insumo_id: cantidad_total }
          
          function explotarSub(subId, cant, d) {
            d.recetas.filter(r => r.subproducto_id === subId).forEach(r => {
              requerimientos[r.insumo_id] = (requerimientos[r.insumo_id] || 0) + (r.cantidad_por_unidad * cant);
            });
            d.hijos.filter(h => h.subproducto_padre_id === subId).forEach(h => {
              explotarSub(h.subproducto_hijo_id, h.cantidad_por_unidad * cant, d);
            });
          }

          ordenes.forEach(o => {
            // Solo calculamos sobre lo que FALTA producir
            const cantOP = (Number(o.cantidad_proyectada) || 0) - (Number(o.cantidad_producida) || 0);
            if (cantOP <= 0) return;
            // Insumos directos
            data.bom.filter(b => b.codigo_pt === o.codigo_pt).forEach(b => {
              requerimientos[b.insumo_id] = (requerimientos[b.insumo_id] || 0) + (b.cantidad_por_unidad * cantOP);
            });
            // Subproductos
            data.paqueteSubs.filter(p => p.codigo_pt === o.codigo_pt).forEach(p => {
              explotarSub(p.subproducto_id, p.cantidad * cantOP, data);
            });
          });

          // 3. Armar tabla
          const resultado = Object.keys(requerimientos).map(id => {
            const ins = data.insumos.find(x => x.id === id);
            if (!ins) return null;
            const requerido = requerimientos[id];
            const stock = Number(ins.existencia_actual) || 0;
            const faltante = Math.max(0, requerido - stock);
            return { ins, requerido, stock, faltante };
          }).filter(Boolean).sort((a,b) => b.faltante - a.faltante || b.requerido - a.requerido);

          // 4. Render
          const totalFaltantes = resultado.filter(r => r.faltante > 0).length;
          
          box.innerHTML = `
            <div class="grid-cards">
              <div class="stat-card info"><p class="stat-label">OPs en el rango</p><p class="stat-value">${ordenes.length}</p></div>
              <div class="stat-card neutral"><p class="stat-label">Insumos requeridos</p><p class="stat-value">${resultado.length}</p></div>
              <div class="stat-card ${totalFaltantes>0?'danger':'success'}"><p class="stat-label">Insumos con faltante</p><p class="stat-value">${totalFaltantes}</p></div>
            </div>

            <div class="panel">
              <div class="panel-header"><h3>Requerimiento de Materias Primas (${desde} al ${hasta})</h3></div>
              <table id="tablaConsolidado">
                <thead><tr>
                  <th>Código</th>
                  <th>Insumo</th>
                  <th class="num">Requerido</th>
                  <th class="num">En Stock</th>
                  <th class="num">A Comprar</th>
                  <th>Estado</th>
                </tr></thead>
                <tbody>
                  ${resultado.map(r => {
                    const u = unidadConsumo(r.ins);
                    return `<tr>
                      <td class="mono" style="font-size:11.5px;">${r.ins.codigo}</td>
                      <td>${r.ins.nombre}</td>
                      <td class="num">${num(r.requerido,4)} ${u}</td>
                      <td class="num">${num(r.stock,4)} ${u}</td>
                      <td class="num" style="font-weight:bold; color:${r.faltante>0?'var(--danger)':'var(--success)'};">${r.faltante>0?num(r.faltante,4)+' '+u:'—'}</td>
                      <td>${r.faltante>0?'<span class="badge danger">Comprar</span>':'<span class="badge success">Cubierto</span>'}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`;

          document.getElementById('btnConsExport').style.display='inline-block';
          document.getElementById('btnConsPrint').style.display='inline-block';

          document.getElementById('btnConsExport').onclick = function() {
            const headers = ['Código', 'Insumo', 'Requerido', 'En Stock', 'A Comprar', 'Estado'];
            const filasCSV = resultado.map(r => [
              r.ins.codigo, r.ins.nombre, fmtCSV(r.requerido,4), fmtCSV(r.stock,4), fmtCSV(r.faltante,4), r.faltante>0?'Comprar':'Cubierto'
            ]);
            exportarCSV(`consolidado_${desde}_al_${hasta}`, headers, filasCSV);
          };

          document.getElementById('btnConsPrint').onclick = function() {
            imprimirConsolidadoMP(desde, hasta, resultado);
          };

        } catch(e) { box.innerHTML = '<div class="empty-state">Error: '+e.message+'</div>'; }
      });
    });

  } catch(e) {
    main.innerHTML = '<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
  }
}

async function renderTrazabilidad(){
  const main=document.getElementById('mainContent');
  main.innerHTML='<div class="empty-state">Cargando datos de trazabilidad…</div>';

  try{
    const data=await cargarDataTrazabilidad();

    main.innerHTML=`
      <div class="page-header-flex">
        <div>
          <h2 class="page-title">Trazabilidad</h2>
          <p class="page-sub">Análisis bidireccional: de un producto hacia sus insumos y lotes, o de un insumo hacia los productos que lo usan.</p>
        </div>
        ${botonRefreshHTML('trazabilidad')}
      </div>

      <div class="panel force-expanded no-scroll">
        <div style="padding:14px 18px;">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="secondary small tab-btn active" data-traza-modo="forward">${icono('search','sm')} ¿De dónde vino? (PT → insumos)</button>
            <button class="secondary small tab-btn" data-traza-modo="backward">${icono('undo','sm')} ¿A dónde fue? (insumo → PTs)</button>
          </div>
        </div>
      </div>

      <div id="trazaForwardWrap">
        <div class="panel force-expanded no-scroll">
          <div class="panel-header"><h3>Producto terminado</h3></div>
          <div class="form-grid labels-bottom">
            <div><label>Selecciona un PT</label><select id="traza_pt">
              ${data.productos.map(function(p){return '<option value="'+p.codigo_pt+'">'+p.nombre+' ('+p.codigo_pt+')</option>';}).join('')}
            </select></div>
            <div><label>Unidades a analizar</label><input id="traza_cantidad" type="number" min="1" step="1" value="1"></div>
          </div>
          <div class="form-actions"><button id="btnTrazaForward">Analizar trazabilidad</button></div>
        </div>
        <div id="trazaForwardResultado"><div class="empty-state">Selecciona un PT y presiona "Analizar trazabilidad".</div></div>
      </div>

      <div id="trazaBackwardWrap" style="display:none;">
        <div class="panel force-expanded no-scroll">
          <div class="panel-header"><h3>Insumo</h3></div>
          <div class="form-grid labels-bottom">
            <div><label>Selecciona un insumo</label><select id="traza_insumo">
              ${data.insumos.map(function(i){return '<option value="'+i.id+'">'+i.nombre+' ('+i.codigo+')</option>';}).join('')}
            </select></div>
          </div>
          <div class="form-actions"><button id="btnTrazaBackward">Buscar en PTs</button></div>
        </div>
        <div id="trazaBackwardResultado"><div class="empty-state">Selecciona un insumo y presiona "Buscar en PTs".</div></div>
      </div>`;

    /* Tabs */
    document.querySelectorAll('[data-traza-modo]').forEach(function(b){
      b.addEventListener('click',function(){
        document.querySelectorAll('[data-traza-modo]').forEach(function(x){x.classList.toggle('active',x===b);});
        const modo=b.dataset.trazaModo;
        document.getElementById('trazaForwardWrap').style.display=modo==='forward'?'block':'none';
        document.getElementById('trazaBackwardWrap').style.display=modo==='backward'?'block':'none';
      });
    });

    /* Forward */
    document.getElementById('btnTrazaForward').addEventListener('click',async function(ev){
      const codigoPT=document.getElementById('traza_pt').value;
      const cantidad=parseFloat(document.getElementById('traza_cantidad').value)||1;
      if(!codigoPT){toast('Selecciona un producto.','error');return;}
      await withLoading(ev.currentTarget,async function(){
        await ejecutarTrazaForward(data,codigoPT,cantidad);
      });
    });

    /* Backward */
    document.getElementById('btnTrazaBackward').addEventListener('click',async function(ev){
      const insumoId=document.getElementById('traza_insumo').value;
      if(!insumoId){toast('Selecciona un insumo.','error');return;}
      await withLoading(ev.currentTarget,async function(){
        ejecutarTrazaBackward(data,insumoId);
      });
    });
  }catch(e){
    main.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
  }
}

async function ejecutarTrazaForward(data,codigoPT,cantidad){
  const box=document.getElementById('trazaForwardResultado');
  const prod=data.productos.find(function(p){return p.codigo_pt===codigoPT;});
  if(!prod){box.innerHTML='<div class="empty-state">Producto no encontrado.</div>';return;}

  box.innerHTML='<div class="empty-state">Analizando insumos y lotes…</div>';

  /* Cargar los lotes EXACTOS consumidos para este PT/OP */
  let lotesPorInsumo={};
  try{
    // Buscamos los consumos asociados a las OPs de este PT
    const consumos=await api(`movimientos_inventario?select=insumo_id,lote_insumo,cantidad,orden_id,ordenes_semanales!inner(codigo_pt)&tipo=eq.Consumo&ordenes_semanales.codigo_pt=eq.${codigoPT}&lote_insumo=not.is.null`);
    consumos.forEach(function(c){
      if(!lotesPorInsumo[c.insumo_id]) lotesPorInsumo[c.insumo_id]=[];
      lotesPorInsumo[c.insumo_id].push({
        lote_insumo: c.lote_insumo,
        cantidad: c.cantidad,
        sys_proveedores: null // Podríamos cruzar con el lote si quisiéramos
      });
    });
  }catch(e){
    /* Fallback si la tabla no existe: usar movimientos */
    const movs=await api('movimientos_inventario?select=insumo_id,cantidad,lote_insumo,fecha,sys_proveedores(razon_social)&tipo=eq.Entrada&lote_insumo=not.is.null&order=fecha.desc&limit=500');
    movs.forEach(function(m){
      if(!m.insumo_id) return;
      if(!lotesPorInsumo[m.insumo_id]) lotesPorInsumo[m.insumo_id]=[];
      lotesPorInsumo[m.insumo_id].push(m);
    });
  }

  /* Construir árbol */
  const bom=data.bom.filter(function(b){return b.codigo_pt===codigoPT;});
  const paq=data.paqueteSubs.filter(function(p){return p.codigo_pt===codigoPT;});

  let html='';
  bom.forEach(function(b){
    const ins=data.insumos.find(function(x){return x.id===b.insumo_id;});
    if(!ins) return;
    const cantReal=Number(b.cantidad_por_unidad)*cantidad;
    html+=_trazaInsumoHTML(ins,cantReal,lotesPorInsumo[ins.id]||[]);
  });
  paq.forEach(function(p){
    const sub=data.subproductos.find(function(x){return x.id===p.subproducto_id;});
    if(!sub) return;
    const cantReal=Number(p.cantidad)*cantidad;
    html+=_trazaSubproductoHTML(sub,cantReal,data,0,lotesPorInsumo);
  });

  if(!html){
    box.innerHTML='<div class="empty-state">Este PT no tiene receta definida.</div>';
    return;
  }

  const nInsumos=new Set();
  bom.forEach(function(b){nInsumos.add(b.insumo_id);});
  const recolectar=(subId)=>{
    data.recetas.filter(function(r){return r.subproducto_id===subId;}).forEach(function(r){nInsumos.add(r.insumo_id);});
    data.hijos.filter(function(h){return h.subproducto_padre_id===subId;}).forEach(function(h){recolectar(h.subproducto_hijo_id);});
  };
  paq.forEach(function(p){recolectar(p.subproducto_id);});

  box.innerHTML=`
    <div class="panel force-expanded no-scroll">
      <div class="panel-header">
        <h3>${prod.nombre} <span class="mono" style="color:var(--text-muted);font-size:12px;">${prod.codigo_pt}</span> · ${num(cantidad)} u</h3>
        <span class="badge info">${nInsumos.size} insumos · ${paq.length} subproductos directos</span>
      </div>
      <div style="padding:14px 18px;">
        <div class="traza-tree">${html}</div>
      </div>
      <div style="padding:0 18px 14px;font-size:11.5px;color:var(--text-muted);line-height:1.5;">
        <b>Nota:</b> los lotes mostrados corresponden a las últimas entradas registradas con lote del proveedor. La trazabilidad exacta por lote consumido requiere FIFO estricto, que no está implementado.
      </div>
    </div>`;
}

function ejecutarTrazaBackward(data,insumoId){
  const box=document.getElementById('trazaBackwardResultado');
  const ins=data.insumos.find(function(x){return x.id===insumoId;});
  if(!ins){box.innerHTML='<div class="empty-state">Insumo no encontrado.</div>';return;}

  /* Buscar subproductos que usan el insumo */
  const subIds=new Set();
  data.recetas.filter(function(r){return r.insumo_id===insumoId;}).forEach(function(r){subIds.add(r.subproducto_id);});

  /* Subproductos padres que contienen esos subproductos (recursivo) */
  let changed=true;
  let iter=0;
  while(changed && iter<20){
    changed=false;
    data.hijos.forEach(function(h){
      if(subIds.has(h.subproducto_hijo_id) && !subIds.has(h.subproducto_padre_id)){
        subIds.add(h.subproducto_padre_id);
        changed=true;
      }
    });
    iter++;
  }

  /* PTs que usan el insumo directa o vía subproducto */
  const ptsDirectos=new Set();
  data.bom.filter(function(b){return b.insumo_id===insumoId;}).forEach(function(b){ptsDirectos.add(b.codigo_pt);});

  const ptsViaSub=new Set();
  data.paqueteSubs.forEach(function(p){
    if(subIds.has(p.subproducto_id)) ptsViaSub.add(p.codigo_pt);
  });

  const todosPT=new Set([...ptsDirectos,...ptsViaSub]);

  if(todosPT.size===0 && subIds.size===0){
    box.innerHTML='<div class="empty-state">Este insumo no está en ninguna receta.</div>';
    return;
  }

  let html='';

  if(ptsDirectos.size){
    html+='<details class="traza-node traza-pt" open>'
      +'<summary><span class="traza-icon">'+icono('box')+'</span><span class="traza-node-nombre">Uso directo en PT</span><span class="traza-count">'+ptsDirectos.size+'</span></summary>'
      +'<div class="traza-children">'+Array.from(ptsDirectos).map(function(cod){
        const p=data.productos.find(function(x){return x.codigo_pt===cod;});
        return '<div class="traza-insumo"><span class="traza-icon">'+icono('box')+'</span><span class="traza-insumo-nombre">'+(p?p.nombre:cod)+' <small class="mono">'+cod+'</small></span></div>';
      }).join('')+'</div>'
      +'</details>';
  }

  if(subIds.size){
    html+='<details class="traza-node traza-sub" open>'
      +'<summary><span class="traza-icon">'+icono('wrench')+'</span><span class="traza-node-nombre">Se usa en subproductos</span><span class="traza-count">'+subIds.size+'</span></summary>'
      +'<div class="traza-children">'+Array.from(subIds).map(function(id){
        const s=data.subproductos.find(function(x){return x.id===id;});
        return '<div class="traza-insumo"><span class="traza-icon">'+icono('wrench')+'</span><span class="traza-insumo-nombre">'+(s?s.nombre:'?')+' <small class="mono">'+(s?s.codigo:'')+'</small></span></div>';
      }).join('')+'</div>'
      +'</details>';
  }

  if(ptsViaSub.size){
    html+='<details class="traza-node traza-pt" open>'
      +'<summary><span class="traza-icon">'+icono('box')+'</span><span class="traza-node-nombre">PTs que lo contienen vía subproductos</span><span class="traza-count">'+ptsViaSub.size+'</span></summary>'
      +'<div class="traza-children">'+Array.from(ptsViaSub).map(function(cod){
        const p=data.productos.find(function(x){return x.codigo_pt===cod;});
        return '<div class="traza-insumo"><span class="traza-icon">'+icono('box')+'</span><span class="traza-insumo-nombre">'+(p?p.nombre:cod)+' <small class="mono">'+cod+'</small></span></div>';
      }).join('')+'</div>'
      +'</details>';
  }

  box.innerHTML=`
    <div class="panel force-expanded no-scroll">
      <div class="panel-header">
        <h3>${ins.nombre} <span class="mono" style="color:var(--text-muted);font-size:12px;">${ins.codigo}</span></h3>
        <span class="badge info">${todosPT.size} PT afectados</span>
      </div>
      <div style="padding:14px 18px;">
        <div class="traza-tree">${html}</div>
      </div>
    </div>`;
}

/* ============ COSTOS OP — CAPA 2 (RENDER) ============ */
async function renderCostosOP(){
  const main=document.getElementById('mainContent');
  main.innerHTML='<div class="empty-state">Cargando análisis de costos…</div>';

  try{
    const [ordenes,insumos,subproductos,recetas,hijos,bom,paqueteSubs]=await Promise.all([
      api('ordenes_semanales?select=*,productos_terminados(nombre)&estado_op=eq.Terminada&order=fecha_completado.desc&limit=200'),
      api('insumos?select=id,codigo,nombre,unidad_medida,unidad_consumo,conversiones,existencia_actual,punto_reorden,costo_unitario&order=nombre'),
      api('subproductos?select=id,codigo,nombre,tipo,existencia_actual'),
      api('subproducto_recetas?select=subproducto_id,insumo_id,cantidad_por_unidad,unidad_receta,factor_receta'),
      api('subproducto_subproductos?select=subproducto_padre_id,subproducto_hijo_id,cantidad_por_unidad'),
      api('bom_recetas?select=codigo_pt,insumo_id,cantidad_por_unidad'),
      api('paquete_subproductos?select=codigo_pt,subproducto_id,cantidad')
    ]);

    const costos=calcularCostos({insumos:insumos,subproductos:subproductos,recetas:recetas,hijos:hijos,bom:bom,paqueteSubs:paqueteSubs});

    /* Por cada OP terminada, calcular teórico */
    const analisis=[];
    for(let i=0;i<ordenes.length;i++){
      const o=ordenes[i];
      const bomPT=bom.filter(function(b){return b.codigo_pt===o.codigo_pt;});
      const paqPT=paqueteSubs.filter(function(p){return p.codigo_pt===o.codigo_pt;});
      const teo=calcCostoTeoricoOP(o,bomPT,paqPT,recetas,hijos,insumos,costos.subCosto);
      analisis.push({orden:o,teorico:teo});
    }

    const ordView=analisis.sort(function(a,b){return new Date(b.orden.fecha_completado)-new Date(a.orden.fecha_completado);});

    main.innerHTML=`
      <h2 class="page-title">Análisis de costos por OP</h2>
      <p class="page-sub">Compara el costo teórico (receta × cantidad) contra el costo real capturado al completar la OP.</p>

      <div class="panel force-expanded no-scroll">
        <div class="panel-header"><h3>Órdenes terminadas · ${ordView.length}</h3></div>
        <div class="search-box"><input id="buscar_costos" placeholder="Buscar por OP, lote o producto…"></div>
        ${ordView.length===0?'<div class="empty-state">Aún no hay OPs terminadas.</div>':`
        <table id="tablaCostos">
          <tr>
            <th>N° OP</th>
            <th>Producto</th>
            <th class="num">Unidades</th>
            <th class="num">Costo teórico</th>
            <th class="num">Costo unitario teo.</th>
            <th>Terminada</th>
            <th class="actions"></th>
          </tr>
          ${ordView.map(function(a,idx){
            const o=a.orden;
            const prod=o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt;
            const cuTeo=o.cantidad_proyectada>0?a.teorico.total/o.cantidad_proyectada:0;
            return '<tr><td class="mono">'+(o.numero_op||'—')+(o.lote?'<br><span style="font-size:11px;color:var(--text-muted);">'+o.lote+'</span>':'')+'</td><td>'+prod+'</td><td class="num">'+num(o.cantidad_proyectada)+'</td><td class="num">'+money(a.teorico.total)+'</td><td class="num">'+money(cuTeo)+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+(o.fecha_completado?new Date(o.fecha_completado).toLocaleDateString('es-CO'):'—')+'</td><td class="actions"><button class="ghost small" data-costo-idx="'+idx+'" title="Ver comparativo">Comparar</button></td></tr>';
          }).join('')}
        </table>`}
      </div>
      <div id="costoDetalle"></div>`;

    filtrarTabla('buscar_costos','tablaCostos');
    paginarTabla('tablaCostos');

    document.querySelectorAll('[data-costo-idx]').forEach(function(btn){
      btn.addEventListener('click',function(){
        const a=ordView[parseInt(btn.dataset.costoIdx,10)];
        mostrarComparativoOP(a,insumos,subproductos,costos);
      });
    });
  }catch(e){
    main.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
  }
}
async function mostrarComparativoOP(analisis,insumos,subproductos,costos){
  const box=document.getElementById('costoDetalle');
  const o=analisis.orden;
  box.innerHTML='<div class="empty-state">Cargando movimientos reales…</div>';
  box.scrollIntoView({behavior:'smooth',block:'start'});

  try{
    const movs=await api('movimientos_inventario?orden_id=eq.'+o.id+'&select=*,insumos(id,codigo,nombre,unidad_medida,unidad_consumo,conversiones),subproductos(id,codigo,nombre)&order=fecha.asc');
    const real=calcCostoRealOP(movs);
    const comp=calcComparativoInsumos(analisis.teorico,real);

    /* Ajuste: costo real de subproductos usando el costo teórico del subproducto */
    real.detalleSubs.forEach(function(d){
      d.costo_u=costos.subCosto[d.subproducto_id]||0;
      d.subtotal=d.costo_u*d.cantidad;
      real.totalSubs+=d.subtotal;
      real.total+=d.subtotal;
    });

    const diferencia=real.total-analisis.teorico.total;
    const pct=analisis.teorico.total>0?(diferencia/analisis.teorico.total*100):0;
    const cuTeo=o.cantidad_proyectada>0?analisis.teorico.total/o.cantidad_proyectada:0;
    const cuReal=o.cantidad_proyectada>0?real.total/o.cantidad_proyectada:0;

    box.innerHTML=`
      <div class="panel">
        <div class="panel-header">
          <h3>Comparativo · ${o.numero_op||''}${o.lote?' · lote '+o.lote:''} · ${o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt}</h3>
          ${diferencia>0?'<span class="badge danger">+'+money(diferencia)+' sobre lo teórico</span>':(diferencia<0?'<span class="badge success">'+money(diferencia)+' bajo lo teórico</span>':'<span class="badge neutral">Sin diferencia</span>')}
        </div>
        <div class="grid-cards" style="margin:0;padding:16px 18px 0;grid-template-columns:repeat(4,minmax(0,1fr));">
          <div class="stat-card neutral"><p class="stat-label">Costo teórico</p><p class="stat-value" style="font-size:18px;">${money(analisis.teorico.total)}</p></div>
          <div class="stat-card neutral"><p class="stat-label">Costo real</p><p class="stat-value" style="font-size:18px;">${money(real.total)}</p></div>
          <div class="stat-card neutral"><p class="stat-label">Costo unitario teo. / real</p><p class="stat-value" style="font-size:16px;">${money(cuTeo)} / ${money(cuReal)}</p></div>
          <div class="stat-card ${diferencia>0?'danger':(diferencia<0?'success':'neutral')}"><p class="stat-label">Variación</p><p class="stat-value" style="font-size:18px;">${diferencia>=0?'+':''}${money(diferencia)}<br><span style="font-size:12px;opacity:.75;">${pct>=0?'+':''}${num(pct,1)}%</span></p></div>
        </div>
        <div style="padding:20px 18px 8px;">
          <div style="position:relative;height:320px;"><canvas id="chComparativo"></canvas></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Desglose por insumo</h3></div>
        <table>
          <tr>
            <th>Insumo</th>
            <th class="num">Cant. teórica</th>
            <th class="num">Cant. real</th>
            <th class="num">Δ Cant.</th>
            <th class="num">Costo teórico</th>
            <th class="num">Costo real</th>
            <th class="num">Δ Costo</th>
            <th class="num">%</th>
          </tr>
          ${comp.map(function(c){
            const difC=c.dif_cant;
            const difK=c.dif_costo;
            const pctC=c.pct_costo;
            const colorC=difC>0?'color:var(--danger);':(difC<0?'color:var(--success);':'');
            const colorK=difK>0?'color:var(--danger);':(difK<0?'color:var(--success);':'');
            return '<tr>'
              +'<td>'+c.nombre+(c.codigo?' <span class="mono" style="color:var(--text-muted);font-size:11px;">'+c.codigo+'</span>':'')+'</td>'
              +'<td class="num">'+num(c.cant_teo,4)+' '+(c.unidad||'')+'</td>'
              +'<td class="num">'+num(c.cant_real,4)+' '+(c.unidad||'')+'</td>'
              +'<td class="num" style="'+colorC+'">'+(difC>=0?'+':'')+num(difC,4)+'</td>'
              +'<td class="num">'+money(c.costo_teo)+'</td>'
              +'<td class="num">'+money(c.costo_real)+'</td>'
              +'<td class="num" style="'+colorK+'">'+(difK>=0?'+':'')+money(difK)+'</td>'
              +'<td class="num" style="'+colorK+'">'+(pctC===null?'—':(pctC>=0?'+':'')+num(pctC,1)+'%')+'</td>'
              +'</tr>';
          }).join('')}
        </table>
      </div>`;

    /* Gráfico de barras comparativo */
    if(typeof Chart!=='undefined'&&comp.length){
      _destroyChart('chComparativo');
      _initChartDefaults();
      const top=comp.slice().sort(function(a,b){return Math.max(b.costo_teo,b.costo_real)-Math.max(a.costo_teo,a.costo_real);}).slice(0,8);
      chartInstances['chComparativo']=new Chart(document.getElementById('chComparativo'),{
        type:'bar',
        data:{
          labels:top.map(function(x){return x.nombre;}),
          datasets:[
            {label:'Teórico',data:top.map(function(x){return x.costo_teo;}),backgroundColor:'#6ab7ff',borderRadius:4},
            {label:'Real',data:top.map(function(x){return x.costo_real;}),backgroundColor:'#ffb020',borderRadius:4}
          ]
        },
        options:{
          responsive:true,
          maintainAspectRatio:false,
          plugins:{
            legend:{position:'bottom'},
            tooltip:{
              backgroundColor:'#262c3b',
              borderColor:'#2b3140',
              borderWidth:1,
              padding:10,
              callbacks:{label:function(c){return c.dataset.label+': '+money(c.parsed.y);}}
            }
          },
          scales:{
            x:{grid:{display:false},ticks:{color:'#8d95a6'}},
            y:{grid:{color:'#2b3140'},ticks:{color:'#8d95a6',callback:function(v){return money(v);}},beginAtZero:true}
          }
        }
      });
    }
  }catch(e){
    box.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
  }
}

/* ============ COMPRAS POR PROVEEDOR ============ */
let comprasFiltroCache=null;

async function renderCompras(){
  const main=document.getElementById('mainContent');
  const proveedores=await api('sys_proveedores?select=id,razon_social&order=razon_social');

  main.innerHTML=`
    <div class="page-header-flex">
      <div>
        <h2 class="page-title">Compras por proveedor</h2>
        <p class="page-sub">Análisis de todas las entradas de mercancía agrupadas por proveedor.</p>
      </div>
      ${botonRefreshHTML('compras')}
    </div>

    <div class="panel force-expanded no-scroll">
      <div class="panel-header"><h3>Filtros</h3></div>
      <div class="form-grid">
        <div><label>Desde</label><input id="comp_desde" type="date"></div>
        <div><label>Hasta</label><input id="comp_hasta" type="date"></div>
        <div><label>Proveedor</label>
          <select id="comp_proveedor">
            <option value="">— Todos —</option>
            ${proveedores.map(function(p){return '<option value="'+p.id+'">'+p.razon_social+'</option>';}).join('')}
          </select>
        </div>
      </div>
      <div style="padding:0 18px 12px;display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="ghost small" data-comp-rango="mes">Mes actual</button>
        <button type="button" class="ghost small" data-comp-rango="mes_ant">Mes anterior</button>
        <button type="button" class="ghost small" data-comp-rango="90d">Últimos 90 días</button>
        <button type="button" class="ghost small" data-comp-rango="anio">Año actual</button>
        <button type="button" class="ghost small" data-comp-rango="limpiar">Limpiar</button>
      </div>
      <div class="form-actions">
        <button id="btnCompGenerar">Generar reporte</button>
        <button class="secondary" id="btnCompExport" style="display:none;">${icono('download','sm')} Exportar CSV</button>
        <button class="secondary" id="btnCompPrint" style="display:none;">Imprimir / PDF</button>
      </div>
    </div>

    <div id="compResultado"><div class="empty-state">Elegí un rango y presioná "Generar reporte".</div></div>`;

  /* Rangos rápidos */
  document.querySelectorAll('[data-comp-rango]').forEach(function(b){
    b.addEventListener('click',function(){
      const r=b.dataset.compRango;
      const inpD=document.getElementById('comp_desde');
      const inpH=document.getElementById('comp_hasta');
      const hoy=new Date();
      const iso=function(d){return d.toISOString().slice(0,10);};
      if(r==='limpiar'){inpD.value='';inpH.value='';return;}
      if(r==='mes'){const d=new Date(hoy.getFullYear(),hoy.getMonth(),1);inpD.value=iso(d);inpH.value=iso(hoy);}
      else if(r==='mes_ant'){const ini=new Date(hoy.getFullYear(),hoy.getMonth()-1,1);const fin=new Date(hoy.getFullYear(),hoy.getMonth(),0);inpD.value=iso(ini);inpH.value=iso(fin);}
      else if(r==='90d'){const d=new Date(hoy);d.setDate(d.getDate()-90);inpD.value=iso(d);inpH.value=iso(hoy);}
      else if(r==='anio'){const d=new Date(hoy.getFullYear(),0,1);inpD.value=iso(d);inpH.value=iso(hoy);}
    });
  });

  document.getElementById('btnCompGenerar').addEventListener('click',async function(ev){
    const desde=document.getElementById('comp_desde').value;
    const hasta=document.getElementById('comp_hasta').value;
    const proveedorFiltro=document.getElementById('comp_proveedor').value;
    const box=document.getElementById('compResultado');
    box.innerHTML='<div class="empty-state">Generando reporte…</div>';

    await withLoading(ev.currentTarget,async function(){
      try{
        let q='movimientos_inventario?select=id,fecha,cantidad,cantidad_compra,unidad_compra,costo_unitario_momento,motivo,insumo_id,proveedor_id,insumos(id,codigo,nombre,unidad_consumo,unidad_medida),sys_proveedores(id,razon_social)&tipo=eq.Entrada&proveedor_id=not.is.null&order=fecha.desc&limit=10000';
        if(desde) q+='&fecha=gte.'+desde+'T00:00:00';
        if(hasta) q+='&fecha=lte.'+hasta+'T23:59:59';
        if(proveedorFiltro) q+='&proveedor_id=eq.'+proveedorFiltro;
        const movs=await api(q);

        if(!movs.length){
          box.innerHTML='<div class="empty-state">No hay compras para estos filtros.</div>';
          document.getElementById('btnCompExport').style.display='none';
          document.getElementById('btnCompPrint').style.display='none';
          return;
        }

        /* Agrupación por proveedor */
        const porProv={};
        let totalGlobal=0;
        let entradasGlobal=0;
        movs.forEach(function(m){
          const provId=m.proveedor_id;
          const provNombre=m.sys_proveedores?m.sys_proveedores.razon_social:'—';
          const costoUnit=Number(m.costo_unitario_momento)||0;
          const cant=Number(m.cantidad)||0;
          const sub=costoUnit*cant;
          totalGlobal+=sub;
          entradasGlobal++;
          if(!porProv[provId]){
            porProv[provId]={id:provId,nombre:provNombre,total:0,entradas:0,ultimaFecha:null,insumos:new Set(),movs:[]};
          }
          const p=porProv[provId];
          p.total+=sub;
          p.entradas++;
          if(!p.ultimaFecha||new Date(m.fecha)>new Date(p.ultimaFecha)) p.ultimaFecha=m.fecha;
          if(m.insumo_id) p.insumos.add(m.insumo_id);
          p.movs.push(m);
        });
        const proveedoresArr=Object.values(porProv).sort(function(a,b){return b.total-a.total;});
        const nProv=proveedoresArr.length;
        const promedio=entradasGlobal?totalGlobal/entradasGlobal:0;
        const topProv=proveedoresArr[0];
        comprasFiltroCache={movs:movs,proveedores:proveedoresArr,desde:desde,hasta:hasta};

        const filas=proveedoresArr.map(function(p){
          const ultima=p.ultimaFecha?new Date(p.ultimaFecha).toLocaleDateString('es-CO'):'—';
          return '<tr>'
            +'<td>'+p.nombre+'</td>'
            +'<td class="num">'+money(p.total)+'</td>'
            +'<td class="num">'+p.entradas+'</td>'
            +'<td class="num">'+p.insumos.size+'</td>'
            +'<td class="num">'+money(p.total/p.entradas)+'</td>'
            +'<td class="mono" style="font-size:12px;color:var(--text-secondary);">'+ultima+'</td>'
            +'<td class="actions"><button class="ghost small" data-comp-ver="'+p.id+'">Ver detalle</button></td>'
            +'</tr>';
        }).join('');

        box.innerHTML=`
          <div class="grid-cards">
            <div class="stat-card info"><p class="stat-label">Total comprado</p><p class="stat-value" style="font-size:18px;">${money(totalGlobal)}</p></div>
            <div class="stat-card neutral"><p class="stat-label">Entradas registradas</p><p class="stat-value">${entradasGlobal}</p></div>
            <div class="stat-card neutral"><p class="stat-label">Proveedores activos</p><p class="stat-value">${nProv}</p></div>
            <div class="stat-card neutral"><p class="stat-label">Promedio por entrada</p><p class="stat-value" style="font-size:18px;">${money(promedio)}</p></div>
          </div>

          ${topProv?'<div class="panel"><div class="panel-header"><h3>Proveedor principal</h3></div><div style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;"><div><div style="font-size:14px;font-weight:600;">'+topProv.nombre+'</div><div style="font-size:12px;color:var(--text-muted);margin-top:2px;">'+topProv.entradas+' entradas · '+topProv.insumos.size+' insumos distintos</div></div><div class="stat-value" style="color:var(--accent);font-size:20px;">'+money(topProv.total)+'</div></div></div>':''}

          <div class="panel">
            <div class="panel-header"><h3>Resumen por proveedor · ${nProv}</h3></div>
            <div class="search-box"><input id="comp_buscar" placeholder="Buscar proveedor…"></div>
            <table id="tablaComprasProv">
              <thead><tr>
                <th>Proveedor</th>
                <th class="num">Total comprado</th>
                <th class="num">Entradas</th>
                <th class="num">Insumos</th>
                <th class="num">Promedio</th>
                <th>Última compra</th>
                <th class="actions"></th>
              </tr></thead>
              <tbody>${filas}</tbody>
            </table>
          </div>

          <div id="compDetalle"></div>`;

        document.getElementById('btnCompExport').style.display='inline-block';
        document.getElementById('btnCompPrint').style.display='inline-block';
        document.getElementById('btnCompExport').onclick=function(){
          const headers=['Proveedor','Total comprado','Entradas','Insumos distintos','Promedio por entrada','Última compra'];
          const filasCSV=proveedoresArr.map(function(p){
            return [
              p.nombre,
              fmtCSV(p.total,2),
              p.entradas,
              p.insumos.size,
              fmtCSV(p.total/p.entradas,2),
              p.ultimaFecha?new Date(p.ultimaFecha).toLocaleDateString('es-CO'):''
            ];
          });
          exportarCSV('compras_por_proveedor',headers,filasCSV);
        };

        /* Bind de búsqueda */
        const inpBuscar=document.getElementById('comp_buscar');
        if(inpBuscar){
          inpBuscar.addEventListener('input',debounce(function(){
            const q=inpBuscar.value.toLowerCase();
            document.querySelectorAll('#tablaComprasProv tbody tr').forEach(function(tr){
              tr.style.display=tr.textContent.toLowerCase().includes(q)?'':'none';
            });
          },150));
        }

        /* Bind de drill-down */
        document.querySelectorAll('[data-comp-ver]').forEach(function(btn){
          btn.addEventListener('click',function(){
            const id=btn.dataset.compVer;
            const p=proveedoresArr.find(function(x){return x.id===id;});
            mostrarDetalleProveedor(p);
          });
        });
      }catch(e){
        box.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
      }
    });
  });

  document.getElementById('btnCompPrint').addEventListener('click',function(){window.print();});
}

function mostrarDetalleProveedor(prov){
  if(!prov)return;
  const box=document.getElementById('compDetalle');
  const movs=prov.movs.slice().sort(function(a,b){return new Date(b.fecha)-new Date(a.fecha);});

  const filas=movs.map(function(m){
    const ins=m.insumos||{};
    const unidad=ins.unidad_consumo||ins.unidad_medida||'';
    const cu=Number(m.costo_unitario_momento)||0;
    const cant=Number(m.cantidad)||0;
    const total=cu*cant;
    return '<tr>'
      +'<td class="mono" style="font-size:12px;color:var(--text-secondary);">'+new Date(m.fecha).toLocaleDateString('es-CO')+'</td>'
      +'<td>'+(ins.nombre||'?')+(ins.codigo?' <span class="mono" style="color:var(--text-muted);font-size:11px;">'+ins.codigo+'</span>':'')+'</td>'
      +'<td class="num">'+num(cant,4)+' '+unidad+'</td>'
      +'<td class="num">'+money(cu)+'</td>'
      +'<td class="num"><b>'+money(total)+'</b></td>'
      +'<td style="color:var(--text-secondary);font-size:12px;">'+(m.motivo||'—')+'</td>'
      +'</tr>';
  }).join('');

  const totalProv=movs.reduce(function(acc,m){return acc+(Number(m.costo_unitario_momento)||0)*(Number(m.cantidad)||0);},0);

  box.innerHTML=`
    <div class="panel">
      <div class="panel-header">
        <h3>Detalle · ${prov.nombre}</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="badge info">${movs.length} entradas</span>
          <span class="badge success">${money(totalProv)}</span>
          <button class="ghost small" id="btnCompCerrarDetalle">Cerrar</button>
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Fecha</th>
          <th>Insumo</th>
          <th class="num">Cantidad</th>
          <th class="num">Costo u.</th>
          <th class="num">Total</th>
          <th>Motivo</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;

  document.getElementById('btnCompCerrarDetalle').addEventListener('click',function(){
    box.innerHTML='';
  });
  box.scrollIntoView({behavior:'smooth',block:'start'});
}

/* ============ MERMAS Y AJUSTES ============ */
async function renderMermas(){
  const main=document.getElementById('mainContent');
  const insumos=await api('insumos?select=id,codigo,nombre,unidad_consumo,unidad_medida&order=nombre');

  main.innerHTML=`
    <div class="page-header-flex">
      <div>
        <h2 class="page-title">Mermas y ajustes</h2>
        <p class="page-sub">Pérdidas de inventario: salidas manuales y ajustes por conteo físico, sin incluir devoluciones a proveedor.</p>
      </div>
      ${botonRefreshHTML('mermas')}
    </div>

    <div class="panel force-expanded no-scroll">
      <div class="panel-header"><h3>Filtros</h3></div>
      <div class="form-grid">
        <div><label>Desde</label><input id="mer_desde" type="date"></div>
        <div><label>Hasta</label><input id="mer_hasta" type="date"></div>
        <div><label>Insumo</label>
          <select id="mer_insumo">
            <option value="">— Todos —</option>
            ${insumos.map(function(i){return '<option value="'+i.id+'">'+i.nombre+'</option>';}).join('')}
          </select>
        </div>
      </div>
      <div style="padding:0 18px 12px;display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="ghost small" data-mer-rango="mes">Mes actual</button>
        <button type="button" class="ghost small" data-mer-rango="mes_ant">Mes anterior</button>
        <button type="button" class="ghost small" data-mer-rango="90d">Últimos 90 días</button>
        <button type="button" class="ghost small" data-mer-rango="anio">Año actual</button>
        <button type="button" class="ghost small" data-mer-rango="limpiar">Limpiar</button>
      </div>
      <div class="form-actions">
        <button id="btnMerGenerar">Generar reporte</button>
        <button class="secondary" id="btnMerExport" style="display:none;">${icono('download','sm')} Exportar CSV</button>
        <button class="secondary" id="btnMerPrint" style="display:none;">Imprimir / PDF</button>
      </div>
    </div>

    <div id="merResultado"><div class="empty-state">Elegí un rango y presioná "Generar reporte".</div></div>`;

  /* Rangos rápidos */
  document.querySelectorAll('[data-mer-rango]').forEach(function(b){
    b.addEventListener('click',function(){
      const r=b.dataset.merRango;
      const inpD=document.getElementById('mer_desde');
      const inpH=document.getElementById('mer_hasta');
      const hoy=new Date();
      const iso=function(d){return d.toISOString().slice(0,10);};
      if(r==='limpiar'){inpD.value='';inpH.value='';return;}
      if(r==='mes'){const d=new Date(hoy.getFullYear(),hoy.getMonth(),1);inpD.value=iso(d);inpH.value=iso(hoy);}
      else if(r==='mes_ant'){const ini=new Date(hoy.getFullYear(),hoy.getMonth()-1,1);const fin=new Date(hoy.getFullYear(),hoy.getMonth(),0);inpD.value=iso(ini);inpH.value=iso(fin);}
      else if(r==='90d'){const d=new Date(hoy);d.setDate(d.getDate()-90);inpD.value=iso(d);inpH.value=iso(hoy);}
      else if(r==='anio'){const d=new Date(hoy.getFullYear(),0,1);inpD.value=iso(d);inpH.value=iso(hoy);}
    });
  });

  document.getElementById('btnMerGenerar').addEventListener('click',async function(ev){
    const desde=document.getElementById('mer_desde').value;
    const hasta=document.getElementById('mer_hasta').value;
    const insumoFiltro=document.getElementById('mer_insumo').value;
    const box=document.getElementById('merResultado');
    box.innerHTML='<div class="empty-state">Generando reporte…</div>';

    await withLoading(ev.currentTarget,async function(){
      try{
        /* Salidas manuales y ajustes, sin proveedor (excluye devoluciones), sin OP (excluye consumos) */
        let q='movimientos_inventario?select=id,fecha,cantidad,costo_unitario_momento,motivo,insumo_id,insumos(id,codigo,nombre,unidad_consumo,unidad_medida,conversiones)&tipo=eq.Salida&proveedor_id=is.null&order=fecha.desc&limit=10000';
        if(desde) q+='&fecha=gte.'+desde+'T00:00:00';
        if(hasta) q+='&fecha=lte.'+hasta+'T23:59:59';
        if(insumoFiltro) q+='&insumo_id=eq.'+insumoFiltro;
        const movs=await api(q);

        if(!movs.length){
          box.innerHTML='<div class="empty-state">No hay mermas ni ajustes para estos filtros.</div>';
          document.getElementById('btnMerExport').style.display='none';
          document.getElementById('btnMerPrint').style.display='none';
          return;
        }

        /* Clasificar motivo */
        function clasificarMotivo(motivo){
          const m=String(motivo||'').toLowerCase();
          if(m.indexOf('ajuste por inventario')>=0) return 'Ajuste por conteo físico';
          if(m.indexOf('merma')>=0) return 'Merma';
          if(m.indexOf('uso interno')>=0) return 'Uso interno';
          if(m.indexOf('vencim')>=0) return 'Vencimiento';
          if(m.indexOf('dañ')>=0 || m.indexOf('deterior')>=0) return 'Daño / deterioro';
          if(m.indexOf('error')>=0 || m.indexOf('digitac')>=0) return 'Error de digitación';
          return motivo?String(motivo):'Sin motivo';
        }

        /* KPIs y agrupaciones */
        let totalValor=0;
        let totalMovimientos=0;
        const porInsumo={};
        const porMotivo={};

        movs.forEach(function(m){
          const ins=m.insumos||{};
          const cant=Number(m.cantidad)||0;
          const cu=Number(m.costo_unitario_momento)||0;
          const valor=cu*cant;
          totalValor+=valor;
          totalMovimientos++;
          const motivoGrupo=clasificarMotivo(m.motivo);

          const keyIns=m.insumo_id;
          if(!porInsumo[keyIns]){
            porInsumo[keyIns]={id:keyIns,nombre:ins.nombre||'?',codigo:ins.codigo||'',unidad:ins.unidad_consumo||ins.unidad_medida||'',cantidad:0,valor:0,movs:[]};
          }
          porInsumo[keyIns].cantidad+=cant;
          porInsumo[keyIns].valor+=valor;
          porInsumo[keyIns].movs.push(m);

          if(!porMotivo[motivoGrupo]) porMotivo[motivoGrupo]={motivo:motivoGrupo,cantidad:0,valor:0,movs:0};
          porMotivo[motivoGrupo].cantidad+=cant;
          porMotivo[motivoGrupo].valor+=valor;
          porMotivo[motivoGrupo].movs++;
        });

        const insumosArr=Object.values(porInsumo).sort(function(a,b){return b.valor-a.valor;});
        const motivosArr=Object.values(porMotivo).sort(function(a,b){return b.valor-a.valor;});
        const topInsumo=insumosArr[0];

        /* Tabla por motivo */
        const filasMotivo=motivosArr.map(function(mt){
          const pct=totalValor>0?(mt.valor/totalValor*100):0;
          return '<tr>'
            +'<td>'+mt.motivo+'</td>'
            +'<td class="num">'+mt.movs+'</td>'
            +'<td class="num">'+money(mt.valor)+'</td>'
            +'<td class="num">'+num(pct,1)+'%</td>'
            +'</tr>';
        }).join('');

        /* Tabla por insumo */
        const filasInsumo=insumosArr.map(function(ins){
          return '<tr>'
            +'<td>'+(ins.nombre||'?')+(ins.codigo?' <span class="mono" style="color:var(--text-muted);font-size:11px;">'+ins.codigo+'</span>':'')+'</td>'
            +'<td class="num">'+num(ins.cantidad,4)+' '+ins.unidad+'</td>'
            +'<td class="num">'+ins.movs.length+'</td>'
            +'<td class="num"><b>'+money(ins.valor)+'</b></td>'
            +'<td class="actions"><button class="ghost small" data-mer-ver="'+ins.id+'">Ver detalle</button></td>'
            +'</tr>';
        }).join('');

        box.innerHTML=`
          <div class="grid-cards">
            <div class="stat-card danger"><p class="stat-label">Pérdida total estimada</p><p class="stat-value" style="font-size:18px;">${money(totalValor)}</p></div>
            <div class="stat-card neutral"><p class="stat-label">Movimientos</p><p class="stat-value">${totalMovimientos}</p></div>
            <div class="stat-card neutral"><p class="stat-label">Insumos afectados</p><p class="stat-value">${insumosArr.length}</p></div>
            <div class="stat-card warning"><p class="stat-label">Motivo principal</p><p class="stat-value" style="font-size:14px;line-height:1.3;padding-top:4px;">${motivosArr[0].motivo}</p></div>
          </div>

          <div class="panel">
            <div class="panel-header"><h3>Pérdidas por motivo · ${motivosArr.length}</h3></div>
            <table id="tablaMerMotivos">
              <thead><tr>
                <th>Motivo</th>
                <th class="num">Movimientos</th>
                <th class="num">Valor</th>
                <th class="num">% del total</th>
              </tr></thead>
              <tbody>${filasMotivo}</tbody>
            </table>
          </div>

          <div class="panel">
            <div class="panel-header"><h3>Pérdidas por insumo · ${insumosArr.length}</h3></div>
            <div class="search-box"><input id="mer_buscar" placeholder="Buscar insumo…"></div>
            <table id="tablaMerInsumos">
              <thead><tr>
                <th>Insumo</th>
                <th class="num">Cantidad total</th>
                <th class="num">Movimientos</th>
                <th class="num">Valor perdido</th>
                <th class="actions"></th>
              </tr></thead>
              <tbody>${filasInsumo}</tbody>
            </table>
          </div>

          <div id="merDetalle"></div>`;

        /* Export CSV */
        document.getElementById('btnMerExport').style.display='inline-block';
        document.getElementById('btnMerPrint').style.display='inline-block';
        document.getElementById('btnMerExport').onclick=function(){
          const headers=['Insumo','Código','Cantidad total','Unidad','Movimientos','Valor perdido'];
          const filasCSV=insumosArr.map(function(ins){
            return [
              ins.nombre,
              ins.codigo,
              fmtCSV(ins.cantidad,4),
              ins.unidad,
              ins.movs.length,
              fmtCSV(ins.valor,2)
            ];
          });
          exportarCSV('mermas_por_insumo',headers,filasCSV);
        };

        /* Búsqueda */
        const inpBuscar=document.getElementById('mer_buscar');
        if(inpBuscar){
          inpBuscar.addEventListener('input',debounce(function(){
            const q=inpBuscar.value.toLowerCase();
            document.querySelectorAll('#tablaMerInsumos tbody tr').forEach(function(tr){
              tr.style.display=tr.textContent.toLowerCase().includes(q)?'':'none';
            });
          },150));
        }

        /* Drill-down */
        document.querySelectorAll('[data-mer-ver]').forEach(function(btn){
          btn.addEventListener('click',function(){
            const id=btn.dataset.merVer;
            const ins=insumosArr.find(function(x){return x.id===id;});
            mostrarDetalleMermas(ins);
          });
        });
      }catch(e){
        box.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
      }
    });
  });

  document.getElementById('btnMerPrint').addEventListener('click',function(){window.print();});
}

function mostrarDetalleMermas(ins){
  if(!ins)return;
  const box=document.getElementById('merDetalle');
  const movs=ins.movs.slice().sort(function(a,b){return new Date(b.fecha)-new Date(a.fecha);});

  const filas=movs.map(function(m){
    const cant=Number(m.cantidad)||0;
    const cu=Number(m.costo_unitario_momento)||0;
    const valor=cu*cant;
    return '<tr>'
      +'<td class="mono" style="font-size:12px;color:var(--text-secondary);">'+new Date(m.fecha).toLocaleDateString('es-CO')+'</td>'
      +'<td class="num">'+num(cant,4)+' '+ins.unidad+'</td>'
      +'<td class="num">'+money(cu)+'</td>'
      +'<td class="num">'+money(valor)+'</td>'
      +'<td style="color:var(--text-secondary);font-size:12.5px;">'+(m.motivo||'—')+'</td>'
      +'</tr>';
  }).join('');

  box.innerHTML=`
    <div class="panel">
      <div class="panel-header">
        <h3>Detalle · ${ins.nombre} ${ins.codigo?'<span class="mono" style="color:var(--text-muted);font-size:11px;">'+ins.codigo+'</span>':''}</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="badge info">${movs.length} movimientos</span>
          <span class="badge danger">${money(ins.valor)}</span>
          <button class="ghost small" id="btnMerCerrarDetalle">Cerrar</button>
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Fecha</th>
          <th class="num">Cantidad</th>
          <th class="num">Costo u.</th>
          <th class="num">Valor perdido</th>
          <th>Motivo</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;

  document.getElementById('btnMerCerrarDetalle').addEventListener('click',function(){
    box.innerHTML='';
  });
  box.scrollIntoView({behavior:'smooth',block:'start'});
}

/* ============ KARDEX ============ */
async function fetchAllMovsInsumo(insumoId){
  const PAGE=1000;
  let all=[];
  let offset=0;
  while(true){
    const chunk=await api('movimientos_inventario?insumo_id=eq.'+insumoId+'&select=*,sys_proveedores(razon_social)&order=fecha.asc&limit='+PAGE+'&offset='+offset);
    all=all.concat(chunk);
    if(chunk.length<PAGE)break;
    offset+=PAGE;
    if(offset>20000)break;
  }
  return all;
}
async function renderKardex(){
  const main=document.getElementById('mainContent');
  const insumos=await api('insumos?select=id,codigo,nombre,unidad_medida,unidad_consumo,conversiones,existencia_actual,costo_unitario&order=nombre');
  main.innerHTML=`
    <h2 class="page-title">Kardex</h2>
    <p class="page-sub">Historial cronológico de movimientos por insumo, con saldo acumulado.</p>

    <div class="panel no-print">
      <div class="panel-header"><h3>Consultar</h3>${botonRefreshHTML('kardex')}</div>
      <div class="form-grid">
        <div><label>Insumo</label><select id="kar_insumo">
          <option value="">— Selecciona un insumo —</option>
          ${insumos.map(function(i){return '<option value="'+i.id+'">'+i.nombre+' ('+i.codigo+')</option>';}).join('')}
        </select></div>
        <div><label>Desde</label><input id="kar_desde" type="date"></div>
        <div><label>Hasta</label><input id="kar_hasta" type="date"></div>
        <div><label>Tipo</label><select id="kar_tipo">
          <option value="Todos">Todos</option>
          <option value="Entrada">Entradas</option>
          <option value="Salida">Salidas</option>
          <option value="Consumo">Consumos</option>
        </select></div>
      </div>
      <div style="padding:0 18px 8px;display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="ghost small" data-kar-rango="7d" title="Últimos 7 días">Últimos 7 días</button>
        <button type="button" class="ghost small" data-kar-rango="30d" title="Últimos 30 días">Últimos 30 días</button>
        <button type="button" class="ghost small" data-kar-rango="mes" title="Mes actual">Mes actual</button>
        <button type="button" class="ghost small" data-kar-rango="limpiar" title="Borrar fechas">Limpiar</button>
      </div>
      <div class="form-actions">
        <button id="btnKarConsultar" title="Cargar kardex del insumo">Consultar kardex</button>
        <button class="secondary" id="btnKarExport" title="Descargar CSV" style="display:none;">${icono('download','sm')} Exportar CSV</button>
        <button class="secondary" id="btnKarPrint" title="Imprimir / PDF" style="display:none;">Imprimir / PDF</button>
      </div>
    </div>

    <div id="karResultado"><div class="empty-state">Selecciona un insumo y presiona "Consultar kardex".</div></div>`;

  document.querySelectorAll('[data-kar-rango]').forEach(function(b){
    b.addEventListener('click',function(){
      const r=b.dataset.karRango;
      const inpD=document.getElementById('kar_desde');
      const inpH=document.getElementById('kar_hasta');
      const hoy=new Date();
      const iso=function(d){return d.toISOString().slice(0,10);};
      if(r==='limpiar'){inpD.value='';inpH.value='';}
      else if(r==='7d'){const d=new Date(hoy);d.setDate(d.getDate()-7);inpD.value=iso(d);inpH.value=iso(hoy);}
      else if(r==='30d'){const d=new Date(hoy);d.setDate(d.getDate()-30);inpD.value=iso(d);inpH.value=iso(hoy);}
      else if(r==='mes'){const d=new Date(hoy.getFullYear(),hoy.getMonth(),1);inpD.value=iso(d);inpH.value=iso(hoy);}
    });
  });
  document.getElementById('btnKarConsultar').addEventListener('click',function(){generarKardex(insumos);});
  document.getElementById('btnKarPrint').addEventListener('click',function(){imprimirKardex();});
}
let _kardexData=null;

async function generarKardex(insumos){
  const box=document.getElementById('karResultado');
  const insumoId=document.getElementById('kar_insumo').value;
  if(!insumoId){toast('Selecciona un insumo primero.','error');return;}
  const desde=document.getElementById('kar_desde').value;
  const hasta=document.getElementById('kar_hasta').value;
  const tipo=document.getElementById('kar_tipo').value;

  const ins=insumos.find(function(i){return i.id===insumoId;});
  if(!ins){toast('Insumo no encontrado.','error');return;}

  box.innerHTML='<div class="empty-state">Consultando movimientos…</div>';
  try{
    const movs=await fetchAllMovsInsumo(insumoId);

    /* 1. Reconstruir el saldo inicial: existencia actual - Σ movimientos */
    let totalMoves=0;
    movs.forEach(function(m){
      const c=Number(m.cantidad)||0;
      if(m.tipo==='Entrada') totalMoves+=c;
      else if(m.tipo==='Salida'||m.tipo==='Consumo') totalMoves-=c;
    });
    const saldoInicial=Number(ins.existencia_actual)-totalMoves;

    /* 2. Recorrer en orden, calculando saldo corrido */
    const todos=[];
    let saldo=saldoInicial;
    movs.forEach(function(m){
      const c=Number(m.cantidad)||0;
      const t=m.tipo;
      let entrada=0,salida=0;
      if(t==='Entrada'){entrada=c;saldo+=c;}
      else if(t==='Salida'||t==='Consumo'){salida=c;saldo-=c;}
      let ref='—';
      if(t==='Entrada') ref=m.sys_proveedores?m.sys_proveedores.razon_social:(m.motivo||'—');
      else ref=m.motivo||'—';
      todos.push({fecha:m.fecha,tipo:t,referencia:ref,entrada:entrada,salida:salida,saldo:saldo});
    });

    /* 3. Filtrar para mostrar, conservando el saldo corrido real */
    const filas=[];
    let saldoAntesDelRango=saldoInicial;
    let saldoPrevio=saldoInicial;
    todos.forEach(function(f){
      const fechaStr=new Date(f.fecha).toISOString().slice(0,10);
      const enRango=(!desde||fechaStr>=desde)&&(!hasta||fechaStr<=hasta)&&(tipo==='Todos'||tipo===f.tipo);
      if(enRango){
        filas.push(f);
        if(filas.length===1) saldoAntesDelRango=saldoPrevio;
      }
      saldoPrevio=f.saldo;
    });

    let totEnt=0,totSal=0;
    filas.forEach(function(f){totEnt+=f.entrada;totSal+=f.salida;});

    const uCons=unidadConsumo(ins);
    if(filas.length===0){
      box.innerHTML='<div class="panel"><div class="panel-header"><h3>Kardex · '+ins.nombre+'</h3></div><div class="empty-state">No hay movimientos para estos filtros.</div></div>';
      document.getElementById('btnKarExport').style.display='none';
      document.getElementById('btnKarPrint').style.display='none';
      return;
    }

    const tableRows=filas.map(function(f){
      const entTxt=f.entrada>0?'+'+num(f.entrada,4):'';
      const salTxt=f.salida>0?'-'+num(f.salida,4):'';
      return '<tr>'
        +'<td class="mono" style="font-size:12px;">'+new Date(f.fecha).toLocaleDateString('es-CO')+'</td>'
        +'<td>'+badgeTipo(f.tipo)+'</td>'
        +'<td style="color:var(--text-secondary);font-size:12.5px;">'+f.referencia+'</td>'
        +'<td class="num" style="color:var(--success);">'+entTxt+'</td>'
        +'<td class="num" style="color:var(--danger);">'+salTxt+'</td>'
        +'<td class="num"><b>'+num(f.saldo,4)+' '+uCons+'</b></td>'
        +'</tr>';
    }).join('');

    box.innerHTML=`
      <div class="panel">
        <div class="panel-header">
          <h3>Kardex · ${ins.nombre} <span class="mono" style="color:var(--text-muted);font-size:12px;">${ins.codigo}</span></h3>
        </div>
        <div class="grid-cards" style="margin:0;padding:16px 18px 0;grid-template-columns:repeat(4,minmax(0,1fr));">
          <div class="stat-card neutral"><p class="stat-label">Saldo antes del rango</p><p class="stat-value" style="font-size:18px;">${num(saldoAntesDelRango,4)} ${uCons}</p></div>
          <div class="stat-card success"><p class="stat-label">Entradas en rango</p><p class="stat-value" style="font-size:18px;">+${num(totEnt,4)}</p></div>
          <div class="stat-card danger"><p class="stat-label">Salidas en rango</p><p class="stat-value" style="font-size:18px;">-${num(totSal,4)}</p></div>
          <div class="stat-card info"><p class="stat-label">Saldo actual</p><p class="stat-value" style="font-size:18px;">${num(ins.existencia_actual,4)} ${uCons}</p></div>
        </div>
        <table id="tablaKardex">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Referencia</th><th class="num">Entrada</th><th class="num">Salida</th><th class="num">Saldo</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`;

    document.getElementById('btnKarExport').style.display='inline-block';
    document.getElementById('btnKarPrint').style.display='inline-block';
    document.getElementById('btnKarExport').onclick=function(){
      const headers=['Fecha','Tipo','Referencia','Entrada','Salida','Saldo','Unidad'];
      const rows=filas.map(function(f){
        return [
          new Date(f.fecha).toLocaleDateString('es-CO'),
          f.tipo,
          f.referencia,
          f.entrada>0?fmtCSV(f.entrada,4):'',
          f.salida>0?fmtCSV(f.salida,4):'',
          fmtCSV(f.saldo,4),
          uCons
        ];
      });
      exportarCSV('kardex_'+ins.codigo,headers,rows);
    };
    paginarTabla('tablaKardex',50);

    /* Guardar datos para imprimir */
    _kardexData = {
      insumo: ins,
      filas: filas,
      saldoAntesDelRango: saldoAntesDelRango,
      totEnt: totEnt,
      totSal: totSal,
      desde: desde,
      hasta: hasta,
      tipo: tipo
    };
  }catch(e){
    box.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
  }
}

function imprimirKardex(){
  if(!_kardexData){ toast('Primero generá el kardex antes de imprimir.','error'); return; }
  const d = _kardexData;
  const ins = d.insumo;
  const uCons = unidadConsumo(ins);

  const infoGrid = '<div class="print-info-grid">'
    +'<div><div class="lbl">Insumo</div><div class="val">'+ins.nombre+'</div></div>'
    +'<div><div class="lbl">Código</div><div class="val">'+ins.codigo+'</div></div>'
    +'<div><div class="lbl">Unidad de consumo</div><div class="val">'+uCons+'</div></div>'
    +'<div><div class="lbl">Desde</div><div class="val">'+(d.desde||'—')+'</div></div>'
    +'<div><div class="lbl">Hasta</div><div class="val">'+(d.hasta||'—')+'</div></div>'
    +'<div><div class="lbl">Tipo de movimiento</div><div class="val">'+(d.tipo||'Todos')+'</div></div>'
    +'</div>';

  const kpiRow = '<table class="print-table"><thead><tr>'
    +'<th class="num">Saldo antes del rango</th>'
    +'<th class="num">Entradas en rango</th>'
    +'<th class="num">Salidas en rango</th>'
    +'<th class="num">Saldo actual</th>'
    +'</tr></thead><tbody><tr>'
    +'<td class="num">'+num(d.saldoAntesDelRango,4)+' '+uCons+'</td>'
    +'<td class="num">+'+num(d.totEnt,4)+'</td>'
    +'<td class="num">−'+num(d.totSal,4)+'</td>'
    +'<td class="num"><b>'+num(ins.existencia_actual,4)+' '+uCons+'</b></td>'
    +'</tr></tbody></table>';

  const tabla = '<div class="print-section-title">Movimientos</div>'
    +'<table class="print-table"><thead><tr>'
    +'<th style="width:80px;">Fecha</th>'
    +'<th style="width:70px;">Tipo</th>'
    +'<th>Referencia</th>'
    +'<th class="num" style="width:90px;">Entrada</th>'
    +'<th class="num" style="width:90px;">Salida</th>'
    +'<th class="num" style="width:110px;">Saldo</th>'
    +'</tr></thead><tbody>'
    +d.filas.map(function(f){
      return '<tr>'
        +'<td>'+new Date(f.fecha).toLocaleDateString('es-CO')+'</td>'
        +'<td>'+f.tipo+'</td>'
        +'<td>'+f.referencia+'</td>'
        +'<td class="num">'+(f.entrada>0?'+'+num(f.entrada,4):'')+'</td>'
        +'<td class="num">'+(f.salida>0?'−'+num(f.salida,4):'')+'</td>'
        +'<td class="num"><b>'+num(f.saldo,4)+' '+uCons+'</b></td>'
        +'</tr>';
    }).join('')
    +'</tbody></table>';

  const html = printHeaderHTML('Kardex de Insumo', ins.codigo+' · '+ins.nombre)
    + infoGrid
    + kpiRow
    + tabla
    + printFooterHTML();

  imprimirHTML(html, 'Kardex '+ins.codigo);
}

/* ============ BACKUP ============ */
async function renderBackup(){
  const main=document.getElementById('mainContent');
  if(SUPA_ROLE!=='admin'){
    main.innerHTML='<div class="empty-state">Solo el administrador puede acceder a esta sección.</div>';
    return;
  }

  /* Historial de backups */
  let historial=[];
  try{
    historial=await api('backup_log?select=*&order=fecha.desc&limit=10');
  }catch(e){/* tabla puede no existir si no se corrió la migración */}

  main.innerHTML=`
    <div class="page-header-flex">
      <div>
        <h2 class="page-title">Backup y exportación</h2>
        <p class="page-sub">Descarga todos los datos maestros en un ZIP con archivos CSV listos para Excel, Google Sheets o Power BI.</p>
      </div>
      ${botonRefreshHTML('backup')}
    </div>

    <div class="panel force-expanded no-scroll">
      <div class="panel-header"><h3>Generar backup</h3></div>
      <div class="form-grid">
        <div>
          <label>Rango de movimientos</label>
          <select id="bk_rango">
            <option value="30d">Últimos 30 días</option>
            <option value="6m" selected>Últimos 6 meses</option>
            <option value="1a">Último año</option>
            <option value="todo">Todo el histórico</option>
            <option value="0d">Sin movimientos (solo catálogo)</option>
          </select>
        </div>
        <div>
          <label>Opciones</label>
          <label class="check-row" style="margin:8px 0 0;"><input type="checkbox" id="bk_auditoria" checked><span>Incluir movimientos de inventario</span></label>
        </div>
      </div>
      <div class="form-actions">
        <button id="btnGenerarBackup" title="Generar y descargar el ZIP">Generar backup (.zip)</button>
      </div>
      <div class="field-hint" style="padding:0 18px 14px;">
        El backup incluye <b>13 tablas</b> en formato CSV. Un backup completo de 10.000 movimientos pesa aproximadamente 3–5 MB.
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Últimos backups generados</h3></div>
      ${historial.length===0?'<div class="empty-state">Aún no se han generado backups.</div>':`
      <table>
        <thead><tr>
          <th>Fecha</th>
          <th>Usuario</th>
          <th>Rango movimientos</th>
          <th class="num">Registros</th>
          <th class="num">Tamaño</th>
        </tr></thead>
        <tbody>
          ${historial.map(function(h){
            const fecha=new Date(h.fecha).toLocaleString('es-CO');
            const tam=h.tamano_bytes?num(h.tamano_bytes/1024,1)+' KB':'—';
            return '<tr>'
              +'<td class="mono" style="font-size:12px;color:var(--text-secondary);">'+fecha+'</td>'
              +'<td style="font-size:12px;">'+(h.usuario_email||'—')+'</td>'
              +'<td style="font-size:12px;">'+(h.rango_movimientos||'—')+'</td>'
              +'<td class="num">'+num(h.total_registros)+'</td>'
              +'<td class="num">'+tam+'</td>'
              +'</tr>';
          }).join('')}
        </tbody>
      </table>`}
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Contenido del backup</h3></div>
      <table>
        <thead><tr><th>Archivo</th><th>Contenido</th></tr></thead>
        <tbody>
          <tr><td class="mono">insumos.csv</td><td>Insumos con cadena de conversión, stock y costo</td></tr>
          <tr><td class="mono">subproductos.csv</td><td>Subproductos con tipo, stock y punto de reorden</td></tr>
          <tr><td class="mono">subproducto_recetas.csv</td><td>Recetas de cada subproducto</td></tr>
          <tr><td class="mono">subproducto_subproductos.csv</td><td>Jerarquía entre subproductos</td></tr>
          <tr><td class="mono">productos_terminados.csv</td><td>PT con precio, unidades por caja y stock</td></tr>
          <tr><td class="mono">bom_recetas.csv</td><td>Recetas directas de cada PT</td></tr>
          <tr><td class="mono">paquete_subproductos.csv</td><td>Composición de PT por subproductos</td></tr>
          <tr><td class="mono">ordenes_semanales.csv</td><td>Todas las OPs con estado y progreso</td></tr>
          <tr><td class="mono">entregas_op.csv</td><td>Historial de entregas parciales</td></tr>
          <tr><td class="mono">movimientos_inventario.csv</td><td>Movimientos dentro del rango seleccionado</td></tr>
          <tr><td class="mono">ajustes_costo_insumo.csv</td><td>Historial de ajustes manuales de costo</td></tr>
          <tr><td class="mono">sys_proveedores.csv</td><td>Maestro de proveedores con contactos</td></tr>
          <tr><td class="mono">profiles.csv</td><td>Usuarios con rol y estado</td></tr>
          <tr><td class="mono">_resumen.txt</td><td>Metadata del backup (fecha, versión, conteos)</td></tr>
        </tbody>
      </table>
    </div>`;

  async function fetchAll(table, select = '*', order = '') {
    let allData = [];
    let from = 0;
    const limit = 1000;
    while (true) {
      const q = `${table}?select=${select}${order ? '&order='+order : ''}&limit=${limit}&offset=${from}`;
      const chunk = await api(q);
      allData = allData.concat(chunk);
      if (chunk.length < limit) break;
      from += limit;
    }
    return allData;
  }

  document.getElementById('btnGenerarBackup').addEventListener('click',async function(ev){
    const rango=document.getElementById('bk_rango').value;
    const incluirMov=document.getElementById('bk_auditoria').checked;
    if(typeof JSZip==='undefined'){
      toast('No se pudo cargar JSZip. Revisá tu conexión a internet.','error');
      return;
    }

    await withLoading(ev.currentTarget,async function(){
      const t0=Date.now();
      const zip=new JSZip();
      const tablasIncluidas=[];
      let totalRegistros=0;

      try{
        /* Determinar fecha de corte para movimientos */
        let fechaCorte=null;
        const ahora=new Date();
        if(rango==='30d'){fechaCorte=new Date(ahora);fechaCorte.setDate(fechaCorte.getDate()-30);}
        else if(rango==='6m'){fechaCorte=new Date(ahora);fechaCorte.setMonth(fechaCorte.getMonth()-6);}
        else if(rango==='1a'){fechaCorte=new Date(ahora);fechaCorte.setFullYear(fechaCorte.getFullYear()-1);}
        else if(rango==='0d'){fechaCorte='nunca';}
        const isoCorte=fechaCorte==='nunca'?null:fechaCorte.toISOString();

        /* Definición de tablas a exportar */
        const tareas=[
          {tabla:'insumos',archivo:'insumos.csv',tablaName:'insumos', order:'codigo'},
          {tabla:'subproductos',archivo:'subproductos.csv',tablaName:'subproductos', order:'codigo'},
          {tabla:'subproducto_recetas',archivo:'subproducto_recetas.csv',tablaName:'subproducto_recetas'},
          {tabla:'subproducto_subproductos',archivo:'subproducto_subproductos.csv',tablaName:'subproducto_subproductos'},
          {tabla:'productos_terminados',archivo:'productos_terminados.csv',tablaName:'productos_terminados', order:'codigo_pt'},
          {tabla:'bom_recetas',archivo:'bom_recetas.csv',tablaName:'bom_recetas'},
          {tabla:'paquete_subproductos',archivo:'paquete_subproductos.csv',tablaName:'paquete_subproductos'},
          {tabla:'ordenes_semanales',archivo:'ordenes_semanales.csv',tablaName:'ordenes_semanales', order:'fecha_creacion.desc'},
          {tabla:'entregas_op',archivo:'entregas_op.csv',tablaName:'entregas_op', order:'fecha.desc'},
          {tabla:'ajustes_costo_insumo',archivo:'ajustes_costo_insumo.csv',tablaName:'ajustes_costo_insumo', order:'fecha.desc'},
          {tabla:'sys_proveedores',archivo:'sys_proveedores.csv',tablaName:'sys_proveedores', order:'razon_social'},
          {tabla:'profiles',archivo:'profiles.csv',tablaName:'profiles', select:'user_id,email,nombre,role,activo,creado_en', order:'email'},
          {tabla:'insumo_lotes',archivo:'insumo_lotes.csv',tablaName:'insumo_lotes'},
          {tabla:'despachos',archivo:'despachos.csv',tablaName:'despachos', order:'fecha.desc'},
          {tabla:'devoluciones_pt',archivo:'devoluciones_pt.csv',tablaName:'devoluciones_pt', order:'fecha.desc'},
          {tabla:'evaluaciones_proveedores',archivo:'evaluaciones_proveedores.csv',tablaName:'evaluaciones_proveedores', order:'fecha.desc'},
          {tabla:'cajas_ubicacion',archivo:'cajas_ubicacion.csv',tablaName:'cajas_ubicacion'}
        ];

        if(incluirMov&&isoCorte){
          tareas.push({tabla:'movimientos_inventario',archivo:'movimientos_inventario.csv',tablaName:'movimientos_inventario', select:'*', filter:'&fecha=gte.'+isoCorte, order:'fecha.desc'});
        }

        /* Fetch + CSV (Paginado para superar el límite de 1000) */
        for(const t of tareas){
          let query = t.tablaName + '?select=' + (t.select||'*');
          if(t.order) query += '&order=' + t.order;
          if(t.filter) query += t.filter;
          
          let rows = [];
          let offset = 0;
          const limit = 1000;
          while(true) {
            const chunk = await api(query + '&limit=' + limit + '&offset=' + offset);
            rows = rows.concat(chunk);
            if (chunk.length < limit) break;
            offset += limit;
          }
          totalRegistros+=rows.length;
          tablasIncluidas.push({tabla:t.tabla,registros:rows.length});

          /* Generar CSV */
          if(rows.length===0){
            zip.file(t.archivo,'');
            continue;
          }
          const headers=Object.keys(rows[0]);
          const filas=[headers];
          rows.forEach(function(r){
            filas.push(headers.map(function(h){
              const v=r[h];
              if(v===null||v===undefined)return '';
              if(typeof v==='object')return JSON.stringify(v);
              if(typeof v==='number')return String(v).replace('.',',');
              return String(v);
            }));
          });
          const csv='\uFEFF'+filas.map(function(f){
            return f.map(function(c){
              let s=String(c);
              if(s.indexOf('"')>=0||s.indexOf(';')>=0||s.indexOf('\n')>=0||s.indexOf('\r')>=0){
                s='"'+s.replace(/"/g,'""')+'"';
              }
              return s;
            }).join(';');
          }).join('\r\n');
          zip.file(t.archivo,csv);
        }

        /* Resumen */
        const fecha=new Date().toLocaleString('es-CO');
        const resumen=
          'AseptiQ — Resumen de backup\n'+
          '===============================\n'+
          'Fecha de generación: '+fecha+'\n'+
          'Usuario: '+(SUPA_PROFILE?SUPA_PROFILE.email:'—')+'\n'+
          'Rango de movimientos: '+rango+'\n'+
          'Total de registros: '+totalRegistros+'\n'+
          '\n'+
          'Conteo por tabla:\n'+
          tablasIncluidas.map(function(t){return '  · '+t.tabla+': '+t.registros;}).join('\n')+'\n'+
          '\n'+
          'Los CSV usan ; como separador y BOM UTF-8 para que Excel respete las tildes.\n';
        zip.file('_resumen.txt',resumen);

        /* Generar ZIP */
        const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
        const tamano=blob.size;

        /* Descargar */
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');
        const fechaArchivo=new Date().toISOString().slice(0,10);
        a.href=url;
        a.download='aseptiq_backup_'+fechaArchivo+'.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        /* Registrar en auditoría */
        try{
          await api('backup_log',{
            method:'POST',
            body:JSON.stringify({
              usuario_id:SUPA_SESSION?SUPA_SESSION.user.id:null,
              usuario_email:SUPA_PROFILE?SUPA_PROFILE.email:null,
              tablas_incluidas:tablasIncluidas,
              rango_movimientos:rango,
              total_registros:totalRegistros,
              tamano_bytes:tamano
            })
          });
        }catch(e){/* silencioso si la tabla no existe */}

        const segundos=((Date.now()-t0)/1000).toFixed(1);
        toast('Backup generado · '+num(totalRegistros)+' registros · '+num(tamano/1024,1)+' KB · '+segundos+'s','success');

        /* Refrescar para mostrar en historial */
        setTimeout(function(){renderBackup();},500);
      }catch(e){
        toast('Error generando backup: '+traducirError(e.message),'error');
      }
    });
  });
}

/* ============ USUARIOS ============ */
async function renderUsuarios(){
  const main=document.getElementById('mainContent');
  if(SUPA_ROLE!=='admin'){
    main.innerHTML='<div class="empty-state">Solo el administrador puede acceder a esta sección.</div>';
    return;
  }
  const rows=await api('profiles?select=*&order=email');
  main.innerHTML=`
    <h2 class="page-title">Usuarios</h2>
    <p class="page-sub">Gestiona el rol de acceso. Los usuarios se crean desde el dashboard de Supabase (Authentication → Users → Add user).</p>
    <div class="panel">
      <div class="panel-header"><h3>Usuarios registrados · ${rows.length}</h3></div>
      <table>
        <tr>
          <th>Email</th>
          <th>Nombre</th>
          <th>Rol</th>
          <th>Estado</th>
          <th>Desde</th>
          <th class="actions"></th>
        </tr>
        ${rows.map(function(r){
          const esYo=SUPA_SESSION && SUPA_SESSION.user && r.user_id===SUPA_SESSION.user.id;
          return '<tr>'
            +'<td>'+r.email+(esYo?' <span class="badge info">tú</span>':'')+'</td>'
            +'<td>'+(r.nombre||'—')+'</td>'
            +'<td>'+badgeRol(r.role)+'</td>'
            +'<td>'+(r.activo?'<span class="badge success">Activo</span>':'<span class="badge danger">Inactivo</span>')+'</td>'
            +'<td class="mono" style="font-size:12px;color:var(--text-secondary);">'+new Date(r.creado_en).toLocaleDateString('es-CO')+'</td>'
            +'<td class="actions">'
            +'<button class="ghost small" data-edit-rol="'+r.user_id+'" '+(esYo?'disabled title="No puedes cambiar tu propio rol"':'title="Cambiar rol"')+'>Cambiar rol</button>'
            +'<button class="'+(r.activo?'danger-btn':'success-btn')+' small" data-toggle-activo="'+r.user_id+'" data-activo="'+r.activo+'" '+(esYo?'disabled title="No puedes desactivar tu propia cuenta"':'')+'>'+(r.activo?'Desactivar':'Activar')+'</button>'
            +'</td></tr>';
        }).join('')}
      </table>
    </div>`;

  document.querySelectorAll('[data-edit-rol]').forEach(function(btn){
    btn.addEventListener('click',function(){
      if(btn.disabled)return;
      const userId=btn.dataset.editRol;
      const u=rows.find(function(x){return x.user_id===userId;});
      if(!u) return;
      abrirModalGenerico({
        title:'Cambiar rol',
        subtitle:'Usuario: '+(u.email||u.nombre||'—'),
        icon:'★',
        variant:'info',
        size:'md',
        body:`
          <div class="form-grid" style="padding:0;">
            <div class="full-span">
              <label>Rol</label>
              <select id="usr_rol_select">
                <option value="admin" ${u.role==='admin'?'selected':''}>Admin — acceso total (incluye Usuarios y Backup)</option>
                <option value="operador" ${u.role==='operador'?'selected':''}>Operador — crear y editar, sin Usuarios ni Backup</option>
                <option value="consulta" ${u.role==='consulta'?'selected':''}>Consulta — solo lectura</option>
              </select>
            </div>
          </div>`,
        footer:'<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button class="ghost" id="usr_cancelar">Cancelar</button><button id="usr_guardar">Guardar</button></div>',
        onOpen:function(){
          document.getElementById('usr_cancelar').addEventListener('click',cerrarModalGenerico);
          document.getElementById('usr_guardar').addEventListener('click',async function(ev){
            const nuevo=document.getElementById('usr_rol_select').value;
            if(nuevo===u.role){toast('El rol no cambió.','error');return;}
            try{
              await withLoading(ev.currentTarget,async function(){
                await api('profiles?user_id=eq.'+userId,{method:'PATCH',body:JSON.stringify({role:nuevo})});
              });
              toast('Rol actualizado.','success');
              cerrarModalGenerico();
              renderUsuarios();
            }catch(e){toast(e.message,'error');}
          });
        }
      });
    });
  });

  document.querySelectorAll('[data-toggle-activo]').forEach(function(btn){
    btn.addEventListener('click',async function(){
      if(btn.disabled)return;
      const userId=btn.dataset.toggleActivo;
      const estabaActivo=btn.dataset.activo==='true';
      const accion=estabaActivo?'desactivar':'activar';
      const ok=await confirmar({
        title:(estabaActivo?'Desactivar':'Activar')+' usuario',
        message:estabaActivo?'El usuario no podrá iniciar sesión hasta que lo reactives.':'El usuario podrá volver a iniciar sesión.',
        icon:estabaActivo?'✕':'✓',
        variant:estabaActivo?'warn':'info',
        okText:accion.charAt(0).toUpperCase()+accion.slice(1)
      });
      if(!ok)return;
      try{
        await api('profiles?user_id=eq.'+userId,{method:'PATCH',body:JSON.stringify({activo:!estabaActivo})});
        toast('Usuario '+(estabaActivo?'desactivado':'activado')+'.','success');
        renderUsuarios();
      }catch(e){toast(e.message,'error');}
    });
  });
}

/* ============ AUDITORÍA ============ */
async function renderAuditoria(){
  const main=document.getElementById('mainContent');
  const insumos=await api('insumos?select=id,codigo,nombre,unidad_medida,unidad_consumo,conversiones&order=nombre');
  main.innerHTML=`
    <div class="page-header-flex">
      <div>
        <h2 class="page-title">Auditoría</h2>
        <p class="page-sub">Registro de salidas y generación de informes de movimientos y existencias.</p>
      </div>
      <button id="btnNuevaSalida" class="require-write" title="Registrar salida manual">+ Registrar salida</button>
    </div>
    <div class="panel no-print force-expanded">
      <div class="panel-header"><h3>Informe</h3>${botonRefreshHTML('auditoria')}</div>
      <div class="form-grid">
        <div><label>Tipo de informe</label><select id="rep_tipo2">
          <option value="Movimientos">Movimientos de insumos</option>
          <option value="Subproductos">Movimientos de subproductos</option>
          <option value="AjustesCosto">Ajustes de costo</option>
          <option value="Existencias">Existencias (conteo físico)</option>
        </select></div>
      </div>
      <div id="filtrosMov">
        <div class="divider-label">Filtros del informe</div>
        <div style="padding:0 18px 8px;display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="ghost small" data-rango="7d" title="Últimos 7 días">Últimos 7 días</button>
          <button type="button" class="ghost small" data-rango="30d" title="Últimos 30 días">Últimos 30 días</button>
          <button type="button" class="ghost small" data-rango="mes" title="Mes actual">Mes actual</button>
          <button type="button" class="ghost small" data-rango="mes_ant" title="Mes anterior">Mes anterior</button>
          <button type="button" class="ghost small" data-rango="limpiar" title="Borrar filtros de fecha">Limpiar</button>
        </div>
        <div class="form-grid">
          <div><label>Desde</label><input id="rep_desde" type="date"></div>
          <div><label>Hasta</label><input id="rep_hasta" type="date"></div>
          <div><label>Tipo</label><select id="rep_tipo"><option value="Todos">Todos</option><option value="Entrada">Entradas</option><option value="Salida">Salidas</option><option value="Consumo">Consumos</option></select></div>
          <div id="rep_insumo_wrap"><label>Insumo</label><select id="rep_insumo"><option value="">Todos</option>${insumos.map(function(i){return '<option value="'+i.id+'">'+i.nombre+'</option>';}).join('')}</select></div>
        </div>
      </div>
      <div id="filtrosExistencias" style="display:none;">
        <div class="divider-label">Conteo físico</div>
        <div class="form-grid"><div class="full-span" style="font-size:12.5px;color:var(--text-secondary);line-height:1.5;">
          Presiona <strong>Cargar existencias</strong> para listar insumos y subproductos con su existencia actual.
          Ingresa el conteo real en la columna <strong>Conteo físico</strong>; la diferencia se calcula en vivo.
        </div></div>
      </div>
      <div class="form-actions">
        <button id="btnGenerarInforme" title="Generar informe">Generar informe</button>
        <button class="secondary" id="btnCargarConteo" style="display:none;" title="Cargar existencias">Cargar existencias</button>
        <button class="secondary" id="btnImprimirInforme" title="Imprimir el informe generado">${icono('printer','sm')} Imprimir informe</button>
      </div>
    </div>
    <div id="informeResultado"></div>`;
  document.getElementById('btnNuevaSalida').addEventListener('click',function(){
    abrirModalSalidaManual(insumos);
  });
  document.getElementById('rep_tipo2').addEventListener('change',function(e){
    const v=e.target.value;
    const esExistencias = v==='Existencias';
    const esSubproductos = v==='Subproductos';
    const esAjustesCosto = v==='AjustesCosto';
    document.getElementById('filtrosMov').style.display = esExistencias?'none':'block';
    document.getElementById('filtrosExistencias').style.display = esExistencias?'block':'none';
    document.getElementById('btnGenerarInforme').style.display = esExistencias?'none':'inline-block';
    document.getElementById('btnCargarConteo').style.display = esExistencias?'inline-block':'none';
    const wrapIns = document.getElementById('rep_insumo_wrap');
    if(wrapIns) wrapIns.style.display = (esSubproductos||esAjustesCosto)?'none':'';
    /* El filtro de tipo (Entrada/Salida/Consumo) no aplica a ajustes de costo */
    const filtroTipo = document.querySelector('#filtrosMov select#rep_tipo');
    if(filtroTipo && filtroTipo.parentNode) filtroTipo.parentNode.style.display = esAjustesCosto?'none':'';
    document.getElementById('informeResultado').innerHTML='';
    _informeImpresion=null;
  });
    document.querySelectorAll('[data-rango]').forEach(function(b){
    b.addEventListener('click',function(){
      const r=b.dataset.rango;
      const inpD=document.getElementById('rep_desde');
      const inpH=document.getElementById('rep_hasta');
      const hoy=new Date();
      const iso=function(d){return d.toISOString().slice(0,10);};
      if(r==='limpiar'){
        inpD.value='';
        inpH.value='';
      } else if(r==='7d'){
        const d=new Date(hoy);d.setDate(d.getDate()-7);
        inpD.value=iso(d);inpH.value=iso(hoy);
      } else if(r==='30d'){
        const d=new Date(hoy);d.setDate(d.getDate()-30);
        inpD.value=iso(d);inpH.value=iso(hoy);
      } else if(r==='mes'){
        const d=new Date(hoy.getFullYear(),hoy.getMonth(),1);
        inpD.value=iso(d);inpH.value=iso(hoy);
      } else if(r==='mes_ant'){
        const ini=new Date(hoy.getFullYear(),hoy.getMonth()-1,1);
        const fin=new Date(hoy.getFullYear(),hoy.getMonth(),0);
        inpD.value=iso(ini);inpH.value=iso(fin);
      }
    });
  });
  document.getElementById('btnGenerarInforme').addEventListener('click',generarInforme);
  /* Estado inicial coherente */
  document.getElementById('rep_tipo2').dispatchEvent(new Event('change'));
  document.getElementById('btnImprimirInforme').addEventListener('click',imprimirInformeActual);
  document.getElementById('btnCargarConteo').addEventListener('click',generarConteoFisico);
}

function abrirModalSalidaManual(insumos){
  abrirModalGenerico({
    title:'Registrar salida manual',
    subtitle:'Registra una salida de inventario por merma, ajuste o uso interno.',
    icon:icono('undo','lg'),
    variant:'warn',
    size:'md',
    body:
      '<div class="form-grid" style="padding:0;">'+
        '<div><label>Insumo</label><select id="sal_insumo">'+(insumos.length?insumos.map(function(i){return '<option value="'+i.id+'">'+i.nombre+' ('+unidadConsumo(i)+')</option>';}).join(''):'<option value="">No hay insumos</option>')+'</select></div>'+
        '<div><label>Cantidad (unidad de consumo)</label><input id="sal_cantidad" type="number" step="0.0001" placeholder="10"></div>'+
        '<div class="full-span"><label>Motivo</label><input id="sal_motivo" placeholder="Merma, ajuste, uso interno…"></div>'+
      '</div>',
    footer:'<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;"><button class="ghost" id="sal_cancelar">Cancelar</button><button id="sal_guardar">Registrar salida</button></div>',
    onOpen:function(){
      document.getElementById('sal_cancelar').addEventListener('click',cerrarModalGenerico);
      document.getElementById('sal_guardar').addEventListener('click',async function(ev){
        const insumo_id=document.getElementById('sal_insumo').value;
        const cantidad=parseFloat(document.getElementById('sal_cantidad').value);
        const motivo=document.getElementById('sal_motivo').value.trim();
        if(!insumo_id||!cantidad||cantidad<=0){toast('Selecciona insumo y cantidad válida.','error');return;}
        try{
          const r=await withLoading(ev.currentTarget,async function(){return await rpc('registrar_salida',{p_insumo_id:insumo_id,p_cantidad:cantidad,p_motivo:motivo||null});});
          toast('Salida registrada. Existencia: '+num(r.existencia_nueva),'success');
          cerrarModalGenerico();
        }catch(e){toast(e.message,'error');}
      });
    }
  });
}

/* Guarda el último informe generado para imprimirlo después */
let _informeImpresion=null;

function imprimirInformeActual(){
  if(!_informeImpresion){
    toast('Primero generá el informe con el botón "Generar informe".','error');
    return;
  }
  const inf = _informeImpresion;

  /* Info general (rango de fechas, tipo) */
  let infoGrid = '<div class="print-info-grid">';
  infoGrid += '<div><div class="lbl">Tipo de informe</div><div class="val">'+inf.tipoLabel+'</div></div>';
  infoGrid += '<div><div class="lbl">Desde</div><div class="val">'+(inf.desde||'Sin filtro')+'</div></div>';
  infoGrid += '<div><div class="lbl">Hasta</div><div class="val">'+(inf.hasta||'Sin filtro')+'</div></div>';
  if(inf.filtroExtra){
    infoGrid += '<div><div class="lbl">Filtro adicional</div><div class="val">'+inf.filtroExtra+'</div></div>';
  }
  infoGrid += '<div><div class="lbl">Registros</div><div class="val">'+inf.filas.length+'</div></div>';
  infoGrid += '<div><div class="lbl">Generado</div><div class="val">'+new Date().toLocaleString('es-CO')+'</div></div>';
  infoGrid += '</div>';

  /* Tabla */
  const tableHTML = '<table class="print-table"><thead><tr>'
    + inf.headers.map(function(h){
        return '<th'+(h.num?' class="num"':'')+'>'+h.label+'</th>';
      }).join('')
    + '</tr></thead><tbody>'
    + inf.filas.map(function(fila){
        return '<tr>'
          + fila.map(function(celda,i){
              const esNum = inf.headers[i] && inf.headers[i].num;
              return '<td'+(esNum?' class="num"':'')+'>'+(celda==null?'—':String(celda))+'</td>';
            }).join('')
          + '</tr>';
      }).join('')
    + '</tbody></table>';

  const html = printHeaderHTML(inf.tipoLabel, inf.subtitulo || '')
    + infoGrid
    + tableHTML
    + printFooterHTML();

  imprimirHTML(html, inf.tipoLabel);
}

async function generarInforme(){
  const modo=document.getElementById('rep_tipo2').value;

  /* --- Modo: Ajustes de costo --- */
  if(modo==='AjustesCosto'){
    const box=document.getElementById('informeResultado');
    box.innerHTML='<div class="empty-state">Generando informe…</div>';
    try{
      let q='ajustes_costo_insumo?select=*,insumos(codigo,nombre,unidad_consumo,unidad_medida)&order=fecha.desc';
      const desde=document.getElementById('rep_desde').value;
      const hasta=document.getElementById('rep_hasta').value;
      if(desde) q+='&fecha=gte.'+desde+'T00:00:00';
      if(hasta) q+='&fecha=lte.'+hasta+'T23:59:59';
      const rows=await api(q);
      /* Preparar datos para impresión */
      _informeImpresion = rows.length ? {
        tipoLabel: 'Ajustes de costo',
        subtitulo: 'Auditoría · Historial de cambios manuales de costo',
        desde: desde, hasta: hasta,
        filtroExtra: null,
        headers: [
          {label:'Fecha'}, {label:'Insumo'}, {label:'Código'},
          {label:'Costo anterior',num:true}, {label:'Costo nuevo',num:true},
          {label:'Diferencia',num:true}, {label:'Motivo'}, {label:'Usuario'}
        ],
        filas: rows.map(function(r){
          const ins=r.insumos||{};
          const dif=Number(r.costo_nuevo)-Number(r.costo_anterior);
          return [
            new Date(r.fecha).toLocaleString('es-CO'),
            ins.nombre||'',
            ins.codigo||'',
            money(r.costo_anterior),
            money(r.costo_nuevo),
            (dif>=0?'+':'')+money(dif),
            r.motivo||'',
            r.usuario_email||''
          ];
        })
      } : null;
      box.innerHTML='<div class="panel"><div class="panel-header"><h3>Ajustes de costo ('+rows.length+')</h3>'+(rows.length?'<button class="secondary small" id="btnExportAjustesCosto" title="Descargar CSV">'+icono('download','sm')+' Exportar CSV</button>':'')+'</div>'+(rows.length===0?'<div class="empty-state">No hay ajustes en este rango.</div>':'<table id="tablaAjustesCosto"><tr><th>Fecha</th><th>Insumo</th><th class="num">Costo anterior</th><th class="num">Costo nuevo</th><th class="num">Δ</th><th>Motivo</th><th>Usuario</th></tr>'+rows.map(function(r){
        const ins=r.insumos||{};
        const dif=Number(r.costo_nuevo)-Number(r.costo_anterior);
        const color=dif>0?'var(--danger)':(dif<0?'var(--success)':'var(--text-muted)');
        return '<tr>'
          +'<td class="mono" style="font-size:12px;">'+new Date(r.fecha).toLocaleDateString('es-CO')+'</td>'
          +'<td>'+(ins.nombre||'?')+(ins.codigo?' <span class="mono" style="color:var(--text-muted);font-size:11px;">'+ins.codigo+'</span>':'')+'</td>'
          +'<td class="num">'+money(r.costo_anterior)+'</td>'
          +'<td class="num">'+money(r.costo_nuevo)+'</td>'
          +'<td class="num" style="color:'+color+';">'+(dif>=0?'+':'')+money(dif)+'</td>'
          +'<td style="color:var(--text-secondary);font-size:12.5px;">'+(r.motivo||'—')+'</td>'
          +'<td style="color:var(--text-secondary);font-size:12px;">'+(r.usuario_email||'—')+'</td>'
          +'</tr>';
      }).join('')+'</table>')+'</div>';
      paginarTabla('tablaAjustesCosto');
      if(rows.length){
        document.getElementById('btnExportAjustesCosto').addEventListener('click',function(){
          const headers=['Fecha','Insumo','Código','Costo anterior','Costo nuevo','Diferencia','Motivo','Usuario'];
          const filasCSV=rows.map(function(r){
            const ins=r.insumos||{};
            const dif=Number(r.costo_nuevo)-Number(r.costo_anterior);
            return [
              new Date(r.fecha).toLocaleString('es-CO'),
              ins.nombre||'',
              ins.codigo||'',
              fmtCSV(r.costo_anterior,2),
              fmtCSV(r.costo_nuevo,2),
              fmtCSV(dif,2),
              r.motivo||'',
              r.usuario_email||''
            ];
          });
          exportarCSV('ajustes_costo',headers,filasCSV);
        });
      }
    }catch(e){
      box.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
    }
    return;
  }

  /* --- Modo: Movimientos de subproductos --- */
  if(modo==='Subproductos'){
    const desde=document.getElementById('rep_desde').value;
    const hasta=document.getElementById('rep_hasta').value;
    const tipo=document.getElementById('rep_tipo').value;
    const box=document.getElementById('informeResultado');
    box.innerHTML='<div class="empty-state">Generando informe…</div>';
    try{
      let q='movimientos_inventario?select=*,subproductos(nombre,codigo)&subproducto_id=not.is.null&order=fecha.desc';
      if(tipo==='Entrada'||tipo==='Salida'||tipo==='Consumo') q+='&tipo=eq.'+tipo;
      if(desde) q+='&fecha=gte.'+desde+'T00:00:00';
      if(hasta) q+='&fecha=lte.'+hasta+'T23:59:59';
      const movs=await api(q);
      const filas=movs.map(function(m){
        return {
          fecha: m.fecha,
          tipo: m.tipo,
          item: m.subproductos ? m.subproductos.nombre+(m.subproductos.codigo?' ('+m.subproductos.codigo+')':'') : '(subproducto)',
          unidad: 'u',
          cantidad: m.cantidad,
          referencia: m.motivo||'—'
        };
      });
      /* Preparar datos para impresión */
      _informeImpresion = filas.length ? {
        tipoLabel: 'Movimientos de subproductos',
        subtitulo: 'Auditoría · Historial de movimientos de subproductos',
        desde: desde, hasta: hasta,
        filtroExtra: tipo!=='Todos' ? ('Tipo: '+tipo) : null,
        headers: [
          {label:'Fecha'}, {label:'Tipo'}, {label:'Subproducto'},
          {label:'Cantidad',num:true}, {label:'Referencia'}
        ],
        filas: filas.map(function(f){
          return [
            new Date(f.fecha).toLocaleDateString('es-CO'),
            f.tipo,
            f.item,
            num(f.cantidad)+' '+(f.unidad||''),
            f.referencia
          ];
        })
      } : null;
      box.innerHTML='<div class="panel"><div class="panel-header"><h3>Informe ('+filas.length+' movimientos)</h3>'+(filas.length?'<button class="secondary small" id="btnExportInforme" title="Descargar CSV">'+icono('download','sm')+' Exportar CSV</button>':'')+'</div>'+(filas.length===0?'<div class="empty-state">No hay movimientos para estos filtros.</div>':'<table id="tablaInforme"><tr><th>Fecha</th><th>Tipo</th><th>Subproducto</th><th class="num">Cantidad</th><th>Referencia</th></tr>'+filas.map(function(f){return '<tr><td class="mono" style="font-size:12px;">'+new Date(f.fecha).toLocaleDateString('es-CO')+'</td><td>'+badgeTipo(f.tipo)+'</td><td>'+f.item+'</td><td class="num">'+num(f.cantidad)+' '+(f.unidad||'')+'</td><td style="color:var(--text-secondary);">'+f.referencia+'</td></tr>';}).join('')+'</table>')+'</div>';
      paginarTabla('tablaInforme');
      if(filas.length){
        document.getElementById('btnExportInforme').addEventListener('click',function(){
          const headers=['Fecha','Tipo','Subproducto','Cantidad','Unidad','Referencia'];
          const filasCSV=filas.map(function(f){
            return [new Date(f.fecha).toLocaleDateString('es-CO'), f.tipo, f.item, fmtCSV(f.cantidad,4), f.unidad||'', f.referencia||''];
          });
          exportarCSV('movimientos_subproductos',headers,filasCSV);
        });
      }
    }catch(e){
      box.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
    }
    return;
  }

  /* --- Modo: Movimientos de insumos --- */
  const desde=document.getElementById('rep_desde').value;
  const hasta=document.getElementById('rep_hasta').value;
  const tipo=document.getElementById('rep_tipo').value;
  const insumoFiltro=document.getElementById('rep_insumo').value;
  const box=document.getElementById('informeResultado');
  box.innerHTML='<div class="empty-state">Generando informe…</div>';
  let filas=[];

  if(tipo==='Todos'||tipo==='Entrada'||tipo==='Salida'){
    let q='movimientos_inventario?select=*,insumos(nombre,unidad_medida,unidad_consumo),sys_proveedores(razon_social)&order=fecha.desc';
    if(tipo==='Entrada'||tipo==='Salida')q+='&tipo=eq.'+tipo;
    if(desde)q+='&fecha=gte.'+desde+'T00:00:00';
    if(hasta)q+='&fecha=lte.'+hasta+'T23:59:59';
    if(insumoFiltro)q+='&insumo_id=eq.'+insumoFiltro;
    const movs=await api(q);
    movs.forEach(function(m){
      filas.push({
        fecha:m.fecha,
        tipo:m.tipo,
        item:m.insumos?m.insumos.nombre:'',
        unidad:m.insumos?(m.insumos.unidad_consumo||m.insumos.unidad_medida):'',
        cantidad:m.cantidad,
        referencia:m.tipo==='Entrada'?(m.sys_proveedores?m.sys_proveedores.razon_social:'—'):(m.motivo||'—')
      });
    });
  }
  if(tipo==='Todos'||tipo==='Consumo'){
    let q='ordenes_semanales?select=*,productos_terminados(nombre)&order=fecha_creacion.desc';
    if(desde)q+='&fecha_creacion=gte.'+desde+'T00:00:00';
    if(hasta)q+='&fecha_creacion=lte.'+hasta+'T23:59:59';
    const ords=await api(q);
    ords.forEach(function(o){
      const d=o.detalle_faltantes||{};
      const insumosDet=Array.isArray(d)?d:(d.insumos||[]);
      const subsDet=Array.isArray(d)?[]:(d.subproductos||[]);
      const ref=o.numero_op||(o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt);
      insumosDet.forEach(function(x){
        if(insumoFiltro&&x.insumo_id!==insumoFiltro)return;
        filas.push({fecha:o.fecha_creacion,tipo:'Consumo',item:x.nombre,unidad:x.unidad,cantidad:x.consumo_total,referencia:ref});
      });
      subsDet.forEach(function(x){
        if(insumoFiltro)return;
        filas.push({fecha:o.fecha_creacion,tipo:'Consumo',item:'[Subproducto] '+x.nombre,unidad:'u',cantidad:x.requerido,referencia:ref});
      });
    });
  }
  filas.sort(function(a,b){return new Date(b.fecha)-new Date(a.fecha);});
  /* Preparar datos para impresión */
  const insumoNombre = insumoFiltro ? (insumos.find(function(x){return x.id===insumoFiltro;})||{}).nombre : null;
  _informeImpresion = filas.length ? {
    tipoLabel: 'Movimientos de insumos',
    subtitulo: 'Auditoría · Historial de movimientos de insumos',
    desde: desde, hasta: hasta,
    filtroExtra: [
      tipo!=='Todos' ? ('Tipo: '+tipo) : null,
      insumoNombre ? ('Insumo: '+insumoNombre) : null
    ].filter(Boolean).join(' · ') || null,
    headers: [
      {label:'Fecha'}, {label:'Tipo'}, {label:'Insumo'},
      {label:'Cantidad',num:true}, {label:'Referencia'}
    ],
    filas: filas.map(function(f){
      return [
        new Date(f.fecha).toLocaleDateString('es-CO'),
        f.tipo,
        f.item,
        num(f.cantidad)+' '+(f.unidad||''),
        f.referencia
      ];
    })
  } : null;
  box.innerHTML='<div class="panel"><div class="panel-header"><h3>Informe ('+filas.length+' movimientos)</h3>'+(filas.length?'<button class="secondary small" id="btnExportInforme" title="Descargar CSV">Exportar CSV</button>':'')+'</div>'+(filas.length===0?'<div class="empty-state">No hay movimientos para estos filtros.</div>':'<table id="tablaInforme"><tr><th>Fecha</th><th>Tipo</th><th>Insumo</th><th class="num">Cantidad</th><th>Referencia</th></tr>'+filas.map(function(f){return '<tr><td class="mono" style="font-size:12px;">'+new Date(f.fecha).toLocaleDateString('es-CO')+'</td><td>'+badgeTipo(f.tipo)+'</td><td>'+f.item+'</td><td class="num">'+num(f.cantidad)+' '+(f.unidad||'')+'</td><td style="color:var(--text-secondary);">'+f.referencia+'</td></tr>';}).join('')+'</table>')+'</div>';
  paginarTabla('tablaInforme');
  if(filas.length){
    document.getElementById('btnExportInforme').addEventListener('click',function(){
      const headers=['Fecha','Tipo','Insumo','Cantidad','Unidad','Referencia'];
      const filasCSV=filas.map(function(f){
        return [new Date(f.fecha).toLocaleDateString('es-CO'), f.tipo, f.item, fmtCSV(f.cantidad,4), f.unidad||'', f.referencia||''];
      });
      exportarCSV('movimientos',headers,filasCSV);
    });
  }
}

async function generarConteoFisico(){
  const box=document.getElementById('informeResultado');
  box.innerHTML='<div class="empty-state">Cargando existencias…</div>';
  try{
    const [insumos,subproductos]=await Promise.all([
      api('insumos?select=id,codigo,nombre,unidad_medida,unidad_consumo,conversiones,existencia_actual&order=nombre'),
      api('subproductos?select=id,codigo,nombre,existencia_actual&order=nombre')
    ]);
    const items=[];
    insumos.forEach(function(i){items.push({tipo:'insumo',id:i.id,codigo:i.codigo,nombre:i.nombre,unidad:unidadConsumo(i),existencia:i.existencia_actual});});
    subproductos.forEach(function(s){items.push({tipo:'subproducto',id:s.id,codigo:s.codigo,nombre:s.nombre,unidad:'u',existencia:s.existencia_actual});});
    const sorted=applySort(items,'conteo',{tipo:function(x){return x.tipo;},codigo:function(x){return x.codigo;},nombre:function(x){return x.nombre;},existencia:function(x){return x.existencia;}});
    box.innerHTML=`<div class="panel"><div class="panel-header"><h3>Conteo físico · ${items.length} ítems</h3><div style="display:flex;gap:8px;"><button class="secondary small" id="btnExportConteo" title="Descargar CSV del conteo">${icono('download','sm')} Exportar CSV</button><button class="secondary small" id="btnImprimirConteo" title="Imprimir formato en blanco para llenar a mano">${icono('printer','sm')} Imprimir formato</button><span class="require-write"><button class="secondary small" id="btnAplicarAjustes" title="Guardar ajustes">Aplicar ajustes</button></span></div></div><div class="search-box"><input id="buscar_conteo" placeholder="Buscar por código o nombre…"></div><table id="tablaConteo"><thead><tr>${thSort('Tipo','tipo','conteo')+thSort('Código','codigo','conteo')+thSort('Nombre','nombre','conteo')+'<th>Unidad</th>'+thSort('Sistema','existencia','conteo',true)+'<th class="num">Conteo físico</th><th class="num">Diferencia</th>'}</tr></thead><tbody>${sorted.map(function(it){
      const key=it.tipo+':'+it.id;
      return '<tr data-tipo="'+it.tipo+'" data-id="'+it.id+'" data-sistema="'+it.existencia+'"><td>'+badgeTipoItem(it.tipo)+'</td><td class="mono">'+it.codigo+'</td><td>'+it.nombre+'</td><td>'+it.unidad+'</td><td class="num">'+num(it.existencia)+'</td><td class="num"><input type="number" step="0.0001" class="num-input" data-conteo="'+key+'" placeholder="—"></td><td class="num" data-dif="'+key+'">—</td></tr>';
    }).join('')}</tbody></table></div>`;
    bindConteoInputs();
    filtrarTablaConteo('buscar_conteo','tablaConteo');
    bindSortHeaders(function(){generarConteoFisico();});
        paginarTabla('tablaConteo',40);
        document.getElementById('btnExportConteo').addEventListener('click',function(){
      const headers=['Tipo','Código','Nombre','Unidad','Sistema','Conteo físico','Diferencia'];
      const filasCSV=[];
      document.querySelectorAll('#tablaConteo tbody tr').forEach(function(tr){
        const tipoCell=tr.cells[0]?tr.cells[0].textContent.trim():'';
        const cod=tr.cells[1]?tr.cells[1].textContent.trim():'';
        const nom=tr.cells[2]?tr.cells[2].textContent.trim():'';
        const u=tr.cells[3]?tr.cells[3].textContent.trim():'';
        const sis=tr.cells[4]?tr.cells[4].textContent.trim():'';
        const inp=tr.querySelector('[data-conteo]');
        const conteo=inp&&inp.value.trim()!==''?inp.value.trim():'';
        const difCell=tr.cells[6]?tr.cells[6].textContent.trim():'';
        const dif=difCell==='—'?'':difCell;
        filasCSV.push([tipoCell,cod,nom,u,sis,conteo,dif]);
      });
      exportarCSV('conteo_fisico',headers,filasCSV);
    });
    document.getElementById('btnAplicarAjustes').addEventListener('click',aplicarAjustes);
    document.getElementById('btnImprimirConteo').addEventListener('click',imprimirConteoFisico);
  }catch(e){box.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';}
}

async function imprimirConteoFisico(){
  try{
    const [insumos,subproductos]=await Promise.all([
      api('insumos?select=id,codigo,nombre,unidad_medida,unidad_consumo,conversiones,existencia_actual&order=nombre'),
      api('subproductos?select=id,codigo,nombre,existencia_actual&order=nombre')
    ]);
    const items=[];
    insumos.forEach(function(i){items.push({tipo:'Insumo',codigo:i.codigo,nombre:i.nombre,unidad:unidadConsumo(i),sistema:i.existencia_actual});});
    subproductos.forEach(function(s){items.push({tipo:'Subproducto',codigo:s.codigo,nombre:s.nombre,unidad:'u',sistema:s.existencia_actual});});

    const tabla = '<table class="print-table"><thead><tr>'
      +'<th style="width:75px;">Tipo</th>'
      +'<th style="width:90px;">Código</th>'
      +'<th>Nombre</th>'
      +'<th style="width:55px;">Unid.</th>'
      +'<th class="num" style="width:80px;">Sistema</th>'
      +'<th class="num" style="width:80px;">Conteo</th>'
      +'<th class="num" style="width:70px;">Dif.</th>'
      +'</tr></thead><tbody>'
      +items.map(function(it){
        return '<tr>'
          +'<td>'+it.tipo+'</td>'
          +'<td style="font-family:monospace;">'+it.codigo+'</td>'
          +'<td>'+it.nombre+'</td>'
          +'<td>'+it.unidad+'</td>'
          +'<td class="num">'+num(it.sistema)+'</td>'
          +'<td></td><td></td>'
          +'</tr>';
      }).join('')
      +'</tbody></table>';

    const obs = '<div class="print-section-title">Observaciones</div>'
      +'<div style="border:1px solid #bbb;padding:12px;min-height:70px;border-radius:3px;"></div>';

    const firmas = '<div class="print-signatures">'
      +'<div class="print-signature"><div class="name">Contó</div><div class="role">Bodega</div></div>'
      +'<div class="print-signature"><div class="name">Revisó</div><div class="role">Supervisor</div></div>'
      +'<div class="print-signature"><div class="name">Aprobó</div><div class="role">Auditoría</div></div>'
      +'</div>';

    const html = printHeaderHTML('Formato de Conteo Físico','Fecha: '+new Date().toLocaleDateString('es-CO'))
      + '<p style="font-size:9.5pt;color:#444;margin:0 0 12px;">Instrucciones: escriba el conteo real en la columna <b>Conteo</b>. Calcule la diferencia contra el valor del <b>Sistema</b>.</p>'
      + tabla
      + obs
      + firmas
      + printFooterHTML();

    imprimirHTML(html, 'Conteo físico');
  }catch(e){ toast('Error: '+e.message, 'error'); }
}
function bindConteoInputs(){
  document.querySelectorAll('[data-conteo]').forEach(function(inp){
    inp.addEventListener('input',function(){
      const key=inp.dataset.conteo;
      const row=inp.closest('tr');
      const sis=parseFloat(row.dataset.sistema)||0;
      const cell=document.querySelector('[data-dif="'+key+'"]');
      if(!cell)return;
      const v=inp.value.trim();
      if(v===''){cell.textContent='—';cell.style.color='';return;}
      const val=parseFloat(v)||0;
      const dif=val-sis;
      if(Math.abs(dif)<0.00001){cell.textContent='0';cell.style.color='var(--text-muted)';}
      else if(dif>0){cell.textContent='+'+num(dif);cell.style.color='var(--success)';}
      else{cell.textContent=num(dif);cell.style.color='var(--danger)';}
    });
  });
}
function filtrarTablaConteo(inputId,tableId){
  const input=document.getElementById(inputId);if(!input)return;
  input.addEventListener('input',debounce(function(){
    const q=input.value.toLowerCase();
    document.querySelectorAll('#'+tableId+' tbody tr').forEach(function(tr){
      const cod=(tr.cells[1]?tr.cells[1].textContent:'').toLowerCase();
      const nom=(tr.cells[2]?tr.cells[2].textContent:'').toLowerCase();
      tr.style.display=(cod.includes(q)||nom.includes(q))?'':'none';
    });
  },150));
}
async function aplicarAjustes(){
  const ajustes=[];
  document.querySelectorAll('[data-conteo]').forEach(function(inp){
    const v=inp.value.trim();if(v==='')return;
    const parts=inp.dataset.conteo.split(':');const tipo=parts[0],id=parts[1];
    const row=inp.closest('tr');const sis=parseFloat(row.dataset.sistema)||0;const val=parseFloat(v)||0;
    if(Math.abs(val-sis)<0.00001)return;
    ajustes.push({tipo:tipo,id:id,val:val});
  });
  if(ajustes.length===0){toast('No hay diferencias para aplicar.','error');return;}
  if(!await confirmar({title:'Aplicar ajustes',message:'Se van a registrar '+ajustes.length+' movimiento(s) de ajuste. Esta acción no se puede deshacer.',icon:'!',variant:'warn',okText:'Aplicar'}))return;
  const btn=document.getElementById('btnAplicarAjustes');
  let ok=0,err=0;
  try{
    toast('Aplicando '+ajustes.length+' ajuste(s)…','success');
    await withLoading(btn,async function(){
      for(let i=0;i<ajustes.length;i++){
        const a=ajustes[i];
        try{
          if(a.tipo==='insumo')await rpc('ajustar_inventario',{p_insumo_id:a.id,p_nueva_existencia:a.val,p_motivo:'Ajuste por inventario físico'});
          else await rpc('ajustar_subproducto',{p_id:a.id,p_nueva_existencia:a.val});
          ok++;
        }catch(e){err++;console.error(e);}
      }
    });
    toast('Ajustes aplicados: '+ok+(err?' · Errores: '+err:''),err?'error':'success');
    if(ok>0)generarConteoFisico();
  }catch(e){toast(e.message,'error');}
}