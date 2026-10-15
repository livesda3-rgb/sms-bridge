const {test}=require('node:test'),assert=require('node:assert/strict');global.crypto=require('node:crypto').webcrypto;const vault=require('../docs/vault.js');
test('password vault encrypts incoming SMS while locked; wrong password and tampering fail',async()=>{
 const {record,privateKey}=await vault.create('мой-сложный-пароль');
 const m={id:'m1',messageId:'group',storedAt:Date.now(),body:'секретный код',sender:'BANK'};
 const sealed=await vault.seal(record,m);assert.ok(!JSON.stringify(sealed).includes(m.body));assert.ok(!JSON.stringify(record).includes('PRIVATE KEY'));assert.equal(record.publicKey.d,undefined);
 assert.deepEqual(await vault.open(privateKey,sealed),m);
 await assert.rejects(vault.unlock(record,'чужой-пароль'));
 assert.deepEqual(await vault.open(await vault.unlock(record,'мой-сложный-пароль'),sealed),m);
 await assert.rejects(vault.open(privateKey,{...sealed,id:'changed'}));
 await assert.rejects(vault.open(privateKey,{...sealed,ciphertext:sealed.ciphertext.slice(0,-4)+'AAAA'}));
 await assert.rejects(vault.create('1234'));
});
