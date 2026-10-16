'use strict';
importScripts('./core.js','./db.js','./vault.js');
const CACHE='sms-bridge-shell-v8';
const ASSETS=['./','./index.html','./style.css?v=0.7.1','./app.js?v=0.7.1','./ui.js?v=0.7.1','./qr.js?v=0.7.1','./vendor/qrcode.js?v=0.7.1','./vendor/jsqr.js?v=0.7.1','./core.js?v=0.7.1','./db.js?v=0.7.1','./vault.js?v=0.7.1','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('sms-bridge-shell-')&&k!==CACHE)await caches.delete(k);await self.clients.claim();})()));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;
 const scope=new URL(self.registration.scope);if(!u.pathname.startsWith(scope.pathname))return;
 const shell=ASSETS.find(a=>new URL(a,scope).pathname===u.pathname);
 if(!shell)return;
 e.respondWith((async()=>{const cache=await caches.open(CACHE);
 if(e.request.mode==='navigate'){try{const r=await fetch(new Request(e.request,{cache:'no-store'}));if(r.ok){await cache.put('./index.html',r.clone());return r;}}catch{}return (await cache.match('./index.html'))||cache.match('./');}
 const cached=await cache.match(e.request);if(cached)return cached;
 return fetch(new Request(e.request,{cache:'no-store'}));})());
});
self.addEventListener('push',e=>e.waitUntil((async()=>{
 let body='Откройте приложение, чтобы прочитать сообщение.';
 try {
  const cfg=await BridgeDB.get('source');
  const msg=BridgeCore.message(e.data.json(),cfg?.sourceId);
  const vault=await BridgeDB.get('vault');if(!vault)throw Error('Настройте пароль клиента');
  await BridgeDB.save(await BridgeVault.seal(vault,msg));
  const mode=await BridgeDB.get('notificationMode');if(mode==='sender')body=msg.sender;
  if(mode==='full'||(!mode&&await BridgeDB.get('preview')))body=msg.partCount>1?'Длинное SMS: часть '+(msg.partIndex+1)+' из '+msg.partCount:msg.sender+': '+msg.body.slice(0,180);
  await self.registration.showNotification('SMS Bridge · '+msg.simName,{body,tag:msg.messageId||msg.id,icon:'./icon-192.png',data:{id:msg.id}});
 } catch {await self.registration.showNotification('SMS Bridge',{body:'Не удалось сохранить сообщение. Проверьте подключение в приложении.',icon:'./icon-192.png'});}
 for(const c of await self.clients.matchAll({type:'window'}))c.postMessage({type:'messages-updated'});
})()));
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil((async()=>{const url=new URL('./',self.registration.scope).href;for(const c of await self.clients.matchAll({type:'window'})){if(c.url.startsWith(self.registration.scope)){await c.focus();c.postMessage({type:'messages-updated'});return;}}await self.clients.openWindow(url);})());});
self.addEventListener('pushsubscriptionchange',e=>e.waitUntil(BridgeDB.set('needsRepair',true)));
