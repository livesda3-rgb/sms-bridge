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
 const callbacks={},deleted=[],keys=['sms-bridge-shell-v8','other-app','smsbridge-beta-ui-old','smsbridge-beta-ui-0.8.0-beta.1'];
 vm.runInNewContext(fs.readFileSync(require.resolve('../docs/beta/sw.js'),'utf8'),{self:{addEventListener:(n,f)=>callbacks[n]=f,clients:{claim:async()=>{}}},caches:{keys:async()=>keys,delete:async k=>deleted.push(k)}});
 let task;callbacks.activate({waitUntil:p=>task=p});await task;assert.deepEqual(deleted,['smsbridge-beta-ui-old']);assert.equal(callbacks.push,undefined);
});
