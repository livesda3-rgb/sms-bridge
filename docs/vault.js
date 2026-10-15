(function(root){
 'use strict';
 const enc=new TextEncoder(),dec=new TextDecoder();
 const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
 const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const random=n=>crypto.getRandomValues(new Uint8Array(n));
 const aad=enc.encode('sms-bridge-vault-v1');
 async function passwordKey(password,salt,usage){
  const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,usage);
 }
 async function create(password){
  if(typeof password!=='string'||password.length<8)throw Error('Пароль должен содержать минимум 8 символов.');
  const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
  const salt=random(16),iv=random(12),key=await passwordKey(password,salt,['encrypt']);
  const raw=await crypto.subtle.exportKey('pkcs8',pair.privateKey);
  const wrapped=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,raw);
  const privateKey=await crypto.subtle.importKey('pkcs8',raw,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);
  new Uint8Array(raw).fill(0);
  return {record:{version:1,id:crypto.randomUUID(),salt:b64(salt),iv:b64(iv),wrapped:b64(wrapped),publicKey:await crypto.subtle.exportKey('jwk',pair.publicKey)},privateKey};
 }
 async function unlock(record,password){
  try{const key=await passwordKey(password,bytes(record.salt),['decrypt']);
   const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(record.iv),additionalData:aad},key,bytes(record.wrapped));
   const privateKey=await crypto.subtle.importKey('pkcs8',raw,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);new Uint8Array(raw).fill(0);return privateKey;
  }catch{throw Error('Неверный пароль или повреждено хранилище.');}
 }
 async function seal(record,message){
  const publicKey=await crypto.subtle.importKey('jwk',record.publicKey,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
  const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);const iv=random(12);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(message.id)},aes,enc.encode(JSON.stringify(message)));
  const key=await crypto.subtle.encrypt('RSA-OAEP',publicKey,await crypto.subtle.exportKey('raw',aes));
  return {id:message.id,vaultId:record.id,sourceId:message.sourceId,group:message.messageId||message.id,storedAt:message.storedAt||Date.now(),encrypted:true,iv:b64(iv),key:b64(key),ciphertext:b64(encrypted)};
 }
 async function open(privateKey,record){
  if(!record.encrypted)throw Error('Незашифрованная запись');
  const raw=await crypto.subtle.decrypt('RSA-OAEP',privateKey,bytes(record.key));const aes=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);new Uint8Array(raw).fill(0);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(record.iv),additionalData:enc.encode(record.id)},aes,bytes(record.ciphertext));
  const msg=JSON.parse(dec.decode(plain));if(msg.id!==record.id)throw Error('Неверная запись');return msg;
 }
 root.BridgeVault={create,unlock,seal,open};
 if(typeof module!=='undefined')module.exports=root.BridgeVault;
})(typeof self!=='undefined'?self:globalThis);
