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
  const list=()=>run('messages','readonly',(s,done)=>{s.getAll().onsuccess=e=>done(e.target.result.sort((a,b)=>b.storedAt-a.storedAt));});
  // Deduplication and bounded retention are atomic in a single transaction.
  // Check vault and source in the same transaction as the write: a reset or
  // disconnect must not let an already-running worker resurrect old history.
  const save=async v=>{
    const db=await open();return new Promise((resolve,reject)=>{
      let added=false;const tx=db.transaction(['settings','messages'],'readwrite'),settings=tx.objectStore('settings'),s=tx.objectStore('messages');
      settings.get('vault').onsuccess=e=>{if(!e.target.result||e.target.result.id!==v.vaultId)return;
        settings.get('source').onsuccess=e=>{if(e.target.result?.sourceId!==v.sourceId)return;
          s.get(v.id).onsuccess=e=>{if(e.target.result)return;s.put(v);added=true;s.getAll().onsuccess=e=>{const rows=e.target.result.sort((a,b)=>b.storedAt-a.storedAt);const keep=new Set(rows.map(x=>x.group||x.id).filter((x,i,a)=>a.indexOf(x)===i).slice(0,200));rows.filter(x=>!keep.has(x.group||x.id)).forEach(x=>s.delete(x.id));};};
        };
      };
      tx.oncomplete=()=>{db.close();resolve(added);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error||Error('Хранилище недоступно'));};
    });
  };
  const createVault=(record,key)=>run('settings','readwrite',(s,done)=>{s.get('vault').onsuccess=e=>{if(e.target.result){done(false);return;}s.put(record,'vault');if(key)s.put({vaultId:record.id,key},'deviceAccess');done(true);};});
  const rememberKey=(vaultId,key)=>run('settings','readwrite',(s,done)=>{s.get('vault').onsuccess=e=>{if(e.target.result?.id!==vaultId){done(false);return;}s.put({vaultId,key},'deviceAccess');done(true);};});
  root.BridgeDB={get,set,list,save,createVault,rememberKey,replace:v=>run('messages','readwrite',s=>s.put(v)),reset:async()=>{const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['messages','settings'],'readwrite');tx.objectStore('messages').clear();tx.objectStore('settings').clear();tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});},clear:()=>run('messages','readwrite',s=>s.clear())};
})(self);
