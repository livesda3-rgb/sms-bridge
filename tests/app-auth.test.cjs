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
test('background lock clears DOM and prevents an in-flight decrypt from restoring plaintext',async()=>{
 const h=harness();await new Promise(setImmediate);let release;
 h.context.BridgeDB.list=async()=>[{id:'encrypted'}];h.context.BridgeVault.open=()=>new Promise(r=>release=r);
 vm.runInContext("privateKey={};rows=[{body:'secret'}];",h.context);h.get('messages').children=['secret'];const refresh=vm.runInContext('refresh()',h.context);await new Promise(setImmediate);
 h.document.hidden=true;h.listeners.visibilitychange();release({id:'m',body:'secret'});await refresh;
 assert.equal(h.get('application').hidden,true);assert.equal(h.get('auth').hidden,false);assert.equal(h.get('messages').children.length,0);assert.equal(vm.runInContext('rows.length',h.context),0);
});
