const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{IDBFactory}=require('fake-indexeddb'),{webcrypto}=require('node:crypto');
const vault=require('../docs/vault.js');
const pause=()=>new Promise(r=>setTimeout(r,10));
async function until(check){for(let i=0;i<150;i++){if(check())return;await pause();}assert.fail('UI did not reach expected state');}
async function fixture(){
 const factory=new IDBFactory(),self={};vm.runInNewContext(fs.readFileSync('docs/db.js','utf8'),{self,indexedDB:factory});const db=self.BridgeDB;
 const {record,privateKey}=await vault.create('fixture-password');await db.createVault(record,privateKey);
 const key=new Uint8Array(65);key[0]=4;const publicKey=Buffer.from(key).toString('base64url');await db.set('source',{sourceId:'home',name:'Домашний телефон',publicKey});
 await db.set('recipientId','existing-recipient');await db.set('invitation',{expiresAt:1,pairingToken:'existing-token'});await db.set('theme','dark');await db.set('readIds',['old']);
 for(const [id,simId,sender] of [['old','1','Bank'],['new','1','Bank'],['neighbor','2','Bank']])await db.save(await vault.seal(record,{id,sourceId:'home',simId,simName:'SIM '+simId,sender,body:'fixture '+id,receivedAt:Date.now(),storedAt:Date.now()}));
 return {factory,db,record,key,privateKey};
}
async function open(f,locked=false){
 const dom=new JSDOM(fs.readFileSync('docs/index.html','utf8'),{url:'https://example.com/sms-bridge/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;let registrations=[],subscriptions=0,permissions=0;
 Object.defineProperty(w,'crypto',{value:webcrypto});Object.assign(w,{indexedDB:f.factory,TextEncoder,TextDecoder,isSecureContext:true,Notification:{permission:'granted',requestPermission:async()=>{permissions++;return 'granted';}},matchMedia:()=>({matches:true}),scrollTo(){},confirm:()=>true});
 const sub={options:{applicationServerKey:f.key.buffer},toJSON:()=>({endpoint:'https://example.com/push/existing'})},reg={pushManager:{getSubscription:async()=>sub,subscribe:async()=>{subscriptions++;return sub;}},update:async()=>{},showNotification:async()=>{}};
 Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async path=>{registrations.push(path);return reg;},ready:Promise.resolve(reg),addEventListener(){},getRegistration:async()=>reg}});
 for(const script of w.document.querySelectorAll('script[src]')){const path='docs/'+script.getAttribute('src').replace(/^\.\//,'').split('?')[0];vm.runInContext(fs.readFileSync(path,'utf8'),dom.getInternalVMContext(),{filename:path});}
 if(locked)await until(()=>w.document.getElementById('auth-title').textContent==='Введите PIN');else await until(()=>w.document.querySelectorAll('#threads .thread').length===(f.expectedThreads??2));
 await until(()=>w.document.getElementById('status').textContent.startsWith('Подписка создана'));
 return {dom,w,get:id=>w.document.getElementById(id),calls:()=>({registrations,subscriptions,permissions}),sub};
}
test('release starts over 0.7 data, retains subscription, uses production settings, and persists bulk actions',async()=>{
 const f=await fixture(),h=await open(f),{w,get}=h;
 try{
  assert.equal(get('application').hidden,false);assert.equal(w.document.documentElement.dataset.theme,'dark');assert.equal(get('status').textContent,'Подписка создана · доступ подтверждается в APK');
  assert.deepEqual(h.calls(),{registrations:['./sw.js'],subscriptions:0,permissions:0});assert.equal(w.document.querySelector('.brand img'),null);
  get('leading').click();assert.equal(get('selection-actions').disabled,true);w.document.querySelector('#threads .thread[aria-label^="Bank, SIM 1"]').click();get('selection-actions').click();assert.equal(get('actions-menu').hidden,false);get('action-read').click();await until(()=>!get('leading').textContent.includes('Отмена'));
  assert.ok((await f.db.get('readIds')).includes('new'));
  get('leading').click();w.document.querySelector('#threads .thread[aria-label^="Bank, SIM 1"]').click();get('action-unread').click();await until(()=>!get('leading').textContent.includes('Отмена'));assert.ok(!(await f.db.get('readIds')).includes('old'));
  get('leading').click();w.document.querySelector('#threads .thread[aria-label^="Bank, SIM 1"]').click();get('action-delete').click();await until(()=>w.document.querySelectorAll('#threads .thread').length===1);assert.equal((await f.db.list()).length,1);
  w.location.hash='settings';await until(()=>get('main').contains(get('theme')));get('theme').value='light';get('theme').dispatchEvent(new w.Event('change'));await until(()=>w.document.documentElement.dataset.theme==='light');assert.equal(await f.db.get('theme'),'light');
  w.location.hash='sms';await until(()=>get('main').contains(get('scan-source')));assert.equal(get('config').value.includes('home'),true);
  w.location.hash='notifications';await until(()=>get('main').contains(get('notification-mode')));get('notification-mode').value='sender';get('notification-mode').dispatchEvent(new w.Event('change'));await until(()=>!w.eval('busy'));assert.equal(await f.db.get('notificationMode'),'sender');
  w.eval('lock()');assert.equal(get('main').textContent,'');assert.equal(get('application').hidden,true);assert.equal(get('config').value,'');assert.equal(get('export').value,'');
  assert.equal(await f.db.get('recipientId'),'existing-recipient');assert.equal((await f.db.get('deviceAccess')).vaultId,f.record.id);
 }finally{h.dom.window.close();}
 const reopened=await open({...f,expectedThreads:1}); assert.equal(reopened.w.document.documentElement.dataset.theme,'light'); assert.deepEqual(reopened.calls(),{registrations:['./sw.js'],subscriptions:0,permissions:0});
 const records=await f.db.list();assert.equal((await vault.open(f.privateKey,records[0])).id,'neighbor');
 reopened.dom.window.close();
});

test('existing PIN still gates 0.8 and background lock clears the new message UI',async()=>{
 const f=await fixture(),initial=await open(f);
 const salt=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16];
 const hash=await initial.w.eval('pinDigest("1234",'+JSON.stringify(salt)+')');await f.db.set('pinLock',{salt,hash,attempts:0,until:0});initial.dom.window.close();
 const h=await open(f,true);try{
  assert.equal(h.get('application').hidden,true);assert.equal(h.get('main').textContent,'');
  h.get('password').value='1234';await h.get('auth-form').onsubmit({preventDefault(){}});await until(()=>h.w.document.querySelectorAll('#threads .thread').length===2);
  Object.defineProperty(h.w.document,'hidden',{value:true,configurable:true});h.w.document.dispatchEvent(new h.w.Event('visibilitychange'));
  assert.equal(h.get('application').hidden,true);assert.equal(h.get('main').textContent,'');assert.equal(h.get('auth-title').textContent,'Введите PIN');
 }finally{h.dom.window.close();}
});
test('release swipe actions use real history while vertical scroll, cancellation and selection stay safe',async()=>{
 const f=await fixture(),h=await open(f),{w,get}=h;
 const current=()=>w.document.querySelector('#threads .thread[aria-label^="Bank, SIM 1"]');
 function touch(b,type,x=100,y=100){const e=new w.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:[{clientX:x,clientY:y}]});b.dispatchEvent(e);return e;}
 try{
  let b=current();touch(b,'touchstart');assert.equal(touch(b,'touchmove',105,155).defaultPrevented,false);touch(b,'touchend');assert.equal((await f.db.get('readIds')).includes('new'),false);
  touch(b,'touchstart');touch(b,'touchmove',190,102);touch(b,'touchend');await until(()=>current().getAttribute('aria-label')==='Bank, SIM 1');assert.equal((await f.db.get('readIds')).includes('new'),true);
  b=current();touch(b,'touchstart');touch(b,'touchmove',20,101);touch(b,'touchend');assert.ok(b.parentElement.classList.contains('revealed'));assert.equal((await f.db.list()).length,3);
  w.confirm=()=>false;await b.parentElement.querySelector('.swipe-delete').onclick();assert.equal((await f.db.list()).length,3);assert.ok(!b.parentElement.classList.contains('revealed'));
  touch(b,'touchstart');touch(b,'touchmove',190,101);touch(b,'touchcancel');assert.equal((await f.db.get('readIds')).includes('new'),true);
  get('leading').click();assert.equal(w.document.querySelectorAll('.swipe-delete').length,0);
 }finally{h.dom.window.close();}
});
test('0.8.1 scroll suppresses the following click, a fresh tap still works, including selection mode',async()=>{
 const f=await fixture(),h=await open(f),{w,get}=h;
 function touch(b,type,x=100,y=100){const e=new w.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:[{clientX:x,clientY:y}]});b.dispatchEvent(e);return e;}
 const row=()=>w.document.querySelector('#threads .thread[aria-label^="Bank, SIM 1"]');
 try{
  assert.equal(w.document.querySelector('.toolbar .brand small'),null);assert.equal(w.document.querySelector('#main .subtitle'),null);assert.equal(w.document.querySelector('.demo-controls'),null);
  let b=row();touch(b,'touchstart');assert.equal(touch(b,'touchmove',103,170).defaultPrevented,false);touch(b,'touchend');b.click();assert.equal(w.location.hash,'');assert.equal((await f.db.get('readIds')).includes('new'),false);
  touch(b,'touchstart');touch(b,'touchend');b.click();await until(()=>w.location.hash.startsWith('#thread/'));await until(()=>w.document.querySelector('.conversation'));await until(()=>!w.eval('busy'));await pause();
  w.location.hash='';await until(()=>w.document.querySelector('#threads'));get('leading').click();b=row();touch(b,'touchstart');touch(b,'touchmove',99,160);touch(b,'touchend');b.click();assert.equal(get('selection-count').textContent,'Выбрано: 0');
  touch(b,'touchstart');touch(b,'touchend');b.click();assert.equal(get('selection-count').textContent,'Выбрано: 1');
 }finally{h.dom.window.close();}
});
test('0.8.1 first outside click only dismisses either menu; inside actions and second click work',async()=>{
 const f=await fixture(),h=await open(f),{w,get}=h;
 const row=()=>w.document.querySelector('#threads .thread[aria-label^="Bank, SIM 1"]');
 try{
  get('menu-button').click();get('leading').click();assert.equal(get('menu-button').getAttribute('aria-expanded'),'false');assert.equal(get('leading').getAttribute('aria-pressed'),'false');
  get('menu-button').click();row().click();assert.equal(w.location.hash,'');assert.equal(get('menu-button').getAttribute('aria-expanded'),'false');assert.equal((await f.db.get('readIds')).includes('new'),false);
  row().click();await until(()=>w.location.hash.startsWith('#thread/'));await until(()=>w.document.querySelector('.conversation'));await pause();
  w.location.hash='';await until(()=>w.document.querySelector('#threads'));get('leading').click();row().click();get('selection-actions').click();
  const neighbor=()=>w.document.querySelector('#threads .thread[aria-label^="Bank, SIM 2"]');neighbor().click();assert.equal(get('selection-count').textContent,'Выбрано: 1');assert.equal(get('selection-actions').getAttribute('aria-expanded'),'false');
  neighbor().click();assert.equal(get('selection-count').textContent,'Выбрано: 2');get('selection-actions').click();get('action-read').click();await until(()=>!get('leading').textContent.includes('Отмена'));assert.equal((await f.db.get('readIds')).includes('neighbor'),true);
 }finally{h.dom.window.close();}
});
