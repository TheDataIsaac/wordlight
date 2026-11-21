// Phone remote page. It is a controller: it sends what was typed or tapped, and Wordlight on the laptop finds the text,
// builds the screen and sends it out. Live updates arrive over one event stream that reconnects on its own; closing the
// phone or losing Wi-Fi never changes the screen. Browsing never changes the screen; only Send, Go, a tap in Slides and
// the controls at the bottom do. A double tap on a song part or a show's slide sends it at once.
import {timerSigned,timerState,formatTimer} from './remote/timer.mjs';
const $=id=>document.getElementById(id);
let live=null,clockOffset=0,events=null,busy=false,shows=[],picked=null,messageTimer,retryTimer,books=[],versions=[],versionsLoaded=false,tab='bible',deckShown='';
const browse={showId:'',sceneId:'',offset:0,total:0};
let songSettings={phoneTap:'select',checkFirst:true},lastTap={button:null,at:0};
const pickState={bookId:'',chapter:0};

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const saved=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
// crypto.randomUUID needs HTTPS; getRandomValues works on a plain LAN address.
function commandId(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');}
function say(text){$('message').textContent=text;clearTimeout(messageTimer);messageTimer=setTimeout(()=>{$('message').textContent='';},4000);}
function setConnection(ok,text){const el=$('connection');el.textContent=text||(ok?'Connected':'Reconnecting…');el.className='connection '+(ok?'ok':'bad');}
function element(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}

// Every request gives up after 6 s, so a stalled Wi-Fi connection never leaves the buttons waiting forever. A Bible
// preview waits longer, because an online version has its own limit of about 10 s.
async function request(path,body,waitMs=6000){
 const options=body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),waitMs);
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
 $('remote').hidden=true;$('signOut').hidden=true;$('sendBar').hidden=true;$('controls').hidden=true;$('login').hidden=false;
 setConnection(false,'Signed out');
}
function showRemote(){$('login').hidden=true;$('remote').hidden=false;$('signOut').hidden=false;$('controls').hidden=false;loadSettings();}
const TABS=['bible','songs','screen','shows','more'];
// Song settings live on the laptop, so the studio and the phone always show the same ones.
async function loadSettings(){
 let r;try{r=await request('/remote/api/settings');}catch{return;}
 if(r.status!==200)return;
 songSettings=r.data;
 if(!$('setLines').options.length)$('setLines').replaceChildren(...[[0,'As typed'],[1,'1'],[2,'2'],[3,'3'],[4,'4'],[5,'5'],[6,'6'],[8,'8']].map(([value,name])=>{const o=element('option','',name);o.value=String(value);return o;}));
 if([...$('secondVersion').options].some(o=>o.value===(r.data.secondVersion||'')))$('secondVersion').value=r.data.secondVersion||'';
 $('setLines').value=String(r.data.linesPerSlide);$('setRepeat').checked=r.data.hideRepeatMarks;$('setCaps').checked=r.data.allCaps;$('setFooter').checked=r.data.songFooter;$('setTap').checked=r.data.phoneTap==='send';
}
async function changeSettings(change){
 let r;try{r=await request('/remote/api/settings',change);}catch{r=null;}
 if(r?.status===200){songSettings=r.data;say('Saved.');}else{say('The setting was not saved. Try again.');await loadSettings();}
}
$('setLines').addEventListener('change',ev=>changeSettings({linesPerSlide:Number(ev.target.value)}));
// A second version under each verse sent from now on (shared with the studio). The verse on screen keeps its look.
$('secondVersion').addEventListener('change',ev=>changeSettings({secondVersion:ev.target.value}));
$('setRepeat').addEventListener('change',ev=>changeSettings({hideRepeatMarks:ev.target.checked}));
$('setCaps').addEventListener('change',ev=>changeSettings({allCaps:ev.target.checked}));
$('setFooter').addEventListener('change',ev=>changeSettings({songFooter:ev.target.checked}));
$('setTap').addEventListener('change',ev=>changeSettings({phoneTap:ev.target.checked?'send':'select'}));
function showTab(name){
 tab=name;save('wordlight-remote-tab',name);clearPicked();
 for(const t of TABS){$('panel-'+t).hidden=t!==name;$('tab-'+t).setAttribute('aria-selected',String(t===name));}
 if(name==='bible')loadBible();
 if(name==='shows')loadShows();
 if(name==='screen')loadScreen(0);
 if(name==='songs'&&!$('songResults').children.length)searchSongs();
 if(name==='more')loadSettings();
}
for(const b of document.querySelectorAll('[data-tab]'))b.addEventListener('click',()=>showTab(b.dataset.tab));

// ---- Live slide ----
function applyLive(summary,trust=false){
 if(!summary||typeof summary.updated!=='number')return;
 // A slow command reply must not replace a newer screen that already arrived on the live stream. A new stream and a
 // refusal are the companion's word, even if older: it may have restarted from the last save.
 if(live&&!trust&&summary.updated<live.updated)return;
 live=summary;clockOffset=summary.serverNow-Date.now();
 $('liveLabel').textContent=live.blank?'HIDDEN':'LIVE';$('liveLabel').classList.toggle('hidden-screen',live.blank);
 document.querySelector('.live').classList.toggle('blanked',live.blank);
 $('livePlace').textContent=[live.showTitle,live.sceneName].filter(Boolean).join(' · ');
 $('livePosition').textContent=live.count?(live.index+1)+' of '+live.count:'';
 $('liveTitle').textContent=live.current?.title||'Nothing on screen yet';
 $('liveText').textContent=live.current?.text||'';
 $('liveNext').textContent=live.next?'Next: '+live.next.title:live.verseSteps?'Next goes to the next verse.':live.count?'This is the last slide.':'';
 $('blank').textContent=live.blank?'Show screen':'Hide screen';$('blank').classList.toggle('restore',live.blank);
 $('back').hidden=!live.backTo;$('back').textContent='‹ Back to '+live.backTo;
 updateButtons();markOnAir();paintTimer();paintGraphics();paintWords();
 if(live.showId&&shows.length&&!shows.some(s=>s.id===live.showId))loadShows();
 if(tab==='screen'){if(deckKey()!==deckShown)loadScreen(0);else markScreen();}
}
function updateButtons(){
 const none=!live||!live.count,first=live?.index===0,last=live?.index>=live?.count-1;
 $('previous').disabled=none||(first&&!live.verseSteps);$('next').disabled=none||(last&&!live.verseSteps);
 $('next').textContent=last&&live?.verseSteps?'Next verse ›':'Next ›';$('previous').textContent=first&&live?.verseSteps?'‹ Prev verse':'‹ Previous';
 $('blank').disabled=!live;
 for(const b of document.querySelectorAll('#back,[data-timer],#timerShow,#send,[data-graphics]'))b.disabled=busy||!live;
}

// ---- Timer: shown from the last timer state; the ticking itself needs no network ----
function tickTimer(){
 const now=Date.now()+clockOffset;
 $('timerValue').textContent=formatTimer(timerSigned(live.timer,now));
 $('timerValue').dataset.state=timerState(live.timer,now);
}
function paintTimer(){
 if(!live){$('timerValue').textContent='--:--';return;}
 tickTimer();
 // Where the overlay shows is chosen in the studio's Timer; the phone says which.
 const places=live.timer.onScreen===false?'OBS only':live.timer.onObs===false?'projector/TV only':'projector/TV and OBS';
 $('timerShow').textContent=(live.timer.visible?'Hide timer':'Show timer')+' · on '+places;$('timerShow').classList.toggle('on',live.timer.visible);
 if(document.activeElement!==$('timerMinutes')&&!$('timerMinutes').value)$('timerMinutes').value=live.timer.durationMs/60000;
 if(document.activeElement!==$('timerUntil')&&!$('timerUntil').value)$('timerUntil').value=live.timer.untilTime;
 if(document.activeElement!==$('timerMode'))$('timerMode').value=live.timer.mode;
 showTimerFields();
}
// Minutes for a countdown or stopwatch, a time of day for "until".
function showTimerFields(){const until=$('timerMode').value==='until';$('timerMinutesField').hidden=until;$('timerUntilField').hidden=!until;}
$('timerMode').addEventListener('change',showTimerFields);
setInterval(()=>{if(live?.timer.running&&!document.hidden)tickTimer();},250);

// ---- Commands: one at a time. A retry after a timeout or network error sends the same id, so the companion
// applies the command at most once and answers a retry with the first result. ----
// Next, Previous, Hide and a tap on a slide never wait for a verse or song still loading: Hide has to work at once.
async function command(body){
 const urgent=['next','previous','goto','blank','word'].includes(body.action);
 if(busy&&!urgent)return false;
 if(!urgent){busy=true;updateButtons();}
 body.id=commandId();
 // A send repeated after a network gap carries the screen seen at the tap, so the companion can refuse it if the
 // screen has moved on since. Next, Previous and Back already say so with base. Hide is never held back.
 const seen=live?.updated;
 try{
  for(let attempt=0;;attempt++){
   if(attempt&&!urgent&&body.base===undefined&&seen!==undefined)body.seen=seen;
   try{
    const r=await request('/remote/api/command',body);
    if(r.data.live)applyLive(r.data.live,r.status===409);
    if(r.status!==200&&r.status!==401)say(r.data.error||'That did not work.');
    return r.status===200;
   }catch{
    if(attempt>=2){say('Could not reach Wordlight. Check the screen before trying again.');return false;}
    await sleep(500*2**attempt);
   }
  }
 }finally{if(!urgent){busy=false;updateButtons();}}
}
$('previous').addEventListener('click',()=>live&&command({action:'previous',base:live.updated}));
$('next').addEventListener('click',()=>live&&command({action:'next',base:live.updated}));
$('blank').addEventListener('click',()=>live&&command({action:'blank',blank:!live.blank}));
$('back').addEventListener('click',()=>live&&command({action:'back',base:live.updated}));

// ---- Send to live: everything that is picked first waits here ----
function pick(title,send){picked={title,send};$('sendWhat').textContent=title;$('sendBar').hidden=false;}
function clearPicked(){picked=null;$('sendBar').hidden=true;markPicked();}
// One tap picks. A second tap on the same button sends, or the first does when the setting says so. Songs that have not
// been checked always wait for the Send button, so the words get read first.
function tapped(button,title,send,unchecked=false){
 pick(title,send);
 const now=Date.now(),twice=lastTap.button===button&&now-lastTap.at<400;lastTap=twice?{button:null,at:0}:{button,at:now};
 if(unchecked&&songSettings.checkFirst){if(twice)say('Read the words first, then tap Send to live.');return;}
 if(twice||songSettings.phoneTap==='send')$('send').click();
}
$('send').addEventListener('click',async()=>{
 if(!picked)return;
 // "Sent", not "on screen": the studio may have sent something newer meanwhile; the live card shows what is on.
 const {title,send}=picked;
 if(await command({...send})){say('Sent: '+title);if(send.action==='bible')bibleSent();clearPicked();}
});

// ---- Bible ----
function bibleCommand(){return {action:'bible',reference:$('reference').value,version:$('version').value};}
async function loadBible(){
 if(versionsLoaded)return;
 try{
  const [v,b]=await Promise.all([request('/remote/api/bible/versions'),request('/remote/api/bible/books')]);
  if(v.status!==200||b.status!==200)return;
  books=b.data.books;versions=v.data.versions;
  const choice=saved('wordlight-remote-version',live?.version||'')||v.data.versions[0]?.id;
  $('version').replaceChildren(...v.data.versions.map(x=>option(x.id,x.id.toUpperCase()+(x.installed?'':' (online)'),x.id===choice)));
  $('secondVersion').replaceChildren(option('','No second version',!songSettings.secondVersion),...v.data.versions.map(x=>option(x.id,x.id.toUpperCase()+(x.installed?'':' (online)'),x.id===songSettings.secondVersion)));
  versionsLoaded=true;paintPicker();
 }catch{}
}
$('version').addEventListener('change',()=>{save('wordlight-remote-version',$('version').value);lookSoon();});
let lookRequest=0,lookTimer;
function note(text){$('preview').replaceChildren(element('p','note',text));}
// An online version can fail mid-service. Another version is never used on its own; this gives one tap to choose it.
function offerInstalled(text){
 if(versions.find(v=>v.id===$('version').value)?.installed)return;
 const row=element('div','chips');
 for(const v of versions.filter(x=>x.installed).slice(0,3))row.append(gridButton('Use '+v.id.toUpperCase(),()=>{$('version').value=v.id;look(text);}));
 $('preview').append(row);
}
function lookSoon(){
 clearTimeout(lookTimer);lookRequest++;clearPicked();
 const text=$('reference').value.trim();paintHints(text);
 if(!text){$('preview').replaceChildren();return;}
 // A book name with no number yet is still being typed. Words that are not the start of a book name are a quote.
 if(/\d/.test(text))lookTimer=setTimeout(()=>look(text),180);
 else if(isQuote(text))lookTimer=setTimeout(()=>searchWords(text),400);
}
// "for God so loved" is a quote to search for: no digits, two or more words, and not the start of a book name.
function isQuote(text){
 const name=text.toLowerCase();
 return !/\d/.test(text)&&text.split(/\s+/).filter(w=>w.length>1).length>=2&&!books.some(b=>b.name.toLowerCase().startsWith(name));
}
// Verses that contain the typed words, from the Bibles installed on the laptop. A tap picks a verse, a double tap sends
// it, in the version chosen above. With pickTop, the best match is picked (never sent) so Go never sends a guess.
async function searchWords(text,pickTop=false){
 const mine=++lookRequest;
 let r;try{r=await request('/remote/api/bible/search?q='+encodeURIComponent(text));}catch{if(mine===lookRequest)note('Could not reach Wordlight.');return;}
 if(mine!==lookRequest)return;
 if(r.status!==200){note(r.data.error||'The verse search did not work.');return;}
 if(!r.data.searched.length){note('Finding a verse by its words needs a Bible installed on the laptop.');return;}
 if(!r.data.results.length){note('No verse in '+r.data.searched.join(', ')+' has these words. Try fewer words.');return;}
 const version=$('version').value,list=element('ol','slides');
 for(const hit of r.data.results){
  const li=element('li'),b=listButton(hit.reference+(hit.exact?' · exact words':''),hit.text);li.append(b);
  const send={action:'bible',reference:hit.reference,version};
  b.addEventListener('click',()=>{tapped(b,hit.reference+' · '+version.toUpperCase(),send);for(const other of list.querySelectorAll('button'))other.setAttribute('aria-pressed',String(other===b));});
  list.append(li);
 }
 $('preview').replaceChildren(element('h3','','Verses with these words'),list);
 if(pickTop){const first=list.querySelector('button');first.setAttribute('aria-pressed','true');pick(r.data.results[0].reference+' · '+version.toUpperCase(),{action:'bible',reference:r.data.results[0].reference,version});say('Check the verse, then tap Send to live.');}
}
async function look(text){
 const mine=++lookRequest;
 let r;try{r=await request('/remote/api/bible/look?q='+encodeURIComponent(text)+'&version='+encodeURIComponent($('version').value),undefined,14000);}catch{if(mine===lookRequest){note('Could not reach Wordlight, or the lookup took too long.');offerInstalled(text);}return;}
 if(mine!==lookRequest)return;
 if(r.status!==200){note(r.data.error||'That passage was not found.');offerInstalled(text);return;}
 const shown=r.data.verses.map(v=>element('p','',v.verse+'  '+v.text));
 if(r.data.total>shown.length)shown.push(element('p','muted','and '+(r.data.total-shown.length)+' more verses'));
 $('preview').replaceChildren(element('h3','',r.data.reference+' · '+r.data.version),...shown);
 pick(r.data.reference+' · '+r.data.version,{...bibleCommand(),reference:r.data.reference});
}
function paintHints(text){
 const name=text.toLowerCase(),found=text&&!/\d\s/.test(text)&&!/\d$/.test(text)?books.filter(b=>b.name.toLowerCase().startsWith(name)||b.name.toLowerCase().replace(/^\d /,'').startsWith(name)).slice(0,6):[];
 $('bookHints').replaceChildren(...found.map(b=>{const c=element('button','',b.name);c.type='button';c.addEventListener('click',()=>{$('reference').value=b.name+' ';$('reference').focus();lookSoon();});return c;}));
}
function bibleSent(){
 const recent=saved('wordlight-remote-recent',[]).filter(r=>r.reference!==live?.showTitle);
 if(live?.showTitle)save('wordlight-remote-recent',[{reference:live.showTitle,version:$('version').value},...recent].slice(0,8));
 $('reference').value='';$('preview').replaceChildren();paintHints('');paintRecent();
}
function paintRecent(){
 $('recent').replaceChildren(...saved('wordlight-remote-recent',[]).map(r=>{const c=element('button','',r.reference);c.type='button';c.addEventListener('click',()=>{$('reference').value=r.reference;if([...$('version').options].some(o=>o.value===r.version))$('version').value=r.version;look(r.reference);});return c;}));
}
$('reference').addEventListener('input',lookSoon);
// Go on the phone keyboard sends straight away; the laptop finds the verse itself if the preview has not finished.
$('bibleForm').addEventListener('submit',async ev=>{
 ev.preventDefault();clearTimeout(lookTimer);lookRequest++;
 if(!$('reference').value.trim())return;
 $('reference').blur();
 const text=$('reference').value;
 if(isQuote(text.trim())){searchWords(text.trim(),true);return;}
 if(await command(bibleCommand())){say('Sent: '+live.showTitle);bibleSent();clearPicked();}
 else{note($('message').textContent||'That verse was not sent.');offerInstalled(text);}
});

// Book, chapter and verse picker. The tap on a verse fills in the reference and shows it, ready to send.
function gridButton(text,tap){const b=element('button','',text);b.type='button';b.addEventListener('click',tap);return b;}
function paintPicker(){
 const book=books.find(b=>b.id===pickState.bookId);
 $('pickUp').hidden=!book;$('pickGrid').classList.toggle('names',!book);
 if(!book){$('pickTitle').textContent='Book';$('pickGrid').replaceChildren(...books.map(b=>gridButton(b.name,()=>{pickState.bookId=b.id;pickState.chapter=0;paintPicker();})));return;}
 if(!pickState.chapter){$('pickTitle').textContent=book.name+': chapter';$('pickGrid').replaceChildren(...book.verses.map((n,i)=>gridButton(String(i+1),()=>{pickState.chapter=i+1;paintPicker();})));return;}
 $('pickTitle').textContent=book.name+' '+pickState.chapter+': verse';
 $('pickGrid').replaceChildren(...Array.from({length:book.verses[pickState.chapter-1]||0},(_,i)=>gridButton(String(i+1),()=>{$('reference').value=book.name+' '+pickState.chapter+':'+(i+1);look($('reference').value);})));
}
$('pickUp').addEventListener('click',()=>{if(pickState.chapter)pickState.chapter=0;else pickState.bookId='';paintPicker();});
$('pickToggle').addEventListener('click',()=>{const open=$('picker').hidden;$('picker').hidden=!open;$('pickToggle').setAttribute('aria-expanded',String(open));$('pickToggle').textContent=open?'Close the picker':'Pick book, chapter and verse';});

// ---- Songs ----
let songRequest=0,songTimer;
async function searchSongs(){
 const mine=++songRequest;
 let r;try{r=await request('/remote/api/songs?q='+encodeURIComponent($('songSearch').value.trim()));}catch{if(mine===songRequest)say('Could not load the songs. Try again.');return;}
 if(mine!==songRequest)return;
 if(r.status!==200){say(r.data.error||'The song library could not be read.');return;}
 $('songDetail').hidden=true;$('songResults').hidden=false;
 const rows=r.data.songs.map(s=>{
  const li=element('li'),b=listButton((s.status==='reserve'?'Check first: ':'')+s.name,s.line||s.category);li.append(b);
  b.addEventListener('click',()=>openSong(s));return li;
 });
 $('songResults').replaceChildren(...(rows.length?rows:[element('li','muted','No songs found.')]));
}
async function openSong({id,position:matched,fullLine,status}){
 let r;try{r=await request('/remote/api/song?id='+encodeURIComponent(id));}catch{say('Could not open the song. Try again.');return;}
 if(r.status!==200){say(r.data.error||'Could not open the song.');return;}
 $('songTitle').textContent=r.data.title;$('songResults').hidden=true;$('songDetail').hidden=false;
 $('songParts').replaceChildren(...r.data.parts.map(part=>{
  const li=element('li'),b=listButton(part.section,part.text);b.dataset.id=String(part.position);li.append(b);
  // The part the search matched is scrolled to, so the operator lands on the words being sung.
  if(part.position===matched)setTimeout(()=>b.scrollIntoView({block:'center'}),0);
  b.addEventListener('click',()=>{for(const o of $('songParts').querySelectorAll('button'))o.setAttribute('aria-pressed',String(o===b));tapped(b,r.data.title+' · '+part.section,{action:'song',songId:id,position:part.position,...(part.position===matched&&fullLine?{line:fullLine}:{})},status==='reserve');});
  return li;
 }));
}
function listButton(title,text){
 const b=element('button');b.type='button';b.setAttribute('aria-pressed','false');
 b.append(element('span','title',title),element('span','text',text));return b;
}
$('songSearch').addEventListener('input',()=>{clearTimeout(songTimer);songTimer=setTimeout(searchSongs,150);});
$('songBack').addEventListener('click',()=>{clearPicked();$('songDetail').hidden=true;$('songResults').hidden=false;});

// ---- Slides on screen: a tap goes straight to that slide ----
const deckKey=()=>live?live.count+'|'+live.deck+'|'+live.showTitle+'|'+live.sceneName:'';
let screenRequest=0,screenOffset=0;
async function loadScreen(offset){
 const mine=++screenRequest;
 let r;try{r=await request('/remote/api/screen?offset='+offset);}catch{return;}
 if(mine!==screenRequest||r.status!==200)return;
 screenOffset=offset;deckShown=deckKey();
 const rows=r.data.slides.map((s,i)=>{
  const li=element('li'),position=offset+i,b=listButton((position+1)+'. '+s.title,s.text);b.dataset.index=String(position);li.append(b);
  b.addEventListener('click',()=>live&&command({action:'goto',index:position,slideId:s.id,base:live.updated}));return li;
 });
 if(offset===0)$('screenSlides').replaceChildren(...rows);else $('screenSlides').append(...rows);
 $('screenMore').hidden=offset+r.data.slides.length>=r.data.total;
 markScreen();
}
// The words of the slide on screen, each once, as buttons.
function paintWords(){
 const text=live?.current?.text||'',seen=new Set(),lit=new Set((live?.words||[]).map(w=>w.toLowerCase())),chips=[];
 for(const [word] of text.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu)){
  const key=word.toLowerCase();if(seen.has(key)||chips.length>=40)continue;seen.add(key);
  const b=gridButton(word,()=>live&&command({action:'word',word,base:live.updated}));b.classList.toggle('on',lit.has(key));chips.push(b);
 }
 $('liveWords').replaceChildren(...chips);$('wordsBox').hidden=!chips.length;
}
function markScreen(){
 for(const b of $('screenSlides').querySelectorAll('button')){
  const on=!!live&&Number(b.dataset.index)===live.index;let badge=b.querySelector('.on-air');
  if(on&&!badge){badge=element('span','on-air');b.prepend(badge);}
  if(on)badge.textContent=live.blank?'HIDDEN':'LIVE';else badge?.remove();
 }
}
$('screenMore').addEventListener('click',()=>loadScreen(screenOffset+100));

// ---- Shows saved on the laptop (read only until Send to live) ----
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
 paintItems(show);
 await loadSlides(0);
}
// Items are a list, so every item of the service can be seen and reached with one tap.
function paintItems(show){
 $('items').replaceChildren(...(show?.scenes||[]).map(scene=>{
  const li=element('li'),b=listButton(scene.name,'');b.dataset.scene=scene.id;b.setAttribute('aria-pressed',String(scene.id===browse.sceneId));li.append(b);
  b.addEventListener('click',()=>{browse.sceneId=scene.id;clearPicked();for(const o of $('items').querySelectorAll('button'))o.setAttribute('aria-pressed',String(o===b));loadSlides(0);});
  return li;
 }));
 markItems();
}
function markItems(){
 for(const b of $('items').querySelectorAll('button')){
  const on=!!live&&live.showId===browse.showId&&live.sceneId===b.dataset.scene;let badge=b.querySelector('.on-air');
  if(on&&!badge){badge=element('span','on-air');b.prepend(badge);}
  if(on)badge.textContent=live.blank?'HIDDEN':'LIVE';else badge?.remove();
 }
}
async function loadSlides(offset){
 if(!browse.showId)return;
 const mine=++slidesRequest;
 let r;try{r=await request('/remote/api/slides?show='+encodeURIComponent(browse.showId)+'&scene='+encodeURIComponent(browse.sceneId)+'&offset='+offset);}catch{if(mine===slidesRequest)say('Could not load the slides. Try again.');return;}
 if(mine!==slidesRequest)return;
 if(r.status!==200){if(r.status===404)say(r.data.error);return;}
 browse.offset=offset;browse.total=r.data.total;
 const items=r.data.slides.map((slide,i)=>{
  const li=element('li'),b=listButton((offset+i+1)+'. '+slide.title,slide.text);b.dataset.id=slide.id;li.append(b);
  b.addEventListener('click',()=>{tapped(b,slide.title,{action:'send',showId:browse.showId,sceneId:browse.sceneId,slideId:slide.id});markPicked();});
  return li;
 });
 if(offset===0)$('slides').replaceChildren(...items);else $('slides').append(...items);
 if(!browse.total)$('slides').replaceChildren(element('li','muted','This item has no slides.'));
 $('more').hidden=offset+r.data.slides.length>=browse.total;
 markOnAir();markPicked();
}
function markPicked(){
 const send=picked?.send;
 for(const b of $('slides').querySelectorAll('button'))b.setAttribute('aria-pressed',String(send?.action==='send'&&send.slideId===b.dataset.id&&send.sceneId===browse.sceneId&&send.showId===browse.showId));
 if(!picked)for(const b of $('songParts').querySelectorAll('button'))b.setAttribute('aria-pressed','false');
}
function markOnAir(){
 markItems();
 const here=live&&live.showId===browse.showId&&live.sceneId===browse.sceneId;
 for(const b of $('slides').querySelectorAll('button')){
  const on=here&&live.current?.id===b.dataset.id;let badge=b.querySelector('.on-air');
  if(on&&!badge){badge=element('span','on-air',live.blank?'HIDDEN':'LIVE');b.prepend(badge);}
  else if(on)badge.textContent=live.blank?'HIDDEN':'LIVE';
  else badge?.remove();
 }
}
$('showPick').addEventListener('change',ev=>{browse.showId=ev.target.value;browse.sceneId='';clearPicked();loadShows();});
$('more').addEventListener('click',()=>loadSlides(browse.offset+100));

// ---- More: text, timer and OBS graphics ----
$('textForm').addEventListener('submit',async ev=>{
 ev.preventDefault();
 if(await command({action:'text',heading:$('textHeading').value,body:$('textBody').value})){say('Sent to live.');$('textHeading').value='';$('textBody').value='';}
});
for(const b of document.querySelectorAll('[data-timer]'))b.addEventListener('click',()=>command({action:'timer',timer:b.dataset.timer}));
$('timerShow').addEventListener('click',()=>live&&command({action:'timer',timer:live.timer.visible?'hide':'show'}));
$('timerForm').addEventListener('submit',ev=>{ev.preventDefault();command({action:'timer-set',minutes:$('timerMinutes').value,until:$('timerUntil').value,mode:$('timerMode').value});});
for(const b of document.querySelectorAll('[data-graphics]'))b.addEventListener('click',()=>{
 const element=b.dataset.graphics,shown=!!live?.graphics[element].visible;
 command({action:'graphics',element,visible:!shown,title:$('cardTitle').value,subtitle:$('cardSubtitle').value});
});
function paintGraphics(){
 if(!live)return;
 for(const b of document.querySelectorAll('[data-graphics]')){
  // A graphics timer switched on while the laptop's Timer keeps the timer out of OBS is not on air: say why instead.
  const shown=live.graphics[b.dataset.graphics].visible,blocked=shown&&b.dataset.graphics==='timer'&&live.timer?.onObs===false;
  b.classList.toggle('on',shown&&!blocked);b.classList.toggle('blocked',blocked);
  if(b.dataset.graphics==='timer'){
   b.textContent=blocked?'Timer: off OBS':'Timer';
   // The reason goes on its own line under the buttons, so the buttons stay the same size.
   const row=b.closest('.toggles');let note=document.getElementById('graphicsTimerNote');
   if(!note&&row){note=document.createElement('p');note.id='graphicsTimerNote';note.className='graphics-note';row.after(note);}
   if(note){note.hidden=!blocked;note.textContent=blocked?'The timer is kept off OBS by the Timer settings. To show it, tick OBS in Timer on the laptop.':'';}
  }
  if(b.dataset.graphics==='card')b.textContent=shown?'Hide title card':'Show title card';
 }
 if(document.activeElement!==$('cardTitle')&&!$('cardTitle').value)$('cardTitle').value=live.graphics.card.title;
 if(document.activeElement!==$('cardSubtitle')&&!$('cardSubtitle').value)$('cardSubtitle').value=live.graphics.card.subtitle;
}

// ---- Connection ----
function connectEvents(){
 events?.close();
 events=new EventSource('/remote/api/events');heard=Date.now();
 let fresh=true;
 events.onopen=()=>{setConnection(true);fresh=true;heard=Date.now();};
 events.onmessage=ev=>{heard=Date.now();try{applyLive(JSON.parse(ev.data),fresh);fresh=false;}catch{}};
 events.addEventListener('ping',()=>{heard=Date.now();});
 events.onerror=()=>{
  setConnection(false);
  // The browser retries a dropped stream by itself. A refused stream (signed out) is checked here instead.
  if(events?.readyState===EventSource.CLOSED){events=null;clearTimeout(retryTimer);retryTimer=setTimeout(checkSession,3000);}
 };
}
async function checkSession(){
 try{
  const r=await request('/remote/api/live');
  if(r.status===200){showRemote();applyLive(r.data);connectEvents();await loadBible();paintRecent();showTab(TABS.includes(tab)?tab:'bible');return;}
  if(r.status!==401){setConnection(false);retryTimer=setTimeout(checkSession,5000);}
 }catch{setConnection(false);clearTimeout(retryTimer);retryTimer=setTimeout(checkSession,5000);}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!events&&!$('remote').hidden){clearTimeout(retryTimer);checkSession();}});
// The companion sends something every 25 seconds. A stream that has been silent for a minute is dead even if the
// browser still shows it open (Wi-Fi dropped, or the phone slept), so it is opened again and brings the current screen.
let heard=Date.now();
function reviveStream(){if(events&&!document.hidden&&!$('remote').hidden&&Date.now()-heard>60000){setConnection(false);connectEvents();}}
setInterval(reviveStream,10000);document.addEventListener('visibilitychange',reviveStream);

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
tab=saved('wordlight-remote-tab','bible');
checkSession().then(()=>{if($('remote').hidden&&$('login').hidden)showLogin();});
