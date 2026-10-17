const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {group}=require('../docs/beta/threads.js');
const m=(id,sourceId,simId,sender,time)=>({id,sourceId,simId,sender,receivedAt:time,body:id,simName:simId});
test('beta threads keep equal senders on different sources and SIMs separate',()=>{
 const rows=[m('a','home','1','Google',1),m('b','home','2','Google',2),m('c','office','1','Google',3),m('d','home','1','Google',4)];
 const result=group(rows,['a']);assert.equal(result.length,3);assert.deepEqual(result[0].messages.map(m=>m.id),['a','d']);assert.equal(result[0].unread,1);assert.equal(result[0].last.id,'d');
});
test('beta repeated delivery does not add messages or unread counts',()=>{
 const a=m('same','home','1','Google',1);assert.equal(group([a,a])[0].unread,1);assert.equal(group([a,a],['same'])[0].unread,0);
});
test('beta cache activation preserves stable and unrelated caches',async()=>{
 const callbacks={},deleted=[],keys=['sms-bridge-shell-v8','other-app','smsbridge-beta-ui-old','smsbridge-beta-ui-0.8.0-beta.3'];
 vm.runInNewContext(fs.readFileSync(require.resolve('../docs/beta/sw.js'),'utf8'),{self:{addEventListener:(n,f)=>callbacks[n]=f,clients:{claim:async()=>{}}},caches:{keys:async()=>keys,delete:async k=>deleted.push(k)}});
 let task;callbacks.activate({waitUntil:p=>task=p});await task;assert.deepEqual(deleted,['smsbridge-beta-ui-old']);assert.equal(callbacks.push,undefined);
});

function beta(saved,confirmed=true){
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,setAttribute(){},addEventListener(){},classList:{add(){},remove(){}},querySelector(){return {focus(){}}}});return elements.get(id);};
 let persisted=saved;const ctx=vm.createContext({localStorage:{getItem:()=>persisted,setItem:(_,v)=>persisted=v},document:{getElementById:element,addEventListener(){}},window:{addEventListener(){}},BridgeCore:require('../docs/beta/core.js'),BridgeThreads:require('../docs/beta/threads.js'),confirm:()=>confirmed,setTimeout:()=>0,clearTimeout(){},matchMedia:()=>({matches:true})});
 const source=fs.readFileSync(require.resolve('../docs/beta/app.js'),'utf8').split('document.documentElement.dataset.theme=state.theme;save();route();')[0];vm.runInContext(source,ctx);
 return {run:code=>vm.runInContext(code,ctx),saved:()=>persisted};
}
test('beta deleted threads stay deleted after reload and do not hide new SMS or another SIM',()=>{
 const b=beta();b.run(`deleteThreads(threads().filter(t=>t.sender==='Google'&&t.last.simId==='personal'))`);
 assert.equal(b.run(`threads().filter(t=>t.sender==='Google').length`),1);
 const restored=beta(b.saved());assert.equal(restored.run(`messages().some(m=>m.id==='google-1')`),false);
 restored.run(`state.extra.push({id:'new-google',sourceId:'demo-home',simId:'personal',sender:'Google',body:'New',receivedAt:Date.now()});save()`);
 assert.equal(restored.run(`threads().filter(t=>t.sender==='Google').length`),2);
 assert.equal(restored.run(`threads().find(t=>t.last.id==='new-google').unread`),1);
});
test('beta bulk read/unread statuses survive reload; deletion cancellation keeps data',()=>{
 const b=beta();b.run('markRead(threads())');assert.equal(b.run('threads().every(t=>t.unread===0)'),true);
 b.run(`markUnread(threads().filter(t=>t.sender==='Google'))`);const restored=beta(b.saved(),false);
 assert.equal(restored.run(`threads().filter(t=>t.sender==='Google').every(t=>t.unread===1)`),true);
 const count=restored.run('messages().length');assert.equal(restored.run('deleteThreads(threads())'),false);assert.equal(restored.run('messages().length'),count);
 b.run('deleteThreads(threads())');assert.equal(beta(b.saved()).run('messages().length'),0);
});
test('beta deletion identity includes source, SIM and sender',()=>{
 const b=beta();b.run(`state.extra=[{id:'shared',sourceId:'a',simId:'1',sender:'X',body:'a',receivedAt:1},{id:'shared',sourceId:'b',simId:'1',sender:'X',body:'b',receivedAt:2}];deleteThreads(threads().filter(t=>t.last.sourceId==='a'))`);
 assert.equal(b.run(`messages().some(m=>m.sourceId==='b'&&m.id==='shared')`),true);
 assert.equal(b.run(`messages().some(m=>m.sourceId==='a'&&m.id==='shared')`),false);
});
