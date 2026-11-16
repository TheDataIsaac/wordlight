// Verse listening in the local studio: the one-time download, choosing the sound input, capturing it, and the bar of
// suggestions under the preview. The companion does the listening (listen.mjs); this page only sends it the audio and
// shows what it found. A click puts a suggestion in the preview; a double-click sends it to the screen.
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CHUNK=4000,MAX_WAITING=8,DEVICE_KEY='wordlight-listen-device';
let state=null,events=null,hooks={},capture=null,level=0,lastClick=null,dialogNote='';

async function call(path,body){
 const r=await fetch(path,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(data.error||'The companion did not accept that.');
 return data;
}
function follow(){
 if(events)return;
 events=new EventSource('/api/listen/events');
 // When listening stops by itself, the operator is told why.
 events.onmessage=ev=>{const was=state?.listening;try{state=JSON.parse(ev.data);}catch{return;}paintBar();paintDialog();
  if(!state.listening&&capture)stopCapture();if(was&&!state.listening&&state.error)toast(state.error);};
}

// ---- Capture: the chosen input at 16 kHz, a quarter of a second at a time, as 16-bit samples ----
async function startCapture(){
 const deviceId=localStorage.getItem(DEVICE_KEY)||'';
 const media=await navigator.mediaDevices.getUserMedia({audio:{deviceId:deviceId?{exact:deviceId}:undefined,channelCount:1,echoCancellation:false,noiseSuppression:true,autoGainControl:true}});
 const context=new AudioContext({sampleRate:16000});
 await context.audioWorklet.addModule('listen-worklet.js');
 const source=context.createMediaStreamSource(media),node=new AudioWorkletNode(context,'listen-capture'),mute=context.createGain();
 mute.gain.value=0;source.connect(node);node.connect(mute);mute.connect(context.destination);
 const pending=new Float32Array(CHUNK),waiting=[];let filled=0,sending=false;
 async function send(){
  if(sending)return;sending=true;
  while(waiting.length){
   const body=waiting.shift();
   // A time limit, so one stuck request cannot hold up the sound that follows it.
   try{const r=await fetch('/api/listen/audio',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body,signal:AbortSignal.timeout(5000)});if(r.status===409){stopCapture();break;}}catch{}
  }
  sending=false;
 }
 node.port.onmessage=ev=>{
  const samples=ev.data;
  for(let i=0;i<samples.length;i++){
   pending[filled++]=samples[i];
   if(filled===CHUNK){
    let sum=0;const pcm=new Int16Array(CHUNK);
    for(let j=0;j<CHUNK;j++){const s=Math.max(-1,Math.min(1,pending[j]));pcm[j]=s*32767;sum+=s*s;}
    level=Math.sqrt(sum/CHUNK);filled=0;
    // If the companion is slow to take audio, the oldest waiting piece is dropped rather than piling up.
    waiting.push(pcm.buffer);if(waiting.length>MAX_WAITING)waiting.shift();
    send();paintLevel();
   }
  }
 };
 capture={media,context};
}
function stopCapture(){
 if(!capture)return;
 for(const track of capture.media.getTracks())track.stop();
 capture.context.close().catch(()=>{});capture=null;level=0;paintLevel();
}

export async function startListening(){
 follow();
 try{await call('/api/listen/start',{});await startCapture();toast('Listening. Suggestions appear under the preview.');}
 catch(err){stopCapture();await call('/api/listen/stop',{}).catch(()=>{});
  toast(err.name==='NotAllowedError'?'Allow Wordlight to use the microphone or sound desk input, then start again.':err.name==='NotFoundError'||err.name==='OverconstrainedError'?'That sound input is not connected. Choose another in Listen.':err.message||'Listening could not start.');}
 paintBar();paintDialog();
}
export async function stopListening(){stopCapture();try{state=await call('/api/listen/stop',{});}catch{}paintBar();paintDialog();}
const toast=text=>hooks.toast?.(text);

// ---- The bar under the preview: what is being heard, and the verses heard ----
// The words heard change several times a second, so only that line is updated then; the buttons are rebuilt only when
// they change, so a click on a suggestion is never lost to a redraw.
export function paintBar(){
 const bar=document.getElementById('listenBar');if(!bar)return;
 const items=state?.suggestions||[];
 if(!state||(!state.listening&&!items.length&&!state.error)){bar.hidden=true;bar.innerHTML='';bar.dataset.look='';return;}
 bar.hidden=false;
 const last=state.partial||state.phrases?.at(-1)?.text||'';
 const heard=state.listening?(state.ready?last||'Listening…':'Starting the speech model…'):state.error||'Listening is off';
 const look=JSON.stringify([state.listening,state.skipped,items.map(s=>[s.id,s.confidence])]);
 if(bar.dataset.look!==look||!bar.querySelector('.listen-heard')){
  bar.dataset.look=look;
  bar.innerHTML='<div class="listen-head"><span class="listen-dot'+(state.listening?' on':'')+'" id="listenLevel" title="Sound level"></span>'+
   '<span class="listen-heard" title="What Wordlight heard last"></span>'+
   (state.skipped?'<span class="listen-warn">Catching up: a moment of sound was skipped</span>':'')+
   '<button class="icon-button" data-listen="clear" title="Clear the suggestions" aria-label="Clear the suggestions">×</button>'+
   (state.listening?'<button class="button" data-listen="stop">Stop listening</button>':'<button class="button" data-listen="start">Listen</button>')+'</div>'+
   (items.length?'<div class="listen-suggestions" role="list">'+items.map((s,i)=>'<button class="listen-suggestion'+(i===0?' newest':'')+'" role="listitem" data-listen="pick" data-reference="'+e(s.reference)+'" title="'+e((s.source==='said'?'Said: ':'Read: ')+'“'+s.heard+'”')+'. Click to preview, double-click to send.">'+
    '<strong>'+e(s.reference)+'</strong><span>'+(s.source==='said'?'said':'read')+' · '+s.confidence+'%</span></button>').join('')+'</div>':'');
 }
 const line=bar.querySelector('.listen-heard');if(line.textContent!==heard)line.textContent=heard;
 paintLevel();
}
function paintLevel(){const dot=document.getElementById('listenLevel');if(dot)dot.style.setProperty('--level',String(Math.min(1,level*8)));}

// ---- The Listen dialog: download once, choose the input, start and stop ----
async function inputs(){
 try{return (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');}catch{return [];}
}
async function paintDialog(){
 const dialog=document.getElementById('listenDialog');if(!dialog?.open)return;
 const s=state,devices=s?.installed?await inputs():[],chosen=localStorage.getItem(DEVICE_KEY)||'';
 dialog.innerHTML='<div class="dialog-top"><span class="eyebrow">VERSE LISTENING</span><button class="icon-button" data-listen="close" aria-label="Close">×</button></div>'+
 '<h2 id="listenTitle">Listen for verses</h2>'+
 '<p class="small-note">Wordlight listens to the sermon and suggests the verse the preacher calls ("John chapter three, verse sixteen") or reads aloud. Suggestions appear under the preview: click one to preview it, double-click to send it. Nothing goes on screen by itself. English speech only.</p>'+
 '<p class="small-note">It all runs on this computer. No sound and no words are sent anywhere. While it listens it uses about 0.8 GB of memory and half of one processor core, freed again when you stop.</p>'+
 (!s?'<p class="small-note">Connecting…</p>':
 !s.installed?(s.installing?'<p class="remote-state" role="status">Downloading '+e(s.progress?.what||'')+'… '+(s.progress?s.progress.doneMB+' of '+s.progress.totalMB+' MB':'')+'</p><p class="small-note">You can keep working. It needs about '+s.downloadMB+' MB once.</p>':
  '<p class="small-note">It needs a one-time download of about '+s.downloadMB+' MB (the speech engine and model). Do it at home, not on the church connection.</p><button class="button primary" data-listen="install">Download verse listening</button>'):
  '<label class="label" for="listenDevice">Sound input</label><select class="input" id="listenDevice"><option value="">Default microphone</option>'+devices.map(d=>'<option value="'+e(d.deviceId)+'"'+(d.deviceId===chosen?' selected':'')+'>'+e(d.label||'Input '+(devices.indexOf(d)+1))+'</option>').join('')+'</select>'+
  '<p class="small-note">Choose the sound desk (for example USB Audio CODEC), not the laptop microphone. Names appear after Wordlight has been allowed to use audio once.</p>'+
  '<div class="remote-actions">'+(s.listening?'<button class="button" data-listen="stop">Stop listening</button>':'<button class="button primary" data-listen="start">Start listening</button>')+'</div>'+
  '<details class="source-note"><summary>Remove the download</summary><p class="small-note">Frees about '+s.downloadMB+' MB. Download it again to listen.</p><button class="button danger" data-listen="remove">Remove verse listening</button></details>')+
 (s?.error?'<p class="small-note status-error">'+e(s.error)+'</p>':'')+(dialogNote?'<p class="small-note status-error">'+e(dialogNote)+'</p>':'');
}
export async function openListening(){
 follow();
 const dialog=document.getElementById('listenDialog');if(!dialog)return;
 if(!dialog.open)dialog.showModal();
 try{state=await call('/api/listen');}catch(err){dialogNote=err.message;}
 paintDialog();
}

async function act(action,target,ev){
 dialogNote='';
 try{
  if(action==='close')document.getElementById('listenDialog')?.close();
  else if(action==='install'){state=await call('/api/listen/install',{});}
  else if(action==='start'){document.getElementById('listenDialog')?.close();await startListening();}
  else if(action==='stop')await stopListening();
  else if(action==='clear')state=await call('/api/listen/clear',{});
  else if(action==='remove'){if(confirm('Remove verse listening from this computer?'))state=await call('/api/listen/remove',{});}
  else if(action==='pick'){
   // Same rule as verse search: the second click of a double-click sends what the first one previewed.
   const reference=target.dataset.reference,double=lastClick?.reference===reference&&ev.timeStamp-lastClick.time<450;
   lastClick=double?null:{reference,time:ev.timeStamp};
   if(double)await hooks.send?.(reference);else await hooks.preview?.(reference);
  }
 }catch(err){dialogNote=err.message;toast(err.message);}
 paintBar();paintDialog();
}

// hooks: preview(reference) and send(reference) from the studio, and toast(text).
export function setupListening(studioHooks){
 hooks=studioHooks;
 document.addEventListener('click',ev=>{const t=ev.target.closest('[data-listen]');if(t)act(t.dataset.listen,t,ev);});
 document.addEventListener('change',ev=>{if(ev.target.id==='listenDevice'){localStorage.setItem(DEVICE_KEY,ev.target.value);if(capture){stopCapture();startCapture().catch(err=>toast(err.message));}}});
 // L, when not typing, previews the newest verse heard.
 document.addEventListener('keydown',ev=>{
  if(ev.key!=='l'&&ev.key!=='L'||ev.ctrlKey||ev.metaKey||ev.altKey||ev.shiftKey||ev.repeat)return;
  if(ev.target.closest?.('input,textarea,select,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
  const newest=state?.suggestions?.[0];if(!newest)return;
  ev.preventDefault();hooks.preview?.(newest.reference);
 });
 // Listening may already be on (the studio was refreshed): show its bar.
 call('/api/listen').then(s=>{state=s;if(s.listening||s.suggestions?.length)follow();paintBar();}).catch(()=>{});
}
