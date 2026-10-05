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

function apiHeaders(extra){
  const token=SUPA_SESSION&&SUPA_SESSION.access_token?SUPA_SESSION.access_token:SUPA_KEY;
  return Object.assign({'apikey':SUPA_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json'},extra||{});
}
async function api(path,options){
  const res=await fetch(SUPA_URL.replace(/\/$/,'')+'/rest/v1/'+path,Object.assign({headers:apiHeaders()},options||{}));
  const t=await res.text();let b=null;if(t){try{b=JSON.parse(t);}catch(e){}}
  if(!res.ok)throw new Error((b&&b.message)?b.message:('Error '+res.status));
  return b;
}
async function rpc(fn,params){
  const res=await fetch(SUPA_URL.replace(/\/$/,'')+'/rest/v1/rpc/'+fn,{method:'POST',headers:apiHeaders(),body:JSON.stringify(params||{})});
  const t=await res.text();let b=null;if(t){try{b=JSON.parse(t);}catch(e){}}
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
    btn.classList.add('btn-ok');btn.innerHTML='✓ Guardado';
    setTimeout(function(){btn.classList.remove('btn-ok');btn.innerHTML=orig;btn.disabled=false;},1400);
    return r;
  }catch(e){
    btn.classList.add('btn-err');btn.innerHTML='✕ Error';
    setTimeout(function(){btn.classList.remove('btn-err');btn.innerHTML=orig;btn.disabled=false;},2000);
    throw e;
  }
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
    ['btnRegistrarEntrada','btnRegistrarSalida','btnAplicarAjustes','btnConfirmarOrden',
     'btnGuardarInsumo','btnGuardarSubproducto','btnGuardarProducto','btnGuardarProveedor',
     'btnGuardarPrefijos','btnGuardarUmbrales','btnGuardarPrefijoOP','btnAgregarFilaInsumoSub',
     'btnAgregarFilaSubHijo','btnAgregarFilaSub','btnAgregarFilaInsumo','btnAgregarContacto',
     'btnAgregarNivelConv','btnCrearInsumoInline','btnCrearSubproductoInline','btnAgregarUnidad',
     'btnGuardarPrefijo','btnGuardarUnidad','btnGuardarProveedorInline'].indexOf(t.id)>=0;
  if(esEscritura){
    ev.preventDefault();
    ev.stopPropagation();
    toast('Tu rol es Consulta — solo lectura.','error');
  }
},true);

/* ============ INDICADOR DE STOCK EN EL SIDEBAR ============ */
async function actualizarIndicadorStock(){
  try{
    const insumos=await api('insumos?select=existencia_actual,punto_reorden,unidad_medida,conversiones&estado_activo=eq.true');
    let urgente=0,reorden=0;
    insumos.forEach(function(i){
      const e=estadoInsumo(i);
      if(e==='Urgente')urgente++;
      else if(e==='Reorden')reorden++;
    });
    const total=urgente+reorden;
    const el=document.getElementById('navBadgeInsumos');
    if(!el)return;
    if(total<=0){el.style.display='none';return;}
    el.textContent=total>99?'99+':String(total);
    el.style.background = urgente>0 ? 'var(--danger)' : 'var(--warning)';
    el.style.color = urgente>0 ? '#ffffff' : '#241a02';
    el.style.display='flex';
    el.title = urgente+' urgente(s) · '+reorden+' en reorden';
  }catch(e){
    /* Silencioso: el badge es cosmético, no debe romper la app si falla */
  }
}

/* ============ RECUPERAR SESIÓN AL CARGAR ============ */
async function intentarSesionExistente(){
  try{
    const s=JSON.parse(localStorage.getItem('inv_supa_creds'));
    if(!s||!s.url||!s.key) return false;
    if(typeof supabase==='undefined') return false;

    SUPA_URL=s.url;
    SUPA_KEY=s.key;
    SUPA_CLIENT=supabase.createClient(s.url,s.key,{auth:{persistSession:true,autoRefreshToken:true}});

    const {data}=await SUPA_CLIENT.auth.getSession();
    const session=data && data.session;
    if(!session || !session.user) return false;

    SUPA_SESSION=session;
    await cargarRol();

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
    setTimeout(actualizarIndicadorStock, 600);
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


/* ============ OP AUX ============ */
async function siguienteOPDisponible(prefijo){
  try{
    const r=await api('ordenes_semanales?select=numero_op&numero_op=not.is.null');
    let max=0;
    r.forEach(function(x){
      const suf=String(x.numero_op).replace(prefijo,'').replace(/\D/g,'');
      const n=parseInt(suf,10);
      if(!isNaN(n)&&n>max)max=n;
    });
    return String(max+1).padStart(3,'0');
  }catch(e){return null;}
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
  overlay.addEventListener('click',function(ev){if(ev.target===overlay)closeDialog(false,null);});
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
  overlay.classList.remove('open');
  const r=dialogResolve;dialogResolve=null;
  if(r)r(ok?val:null);
}
function confirmar(opts){
  return new Promise(function(resolve){
    dialogInit();
    dialogResolve=resolve;
    const overlay=document.getElementById('dialogModal');
    document.getElementById('dialogIcon').className='modal-icon '+(opts.variant||'warn');
    document.getElementById('dialogIcon').textContent=opts.icon||'?';
    document.getElementById('dialogTitle').textContent=opts.title||'Confirmación';
    document.getElementById('dialogMsg').textContent=opts.message||'';
    document.getElementById('dialogInputWrap').style.display='none';
    document.getElementById('dialogCancel').style.display=opts.showCancel===false?'none':'';
    document.getElementById('dialogOk').textContent=opts.okText||'Aceptar';
    document.getElementById('dialogOk').className=opts.danger?'danger-btn':'';
    overlay.classList.add('open');
  });
}
function promptear(opts){
  return new Promise(function(resolve){
    dialogInit();
    dialogResolve=resolve;
    const overlay=document.getElementById('dialogModal');
    document.getElementById('dialogIcon').className='modal-icon '+(opts.variant||'info');
    document.getElementById('dialogIcon').textContent=opts.icon||'✎';
    document.getElementById('dialogTitle').textContent=opts.title||'Entrada';
    document.getElementById('dialogMsg').textContent=opts.message||'';
    document.getElementById('dialogInputWrap').style.display='block';
    document.getElementById('dialogCancel').style.display='';
    document.getElementById('dialogOk').textContent=opts.okText||'Aceptar';
    document.getElementById('dialogOk').className='';
    const input=document.getElementById('dialogInput');
    input.value=opts.value||'';
    input.placeholder=opts.placeholder||'';
    overlay.classList.add('open');
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
  overlay.classList.add('open');
  document.getElementById('faltantesCerrar').onclick=function(){overlay.classList.remove('open');};
  overlay.onclick=function(ev){if(ev.target===overlay)overlay.classList.remove('open');};
}
function parsearFaltantes(msg){
  const idx=msg.indexOf('Faltantes: ');
  if(idx<0)return null;
  try{
    return JSON.parse(msg.slice(idx+'Faltantes: '.length));
  }catch(e){return null;}
}
function getConfig(){
  const def={prefijoInsumo:'INS-',prefijoSubproducto:'SUB-',prefijoProducto:'PT-',prefijoOP:'OP-',unidades:['u','m','kg','l','caja','rollo','m²']};
  try{const s=JSON.parse(localStorage.getItem('inv_config'));return s?Object.assign({},def,s):def;}catch(e){return def;}
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
  /* Actualizar el select si está visible */
  const sel=document.getElementById('cfg_tema');
  if(sel) sel.value=t;
}

function saveConfig(c){
  try{localStorage.setItem('inv_config',JSON.stringify(c));}catch(e){}
  if(typeof _invalidateConfigCache==='function') _invalidateConfigCache();
}

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
      container.innerHTML='<span>Mostrando los '+allRows.length+' registros.</span>';
    } else {
      container.innerHTML='<button class="secondary small">Cargar más ('+(allRows.length-visible)+' restantes de '+allRows.length+')</button>';
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
      pag.innerHTML='<span>'+visibles+' resultado'+(visibles===1?'':'s')+'.</span>';
    }
  },150));
}
function filtrarDivs(inputId,prefix){
  const input=document.getElementById(inputId);if(!input)return;
  input.addEventListener('input',debounce(function(){
    const q=input.value.toLowerCase();
    document.querySelectorAll('[id^="'+prefix+'"]').forEach(function(d){d.style.display=d.textContent.toLowerCase().includes(q)?'':'none';});
  },150));
}

/* ============ COMBO ============ */
function comboInput(prefix,idx,options,selectedId,placeholder){
  const sel=(options||[]).find(function(o){return o.id===selectedId;});
  const display=sel?sel.nombre:'';
  const dlId=prefix+'_dl_'+idx;
  const opts=(options||[]).map(function(o){return '<option value="'+String(o.nombre).replace(/"/g,'&quot;')+'" data-id="'+o.id+'"></option>';}).join('');
  return '<input type="text" class="combo" id="'+prefix+'_sel_'+idx+'" list="'+dlId+'" value="'+String(display).replace(/"/g,'&quot;')+'" placeholder="'+(placeholder||'Buscar…')+'"><datalist id="'+dlId+'">'+opts+'</datalist>';
}
function getComboValue(inputId){
  const el=document.getElementById(inputId);if(!el)return '';
  const dl=document.getElementById(el.getAttribute('list'));if(!dl)return '';
  const v=el.value.trim();
  const found=Array.from(dl.options).find(function(o){return o.value===v;});
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
    if(document.getElementById('rememberCreds').checked){
      try{localStorage.setItem('aseptiq_creds',JSON.stringify({email:email,password:password}));}catch(e){}
    } else {
      try{localStorage.removeItem('aseptiq_creds');}catch(e){}
    }

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
    setTimeout(actualizarIndicadorStock, 600);
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
  setSidebarColapsado(getSidebarColapsado());
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
  const brand=document.getElementById('brandHome');
  if(!brand) return;
  const ir=function(){
    const btn=document.querySelector('.nav-item[data-tab="dashboard"]');
    if(btn) btn.click();
  };
  brand.addEventListener('click',ir);
  brand.addEventListener('keydown',function(ev){
    if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();ir();}
  });
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
    const mapa={d:'dashboard',o:'orden',n:'novedades',i:'insumos',p:'productos',e:'entradas',x:'devoluciones',v:'proveedores',a:'auditoria',k:'kardex',h:'historico',c:'costos',r:'rentabilidad',u:'usuarios'};
    const tab=mapa[k];
    if(tab){
      const btn=document.querySelector('.nav-item[data-tab="'+tab+'"]');
      if(btn && btn.style.display!=='none'){
        ev.preventDefault();
        btn.click();
      }
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

/* ============ MODAL DE ATAJOS ============ */
(function(){
  const overlay=document.getElementById('shortcutsModal');
  if(!overlay) return;
  function abrir(){overlay.classList.add('open');}
  function cerrar(){overlay.classList.remove('open');}
  document.getElementById('shortcutsCerrar').addEventListener('click',cerrar);
  overlay.addEventListener('click',function(ev){if(ev.target===overlay)cerrar();});

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

/* ============ NAVEGACIÓN CON GRUPOS ============ */
function abrirGrupoDelTab(tab){
  const item=document.querySelector('.nav-item[data-tab="'+tab+'"]');
  if(!item) return;
  const grupo=item.closest('.nav-group');
  if(!grupo) return;
  document.querySelectorAll('.nav-group').forEach(function(g){
    g.classList.toggle('open', g===grupo);
  });
  /* Asegura que el item quede visible dentro del nav con scroll */
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
    document.querySelectorAll('.nav-item').forEach(function(b){b.classList.remove('active');});
    btn.classList.add('active');
    try{localStorage.setItem('aseptiq_tab',btn.dataset.tab);}catch(e){}
    abrirGrupoDelTab(btn.dataset.tab);
    renderTab(btn.dataset.tab);
  });
});

document.getElementById('btnCerrarSesion').addEventListener('click',async function(){
  try{ if(SUPA_CLIENT) await SUPA_CLIENT.auth.signOut(); }catch(e){}
  try{ localStorage.removeItem('aseptiq_creds'); }catch(e){}
  /* Limpieza de llaves de sesión de supabase-js por si quedaron remanentes */
  try{
    Object.keys(localStorage).forEach(function(k){
      if(k.indexOf('sb-')===0 && k.indexOf('-auth-token')>=0) localStorage.removeItem(k);
    });
  }catch(e){}
  location.reload();
});

/* ============ ARRANQUE AUTOMÁTICO ============ */
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
  /* Prellenar email y contraseña si el usuario pidió recordarlas */
  try{
    const c=JSON.parse(localStorage.getItem('aseptiq_creds'));
    if(c&&c.email){
      document.getElementById('supaEmail').value=c.email;
      document.getElementById('rememberCreds').checked=true;
      document.getElementById('credsWarning').style.display='block';
      if(c.password) document.getElementById('supaPassword').value=c.password;
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
  }
})();

async function renderTab(tab){
  const main=document.getElementById('mainContent');
  const nombres={dashboard:'Cargando dashboard…',orden:'Cargando órdenes…',novedades:'Cargando novedades…',insumos:'Cargando insumos…',productos:'Cargando productos…',entradas:'Cargando entradas…',devoluciones:'Cargando devoluciones…',proveedores:'Cargando proveedores…',auditoria:'Cargando auditoría…',kardex:'Cargando kardex…',historico:'Cargando histórico…',costos:'Cargando análisis de costos…',rentabilidad:'Cargando rentabilidad…',usuarios:'Cargando usuarios…',config:'Cargando configuración…'};
  const r={dashboard:renderDashboard,orden:renderOrden,novedades:renderNovedades,insumos:renderInsumos,productos:renderProductos,entradas:renderEntradas,devoluciones:renderDevoluciones,proveedores:renderProveedores,auditoria:renderAuditoria,kardex:renderKardex,historico:renderHistorico,costos:renderCostosOP,rentabilidad:renderRentabilidad,usuarios:renderUsuarios,config:renderConfig};
  main.innerHTML='<div class="empty-state">Cargando…</div>';
  showLoader(nombres[tab]||'Cargando…');
  try{
    await (r[tab]||renderDashboard)();
  }catch(e){
    main.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
  }finally{
    hideLoader();
    aplicarPermisos();
    /* Refrescar el badge en segundo plano. No bloquea el render. */
    setTimeout(actualizarIndicadorStock, 0);
  }
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
    const ins=it.insumo,total=it.total;
    const disp=ins.existencia_actual-total;
    let est='Cubierto';
    if(disp<0)est='Urgente';else if(disp<=ins.punto_reorden)est='Reorden';
    return {insumo_id:ins.id,nombre:ins.nombre,unidad:unidadConsumo(ins),existencia_consumo:ins.existencia_actual,consumo_total:total,faltante:disp<0?Math.abs(disp):0,estado:est};
  });

  const detalleSub=Object.values(subConsumo).map(function(it){
    const s=it.sub,req=it.total;
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
  const cfg=getConfig();
  main.innerHTML=`
    <h2 class="page-title">Configuración</h2>
    <p class="page-sub">Parámetros globales del sistema. Los cambios se guardan en este navegador.</p>
        <div class="panel">
      <div class="panel-header"><h3>Apariencia</h3></div>
      <div class="form-grid">
        <div>
          <label>Tema de la aplicación</label>
          <select id="cfg_tema">
            <option value="dark">Oscuro</option>
            <option value="light">Claro</option>
          </select>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);padding:0 18px 12px;line-height:1.5;">
        El tema se guarda en este navegador. Los gráficos se adaptan automáticamente.
      </div>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Prefijos de códigos</h3></div>
      <div class="form-grid">
        <div><label>Insumos</label><input id="cfg_pi" value="${cfg.prefijoInsumo}"></div>
        <div><label>Subproductos</label><input id="cfg_ps" value="${cfg.prefijoSubproducto}"></div>
        <div><label>Paquetes (PT)</label><input id="cfg_pp" value="${cfg.prefijoProducto}"></div>
        <div><label>Órdenes de producción (OP)</label><input id="cfg_po" value="${cfg.prefijoOP}"></div>
      </div>
      <div class="form-actions"><button id="btnGuardarPrefijos" title="Guardar todos los prefijos">Guardar prefijos</button></div>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Unidades de medida</h3></div>
      <div class="form-grid"><div><label>Agregar nueva unidad</label><input id="cfg_unidad_nueva" placeholder="ej: rollo, caja, galón"></div></div>
      <div class="form-actions"><button class="secondary" id="btnAgregarUnidad" title="Agregar unidad">Agregar unidad</button></div>
      <div id="cfgUnidadesTabla"></div>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Umbrales de stock</h3></div>
      <div class="form-grid">
        <div><label>Urgente (% del stock objetivo)</label><input id="cfg_umbral_urgente" type="number" min="1" max="99" step="1" value="${cfg.umbralUrgente}"></div>
        <div><label>Reorden (% del stock objetivo)</label><input id="cfg_umbral_reorden" type="number" min="1" max="99" step="1" value="${cfg.umbralReorden}"></div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);padding:0 18px 12px;line-height:1.5;">
        El sistema marca <b>Urgente</b> si la existencia es ≤ <i>urgente%</i> del stock objetivo; <b>Reorden</b> si es ≤ <i>reorden%</i> del stock objetivo + 1; <b>Cubierto</b> si supera ese valor.
      </div>
      <div class="form-actions"><button id="btnGuardarUmbrales" title="Guardar umbrales">Guardar umbrales</button></div>
    </div>
  `;

  /* Selector de tema */
  const selTema=document.getElementById('cfg_tema');
  if(selTema){
    selTema.value=getTema();
    selTema.addEventListener('change',function(e){
      setTema(e.target.value);
      aplicarTema(e.target.value);
      toast('Tema '+e.target.value+' aplicado.','success');
    });
  }
  
  document.getElementById('btnGuardarPrefijos').addEventListener('click',async function(ev){
    await withLoading(ev.currentTarget,async function(){
      const c=getConfig();
      c.prefijoInsumo=document.getElementById('cfg_pi').value.trim()||'INS-';
      c.prefijoSubproducto=document.getElementById('cfg_ps').value.trim()||'SUB-';
      c.prefijoProducto=document.getElementById('cfg_pp').value.trim()||'PT-';
      c.prefijoOP=document.getElementById('cfg_po').value.trim()||'OP-';
      saveConfig(c);
      toast('Prefijos guardados.','success');
    });
  });

  document.getElementById('btnAgregarUnidad').addEventListener('click',function(){
    const n=document.getElementById('cfg_unidad_nueva').value.trim();
    if(!n){toast('Escribe una unidad primero.','error');return;}
    const c=getConfig();if(!c.unidades.includes(n))c.unidades.push(n);
    saveConfig(c);toast('Unidad agregada.','success');renderConfig();
  });

  document.getElementById('btnGuardarUmbrales').addEventListener('click',async function(ev){
    await withLoading(ev.currentTarget,async function(){
      const c=getConfig();
      const uU=parseInt(document.getElementById('cfg_umbral_urgente').value,10);
      const uR=parseInt(document.getElementById('cfg_umbral_reorden').value,10);
      if(!uU||uU<1||uU>99){throw new Error('Urgente debe estar entre 1 y 99.');}
      if(!uR||uR<1||uR>99){throw new Error('Reorden debe estar entre 1 y 99.');}
      if(uU>=uR){throw new Error('El umbral de urgente debe ser menor que el de reorden.');}
      c.umbralUrgente=uU;
      c.umbralReorden=uR;
      saveConfig(c);
      toast('Umbrales guardados.','success');
    });
  });

  renderConfigUnidades(cfg);
}
function renderConfigUnidades(cfg){
  const cont=document.getElementById('cfgUnidadesTabla');if(!cont)return;
  cont.innerHTML='<table><tr><th>Unidad</th><th class="actions"></th></tr>'+cfg.unidades.map(function(u,idx){
    return '<tr><td>'+u+'</td><td class="actions"><button class="ghost small" data-edit-unidad="'+idx+'" title="Editar">Editar</button><button class="danger-btn small" data-del-unidad="'+idx+'" title="Eliminar">Eliminar</button></td></tr>';
  }).join('')+'</table>';
  cont.querySelectorAll('[data-edit-unidad]').forEach(function(b){
    b.addEventListener('click',async function(){
      const idx=+b.dataset.editUnidad;
      const n=await promptear({title:'Renombrar unidad',message:'Nombre actual: '+cfg.unidades[idx],icon:'✎',variant:'info',value:cfg.unidades[idx],okText:'Guardar'});
      if(!n||!n.trim())return;
      const c=getConfig();c.unidades[idx]=n.trim();saveConfig(c);
      toast('Unidad actualizada.','success');renderConfig();
    });
  });
  cont.querySelectorAll('[data-del-unidad]').forEach(function(b){
    b.addEventListener('click',async function(){
      const idx=+b.dataset.delUnidad;
      if(!await confirmar({title:'Eliminar unidad',message:'Esta acción solo la quita de la lista local. Los insumos ya creados con ella no cambian.',icon:'✕',variant:'danger',okText:'Eliminar',danger:true}))return;
      const c=getConfig();c.unidades.splice(idx,1);saveConfig(c);
      toast('Unidad eliminada.','success');renderConfig();
    });
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
      </div>`;
    filtrarTabla('buscar_dash_ins','tabla_dash_ins');
    filtrarTabla('buscar_dash_sub','tabla_dash_sub');
    filtrarTabla('buscar_dash_paq','tabla_dash_paq');
    bindSortHeaders(renderDashboard);
    
    /* Alerta de stock: bind de acciones */
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

/* ============ INSUMOS ============ */
let editandoInsumoId=null;
let cadenaEdicion=[{unidad:'u',factor:1,formula:null}];
let tipoConversionEdicion='fijo';

async function renderInsumos(){
  const main=document.getElementById('mainContent');
  const insumos=await api('insumos?select=*&order=nombre');
  const cfg=getConfig();
  const editando=insumos.find(function(i){return i.id===editandoInsumoId;})||null;
  if(editando){
    cadenaEdicion=(Array.isArray(editando.conversiones)&&editando.conversiones.length)?JSON.parse(JSON.stringify(editando.conversiones)):[{unidad:editando.unidad_medida||'u',factor:1,formula:null}];
    tipoConversionEdicion=editando.tipo_conversion||'fijo';
  } else {
    cadenaEdicion=[{unidad:cfg.unidades[0]||'u',factor:1,formula:null}];
    tipoConversionEdicion='fijo';
  }
  let numSug;
  if(editando)numSug=editando.codigo.replace(cfg.prefijoInsumo,'');
  else{try{numSug=await rpc('siguiente_codigo',{p_prefijo:cfg.prefijoInsumo,p_tabla:'insumos'});}catch(e){numSug=siguienteCodigoLocal(cfg.prefijoInsumo,insumos);}}
  const view=applySort(insumos,'lista_insumos',{nombre:function(i){return i.nombre;},codigo:function(i){return i.codigo;},existencia:function(i){return i.existencia_actual;},costo:function(i){return i.costo_unitario||0;},valor:function(i){return(i.existencia_actual||0)*(i.costo_unitario||0);}});
  main.innerHTML=`
    <h2 class="page-title">Insumos</h2>
    <p class="page-sub">Cadena de conversiones: de unidad de compra a unidad de consumo.</p>
    <div class="panel require-write" id="formEdicionInsumo">
      <div class="panel-header"><h3>${editando?'Editar insumo':'Nuevo insumo'}</h3></div>
      <div class="form-grid">
        <div><label>Código</label><div class="codigo-compuesto"><span class="codigo-prefijo">${cfg.prefijoInsumo}</span><input id="ins_codigo_num" value="${numSug}" ${editando?'disabled':''}></div></div>
        <div><label>Nombre</label><input id="ins_nombre" placeholder="Tela SMS" value="${editando?editando.nombre:''}"></div>
        <div><label>Existencia inicial <span style="color:var(--text-muted);font-weight:400;">(opcional)</span></label><input id="ins_existencia" type="number" step="0.0001" value="${editando?editando.existencia_actual:''}" placeholder="0"></div>
        <div><label>Stock objetivo</label><input id="ins_reorden" type="number" step="0.0001" min="0.0001" value="${editando?editando.punto_reorden:''}" placeholder="Ej: 100" title="El sistema calcula los umbrales de urgente y reorden como % de este valor (configurable en Configuración)"></div>
        <div><label>Costo unitario (por unidad de consumo)</label><input id="ins_costo" type="number" step="0.01" min="0" value="${editando?editando.costo_unitario:0}"></div>
      </div>
      <div class="divider-label">Cadena de conversiones</div>
      <div class="conv-chain">
        <div id="convChainContainer"></div>
        <div style="display:flex;gap:8px;padding-top:6px;flex-wrap:wrap;">
          <button type="button" class="secondary small" id="btnAgregarNivelConv" title="Agregar nivel de conversión">+ Agregar nivel</button>
          <span style="font-size:11.5px;color:var(--text-muted);align-self:center;">Primera = compra · Última = consumo.</span>
        </div>
      </div>
      <div class="form-actions" style="padding-top:16px;">
        <button id="btnGuardarInsumo" title="${editando?'Guardar cambios':'Crear insumo'}">${editando?'Guardar cambios':'Crear insumo'}</button>
        ${editando?'<button class="ghost" id="btnCancelarEdicionInsumo" title="Cancelar edición">Cancelar</button>':''}
      </div>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Listado</h3><div style="display:flex;gap:6px;align-items:center;"><button class="secondary small" id="btnExportInsumos" title="Descargar CSV">Exportar CSV</button>${botonRefreshHTML('insumos')}</div></div>
      <div class="search-box"><input id="buscar_insumos" placeholder="Buscar por nombre o código…"></div>
      ${insumos.length===0?'<div class="empty-state">No hay insumos todavía.</div>':`
      <table id="tablaInsumos"><tr>
        ${thSort('Código','codigo','lista_insumos')}
        ${thSort('Nombre','nombre','lista_insumos')}
        <th>Cadena</th>
        ${thSort('Existencia','existencia','lista_insumos',true)}
        <th class="num">Reorden</th>
        ${thSort('Costo','costo','lista_insumos',true)}
        ${thSort('Valor','valor','lista_insumos',true)}
        <th>Estado</th><th class="actions"></th>
      </tr>
        ${view.map(function(i){return '<tr><td class="mono">'+i.codigo+'</td><td>'+i.nombre+'</td><td style="font-size:11.5px;">'+cadenaTexto(i)+'</td><td class="num">'+formatearExistencia(i)+'</td><td class="num">'+num(i.punto_reorden)+' '+unidadConsumo(i)+'</td><td class="num"><span class="costo-click" data-ajuste-costo="'+i.id+'" data-costo="'+(i.costo_unitario||0)+'" data-nombre="'+String(i.nombre).replace(/"/g,'&quot;')+'" title="Click para ajustar el costo">'+money(i.costo_unitario)+'</span></td><td class="num">'+money((i.existencia_actual||0)*(i.costo_unitario||0))+'</td><td>'+badgeFor(estadoInsumo(i))+'</td><td class="actions"><button class="ghost small" data-edit-insumo="'+i.id+'" title="Editar insumo">Editar</button><button class="danger-btn small" data-del-insumo="'+i.id+'" data-del-nombre="'+i.nombre+'" title="Eliminar insumo">Eliminar</button></td></tr>';}).join('')}
      </table>`}
    </div>`;
  filtrarTabla('buscar_insumos','tablaInsumos');
  bindSortHeaders(renderInsumos);
  renderCadenaEditor();
  paginarTabla('tablaInsumos');
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
  document.getElementById('btnAgregarNivelConv').addEventListener('click',function(){
    sincronizarCadenaDesdeDOM();
    if(cadenaEdicion.length>=1){const u=cadenaEdicion[cadenaEdicion.length-1];if(!u.factor||u.factor<=0)u.factor=1;}
    cadenaEdicion.push({unidad:'',factor:1,formula:null});
    renderCadenaEditor();
  });
  document.querySelectorAll('[data-edit-insumo]').forEach(function(btn){
    btn.addEventListener('click',function(){editandoInsumoId=btn.dataset.editInsumo;renderInsumos().then(function(){scrollToEl('formEdicionInsumo');});});
  });
  document.querySelectorAll('[data-del-insumo]').forEach(function(btn){
    btn.addEventListener('click',async function(){
      if(!await confirmarEliminar(btn.dataset.delNombre))return;
      try{await withLoading(btn,async function(){await rpc('eliminar_insumo',{p_id:btn.dataset.delInsumo});});toast('Insumo eliminado.','success');renderInsumos();}
      catch(e){toast(e.message,'error');}
    });
  });
  const bca=document.getElementById('btnCancelarEdicionInsumo');
  if(bca)bca.addEventListener('click',function(){editandoInsumoId=null;renderInsumos();});
  document.getElementById('btnGuardarInsumo').addEventListener('click',async function(ev){
    sincronizarCadenaDesdeDOM();
    const cAct=getConfig();
    const pr=parseFloat(document.getElementById('ins_reorden').value);
    if(!pr||pr<=0){toast('Punto de reorden obligatorio y mayor a cero.','error');return;}
    if(cadenaEdicion.length===0||!cadenaEdicion[0].unidad){toast('Define al menos la unidad de compra.','error');return;}
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
      existencia_actual:parseFloat(document.getElementById('ins_existencia').value)||0,
      punto_reorden:pr,
      costo_unitario:parseFloat(document.getElementById('ins_costo').value)||0,
      conversiones:cadenaEdicion,
      tipo_conversion:tipo
    };
    if(!body.nombre){toast('Completa el nombre.','error');return;}
    try{
      await withLoading(ev.currentTarget,async function(){
        if(editando){
          await api('insumos?id=eq.'+editando.id,{method:'PATCH',body:JSON.stringify(body)});
          editandoInsumoId=null;
        }else{
          let n2;try{n2=await rpc('siguiente_codigo',{p_prefijo:cAct.prefijoInsumo,p_tabla:'insumos'});}catch(e){n2=siguienteCodigoLocal(cAct.prefijoInsumo,insumos);}
          body.codigo=cAct.prefijoInsumo+n2;
          await api('insumos',{method:'POST',body:JSON.stringify(body)});
        }
      });
      toast(editando?'Insumo actualizado.':'Insumo creado.','success');
      renderInsumos();
    }catch(e){toast('Error: '+traducirError(e.message),'error');}
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
  const main=document.getElementById('mainContent');
  const cfg=getConfig();
  const data=await loadAllProductosData();
  const subproductos=data.subproductos,productos=data.productos,insumos=data.insumos;
  const editandoSub=subproductos.find(function(s){return s.id===editandoSubproductoId;})||null;
  const editandoProd=productos.find(function(p){return p.codigo_pt===editandoProductoCodigo;})||null;
  let numSubSug,numProdSug;
  if(editandoSub)numSubSug=editandoSub.codigo.replace(cfg.prefijoSubproducto,'');
  else{try{numSubSug=await rpc('siguiente_codigo',{p_prefijo:cfg.prefijoSubproducto,p_tabla:'subproductos'});}catch(e){numSubSug=siguienteCodigoLocal(cfg.prefijoSubproducto,subproductos);}}
  if(editandoProd)numProdSug=editandoProd.codigo_pt.replace(cfg.prefijoProducto,'');
  else{try{numProdSug=await rpc('siguiente_codigo',{p_prefijo:cfg.prefijoProducto,p_tabla:'productos_terminados'});}catch(e){numProdSug=siguienteCodigoLocal(cfg.prefijoProducto,productos);}}

  if(editandoSub){
    const rec=data.recetas.filter(function(r){return r.subproducto_id===editandoSub.id;});
    const hij=data.hijos.filter(function(h){return h.subproducto_padre_id===editandoSub.id;});
    filasInsumoSub=rec.length?rec.map(function(r){
      const tieneConv=!!(r.unidad_receta||(r.factor_receta&&r.factor_receta!==1));
      return {insumo_id:r.insumo_id,cantidad:r.cantidad_por_unidad,conversion:tieneConv,unidad_receta:r.unidad_receta||'',factor_receta:r.factor_receta||1};
    }):[{insumo_id:'',cantidad:'',conversion:false,unidad_receta:'',factor_receta:1}];
    filasSubproductoHijo=hij.length?hij.map(function(h){return {subproducto_id:h.subproducto_hijo_id,cantidad:h.cantidad_por_unidad};}):[{subproducto_id:'',cantidad:''}];
    tipoSubEdicion=editandoSub.tipo||'ambos';
  } else {
    filasInsumoSub=[{insumo_id:'',cantidad:'',conversion:false,unidad_receta:'',factor_receta:1}];
    filasSubproductoHijo=[{subproducto_id:'',cantidad:''}];
    tipoSubEdicion='ambos';
  }
  if(editandoProd){
    const cs=data.paqueteSubs.filter(function(p){return p.codigo_pt===editandoProd.codigo_pt;});
    const bi=data.bom.filter(function(b){return b.codigo_pt===editandoProd.codigo_pt;});
    filasSubproducto=cs.length?cs.map(function(r){return {subproducto_id:r.subproducto_id,cantidad:r.cantidad};}):[{subproducto_id:'',cantidad:''}];
    filasInsumoBom=bi.length?bi.map(function(r){return {insumo_id:r.insumo_id,cantidad:r.cantidad_por_unidad};}):[{insumo_id:'',cantidad:''}];
  } else {
    filasSubproducto=[{subproducto_id:'',cantidad:''}];
    filasInsumoBom=[{insumo_id:'',cantidad:''}];
  }

  const subsView=applySort(subproductos,'lista_subs',{nombre:function(s){return s.nombre;},codigo:function(s){return s.codigo;},tipo:function(s){return s.tipo||'';},existencia:function(s){return s.existencia_actual;},costo:function(s){return data.costos.subCosto[s.id]||0;}});
  const prodsView=applySort(productos,'lista_prods',{nombre:function(p){return p.nombre;},codigo:function(p){return p.codigo_pt;},costo:function(p){return data.costos.paqCosto[p.codigo_pt]||0;}});
  const subsParaHijos=subproductos.filter(function(s){return (!editandoSub||s.id!==editandoSub.id)&&(s.tipo==='intermedio'||s.tipo==='ambos'||!s.tipo);});
  const subOptsParaHijos=subsParaHijos.map(function(s){return {id:s.id,nombre:s.nombre+' ('+s.codigo+')'};});
  const insumoOpts=insumos.map(function(i){return {id:i.id,nombre:i.nombre+' ('+unidadConsumo(i)+')'};});
  const subOptsPaq=subproductos.filter(function(s){return s.tipo!=='intermedio';}).map(function(s){return {id:s.id,nombre:s.nombre+' ('+s.codigo+')'};});

  main.innerHTML=`
    <h2 class="page-title">Productos &amp; BOM</h2>
    <p class="page-sub">Insumos → Subproductos → Paquetes (PT). Los subproductos pueden contener otros subproductos.</p>

    <div class="panel require-write" id="formEdicionSub">
      <div class="panel-header"><h3>${editandoSub?'Editar subproducto':'Nuevo subproducto'}</h3></div>
      <div class="form-grid">
        <div><label>Código</label><div class="codigo-compuesto"><span class="codigo-prefijo">${cfg.prefijoSubproducto}</span><input id="sub_codigo_num" value="${numSubSug}" ${editandoSub?'disabled':''}></div></div>
        <div><label>Nombre</label><input id="sub_nombre" placeholder="Batón americano" value="${editandoSub?editandoSub.nombre:''}"></div>
        <div><label>Tipo</label><select id="sub_tipo">
          <option value="intermedio" ${tipoSubEdicion==='intermedio'?'selected':''}>Intermedio (usable en otros subproductos)</option>
          <option value="final" ${tipoSubEdicion==='final'?'selected':''}>Final (solo en paquetes)</option>
          <option value="ambos" ${tipoSubEdicion==='ambos'?'selected':''}>Ambos</option>
        </select></div>
        <div><label>Existencia inicial <span style="color:var(--text-muted);font-weight:400;">(opcional)</span></label><input id="sub_existencia" type="number" value="${editandoSub?editandoSub.existencia_actual:''}" placeholder="0"></div>
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
      <div class="dyn-row-add"><button class="secondary small" id="btnAgregarFilaSubHijo" title="Agregar subproducto hijo">+ Agregar subproducto hijo</button></div>
      <div class="form-actions" style="padding-top:16px;">
        <button id="btnGuardarSubproducto" title="${editandoSub?'Guardar cambios':'Crear subproducto'}">${editandoSub?'Guardar cambios':'Crear subproducto'}</button>
        ${editandoSub?'<button class="ghost" id="btnCancelarSub" title="Cancelar">Cancelar</button>':''}
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Subproductos existentes</h3><button class="secondary small" id="btnExportSubs" title="Descargar CSV">Exportar CSV</button></div>
      <div class="search-box"><input id="buscar_subproductos" placeholder="Buscar subproducto…"></div>
      ${subproductos.length===0?'<div class="empty-state">No hay subproductos todavía.</div>':subsView.map(function(s){
        const costo=data.costos.subCosto[s.id]||0;
        const valor=(s.existencia_actual||0)*costo;
        return '<div class="list-item" id="subRow_'+s.id+'"><div class="list-item-head"><div><strong>'+s.nombre+' <span class="mono" style="color:var(--text-muted);font-size:11.5px;">'+s.codigo+'</span></strong> '+badgeStockSub(s)+' '+badgeTipoSub(s.tipo||'ambos')+'</div><div class="item-actions"><button class="ghost small" data-edit-sub="'+s.id+'" title="Editar subproducto">Editar</button><button class="danger-btn small" data-del-sub="'+s.id+'" data-del-nombre="'+s.nombre+'" title="Eliminar subproducto">Eliminar</button></div></div><div class="list-item-meta"><span>Existencia: <b>'+num(s.existencia_actual)+'</b></span><span class="cost">Costo u.: '+money(costo)+'</span><span class="valor">Valor: '+money(valor)+'</span></div><div class="composicion-list"></div></div>';
      }).join('')}
    </div>

    <div class="panel require-write" id="formEdicionProd">
      <div class="panel-header"><h3>${editandoProd?'Editar paquete (PT)':'Nuevo paquete (PT)'}</h3></div>
      <div class="form-grid">
        <div><label>Código PT</label><div class="codigo-compuesto"><span class="codigo-prefijo">${cfg.prefijoProducto}</span><input id="prod_codigo_num" value="${numProdSug}" ${editandoProd?'disabled':''}></div></div>
        <div><label>Nombre del paquete</label><input id="prod_nombre" placeholder="Cirugía General Proclides" value="${editandoProd?editandoProd.nombre:''}"></div>
        <div><label>Unidades por caja</label><input id="prod_por_caja" type="number" min="1" step="1" value="${editandoProd?editandoProd.unidades_por_caja:1}"></div>
        <div><label>Precio de venta <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">(por unidad, opcional)</span></label><input id="prod_precio" type="number" step="0.01" min="0" value="${editandoProd&&editandoProd.precio_venta!=null?editandoProd.precio_venta:''}" placeholder="Ej: 12500"></div>
      </div>
      <div class="divider-label">Subproductos que componen el paquete</div>
      <div id="filasSubproductoContainer"></div>
      <div class="dyn-row-add">
        <button class="secondary small" id="btnAgregarFilaSub" title="Agregar subproducto al paquete">+ Agregar subproducto</button>
        <button class="ghost small" id="btnCrearSubproductoInline" title="Crear un subproducto nuevo">+ Crear subproducto nuevo</button>
      </div>
      <div id="inlineSubproductoContainer"></div>
      <div class="divider-label">Receta de insumos directa del paquete (opcional)</div>
      <div id="filasInsumoContainer"></div>
      <div class="dyn-row-add"><button class="secondary small" id="btnAgregarFilaInsumo" title="Agregar insumo directo">+ Agregar insumo</button></div>
      <div class="form-actions" style="padding-top:16px;">
        <button id="btnGuardarProducto" title="${editandoProd?'Guardar cambios':'Crear paquete'}">${editandoProd?'Guardar cambios':'Crear paquete'}</button>
        ${editandoProd?'<button class="ghost" id="btnCancelarProd" title="Cancelar">Cancelar</button>':''}
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Paquetes existentes</h3><button class="secondary small" id="btnExportPaq" title="Descargar CSV">Exportar CSV</button></div>
      <div class="search-box"><input id="buscar_paquetes" placeholder="Buscar paquete…"></div>
      ${productos.length===0?'<div class="empty-state">No hay paquetes todavía.</div>':prodsView.map(function(p){
        const costo=data.costos.paqCosto[p.codigo_pt]||0;
        const pc=p.unidades_por_caja||1;
        const ex=Number(p.existencia_actual)||0;
        const precio=p.precio_venta;
        const margen=precio!=null&&precio>0?precio-costo:null;
        const margenPct=margen!=null&&precio>0?(margen/precio*100):null;
        const precioTxt=precio!=null?'<span style="color:var(--info);font-family:\'IBM Plex Mono\',monospace;font-size:14px;font-weight:600;">Precio: '+money(precio)+'</span>':'<span style="color:var(--text-muted);font-size:12px;">Sin precio</span>';
        const margenTxt=margen!=null?'<span style="color:'+(margen>=0?'var(--success)':'var(--danger)')+';font-family:\'IBM Plex Mono\',monospace;font-size:14px;font-weight:600;">Margen: '+money(margen)+' ('+num(margenPct,1)+'%)</span>':'';
        return '<div class="list-item" id="prodRow_'+p.codigo_pt+'"><div class="list-item-head"><div><strong>'+p.nombre+' <span class="mono" style="color:var(--text-muted);font-size:11.5px;">'+p.codigo_pt+'</span> <span class="badge info">caja ×'+pc+'</span></strong> '+badgeStockPT(p)+'</div><div class="item-actions"><button class="ghost small" data-edit-prod="'+p.codigo_pt+'" title="Editar paquete">Editar</button><button class="danger-btn small" data-del-prod="'+p.codigo_pt+'" data-del-nombre="'+p.nombre+'" title="Eliminar paquete">Eliminar</button></div></div><div class="list-item-meta"><span>Existencia: <b>'+num(ex)+'</b></span><span class="cost">Costo u.: '+money(costo)+'</span><span class="valor">Costo caja: '+money(costo*pc)+'</span>'+precioTxt+margenTxt+'</div><div class="composicion-list"></div></div>';
      }).join('')}
    </div>`;

  filtrarDivs('buscar_subproductos','subRow_');
  filtrarDivs('buscar_paquetes','prodRow_');
  bindSortHeaders(renderProductos);
  renderFilasInsumoSub(insumoOpts);
  renderFilasSubproductoHijo(subOptsParaHijos);
  renderFilasSubproducto(subOptsPaq);
  renderFilasInsumo(insumoOpts);

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

  document.getElementById('btnAgregarFilaInsumoSub').addEventListener('click',function(){sincronizarInsumoSub();filasInsumoSub.push({insumo_id:'',cantidad:'',conversion:false,unidad_receta:'',factor_receta:1});renderFilasInsumoSub(insumoOpts);});
  document.getElementById('btnAgregarFilaSubHijo').addEventListener('click',function(){sincronizarSubHijo();filasSubproductoHijo.push({subproducto_id:'',cantidad:''});renderFilasSubproductoHijo(subOptsParaHijos);});
  document.getElementById('btnAgregarFilaSub').addEventListener('click',function(){sincronizarSub();filasSubproducto.push({subproducto_id:'',cantidad:''});renderFilasSubproducto(subOptsPaq);});
  document.getElementById('btnAgregarFilaInsumo').addEventListener('click',function(){sincronizarInsBom();filasInsumoBom.push({insumo_id:'',cantidad:''});renderFilasInsumo(insumoOpts);});

  document.getElementById('btnCrearInsumoInline').addEventListener('click',function(){
    const cont=document.getElementById('inlineInsumoContainer');
    if(cont.innerHTML.trim()){cont.innerHTML='';return;}
    const cfgU=getConfig();
    cont.innerHTML='<div class="mini-form"><h4>Nuevo insumo rápido</h4><div class="form-grid" style="padding:0;"><div><label>Nombre</label><input id="ii_nombre" placeholder="Nombre del insumo"></div><div><label>Unidad de medida</label><select id="ii_unidad">'+cfgU.unidades.map(function(u){return '<option value="'+u+'">'+u+'</option>';}).join('')+'</select></div><div><label>Costo unitario</label><input id="ii_costo" type="number" step="0.01" min="0" value="0"></div><div><label>Punto de reorden</label><input id="ii_reorden" type="number" step="0.0001" min="0.0001" value="1"></div></div><div class="form-actions" style="padding:10px 0 0;"><button class="small" id="ii_guardar" title="Crear insumo">Crear</button><button class="ghost small" id="ii_cancelar" title="Cancelar">Cancelar</button></div></div>';
    document.getElementById('ii_cancelar').addEventListener('click',function(){cont.innerHTML='';});
    document.getElementById('ii_guardar').addEventListener('click',async function(ev){
      const nombre=document.getElementById('ii_nombre').value.trim();
      const unidad=document.getElementById('ii_unidad').value;
      const costo=parseFloat(document.getElementById('ii_costo').value)||0;
      const pr=parseFloat(document.getElementById('ii_reorden').value);
      if(!nombre){toast('Escribe el nombre del insumo.','error');return;}
      if(!pr||pr<=0){toast('Punto de reorden > 0.','error');return;}
      try{
        await withLoading(ev.currentTarget,async function(){
          let num2;try{num2=await rpc('siguiente_codigo',{p_prefijo:cfg.prefijoInsumo,p_tabla:'insumos'});}catch(e){num2=siguienteCodigoLocal(cfg.prefijoInsumo,insumos);}
          await api('insumos',{method:'POST',body:JSON.stringify({codigo:cfg.prefijoInsumo+num2,nombre:nombre,unidad_medida:unidad,existencia_actual:0,punto_reorden:pr,costo_unitario:costo,conversiones:[{unidad:unidad,factor:1}],tipo_conversion:'fijo'})});
        });
        toast('Insumo creado.','success');renderProductos();
      }catch(e){toast('Error: '+traducirError(e.message),'error');}
    });
  });

  document.getElementById('btnCrearSubproductoInline').addEventListener('click',function(){
    const cont=document.getElementById('inlineSubproductoContainer');
    if(cont.innerHTML.trim()){cont.innerHTML='';return;}
    cont.innerHTML='<div class="mini-form"><h4>Nuevo subproducto rápido</h4><div class="form-grid" style="padding:0;"><div><label>Nombre</label><input id="is_nombre" placeholder="Nombre del subproducto"></div><div><label>Tipo</label><select id="is_tipo"><option value="final">Final (solo paquetes)</option><option value="intermedio">Intermedio</option><option value="ambos">Ambos</option></select></div></div><div class="form-actions" style="padding:10px 0 0;"><button class="small" id="is_guardar" title="Crear subproducto">Crear</button><button class="ghost small" id="is_cancelar" title="Cancelar">Cancelar</button></div></div>';
    document.getElementById('is_cancelar').addEventListener('click',function(){cont.innerHTML='';});
    document.getElementById('is_guardar').addEventListener('click',async function(ev){
      const nombre=document.getElementById('is_nombre').value.trim();
      const tipo=document.getElementById('is_tipo').value;
      if(!nombre){toast('Escribe el nombre.','error');return;}
      try{
        await withLoading(ev.currentTarget,async function(){
          let cod;try{cod=cfg.prefijoSubproducto+await rpc('siguiente_codigo',{p_prefijo:cfg.prefijoSubproducto,p_tabla:'subproductos'});}catch(e){cod=cfg.prefijoSubproducto+siguienteCodigoLocal(cfg.prefijoSubproducto,subproductos);}
          await rpc('guardar_subproducto',{p_id:null,p_codigo:cod,p_nombre:nombre,p_existencia:0,p_punto_reorden:0,p_receta:[],p_hijos:[],p_tipo:tipo});
        });
        toast('Subproducto creado.','success');renderProductos();
      }catch(e){toast('Error: '+traducirError(e.message),'error');}
    });
  });

  document.getElementById('btnGuardarSubproducto').addEventListener('click',async function(ev){
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
        let cod=editandoSub?editandoSub.codigo:null;
        if(!cod){try{cod=cfg.prefijoSubproducto+await rpc('siguiente_codigo',{p_prefijo:cfg.prefijoSubproducto,p_tabla:'subproductos'});}catch(e){cod=cfg.prefijoSubproducto+siguienteCodigoLocal(cfg.prefijoSubproducto,subproductos);}}
        /* v11: p_punto_reorden = 0 (subproductos ya no lo usan) */
        await rpc('guardar_subproducto',{p_id:editandoSub?editandoSub.id:null,p_codigo:cod,p_nombre:nombre,p_existencia:parseFloat(document.getElementById('sub_existencia').value)||0,p_punto_reorden:0,p_receta:receta,p_hijos:hijos,p_tipo:tipo});
      });
      toast(editandoSub?'Subproducto actualizado.':'Subproducto creado.','success');
      editandoSubproductoId=null;renderProductos();
    }catch(e){toast(e.message,'error');}
  });
  const bcs=document.getElementById('btnCancelarSub');
  if(bcs)bcs.addEventListener('click',function(){editandoSubproductoId=null;renderProductos();});

  document.getElementById('btnGuardarProducto').addEventListener('click',async function(ev){
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
    try{
      await withLoading(ev.currentTarget,async function(){
        let cod=editandoProd?editandoProd.codigo_pt:null;
        if(!cod){try{cod=cfg.prefijoProducto+await rpc('siguiente_codigo',{p_prefijo:cfg.prefijoProducto,p_tabla:'productos_terminados'});}catch(e){cod=cfg.prefijoProducto+siguienteCodigoLocal(cfg.prefijoProducto,productos);}}
        await rpc('guardar_paquete',{p_codigo_pt:cod,p_es_nuevo:!editandoProd,p_nombre:nombre,p_subproductos:subs,p_insumos:ins,p_unidades_por_caja:pc,p_precio_venta:precio});
      });
      toast(editandoProd?'Paquete actualizado.':'Paquete creado.','success');
      editandoProductoCodigo=null;renderProductos();
    }catch(e){toast(e.message,'error');}
  });
  const bcp=document.getElementById('btnCancelarProd');
  if(bcp)bcp.addEventListener('click',function(){editandoProductoCodigo=null;renderProductos();});

  document.querySelectorAll('[data-edit-sub]').forEach(function(btn){
    btn.addEventListener('click',function(){editandoSubproductoId=btn.dataset.editSub;renderProductos().then(function(){scrollToEl('formEdicionSub');});});
  });
  document.querySelectorAll('[data-del-sub]').forEach(function(btn){
    btn.addEventListener('click',async function(){
      if(!await confirmarEliminar(btn.dataset.delNombre))return;
      try{await withLoading(btn,async function(){await api('subproductos?id=eq.'+btn.dataset.delSub,{method:'DELETE'});});toast('Subproducto eliminado.','success');renderProductos();}
      catch(e){toast('No se pudo eliminar: '+traducirError(e.message),'error');}
    });
  });
  document.querySelectorAll('[data-edit-prod]').forEach(function(btn){
    btn.addEventListener('click',function(){editandoProductoCodigo=btn.dataset.editProd;renderProductos().then(function(){scrollToEl('formEdicionProd');});});
  });
  document.querySelectorAll('[data-del-prod]').forEach(function(btn){
    btn.addEventListener('click',async function(){
      if(!await confirmarEliminar(btn.dataset.delNombre))return;
      try{await withLoading(btn,async function(){await api('productos_terminados?codigo_pt=eq.'+encodeURIComponent(btn.dataset.delProd),{method:'DELETE'});});toast('Paquete eliminado.','success');renderProductos();}
      catch(e){toast('No se pudo eliminar: '+traducirError(e.message),'error');}
    });
  });

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
    return '<div class="dyn-row">'+comboInput('insbom',idx,disponibles,fila.insumo_id,'Buscar insumo…')+'<input id="insbom_cant_'+idx+'" type="number" step="0.0001" placeholder="Cantidad por unidad" value="'+fila.cantidad+'"><button type="button" class="ghost small" data-remove-fila-ins="'+idx+'" title="Quitar">×</button></div>';
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
    return '<div class="dyn-row conv-recipe">'+comboInput('inssub',idx,disponibles,fila.insumo_id,'Buscar insumo…')+'<input id="inssub_cant_'+idx+'" type="number" step="0.0001" placeholder="Cantidad" value="'+fila.cantidad+'"><label class="conv-check" style="justify-self:start;"><input type="checkbox" id="inssub_conv_'+idx+'" '+(conv?'checked':'')+'> conversión</label>'+extra+'<button type="button" class="ghost small" data-remove-fila-inssub="'+idx+'" title="Quitar">×</button></div>';
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

async function renderOrden(){
  const main=document.getElementById('mainContent');
  const cfg=getConfig();
  const filtro=mostrarFinalizadas?'':'&estado_op=in.(Pendiente,En%20proceso)';
  const [productos,ordenes,ultimas]=await Promise.all([
    api('productos_terminados?select=*&estado_activo=eq.true&order=nombre'),
    api('ordenes_semanales?select=*,productos_terminados(nombre,unidades_por_caja)&order=prioridad.asc.nullslast,fecha_programada.asc.nullslast,fecha_creacion.desc&limit=200'+filtro),
    api('ordenes_semanales?select=numero_op,lote,fecha_creacion,fecha_programada,prioridad,codigo_pt,productos_terminados(nombre)&order=fecha_creacion.desc&limit=5')
  ]);
  const ordView=applySort(ordenes,'lista_ordenes',{op:function(o){return o.numero_op||'';},producto:function(o){return o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt;},cantidad:function(o){return o.cantidad_proyectada;},fecha:function(o){return new Date(o.fecha_creacion).getTime();},estado:function(o){return o.estado_op||'';}});
  main.innerHTML=`
    <h2 class="page-title">Cargar orden semanal</h2>
    <p class="page-sub">El sistema explota insumos directos y los de cada subproducto (recursivo).</p>
    <div class="panel require-write">
      <div class="panel-header"><h3>Nueva OP</h3></div>
      <div class="form-grid">
        <div>
          <label>Número de OP <span style="color:var(--danger);">*</span> <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">— sugerido: <b class="mono" id="orden_sugerido">…</b> <button type="button" class="subtle-toggle" id="btnUsarSugerido" title="Rellenar con el número sugerido">usar</button></span></label>
          <div class="codigo-compuesto"><span class="codigo-prefijo">${cfg.prefijoOP}</span><input id="orden_numero" placeholder="Ej: 045" title="Obligatorio. No se puede repetir." required autocomplete="off"></div>
          <div class="field-validate" id="orden_numero_status"></div>
        </div>
        <div>
          <label>Lote <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">(opcional, único si se llena)</span></label>
          <input id="orden_lote" placeholder="Ej: L-2026-014" autocomplete="off">
          <div class="field-validate" id="orden_lote_status"></div>
        </div>
        <div><label>Producto terminado</label><select id="orden_pt">${productos.length?productos.map(function(p){return '<option value="'+p.codigo_pt+'" data-caja="'+(p.unidades_por_caja||1)+'">'+p.nombre+' (caja ×'+(p.unidades_por_caja||1)+')</option>';}).join(''):'<option value="">No hay paquetes</option>'}</select></div>
        <div><label>Cantidad (unidades) <span id="orden_cantidad_preview" style="font-weight:400;color:var(--text-muted);font-size:11.5px;"></span></label><input id="orden_cantidad" type="number" placeholder="1200"></div>
        <div><label>Prioridad <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">(menor = primero)</span></label><input id="orden_prioridad" type="number" min="1" step="1" placeholder="Ej: 1"></div>
        <div><label>Fecha programada</label><input id="orden_fecha_programada" type="date"></div>
      </div>
      <div class="form-actions"><button id="btnCalcular" title="Calcular cobertura de insumos">Calcular cobertura</button></div>
    </div>
    <div id="ordenResultado"></div>
    <div class="panel">
      <div class="panel-header"><h3>Referencia · últimas 5 OPs cargadas</h3></div>
      ${ultimas.length===0?'<div class="empty-state">Aún no hay OPs cargadas.</div>':`
      <table><tr><th>N° OP</th><th>Lote</th><th>Producto</th><th class="num">Prior.</th><th>Programada</th><th>Fecha carga</th></tr>
        ${ultimas.map(function(o){
          const prod=o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt;
          const prioridad=o.prioridad!=null?'#'+o.prioridad:'—';
          const fechaProg=o.fecha_programada?new Date(o.fecha_programada+'T00:00:00').toLocaleDateString('es-CO'):'—';
          return '<tr><td class="mono">'+(o.numero_op||'—')+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+(o.lote||'—')+'</td><td>'+prod+'</td><td class="num">'+prioridad+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+fechaProg+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+new Date(o.fecha_creacion).toLocaleDateString('es-CO')+'</td></tr>';
        }).join('')}
      </table>`}
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Órdenes registradas</h3><div style="display:flex;gap:6px;align-items:center;"><button class="secondary small" id="btnExportOrdenes" title="Descargar CSV">Exportar CSV</button>${botonRefreshHTML('orden')}</div></div>
      <div class="search-box"><input id="buscar_ordenes" placeholder="Buscar por OP o producto…"></div>
      <label class="filter-toggle"><input type="checkbox" id="toggleFinalizadas" ${mostrarFinalizadas?'checked':''}><span>Mostrar también las órdenes terminadas y canceladas</span></label>
      ${ordenes.length===0?'<div class="empty-state">No hay órdenes para mostrar.</div>':`
      <table id="tablaOrdenes"><tr>
        ${thSort('N° OP','op','lista_ordenes')}
        <th>Prior.</th>
        ${thSort('Producto','producto','lista_ordenes')}
        ${thSort('Cantidad','cantidad','lista_ordenes',true)}
        <th>Programada</th>
        ${thSort('Fecha carga','fecha','lista_ordenes')}
        <th>Cobertura</th>
        ${thSort('Estado','estado','lista_ordenes')}
        <th class="actions"></th>
      </tr>
        ${ordView.map(function(o){
          const prod=o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt;
          const pc=o.productos_terminados?(o.productos_terminados.unidades_por_caja||1):1;
          const cajas=o.cantidad_proyectada&&pc>1?Math.ceil(o.cantidad_proyectada/pc):null;
          const fin=o.estado_op==='Terminada'||o.estado_op==='Cancelada';
          const prioridad=o.prioridad!=null?'<span class="badge '+(o.prioridad<=3?'danger':o.prioridad<=10?'warning':'neutral')+'">#'+o.prioridad+'</span>':'<span style="color:var(--text-muted);">—</span>';
          const fechaProg=o.fecha_programada?new Date(o.fecha_programada+'T00:00:00').toLocaleDateString('es-CO'):'<span style="color:var(--text-muted);">—</span>';
          return '<tr><td class="mono">'+(o.numero_op||'—')+(o.lote?'<br><span style="font-size:11px;color:var(--text-muted);">'+o.lote+'</span>':'')+'</td><td>'+prioridad+'</td><td>'+prod+'</td><td class="num">'+num(o.cantidad_proyectada)+(cajas?'<br><span style="color:var(--text-muted);font-size:11px;">≈ '+cajas+' cajas</span>':'')+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+fechaProg+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+new Date(o.fecha_creacion).toLocaleDateString('es-CO')+'</td><td>'+badgeFor(o.estado_cobertura)+'</td><td>'+badgeOP(o.estado_op)+'</td><td class="actions"><button class="ghost small" data-orden-detalle="'+o.id+'" title="Ver detalle de la OP">Detalle</button><button class="success-btn small" data-orden-completar="'+o.id+'" '+(fin?'disabled':'')+' title="Marcar como terminada">Terminar</button><button class="danger-btn small" data-orden-cancelar="'+o.id+'" '+(fin?'disabled':'')+' title="Cancelar">Cancelar</button></td></tr>';
        }).join('')}
      </table>`}
    </div>
    <div id="detalleOrden"></div>`;
  filtrarTabla('buscar_ordenes','tablaOrdenes');
  bindSortHeaders(renderOrden);
  document.getElementById('toggleFinalizadas').addEventListener('change',function(e){mostrarFinalizadas=e.target.checked;renderOrden();});

  /* v19: sugerido + validación en vivo */
  const sugerido=await siguienteOPDisponible(cfg.prefijoOP);
  const lblSug=document.getElementById('orden_sugerido');
  if(sugerido&&lblSug){
    lblSug.textContent=sugerido;
    document.getElementById('btnUsarSugerido').addEventListener('click',function(){
      const inp=document.getElementById('orden_numero');
      inp.value=sugerido;
      inp.dispatchEvent(new Event('input'));
    });
  } else if(lblSug){
    lblSug.textContent='—';
    const btn=document.getElementById('btnUsarSugerido');
    if(btn)btn.style.display='none';
  }

  const inputNum=document.getElementById('orden_numero');

  /* Auto-rellenar el número sugerido si el campo está vacío.
     El usuario puede editarlo; solo es un atajo. */
  if(sugerido && inputNum && !inputNum.value.trim()){
    inputNum.value = sugerido;
    setTimeout(function(){inputNum.dispatchEvent(new Event('input'));},0);
  }
  const inputLote=document.getElementById('orden_lote');
  const statNum=document.getElementById('orden_numero_status');
  const statLote=document.getElementById('orden_lote_status');

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

  /* Preview en vivo de cajas según unidades por caja del PT */
  const selPT=document.getElementById('orden_pt');
  const inputCantidad=document.getElementById('orden_cantidad');
  const previewCantidad=document.getElementById('orden_cantidad_preview');
  function actualizarPreviewCantidad(){
    const opt=selPT.options[selPT.selectedIndex];
    if(!opt){previewCantidad.textContent='';return;}
    const caja=parseInt(opt.dataset.caja,10)||1;
    const cant=parseFloat(inputCantidad.value)||0;
    if(cant>0&&caja>1){
      const cajas=Math.ceil(cant/caja);
      previewCantidad.textContent='— ≈ '+cajas+' caja'+(cajas===1?'':'s')+' de '+caja;
    } else {
      previewCantidad.textContent='';
    }
  }
  selPT.addEventListener('change',actualizarPreviewCantidad);
  inputCantidad.addEventListener('input',actualizarPreviewCantidad);
  actualizarPreviewCantidad();
  paginarTabla('tablaOrdenes');

    document.getElementById('btnExportOrdenes').addEventListener('click',function(){
    const headers=['N° OP','Lote','Prioridad','Producto','Unidades','Cajas aprox.','Cobertura','Estado OP','Programada','Fecha carga','Fecha completado','Fecha cancelado','Motivo cancelación'];
    const filas=ordView.map(function(o){
      const prod=o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt;
      const pc=o.productos_terminados?(o.productos_terminados.unidades_por_caja||1):1;
      const cajas=o.cantidad_proyectada&&pc>1?Math.ceil(o.cantidad_proyectada/pc):'';
      return [
        o.numero_op||'',
        o.lote||'',
        o.prioridad!=null?o.prioridad:'',
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

  document.getElementById('btnCalcular').addEventListener('click',async function(ev){
    const codigo_pt=document.getElementById('orden_pt').value;
    const cantidad=parseFloat(document.getElementById('orden_cantidad').value);
    const numOp=document.getElementById('orden_numero').value.trim();
    if(!codigo_pt||!cantidad){toast('Selecciona producto y cantidad.','error');return;}
    await withLoading(ev.currentTarget,async function(){
      try{
        const res=await calcularCobertura(codigo_pt,cantidad);
        const detalle=res.detalle,detalleSub=res.detalleSub||[],eg=res.estado_general;
        const box=document.getElementById('ordenResultado');
        const tablaInsumos=(detalle.length===0?'<div class="empty-state">Sin insumos directos en la receta.</div>':'<table><tr><th>Insumo</th><th class="num">Existencia</th><th class="num">Consumo</th><th class="num">Faltante</th><th>Estado</th></tr>'+detalle.map(function(d){return '<tr><td>'+d.nombre+'</td><td class="num">'+num(d.existencia_consumo)+' '+d.unidad+'</td><td class="num">'+num(d.consumo_total)+' '+d.unidad+'</td><td class="num">'+(d.faltante>0?num(d.faltante)+' '+d.unidad:'—')+'</td><td>'+badgeFor(d.estado)+'</td></tr>';}).join('')+'</table>');
        const tablaSubs=(detalleSub.length===0?'':'<div class="divider-label">Subproductos que componen el paquete (se consumen de su stock)</div><table><tr><th>Subproducto</th><th>Tipo</th><th class="num">Stock actual</th><th class="num">Requerido</th><th class="num">Consumo del stock</th><th class="num">Faltante a producir</th><th>Estado</th></tr>'+detalleSub.map(function(s){
          return '<tr><td>'+s.nombre+' <span class="mono" style="color:var(--text-muted);font-size:11.5px;">'+s.codigo+'</span></td><td>'+badgeTipoSub(s.tipo)+'</td><td class="num">'+num(s.stock_actual)+'</td><td class="num">'+num(s.requerido)+' u</td><td class="num">'+num(s.a_consumir_del_stock)+' u</td><td class="num">'+(s.faltante>0?'<span style="color:var(--danger);">'+num(s.faltante)+' u</span>':'—')+'</td><td>'+badgeFor(s.estado)+'</td></tr>';
        }).join('')+'</table><p style="font-size:11.5px;color:var(--text-muted);padding:8px 18px 0;">Los subproductos se descuentan del stock al completar la OP. Si hay faltantes, primero produce el subproducto (Entrada mercancía → Subproducto) antes de terminar esta OP.</p>');
        box.innerHTML='<div class="panel"><div class="panel-header"><h3>Resultado</h3>'+badgeFor(eg)+'</div>'+tablaInsumos+tablaSubs+'<div class="form-actions" style="padding-top:16px;"><button id="btnConfirmarOrden" title="Guardar la OP">Confirmar orden (queda Pendiente)</button></div></div>';
        scrollToEl('ordenResultado');
        document.getElementById('btnConfirmarOrden').addEventListener('click',async function(ev2){
          const numOpLimpio=numOp.replace(cfg.prefijoOP,'').trim();
          if(!numOpLimpio){
            toast('El número de OP es obligatorio. Escríbelo antes de confirmar.','error');
            document.getElementById('orden_numero').focus();
            return;
          }
          const numeroCompletoPrev=cfg.prefijoOP+numOpLimpio;
          const lotePrev=document.getElementById('orden_lote').value.trim();
          try{
            const dupOP=await api('ordenes_semanales?numero_op=eq.'+encodeURIComponent(numeroCompletoPrev)+'&select=id&limit=1');
            if(dupOP.length){toast('Ya existe una OP con ese número.','error');return;}
            if(lotePrev){
              const dupLote=await api('ordenes_semanales?lote=eq.'+encodeURIComponent(lotePrev)+'&select=id&limit=1');
              if(dupLote.length){toast('Ya existe una OP con ese lote.','error');return;}
            }
          }catch(e){console.warn('Chequeo de duplicado falló:',e);}
          try{
            await withLoading(ev2.currentTarget,async function(){
              const numeroCompleto=cfg.prefijoOP+numOpLimpio;
              const lote=lotePrev||null;
              const detalleGuardar={insumos:detalle,subproductos:detalleSub};
              const prioridadRaw=document.getElementById('orden_prioridad').value.trim();
              const prioridad=prioridadRaw?parseInt(prioridadRaw,10):null;
              const fechaProg=document.getElementById('orden_fecha_programada').value||null;
              await rpc('confirmar_orden',{
                p_codigo_pt:codigo_pt,
                p_cantidad:cantidad,
                p_estado_cobertura:eg,
                p_detalle:detalleGuardar,
                p_numero_op:numeroCompleto,
                p_cantidad_cajas:null,
                p_lote:lote,
                p_prioridad:prioridad,
                p_fecha_programada:fechaProg
              });
            });
            toast('Orden registrada.','success');
            renderOrden();
          }catch(e){toast(e.message,'error');}
        });
      }catch(e){toast('Error calculando cobertura: '+traducirError(e.message),'error');}
    });
  });
  document.querySelectorAll('[data-orden-detalle]').forEach(function(btn){
    btn.addEventListener('click',function(){const o=ordenes.find(function(x){return x.id===btn.dataset.ordenDetalle;});mostrarDetalleOrden(o,cfg);});
  });
  document.querySelectorAll('[data-orden-completar]').forEach(function(btn){
    btn.addEventListener('click',async function(){
      if(!await confirmar({title:'Terminar OP',message:'Se descontarán los insumos y subproductos del inventario, y se cargará el PT producido.',icon:'✓',variant:'info',okText:'Terminar'}))return;
      try{
        const r=await withLoading(btn,async function(){return await rpc('completar_orden',{p_orden_id:btn.dataset.ordenCompletar});});
        toast('OP terminada · '+r.items_descontados+' items descontados · '+r.pt_producidos+' PT cargados.','success');
        renderOrden();
      }catch(e){
        const arr=parsearFaltantes(e.message||'');
        if(arr&&arr.length){
          showFaltantesModal(arr);
          toast('Faltan '+arr.length+' item(s). Ver detalle.','error');
        } else {
          toast(e.message,'error');
        }
      }
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
function mostrarDetalleOrden(orden,cfg){
  if(!orden)return;
  const box=document.getElementById('detalleOrden');
  const d=orden.detalle_faltantes||{};
  const insumos=Array.isArray(d)?d:(d.insumos||[]);
  const subs=Array.isArray(d)?[]:(d.subproductos||[]);
  const tablaIns=(insumos.length===0?'<div class="empty-state">Sin insumos.</div>':'<table><tr><th>Insumo</th><th class="num">Consumo</th><th class="num">Faltante</th><th>Estado</th></tr>'+insumos.map(function(x){return '<tr><td>'+x.nombre+'</td><td class="num">'+num(x.consumo_total)+' '+(x.unidad||'')+'</td><td class="num">'+(x.faltante>0?num(x.faltante)+' '+(x.unidad||''):'—')+'</td><td>'+badgeFor(x.estado)+'</td></tr>';}).join('')+'</table>');
  const tablaSubs=(subs.length===0?'':'<div class="divider-label">Subproductos requeridos</div><table><tr><th>Subproducto</th><th class="num">Requerido</th><th class="num">Stock al confirmar</th><th class="num">Faltante</th><th>Estado</th></tr>'+subs.map(function(x){return '<tr><td>'+x.nombre+' <span class="mono" style="color:var(--text-muted);font-size:11.5px;">'+(x.codigo||'')+'</span></td><td class="num">'+num(x.requerido)+' u</td><td class="num">'+num(x.stock_actual)+'</td><td class="num">'+(x.faltante>0?num(x.faltante)+' u':'—')+'</td><td>'+badgeFor(x.estado)+'</td></tr>';}).join('')+'</table>');
  box.innerHTML='<div class="panel"><div class="panel-header"><h3>'+(orden.numero_op||'')+(orden.lote?' · lote '+orden.lote:'')+' · '+(orden.productos_terminados?orden.productos_terminados.nombre:orden.codigo_pt)+' · '+num(orden.cantidad_proyectada)+' u</h3>'+badgeOP(orden.estado_op)+'</div>'+tablaIns+tablaSubs+'</div>';
  box.scrollIntoView({behavior:'smooth',block:'start'});
}

/* ============ NOVEDADES ============ */
async function renderNovedades(){
  const main=document.getElementById('mainContent');
  const ordenes=await api('ordenes_semanales?select=*,productos_terminados(nombre)&estado_op=in.(Pendiente,En%20proceso)&order=fecha_creacion.desc');
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
        ${view.map(function(o){return '<tr><td class="mono">'+(o.numero_op||'—')+'</td><td>'+(o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt)+'</td><td class="num">'+num(o.cantidad_proyectada)+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+new Date(o.fecha_creacion).toLocaleDateString('es-CO')+'</td><td>'+badgeFor(o.estado_cobertura)+'</td><td>'+badgeOP(o.estado_op)+'</td><td><button class="ghost small" data-nov-detalle="'+o.id+'" title="Ver detalle">Ver detalle</button></td></tr>';}).join('')}
      </table>`}
    </div>
    <div id="detalleNovedad"></div>`;
  filtrarTabla('buscar_novedades','tablaNovedades');
  bindSortHeaders(renderNovedades);
  paginarTabla('tablaNovedades');
    document.querySelectorAll('[data-nov-detalle]').forEach(function(btn){
    btn.addEventListener('click',function(){
      const o=ordenes.find(function(x){return x.id===btn.dataset.novDetalle;});
      const box=document.getElementById('detalleNovedad');
      const d=o.detalle_faltantes||{};
      const insumos=Array.isArray(d)?d:(d.insumos||[]);
      const subs=Array.isArray(d)?[]:(d.subproductos||[]);
      const tablaIns=(insumos.length===0?'<div class="empty-state">Sin insumos.</div>':'<table><tr><th>Insumo</th><th class="num">Consumo</th><th>Estado</th></tr>'+insumos.map(function(x){return '<tr><td>'+x.nombre+'</td><td class="num">'+num(x.consumo_total)+' '+(x.unidad||'')+'</td><td>'+badgeFor(x.estado)+'</td></tr>';}).join('')+'</table>');
      const tablaSubs=(subs.length===0?'':'<div class="divider-label">Subproductos</div><table><tr><th>Subproducto</th><th class="num">Requerido</th><th class="num">Stock</th><th class="num">Faltante</th><th>Estado</th></tr>'+subs.map(function(x){return '<tr><td>'+x.nombre+'</td><td class="num">'+num(x.requerido)+' u</td><td class="num">'+num(x.stock_actual)+'</td><td class="num">'+(x.faltante>0?num(x.faltante)+' u':'—')+'</td><td>'+badgeFor(x.estado)+'</td></tr>';}).join('')+'</table>');
      box.innerHTML='<div class="panel"><div class="panel-header"><h3>'+(o.numero_op||'')+(o.lote?' · lote '+o.lote:'')+' · '+(o.productos_terminados?o.productos_terminados.nombre:o.codigo_pt)+'</h3>'+badgeOP(o.estado_op)+'</div>'+tablaIns+tablaSubs+'</div>';
      box.scrollIntoView({behavior:'smooth',block:'start'});
    });
  });
}

/* ============ ENTRADAS ============ */
async function renderEntradas(){
  const main=document.getElementById('mainContent');
  const [insumos,subproductos,proveedores,movimientos]=await Promise.all([
    api('insumos?select=id,codigo,nombre,unidad_medida,unidad_consumo,conversiones,tipo_conversion,costo_unitario&estado_activo=eq.true&order=nombre'),
    api('subproductos?select=id,codigo,nombre,existencia_actual&order=nombre'),
    api('sys_proveedores?select=id,razon_social&order=razon_social'),
    api('movimientos_inventario?select=*,insumos(nombre,unidad_medida,unidad_consumo),subproductos(nombre,codigo),sys_proveedores(razon_social)&tipo=eq.Entrada&order=fecha.desc&limit=30')
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
        <div id="ent_lote_wrap" style="display:none;"><label>Lote</label><input id="ent_lote" placeholder="Ej: L-2026-014"></div>
        <div id="ent_motivo_wrap" style="display:none;"><label>Motivo</label><input id="ent_motivo" placeholder="Ej: producción interna, ajuste"></div>
      </div>
      <div class="form-grid" id="ent_rend_box" style="padding-top:0;display:none;"><div class="full-span"><label>Rendimiento real del lote (unidades de consumo por unidad de compra)</label><input id="ent_rendimiento" type="number" step="0.0001" placeholder="Ej: unidades por kg"></div></div>
      <div class="form-grid" id="ent_prov_link_wrap" style="padding-top:0;"><div class="full-span"><button type="button" class="subtle-toggle" id="toggleNuevoProveedor" title="Crear proveedor">+ El proveedor no está en la lista, crear uno nuevo</button></div></div>
      <div id="nuevoProveedorInline" style="display:none;">
        <div class="form-grid" style="padding-top:0;"><div><label>NIT</label><input id="np_nit" placeholder="900123456-1"></div><div><label>Razón social</label><input id="np_nombre" placeholder="Nuevo proveedor S.A.S."></div></div>
        <div class="form-actions" style="padding-top:0;"><button class="secondary small" id="btnGuardarProveedorInline" title="Guardar proveedor">Guardar proveedor</button></div>
      </div>
      <div id="ent_preview" style="padding:0 18px 8px;font-size:12.5px;color:var(--text-secondary);"></div>
      <div class="form-actions"><button id="btnRegistrarEntrada" title="Registrar entrada">Registrar entrada</button></div>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Movimientos de entrada recientes</h3></div>
      ${movimientos.length===0?'<div class="empty-state">Sin movimientos.</div>':`
      <table><tr><th>Tipo</th><th>Item</th><th class="num">Cantidad</th><th>Proveedor / Motivo</th><th>Fecha</th></tr>
        ${movimientos.map(function(m){
          const esSub=!!m.subproducto_id;
          const tipoBadge=esSub?'<span class="badge warning">Subproducto</span>':'<span class="badge info">Insumo</span>';
          const item=esSub?(m.subproductos?m.subproductos.nombre+' <span class="mono" style="color:var(--text-muted);font-size:11.5px;">'+m.subproductos.codigo+'</span>':'(subproducto)'):(m.insumos?m.insumos.nombre:'(insumo)');
          const cant=esSub?('+'+num(m.cantidad)+' u'):('+'+num(m.cantidad)+' '+(m.insumos?(m.insumos.unidad_consumo||m.insumos.unidad_medida):''));
          const ref=esSub?(m.motivo||'—'):(m.sys_proveedores?m.sys_proveedores.razon_social:(m.motivo||'—'));
          return '<tr><td>'+tipoBadge+'</td><td>'+item+'</td><td class="num">'+cant+'</td><td style="color:var(--text-secondary);font-size:12px;">'+ref+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+new Date(m.fecha).toLocaleDateString('es-CO')+'</td></tr>';
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
  const preview=document.getElementById('ent_preview');

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
    loteWrap.style.display=esInsumo?'none':'block';
    if(esInsumo){
      const ins=insumos.find(function(i){return i.id===selItem.value;});
      if(!ins){preview.innerHTML='';return;}
      const uC=unidadCompra(ins),uCons=unidadConsumo(ins),f=factorTotal(ins);
      labelU.textContent=uC+' → '+uCons;
      inputCosto.placeholder=(ins.costo_unitario&&ins.costo_unitario>0)?'Actual: '+money(ins.costo_unitario*f)+' por '+uC:'Opcional';
      const esVar=ins.tipo_conversion==='variable';
      rendBox.style.display=esVar?'grid':'none';
      if(!esVar)inputRend.value='';
      const cant=parseFloat(inputCant.value)||0;
      const rend=parseFloat(inputRend.value)||f;
      preview.innerHTML=cant>0?'Recibirás <strong>'+num(cant)+' '+uC+'</strong> ≈ <strong>'+num(cant*rend)+' '+uCons+'</strong>'+(esVar?' <span style="color:var(--accent);">(rendimiento por lote)</span>':''):'';
    } else {
      labelU.textContent='unidades del subproducto';
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
  popularItems();

  document.getElementById('toggleNuevoProveedor').addEventListener('click',function(){const box=document.getElementById('nuevoProveedorInline');box.style.display=box.style.display==='none'?'block':'none';});
  document.getElementById('btnGuardarProveedorInline').addEventListener('click',async function(ev){
    const nit=document.getElementById('np_nit').value.trim();
    const rs=document.getElementById('np_nombre').value.trim();
    if(!nit||!rs){toast('Completa NIT y razón social.','error');return;}
    try{
      const creado=await withLoading(ev.currentTarget,async function(){
        const existe=await api('sys_proveedores?nit=eq.'+encodeURIComponent(nit)+'&select=id&limit=1');
        if(existe.length)throw new Error('Ya existe un proveedor con ese NIT.');
        return await api('sys_proveedores',{method:'POST',headers:apiHeaders({'Prefer':'return=representation'}),body:JSON.stringify({nit:nit,razon_social:rs})});
      });
      toast('Proveedor creado.','success');
      await renderEntradas();
      if(creado&&creado[0])document.getElementById('ent_proveedor').value=creado[0].id;
    }catch(e){toast(e.message,'error');}
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
        const r=await withLoading(ev.currentTarget,async function(){return await rpc('registrar_entrada',{p_insumo_id:itemId,p_cantidad:cantidad,p_proveedor_id:proveedor_id,p_costo_unitario:costo,p_motivo:null,p_rendimiento_real:rend});});
        toast('Entrada OK · '+num(r.cantidad_consumo)+' en consumo · Existencia: '+num(r.existencia_nueva),'success');
      } else {
        const lote=inputLote.value.trim()||null;
        const motivo=inputMotivo.value.trim()||null;
        const r=await withLoading(ev.currentTarget,async function(){return await rpc('producir_subproducto',{p_id:itemId,p_cantidad:cantidad,p_lote:lote,p_motivo:motivo});});
        toast('Subproducto producido · '+r.items_afectados+' items descontados · Existencia: '+num(r.existencia_nueva),'success');
      }
      renderEntradas();
    }catch(e){toast(e.message,'error');}
  });
} 

/* ============ DEVOLUCIONES A PROVEEDOR ============ */
async function renderDevoluciones(){
  const main=document.getElementById('mainContent');
  const [insumos,proveedores,devoluciones]=await Promise.all([
    api('insumos?select=id,codigo,nombre,unidad_medida,unidad_consumo,conversiones,existencia_actual,punto_reorden&estado_activo=eq.true&order=nombre'),
    api('sys_proveedores?select=id,razon_social&order=razon_social'),
    api('movimientos_inventario?select=*,insumos(nombre,unidad_consumo,unidad_medida),sys_proveedores(razon_social)&tipo=eq.Salida&proveedor_id=not.is.null&order=fecha.desc&limit=30')
  ]);

  main.innerHTML=`
    <div class="page-header-flex">
      <div>
        <h2 class="page-title">Devoluciones a proveedor</h2>
        <p class="page-sub">Registra mercancía devuelta. Descuenta stock y genera un movimiento de Salida con referencia al proveedor.</p>
      </div>
      ${botonRefreshHTML('devoluciones')}
    </div>

    <div class="panel require-write">
      <div class="panel-header"><h3>Nueva devolución</h3></div>
      <div class="form-grid">
        <div><label>Insumo</label><select id="dev_insumo">${insumos.length?insumos.map(function(i){return '<option value="'+i.id+'">'+i.nombre+' ('+unidadConsumo(i)+')</option>';}).join(''):'<option value="">No hay insumos</option>'}</select></div>
        <div><label>Cantidad (<span id="dev_unidad_label">—</span>)</label><input id="dev_cantidad" type="number" step="0.0001" placeholder="0"></div>
        <div><label>Proveedor</label><select id="dev_proveedor"><option value="">— Selecciona —</option>${proveedores.map(function(p){return '<option value="'+p.id+'">'+p.razon_social+'</option>';}).join('')}</select></div>
        <div><label>Motivo <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">(opcional)</span></label><input id="dev_motivo" placeholder="Ej: producto defectuoso, exceso de pedido"></div>
      </div>
      <div id="dev_preview" style="padding:0 18px 8px;font-size:12.5px;color:var(--text-secondary);"></div>
      <div class="form-actions"><button id="btnRegistrarDevolucion" title="Registrar devolución">Registrar devolución</button></div>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Últimas devoluciones</h3></div>
      ${devoluciones.length===0?'<div class="empty-state">Sin devoluciones registradas.</div>':`
      <table><tr><th>Insumo</th><th class="num">Cantidad</th><th>Proveedor</th><th>Motivo</th><th>Fecha</th></tr>
        ${devoluciones.map(function(m){
          const cant=num(m.cantidad)+' '+(m.insumos?(m.insumos.unidad_consumo||m.insumos.unidad_medida):'');
          const prov=m.sys_proveedores?m.sys_proveedores.razon_social:'—';
          const motivo=m.motivo||'—';
          return '<tr><td>'+(m.insumos?m.insumos.nombre:'(insumo)')+'</td><td class="num">-'+cant+'</td><td>'+prov+'</td><td style="color:var(--text-secondary);font-size:12.5px;">'+motivo+'</td><td class="mono" style="font-size:12px;color:var(--text-secondary);">'+new Date(m.fecha).toLocaleDateString('es-CO')+'</td></tr>';
        }).join('')}
      </table>`}
    </div>`;

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
      preview.innerHTML='Existencia actual: <strong>'+num(ins.existencia_actual)+' '+uC+'</strong> → después de la devolución: <strong style="color:'+color+';">'+num(quedaria)+' '+uC+'</strong>';
    } else {
      preview.innerHTML='Existencia actual: <strong>'+num(ins.existencia_actual)+' '+uC+'</strong>';
    }
  }
  selInsumo.addEventListener('change',actualizarContexto);
  inputCant.addEventListener('input',actualizarContexto);
  actualizarContexto();

  document.getElementById('btnRegistrarDevolucion').addEventListener('click',async function(ev){
    const insumo_id=selInsumo.value;
    const proveedor_id=selProv.value;
    const cantidad=parseFloat(inputCant.value);
    const motivo=inputMotivo.value.trim()||null;
    if(!insumo_id){toast('Selecciona un insumo.','error');return;}
    if(!proveedor_id){toast('Selecciona un proveedor.','error');return;}
    if(!cantidad||cantidad<=0){toast('Ingresa una cantidad válida.','error');return;}

    if(!await confirmar({
      title:'Registrar devolución',
      message:'Se van a descontar '+num(cantidad)+' del insumo seleccionado y se dejará registro con el proveedor.',
      icon:'↩',variant:'warn',okText:'Registrar'
    })) return;

    try{
      const r=await withLoading(ev.currentTarget,async function(){
        return await rpc('registrar_devolucion',{
          p_insumo_id:insumo_id,
          p_cantidad:cantidad,
          p_proveedor_id:proveedor_id,
          p_motivo:motivo
        });
      });
      toast('Devolución registrada. Existencia: '+num(r.existencia_nueva),'success');
      renderDevoluciones();
      setTimeout(actualizarIndicadorStock, 300);
    }catch(e){toast(e.message,'error');}
  });
}

/* ============ PROVEEDORES ============ */
let editandoProveedorId=null;
let filasContacto=[{nombre:'',telefono:'',correo:''}];

async function renderProveedores(){
  const main=document.getElementById('mainContent');
  const proveedores=await api('sys_proveedores?select=*&order=razon_social');
  const editando=proveedores.find(function(p){return p.id===editandoProveedorId;})||null;
  filasContacto=editando&&editando.contactos&&editando.contactos.length?editando.contactos.slice():[{nombre:'',telefono:'',correo:''}];
  const view=applySort(proveedores,'lista_prov',{nit:function(p){return p.nit;},razon:function(p){return p.razon_social;},nombre:function(p){return p.razon_social;}});
  main.innerHTML=`
    <h2 class="page-title">Proveedores</h2>
    <p class="page-sub">Maestro de proveedores con dirección y contactos.</p>
    <div class="panel require-write" id="formEdicionProv">
      <div class="panel-header"><h3>${editando?'Editar proveedor':'Nuevo proveedor'}</h3></div>
      <div class="form-grid">
        <div><label>NIT</label><input id="prov_nit" placeholder="900123456-1" value="${editando?editando.nit:''}"></div>
        <div><label>Razón social</label><input id="prov_nombre" placeholder="Empaques del Valle" value="${editando?editando.razon_social:''}"></div>
        <div class="full-span"><label>Dirección</label><input id="prov_direccion" placeholder="Cra 1 # 2-34, Cali" value="${editando&&editando.direccion?editando.direccion:''}"></div>
      </div>
      <div class="divider-label">Contactos</div>
      <div id="filasContactoContainer"></div>
      <div class="dyn-row-add"><button class="secondary small" id="btnAgregarContacto" title="Agregar contacto">+ Agregar contacto</button></div>
      <div class="form-actions">
        <button id="btnGuardarProveedor" title="${editando?'Guardar cambios':'Crear proveedor'}">${editando?'Guardar cambios':'Crear proveedor'}</button>
        ${editando?'<button class="ghost" id="btnCancelarProveedor" title="Cancelar">Cancelar</button>':''}
      </div>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Listado</h3>${botonRefreshHTML('proveedores')}</div>
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
  renderFilasContacto();
  document.getElementById('btnAgregarContacto').addEventListener('click',function(){sincronizarContactos();filasContacto.push({nombre:'',telefono:'',correo:''});renderFilasContacto();});
  document.querySelectorAll('[data-edit-prov]').forEach(function(btn){btn.addEventListener('click',function(){editandoProveedorId=btn.dataset.editProv;renderProveedores().then(function(){scrollToEl('formEdicionProv');});});});
  document.querySelectorAll('[data-del-prov]').forEach(function(btn){
    btn.addEventListener('click',async function(){
      if(!await confirmarEliminar(btn.dataset.delNombre))return;
      try{await withLoading(btn,async function(){await api('sys_proveedores?id=eq.'+btn.dataset.delProv,{method:'DELETE'});});toast('Proveedor eliminado.','success');renderProveedores();}
      catch(e){toast('No se pudo eliminar: '+traducirError(e.message),'error');}
    });
  });
  const bcp=document.getElementById('btnCancelarProveedor');
  if(bcp)bcp.addEventListener('click',function(){editandoProveedorId=null;renderProveedores();});
  document.getElementById('btnGuardarProveedor').addEventListener('click',async function(ev){
    sincronizarContactos();
    const body={nit:document.getElementById('prov_nit').value.trim(),razon_social:document.getElementById('prov_nombre').value.trim(),direccion:document.getElementById('prov_direccion').value.trim()||null,contactos:filasContacto.filter(function(c){return c.nombre||c.telefono||c.correo;})};
    if(!body.nit||!body.razon_social){toast('Completa NIT y razón social.','error');return;}
    try{
      await withLoading(ev.currentTarget,async function(){
        if(!editando){
          const existe=await api('sys_proveedores?nit=eq.'+encodeURIComponent(body.nit)+'&select=id&limit=1');
          if(existe.length)throw new Error('Ya existe un proveedor con ese NIT.');
        }
        if(editando){await api('sys_proveedores?id=eq.'+editando.id,{method:'PATCH',body:JSON.stringify(body)});editandoProveedorId=null;}
        else{await api('sys_proveedores',{method:'POST',body:JSON.stringify(body)});}
      });
      toast(editando?'Proveedor actualizado.':'Proveedor creado.','success');
      renderProveedores();
    }catch(e){toast('Error: '+traducirError(e.message),'error');}
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
    const dataOrdenes=calcOrdenesPorMes(ordenes,12);
    const dataTipos=calcMovimientosPorTipo(movs,30);
    const dataTopValor=calcTopInsumosPorValor(insumos,10);

    main.innerHTML=`
      <div class="page-header-flex">
        <div>
          <h2 class="page-title">Histórico</h2>
          <p class="page-sub">Tendencias de consumo, producción y valorización. Se actualiza en vivo con cada movimiento.</p>
        </div>
        ${botonRefreshHTML('historico')}
      </div>

      <div class="grid-cards g2">
        <div class="panel" style="margin-bottom:0;">
          <div class="panel-header"><h3>Órdenes por mes · últimos 12</h3></div>
          <div style="padding:16px 18px;">
            <div style="position:relative;height:280px;"><canvas id="chOrdenes"></canvas></div>
          </div>
        </div>
        <div class="panel" style="margin-bottom:0;">
          <div class="panel-header"><h3>Movimientos por tipo · últimos 30 días</h3></div>
          <div style="padding:16px 18px;">
            <div style="position:relative;height:280px;"><canvas id="chTipos"></canvas></div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Consumo mensual · top 5 insumos · últimos 12 meses</h3></div>
        <div style="padding:16px 18px;">
          <div style="position:relative;height:340px;"><canvas id="chConsumo"></canvas></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Top 10 insumos por valor en stock</h3></div>
        <div style="padding:16px 18px;">
          <div style="position:relative;height:${Math.max(240,dataTopValor.labels.length*36)}px;"><canvas id="chTopValor"></canvas></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Resumen del período</h3></div>
        <div class="grid-cards" style="margin:0;padding:16px 18px 0;grid-template-columns:repeat(4,minmax(0,1fr));">
          <div class="stat-card neutral"><p class="stat-label">Movimientos analizados</p><p class="stat-value">${movs.length}</p></div>
          <div class="stat-card neutral"><p class="stat-label">Órdenes analizadas</p><p class="stat-value">${ordenes.length}</p></div>
          <div class="stat-card info"><p class="stat-label">Valor total en stock</p><p class="stat-value" style="font-size:18px;">${money(dataTopValor.datasets[0].data.reduce(function(a,b){return a+b;},0))}</p></div>
          <div class="stat-card neutral"><p class="stat-label">Insumos con stock</p><p class="stat-value">${dataTopValor.labels.length>0?insumos.filter(function(i){return (i.existencia_actual||0)>0;}).length:0}</p></div>
        </div>
        <div style="height:16px;"></div>
      </div>
    `;

    renderChartBar('chOrdenes',dataOrdenes,false);
    renderChartDoughnut('chTipos',dataTipos);
    renderChartLine('chConsumo',dataConsumo);
    renderChartBar('chTopValor',dataTopValor,true);
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

      <div class="panel">
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
        <button class="secondary" id="btnKarExport" title="Descargar CSV" style="display:none;">Exportar CSV</button>
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
  document.getElementById('btnKarPrint').addEventListener('click',function(){window.print();});
}
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
  }catch(e){
    box.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';
  }
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
    btn.addEventListener('click',async function(){
      if(btn.disabled)return;
      const userId=btn.dataset.editRol;
      const u=rows.find(function(x){return x.user_id===userId;});
      const nuevo=await promptear({
        title:'Cambiar rol',
        message:'Usuario: '+(u.email||u.nombre||'—'),
        icon:'★',
        variant:'info',
        value:u.role,
        placeholder:'admin | operador | consulta',
        okText:'Guardar'
      });
      if(!nuevo)return;
      const limpio=String(nuevo).trim().toLowerCase();
      if(['admin','operador','consulta'].indexOf(limpio)<0){
        toast('Rol inválido. Debe ser: admin, operador o consulta.','error');
        return;
      }
      try{
        await api('profiles?user_id=eq.'+userId,{method:'PATCH',body:JSON.stringify({role:limpio})});
        toast('Rol actualizado.','success');
        renderUsuarios();
      }catch(e){toast(e.message,'error');}
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
    <h2 class="page-title">Auditoría</h2>
    <p class="page-sub">Registro de salidas y generación de informes de movimientos y existencias.</p>
    <div class="panel no-print require-write">
      <div class="panel-header"><h3>Registrar salida manual</h3></div>
      <div class="form-grid">
        <div><label>Insumo</label><select id="sal_insumo">${insumos.map(function(i){return '<option value="'+i.id+'">'+i.nombre+' ('+unidadConsumo(i)+')</option>';}).join('')}</select></div>
        <div><label>Cantidad (unidad de consumo)</label><input id="sal_cantidad" type="number" step="0.0001" placeholder="10"></div>
        <div><label>Motivo</label><input id="sal_motivo" placeholder="Merma, ajuste, uso interno…"></div>
      </div>
      <div class="form-actions"><button id="btnRegistrarSalida" title="Registrar salida">Registrar salida</button></div>
    </div>
    <div class="panel no-print">
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
        <button class="secondary" id="btnImprimirInforme" title="Imprimir / PDF">Imprimir / PDF</button>
      </div>
    </div>
    <div id="informeResultado"></div>`;
  document.getElementById('btnRegistrarSalida').addEventListener('click',async function(ev){
    const insumo_id=document.getElementById('sal_insumo').value;
    const cantidad=parseFloat(document.getElementById('sal_cantidad').value);
    const motivo=document.getElementById('sal_motivo').value.trim();
    if(!insumo_id||!cantidad||cantidad<=0){toast('Selecciona insumo y cantidad válida.','error');return;}
    try{
      const r=await withLoading(ev.currentTarget,async function(){return await rpc('registrar_salida',{p_insumo_id:insumo_id,p_cantidad:cantidad,p_motivo:motivo||null});});
      toast('Salida registrada. Existencia: '+num(r.existencia_nueva),'success');
      document.getElementById('sal_cantidad').value='';document.getElementById('sal_motivo').value='';
    }catch(e){toast(e.message,'error');}
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
  document.getElementById('btnImprimirInforme').addEventListener('click',function(){window.print();});
  document.getElementById('btnCargarConteo').addEventListener('click',generarConteoFisico);
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
      box.innerHTML='<div class="panel"><div class="panel-header"><h3>Ajustes de costo ('+rows.length+')</h3>'+(rows.length?'<button class="secondary small" id="btnExportAjustesCosto" title="Descargar CSV">Exportar CSV</button>':'')+'</div>'+(rows.length===0?'<div class="empty-state">No hay ajustes en este rango.</div>':'<table id="tablaAjustesCosto"><tr><th>Fecha</th><th>Insumo</th><th class="num">Costo anterior</th><th class="num">Costo nuevo</th><th class="num">Δ</th><th>Motivo</th><th>Usuario</th></tr>'+rows.map(function(r){
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
      box.innerHTML='<div class="panel"><div class="panel-header"><h3>Informe ('+filas.length+' movimientos)</h3>'+(filas.length?'<button class="secondary small" id="btnExportInforme" title="Descargar CSV">Exportar CSV</button>':'')+'</div>'+(filas.length===0?'<div class="empty-state">No hay movimientos para estos filtros.</div>':'<table id="tablaInforme"><tr><th>Fecha</th><th>Tipo</th><th>Subproducto</th><th class="num">Cantidad</th><th>Referencia</th></tr>'+filas.map(function(f){return '<tr><td class="mono" style="font-size:12px;">'+new Date(f.fecha).toLocaleDateString('es-CO')+'</td><td>'+badgeTipo(f.tipo)+'</td><td>'+f.item+'</td><td class="num">'+num(f.cantidad)+' '+(f.unidad||'')+'</td><td style="color:var(--text-secondary);">'+f.referencia+'</td></tr>';}).join('')+'</table>')+'</div>';
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
    box.innerHTML='<div class="panel"><div class="panel-header"><h3>Conteo físico · '+items.length+' ítems</h3><div style="display:flex;gap:8px;"><button class="secondary small" id="btnExportConteo" title="Descargar CSV del conteo">Exportar CSV</button><span class="require-write"><button class="secondary small" id="btnAplicarAjustes" title="Guardar ajustes">Aplicar ajustes</button></span></div></div><div class="search-box"><input id="buscar_conteo" placeholder="Buscar por código o nombre…"></div><table id="tablaConteo"><thead><tr>'+thSort('Tipo','tipo','conteo')+thSort('Código','codigo','conteo')+thSort('Nombre','nombre','conteo')+'<th>Unidad</th>'+thSort('Sistema','existencia','conteo',true)+'<th class="num">Conteo físico</th><th class="num">Diferencia</th></tr></thead><tbody>'+sorted.map(function(it){
      const key=it.tipo+':'+it.id;
      return '<tr data-tipo="'+it.tipo+'" data-id="'+it.id+'" data-sistema="'+it.existencia+'"><td>'+badgeTipoItem(it.tipo)+'</td><td class="mono">'+it.codigo+'</td><td>'+it.nombre+'</td><td>'+it.unidad+'</td><td class="num">'+num(it.existencia)+'</td><td class="num"><input type="number" step="0.0001" class="num-input" data-conteo="'+key+'" placeholder="—"></td><td class="num" data-dif="'+key+'">—</td></tr>';
    }).join('')+'</tbody></table></div>';
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
  }catch(e){box.innerHTML='<div class="empty-state">Error: '+traducirError(e.message)+'</div>';}
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