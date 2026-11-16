// Stage display in the local studio: the message for the stage screens, the addresses to open, and how many stage
// screens are connected. Talks only to the loopback companion (/api/stage, /api/remote/status).
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let dialog,stage=null,remote=null,settings=null,note='',refreshTimer;

async function call(path,body){
 const r=await fetch(path,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(data.error||'The companion did not accept that.');
 return data;
}
async function refresh(){
 try{[stage,remote,settings]=await Promise.all([call('/api/stage'),call('/api/remote/status').catch(()=>null),call('/api/settings').catch(()=>null)]);note='';}
 catch(err){stage=null;note=err.message;}
 render();
}

// Tablets reach the stage display through the phone remote's address, so it is listed only while the remote is on.
function addresses(){
 const rows=[['This computer',location.origin+'/stage']];
 if(remote?.enabled&&remote?.running)for(const u of remote.urls)rows.push(['Tablet or phone on '+u.name,u.url+'/stage']);
 return rows;
}

function render(){
 if(!dialog?.open)return;
 const typed=dialog.querySelector('#stageMessageText')?.value;
 const current=stage?.message?.text||'',hidden=!!stage?.message?.hidden;
 const lines=settings?.stageNextLines??2;
 const screens=stage?stage.screens:0;
 dialog.innerHTML='<div class="dialog-top"><span class="eyebrow">STAGE DISPLAY</span><button class="icon-button" data-stage="close" aria-label="Close stage display">×</button></div>'+
 '<h2 id="stageTitle">Stage display</h2>'+
 '<p class="small-note">A screen facing the singers or the preacher: the words on screen now, the next slide, the clock, the timer and your message. It only reads; it cannot change the screen.</p>'+
 (stage?'<p class="remote-state" role="status">'+(screens===1?'1 stage screen connected.':screens+' stage screens connected.')+'</p>':'<p class="small-note status-error">'+e(note||'The stage display needs the local companion.')+'</p>')+
 '<div class="remote-section"><label class="label" for="stageMessageText">Message for the stage</label>'+
 '<input class="input" id="stageMessageText" maxlength="200" placeholder="e.g. 5 minutes, or Please wrap up" value="'+e(typed??current)+'">'+
 // Hide takes the message off the stage but keeps it, for showing again ("5 minutes" twice); Clear deletes it.
 '<div class="remote-actions"><button class="button primary" data-stage="show">Show on stage</button>'+
 (current?'<button class="button" data-stage="'+(hidden?'unhide':'hide')+'">'+(hidden?'Show again':'Hide')+'</button>':'')+
 '<button class="button" data-stage="clear"'+(current?'':' disabled')+'>Clear message</button></div>'+
 (current?'<p class="small-note">'+(hidden?'Hidden, kept for later: ':'On the stage now: ')+'<strong>'+e(current)+'</strong></p>':'<p class="small-note">Only the stage screens show it. The projector and OBS never do.</p>')+'</div>'+
 '<div class="remote-section"><label class="label" for="stageNextLines">Next slide on the stage</label>'+
 '<select class="input" id="stageNextLines">'+[[1,'First line'],[2,'First two lines'],[0,'Whole slide']].map(([n,name])=>'<option value="'+n+'"'+(n===lines?' selected':'')+'>'+name+'</option>').join('')+'</select></div>'+
 '<div class="remote-section"><h3 class="section-title">Open the stage display</h3>'+
 addresses().map(([name,url])=>'<p class="small-note"><strong>'+e(name)+'</strong><br><a href="'+e(url)+'" target="_blank" rel="noopener">'+e(url)+'</a></p>').join('')+
 (remote?.enabled&&remote?.running?'<p class="small-note">On a tablet, sign in with the phone remote password first.</p>':'<p class="small-note">For a tablet on the Wi-Fi, turn on the Phone remote; its address then appears here.</p>')+
 '</div>';
}

async function setMessage(message){
 try{stage=await call('/api/stage',{message});note='';}catch(err){note=err.message;}
 const field=dialog.querySelector('#stageMessageText');if(field&&!message)field.value='';
 render();
}
async function setHidden(hidden){
 try{stage=await call('/api/stage',{hidden});note='';}catch(err){note=err.message;}
 render();
}
async function setNextLines(stageNextLines){
 try{settings=await call('/api/settings',{stageNextLines});note='';}catch(err){note=err.message;}
 render();
}

export function openStageDisplay(){
 dialog=document.getElementById('stageDialog');if(!dialog)return;
 if(!dialog.dataset.ready){
  dialog.dataset.ready='1';
  dialog.addEventListener('click',ev=>{
   const action=ev.target.closest('[data-stage]')?.dataset.stage;
   if(action==='close')dialog.close();
   else if(action==='show')setMessage(dialog.querySelector('#stageMessageText').value);
   else if(action==='clear')setMessage('');
   else if(action==='hide'||action==='unhide')setHidden(action==='hide');
  });
  dialog.addEventListener('change',ev=>{if(ev.target.id==='stageNextLines')setNextLines(Number(ev.target.value));});
  // Enter in the message box shows it.
  dialog.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&ev.target.id==='stageMessageText'){ev.preventDefault();setMessage(ev.target.value);}});
  dialog.addEventListener('close',()=>clearInterval(refreshTimer));
 }
 if(!dialog.open)dialog.showModal();
 render();refresh();
 clearInterval(refreshTimer);refreshTimer=setInterval(refresh,5000);
}
