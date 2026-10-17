(function(root){
 'use strict';
 const identity=m=>JSON.stringify([m.sourceId,m.group||m.messageId||m.id]);
 const visible=(records,deleted)=>{const hidden=new Set(deleted);return records.filter(m=>!hidden.has(identity(m)));};
 // Metadata is additive. Database version, stores, encrypted records and keys stay v1.
 function change(action,messages,vaultId){
  if(!['read','unread','delete'].includes(action))return Promise.reject(Error('Неизвестное действие'));
  const keys=new Set(messages.map(identity)),ids=new Set(messages.map(m=>m.id));
  return new Promise((resolve,reject)=>{
   const request=indexedDB.open('sms-bridge-client',1);
   request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{
    const db=request.result,tx=db.transaction(['settings','messages'],'readwrite'),settings=tx.objectStore('settings'),records=tx.objectStore('messages');let result,error;
    settings.get('vault').onsuccess=e=>{
     if(!vaultId||e.target.result?.id!==vaultId){error=Error('Хранилище изменилось. Перезапустите клиент.');tx.abort();return;}
     settings.get('readIds').onsuccess=e=>{
      const read=new Set(e.target.result||[]);
      if(action==='read')for(const id of ids)read.add(id);else for(const id of ids)read.delete(id);
      result=[...read];settings.put(result,'readIds');
      if(action==='delete')settings.get('deletedMessagesV1').onsuccess=e=>{
       const hidden=new Set(e.target.result||[]);for(const key of keys)hidden.add(key);settings.put([...hidden],'deletedMessagesV1');
       // Remove only the captured logical messages, including every stored multipart segment.
       records.getAll().onsuccess=e=>{for(const record of e.target.result)if(keys.has(identity(record)))records.delete(record.id);};
      };
     };
    };
    tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(error||tx.error||Error('Изменение истории отменено'));};
   };
  });
 }
 root.BridgeHistory={identity,visible,change};
 if(typeof module!=='undefined')module.exports=root.BridgeHistory;
})(typeof self!=='undefined'?self:globalThis);
