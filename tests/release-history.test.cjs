const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {IDBFactory}=require('fake-indexeddb');
function harness(){const self={},context=vm.createContext({self,indexedDB:new IDBFactory()});for(const p of ['docs/db.js','docs/releases/0.8.0/history.js'])vm.runInContext(fs.readFileSync(p,'utf8'),context);return {db:self.BridgeDB,h:self.BridgeHistory};}
async function setup(){const x=harness();await x.db.set('vault',{id:'v'});await x.db.set('source',{sourceId:'home'});return x;}
const record=(id,group=id)=>({id,group,sourceId:'home',vaultId:'v',storedAt:Date.now(),encrypted:true});
test('0.8 upgrade preserves all 0.7 settings and encrypted data; read/unread retains v1 readIds',async()=>{
 const {db,h}=await setup();const preserved={recipientId:'recipient',deviceAccess:{vaultId:'v',key:'fixture'},invitation:{pairingToken:'fixture'},theme:'dark',pinLock:{hash:'fixture'},notificationMode:'sender'};
 for(const [k,v] of Object.entries(preserved))await db.set(k,v);await db.save(record('existing'));await db.set('readIds',['existing']);
 assert.equal(h.visible(await db.list(),[]).length,1);await h.change('unread',[{sourceId:'home',id:'existing'}],'v');assert.equal((await db.get('readIds')).length,0);
 await h.change('read',[{sourceId:'home',id:'existing'}],'v');assert.equal((await db.get('readIds'))[0],'existing');
 for(const [k,v] of Object.entries(preserved))assert.deepEqual(await db.get(k),v);assert.equal((await db.list())[0].id,'existing');
});
test('delete removes all stored parts; late segment and redelivery stay hidden; new SMS survives',async()=>{
 const {db,h}=await setup();await db.save(record('long-0','long'));await db.save(record('long-1','long'));await db.save(record('neighbor'));
 await h.change('delete',[{sourceId:'home',id:'long',messageId:'long'}],'v');assert.equal((await db.list()).length,1);
 await db.save(record('long-2','long'));await db.save(record('long-0','long'));await db.save(record('new-message'));
 const visible=h.visible(await db.list(),await db.get('deletedMessagesV1'));assert.equal(visible.length,2);assert.ok(visible.some(m=>m.id==='neighbor'));assert.ok(visible.some(m=>m.id==='new-message'));
});
test('bulk changes serialize, reject stale vault, and preserve unselected/newly arrived messages',async()=>{
 const {db,h}=await setup();await db.save(record('a'));await db.save(record('b'));
 await Promise.all([h.change('read',[{id:'a'}],'v'),h.change('read',[{id:'b'}],'v')]);assert.equal((await db.get('readIds')).length,2);
 await assert.rejects(h.change('delete',[{sourceId:'home',id:'a'}],'stale'));assert.equal((await db.list()).length,2);
 await Promise.all([h.change('delete',[{sourceId:'home',id:'a'}],'v'),db.save(record('new'))]);assert.equal((await db.list()).length,2);
 assert.notEqual(h.identity({sourceId:'other',id:'a'}),h.identity({sourceId:'home',id:'a'}));
});
