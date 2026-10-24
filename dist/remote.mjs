// Phone remote page. It shows the live slide, moves it, hides it, runs the countdown, and sends a chosen slide.
// Browsing shows and scenes only reads; nothing changes the screen until Send to live. Live updates arrive over one
// event stream that reconnects on its own; closing the phone or losing Wi-Fi never changes the screen.
const $=id=>document.getElementById(id);
let live=null,clockOffset=0,events=null,busy=false,shows=[],picked=null,messageTimer,retryTimer;
const browse={showId:'',sceneId:'',offset:0,total:0};

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// crypto.randomUUID needs HTTPS; getRandomValues works on a plain LAN address.
function commandId(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');}
function say(text){$('message').textContent=text;clearTimeout(messageTimer);messageTimer=setTimeout(()=>{$('message').textContent='';},4000);}
function setConnection(ok,text){const el=$('connection');el.textContent=text||(ok?'Connected':'Reconnecting…');el.className='connection '+(ok?'ok':'bad');}

// Every request gives up after 6 s, so a stalled Wi-Fi connection never leaves the buttons waiting forever.
async function request(path,body){
 const options=body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
 try{
  const response=await fetch(path,{...options,credentials:'same-origin',signal:controller.signal});
  let data={};try{data=await response.json();}catch{}
  if(response.status===401&&path!=='/remote/api/login')showLogin();
  return {status:response.status,data};
 }finally{clearTimeout(timer);}
}

// ---- Views ----
function showLogin(){
 events?.close();events=null;live=null;
 $('remote').hidden=true;$('signOut').hidden=true;$('sendBar').hidden=true;$('login').hidden=false;
 setConnection(false,'Signed out');
}
function showRemote(){$('login').hidden=true;$('remote').hidden=false;$('signOut').hidden=false;}

// ---- Live slide ----
function applyLive(summary){
 if(!summary||typeof summary.updated!=='number')return;
 // A slow command reply must not replace a newer screen that already arrived on the live stream.
 if(live&&summary.updated<live.updated)return;
 live=summary;clockOffset=summary.serverNow-Date.now();
 $('liveLabel').textContent=live.blank?'HIDDEN':'LIVE';$('liveLabel').classList.toggle('hidden-screen',live.blank);
 document.querySelector('.live').classList.toggle('blanked',live.blank);
 $('livePlace').textContent=[live.showTitle,live.sceneName].filter(Boolean).join(' · ');
 $('livePosition').textContent=live.count?(live.index+1)+' of '+live.count:'';
 $('liveTitle').textContent=live.current?.title||'Nothing on screen yet';
 $('liveText').textContent=live.current?.text||'';
 $('liveNext').textContent=live.next?'Next: '+live.next.title:live.count?'This is the last slide.':'';
 $('blank').textContent=live.blank?'Show screen':'Hide screen';$('blank').classList.toggle('restore',live.blank);
 updateButtons();markOnAir();paintTimer();
 if(live.showId&&shows.length&&!shows.some(s=>s.id===live.showId))loadShows();
}
function updateButtons(){
 const none=!live||!live.count;
 $('previous').disabled=busy||none||live.index===0;$('next').disabled=busy||none||live.index>=live.count-1;
 for(const b of document.querySelectorAll('#blank,[data-timer],#send'))b.disabled=busy||!live;
}

// ---- Countdown: shown from the last timer state; the ticking itself needs no network ----
function timerValue(t){
 const elapsed=t.running?Math.max(0,Date.now()+clockOffset-t.startedAt):0;
 return Math.max(0,t.mode==='stopwatch'?t.valueMs+elapsed:t.valueMs-elapsed);
}
function formatTimer(ms){
 const seconds=Math.ceil(ms/1000),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;
 return (h?h+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function paintTimer(){$('timerValue').textContent=live?formatTimer(timerValue(live.timer)):'--:--';}
setInterval(()=>{if(live?.timer.running&&!document.hidden)paintTimer();},250);

// ---- Commands: one at a time. A retry after a timeout or network error sends the same id, so the companion
// applies the command at most once and answers a retry with the first result. ----
async function command(body){
 if(busy)return false;
 busy=true;updateButtons();body.id=commandId();
 try{
  for(let attempt=0;;attempt++){
   try{
    const r=await request('/remote/api/command',body);
    if(r.data.live)applyLive(r.data.live);
    if(r.status!==200&&r.status!==401)say(r.data.error||'That did not work.');
    return r.status===200;
   }catch{
    if(attempt>=2){say('Could not reach Wordlight. Check the screen before trying again.');return false;}
    await sleep(500*2**attempt);
   }
  }
 }finally{busy=false;updateButtons();}
}
$('previous').addEventListener('click',()=>live&&command({action:'previous',base:live.updated}));
$('next').addEventListener('click',()=>live&&command({action:'next',base:live.updated}));
$('blank').addEventListener('click',()=>live&&command({action:'blank',blank:!live.blank}));
for(const b of document.querySelectorAll('[data-timer]'))b.addEventListener('click',()=>command({action:'timer',timer:b.dataset.timer}));
$('send').addEventListener('click',async()=>{
 if(!picked)return;
 // "Sent", not "on screen": the studio may have sent something newer meanwhile; the live card shows what is on.
 const title=picked.title;
 if(await command({action:'send',...picked})){say('Sent: '+title);picked=null;$('sendBar').hidden=true;markPicked();}
});

// ---- Browsing shows, scenes and slides (read only) ----
function option(value,text,selected){const o=document.createElement('option');o.value=value;o.textContent=text;o.selected=selected;return o;}
// Only the newest show or slide request may fill the lists; an older reply after a quick change is dropped.
let showsRequest=0,slidesRequest=0;
async function loadShows(){
 const mine=++showsRequest;
 let r;try{r=await request('/remote/api/shows');}catch{return;}
 if(mine!==showsRequest||r.status!==200)return;
 shows=r.data.shows||[];
 if(!shows.some(s=>s.id===browse.showId)){browse.showId=shows.some(s=>s.id===live?.showId)?live.showId:r.data.activeShowId;browse.sceneId='';}
 const show=shows.find(s=>s.id===browse.showId);
 if(show&&!show.scenes.some(s=>s.id===browse.sceneId))browse.sceneId=live?.showId===show.id&&show.scenes.some(s=>s.id===live.sceneId)?live.sceneId:show.activeSceneId;
 $('showPick').replaceChildren(...shows.map(s=>option(s.id,s.title,s.id===browse.showId)));
 $('scenePick').replaceChildren(...(show?.scenes||[]).map(s=>option(s.id,s.name,s.id===browse.sceneId)));
 $('scenePick').disabled=(show?.scenes.length||0)<2;
 await loadSlides(0);
}
async function loadSlides(offset){
 if(!browse.showId)return;
 const mine=++slidesRequest;
 let r;try{r=await request('/remote/api/slides?show='+encodeURIComponent(browse.showId)+'&scene='+encodeURIComponent(browse.sceneId)+'&offset='+offset);}catch{if(mine===slidesRequest)say('Could not load the slides. Try again.');return;}
 if(mine!==slidesRequest)return;
 if(r.status!==200){if(r.status===404)say(r.data.error);return;}
 browse.offset=offset;browse.total=r.data.total;
 const items=r.data.slides.map((slide,i)=>{
  const li=document.createElement('li'),b=document.createElement('button'),title=document.createElement('span'),text=document.createElement('span');
  b.type='button';b.dataset.id=slide.id;b.setAttribute('aria-pressed','false');
  title.className='title';title.textContent=(offset+i+1)+'. '+slide.title;text.className='text';text.textContent=slide.text;
  b.append(title,text);li.append(b);
  b.addEventListener('click',()=>{picked={showId:browse.showId,sceneId:browse.sceneId,slideId:slide.id,title:slide.title};$('sendWhat').textContent=slide.title;$('sendBar').hidden=false;markPicked();});
  return li;
 });
 if(offset===0)$('slides').replaceChildren(...items);else $('slides').append(...items);
 if(!browse.total)$('slides').replaceChildren(Object.assign(document.createElement('li'),{className:'muted',textContent:'This item has no slides.'}));
 $('more').hidden=offset+r.data.slides.length>=browse.total;
 markOnAir();markPicked();
}
function markPicked(){for(const b of $('slides').querySelectorAll('button'))b.setAttribute('aria-pressed',String(!!picked&&picked.slideId===b.dataset.id&&picked.sceneId===browse.sceneId&&picked.showId===browse.showId));}
function markOnAir(){
 const here=live&&live.showId===browse.showId&&live.sceneId===browse.sceneId;
 for(const b of $('slides').querySelectorAll('button')){
  const on=here&&live.current?.id===b.dataset.id;let badge=b.querySelector('.on-air');
  if(on&&!badge){badge=document.createElement('span');badge.className='on-air';badge.textContent=live.blank?'HIDDEN':'LIVE';b.prepend(badge);}
  else if(on)badge.textContent=live.blank?'HIDDEN':'LIVE';
  else badge?.remove();
 }
}
$('showPick').addEventListener('change',ev=>{browse.showId=ev.target.value;browse.sceneId='';picked=null;$('sendBar').hidden=true;loadShows();});
$('scenePick').addEventListener('change',ev=>{browse.sceneId=ev.target.value;picked=null;$('sendBar').hidden=true;loadSlides(0);});
$('more').addEventListener('click',()=>loadSlides(browse.offset+100));

// ---- Connection ----
function connectEvents(){
 events?.close();
 events=new EventSource('/remote/api/events');
 events.onopen=()=>setConnection(true);
 events.onmessage=ev=>{try{applyLive(JSON.parse(ev.data));}catch{}};
 events.onerror=()=>{
  setConnection(false);
  // The browser retries a dropped stream by itself. A refused stream (signed out) is checked here instead.
  if(events?.readyState===EventSource.CLOSED){events=null;clearTimeout(retryTimer);retryTimer=setTimeout(checkSession,3000);}
 };
}
async function checkSession(){
 try{
  const r=await request('/remote/api/live');
  if(r.status===200){showRemote();applyLive(r.data);connectEvents();loadShows();return;}
  if(r.status!==401){setConnection(false);retryTimer=setTimeout(checkSession,5000);}
 }catch{setConnection(false);clearTimeout(retryTimer);retryTimer=setTimeout(checkSession,5000);}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!events&&!$('remote').hidden){clearTimeout(retryTimer);checkSession();}});

$('login').addEventListener('submit',async ev=>{
 ev.preventDefault();$('loginError').textContent='';
 const button=$('login').querySelector('button');button.disabled=true;
 try{
  const r=await request('/remote/api/login',{password:$('password').value});
  if(r.status===200){$('password').value='';await checkSession();}
  else $('loginError').textContent=r.data.error||'Could not sign in.';
 }catch{$('loginError').textContent='Could not reach Wordlight on this network.';}
 finally{button.disabled=false;}
});
$('signOut').addEventListener('click',async()=>{try{await request('/remote/api/logout',{});}catch{}showLogin();});
checkSession().then(()=>{if($('remote').hidden&&$('login').hidden)showLogin();});
