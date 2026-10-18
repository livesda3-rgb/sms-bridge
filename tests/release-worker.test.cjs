const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const origin='https://example.com/sms-bridge/';
function harness(valid=true){const events={},data=new Map(),deleted=[];let activated=0;
 const cache={async addAll(requests){for(const r of requests){const p=new URL(r.url).pathname.replace('/sms-bridge/','');const text=p==='index.html'&&!valid?'old-shell':fs.readFileSync('docs/'+(p||'index.html'));data.set(r.url,new Response(text));}},async match(key){return data.get(new URL(typeof key==='string'?key:key.url,origin).href)?.clone();}};
 const self={location:{origin:'https://example.com'},registration:{scope:origin},addEventListener:(n,f)=>events[n]=f,skipWaiting:async()=>activated++,clients:{claim:async()=>{}}};
 const requests=[];vm.runInNewContext(fs.readFileSync('docs/sw.js','utf8'),{self,URL,importScripts(){},Request:class extends Request{constructor(value,opts){super(typeof value==='string'?new URL(value,origin):value,opts);}},caches:{open:async()=>cache,keys:async()=>['sms-bridge-shell-v10','sms-bridge-shell-v11','smsbridge-beta-ui-0.8.2-beta.3'],delete:async key=>deleted.push(key)},fetch:async r=>{requests.push(r.url);throw Error('offline');}});
 async function event(name,arg={}){let pending;events[name]({...arg,waitUntil:p=>pending=p,respondWith:p=>pending=p});return await pending;}
 return {data,event,requests,deleted,activated:()=>activated};
}
test('0.8.2 worker installs complete immutable assets and serves its own shell offline',async()=>{
 const h=harness();await h.event('install');assert.equal(h.activated(),1);
 const html=await (await h.event('fetch',{request:{url:origin,method:'GET',mode:'navigate'}})).text();assert.match(html,/content="0.8.2"/);assert.equal(h.requests.length,0);
 for(const match of html.matchAll(/(?:src|href)="(\.\/releases\/0\.8\.[012]\/[^\"]+)"/g))assert.ok(h.data.has(new URL(match[1],origin).href),match[1]);
 await h.event('activate');assert.deepEqual(h.deleted,['sms-bridge-shell-v10']);
});
test('0.8.2 worker refuses an incomplete deployment and never claims beta navigation',async()=>{
 const h=harness(false);await assert.rejects(h.event('install'),/Incomplete release/);assert.equal(h.activated(),0);
 assert.equal(await h.event('fetch',{request:{url:origin+'beta/',method:'GET',mode:'navigate'}}),undefined);
});
