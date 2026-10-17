'use strict';
// Deliberately outside the stable worker's sms-bridge-shell-* cleanup prefix.
const CACHE='smsbridge-beta-ui-0.8.0-beta.3';
const ASSETS=['./','./index.html','./style.css?v=0.8.0-beta.3','./app.js?v=0.8.0-beta.3','./core.js','./threads.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('smsbridge-beta-ui-')&&k!==CACHE)await caches.delete(k);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url),scope=new URL(self.registration.scope);if(e.request.method!=='GET'||u.origin!==scope.origin||!u.pathname.startsWith(scope.pathname))return;
 if(!ASSETS.some(a=>new URL(a,scope).pathname===u.pathname))return;
 e.respondWith((async()=>{const c=await caches.open(CACHE);if(e.request.mode==='navigate'){try{const r=await fetch(new Request(e.request,{cache:'no-store'}));if(r.ok){await c.put('./index.html',r.clone());return r;}}catch{}return await c.match('./index.html');}return await c.match(e.request)||fetch(e.request);})());
});
// No push subscription, no access to the stable client's database.
