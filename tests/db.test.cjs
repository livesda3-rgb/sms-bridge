const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const {IDBFactory}=require('fake-indexeddb');
function database(){const self={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../docs/db.js'),'utf8'),{self,indexedDB:new IDBFactory()});return self.BridgeDB;}
const record=(id,group=id)=>({id,group,sourceId:'home',vaultId:'vault1',storedAt:Date.now(),encrypted:true,ciphertext:'encrypted-example'});
test('vault creation is atomic across competing tabs',async()=>{const d=database();const results=await Promise.all([d.createVault({id:'a'}),d.createVault({id:'b'})]);assert.equal(results.filter(Boolean).length,1);assert.equal((await d.get('vault')).id,'a');});
test('database deduplicates encrypted records and rejects writes after reset or disconnect',async()=>{
 const d=database();await d.set('vault',{id:'vault1'});await d.set('source',{sourceId:'home'});
 assert.equal(await d.save(record('one')),true);assert.equal(await d.save(record('one')),false);assert.equal((await d.list()).length,1);
 await d.set('source',null);assert.equal(await d.save(record('two')),false);
 await d.reset();assert.equal(await d.save(record('late-worker')),false);assert.equal((await d.list()).length,0);assert.equal(await d.get('vault'),undefined);
});
test('retention counts messages, retaining all parts of the newest 200 groups',async()=>{
 const d=database();await d.set('vault',{id:'vault1'});await d.set('source',{sourceId:'home'});
 for(let i=0;i<201;i++)for(let part=0;part<2;part++)await d.save({...record(i+'-'+part,'g'+i),storedAt:i*2+part});
 const rows=await d.list();assert.equal(rows.length,400);assert.equal(rows.filter(x=>x.group==='g0').length,0);assert.equal(rows.filter(x=>x.group==='g200').length,2);
});
