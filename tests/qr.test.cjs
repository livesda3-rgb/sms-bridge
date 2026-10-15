const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
global.qrcode=require('../docs/vendor/qrcode.js');const qr=require('../docs/qr.js'),decode=require('../docs/vendor/jsqr.js');
test('recipient QR roundtrips Cyrillic, emoji, subscription and pairing token through independent decoder',()=>{
 const value={version:1,type:'sms-bridge-recipient',sourceId:crypto.randomUUID(),recipientId:crypto.randomUUID(),name:'Мой iPhone 🔐',publicKey:'B'+'x'.repeat(86),pairingToken:'a'.repeat(43),subscription:{endpoint:'https://web.push.apple.com/'+ 'x'.repeat(300),keys:{p256dh:'B'+'z'.repeat(86),auth:'x'.repeat(22)}}};
 const q=qr.matrix(value),n=q.getModuleCount(),scale=5,w=(n+8)*scale,data=new Uint8ClampedArray(w*w*4).fill(255);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const p=(((y+4)*scale+dy)*w+(x+4)*scale+dx)*4;data[p]=data[p+1]=data[p+2]=0;}
 const result=decode(data,w,w);assert.ok(result);assert.deepEqual(JSON.parse(result.data),value);
});
test('camera acquired after cancel is stopped and never attached',async()=>{
 let resolve,stops=0;const context=vm.createContext({navigator:{mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)}},setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(require.resolve('../docs/qr.js'),'utf8'),context);
 const video={srcObject:null,pause(){},play(){throw Error('must not play after cancel');}};
 const pending=context.BridgeQR.scan(video,()=>assert.fail('no callback'),()=>assert.fail('no error'));
 context.BridgeQR.stop();resolve({getTracks:()=>[{stop(){stops++;}}]});await pending;assert.equal(stops,1);assert.equal(video.srcObject,null);
});
test('permission failure is reported and camera is released',async()=>{
 const context=vm.createContext({navigator:{mediaDevices:{getUserMedia:async()=>{throw Object.assign(Error('Denied'),{name:'NotAllowedError'});}}},setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(require.resolve('../docs/qr.js'),'utf8'),context);
 let error;const video={srcObject:null,pause(){}};await context.BridgeQR.scan(video,()=>assert.fail(),e=>error=e);assert.equal(error.name,'NotAllowedError');assert.equal(video.srcObject,null);
});
test('small QR frames decode and Java reassembles out of order, deduplicates and rejects corruption',async()=>{
 const os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
 const value={version:1,type:'sms-bridge-recipient',name:'Телефон 🔐 | тест',subscription:{endpoint:'https://web.push.apple.com/'+ 'x'.repeat(500)},pairingToken:'x'.repeat(43)};
 const frames=await qr.frames(value);assert.ok(frames.length>1);
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'qr-parts-'));
 try{
  const decoded=[];
  for(const frame of frames){const q=qr.matrixText(frame),n=q.getModuleCount();assert.ok(n<=69,'QR modules must stay large');const scale=3,w=(n+8)*scale,data=new Uint8ClampedArray(w*w*4).fill(255);for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const i=(((y+4)*scale+dy)*w+(x+4)*scale+dx)*4;data[i]=data[i+1]=data[i+2]=0;}const result=decode(data,w,w);assert.ok(result);assert.equal(result.data,frame);decoded.push(result.data);}
  fs.writeFileSync(path.join(tmp,'frames.txt'),decoded.join('\n'));
  const project=path.resolve(__dirname,'..'),android=fs.existsSync(path.join(project,'android'))?path.join(project,'android'):path.join(project,'../SmsBridge');
  const args=['-d',tmp,path.join(android,'app/src/main/java/dev/kats/smsbridge/QrParts.java'),path.join(android,'tests/QrPartsCheck.java')];
  if(process.env.ECJ_JAR)execFileSync('java',['-jar',process.env.ECJ_JAR,'-17',...args]);else execFileSync('javac',args);
  const assembled=execFileSync('java',['-cp',tmp,'dev.kats.smsbridge.QrPartsCheck',path.join(tmp,'frames.txt')],{encoding:'utf8'});
  assert.deepEqual(JSON.parse(assembled),value);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
