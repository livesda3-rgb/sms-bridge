const {test}=require('node:test');const assert=require('node:assert/strict');const {setup,message}=require('../docs/core.js');const {generateKeyPairSync}=require('node:crypto');
const jwk=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'jwk'});const publicKey=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url');
const config={version:1,type:'sms-bridge-source',sourceId:'home',name:'Дом',publicKey};
const sms={version:1,type:'sms',sourceId:'home',id:'1',simId:'sim1',simName:'Личная',sender:'BANK',body:'Код 123456',receivedAt:Date.now()};
test('valid uncompressed P256 setup and stripping unknown fields',()=>assert.deepEqual(setup({...config,privateKey:'not retained'}),config));
test('reject malformed keys and setups',()=>{for(const v of [null,{}, {...config,publicKey:'abc'},{...config,publicKey:Buffer.alloc(65).toString('base64url')}])assert.throws(()=>setup(v));});
test('accept alphanumeric and short senders and Unicode',()=>{assert.equal(message(sms,'home').body,sms.body);assert.equal(message({...sms,sender:'900'},'home').sender,'900');});
test('reject wrong source and invalid or oversized payload',()=>{for(const v of [{...sms,sourceId:'other'},{...sms,receivedAt:NaN},{...sms,body:'x'.repeat(16001)},{...sms,simId:''},null])assert.throws(()=>message(v,'home'));});
test('message text stays literal, unknown fields stripped',()=>{const m=message({...sms,body:'<img src=x onerror=alert(1)>',extra:'drop'},'home');assert.equal(m.body,'<img src=x onerror=alert(1)>');assert.equal(m.extra,undefined);});
