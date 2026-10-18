(function(){
'use strict';
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
let selecting=false,selected=new Set(),query='',filter='all',sim='',toastTimer;
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500);}
function messages(){return rows;}
function threads(){return BridgeThreads.group(messages(),[...readIds]);}
const panels=['pairing','notifications','preferences','about','delivery-panel'];
const connection=document.querySelector('.connection');connection.id='connection';
const delivery=node('div',undefined,'production-settings');delivery.id='delivery-panel';delivery.append(node('h2','Локальная доставка'),$('localtest'),node('p','Проверяет уведомление на этом устройстве. Для проверки доставки отправьте SMS на домашнюю SIM.'));$('legacy').append(delivery);
$('preferences').append($('lock'),$('clear'));
const aboutLogo=node('img',undefined,'about-mark');aboutLogo.src='./releases/0.8.2/icon-512.png';aboutLogo.width=80;aboutLogo.height=80;aboutLogo.alt='SMS Bridge';$('about').prepend(aboutLogo);
function parkPanels(){for(const id of panels){const panel=$(id);panel.hidden=true;$('legacy').append(panel);}$('legacy').append(connection);}
function settingsPage(id){parkPanels();stopScanner();clearRecipientQR();const panel=$(id);panel.classList.add('production-settings');panel.hidden=false;$('main').replaceChildren(panel);if(id==='pairing')void state().catch(e=>toast(e.message));}
function button(text,fn,cls=''){const b=node('button',text,cls);b.onclick=fn;return b;}
const popupTimers=new Map();
// A real hit-test surface prevents iOS hover/focus and touch handlers beneath menus.
const backdrop=node('div');backdrop.id='menu-backdrop';backdrop.hidden=true;backdrop.setAttribute('aria-hidden','true');document.body.append(backdrop,$('menu'),$('actions-menu'));
backdrop.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();});
backdrop.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();},{passive:false});
backdrop.addEventListener('touchend',e=>{e.preventDefault();e.stopPropagation();closeMenu();},{passive:false});
backdrop.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeMenu();});
backdrop.addEventListener('contextmenu',e=>e.preventDefault());
function popup(id,open){const el=$(id),trigger=$(id==='menu'?'menu-button':'selection-actions');clearTimeout(popupTimers.get(id));trigger.setAttribute('aria-expanded',String(open));backdrop.hidden=!menuOpen();if(open)closeSwipe();if(open){el.hidden=false;el.inert=false;el.classList.remove('closing');}else if(!el.hidden){el.inert=true;el.classList.add('closing');popupTimers.set(id,setTimeout(()=>{el.hidden=true;el.classList.remove('closing');},matchMedia('(prefers-reduced-motion: reduce)').matches?0:180));}}
function closeMenu(){const wasOpen=$('menu-button').getAttribute('aria-expanded')==='true';popup('menu',false);popup('actions-menu',false);return wasOpen;}
$('menu-button').onclick=()=>{const open=$('menu-button').getAttribute('aria-expanded')!=='true';closeMenu();popup('menu',open);if(open)$('menu').querySelector('a').focus();};
$('selection-actions').onclick=()=>{const open=$('selection-actions').getAttribute('aria-expanded')!=='true';closeMenu();popup('actions-menu',open);if(open)$('actions-menu').querySelector('button').focus();};
function menuOpen(){return ['menu-button','selection-actions'].some(id=>$(id).getAttribute('aria-expanded')==='true');}
// Capture before a row/button handler: the first outside tap only dismisses the menu.
document.addEventListener('click',e=>{if(menuOpen()&&!e.target.closest('.menu')){e.preventDefault();e.stopImmediatePropagation();closeMenu();}},true);

document.addEventListener('keydown',e=>{if(e.key==='Escape'){const actions=$('selection-actions').getAttribute('aria-expanded')==='true';const menu=closeMenu();closeSwipe();if(actions)$('selection-actions').focus();else if(menu)$('menu-button').focus();}});
$('menu').addEventListener('click',()=>closeMenu());
let changing=false;
async function change(action,ts){
 if(changing||!privateKey||!ts.length)return false;
 if(demo){toast('Выйдите из примера для управления историей.');return false;}
 if(action==='delete'&&!confirm('Удалить выбранные переписки ('+ts.length+') из локальной истории?')){closeSwipe();return false;}
 const key=privateKey;changing=true;
 try{const read=await BridgeHistory.change(action,ts.flatMap(t=>t.messages),vaultRecord.id);if(key!==privateKey)return false;readIds=new Set(read);await refresh();return key===privateKey;}
 catch(e){if(key===privateKey)toast(e.message);return false;}finally{changing=false;}
}
function markRead(ts){return change('read',ts);}
function markUnread(ts){return change('unread',ts);}
function deleteThreads(ts){return change('delete',ts);}
async function selectionAction(action){const ts=threads().filter(t=>selected.has(t.key));if(!ts.length)return;closeMenu();if(await change(action,ts)){selecting=false;selected.clear();route();}}
for(const action of ['read','unread','delete'])$('action-'+action).onclick=()=>selectionAction(action);
let activeSwipe=null,gesture=null,blockedRow=null;
const swipeThreads=new WeakMap();
function closeSwipe(){if(activeSwipe){activeSwipe.row.classList.remove('revealed','swiping-right','dragging');activeSwipe.button.style.transform='';activeSwipe=null;}}
// One touch recognizer owns direction, cancellation and click eligibility, also in selection mode.
// A rejected gesture remains rejected until a NEW interaction, not an arbitrary timeout.
document.addEventListener('click',e=>{const row=e.target.closest('.thread-row');if(row&&blockedRow===row&&e.target.closest('.thread')){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')blockedRow=null;},true);
document.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')blockedRow=null;},true);
document.addEventListener('touchstart',e=>{if(activeSwipe&&!activeSwipe.row.contains(e.target))closeSwipe();},{passive:true});
const main=$('main');
main.addEventListener('touchstart',e=>{
 const button=e.target.closest('.thread');gesture=null;blockedRow=null;
 if(!button)return;
 const row=button.closest('.thread-row'),revealed=row.classList.contains('revealed');closeSwipe();
 if(e.touches.length!==1){blockedRow=row;return;}
 const touch=e.touches[0];gesture={row,button,x:touch.clientX,y:touch.clientY,id:touch.identifier,started:Date.now(),mode:'tap',dx:0};
 if(revealed)blockedRow=row;
},{passive:true});
main.addEventListener('touchmove',e=>{
 const g=gesture;if(!g)return;
 const touch=Array.from(e.touches).find(t=>t.identifier===g.id);
 if(e.touches.length!==1||!touch){g.mode='cancelled';blockedRow=g.row;closeSwipe();return;}
 const x=touch.clientX-g.x,y=touch.clientY-g.y,ax=Math.abs(x),ay=Math.abs(y);
 if(ax>10||ay>10)blockedRow=g.row;
 if(g.mode==='tap'){
  if(ay>10&&ay>=ax){g.mode='vertical';return;}
  if(ax>=14&&ax>ay*1.3){g.mode=selecting?'cancelled':'horizontal';if(g.mode==='horizontal'){g.row.classList.add('dragging');activeSwipe={row:g.row,button:g.button};}}
 }
 if(g.mode!=='horizontal')return;
 if(!e.cancelable){g.mode='cancelled';closeSwipe();return;}
 e.preventDefault();g.dx=Math.max(-104,Math.min(110,x));g.button.style.transform='translateX('+g.dx+'px)';g.row.classList.toggle('swiping-right',g.dx>0);
},{passive:false});
function finishGesture(cancel){
 const g=gesture;gesture=null;if(!g)return;
 if(cancel||g.mode!=='tap'||Date.now()-g.started>=500)blockedRow=g.row;
 if(cancel){closeSwipe();return;}
 if(g.mode!=='horizontal')return;
 g.row.classList.remove('swiping-right','dragging');
 if(g.dx>72){const t=swipeThreads.get(g.button);closeSwipe();if(t)void change(t.unread?'read':'unread',[t]);}
 else if(g.dx< -48){g.row.classList.add('revealed');g.button.style.transform='translateX(-104px)';}
 else closeSwipe();
}
main.addEventListener('touchend',()=>finishGesture(false));main.addEventListener('touchcancel',()=>finishGesture(true));
main.addEventListener('contextmenu',e=>{const row=e.target.closest('.thread-row');if(row){e.preventDefault();blockedRow=row;if(gesture)gesture.mode='cancelled';closeSwipe();}});
function attachSwipe(row,b,t){swipeThreads.set(b,t);const hint=node('span',t.unread?'✓ Прочитано':'● Не прочитано','swipe-hint');hint.setAttribute('aria-hidden','true');const del=button('Удалить',async()=>{if(await deleteThreads([t]))renderRows();},'swipe-delete');del.setAttribute('aria-label','Удалить переписку '+t.sender+', '+t.simName);del.innerHTML='<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg><span>Удалить</span>';row.prepend(hint,del);
 b.addEventListener('click',e=>{if(row.classList.contains('revealed')){e.preventDefault();e.stopImmediatePropagation();closeSwipe();}},true);
}
function formatTime(ms){const d=new Date(ms),today=new Date();return d.toDateString()===today.toDateString()?d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'});}
function avatar(sender){const a=node('span',sender.startsWith('+')?'#':sender.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase(),'avatar');let hash=0;for(const c of sender)hash=(hash+c.charCodeAt(0))%5;const palette=[['#e9f1ff','#527bb4'],['#e7f3ec','#478263'],['#f3ebff','#9271b6'],['#fff0e6','#ba825c'],['#edf0f5','#718096']];a.style.setProperty('--avatar-bg',palette[hash][0]);a.style.setProperty('--avatar-fg',palette[hash][1]);a.setAttribute('aria-hidden','true');return a;}
function navigate(route){location.hash=route;}
function renderList(){const main=$('main');parkPanels();main.replaceChildren();const ts=threads();const top=node('div',undefined,'title-line');top.append(node('h1','Сообщения'));main.append(top);
 const search=node('label',undefined,'search-box');search.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/></svg>';const input=node('input');input.type='search';input.placeholder='Поиск';input.setAttribute('aria-label','Поиск по отправителю и тексту');input.value=query;input.oninput=()=>{query=input.value;renderRows();};search.append(input);main.append($('connection'),search);
 const filters=node('div',undefined,'filters');for(const [value,label] of [['all','Все'],['unread','Непрочитанные']]){const b=button(label,()=>{filter=value;renderList();},'chip'+(filter===value?' active':''));b.setAttribute('aria-pressed',String(filter===value));filters.append(b);}const select=node('select',undefined,'sim-filter');select.setAttribute('aria-label','Фильтр SIM');for(const [v,l] of [['','Все SIM'],...new Map(messages().map(m=>[m.simId,m.simName]))])select.add(new Option(l,v));select.value=sim;select.onchange=()=>{sim=select.value;renderRows();};filters.append(select);main.append(filters);
 const list=node('div');list.id='threads';main.append(list);main.append(node('div',demo?'Пример · вымышленные SMS':'До 200 сообщений · на этом устройстве · 0.8.2','list-footer'));renderRows();
}
function renderRows(){const list=$('threads');if(!list)return;closeSwipe();list.replaceChildren();const q=query.trim().toLocaleLowerCase();const ts=threads().filter(t=>(filter!=='unread'||t.unread)&&(!sim||t.last.simId===sim)&&(!q||t.messages.some(m=>(m.sender+' '+m.body).toLocaleLowerCase().includes(q))));
 for(const t of ts){const b=button('',()=>{if(selecting){selected.has(t.key)?selected.delete(t.key):selected.add(t.key);renderRows();}else navigate('thread/'+encodeURIComponent(t.key));},'thread'+(t.unread?' unread':'')+(selected.has(t.key)?' selected':''));b.setAttribute('aria-label',t.sender+', '+t.simName+(t.unread?', непрочитано: '+t.unread:''));if(selecting){b.setAttribute('aria-pressed',String(selected.has(t.key)));b.append(node('span','✓','check'));}else b.append(node('span','','unread-dot'));b.append(avatar(t.sender));const content=node('span',undefined,'thread-content'),top=node('span',undefined,'thread-top'),sender=node('span',t.sender,'sender');sender.dir='auto';top.append(sender,node('time',formatTime(t.last.receivedAt)),node('span','›','chevron'));const snippet=node('span',t.last.body,'snippet');snippet.dir='auto';content.append(top,snippet,node('span',t.simName,'thread-source'));b.append(content);const wrapper=node('div',undefined,'thread-row');wrapper.append(b);if(!selecting)attachSwipe(wrapper,b,t);list.append(wrapper);}
 if(!ts.length){const empty=node('div',undefined,'empty');empty.append(node('strong',filter==='unread'&&!query?'Всё прочитано':'Ничего не найдено'),node('span',messages().length?'Измени фильтр или поисковый запрос.':'Подключите домашний телефон в меню «Настройки SMS».'));list.append(empty);}updateSelection();}
function updateSelection(){const valid=new Set(threads().map(t=>t.key));for(const k of selected)if(!valid.has(k))selected.delete(k);$('selection-bar').hidden=!selecting;$('selection-count').textContent='Выбрано: '+selected.size;$('selection-actions').disabled=!selected.size;for(const action of ['read','unread','delete'])$('action-'+action).disabled=!selected.size;}
function renderThread(key){const t=threads().find(t=>t.key===key);if(!t){navigate('');return;}if(t.unread&&!demo&&!changing)void markRead([t]);parkPanels();const main=$('main'),head=node('div',undefined,'conversation-head');head.append(avatar(t.sender),node('h1',t.sender),node('p',t.simName+(demo?' · Демо':'')));head.querySelector('h1').dir='auto';const body=node('div',undefined,'conversation');let day='';for(const m of t.messages){const d=new Date(m.receivedAt).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});if(d!==day){body.append(node('div',d,'day'));day=d;}const wrap=node('article',undefined,'bubble-wrap'),bubble=node('div',m.body,'bubble');bubble.dir='auto';const meta=node('div',undefined,'bubble-meta');meta.append(node('time',new Date(m.receivedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})),button('Копировать',async()=>{try{await navigator.clipboard.writeText(m.body);toast('Текст скопирован');}catch{toast('Выдели текст сообщения для копирования');}}));wrap.append(bubble,meta);body.append(wrap);}body.append(node('div','Только получение сообщений','receive-only'));main.replaceChildren(head,body);requestAnimationFrame(()=>window.scrollTo(0,document.documentElement.scrollHeight));}

function route(){
 if(!privateKey||$('application').hidden)return;
 closeMenu();closeSwipe();const r=location.hash.slice(1),home=!r,leading=$('leading');
 leading.classList.toggle('selection-button',home&&!selecting);
 if(home&&!selecting)leading.replaceChildren($('selection-icon').content.cloneNode(true));else leading.textContent=home?'Отмена':'‹ Назад';
 leading.setAttribute('aria-label',home?(selecting?'Отменить выбор':'Выбрать переписки'):'Назад');if(home)leading.setAttribute('aria-pressed',String(selecting));else leading.removeAttribute('aria-pressed');
 leading.onclick=()=>{if(home){selecting=!selecting;selected.clear();route();}else navigate('');};
 if(!home){selecting=false;selected.clear();}$('selection-bar').hidden=!selecting;
 if(r.startsWith('thread/')){try{renderThread(decodeURIComponent(r.slice(7)));}catch(e){toast(e.message);navigate('');}}
 else {const id={settings:'preferences',notifications:'notifications',sms:'pairing',delivery:'delivery-panel',about:'about'}[r];if(id)settingsPage(id);else renderList();}
}
window.addEventListener('hashchange',()=>{window.scrollTo(0,0);route();});
window.BridgeUI={toast,render:route,lock(){closeMenu();closeSwipe();selecting=false;selected.clear();query='';parkPanels();$('main').replaceChildren();$('selection-bar').hidden=true;$('toast').textContent='';clearTimeout(toastTimer);}};
authInit();
})();
