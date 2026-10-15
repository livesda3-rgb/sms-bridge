'use strict';
importScripts('./core.js','./db.js','./vault.js','./vault.js');
const CACHE='sms-bridge-shell-v3';
const ASSETS=['./','./index.html','./style.css','./app.js','./core.js','./db.js','./vault.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('sms-bridge-shell-')&&k!==CACHE)await caches.delete(k);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return; const paths=ASSETS.map(x=>new URL(x,self.registration.scope).href);if(!paths.includes(e.request.url))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));});
self.addEventListener('push',e=>e.waitUntil((async()=>{
 let body='Откройте приложение, чтобы прочитать сообщение.';
 try {
  const cfg=await BridgeDB.get('source');
  const msg=BridgeCore.message(e.data.json(),cfg?.sourceId);
  const vault=await BridgeDB.get('vault');if(!vault)throw Error('Настройте пароль клиента');
  await BridgeDB.save(await BridgeVault.seal(vault,msg));
  if(await BridgeDB.get('preview'))body=msg.partCount>1?'Длинное SMS: часть '+(msg.partIndex+1)+' из '+msg.partCount:msg.sender+': '+msg.body.slice(0,180);
  await self.registration.showNotification('SMS Bridge · '+msg.simName,{body,tag:msg.messageId||msg.id,icon:'./icon-192.png',data:{id:msg.id}});
 } catch {await self.registration.showNotification('SMS Bridge',{body:'Не удалось сохранить сообщение. Проверьте подключение в приложении.',icon:'./icon-192.png'});}
 for(const c of await self.clients.matchAll({type:'window'}))c.postMessage({type:'messages-updated'});
})()));
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil((async()=>{const url=new URL('./',self.registration.scope).href;for(const c of await self.clients.matchAll({type:'window'})){if(c.url.startsWith(self.registration.scope)){await c.focus();c.postMessage({type:'messages-updated'});return;}}await self.clients.openWindow(url);})());});
self.addEventListener('pushsubscriptionchange',e=>e.waitUntil(BridgeDB.set('needsRepair',true)));
