/* Local-only QR rendering and camera decoding. Vendor licenses in ./vendor/. */
(function(root){
 'use strict';
 function asciiJSON(value){return JSON.stringify(value).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));}
 function matrixText(text){const q=qrcode(0,'M');q.addData(text,'Byte');q.make();return q;}
 function matrix(value){return matrixText(asciiJSON(value));}
 function draw(canvas,value){return drawText(canvas,asciiJSON(value));}
 function drawText(canvas,text){
  const q=matrixText(text),n=q.getModuleCount(),scale=Math.max(3,Math.floor(900/(n+8)));
  canvas.width=canvas.height=(n+8)*scale;const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#000';
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))c.fillRect((x+4)*scale,(y+4)*scale,scale,scale);
 }
 let stream=null,timer=null,generation=0,video=null;
 function stop(){generation++;clearTimeout(timer);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;if(video){video.pause();video.srcObject=null;}video=null;}
 async function scan(element,onCode,onError){
  stop();const current=generation;video=element;
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Камера недоступна. Откройте SMS Bridge по HTTPS.');
   const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
   if(current!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
   stream=acquired;element.srcObject=stream;await element.play();if(current!==generation)return;
   const canvas=document.createElement('canvas'),c=canvas.getContext('2d',{willReadFrequently:true});
   function tick(){
    if(current!==generation)return;
    try{if(element.readyState>=2&&element.videoWidth){const scale=Math.min(1,960/element.videoWidth);canvas.width=Math.round(element.videoWidth*scale);canvas.height=Math.round(element.videoHeight*scale);c.drawImage(element,0,0,canvas.width,canvas.height);const frame=c.getImageData(0,0,canvas.width,canvas.height),code=jsQR(frame.data,frame.width,frame.height,{inversionAttempts:'dontInvert'});if(code){stop();onCode(code.data);return;}}timer=setTimeout(tick,160);}catch(e){stop();onError(e);}
   }tick();
  }catch(e){if(current===generation){stop();onError(e);}}
 }
 async function frames(value){
  const text=asciiJSON(value);if(text.length>16000)throw Error('Данные подключения слишком велики.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
  const count=Math.ceil(text.length/240),out=[];
  for(let i=0;i<count;i++)out.push('SBQR1|'+hash+'|'+i+'|'+count+'|'+text.slice(i*240,(i+1)*240));
  return out;
 }
 root.BridgeQR={asciiJSON,matrix,matrixText,draw,drawText,frames,scan,stop};
 if(typeof module!=='undefined')module.exports=root.BridgeQR;
})(typeof self!=='undefined'?self:globalThis);
