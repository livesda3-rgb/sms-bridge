(function (root) {
  'use strict';
  const open = () => new Promise((resolve,reject) => {
    const r=indexedDB.open('sms-bridge-client',1);
    r.onupgradeneeded=()=>{r.result.createObjectStore('settings');r.result.createObjectStore('messages',{keyPath:'id'});};
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
  async function run(store, mode, action) {
    const db=await open();
    return new Promise((resolve,reject)=>{let value; const tx=db.transaction(store,mode); const s=tx.objectStore(store); action(s,v=>{value=v;}); tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error||Error('Хранилище недоступно'));};});
  }
  const get=key=>run('settings','readonly',(s,done)=>{s.get(key).onsuccess=e=>done(e.target.result);});
  const set=(key,v)=>run('settings','readwrite',s=>s.put(v,key));
  const list=()=>run('messages','readonly',(s,done)=>{s.getAll().onsuccess=e=>done(e.target.result.sort((a,b)=>b.receivedAt-a.receivedAt));});
  // Deduplication and bounded retention are atomic in a single transaction.
  const save=v=>run('messages','readwrite',(s,done)=>{s.get(v.id).onsuccess=e=>{if(e.target.result){done(false);return;}s.put(v);done(true);s.getAll().onsuccess=e=>{const rows=e.target.result.sort((a,b)=>b.storedAt-a.storedAt);rows.slice(200).forEach(x=>s.delete(x.id));};};});
  root.BridgeDB={get,set,list,save,clear:()=>run('messages','readwrite',s=>s.clear())};
})(self);
