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
const ALT=1;
async function clickOn(selector){
 const box=await run('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
 for(const type of ['mousePressed','mouseReleased'])await cdp('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1});
}
const liveState=async()=>{const r=await run("fetch('/api/state').then(r=>r.json()).then(s=>({index:s.live.index,blank:s.live.blank,count:s.live.slides.length,text:s.live.slides[s.live.index]?.text||''}))");return r;};
async function open(){await cdp('Page.navigate',{url:site});await until("document.querySelector('[data-action=settings-open]')!==null",'the studio to reach the companion');}
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
const sendPhoneVerse=async text=>{await run("fetch('/api/state').then(r=>r.json()).then(s=>fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({live:{...s.live,blank:false,index:0,showId:undefined,sceneId:undefined,showTitle:'John 3:16',bibleVersion:'kjv',slides:[{...(s.live.slides[0]||{}),id:'passage-0',type:'passage',title:'John 3:16',reference:'John 3:16',text:"+JSON.stringify(text)+"}],style:{...s.live.style,highlights:[],highlightWords:[]},updated:Date.now()+1000}})}))");await until("fetch('/api/state').then(r=>r.json()).then(s=>s.live.bibleVersion==='kjv')",'the phone verse');};
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
 const blocker=path.join(dir,'data','session.tmp');await mkdir(blocker);
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
