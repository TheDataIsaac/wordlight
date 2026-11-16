// Getting started, for a church opening Wordlight for the first time: a short checklist at the top of the local studio
// that ticks itself as each step is done (Bibles installed, projector, OBS, songs, phone remote), with a button to the
// place that does each step. It stays until the operator hides it, and only reads from the companion.
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const HIDDEN_KEY='wordlight-getting-started-hidden';
let steps=null,timer=null,collapsed=false;

const hidden=()=>{try{return localStorage.getItem(HIDDEN_KEY)==='1';}catch{return false;}};
const get=async path=>{const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error(String(r.status));return r.json();};

async function check(){
 const [bibles,bridge,songs,remote]=await Promise.all([get('/api/bibles').catch(()=>null),get('/api/bridge/code').catch(()=>null),get('/api/songs?limit=1').catch(()=>null),get('/api/remote/status').catch(()=>null)]);
 const list=bibles?.bibles||[],installed=list.filter(b=>b.installed),busy=list.filter(b=>b.job?.state==='running'),failed=list.filter(b=>b.job?.state==='failed');
 const viewers=bridge?.viewers||{};
 steps=[
  {done:installed.length>0,title:'Bibles on this computer',
   detail:busy.length?'Installing '+busy.map(b=>b.abbreviation).join(', ')+'… lookups work offline once it finishes.':failed.length?failed[0].abbreviation+' did not install: '+(failed[0].job.message||'unknown reason')+'. Try again in the Bible tab.':installed.length?installed.map(b=>b.abbreviation).join(', ')+' installed: lookups work with no internet.':'Install KJV and the others in the Bible tab (Install for offline use).',
   action:'goto-bible',label:'Bible tab',warn:failed.length>0},
  {done:viewers.projector>0,title:'Projector',detail:viewers.projector>0?'The projector window is open.':'Connect the projector, press Windows+P and choose Extend, then click Present.',action:'present',label:'Present'},
  {done:(viewers.output||0)+(viewers.lower||0)+(viewers.graphics||0)>0,title:'OBS (for streaming)',detail:(viewers.output||0)+(viewers.lower||0)>0?'OBS is showing Wordlight.':'Add Wordlight to OBS as a Browser source. OBS & screens gives the addresses.',action:'help',label:'OBS & screens'},
  {done:(songs?.native||0)>0,title:'Your songs',detail:songs?.native?songs.native+' songs in the library.':'Import the songs you already have: SongSelect, OpenLyrics (OpenLP), ChordPro or plain text, many at once.',action:'song-import',label:'Import songs'},
  {done:!!remote?.enabled,optional:true,title:'Phone remote (optional)',detail:remote?.enabled?'On: a phone can look up verses and move slides.':'Let a phone on the church Wi-Fi look up verses and move slides.',action:'phone-remote',label:'Phone remote'},
 ];
}
export function paintGettingStarted(){
 const box=document.getElementById('gettingStarted');if(!box)return;
 if(hidden()||!steps){box.hidden=true;box.innerHTML='';return;}
 const needed=steps.filter(s=>!s.optional),done=needed.filter(s=>s.done).length;
 box.hidden=false;
 box.innerHTML='<div class="gs-head"><strong>Getting started</strong><span>'+done+' of '+needed.length+' done</span><button class="button" data-gs="toggle">'+(collapsed?'Show':'Collapse')+'</button><button class="button" data-gs="hide">Hide this list</button></div>'+
  (collapsed?'':'<ol class="gs-steps">'+steps.map(s=>'<li class="'+(s.done?'done':s.warn?'warn':'')+'"><span class="gs-mark" aria-hidden="true">'+(s.done?'✓':s.warn?'!':'○')+'</span><span class="gs-text"><strong>'+e(s.title)+'</strong> '+e(s.detail)+'</span>'+(s.done?'':'<button class="button" data-gs-action="'+s.action+'">'+e(s.label)+'</button>')+'</li>').join('')+'</ol>');
}
// open(action): the studio does the step (opens the Bible tab, Present, the OBS guide…).
export function setupGettingStarted(open){
 if(hidden())return;
 const refresh=async()=>{if(hidden()){clearInterval(timer);return;}await check().catch(()=>{});paintGettingStarted();};
 document.addEventListener('click',ev=>{
  const gs=ev.target.closest?.('[data-gs]')?.dataset.gs,action=ev.target.closest?.('[data-gs-action]')?.dataset.gsAction;
  if(gs==='hide'){try{localStorage.setItem(HIDDEN_KEY,'1');}catch{}clearInterval(timer);paintGettingStarted();}
  else if(gs==='toggle'){collapsed=!collapsed;paintGettingStarted();}
  else if(action){open(action);setTimeout(refresh,1500);}
 });
 refresh();clearInterval(timer);timer=setInterval(refresh,10000);
}
