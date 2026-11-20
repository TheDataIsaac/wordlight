// Getting started, for a church opening Wordlight for the first time: a short checklist at the top of the local studio
// that ticks itself as each step is done (Bibles installed, projector, OBS, songs, a practice send, phone remote), with
// a button to the place that does each step. It is one line by default, showing only the next step, so the live
// controls stay on screen on a small laptop; "All steps" opens the whole list. OBS and songs can be marked "Not using
// this" (a church with only a projector, or only Bible verses). A step stays ticked once done (the projector window may
// be closed later). When every required step is done the list goes away and stops asking the companion; an install that
// already has Bibles and songs the first time it is checked (a church already using Wordlight) never sees it.
// Settings has "Show Getting started again". It only reads from the companion.
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const HIDDEN_KEY='wordlight-getting-started-hidden',DONE_KEY='wordlight-getting-started-done',SEEN_KEY='wordlight-getting-started-seen',SKIP_KEY='wordlight-getting-started-skipped';
// pinned: shown again from Settings, so it stays until hidden even when every step is done.
let steps=null,timer=null,expanded=false,listening=false,pinned=false,openStep=()=>{};

const hidden=()=>{try{return localStorage.getItem(HIDDEN_KEY)==='1';}catch{return false;}};
const remember=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
const readSet=key=>{try{return new Set(JSON.parse(localStorage.getItem(key)||'[]'));}catch{return new Set();}};
const get=async path=>{const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error(String(r.status));return r.json();};

async function check(){
 const [bibles,bridge,songs,remote,state]=await Promise.all([get('/api/bibles').catch(()=>null),get('/api/bridge/code').catch(()=>null),get('/api/songs?limit=1').catch(()=>null),get('/api/remote/status').catch(()=>null),get('/api/state?only=live').catch(()=>null)]);
 const list=bibles?.bibles||[],installed=list.filter(b=>b.installed),busy=list.filter(b=>b.job?.state==='running'),failed=list.filter(b=>b.job?.state==='failed');
 const viewers=bridge?.viewers||{};
 // A church already using Wordlight (Bibles and songs there the first time this runs) does not need the list.
 let seen=true;try{seen=localStorage.getItem(SEEN_KEY)==='1';}catch{}
 if(!seen){remember(SEEN_KEY,'1');if(installed.length&&songs?.native>0){remember(HIDDEN_KEY,'1');steps=null;return;}}
 const sent=(state?.live?.slides||[]).length>0;
 steps=[
  {key:'bibles',done:installed.length>0,title:'Bibles on this computer',
   detail:busy.length?'Installing '+busy.map(b=>b.abbreviation).join(', ')+'… lookups work offline once it finishes.':failed.length?failed[0].abbreviation+' did not install: '+(failed[0].job.message||'unknown reason')+'. Try again in the Bible tab.':installed.length?installed.map(b=>b.abbreviation).join(', ')+' installed: lookups work with no internet.':'Install KJV and the others in the Bible tab (Install for offline use).',
   action:'goto-bible',label:'Bible tab',warn:failed.length>0},
  {key:'projector',done:viewers.projector>0,title:'Projector or TV',detail:viewers.projector>0?'The projector window is open.':'Connect the projector or TV, press Windows+P and choose Extend, then click Present.',action:'present',label:'Present'},
  {key:'practice',done:sent,title:'Practise once',detail:sent?'You have sent something to the screen.':'In the Bible tab type John 3:16 and press Enter, check it in PREVIEW, then press Send to screen. Hide screen takes it off again.',action:'goto-bible',label:'Bible tab'},
  {key:'obs',done:(viewers.output||0)+(viewers.lower||0)+(viewers.graphics||0)>0,skippable:true,title:'OBS (for streaming)',detail:(viewers.output||0)+(viewers.lower||0)>0?'OBS is showing Wordlight.':'Add Wordlight to OBS as a Browser source. OBS & screens shows how, step by step.',action:'help',label:'OBS & screens'},
  {key:'songs',done:(songs?.native||0)>0,skippable:true,title:'Your songs',detail:songs?.native?songs.native+(songs.native===1?' song':' songs')+' in the library.':'Import the songs you already have: EasyWorship, ProPresenter 6, SongSelect, OpenLyrics (OpenLP), ChordPro, plain text, or a Wordlight song library file.',action:'song-import',label:'Import songs'},
  {key:'remote',done:!!remote?.enabled,optional:true,title:'Phone remote (optional)',detail:remote?.enabled?'On: a phone can look up verses and move slides.':'Let a phone on the church Wi-Fi look up verses and move slides.',action:'phone-remote',label:'Phone remote'},
 ];
 // Ticks stay: a step done once counts as done after that. Skipped steps count as done but say so.
 const done=readSet(DONE_KEY),skipped=readSet(SKIP_KEY);
 for(const s of steps){if(s.done)done.add(s.key);else if(done.has(s.key))s.done=true;else if(skipped.has(s.key)){s.done=true;s.skipped=true;}}
 remember(DONE_KEY,JSON.stringify([...done]));
 if(!pinned&&steps.filter(s=>!s.optional).every(s=>s.done)){remember(HIDDEN_KEY,'1');steps=null;}
}
const stepButtons=s=>s.done?'':'<button class="button" data-gs-action="'+s.action+'">'+e(s.label)+'</button>'+(s.skippable?'<button class="button quiet" data-gs-skip="'+s.key+'" title="Ticks this step without doing it">Not using this</button>':'');
export function paintGettingStarted(){
 const box=document.getElementById('gettingStarted');if(!box)return;
 if(hidden()||!steps){box.hidden=true;box.innerHTML='';return;}
 const needed=steps.filter(s=>!s.optional),done=needed.filter(s=>s.done).length,next=steps.find(s=>!s.done);
 box.hidden=false;box.classList.toggle('expanded',expanded);
 const head='<div class="gs-head"><strong>Getting started</strong><span class="gs-count">'+done+' of '+needed.length+' done</span>'+
  (!expanded&&next?'<span class="gs-next"><span class="gs-next-label">Next:</span> <strong>'+e(next.title)+'</strong> '+e(next.detail)+'</span><span class="gs-next-buttons">'+stepButtons(next)+'</span>':'<span class="gs-next"></span>')+
  '<button class="button" data-gs="toggle">'+(expanded?'Fewer steps':'All steps')+'</button><button class="button" data-gs="hide" title="Settings can show it again">Hide</button></div>';
 box.innerHTML=head+(expanded?'<ol class="gs-steps">'+steps.map(s=>'<li class="'+(s.skipped?'skipped':s.done?'done':s.warn?'warn':'')+'"><span class="gs-mark" aria-hidden="true">'+(s.skipped?'–':s.done?'✓':s.warn?'!':'○')+'</span><span class="gs-text"><strong>'+e(s.title)+'</strong> '+(s.skipped?'Not using this.':e(s.detail))+'</span>'+stepButtons(s)+'</li>').join('')+'</ol>':'');
}
const refresh=async()=>{if(hidden()){clearInterval(timer);timer=null;paintGettingStarted();return;}await check().catch(()=>{});paintGettingStarted();};
// open(action): the studio does the step (opens the Bible tab, Present, the OBS guide…).
export function setupGettingStarted(open){
 openStep=open;
 if(!listening){
  listening=true;
  document.addEventListener('click',ev=>{
   const gs=ev.target.closest?.('[data-gs]')?.dataset.gs,action=ev.target.closest?.('[data-gs-action]')?.dataset.gsAction,skip=ev.target.closest?.('[data-gs-skip]')?.dataset.gsSkip;
   if(gs==='hide'){remember(HIDDEN_KEY,'1');pinned=false;clearInterval(timer);timer=null;paintGettingStarted();}
   else if(gs==='toggle'){expanded=!expanded;paintGettingStarted();}
   else if(skip){const s=readSet(SKIP_KEY);s.add(skip);remember(SKIP_KEY,JSON.stringify([...s]));refresh();}
   else if(action){openStep(action);setTimeout(refresh,1500);}
  });
 }
 if(hidden())return;
 refresh();clearInterval(timer);timer=setInterval(refresh,10000);
}
// Settings > Show Getting started again: brings the list back with the steps already done still ticked.
export function reopenGettingStarted(){
 try{localStorage.removeItem(HIDDEN_KEY);localStorage.removeItem(SKIP_KEY);}catch{}
 expanded=true;pinned=true;setupGettingStarted(openStep);
}
