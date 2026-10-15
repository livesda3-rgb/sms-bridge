'use strict';
const $=id=>document.getElementById(id);
let registration, rows=[], demo=false, busy=false, privateKey=null, vaultRecord=null, setupMode=false, failures=0, blockedUntil=0;
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
async function refresh(){
 if(!privateKey)return;const key=privateKey;
 if(!demo){const encrypted=await BridgeDB.list(),messages=[];for(const r of encrypted)messages.push(await BridgeVault.open(key,r));if(privateKey!==key)return;rows=BridgeCore.assemble(messages);}
 if(privateKey===key)render();
}
async function state(){
 const cfg=await BridgeDB.get('source'),sub=registration&&await registration.pushManager?.getSubscription();
 const ok=!!(cfg&&sub&&sameKey(sub,cfg.publicKey)&&Notification.permission==='granted');
 $('status').textContent=ok?'Подписка создана · доступ подтверждается в APK':cfg?'Нужно повторное подключение':'Домашний телефон не подключён';
 $('dot').classList.toggle('on',ok);$('paired').hidden=!ok;
 if(ok&&privateKey){const sessionKey=privateKey;const invitation=await BridgeDB.get('invitation');const recipientId=await BridgeDB.get('recipientId');if(privateKey!==sessionKey)return;$('export').value=JSON.stringify({version:1,type:'sms-bridge-recipient',sourceId:cfg.sourceId,recipientId,publicKey:cfg.publicKey,pairingToken:invitation?.pairingToken,name:$('name').value.trim()||'Мой телефон',subscription:sub.toJSON()},null,2);showRecipientQR(invitation);}
 if(await BridgeDB.get('needsRepair'))say('Подписка изменилась. Повторно подключитесь и передайте новые данные в APK.');
}
async function action(fn){if(busy||!privateKey)return;busy=true;$('connect').disabled=true;try{await fn();}catch(e){say(e.message||'Не удалось выполнить действие.');}finally{busy=false;$('connect').disabled=!registration;}}
$('connect').onclick=()=>action(async()=>{
 if(!registration||!('PushManager'in window))throw Error('Push недоступен. На iPhone установите сайт на экран «Домой» и откройте оттуда.');
 const input=$('config').value.trim();if(!input)throw Error('Сканируйте QR домашнего Android или вставьте данные вручную.');
 let parsed;try{parsed=JSON.parse(input);}catch{throw Error('Неверный JSON. Скопируйте данные подключения полностью.');}
 const cfg=BridgeCore.setup(parsed);
 if(!/^[A-Za-z0-9_-]{43}$/.test(parsed.pairingToken||'')||!Number.isSafeInteger(parsed.expiresAt)||parsed.expiresAt<Date.now())throw Error('Срок подключения истёк или код повреждён. Создайте новый QR на Android (15 минут).');
 // Request permission directly in the user gesture, before storage/network awaits.
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw Error('Разрешите уведомления в настройках браузера или приложения.');
 const old=await BridgeDB.get('source');let sub=await registration.pushManager.getSubscription();
 if(old&&(old.sourceId!==cfg.sourceId||old.publicKey!==cfg.publicKey))throw Error('Сначала отключите текущий домашний телефон.');
 if(sub&&!sameKey(sub,cfg.publicKey))throw Error('Сохранена другая подписка. Нажмите «Отключить», затем подключитесь снова.');
 // Persist source before subscribing so early push events can be validated.
 await BridgeDB.set('source',cfg);await BridgeDB.set('invitation',{pairingToken:parsed.pairingToken,expiresAt:parsed.expiresAt});
 sub=sub||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(cfg.publicKey)});
 if(!await BridgeDB.get('recipientId'))await BridgeDB.set('recipientId',crypto.randomUUID());
 await BridgeDB.set('name',$('name').value.trim()||'Мой телефон');await BridgeDB.set('needsRepair',false);
 await state();say('Подписка готова. Покажите ответный QR камере домашнего Android.');
});
$('copy').onclick=()=>copy($('export').value);
$('name').onchange=()=>action(async()=>{await BridgeDB.set('name',$('name').value.trim());await state();});
$('preview').onchange=()=>action(()=>BridgeDB.set('preview',$('preview').checked));
$('localtest').onclick=()=>action(async()=>{if(!registration||!('Notification'in window))throw Error('Уведомления недоступны в этом браузере.');if(await Notification.requestPermission()!=='granted')throw Error('Уведомления не разрешены.');await registration.showNotification('SMS Bridge · проверка',{body:'Локальное уведомление работает. Интернет-доставка ещё не проверена.',icon:'./icon-192.png',tag:'local-test'});say('Локальное уведомление отправлено.');});
$('disconnect').onclick=()=>action(async()=>{if(!confirm('Отключить уведомления от домашнего телефона? История останется.'))return;const sub=await registration?.pushManager?.getSubscription();if(sub&&!await sub.unsubscribe())throw Error('Не удалось отключить подписку. Попробуйте снова.');await BridgeDB.set('source',null);await BridgeDB.set('invitation',null);await BridgeDB.set('recipientId',null);await BridgeDB.set('needsRepair',false);$('config').value='';$('export').value='';clearRecipientQR();await state();say('Подписка отключена. Удалите этого получателя и в домашнем APK.');});
$('clear').onclick=()=>action(async()=>{if(demo){say('Это демонстрация. Нажмите «Выйти».');return;}if(confirm('Удалить все сохранённые здесь SMS?')){await BridgeDB.clear();await refresh();say('История очищена.');}});
$('demo').onclick=()=>{if(!privateKey)return;demo=true;rows=[{id:'demo1',simId:'personal',simName:'Личная SIM',sender:'DEMO BANK',body:'Пример сообщения: код подтверждения 123456. Это вымышленные данные.',receivedAt:Date.now()},{id:'demo2',simId:'work',simName:'Рабочая SIM',sender:'900',body:'Пример короткого отправителя. Здесь будет полный текст входящего SMS.',receivedAt:Date.now()-3600000}];render();};
$('exitdemo').onclick=()=>action(async()=>{demo=false;await refresh();});
$('search').oninput=render;$('sim').onchange=render;
async function init(){
 try{
  $('name').value=await BridgeDB.get('name')||'';$('preview').checked=!!await BridgeDB.get('preview');const cfg=await BridgeDB.get('source');if(cfg)$('config').value=JSON.stringify({...cfg,...await BridgeDB.get('invitation')},null,2);
  if(!isSecureContext||!('serviceWorker'in navigator))throw Error('Нужен HTTPS и браузер с поддержкой Service Worker.');
  const registered=await navigator.serviceWorker.register('./sw.js');
  const updating=registered.installing||registered.waiting;
  if(updating&&updating.state!=='activated')await new Promise((resolve,reject)=>{updating.addEventListener('statechange',()=>{if(updating.state==='activated')resolve();if(updating.state==='redundant')reject(Error('Не удалось обновить клиент. Откройте его заново при наличии интернета.'));});});
  registration=await navigator.serviceWorker.ready;
  $('connect').disabled=false;navigator.serviceWorker.addEventListener('message',()=>refresh().catch(e=>say(e.message)));
  await state();
 }catch(e){$('status').textContent='Настройка не завершена';say(e.message);}
}
window.addEventListener('online',()=>{say('Интернет доступен.');});window.addEventListener('offline',()=>say('Нет интернета. Сохранённая история доступна.'));
function lock(){
 stopScanner();clearRecipientQR();
 privateKey=null;rows=[];demo=false;$('messages').replaceChildren();$('count').textContent='0';$('search').value='';$('config').value='';$('export').value='';$('feedback').textContent='';$('application').hidden=true;$('auth').hidden=false;$('password').value='';$('password-confirm').value='';$('auth-error').textContent='';
}
$('lock').onclick=lock;
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopScanner();clearRecipientQR();}else if(privateKey){refresh().then(state).catch(e=>say(e.message));}});
$('auth-form').onsubmit=async e=>{
 e.preventDefault();if(Date.now()<blockedUntil){$('auth-error').textContent='Подождите несколько секунд перед повтором.';return;}
 $('unlock').disabled=true;const password=$('password').value;
 try{
  let key;
  if(setupMode){if(password!==$('password-confirm').value)throw Error('Пароли не совпадают.');const created=await BridgeVault.create(password);if(!await BridgeDB.createVault(created.record)){location.reload();return;}vaultRecord=created.record;key=created.privateKey;setupMode=false;
  }else key=await BridgeVault.unlock(vaultRecord,password);
  if(!await BridgeDB.rememberKey(vaultRecord.id,key))throw Error('Хранилище изменилось. Перезапустите клиент.');
  await openClient(key);
 }catch(e){if(!setupMode){failures++;blockedUntil=Date.now()+Math.min(30000,1000*2**Math.min(failures-1,5));}$('auth-error').textContent=e.message;}
 finally{$('unlock').disabled=false;}
};
async function openClient(key){
  // Resume an interrupted upgrade without overwriting its vault key.
  for(const m of await BridgeDB.list())if(!m.encrypted)await BridgeDB.replace(await BridgeVault.seal(vaultRecord,m));
  privateKey=key;setupMode=false;failures=0;$('auth-title').textContent='Вход';$('auth-help').textContent='Автоматический вход включён.';$('confirm-box').hidden=true;$('password-confirm').required=false;$('unlock').textContent='Открыть';$('password').autocomplete='current-password';$('password').value='';$('password-confirm').value='';$('auth').hidden=true;$('application').hidden=false;
  const cfg=await BridgeDB.get('source');if(cfg)$('config').value=JSON.stringify({...cfg,...await BridgeDB.get('invitation')},null,2);await refresh();await state();
}
$('reset-vault').onclick=async()=>{
 if(!confirm('Удалить всю историю, пароль и подключение на этом устройстве? Восстановить историю будет нельзя.'))return;
 try{const r=registration||await navigator.serviceWorker.getRegistration();const sub=await r?.pushManager?.getSubscription();if(sub&&!await sub.unsubscribe())throw Error('Не удалось отключить подписку. Повторите сброс при наличии интернета.');lock();await BridgeDB.reset();localStorage.setItem('sms-bridge-reset',String(Date.now()));location.reload();}catch(e){$('auth-error').textContent=e.message;}
};
window.addEventListener('storage',e=>{if(e.key==='sms-bridge-reset')location.reload();});
async function authInit(){
 try{
  vaultRecord=await BridgeDB.get('vault');
  if(!vaultRecord){
   const created=await BridgeVault.create(crypto.randomUUID()+crypto.randomUUID());
   if(!await BridgeDB.createVault(created.record,created.privateKey)){location.reload();return;}
   vaultRecord=created.record;
  }
  setupMode=false;
  const access=await BridgeDB.get('deviceAccess');
  $('confirm-box').hidden=true;$('password-confirm').required=false;$('password').autocomplete='current-password';
  $('auth-title').textContent='Отключение пароля';$('auth-help').textContent='Введите прежний пароль один раз, чтобы сохранить историю. После этого клиент будет открываться автоматически.';$('unlock').textContent='Отключить пароль и открыть';
  if(access?.vaultId===vaultRecord.id&&access.key)await openClient(access.key);
  await init();
 }catch(e){$('auth-error').textContent=e.message;}
}
let qrExpiryTimer=null,qrFrameTimer=null,qrGeneration=0,qrFrames=[],qrFrameIndex=0,qrPaused=false;
function clearRecipientQR(){qrGeneration++;clearInterval(qrExpiryTimer);clearInterval(qrFrameTimer);qrExpiryTimer=qrFrameTimer=null;qrFrames=[];$('recipient-qr').hidden=true;$('recipient-qr').width=0;$('qr-expiry').textContent='';$('qr-frame').textContent='';$('qr-controls').hidden=true;}
function paintQRFrame(){if(!qrFrames.length)return;BridgeQR.drawText($('recipient-qr'),qrFrames[qrFrameIndex]);$('recipient-qr').hidden=false;$('qr-frame').textContent='Часть '+(qrFrameIndex+1)+' из '+qrFrames.length+' · '+(qrPaused?'пауза':'смена автоматически');}
async function showRecipientQR(invitation){
 clearRecipientQR();const generation=qrGeneration,expiry=invitation?.expiresAt;
 const update=()=>{const seconds=Number.isSafeInteger(expiry)?Math.max(0,Math.ceil((expiry-Date.now())/1000)):0;$('qr-expiry').textContent=seconds>0?'Подтвердите на Android в течение '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'Время привязки истекло. Если уже подтвердили на Android — всё готово. Иначе создайте и сканируйте новый QR.';if(!seconds){qrGeneration++;qrFrames=[];$('recipient-qr').hidden=true;$('recipient-qr').width=0;$('qr-controls').hidden=true;$('qr-frame').textContent='';clearInterval(qrExpiryTimer);clearInterval(qrFrameTimer);}return seconds>0;};
 if(!update())return;
 try{const frames=await BridgeQR.frames(JSON.parse($('export').value));if(generation!==qrGeneration||!privateKey)return;if(!update())return;qrFrames=frames;qrFrameIndex=0;qrPaused=false;$('qr-pause').textContent='Пауза';$('qr-controls').hidden=false;paintQRFrame();qrFrameTimer=setInterval(()=>{if(!qrPaused&&qrFrames.length){qrFrameIndex=(qrFrameIndex+1)%qrFrames.length;paintQRFrame();}},1600);qrExpiryTimer=setInterval(update,1000);}catch{if(generation===qrGeneration)say('Не удалось создать QR. Используйте ручную передачу.');}
}
$('qr-pause').onclick=()=>{qrPaused=!qrPaused;$('qr-pause').textContent=qrPaused?'Продолжить':'Пауза';paintQRFrame();};
$('qr-next').onclick=()=>{if(qrFrames.length){qrFrameIndex=(qrFrameIndex+1)%qrFrames.length;paintQRFrame();}};
function stopScanner(){BridgeQR.stop();$('scanner').hidden=true;$('scan-source').disabled=false;}
$('stop-scan').onclick=stopScanner;
$('scan-source').onclick=async()=>{
 if(!privateKey||busy)return;
 $('scanner').hidden=false;$('scan-source').disabled=true;$('scan-result').textContent='';
 await BridgeQR.scan($('qr-video'),raw=>{
  stopScanner();if(!privateKey)return;
  try{if(raw.length>16000)throw Error('QR слишком большой.');const parsed=JSON.parse(raw);const cfg=BridgeCore.setup(parsed);if(!/^[A-Za-z0-9_-]{43}$/.test(parsed.pairingToken||'')||!Number.isSafeInteger(parsed.expiresAt)||parsed.expiresAt<=Date.now())throw Error('Создайте новый QR на Android: этот код истёк или повреждён.');$('config').value=JSON.stringify(parsed);$('scan-result').textContent='Прочитан QR: '+cfg.name+'. Нажмите «Подключить уведомления». ';say('QR прочитан. Подключите уведомления.');}catch(e){say(e instanceof SyntaxError?'Это не QR подключения SMS Bridge.':e.message);}
 },e=>{stopScanner();say(e.name==='NotAllowedError'?'Разрешите доступ к камере в настройках сайта и попробуйте снова.':e.message||'Не удалось открыть камеру.');});
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopScanner();});
window.addEventListener('pagehide',stopScanner);
authInit();
