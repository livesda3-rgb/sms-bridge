'use strict';
const $=id=>document.getElementById(id);
let registration, rows=[], demo=false, busy=false;
const say=text=>{$('feedback').textContent=text;};
const node=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
const keyBytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='),c=>c.charCodeAt(0));
const sameKey=(sub,key)=>{const a=new Uint8Array(sub.options.applicationServerKey||[]),b=keyBytes(key);return a.length===b.length&&a.every((v,i)=>v===b[i]);};
function render(){
 const selected=$('sim').value;
 $('sim').replaceChildren(new Option('Все SIM',''));
 for(const [id,name] of new Map(rows.map(x=>[x.simId,x.simName])))$('sim').add(new Option(name,id));
 $('sim').value=selected;
 const q=$('search').value.toLocaleLowerCase();
 const filtered=rows.filter(x=>(!$('sim').value||x.simId===$('sim').value)&&(!q||(x.sender+' '+x.body).toLocaleLowerCase().includes(q)));
 $('count').textContent=rows.length; $('messages').replaceChildren();$('demo-banner').hidden=!demo;
 if(!filtered.length){const e=node('div','','empty');e.append(node('span','↘','symbol'),node('strong',rows.length?'Ничего не найдено':'Здесь будут ваши SMS'),node('p',rows.length?'Измените поиск или выберите другую SIM.':'Подключите домашний телефон или нажмите «Пример», чтобы посмотреть интерфейс.'));$('messages').append(e);}
 for(const m of filtered){const a=node('article','','message'),meta=node('div','','meta');meta.append(node('b',m.simName),node('time',new Date(m.receivedAt).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})));a.append(meta,node('h3',m.sender),node('p',m.body));const b=node('button','Скопировать SMS');b.onclick=()=>copy(m.body);a.append(b);$('messages').append(a);}
}
async function copy(text){try{await navigator.clipboard.writeText(text);say('Скопировано.');}catch{say('Копирование недоступно. Выделите текст и скопируйте вручную.');}}
async function refresh(){if(!demo)rows=await BridgeDB.list();render();}
async function state(){
 const cfg=await BridgeDB.get('source'),sub=registration&&await registration.pushManager?.getSubscription();
 const ok=!!(cfg&&sub&&sameKey(sub,cfg.publicKey)&&Notification.permission==='granted');
 $('status').textContent=ok?'Подписка создана · передайте её в APK':cfg?'Нужно повторное подключение':'Домашний телефон не подключён';
 $('dot').classList.toggle('on',ok);$('paired').hidden=!ok;
 if(ok){const recipientId=await BridgeDB.get('recipientId');$('export').value=JSON.stringify({version:1,type:'sms-bridge-recipient',sourceId:cfg.sourceId,recipientId,name:$('name').value.trim()||'Мой телефон',subscription:sub.toJSON()},null,2);}
 if(await BridgeDB.get('needsRepair'))say('Подписка изменилась. Повторно подключитесь и передайте новые данные в APK.');
}
async function action(fn){if(busy)return;busy=true;$('connect').disabled=true;try{await fn();}catch(e){say(e.message||'Не удалось выполнить действие.');}finally{busy=false;$('connect').disabled=!registration;}}
$('connect').onclick=()=>action(async()=>{
 if(!registration||!('PushManager'in window))throw Error('Push недоступен. На iPhone установите сайт на экран «Домой» и откройте оттуда.');
 const cfg=BridgeCore.setup(JSON.parse($('config').value));
 // Request permission directly in the user gesture, before storage/network awaits.
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw Error('Разрешите уведомления в настройках браузера или приложения.');
 const old=await BridgeDB.get('source');let sub=await registration.pushManager.getSubscription();
 if(old&&(old.sourceId!==cfg.sourceId||old.publicKey!==cfg.publicKey))throw Error('Сначала отключите текущий домашний телефон.');
 if(sub&&!sameKey(sub,cfg.publicKey))throw Error('Сохранена другая подписка. Нажмите «Отключить», затем подключитесь снова.');
 // Persist source before subscribing so early push events can be validated.
 await BridgeDB.set('source',cfg);
 sub=sub||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(cfg.publicKey)});
 if(!await BridgeDB.get('recipientId'))await BridgeDB.set('recipientId',crypto.randomUUID());
 await BridgeDB.set('name',$('name').value.trim()||'Мой телефон');await BridgeDB.set('needsRepair',false);
 await state();say('Подписка готова. Скопируйте данные получателя в домашний APK.');
});
$('copy').onclick=()=>copy($('export').value);
$('name').onchange=()=>action(async()=>{await BridgeDB.set('name',$('name').value.trim());await state();});
$('preview').onchange=()=>action(()=>BridgeDB.set('preview',$('preview').checked));
$('localtest').onclick=()=>action(async()=>{if(!registration||!('Notification'in window))throw Error('Уведомления недоступны в этом браузере.');if(await Notification.requestPermission()!=='granted')throw Error('Уведомления не разрешены.');await registration.showNotification('SMS Bridge · проверка',{body:'Локальное уведомление работает. Интернет-доставка ещё не проверена.',icon:'./icon-192.png',tag:'local-test'});say('Локальное уведомление отправлено.');});
$('disconnect').onclick=()=>action(async()=>{if(!confirm('Отключить уведомления от домашнего телефона? История останется.'))return;const sub=await registration?.pushManager?.getSubscription();if(sub&&!await sub.unsubscribe())throw Error('Не удалось отключить подписку. Попробуйте снова.');await BridgeDB.set('source',null);await BridgeDB.set('recipientId',null);await BridgeDB.set('needsRepair',false);$('config').value='';$('export').value='';await state();say('Подписка отключена. Удалите этого получателя и в домашнем APK.');});
$('clear').onclick=()=>action(async()=>{if(demo){say('Это демонстрация. Нажмите «Выйти».');return;}if(confirm('Удалить все сохранённые здесь SMS?')){await BridgeDB.clear();await refresh();say('История очищена.');}});
$('demo').onclick=()=>{demo=true;rows=[{id:'demo1',simId:'personal',simName:'Личная SIM',sender:'DEMO BANK',body:'Пример сообщения: код подтверждения 123456. Это вымышленные данные.',receivedAt:Date.now()},{id:'demo2',simId:'work',simName:'Рабочая SIM',sender:'900',body:'Пример короткого отправителя. Здесь будет полный текст входящего SMS.',receivedAt:Date.now()-3600000}];render();};
$('exitdemo').onclick=()=>action(async()=>{demo=false;await refresh();});
$('search').oninput=render;$('sim').onchange=render;
async function init(){
 try{
  await refresh();$('name').value=await BridgeDB.get('name')||'';$('preview').checked=!!await BridgeDB.get('preview');const cfg=await BridgeDB.get('source');if(cfg)$('config').value=JSON.stringify(cfg,null,2);
  if(!isSecureContext||!('serviceWorker'in navigator))throw Error('Нужен HTTPS и браузер с поддержкой Service Worker.');
  await navigator.serviceWorker.register('./sw.js');registration=await navigator.serviceWorker.ready;
  $('connect').disabled=false;navigator.serviceWorker.addEventListener('message',()=>refresh().catch(e=>say(e.message)));
  await state();
 }catch(e){$('status').textContent='Настройка не завершена';say(e.message);}
}
window.addEventListener('online',()=>{say('Интернет доступен.');});window.addEventListener('offline',()=>say('Нет интернета. Сохранённая история доступна.'));
init();
