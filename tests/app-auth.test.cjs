const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function harness(){
 const elements=new Map(),listeners={};function element(){return {value:'',hidden:false,disabled:false,checked:false,textContent:'',children:[],classList:{toggle(){}},replaceChildren(...x){this.children=x;},append(...x){this.children.push(...x);},add(x){this.children.push(x);},focus(){}};}
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};get('application').hidden=true;
 const document={hidden:false,getElementById:get,createElement:element,addEventListener:(n,fn)=>{const old=listeners[n];listeners[n]=()=>{old?.();fn();};}};
 const settings=new Map([['vault',{version:1}],['source',null]]);let permissionCalls=0;
 const registration={pushManager:{getSubscription:async()=>null}};
 const context=vm.createContext({document,window:{addEventListener(){}},navigator:{serviceWorker:{register:async()=>({}),ready:Promise.resolve(registration),addEventListener(){}}},BridgeDB:{get:async k=>settings.get(k),list:async()=>[],set:async(k,v)=>settings.set(k,v)},BridgeVault:{unlock:async()=>{throw Error('Неверный пароль');}},BridgeCore:require('../docs/core.js'),BridgeQR:{stop(){},draw(){}},setInterval,clearInterval,isSecureContext:true,Notification:{permission:'default',requestPermission:async()=>{permissionCalls++;return 'granted';}},crypto:require('node:crypto').webcrypto,Option:function(text,value){this.value=value;},location:{reload(){}},localStorage:{setItem(){}},confirm:()=>false,console,atob});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../docs/app.js'),'utf8'),context);
 return {context,document,get,listeners,permissionCalls:()=>permissionCalls};
}
test('locked client cannot subscribe, wrong password keeps history hidden',async()=>{
 const h=harness();await new Promise(setImmediate);await h.get('connect').onclick();assert.equal(h.permissionCalls(),0);
 h.get('password').value='wrong-password';await h.get('auth-form').onsubmit({preventDefault(){}});assert.equal(h.get('application').hidden,true);assert.match(h.get('auth-error').textContent,/Неверный пароль/);
});
test('explicit reset lock clears DOM and prevents an in-flight decrypt from restoring plaintext',async()=>{
 const h=harness();await new Promise(setImmediate);let release;
 h.context.BridgeDB.list=async()=>[{id:'encrypted'}];h.context.BridgeVault.open=()=>new Promise(r=>release=r);
 vm.runInContext("privateKey={};rows=[{body:'secret'}];",h.context);h.get('messages').children=['secret'];const refresh=vm.runInContext('refresh()',h.context);await new Promise(setImmediate);
 vm.runInContext('lock()',h.context);release({id:'m',body:'secret'});await refresh;
 assert.equal(h.get('application').hidden,true);assert.equal(h.get('auth').hidden,false);assert.equal(h.get('messages').children.length,0);assert.equal(vm.runInContext('rows.length',h.context),0);
});
test('locking while QR frames are generated cannot restore pairing QR',async()=>{
 const h=harness();await new Promise(setImmediate);let resolve;
 h.context.BridgeQR.frames=()=>new Promise(r=>resolve=r);
 vm.runInContext('privateKey={}',h.context);h.get('export').value='{}';
 const pending=vm.runInContext('showRecipientQR({expiresAt:Date.now()+60000})',h.context);
 vm.runInContext('lock()',h.context);resolve(['frame']);await pending;
 assert.equal(h.get('recipient-qr').hidden,true);assert.equal(h.get('recipient-qr').width,0);assert.equal(h.get('qr-controls').hidden,true);
});
test('backgrounding the client no longer locks the session',async()=>{
 const h=harness();await new Promise(setImmediate);vm.runInContext('privateKey={}',h.context);h.get('application').hidden=false;h.get('auth').hidden=true;
 h.document.hidden=true;h.listeners.visibilitychange();assert.equal(h.get('application').hidden,false);assert.equal(h.get('auth').hidden,true);assert.equal(vm.runInContext('!!privateKey',h.context),true);
});
test('remembered device key opens existing history without password',async()=>{
 const h=harness();await new Promise(setImmediate);let decryptCalls=0;
 h.context.BridgeDB.get=async k=>k==='vault'?{id:'v'}:k==='deviceAccess'?{vaultId:'v',key:{}}:null;
 h.context.BridgeDB.list=async()=>[{encrypted:true,id:'m'}];h.context.BridgeVault.open=async()=>{decryptCalls++;return {id:'m',simId:'s',simName:'SIM',sender:'Test',body:'hello',receivedAt:Date.now()};};
 await vm.runInContext('authInit()',h.context);assert.ok(decryptCalls);assert.equal(h.get('auth').hidden,true);assert.equal(h.get('application').hidden,false);
});
test('new installation creates device access and opens without asking for password',async()=>{
 const h=harness();await new Promise(setImmediate);const settings=new Map();
 h.context.BridgeDB.get=async k=>settings.get(k);h.context.BridgeDB.createVault=async(record,key)=>{settings.set('vault',record);settings.set('deviceAccess',{vaultId:record.id,key});return true;};h.context.BridgeVault.create=async()=>({record:{id:'new'},privateKey:{}});
 await vm.runInContext('authInit()',h.context);assert.equal(h.get('auth').hidden,true);assert.equal(h.get('application').hidden,false);assert.equal(settings.get('deviceAccess').vaultId,'new');
});
