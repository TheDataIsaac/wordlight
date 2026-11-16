// The studio in a real browser, driven with real key presses: the only test that runs dist/app.js. It uses Chrome or
// Edge if one is installed, and is skipped otherwise. Everything runs on test ports with throwaway folders.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {newSong,editSong} from './dist/songs.mjs';

const cwd=path.dirname(fileURLToPath(import.meta.url)),port=18850,debugPort=18851,site='http://127.0.0.1:'+port+'/';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const browserPath=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&existsSync(p));
let dir,server,chrome,socket,nextId=0;const waiting=new Map(),pageErrors=[];

function cdp(method,params={}){const id=++nextId;socket.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>waiting.set(id,{resolve,reject}));}
async function run(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function until(expression,what){for(let i=0;i<400;i++){if(await run(expression))return;await wait(50);}assert.fail('Timed out waiting for '+what);}
async function key(name,{code=name,text,modifiers=0}={}){
 const keyCode={Enter:13,PageDown:34,' ':32}[name]||0;
 await cdp('Input.dispatchKeyEvent',{type:text?'keyDown':'rawKeyDown',key:name,code,text,modifiers,windowsVirtualKeyCode:keyCode});
 await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:name,code,modifiers,windowsVirtualKeyCode:keyCode});
}
const ALT=1,SHIFT=8;
async function clickOn(selector){
 const box=await run('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
 for(const type of ['mousePressed','mouseReleased'])await cdp('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1});
}
const liveState=async()=>{const r=await run("fetch('/api/state').then(r=>r.json()).then(s=>({index:s.live.index,blank:s.live.blank,count:s.live.slides.length,text:s.live.slides[s.live.index]?.text||''}))");return r;};
async function open(){await cdp('Page.navigate',{url:site});await until("document.querySelector('[data-action=settings-open]')!==null",'the studio to reach the companion');}
// A release check (WORDLIGHT_RELEASE_CHECK=1, npm run release-check) refuses to skip: these are the only tests of the studio.
if(!browserPath&&process.env.WORDLIGHT_RELEASE_CHECK)throw new Error('The release check needs Chrome or Edge for the studio tests. Install one or set CHROME_PATH.');
const skip=browserPath?false:'No Chrome or Edge on this computer';

before(async()=>{
 if(skip)return;
 dir=await mkdtemp(path.join(tmpdir(),'wordlight-browser-'));
 // A tiny installed Bible, so the phone has a version that needs no internet.
 await mkdir(path.join(dir,'data','bibles','kjv'),{recursive:true});
 await writeFile(path.join(dir,'data','bibles','kjv','manifest.json'),JSON.stringify({id:'kjv',abbreviation:'KJV',name:'King James Version',credit:'Test',verses:1}));
 await writeFile(path.join(dir,'data','bibles','kjv','JHN.json'),JSON.stringify([['In the beginning was the Word'],[],Array.from({length:20},(_,i)=>'Sample verse '+(i+1))]));
 server=spawn(process.execPath,['server.mjs','--no-open'],{cwd,env:{...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_REMOTE_PORT:String(port+5),WORDLIGHT_REMOTE_BIND:'127.0.0.1',WORDLIGHT_DATA_DIR:path.join(dir,'data'),WORDLIGHT_FREESHOW_INDEX:path.join(dir,'none.json')},stdio:'ignore'});
 for(let i=0;i<60;i++){try{if((await fetch(site+'api/health')).ok)break;}catch{}await wait(100);}
 const song=editSong(newSong('Test Hymn'),{meta:{artist:'Test Choir',status:'book'},lyrics:'[Verse 1]\nFirst unique words here\n\n[Verse 2]\nSecond unique words here\n\n[Verse 3]\nThird unique words here\n\n[Verse 4]\nFourth unique words here',arrangement:'Verse 1, Verse 2, Verse 3, Verse 4'});
 await fetch(site+'api/songs/library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({song})});
 chrome=spawn(browserPath,['--headless=new','--remote-debugging-port='+debugPort,'--user-data-dir='+path.join(dir,'browser'),'--no-first-run','--disable-gpu','--window-size=1600,1000','about:blank'],{stdio:'ignore'});
 let target;for(let i=0;i<100&&!target;i++){try{target=(await (await fetch('http://127.0.0.1:'+debugPort+'/json')).json()).find(t=>t.type==='page');}catch{}await wait(100);}
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>{socket.onopen=r;});
 socket.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&waiting.has(m.id)){const w=waiting.get(m.id);waiting.delete(m.id);w.resolve(m.result||{});}if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
 await cdp('Runtime.enable');await cdp('Page.enable');await open();
});
after(async()=>{
 if(skip)return;
 socket?.close();chrome?.kill();server?.kill();await wait(500);await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
});

async function searchFor(words){
 await run("document.querySelector('[data-tab=songs]').click()");await until("document.querySelector('#songQuery')!==null",'the search box');
 await run("document.querySelector('#songQuery').focus()");await run("document.querySelector('#songQuery').value='';document.querySelector('#songQuery').dispatchEvent(new Event('input',{bubbles:true}))");
 await cdp('Input.insertText',{text:words});await until("(document.querySelector('.song-hit')?.innerText||'').includes('Test Hymn')",'a search result');
}
test('Enter looks at a song, Alt+Enter in the box sends that song, and the first look changes nothing on screen',{skip},async()=>{
 const before=await liveState();
 await searchFor('third unique');await key('Enter');
 await until("document.querySelector('#preview').innerText.includes('Third unique words')",'the matched verse in the preview');
 assert.deepEqual(await liveState(),before,'looking does not change the screen');
 await searchFor('second unique');await key('Enter',{modifiers:ALT});
 await until("fetch('/api/state').then(r=>r.json()).then(s=>(s.live.slides[s.live.index]?.text||'').includes('Second unique'))",'Alt+Enter to send the song that was typed');
});
test('Reloading with a song on screen still reaches the companion',{skip},async()=>{
 await open();
 assert.match((await liveState()).text,/Second unique/);
 assert.deepEqual(pageErrors,[],'no script error in the page');
});
test('Space and clicker keys step the screen forward wherever the focus was left, and never bring back a hidden screen',{skip},async()=>{
 await run("document.querySelector('[data-action=send]').focus()");
 const start=await liveState();
 await key(' ',{code:'Space',text:' '});await until('fetch(\'/api/state\').then(r=>r.json()).then(s=>s.live.index==='+(start.index+1)+')','Space to move on, not press Send');
 await searchFor('fourth unique');
 await key('PageDown');await until('fetch(\'/api/state\').then(r=>r.json()).then(s=>s.live.index==='+(start.index+2)+')','Page Down from the search box');
 await run("document.querySelector('[data-action=blank]')?.click()");await until('fetch(\'/api/state\').then(r=>r.json()).then(s=>s.live.blank===true)','the screen to hide');
 await run('document.activeElement.blur()');await key('PageUp',{code:'PageUp'});await wait(300);
 assert.equal((await liveState()).blank,true,'a hidden screen stays hidden');
 await run("document.querySelector('[data-action=blank]')?.click()");await until('fetch(\'/api/state\').then(r=>r.json()).then(s=>s.live.blank===false)','the screen to come back');
});
test('A second tab does not lose shows: the first tab follows it instead of replacing its work',{skip},async()=>{
 const shows=await run("fetch('/api/state').then(r=>r.json()).then(s=>s.library.shows.length)");
 await run("fetch('/api/state').then(r=>r.json()).then(s=>{const next=structuredClone(s.library);next.shows.push({...structuredClone(next.shows[0]),id:'second-tab-show'});next.savedAt=Date.now()+1000;return fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({library:next,baseSavedAt:s.library.savedAt||0})});})");
 await clickOn('[data-action=settings-open]');await run("document.querySelector('#settingsDialog').close()");
 await run("document.querySelector('#sessionTitle').value='Edited in the old tab';document.querySelector('#sessionTitle').dispatchEvent(new Event('input',{bubbles:true}))");
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.library.shows.some(x=>x.id==='second-tab-show'))&&(document.querySelector('#toast').textContent.includes('Another Wordlight tab')||true)",'the show to stay');
 await wait(1200);
 assert.equal(await run("fetch('/api/state').then(r=>r.json()).then(s=>s.library.shows.length)"),shows+2,'the other tab\u2019s show was kept, and this tab\u2019s edit stays as a copy');
 assert.equal(await run("fetch('/api/state').then(r=>r.json()).then(s=>s.library.shows.some(x=>x.draft.title==='Edited in the old tab (copy from this tab)'))"),true);
});
test('A new song is saved to the song library as well as the show',{skip},async()=>{
 await run("document.querySelector('[data-tab=songs]').click()");await until("document.querySelector('[data-action=song-new]')!==null",'the New song button');
 await run("document.querySelector('[data-action=song-new]').click()");await until("document.querySelector('#songDialog').open",'the song editor');
 assert.equal(await run("document.querySelector('[data-action=song-editor-save]').textContent"),'Save song');
 assert.equal(await run("document.querySelector('[data-action=song-editor-library]')"),null,'one button is enough for a new song');
 await run("document.querySelector('#songTitle').value='Brand New Hymn';document.querySelector('#songLyrics').value='[Verse 1]\\nOne\\nTwo\\nThree\\n\\nFour\\nFive'");
 await run("document.querySelector('[data-action=song-editor-save]').click()");await until("!document.querySelector('#songDialog').open",'the song editor to close');
 await until("fetch('/api/songs?source=wordlight&limit=5&q=Brand%20New%20Hymn').then(r=>r.text()).then(t=>t.includes('Brand New Hymn'))",'the song in the library');
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.draft.songs?.some(x=>x.song.title==='Brand New Hymn'&&/^wl-/.test(x.song.id)))",'the show to hold the library copy');
});

// A verse as the phone sends it: on screen, but not part of any item in the studio.
const sendPhoneVerse=async text=>{await run("fetch('/api/state').then(r=>r.json()).then(s=>fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({live:{...s.live,blank:false,index:0,showId:undefined,sceneId:undefined,showTitle:'John 3:16',bibleVersion:'kjv',slides:[{...(s.live.slides[0]||{}),id:'passage-0',type:'passage',title:'John 3:16',reference:'John 3:16',text:"+JSON.stringify(text)+"}],style:{...s.live.style,highlights:[],highlightWords:[]},updated:Math.max(Date.now(),s.live.updated||0)+1000}})}))");await until("fetch('/api/state').then(r=>r.json()).then(s=>s.live.bibleVersion==='kjv')",'the phone verse');};
test('A word on a verse sent from the phone can be clicked in the Words panel and reaches the screen',{skip},async()=>{
 await open();await run("document.querySelector('[data-tab=words]').click()");
 await sendPhoneVerse('For God so loved the world');
 await until("[...document.querySelectorAll('#liveWords .word-token')].some(b=>b.textContent==='loved')",'the verse on screen in the Words panel');
 await run("[...document.querySelectorAll('#liveWords .word-token')].find(b=>b.textContent==='loved').click()");
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.live.style.highlightWords.includes('loved'))",'the word to light up on screen');
 await until("[...document.querySelectorAll('#liveWords .word-token')].find(b=>b.textContent==='loved')?.classList.contains('highlighted')",'the panel to show the word lit');
 assert.deepEqual(pageErrors,[],'no script error in the page');
});
test('The reference size controls reach the preview and stay after a reload',{skip},async()=>{
 await run("document.querySelector('[data-tab=design]').click()");await until("document.querySelector('#referenceSize')!==null",'the reference size control');
 await run("const s=document.querySelector('#referenceSize');s.value='60';s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}))");
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.draft.referenceSize===60)",'the size to save');
 await open();await run("document.querySelector('[data-tab=design]').click()");await until("document.querySelector('#referenceSize')?.value==='60'",'the size to come back after a reload');
 await run("const s=document.querySelector('#referenceSize');s.value='30';s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}))");
});
test('A repeated label no longer stops a song being edited, and pasted lyrics split at blank lines',{skip},async()=>{
 await run("document.querySelector('[data-tab=songs]').click()");await until("document.querySelector('[data-action=song-new]')!==null",'the New song button');
 await run("document.querySelector('[data-action=song-new]').click()");await until("document.querySelector('#songDialog').open",'the song editor');
 await run("document.querySelector('#songTitle').value='Pasted From WhatsApp';document.querySelector('#songLyrics').value='Line one\\nLine two\\n\\nLine three\\n\\n[Chorus]\\nSing\\n\\n[Chorus]\\nSing'");
 await run("document.querySelector('[data-action=song-editor-save]').click()");await until("!document.querySelector('#songDialog').open",'the song editor to close');
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.draft.songs?.some(x=>x.song.title==='Pasted From WhatsApp'))",'the song to save');
 const saved=await run("fetch('/api/state').then(r=>r.json()).then(s=>s.draft.songs.find(x=>x.song.title==='Pasted From WhatsApp').song)");
 assert.deepEqual(saved.sections.map(s=>[s.label,s.slides.length]),[['Verse 1',2],['Chorus',1]]);
 assert.equal(saved.arrangements[0].order.length,3,'the repeated chorus stays in the order');
});
test('The phone: every item in a list, a word lit with a tap, and one tap to an installed Bible when a version fails',{skip},async()=>{
 const post=(p,b)=>fetch(site+'api/remote/'+p,{method:'POST',headers:{'Content-Type':'application/json',Origin:site.slice(0,-1)},body:JSON.stringify(b)});
 assert.equal((await post('password',{password:'sample pass 1'})).status,200);assert.equal((await post('enabled',{enabled:true})).status,200);
 await sendPhoneVerse('For God so loved the world');
 await cdp('Page.navigate',{url:'http://127.0.0.1:'+(port+5)+'/remote'});await until("document.querySelector('#password')!==null&&!document.querySelector('#login').hidden",'the sign-in form');
 await run("document.querySelector('#password').value='sample pass 1';document.querySelector('#login').requestSubmit()");await until("!document.querySelector('#remote').hidden",'the remote');
 await run("document.querySelector('#tab-screen').click()");await until("[...document.querySelectorAll('#liveWords button')].some(b=>b.textContent==='world')",'the words of the slide on screen');
 await run("[...document.querySelectorAll('#liveWords button')].find(b=>b.textContent==='world').click()");
 await until("[...document.querySelectorAll('#liveWords button')].find(b=>b.textContent==='world')?.classList.contains('on')",'the word to show as lit');
 assert.deepEqual((await (await fetch(site+'api/state')).json()).live.style.highlightWords,['world']);
 await run("document.querySelector('#tab-shows').click()");await until("document.querySelectorAll('#items button').length>0",'the item list');
 await run("document.querySelector('#tab-bible').click();document.querySelector('#version').value='nkjv';document.querySelector('#reference').value='John 99:1';document.querySelector('#reference').dispatchEvent(new Event('input',{bubbles:true}))");
 await until("[...document.querySelectorAll('#preview button')].some(b=>b.textContent==='Use KJV')",'the offer of an installed Bible');
 assert.deepEqual(pageErrors,[],'no script error in the page');
 await open();
});
test('The projector page is counted, so a second click never opens a second window, and it hides the cursor and buttons',{skip},async()=>{
 await cdp('Page.navigate',{url:site+'?view=output&projector=1'});await until("document.body.classList.contains('projector')",'the projector page');
 await until("fetch('/api/bridge/code').then(r=>r.json()).then(d=>d.viewers.projector===1)",'the projector to be counted');
 const answer=await run("fetch('/api/projector/open',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json())");
 assert.equal(answer.already,true);
 assert.equal(await run("getComputedStyle(document.body).cursor"),'none');assert.equal(await run("getComputedStyle(document.querySelector('.output-tools')).display"),'none');
 await open();
});

// The order of events is forced by holding back or dropping one answer in the page.
const editTitle=async title=>{await run("document.querySelector('#sessionTitle').value="+JSON.stringify(title)+";document.querySelector('#sessionTitle').dispatchEvent(new Event('input',{bubbles:true}))");};
const savedTitle=title=>"fetch('/api/state').then(r=>r.json()).then(s=>s.draft.title==="+JSON.stringify(title)+")";
const restoreFetch="if(window.realFetch){window.fetch=window.realFetch;delete window.realFetch;}";
test('A save whose answer was lost, followed by another edit, keeps that edit',{skip},async()=>{
 await open();
 await run("window.realFetch=window.fetch;let dropped=false;window.fetch=async(u,o)=>{const r=await window.realFetch(u,o);if(!dropped&&u==='/api/state'&&o?.body?.includes('First on disk')){dropped=true;throw new TypeError('answer lost');}return r;}");
 await editTitle('First on disk');await until(savedTitle('First on disk'),'the first save to arrive');
 await editTitle('Second must survive');await until(savedTitle('Second must survive'),'the second edit to reach the disk');
 await run(restoreFetch);
 assert.equal(await run("document.querySelector('#sessionTitle').value"),'Second must survive');
});
test('After an outage, a tab with older shows keeps its edits as a copy and does not overwrite newer work',{skip},async()=>{
 await open();await editTitle('Before the outage');await until(savedTitle('Before the outage'),'a clean start');await wait(600);
 await cdp('Network.enable');await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});await wait(300);
 await editTitle('Typed during the outage');await wait(800);
 const s=await (await fetch(site+'api/state')).json(),next=structuredClone(s.library),gone=next.shows.find(x=>x.id!==next.activeShowId);next.shows=next.shows.filter(x=>x!==gone);next.shows.push({...structuredClone(next.shows[0]),id:'other-writer-show'});next.savedAt=Date.now()+60000;
 assert.equal((await fetch(site+'api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({library:next,baseSavedAt:s.library.savedAt})})).status,200);
 await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.library.shows.some(x=>x.draft.title==='Typed during the outage (copy from this tab)'))",'the typed edit to be kept as a copy');
 const after=await (await fetch(site+'api/state')).json();
 assert.ok(after.library.shows.some(x=>x.id==='other-writer-show'),'the other writer\u2019s show is still there');
 assert.ok(!after.library.shows.some(x=>x.draft.title===gone.draft.title+' (copy from this tab)'),'a show deleted elsewhere and untouched here stays deleted');
});
test('A verse step that finishes late never replaces a newer screen, and stays in preview',{skip},async()=>{
 await open();await run("document.querySelector('[data-tab=passage]')?.click()");await until("document.querySelector('#referenceLookup')!==null",'the Bible panel');
 await until("[...document.querySelector('#lookupTranslation').options].some(o=>o.value==='kjv')",'the versions');
 await run("const s=document.querySelector('#lookupTranslation');s.value='kjv';s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#referenceLookup').value='John 3:16';document.querySelector('[data-action=lookup]').click()");
 await until("document.querySelector('#preview').innerText.includes('Sample verse 16')",'John 3:16 in the preview');
 await run("document.querySelector('[data-action=send]').click()");await until("fetch('/api/state').then(r=>r.json()).then(s=>s.live.slides[s.live.index]?.text.includes('Sample verse 16'))",'the verse on screen');
 await run("window.realFetch=window.fetch;window.gate=new Promise(r=>{window.openGate=r;});window.fetch=async(u,o)=>{if(String(u).startsWith('/api/bibles/passage'))await window.gate;return window.realFetch(u,o);}");
 await until("document.querySelector('[data-action=verse-next]')&&!document.querySelector('[data-action=verse-next]').disabled",'the Next verse button');
 await run("document.querySelector('[data-action=verse-next]').click()");await wait(100);
 await run("window.realFetch('/api/state').then(r=>r.json()).then(s=>window.realFetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({live:{...s.live,slides:[{...s.live.slides[0],text:'NEW SCREEN FROM THE PHONE'}],index:0,updated:Date.now()+5000}})}))");
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.live.slides[0].text==='NEW SCREEN FROM THE PHONE')",'the other screen');
 await wait(300);await run("window.openGate()");await wait(800);await run(restoreFetch);
 assert.equal((await liveState()).text,'NEW SCREEN FROM THE PHONE');
 assert.match(await run("document.querySelector('#preview').innerText"),/Sample verse 17/);
});
test('Two quick captures keep two library songs',{skip},async()=>{
 await open();await run("document.querySelector('[data-tab=songs]').click()");await until("document.querySelector('#captureLine')!==null",'quick capture');
 await run("document.querySelector('#captureTool').open=true");
 await run("window.realFetch=window.fetch;window.gate=new Promise(r=>{window.openGate=r;});let first=true;window.fetch=async(u,o)=>{const r=await window.realFetch(u,o);if(first&&u==='/api/songs/library'&&o?.method==='POST'){first=false;await window.gate;}return r;}");
 const send=async text=>{await run("document.querySelector('#captureLine').focus();document.querySelector('#captureLine').value="+JSON.stringify(text));await key('Enter');};
 await send('FIRST CAPTURE FOR REVIEW');await until("fetch('/api/state').then(r=>r.json()).then(s=>s.live.slides[s.live.index]?.text.includes('FIRST CAPTURE'))",'the first capture on screen');await wait(200);
 await run("document.querySelector('[data-action=item-new]').click()");await wait(300);
 await run("document.querySelector('[data-tab=songs]').click()");await until("document.querySelector('#captureLine')!==null",'quick capture again');await run("document.querySelector('#captureTool').open=true");
 await send('SECOND CAPTURE FOR REVIEW');await wait(400);await run("window.openGate()");await wait(1000);await run(restoreFetch);
 const found=await (await fetch(site+'api/songs?source=wordlight&limit=10&q=CAPTURE%20FOR%20REVIEW')).json(),titles=found.items.map(s=>s.name).sort();
 assert.deepEqual(titles,['FIRST CAPTURE FOR REVIEW','SECOND CAPTURE FOR REVIEW']);
});
test('The arrangement chosen in song search is the one sent to the screen',{skip},async()=>{
 await open();
 const song=editSong(newSong('Two Orders'),{lyrics:'[Verse 1]\nFIRST ORDER words\n\n[Verse 2]\nSECOND ORDER words',arrangement:'Verse 1, Verse 2'});
 song.arrangements.push({id:'reverse',name:'Reverse order',order:[...song.arrangements[0].order].reverse(),hidden:{}});
 assert.ok((await fetch(site+'api/songs/library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({song})})).ok);
 await run("document.querySelector('[data-tab=songs]').click()");await until("document.querySelector('#songQuery')!==null",'the search box');
 await run("document.querySelector('#songQuery').focus()");await cdp('Input.insertText',{text:'Two Orders'});await until("(document.querySelector('.song-hit')?.innerText||'').includes('Two Orders')",'a search result');
 await run("document.querySelector('[data-action=song-peek]').click()");await until("document.querySelector('#songArrangement')!==null",'the arrangement choice');
 await run("const s=document.querySelector('#songArrangement');s.value='reverse';s.dispatchEvent(new Event('change',{bubbles:true}))");await wait(100);
 await until("document.querySelector('#preview').innerText.includes('SECOND ORDER')",'the preview to follow');
 await run("document.querySelector('[data-action=send]').click()");await until("fetch('/api/state').then(r=>r.json()).then(s=>s.live.slides[s.live.index]?.text.includes('SECOND ORDER'))",'the chosen order on screen');
});
test('A new song can still be kept in the show when the library cannot be written',{skip},async()=>{
 await open();await run("document.querySelector('[data-tab=songs]').click()");await until("document.querySelector('[data-action=song-new]')!==null",'the New song button');
 await run("document.querySelector('[data-action=song-new]').click()");await until("document.querySelector('#songDialog').open",'the song editor');
 await run("window.realFetch=window.fetch;window.fetch=async(u,o)=>u==='/api/songs/library'?new Response(JSON.stringify({error:'The song library could not be written.'}),{status:500}):window.realFetch(u,o)");
 await run("document.querySelector('#songTitle').value='Library Is Down';document.querySelector('#songLyrics').value='Words for tonight'");
 await run("document.querySelector('[data-action=song-editor-save]').click()");await until("document.querySelector('[data-action=song-editor-show-only]')?.hidden===false",'the show-only choice');
 await run("document.querySelector('[data-action=song-editor-show-only]').click()");await until("!document.querySelector('#songDialog').open",'the editor to close');await run(restoreFetch);
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.draft.songs?.some(x=>x.song.title==='Library Is Down'))",'the song in the show');
});
test('A studio that opens during a save failure is told straight away',{skip},async()=>{
 const blocker=path.join(dir,'data','live.tmp');await mkdir(blocker);
 const s=await (await fetch(site+'api/state')).json();
 const answer=await (await fetch(site+'api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({live:{...s.live,updated:Date.now()+90000}})})).json();
 assert.equal(answer.saveFailed,true);
 const stream=await fetch(site+'api/events'),reader=stream.body.getReader(),first=new TextDecoder().decode((await reader.read()).value);await reader.cancel();
 assert.match(first,/"saveProblem":true/);
 await rm(blocker,{recursive:true,force:true});
});
test('A reload never lets an old browser copy replace newer work, and its edit is kept as a copy',{skip},async()=>{
 await open();await editTitle('Agreed title');await until(savedTitle('Agreed title'),'a clean start');await wait(600);
 const s=await (await fetch(site+'api/state')).json(),next=structuredClone(s.library);next.shows.find(x=>x.id===next.activeShowId).draft.brand='NEWER WORK';next.savedAt=Date.now()+200000;
 assert.equal((await fetch(site+'api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({library:next,baseSavedAt:s.library.savedAt})})).status,200);
 // The browser's stored copy gets a later edit made on the old library, then the page reloads.
 await run("(()=>{const l=JSON.parse(localStorage.getItem('wordlight-library'));const a=l.shows.find(x=>x.id===l.activeShowId);a.draft.title='Old copy edit';a.updated=Date.now()+300000;l.savedAt=Date.now()+300000;localStorage.setItem('wordlight-library',JSON.stringify(l));})()");
 await open();
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.library.shows.some(x=>x.draft.title==='Old copy edit (copy from this tab)'))",'the old edit to be kept as a copy');
 const after=await (await fetch(site+'api/state')).json();
 assert.equal(after.library.shows.find(x=>x.id===after.library.activeShowId).draft.brand,'NEWER WORK');
});
test('A save from another tab with the very same time is not mistaken for this tab\u2019s own',{skip},async()=>{
 await open();await editTitle('Before same time');await until(savedTitle('Before same time'),'a clean start');await wait(600);
 await run("window.realFetch=window.fetch;let done=false;window.fetch=async(u,o)=>{if(!done&&u==='/api/state'&&o?.body?.includes('Mine same time')){done=true;const b=JSON.parse(o.body);b.writeId='another-tab';b.library.shows.find(s=>s.id===b.library.activeShowId).draft.title='Other same time';await window.realFetch(u,{...o,body:JSON.stringify(b)});}return window.realFetch(u,o);}");
 await editTitle('Mine same time');
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.library.shows.some(x=>x.draft.title==='Mine same time (copy from this tab)'))",'this tab\u2019s edit to be kept');
 await run(restoreFetch);
});
test('With no agreed library yet, an edit on an older copy is still kept',{skip},async()=>{
 await open();await editTitle('Agreed before the update');await until(savedTitle('Agreed before the update'),'a clean start');await wait(600);
 const s=await (await fetch(site+'api/state')).json(),next=structuredClone(s.library);next.shows.find(x=>x.id===next.activeShowId).draft.brand='COMPANION BRAND';next.savedAt=Date.now()+400000;next.shows.find(x=>x.id===next.activeShowId).updated=next.savedAt;
 assert.equal((await fetch(site+'api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({library:next,baseSavedAt:s.library.savedAt})})).status,200);
 await run("(()=>{localStorage.removeItem('wordlight-library-acked');const l=JSON.parse(localStorage.getItem('wordlight-library'));l.shows.find(x=>x.id===l.activeShowId).draft.title='Edit from before the update';l.savedAt=Date.now()+1000;localStorage.setItem('wordlight-library',JSON.stringify(l));})()");
 await open();
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.library.shows.some(x=>x.draft.title==='Edit from before the update (copy from this tab)'))",'the edit to be kept as a copy');
});
test('A second conflict before the first copy is saved keeps that copy, under one name',{skip},async()=>{
 await open();await editTitle('Clean before conflicts');await until(savedTitle('Clean before conflicts'),'a clean start');await wait(600);
 const other=async(brand,ahead)=>{const s=await (await fetch(site+'api/state')).json(),next=structuredClone(s.library);next.shows.find(x=>x.id===next.activeShowId).draft.brand=brand;next.savedAt=Date.now()+ahead;return fetch(site+'api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({library:next,baseSavedAt:s.library.savedAt})});};
 assert.equal((await other('REMOTE ONE',500000)).status,200);
 await run("window.realFetch=window.fetch;let done=false;window.fetch=async(u,o)=>{if(!done&&u==='/api/state'&&o?.body?.includes('Only here (copy from this tab)')){done=true;const s=await window.realFetch('/api/state').then(r=>r.json());const next=structuredClone(s.library);next.shows.find(x=>x.id===next.activeShowId).draft.brand='REMOTE TWO';next.savedAt=Date.now()+600000;await window.realFetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({library:next,baseSavedAt:s.library.savedAt})});}return window.realFetch(u,o);}");
 await editTitle('Only here');
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.library.shows.some(x=>x.draft.title==='Only here (copy from this tab)'))",'the copy to reach the disk');await run(restoreFetch);
 const after=await (await fetch(site+'api/state')).json();
 assert.equal(after.library.shows.find(x=>x.id===after.library.activeShowId).draft.brand,'REMOTE TWO');
 assert.ok(!after.library.shows.some(x=>x.draft.title.includes('(copy from this tab) (copy from this tab)')),'one name, not two');
});
test('Shift+Enter sends like Alt+Enter, but in a multi-line box it still starts a new line',{skip},async()=>{
 await open();await searchFor('first unique');await key('Enter',{modifiers:SHIFT});
 await until("fetch('/api/state').then(r=>r.json()).then(s=>(s.live.slides[s.live.index]?.text||'').includes('First unique'))",'Shift+Enter to send the song that was typed');
 await searchFor('fourth unique');await key('Enter');
 await until("document.querySelector('#preview').innerText.includes('Fourth unique words')",'the fourth verse in the preview');
 await run("const box=document.querySelector('#captureLine');box.closest('details')?.setAttribute('open','');box.focus()");
 assert.equal(await run("document.activeElement.id"),'captureLine');
 await key('Enter',{modifiers:SHIFT});await wait(300);
 assert.match((await liveState()).text,/First unique/,'Shift+Enter in the capture box did not send the preview');
 await run("document.querySelector('[data-tab=songs]').focus()");await key('Enter',{modifiers:SHIFT});
 await until("fetch('/api/state').then(r=>r.json()).then(s=>(s.live.slides[s.live.index]?.text||'').includes('Fourth unique'))",'Shift+Enter outside a box to send the preview');
});
test('The passage picker sends to the screen with Shift+Enter or its Send to screen button',{skip},async()=>{
 await open();await run("document.querySelector('[data-tab=passage]')?.click()");await until("document.querySelector('#referenceLookup')!==null",'the Bible panel');
 await until("[...document.querySelector('#lookupTranslation').options].some(o=>o.value==='kjv')",'the versions');
 await run("const s=document.querySelector('#lookupTranslation');s.value='kjv';s.dispatchEvent(new Event('change',{bubbles:true}))");
 const choose=async verse=>{
  await run("document.querySelector('[data-action=picker-open]').click()");await until("document.querySelector('#pickerDialog').open",'the picker');
  // The picker remembers the last selection, and a second verse click would extend it into a range.
  await run("document.querySelector('[data-action=picker-clear]')?.click()");
  await run("document.querySelector('[data-picker-book=JHN]').click()");await until("document.querySelector('[data-picker-chapter=\"3\"]')!==null",'the chapters');
  await run("document.querySelector('[data-picker-chapter=\"3\"]').click()");await until("document.querySelector('[data-picker-verse=\""+verse+"\"]')!==null",'the verses');
  await run("document.querySelector('[data-picker-verse=\""+verse+"\"]').click()");await run("document.querySelector('[data-picker-verse=\""+verse+"\"]').focus()");
 };
 await choose(5);await key('Enter',{modifiers:SHIFT});
 await until("fetch('/api/state').then(r=>r.json()).then(s=>(s.live.slides[s.live.index]?.text||'').includes('Sample verse 5'))",'Shift+Enter in the picker to send John 3:5');
 assert.equal(await run("document.querySelector('#pickerDialog').open"),false,'the picker closed');
 await choose(7);await run("document.querySelector('[data-action=picker-send]').click()");
 await until("fetch('/api/state').then(r=>r.json()).then(s=>(s.live.slides[s.live.index]?.text||'').includes('Sample verse 7'))",'the Send to screen button to send John 3:7');
 await choose(9);await run("document.querySelector('[data-action=picker-load]').click()");
 await until("document.querySelector('#preview').innerText.includes('Sample verse 9')",'Load preview to show John 3:9');
 assert.match((await liveState()).text,/Sample verse 7/,'Load preview leaves the screen alone');
});
test('A lit word on a verse from the phone goes out with a second click, also while a text slide is selected',{skip},async()=>{
 const lit=(word,on=true)=>"fetch('/api/state').then(r=>r.json()).then(s=>s.live.style.highlightWords.includes('"+word+"')==="+on+")";
 const token=word=>"[...document.querySelectorAll('#liveWords .word-token')].find(b=>b.textContent==='"+word+"')";
 await open();await run("document.querySelector('[data-tab=words]').click()");
 await sendPhoneVerse('For God so loved the world');await until(token('loved')+'!==undefined','the verse in the Words panel');
 await run(token('loved')+'.click()');await until(lit('loved'),'the word to light up on screen');
 await until(token('loved')+"?.classList.contains('highlighted')",'the panel to show the word lit');
 await run(token('loved')+'.click()');await until(lit('loved',false),'the word to go out on screen');
 await until('!'+token('loved')+".classList.contains('highlighted')",'the panel to show the word plain');
 await until("fetch('/api/state').then(r=>r.json()).then(s=>!s.library.shows.find(x=>x.id===s.library.activeShowId).draft.notes.some(n=>n.word==='loved'))",'the word to leave the saved item');
 // With a text slide in the preview the item's words are not listed, so the click on the verse is the way to clear one.
 await run("document.querySelector('[data-tab=slides]').click()");await run("document.querySelector('[data-action=new-text]').click()");
 await until("document.activeElement?.id==='textHeading'",'the new slide ready to type in');
 await run("document.querySelector('[data-tab=words]').click()");await sendPhoneVerse('For God so loved the world');
 await until(token('world')+'!==undefined','the verse in the Words panel');
 await run(token('world')+'.click()');await until(lit('world'),'the second word to light up on screen');
 await until(token('world')+"?.classList.contains('highlighted')",'the panel to show the second word lit');
 await run(token('world')+'.click()');await until(lit('world',false),'the second word to go out on screen');
 assert.deepEqual(pageErrors,[],'no script error in the page');
});
test('After a lookup the cursor is back in the Bible box, so the next reference is typed there and no letter is a shortcut',{skip},async()=>{
 await open();await run("document.querySelector('[data-tab=passage]')?.click()");await until("document.querySelector('#referenceLookup')!==null",'the Bible panel');
 await until("[...document.querySelector('#lookupTranslation').options].some(o=>o.value==='kjv')",'the versions');
 await run("const s=document.querySelector('#lookupTranslation');s.value='kjv';s.dispatchEvent(new Event('change',{bubbles:true}))");
 const live=text=>"fetch('/api/state').then(r=>r.json()).then(s=>!s.live.blank&&(s.live.slides[s.live.index]?.text||'')==="+JSON.stringify(text)+")";
 // No colon: the way a reference is typed in a hurry.
 await run("{const b=document.querySelector('#referenceLookup');b.focus();b.select();}");await cdp('Input.insertText',{text:'john 3 16'});await key('Enter',{modifiers:SHIFT});
 await until(live('Sample verse 16'),'John 3:16 on screen');
 await until("document.activeElement?.id==='referenceLookup'",'the cursor to return to the box');
 assert.equal(await run("(()=>{const b=document.querySelector('#referenceLookup');return b.selectionStart===0&&b.selectionEnd===b.value.length&&b.value;})()"),'John 3:16','the old reference is selected, ready to be typed over');
 // B on the page hides the screen. Typed now, it is only a letter in the box.
 await key('b',{code:'KeyB',text:'b'});await wait(300);
 assert.equal(await run("document.querySelector('#referenceLookup').value"),'b');assert.equal((await liveState()).blank,false,'the screen was not hidden');
 await run("document.querySelector('#referenceLookup').select()");await cdp('Input.insertText',{text:'john 3.5'});await key('Enter',{modifiers:SHIFT});
 await until(live('Sample verse 5'),'John 3:5 on screen');
 assert.deepEqual(pageErrors,[],'no script error in the page');
});
test('A reference typed while a slow one is still loading takes its place, and Send waits for it',{skip},async()=>{
 await open();await run("document.querySelector('[data-tab=passage]')?.click()");await until("document.querySelector('#referenceLookup')!==null",'the Bible panel');
 await until("[...document.querySelector('#lookupTranslation').options].some(o=>o.value==='kjv')",'the versions');
 await run("const s=document.querySelector('#lookupTranslation');s.value='kjv';s.dispatchEvent(new Event('change',{bubbles:true}))");
 const type=async(text,modifiers=0)=>{await run("{const b=document.querySelector('#referenceLookup');b.focus();b.select();}");await cdp('Input.insertText',{text});await key('Enter',{modifiers});};
 const onScreen=text=>"fetch('/api/state').then(r=>r.json()).then(s=>(s.live.slides[s.live.index]?.text||'')==="+JSON.stringify(text)+")";
 await type('john 3:2',SHIFT);await until(onScreen('Sample verse 2'),'John 3:2 on screen');
 // Verse lookups now take over a second, like an online Bible on a slow line.
 await run("window.realFetch=window.fetch;window.fetch=(url,options)=>String(url).includes('/api/bibles/passage')?new Promise(r=>setTimeout(r,1200)).then(()=>window.realFetch(url,options)):window.realFetch(url,options)");
 await type('john 3:8',SHIFT);await wait(150);
 // Send while it loads must not put the earlier verse up again in its place.
 await run("document.querySelector('[data-action=send]').click()");
 await type('john 3:11',SHIFT);await until(onScreen('Sample verse 11'),'the second reference on screen');
 await wait(1500);
 assert.equal((await liveState()).text,'Sample verse 11','the slow first answer did not come back over it');
 assert.equal(await run("document.querySelector('#referenceLookup').value"),'John 3:11');
 await run('window.fetch=window.realFetch');
 assert.deepEqual(pageErrors,[],'no script error in the page');
});

test('Words typed in the Bible box find the verse: Enter previews it, and Shift+Enter sends an exact match',{skip},async()=>{
 await open();await run("document.querySelector('[data-tab=passage]')?.click()");await until("document.querySelector('#referenceLookup')!==null",'the Bible panel');
 await until("[...document.querySelector('#lookupTranslation').options].some(o=>o.value==='kjv')",'the versions');
 await run("const s=document.querySelector('#lookupTranslation');s.value='kjv';s.dispatchEvent(new Event('change',{bubbles:true}))");
 const before=await liveState();
 await run("{const b=document.querySelector('#referenceLookup');b.focus();b.select();}");await cdp('Input.insertText',{text:'beginning was the word'});await key('Enter');
 await until("(document.querySelector('.verse-result.active')?.innerText||'').includes('John 1:1')",'the found verse marked in the list');
 await until("(document.querySelector('#preview .verse-text')?.textContent||'')==='In the beginning was the Word'",'the verse in the preview');
 assert.deepEqual(await liveState(),before,'Enter never changes the screen');
 await run("{const b=document.querySelector('#referenceLookup');b.focus();b.select();}");await cdp('Input.insertText',{text:'In the beginning was the Word'});await key('Enter',{modifiers:SHIFT});
 await until("fetch('/api/state').then(r=>r.json()).then(s=>(s.live.slides[s.live.index]?.text||'')==='In the beginning was the Word')",'the exact match on screen');
 // A reference typed afterwards closes the list.
 await run("{const b=document.querySelector('#referenceLookup');b.focus();b.select();}");await cdp('Input.insertText',{text:'John 3:2'});await key('Enter');
 await until("document.querySelector('#verseResults')?.innerHTML===''",'the list to close');
 assert.deepEqual(pageErrors,[],'no script error in the page');
});

test('The timer counts down to a time of day, warns the operator in amber, and the audience overlay stays plain until zero',{skip},async()=>{
 await open();
 await run("document.querySelector('[data-action=timer]').click()");await until("document.querySelector('#timerDialog')?.open",'the timer dialog');
 // A time a few minutes from now, inside a 10-minute warning, so the readout is amber straight away.
 await run("{const d=new Date(Date.now()+3*60000);const s=document.querySelector('#timerMode');s.value='until';s.dispatchEvent(new Event('change'));document.querySelector('#timerUntil').value=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');document.querySelector('#timerWarn').value='600';document.querySelector('#timerOverrun').checked=true;}");
 assert.equal(await run("document.querySelector('#timerMinutesField').hidden"),true,'minutes are hidden for a time of day');
 await run("document.querySelector('[data-action=timer-apply]').click()");
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.live.timer.mode==='until'&&s.live.timer.targetAt>0&&s.live.timer.overrun&&s.live.timer.warnMs===600000)",'the time-of-day timer on air');
 await until("document.querySelector('#timerReadout')?.classList.contains('warning')",'the amber readout');
 await until("/^0[23]:[0-9][0-9]$/.test(document.querySelector('#timerReadout').textContent)",'about three minutes left');
 await run("document.querySelector('[data-action=timer-show]').click()");
 await until("document.querySelector('#liveStage .timer-overlay')!==null",'the overlay in the live view');
 assert.equal(await run("document.querySelector('#liveStage .timer-overlay').classList.contains('warning')"),false,'no amber on the audience output');
 assert.match(await run("document.querySelector('#timerStatus').textContent"),/^Counting to \d\d:\d\d/);
 await run("document.querySelector('[data-action=timer-hide]').click()");await run("document.querySelector('#timerDialog').close()");
 assert.deepEqual(pageErrors,[],'no script error in the page');
});

test('The Stage dialog hides a message and shows it again, and sets how much of the next slide the stage shows',{skip},async()=>{
 await open();
 await run("document.querySelector('[data-action=stage-open]').click()");await until("document.querySelector('#stageDialog')?.open&&document.querySelector('#stageNextLines')",'the stage dialog');
 await run("{const f=document.querySelector('#stageMessageText');f.value='Five minutes';document.querySelector('[data-stage=show]').click();}");
 await until("document.querySelector('[data-stage=hide]')!==null",'the Hide button');
 await run("document.querySelector('[data-stage=hide]').click()");
 await until("document.querySelector('[data-stage=unhide]')?.textContent==='Show again'",'Show again');
 assert.equal(await run("fetch('/api/stage').then(r=>r.json()).then(s=>s.message.hidden&&s.message.text)"),'Five minutes');
 await run("{const s=document.querySelector('#stageNextLines');s.value='0';s.dispatchEvent(new Event('change',{bubbles:true}));}");
 await until("fetch('/api/settings').then(r=>r.json()).then(s=>s.stageNextLines===0)",'the setting saved');
 await run("document.querySelector('[data-stage=clear]').click()");
 await until("fetch('/api/stage').then(r=>r.json()).then(s=>s.message===null)",'the message cleared');
 await run("document.querySelector('#stageDialog').close()");
 assert.deepEqual(pageErrors,[],'no script error in the studio');
 // The stage page itself shows the whole next slide now.
 await cdp('Page.navigate',{url:site+'stage'});
 await until("document.querySelector('#nextText')?.dataset.lines==='0'",'the stage page to follow the setting');
 assert.equal(await run("getComputedStyle(document.querySelector('#nextText')).display"),'block');
 assert.equal(await run("document.querySelector('#message').hidden"),true);
 await run("fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stageNextLines:2})})");
 await until("document.querySelector('#nextText')?.dataset.lines==='2'",'back to two lines');
 assert.deepEqual(pageErrors,[],'no script error on the stage page');
});

test('Listen offers the one-time download before anything else, and the bar stays hidden while listening is off',{skip},async()=>{
 await open();
 assert.equal(await run("document.querySelector('#listenBar').hidden"),true);
 await run("document.querySelector('[data-action=listen-open]').click()");
 await until("document.querySelector('#listenDialog')?.open&&document.querySelector('[data-listen=install]')",'the download button');
 assert.match(await run("document.querySelector('#listenDialog').textContent"),/one-time download of about \d+ MB/);
 await run("document.querySelector('[data-listen=close]').click()");
 assert.equal(await run("document.querySelector('#listenDialog').open"),false);
 assert.deepEqual(pageErrors,[],'no script error in the studio');
});

test('Hiding the screen while a verse is still loading keeps it hidden: the late verse is not sent',{skip},async()=>{
 await open();await run("document.querySelector('[data-tab=passage]')?.click()");await until("document.querySelector('#referenceLookup')!==null",'the Bible panel');
 await until("[...document.querySelector('#lookupTranslation').options].some(o=>o.value==='kjv')",'the versions');
 await run("const s=document.querySelector('#lookupTranslation');s.value='kjv';s.dispatchEvent(new Event('change',{bubbles:true}))");
 await run("document.querySelector('#screenToggle').textContent.includes('Show')&&document.querySelector('#screenToggle').click()");
 await until("fetch('/api/state').then(r=>r.json()).then(s=>!s.live.blank)",'the screen shown');
 await run("window.realFetch=window.fetch;window.fetch=(url,options)=>String(url).includes('/api/bibles/passage')?new Promise(r=>setTimeout(r,1200)).then(()=>window.realFetch(url,options)):window.realFetch(url,options)");
 await run("{const b=document.querySelector('#referenceLookup');b.focus();b.select();}");await cdp('Input.insertText',{text:'john 3:12'});await key('Enter',{modifiers:SHIFT});
 await wait(150);
 await run("document.querySelector('#screenToggle').click()");
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.live.blank)",'the screen hidden');
 await wait(1800);
 const state=await liveState();
 assert.equal(state.blank,true,'still hidden after the verse arrived');
 assert.notEqual(state.text,'Sample verse 12','the late verse was not sent');
 assert.match(await run("document.querySelector('#toast').textContent"),/screen just changed/);
 await run('window.fetch=window.realFetch');
 await run("document.querySelector('#screenToggle').click()");
 assert.deepEqual(pageErrors,[],'no script error in the page');
});

test('When the library is full, changes from a stale tab are saved as a file instead of being dropped',{skip},async()=>{
 await open();
 await run("window.__downloads=[];HTMLAnchorElement.prototype.click=function(){window.__downloads.push(this.download);}");
 const original=await run("fetch('/api/state').then(r=>r.json()).then(s=>s.library.shows.length)");
 // Another tab fills the library to 100 shows.
 await run("fetch('/api/state').then(r=>r.json()).then(s=>{const next=structuredClone(s.library);while(next.shows.length<100)next.shows.push({...structuredClone(next.shows[0]),id:'full-'+next.shows.length});next.savedAt=Date.now()+1000;return fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({library:next,baseSavedAt:s.library.savedAt||0})});})");
 await run("document.querySelector('#sessionTitle').value='Edited when full';document.querySelector('#sessionTitle').dispatchEvent(new Event('input',{bubbles:true}))");
 await until("window.__downloads.length>0",'the kept changes downloaded');
 assert.match(await run("window.__downloads[0]"),/Wordlight-changes-kept-from-this-tab/);
 assert.match(await run("document.querySelector('#toast').textContent"),/library is full/);
 // Put the library back for the tests after this one.
 await run("fetch('/api/state').then(r=>r.json()).then(s=>{const next=structuredClone(s.library);next.shows=next.shows.filter(x=>!String(x.id).startsWith('full-')).slice(0,"+original+");next.activeShowId=next.shows[0].id;next.savedAt=Date.now()+2000;return fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({library:next,baseSavedAt:s.library.savedAt||0})});})");
 assert.deepEqual(pageErrors,[],'no script error in the page');
});

test('A notice from the companion shows at the top of the studio until it is dismissed',{skip},async()=>{
 await writeFile(path.join(dir,'data','notices.json'),JSON.stringify([{id:'n1',at:Date.now(),kind:'update',level:'info',text:'Wordlight was updated to 9.9.9.'}]));
 await open();
 await until("document.querySelector('#noticeBar')&&!document.querySelector('#noticeBar').hidden&&document.querySelector('#noticeBar').textContent.includes('updated to 9.9.9')",'the notice');
 await run("document.querySelector('[data-notice=n1]').click()");
 await until("document.querySelector('#noticeBar').hidden",'the bar to close');
 await until("fetch('/api/notices').then(r=>r.json()).then(s=>s.notices.length===0)",'the notice dismissed on the companion');
 assert.deepEqual(pageErrors,[],'no script error in the page');
});

test('Typing writes the browser copy of the library a few times, not once per key, and the last words are kept',{skip},async()=>{
 await open();
 await run("window.__writes=0;const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='wordlight-library')window.__writes++;return set.call(this,k,v);}");
 await run("(async()=>{const box=document.querySelector('#sessionTitle');for(const ch of 'Typed quickly, thirty letters'){box.value+=ch;box.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,15));}})()");
 await wait(800);
 const writes=await run('window.__writes');
 assert.ok(writes>=1&&writes<=4,'one write per quarter second at most, got '+writes);
 assert.match(await run("JSON.parse(localStorage.getItem('wordlight-library')).shows.find(s=>s.draft.title.includes('Typed quickly')).draft.title"),/thirty letters$/);
 assert.deepEqual(pageErrors,[],'no script error in the page');
});

test('Song files from other programs: one goes into the show, several go into the song library',{skip},async()=>{
 await open();
 const folder=path.join(dir,'imports');await mkdir(folder,{recursive:true});
 const usr=path.join(folder,'River Song.usr'),cho=path.join(folder,'Open Door.cho'),txt=path.join(folder,'Plain Song.txt');
 await writeFile(usr,'[File]\r\nType=SongSelect Import File\r\n[S A123]\r\nTitle=River Song\r\nFields=Verse 1/tChorus\r\nWords=River line one/nRiver line two/tRiver chorus\r\n');
 await writeFile(cho,'{title: Open Door}\n[G]Door line one\nDoor line two\n');
 await writeFile(txt,'Plain words here\nMore plain words\n');
 const pick=async files=>{const {root}=await cdp('DOM.getDocument');const {nodeId}=await cdp('DOM.querySelector',{nodeId:root.nodeId,selector:'#songFile'});await cdp('DOM.setFileInputFiles',{nodeId,files});};
 await pick([usr,cho]);
 await until("document.querySelector('#toast').textContent.includes('Added 2 songs to the library')",'the two songs in the library');
 await until("fetch('/api/songs?q=river%20chorus').then(r=>r.json()).then(s=>s.items.some(i=>i.name==='River Song'))",'River Song findable by its words');
 await pick([usr,cho]);
 await until("document.querySelector('#toast').textContent.includes('2 already there were skipped')",'the second import skipped');
 await pick([txt]);
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.draft.songs?.some(x=>x.song.title==='Plain Song'))",'the single song in the show');
 assert.deepEqual(pageErrors,[],'no script error in the page');
});

test('Pictures become slides that show the picture, can fill the screen, and can be taken off again',{skip},async()=>{
 await open();
 const file=path.join(dir,'Notice Board.png');
 await writeFile(file,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'));
 const {root}=await cdp('DOM.getDocument');const {nodeId}=await cdp('DOM.querySelector',{nodeId:root.nodeId,selector:'#pictureFiles'});
 await cdp('DOM.setFileInputFiles',{nodeId,files:[file]});
 await until("document.querySelector('#preview .text-picture')!==null",'the picture in the preview');
 assert.equal(await run("document.querySelector('#preview .text-picture').classList.contains('fit-contain')"),true,'the whole picture by default');
 assert.match(await run("document.querySelector('#toast').textContent"),/Picture added as a slide/);
 await until("document.querySelector('#textImageFit')!==null",'the picture controls');
 await run("{const s=document.querySelector('#textImageFit');s.value='cover';s.dispatchEvent(new Event('change',{bubbles:true}));}");
 await until("document.querySelector('#preview .text-picture.fit-cover')!==null",'fill the screen');
 const id=await run("document.querySelector('#preview .text-picture').getAttribute('src').match(/[a-f0-9]{16}/)[0]");
 await until("fetch('/api/state').then(r=>r.json()).then(s=>JSON.stringify(s.library).includes('"+id+"'))",'the show saved with its picture');
 assert.equal(await run("fetch('/api/assets/"+id+"',{method:'DELETE'}).then(r=>r.status)"),409,'a picture in a show cannot be deleted from the image library');
 await run("document.querySelector('[data-action=remove-picture]').click()");
 await until("document.querySelector('#preview .text-picture')===null",'the picture removed from the slide');
 assert.deepEqual(pageErrors,[],'no script error in the page');
});

test('Getting started lists the first steps, ticks what is done, and goes away when hidden',{skip},async()=>{
 await run("localStorage.removeItem('wordlight-getting-started-hidden')");
 await open();
 await until("document.querySelector('#gettingStarted')&&!document.querySelector('#gettingStarted').hidden&&document.querySelector('.gs-steps')",'the checklist');
 const text=await run("document.querySelector('#gettingStarted').textContent");
 assert.match(text,/Bibles on this computer/);assert.match(text,/Your songs/);assert.match(text,/of 4 done/);
 assert.equal(await run("document.querySelector('.gs-steps li').classList.contains('done')"),true,'the test Bible counts as installed');
 await run("document.querySelector('[data-gs-action=goto-bible]')?.click()");
 await run("document.querySelector('[data-gs=hide]').click()");
 assert.equal(await run("document.querySelector('#gettingStarted').hidden"),true);
 await open();await wait(500);
 assert.equal(await run("document.querySelector('#gettingStarted').hidden"),true,'it stays hidden after a reload');
 assert.deepEqual(pageErrors,[],'no script error in the page');
});

test('Hiding the screen while a song is still loading keeps it hidden: the late song is not sent',{skip},async()=>{
 await open();
 await run("document.querySelector('#screenToggle').textContent.includes('Show')&&document.querySelector('#screenToggle').click()");
 await until("fetch('/api/state').then(r=>r.json()).then(s=>!s.live.blank)",'the screen shown');
 await searchFor('fourth unique');
 await run("window.realFetch=window.fetch;window.fetch=(url,options)=>String(url).includes('/api/songs/item')?new Promise(r=>setTimeout(r,1200)).then(()=>window.realFetch(url,options)):window.realFetch(url,options)");
 await key('Enter',{modifiers:ALT});await wait(150);
 await run("document.querySelector('#screenToggle').click()");
 await until("fetch('/api/state').then(r=>r.json()).then(s=>s.live.blank)",'the screen hidden');
 await wait(1800);
 const state=await liveState();
 assert.equal(state.blank,true,'still hidden after the song arrived');
 assert.ok(!state.text.includes('Fourth unique'),'the late song was not sent');
 await run('window.fetch=window.realFetch');await run("document.querySelector('#screenToggle').click()");
 assert.deepEqual(pageErrors,[],'no script error in the page');
});

test('A full library with a stale tab whose show has an unreadable picture still saves the changes as a file',{skip},async()=>{
 await open();
 await run("window.__downloads=[];HTMLAnchorElement.prototype.click=function(){window.__downloads.push(this.download);}");
 const file=path.join(dir,'Unreadable.png');
 await writeFile(file,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'));
 const {root}=await cdp('DOM.getDocument');const {nodeId}=await cdp('DOM.querySelector',{nodeId:root.nodeId,selector:'#pictureFiles'});
 await cdp('DOM.setFileInputFiles',{nodeId,files:[file]});
 await until("document.querySelector('#preview .text-picture')!==null",'the picture slide');
 await until("fetch('/api/state').then(r=>r.json()).then(s=>JSON.stringify(s.library).includes('\"image\":\"'))",'the picture saved');
 const original=await run("fetch('/api/state').then(r=>r.json()).then(s=>s.library.shows.length)");
 // Images cannot be read from now on, and another tab fills the library.
 await run("window.realFetch=window.fetch;window.fetch=(url,options)=>String(url).includes('/api/assets/')?Promise.reject(new Error('offline')):window.realFetch(url,options)");
 await run("fetch('/api/state').then(r=>r.json()).then(s=>{const next=structuredClone(s.library);while(next.shows.length<100)next.shows.push({...structuredClone(next.shows[0]),id:'full-'+next.shows.length});next.savedAt=Date.now()+1000;return fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({library:next,baseSavedAt:s.library.savedAt||0})});})");
 await run("document.querySelector('#sessionTitle').value='Edited with a picture';document.querySelector('#sessionTitle').dispatchEvent(new Event('input',{bubbles:true}))");
 await until("window.__downloads.length>0",'the changes saved as a file anyway');
 assert.match(await run("document.querySelector('#toast').textContent"),/library is full/);
 await run('window.fetch=window.realFetch');
 await run("fetch('/api/state').then(r=>r.json()).then(s=>{const next=structuredClone(s.library);next.shows=next.shows.filter(x=>!String(x.id).startsWith('full-')).slice(0,"+original+");next.activeShowId=next.shows[0].id;next.savedAt=Date.now()+2000;return fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({library:next,baseSavedAt:s.library.savedAt||0})});})");
 assert.deepEqual(pageErrors,[],'no script error in the page');
});
