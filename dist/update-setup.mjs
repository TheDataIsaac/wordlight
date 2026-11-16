// Updates in the local studio's Settings: this version, whether a newer one is out, and the buttons to download it,
// restart into it, or go back to the previous version. Talks only to the loopback companion (/api/update).
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,note='',working=false;

async function call(path,body){
 const r=await fetch(path,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(data.error||'The companion did not accept that.');
 return data;
}
// After going back, the version kept beside this one is the newer one.
const newerThan=(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true})>0;
const when=ms=>ms?new Date(ms).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'}):'';

function markup(){
 if(!state)return '<h3>Updates</h3><p class="small-note">'+e(note||'Checking…')+'</p>';
 const s=state,rows=['<h3>Updates</h3><p class="small-note">This is Wordlight '+e(s.version)+' <span class="update-build">('+e(s.build)+')</span>.</p>'];
 if(s.ready)rows.push('<p class="update-state"><strong>Version '+e(s.ready.version)+' is downloaded.</strong> It is installed when Wordlight restarts. Screens keep their last slide during the restart (about 10 seconds), but do it between services.</p><div class="remote-actions"><button class="button primary" data-update="restart">Restart now and install</button></div>');
 else if(s.newer)rows.push('<p class="update-state"><strong>Version '+e(s.latest.version)+' is available.</strong>'+(s.latest.page?' <a href="'+e(s.latest.page)+'" target="_blank" rel="noopener">What is new</a>':'')+'</p>'+
  (s.latest.notes?'<pre class="update-notes">'+e(s.latest.notes.split('\n').slice(0,12).join('\n'))+'</pre>':'')+
  (s.isPackage?'<div class="remote-actions"><button class="button primary" data-update="download"'+(s.busy?' disabled':'')+'>'+(s.busy?e(s.busy):'Download update')+'</button></div><p class="small-note">Downloading changes nothing on screen. The update waits until you restart Wordlight.</p>'
   :'<p class="small-note">This copy runs from source, so it cannot update itself. Download the new version from GitHub.</p>'));
 else if(s.checkedAt&&!s.checkError)rows.push('<p class="small-note">Up to date. Checked '+e(when(s.checkedAt))+'.</p>');
 if(s.checkError)rows.push('<p class="small-note status-error">'+e(s.checkError)+'</p>');
 if(s.downloadError)rows.push('<p class="small-note status-error">'+e(s.downloadError)+'</p>');
 if(note)rows.push('<p class="small-note">'+e(note)+'</p>');
 rows.push('<div class="remote-actions"><button class="button" data-update="check"'+(working?' disabled':'')+'>Check now</button>'+
  (s.previous&&s.isPackage?'<button class="button" data-update="back">'+(newerThan(s.previous.version,s.version)?'Use '+e(s.previous.version)+' again':'Go back to '+e(s.previous.version))+'</button>':'')+'</div>');
 if(s.isPackage)rows.push('<p class="small-note">Wordlight checks GitHub for a newer version once a day. It never installs one by itself. Your shows and settings stay where they are, and a copy of them is made before each update.</p>');
 return rows.join('');
}
function paint(){const el=document.getElementById('updateSection');if(el)el.innerHTML=markup();markButton();}
// The Settings button says when there is something to install.
function markButton(){
 const button=document.querySelector('[data-action="settings-open"]');if(!button)return;
 const waiting=state&&(state.ready||state.newer&&state.isPackage);
 button.classList.toggle('has-update',!!waiting);button.title=waiting?'A Wordlight update is ready (Settings, Updates)':'';
}

async function act(action){
 if(action==='restart'&&!confirm('Restart Wordlight now and install version '+state.ready.version+'?\n\nScreens and OBS keep their last slide and reconnect in about 10 seconds. Do not do this during a service.'))return;
 if(action==='back'&&!confirm('Switch to version '+state.previous.version+'? Wordlight restarts (about 10 seconds). Your shows are kept.'))return;
 working=true;note=action==='download'?'Downloading… this can take a minute on a slow connection.':action==='check'?'Checking…':'Restarting… this page reconnects by itself.';paint();
 try{
  const answer=await call('/api/update/'+action,{});
  if(!answer.restarting){state=answer;note='';}
 }catch(err){note=err.message;}
 working=false;paint();
}

export async function refreshUpdates(){
 try{state=await call('/api/update');}catch(err){note=err.message;}
 paint();
}
// Settings calls this after drawing its dialog, which holds an empty #updateSection.
export function showUpdates(){
 const el=document.getElementById('updateSection');if(!el)return;
 if(!el.dataset.ready){el.dataset.ready='1';el.addEventListener('click',ev=>{const action=ev.target.closest('[data-update]')?.dataset.update;if(action&&!working)act(action);});}
 paint();refreshUpdates();
}
