const {test}=require('node:test');const assert=require('node:assert/strict');const core=require('../docs/core.js');const {setup,message}=core;const {generateKeyPairSync}=require('node:crypto');
const jwk=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'jwk'});const publicKey=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url');
const config={version:1,type:'sms-bridge-source',sourceId:'home',name:'Дом',publicKey};
const sms={version:1,type:'sms',sourceId:'home',id:'1',simId:'sim1',simName:'Личная',sender:'BANK',body:'Код 123456',receivedAt:Date.now()};
test('valid uncompressed P256 setup and stripping unknown fields',()=>assert.deepEqual(setup({...config,privateKey:'not retained'}),config));
test('reject malformed keys and setups',()=>{for(const v of [null,{}, {...config,publicKey:'abc'},{...config,publicKey:Buffer.alloc(65).toString('base64url')}])assert.throws(()=>setup(v));});
test('accept alphanumeric and short senders and Unicode',()=>{assert.equal(message(sms,'home').body,sms.body);assert.equal(message({...sms,sender:'900'},'home').sender,'900');});
test('reject wrong source and invalid or oversized payload',()=>{for(const v of [{...sms,sourceId:'other'},{...sms,receivedAt:NaN},{...sms,body:'x'.repeat(16001)},{...sms,simId:''},null])assert.throws(()=>message(v,'home'));});
test('message text stays literal, unknown fields stripped',()=>{const m=message({...sms,body:'<img src=x onerror=alert(1)>',extra:'drop'},'home');assert.equal(m.body,'<img src=x onerror=alert(1)>');assert.equal(m.extra,undefined);});

test('multipart SMS assembles out of order and marks missing pieces',()=>{
 const common={version:1,type:'sms',sourceId:'home',simId:'s',simName:'SIM',sender:'BANK',receivedAt:Date.now(),messageId:'msg',partCount:2};
 const a=core.message({...common,id:'msg-0',partIndex:0,body:'А🔐'},'home'),b=core.message({...common,id:'msg-1',partIndex:1,body:'Б'},'home');
 assert.equal(core.assemble([b,a])[0].body,'А🔐Б');assert.equal(core.assemble([a])[0].incomplete,true);
 assert.throws(()=>core.message({...common,id:'msg-7',partIndex:7,body:'x'},'home'));
});

test('assembled SMS reports arrival of the last received part',()=>{
 const parts=[0,1].map(i=>({id:'group-'+i,messageId:'group',sourceId:'home',partIndex:i,partCount:2,sender:'TEST',simId:'sim',receivedAt:100,storedAt:i===0?300:200,body:String(i)}));
 const result=core.assemble(parts);assert.equal(result[0].storedAt,300);assert.equal(result[0].body,'01');
});
