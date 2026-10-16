'use strict';
function showMessage(m){
 const dialog=document.createElement('dialog');dialog.className='message-detail';
 const close=node('button','Закрыть');close.onclick=()=>dialog.close();
 const copyButton=node('button','Скопировать текст');copyButton.onclick=()=>copy(m.body);
 dialog.append(node('h2',m.sender),node('p',m.simName+' · '+new Date(m.receivedAt).toLocaleString()),node('p',m.body,'full-message'),copyButton,close);
 dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
}
$('menu-toggle').onclick=()=>{$('settings').hidden=!$('settings').hidden;if(!$('settings').hidden)$('settings').scrollIntoView({block:'start'});};
$('close-menu').onclick=()=>{$('settings').hidden=true;stopScanner();clearRecipientQR();};
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{for(const panel of document.querySelectorAll('.settings-tab'))panel.hidden=panel.id!==b.dataset.tab;stopScanner();if(b.dataset.tab==='pairing')state();else clearRecipientQR();};
$('read-filter').onchange=render;
$('reset-filters').onclick=()=>{$('search').value='';$('sim').value='';$('read-filter').value='';render();};
$('notification-mode').onchange=()=>action(()=>BridgeDB.set('notificationMode',$('notification-mode').value));
$('theme').onchange=()=>{document.documentElement.dataset.theme=$('theme').value;BridgeDB.set('theme',$('theme').value).catch(e=>say(e.message));};
(async()=>{const mode=await BridgeDB.get('notificationMode');$('notification-mode').value=mode||((await BridgeDB.get('preview'))?'full':'hidden');const theme=await BridgeDB.get('theme')||'system';$('theme').value=theme;document.documentElement.dataset.theme=theme;await pinStatus();})().catch(e=>say(e.message));
let updateBusy=false;
$('check-update').onclick=async()=>{
 if(updateBusy)return;updateBusy=true;$('check-update').disabled=true;
 try{const r=await fetch('./version.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('Сервер обновлений недоступен');const v=await r.json();if(!/^\d+\.\d+(\.\d+)?$/.test(v.version))throw Error('Некорректная версия');
 const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update();
 $('update-status').textContent='Установлено: 0.7 · на сайте: '+v.version+(v.version==='0.7'?' · актуальная версия.':' · доступно обновление.');$('apply-update').hidden=false;
 }catch(e){$('update-status').textContent='Не удалось проверить: '+e.message+'. Подключения и SMS сохранены.';}finally{updateBusy=false;$('check-update').disabled=false;}
};
$('apply-update').onclick=async()=>{
 $('apply-update').disabled=true;
 try{const reg=await navigator.serviceWorker.getRegistration();if(reg){await reg.update();const worker=reg.installing||reg.waiting;if(worker&&worker.state!=='activated')await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Обновление ещё загружается. Повторите позже.')),20000);worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timeout);resolve();}else if(worker.state==='redundant'){clearTimeout(timeout);reject(Error('Загрузка обновления прервана'));}});worker.postMessage({type:'SKIP_WAITING'});});}
 location.replace('./?update='+Date.now());
 }catch(e){$('update-status').textContent=e.message;$('apply-update').disabled=false;}
};
// Optional local UI lock; the device key is deliberately retained for background push.
// It is not claimed to be cryptographic protection against browser-storage access.
window.pinEnabled=false;
async function pinStatus(){window.pinEnabled=!!await BridgeDB.get('pinLock');$('pin-status').textContent=window.pinEnabled?'Включён · блокировка при сворачивании':'Выключен · вход без PIN';$('lock').hidden=!window.pinEnabled;}
async function pinDigest(pin,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);return Array.from(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:600000,salt:new Uint8Array(salt)},key,256))).join(',');}
async function verifyPin(pin){const lock=await BridgeDB.get('pinLock');if(!lock)return true;if(Date.now()<(lock.until||0))throw Error('Слишком много попыток. Попробуйте позже.');const valid=await pinDigest(pin,lock.salt)===lock.hash;if(!valid){lock.attempts=(lock.attempts||0)+1;lock.until=Date.now()+Math.min(300000,1000*2**Math.min(lock.attempts,9));await BridgeDB.set('pinLock',lock);throw Error('Неверный PIN. Подождите перед повтором.');}lock.attempts=0;lock.until=0;await BridgeDB.set('pinLock',lock);return true;}
async function verifyCurrent(){if(await BridgeDB.get('pinLock')){const pin=prompt('Введите текущий PIN');if(pin===null)return false;await verifyPin(pin);}return true;}
$('set-pin').onclick=()=>action(async()=>{const pin=$('new-pin').value;if(!/^\d{4}$/.test(pin)||pin!==$('repeat-pin').value)throw Error('Введите четыре цифры и повторите тот же PIN.');if(!await verifyCurrent())return;const salt=Array.from(crypto.getRandomValues(new Uint8Array(16)));await BridgeDB.set('pinLock',{salt,hash:await pinDigest(pin,salt),attempts:0,until:0});$('new-pin').value=$('repeat-pin').value='';await pinStatus();say('PIN включён.');});
$('disable-pin').onclick=()=>action(async()=>{if(!await verifyCurrent())return;await BridgeDB.set('pinLock',null);await pinStatus();say('PIN отключён.');});
window.showPinGate=async key=>{
 window.pinEnabled=true;$('auth-note').textContent='Если PIN забыт, сброс удалит историю и подключение на этом устройстве.';$('reset-vault').textContent='Забыли PIN? Сбросить клиент';$('auth').hidden=false;$('application').hidden=true;$('auth-title').textContent='Введите PIN';$('auth-help').textContent='Четыре цифры для входа на этом устройстве.';$('password').minLength=4;$('password').maxLength=4;$('password').inputMode='numeric';$('unlock').textContent='Открыть';
 $('auth-form').onsubmit=async e=>{e.preventDefault();$('unlock').disabled=true;try{await verifyPin($('password').value);await openClient(key);await pinStatus();}catch(e){$('auth-error').textContent=e.message;}finally{$('unlock').disabled=false;}};
};
$('lock').onclick=()=>{const key=privateKey;lock();window.showPinGate(key);};
