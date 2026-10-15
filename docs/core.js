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
    return {version:1,type:'sms',id:v.id,sourceId:v.sourceId,simId:v.simId,simName:v.simName,sender:v.sender,body:v.body,receivedAt:v.receivedAt,storedAt:Date.now()};
  }
  root.BridgeCore = { setup, message };
  if (typeof module !== 'undefined') module.exports = root.BridgeCore;
})(typeof self !== 'undefined' ? self : globalThis);
