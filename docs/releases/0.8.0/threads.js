(function(root){
 'use strict';
 const key=m=>JSON.stringify([m.sourceId,m.simId,m.sender]);
 function group(messages,read=[]){
  const seen=new Set(),readSet=new Set(read),threads=new Map();
  for(const m of messages){const id=JSON.stringify([m.sourceId,m.id]);if(seen.has(id))continue;seen.add(id);const k=key(m);if(!threads.has(k))threads.set(k,{key:k,sender:m.sender,simName:m.simName,messages:[],unread:0});const t=threads.get(k);t.messages.push(m);if(!readSet.has(m.id))t.unread++;}
  for(const t of threads.values()){t.messages.sort((a,b)=>a.receivedAt-b.receivedAt);t.last=t.messages[t.messages.length-1];}
  return [...threads.values()].sort((a,b)=>b.last.receivedAt-a.last.receivedAt);
 }
 root.BridgeThreads={key,group};if(typeof module!=='undefined')module.exports=root.BridgeThreads;
})(typeof self!=='undefined'?self:globalThis);
