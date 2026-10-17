(function (root) {
  'use strict';
  const bounded = (v, n) => typeof v === 'string' && v.length > 0 && v.length <= n;
  function setup(v) {
    if (!v || v.version !== 1 || v.type !== 'sms-bridge-source' || !bounded(v.sourceId, 128) || !bounded(v.name, 80) || !/^[A-Za-z0-9_-]{87}$/.test(v.publicKey || '')) throw Error('Неверные данные подключения из APK.');
    const key = Uint8Array.from(atob(v.publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='), c => c.charCodeAt(0));
    if (key.length !== 65 || key[0] !== 4) throw Error('Неверный открытый ключ.');
    return { version: 1, type: v.type, sourceId: v.sourceId, name: v.name, publicKey: v.publicKey };
  }
  function message(v, sourceId) {
    if (!v || v.version !== 1 || v.type !== 'sms' || v.sourceId !== sourceId || !bounded(v.id, 128) || !bounded(v.simId, 128) || !bounded(v.simName, 80) || !bounded(v.sender, 160) || !bounded(v.body, 16000) || !Number.isSafeInteger(v.receivedAt) || v.receivedAt < 0 || v.receivedAt > Date.now() + 86400000) throw Error('Неверное сообщение или неизвестный источник.');
    if(v.partCount!==undefined&&(!Number.isInteger(v.partCount)||v.partCount<1||v.partCount>100||!Number.isInteger(v.partIndex)||v.partIndex<0||v.partIndex>=v.partCount||!bounded(v.messageId,128)||v.id!==v.messageId+'-'+v.partIndex))throw Error('Неверная часть SMS.');
    return {messageId:v.messageId,partIndex:v.partIndex,partCount:v.partCount,version:1,type:'sms',id:v.id,sourceId:v.sourceId,simId:v.simId,simName:v.simName,sender:v.sender,body:v.body,receivedAt:v.receivedAt,storedAt:Date.now()};
  }
  function assemble(parts){
    const groups=new Map(),out=[];
    for(const p of parts){if(!p.partCount){out.push(p);continue;}const key=p.sourceId+':'+p.messageId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
    for(const group of groups.values()){
      group.sort((a,b)=>a.partIndex-b.partIndex);const a=group[0],complete=group.length===a.partCount&&group.every((p,i)=>p.partIndex===i&&p.partCount===a.partCount&&p.sender===a.sender&&p.simId===a.simId&&p.receivedAt===a.receivedAt);
      out.push({...a,storedAt:Math.max(...group.map(p=>p.storedAt||0)),id:a.messageId,body:complete?group.map(p=>p.body).join(''):'Сообщение загружается: получено частей '+group.length+' из '+a.partCount+'.',incomplete:!complete});
    }
    return out.sort((a,b)=>b.receivedAt-a.receivedAt);
  }
  root.BridgeCore = { setup, message, assemble };
  if (typeof module !== 'undefined') module.exports = root.BridgeCore;
})(typeof self !== 'undefined' ? self : globalThis);
