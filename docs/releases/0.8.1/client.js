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
const aboutLogo=node('img',undefined,'about-mark');aboutLogo.src='./icon-512.png';aboutLogo.width=80;aboutLogo.height=80;aboutLogo.alt='SMS Bridge';$('about').prepend(aboutLogo);
function parkPanels(){for(const id of panels){const panel=$(id);panel.hidden=true;$('legacy').append(panel);}$('legacy').append(connection);}
function settingsPage(id){parkPanels();stopScanner();clearRecipientQR();const panel=$(id);panel.classList.add('production-settings');panel.hidden=false;$('main').replaceChildren(panel);if(id==='pairing')void state().catch(e=>toast(e.message));}
function button(text,fn,cls=''){const b=node('button',text,cls);b.onclick=fn;return b;}
const popupTimers=new Map();
function popup(id,open){const el=$(id),trigger=$(id==='menu'?'menu-button':'selection-actions');clearTimeout(popupTimers.get(id));trigger.setAttribute('aria-expanded',String(open));if(open){el.hidden=false;el.inert=false;el.classList.remove('closing');}else if(!el.hidden){el.inert=true;el.classList.add('closing');popupTimers.set(id,setTimeout(()=>{el.hidden=true;el.classList.remove('closing');},matchMedia('(prefers-reduced-motion: reduce)').matches?0:180));}}
function closeMenu(){const wasOpen=$('menu-button').getAttribute('aria-expanded')==='true';popup('menu',false);popup('actions-menu',false);return wasOpen;}
$('menu-button').onclick=()=>{const open=$('menu-button').getAttribute('aria-expanded')!=='true';closeMenu();popup('menu',open);if(open)$('menu').querySelector('a').focus();};
$('selection-actions').onclick=()=>{const open=$('selection-actions').getAttribute('aria-expanded')!=='true';closeMenu();popup('actions-menu',open);if(open)$('actions-menu').querySelector('button').focus();};
function menuOpen(){return ['menu-button','selection-actions'].some(id=>$(id).getAttribute('aria-expanded')==='true');}
// Capture before a row/button handler: the first outside tap only dismisses the menu.
document.addEventListener('click',e=>{if(menuOpen()&&!e.target.closest('.menu')){e.preventDefault();e.stopImmediatePropagation();closeMenu();}},true);
// A gesture starting behind a menu must not reach row swipe handlers either.
document.addEventListener('touchstart',e=>{if(menuOpen()&&!e.target.closest('.menu'))e.stopImmediatePropagation();},{capture:true,passive:true});
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
let activeSwipe=null,suppressClickUntil=0;
document.addEventListener('click',e=>{if(Date.now()<suppressClickUntil&&e.target.closest('.thread-row')){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('touchstart',e=>{if(activeSwipe&&!activeSwipe.row.contains(e.target))closeSwipe();},{passive:true});
// Shared tap guard also covers selection mode, where swipe handlers are absent.
let rowTouch=null;
$('main').addEventListener('touchstart',e=>{rowTouch=null;if(e.target.closest('.thread')&&e.touches.length===1){suppressClickUntil=0;rowTouch={x:e.touches[0].clientX,y:e.touches[0].clientY,moved:false};}},{capture:true,passive:true});
$('main').addEventListener('touchmove',e=>{if(!rowTouch||!e.touches.length)return;const t=e.touches[0];if(Math.abs(t.clientX-rowTouch.x)>10||Math.abs(t.clientY-rowTouch.y)>10){rowTouch.moved=true;suppressClickUntil=Date.now()+450;}},{capture:true,passive:true});
for(const type of ['touchend','touchcancel'])$('main').addEventListener(type,()=>{if(rowTouch?.moved||type==='touchcancel')suppressClickUntil=Date.now()+450;rowTouch=null;},{capture:true,passive:true});
function closeSwipe(){if(activeSwipe){activeSwipe.row.classList.remove('revealed','swiping-right','dragging');activeSwipe.button.style.transform='';activeSwipe=null;}}
function attachSwipe(row,b,t){let start=null,dragging=false,suppress=false,dx=0;const hint=node('span',t.unread?'✓ Прочитано':'● Не прочитано','swipe-hint');hint.setAttribute('aria-hidden','true');const del=button('Удалить',async()=>{if(await deleteThreads([t]))renderRows();},'swipe-delete');del.setAttribute('aria-label','Удалить переписку '+t.sender+', '+t.simName);del.innerHTML='<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg><span>Удалить</span>';row.prepend(hint,del);
 b.addEventListener('click',e=>{if(suppress||row.classList.contains('revealed')){e.preventDefault();e.stopImmediatePropagation();suppress=false;closeSwipe();}},true);
 b.addEventListener('touchstart',e=>{if(selecting||e.touches.length!==1)return;closeSwipe();start={x:e.touches[0].clientX,y:e.touches[0].clientY};dx=0;dragging=false;suppress=false;},{passive:true});
 b.addEventListener('touchmove',e=>{if(!start)return;const x=e.touches[0].clientX-start.x,y=e.touches[0].clientY-start.y;if(!dragging){if(Math.abs(y)>10&&Math.abs(y)>=Math.abs(x)){start=null;return;}if(Math.abs(x)<14||Math.abs(x)<Math.abs(y)*1.3)return;dragging=true;suppress=true;row.classList.add('dragging');activeSwipe={row,button:b};}e.preventDefault();dx=Math.max(-104,Math.min(110,x));b.style.transform='translateX('+dx+'px)';row.classList.toggle('swiping-right',dx>0);},{passive:false});
 const finish=cancel=>{start=null;if(!dragging)return;dragging=false;suppressClickUntil=Date.now()+450;row.classList.remove('swiping-right','dragging');if(!cancel&&dx>72){closeSwipe();void change(t.unread?'read':'unread',[t]);}else if(!cancel&&dx< -48){row.classList.add('revealed');b.style.transform='translateX(-104px)';}else closeSwipe();};
 b.addEventListener('touchend',()=>finish(false));b.addEventListener('touchcancel',()=>finish(true));
}
function formatTime(ms){const d=new Date(ms),today=new Date();return d.toDateString()===today.toDateString()?d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'});}
function avatar(sender){const a=node('span',sender.startsWith('+')?'#':sender.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase(),'avatar');let hash=0;for(const c of sender)hash=(hash+c.charCodeAt(0))%5;const palette=[['#e9f1ff','#527bb4'],['#e7f3ec','#478263'],['#f3ebff','#9271b6'],['#fff0e6','#ba825c'],['#edf0f5','#718096']];a.style.setProperty('--avatar-bg',palette[hash][0]);a.style.setProperty('--avatar-fg',palette[hash][1]);a.setAttribute('aria-hidden','true');return a;}
function navigate(route){location.hash=route;}
function renderList(){const main=$('main');parkPanels();main.replaceChildren();const ts=threads();const top=node('div',undefined,'title-line');top.append(node('h1','Сообщения'));main.append(top);
 const search=node('label',undefined,'search-box');search.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/></svg>';const input=node('input');input.type='search';input.placeholder='Поиск';input.setAttribute('aria-label','Поиск по отправителю и тексту');input.value=query;input.oninput=()=>{query=input.value;renderRows();};search.append(input);main.append($('connection'),search);
 const filters=node('div',undefined,'filters');for(const [value,label] of [['all','Все'],['unread','Непрочитанные']]){const b=button(label,()=>{filter=value;renderList();},'chip'+(filter===value?' active':''));b.setAttribute('aria-pressed',String(filter===value));filters.append(b);}const select=node('select',undefined,'sim-filter');select.setAttribute('aria-label','Фильтр SIM');for(const [v,l] of [['','Все SIM'],...new Map(messages().map(m=>[m.simId,m.simName]))])select.add(new Option(l,v));select.value=sim;select.onchange=()=>{sim=select.value;renderRows();};filters.append(select);main.append(filters);
 const list=node('div');list.id='threads';main.append(list);main.append(node('div',demo?'Пример · вымышленные SMS':'До 200 сообщений · на этом устройстве · 0.8.1','list-footer'));renderRows();
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
