// Hosted studio -> local companion bridge. The hosted page sends each live screen to the companion on this
// computer (127.0.0.1 only), which serves the OBS Browser sources. Pairing uses the code shown in the local studio.
export const COMPANION_URL='http://127.0.0.1:18765',BRIDGE_KEY='wordlight-companion';
export function cleanCode(value){const code=String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');return code.length===12?code.match(/.{4}/g).join('-'):'';}
export function readPairing(storage){try{const saved=JSON.parse(storage.getItem(BRIDGE_KEY)||'null');return saved&&cleanCode(saved.code)?{code:cleanCode(saved.code)}:null;}catch{return null;}}
export function savePairing(storage,code){const clean=cleanCode(code);if(!clean)throw new Error('Enter the 12-character pairing code from the local studio, like ABCD-EFGH-JKLM.');storage.setItem(BRIDGE_KEY,JSON.stringify({code:clean}));return {code:clean};}
export function forgetPairing(storage){try{storage.removeItem(BRIDGE_KEY);}catch{}}
// Turns an HTTP outcome into a state the studio can show. 'offline' covers a stopped companion, a blocked
// local-network permission, and timeouts; the studio keeps working and the outputs keep their last screen.
async function call(pairing,path,options,request){
 if(!pairing)return {state:'unpaired'};
 let response;
 try{response=await request(COMPANION_URL+path,{...options,mode:'cors',credentials:'omit',headers:{...(options.headers||{}),Authorization:'Bearer '+pairing.code},signal:AbortSignal.timeout(4000)});}
 catch{return {state:'offline'};}
 let data={};try{data=await response.json();}catch{}
 if(response.status===401)return {state:'unpaired',message:data.error};
 if(response.status===409)return {state:'stale',liveUpdated:Number(data.liveUpdated)||0};
 if(!response.ok)return {state:'error',message:data.error||'The companion refused the request.'};
 return {state:'connected',viewers:cleanViewers(data.viewers),liveUpdated:Number(data.liveUpdated)||0};
}
// Output page counts as whole numbers. An older companion sends no graphics count, which reads as 0.
export function cleanViewers(raw){
 const count=n=>Number.isInteger(n)&&n>0?n:0;
 return {output:count(raw?.output),lower:count(raw?.lower),graphics:count(raw?.graphics)};
}
export function companionStatus(pairing,request=fetch){return call(pairing,'/api/bridge/status',{method:'GET'},request);}
export function sendToCompanion(pairing,live,request=fetch){return call(pairing,'/api/bridge/live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({live})},request);}
// After a reconnect, resend only when this studio's screen is newer than the companion's.
export function needsResend(live,remoteUpdated){return Number(live?.updated)>Number(remoteUpdated||0);}
// The one screen this studio still owes the companion: a Send the user made that did not get through (offline or an
// error). A cached or default screen is never owed. Any other answer settles the Send; a 409 means the companion
// already has a newer screen, which always wins. The answer to a Send older than the latest one started changes
// nothing, so a late failure cannot bring back a screen a newer Send has replaced.
export function nextPending(pending,sent,state,latest=sent){
 if(isOlderSend(sent,latest))return pending;
 const newer=!pending||Number(sent?.updated)>=Number(pending.updated);
 if(state==='offline'||state==='error')return newer?sent:pending;
 return newer?null:pending;
}
export function isOlderSend(sent,latest){return !!latest&&sent!==latest&&Number(sent?.updated)<Number(latest.updated);}
// The companion's current screen, so a newly paired or reloaded web studio shows what is really on air.
export async function companionLive(pairing,request=fetch){
 if(!pairing)return null;
 try{
  const response=await request(COMPANION_URL+'/api/bridge/live',{method:'GET',mode:'cors',credentials:'omit',headers:{Authorization:'Bearer '+pairing.code},signal:AbortSignal.timeout(8000)});
  if(!response.ok)return null;return (await response.json())?.live||null;
 }catch{return null;}
}
export function describeViewers(raw){
 const viewers=cleanViewers(raw);
 const parts=[[viewers.output,'full-screen'],[viewers.lower,'lower-third'],[viewers.graphics,'graphics']].filter(([n])=>n>0).map(([n,name])=>n+' '+name+' page'+(n===1?'':'s'));
 return parts.length?parts.join(', ')+' connected':'no output pages connected';
}
