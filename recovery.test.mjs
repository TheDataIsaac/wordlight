// The companion must not start empty when session.json is damaged or missing: it loads the newest good backup.
// It also keeps running when the phone remote cannot start, and closes a live stream that stopped reading.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {mkdtemp,mkdir,writeFile,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULT,cleanDraft,snapshot} from './dist/core.mjs';
import {cleanLibrary} from './dist/library.mjs';
const port=18782,remotePort=18840,root=path.dirname(fileURLToPath(import.meta.url));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const lib=title=>({app:'wordlight',library:cleanLibrary(null,cleanDraft({...DEFAULT,title}))});
function startCompanion(dataDir,env={}){
 return spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_REMOTE_PORT:String(remotePort),WORDLIGHT_REMOTE_BIND:'127.0.0.1',WORDLIGHT_DATA_DIR:dataDir,...env},stdio:'ignore'});
}
async function readState(){for(let i=0;i<50;i++){try{return await (await fetch('http://127.0.0.1:'+port+'/api/state')).json();}catch{await wait(100);}}throw new Error('companion did not start');}
async function stopCompanion(server){if(server.exitCode===null){server.kill();await new Promise(r=>server.once('exit',r));}}
const post=(pathname,body)=>fetch('http://127.0.0.1:'+port+pathname,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:'+port},body:JSON.stringify(body)});
test('A damaged session is kept aside and the newest readable backup is loaded',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-recovery-test-')),backups=path.join(dataDir,'backups');
 await mkdir(backups);
 await writeFile(path.join(backups,'session-2026-10-01T10-00-00-000Z.json'),JSON.stringify(lib('Older backup')));
 await writeFile(path.join(backups,'session-2026-10-02T10-00-00-000Z.json'),JSON.stringify(lib('Newest good backup')));
 await writeFile(path.join(backups,'session-2026-10-03T10-00-00-000Z.json'),'{also broken');
 await writeFile(path.join(dataDir,'session.json'),'{"library":{"format":"wordlight-library","version":1,"shows":[{"id":"x"');
 const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_DATA_DIR:dataDir},stdio:'ignore'});
 try{
  let state;for(let i=0;i<50&&!state;i++){try{state=await (await fetch('http://127.0.0.1:'+port+'/api/state')).json();}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.equal(state.library.shows[0].draft.title,'Newest good backup');
  const files=await readdir(dataDir);assert.ok(files.some(f=>/^session-damaged-.*\.json$/.test(f)),'damaged file kept');
  const kept=files.find(f=>f.startsWith('session-damaged-'));assert.match(await readFile(path.join(dataDir,kept),'utf8'),/"id":"x"/);
  assert.equal(JSON.parse(await readFile(path.join(dataDir,'session.json'),'utf8')).library.shows[0].draft.title,'Newest good backup');
  // The studio is told, not only the log: one notice for the damaged file, one for the backup that was opened.
  const {notices}=await (await fetch('http://127.0.0.1:'+port+'/api/notices')).json();
  assert.equal(notices.length,2);
  assert.match(notices[0].text,/damaged file was kept as session-damaged-/);
  assert.match(notices[1].text,/opened your shows from the backup made 2 Oct/);
  assert.ok(notices.every(n=>n.level==='warning'&&n.kind==='recovery'));
  // Dismissing one leaves the other, and only the local studio may dismiss.
  assert.equal((await fetch('http://127.0.0.1:'+port+'/api/notices/dismiss',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:JSON.stringify({id:notices[0].id})})).status,403);
  const after=await (await fetch('http://127.0.0.1:'+port+'/api/notices/dismiss',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:notices[0].id})})).json();
  assert.deepEqual(after.notices.map(n=>n.id),[notices[1].id]);
 }finally{server.kill();await new Promise(r=>setTimeout(r,200));await rm(dataDir,{recursive:true,force:true});}
});

test('A missing session.json loads the newest backup, and a valid pairing code is not rewritten',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-recovery-test-')),backups=path.join(dataDir,'backups');
 await mkdir(backups);
 await writeFile(path.join(backups,'session-2026-10-01T10-00-00-000Z.json'),JSON.stringify(lib('Older backup')));
 await writeFile(path.join(backups,'session-2026-10-02T10-00-00-000Z.json'),JSON.stringify(lib('Newest good backup')));
 // Spaces that JSON.stringify would drop show whether the file was written again.
 const bridgeText='{ "code": "ABCD-EFGH-JKLM" }';await writeFile(path.join(dataDir,'bridge.json'),bridgeText);
 const server=startCompanion(dataDir);
 try{
  const state=await readState();
  assert.equal(state.library.shows[0].draft.title,'Newest good backup');
  assert.equal(JSON.parse(await readFile(path.join(dataDir,'session.json'),'utf8')).library.shows[0].draft.title,'Newest good backup');
  assert.equal(await readFile(path.join(dataDir,'bridge.json'),'utf8'),bridgeText);
 }finally{await stopCompanion(server);await rm(dataDir,{recursive:true,force:true});}
});

test('The studio and outputs keep running when the phone remote cannot start',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-recovery-test-'));
 let server=startCompanion(dataDir);
 try{
  await readState();
  assert.equal((await post('/api/remote/password',{password:'sample pass 1'})).status,200);
  assert.equal((await post('/api/remote/enabled',{enabled:true})).status,200);
  await stopCompanion(server);
  // Turned on, but with a port the remote cannot listen on.
  server=startCompanion(dataDir,{WORDLIGHT_REMOTE_PORT:'18840.5'});
  await readState();await wait(500);
  assert.equal(server.exitCode,null,'companion still running');
  assert.equal((await (await fetch('http://127.0.0.1:'+port+'/api/health')).json()).app,'wordlight');
 }finally{await stopCompanion(server);await rm(dataDir,{recursive:true,force:true});}
});

test('A live stream that stops reading is closed instead of filling memory, and a new one gets the latest screen',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-recovery-test-'));
 const server=startCompanion(dataDir);
 try{
  await readState();
  let closed=false;
  const stalled=await new Promise((resolve,reject)=>{const req=http.get('http://127.0.0.1:'+port+'/api/events?view=output',res=>{res.pause();res.on('error',()=>{});res.on('close',()=>closed=true);resolve({req,res});});req.on('error',()=>{});});
  // About 4 MB per screen; the stalled page reads none of them.
  const live=n=>({...snapshot(cleanDraft(DEFAULT)),slides:[{type:'text',text:'Screen '+n+' '+'x'.repeat(4e6)}],index:0,blank:false,updated:Date.now()+n*1000});
  for(let n=1;n<=12;n++){assert.equal((await post('/api/state',{live:live(n)})).status,200);await wait(50);}
  // A paused page cannot notice its stream ending. Reading again drains what was already sent: a stream the companion
  // closed then ends, while one it kept would stay open.
  stalled.res.resume();
  for(let i=0;i<100&&!closed;i++)await wait(50);
  assert.ok(closed,'stalled stream closed');stalled.req.destroy();
  const latest=await new Promise((resolve,reject)=>{const req=http.get('http://127.0.0.1:'+port+'/api/events?view=output',res=>{let text='';res.on('data',c=>{text+=c;const i=text.indexOf('\n\n');if(i>=0){req.destroy();resolve(JSON.parse(text.slice(text.indexOf('data: ')+6,i)).live);}});});req.on('error',reject);});
  assert.match(latest.slides[0].text,/^Screen \d+ /);
  assert.equal((await (await fetch('http://127.0.0.1:'+port+'/api/health')).json()).app,'wordlight');
 }finally{await stopCompanion(server);await rm(dataDir,{recursive:true,force:true});}
});

test('At start the newer screen wins: the one saved on its own in live.json, or the one in session.json',async()=>{
 const live=(updated,text)=>({...snapshot(cleanDraft({...DEFAULT,passage:text})),blank:false,updated});
 for(const [sessionAt,liveAt,expected] of [[1000,2000,'from live.json'],[3000,2000,'from session.json']]){
  const dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-recovery-test-'));
  await writeFile(path.join(dataDir,'session.json'),JSON.stringify({...lib('Show'),live:live(sessionAt,'from session.json')}));
  await writeFile(path.join(dataDir,'live.json'),JSON.stringify({live:live(liveAt,'from live.json')}));
  const server=startCompanion(dataDir);
  try{
   const state=await readState();
   assert.equal(state.live.slides[0].text,expected);
   assert.equal(state.library.shows[0].draft.title,'Show','the shows still come from session.json');
  }finally{await stopCompanion(server);await rm(dataDir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
 }
});

test('Backups keep the newest 20 copies and the newest of each of the last 14 days',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-recovery-test-')),backups=path.join(dataDir,'backups');
 await mkdir(backups);
 const stamp=d=>'session-'+d.toISOString().replace(/[:.]/g,'-')+'.json';
 const day=24*60*60*1000,now=Date.now();
 // Two copies on each of the 20 days before today, and 25 from earlier today.
 for(let d=1;d<=20;d++)for(const h of [9,11])await writeFile(path.join(backups,stamp(new Date(now-d*day+h*60000))),JSON.stringify(lib('Day '+d)));
 for(let i=25;i>=1;i--)await writeFile(path.join(backups,stamp(new Date(now-i*60000))),JSON.stringify(lib('Today '+i)));
 await writeFile(path.join(dataDir,'session.json'),JSON.stringify(lib('Current')));
 const server=startCompanion(dataDir);
 try{
  const state=await readState();
  // One library save: session.json is copied to backups/ first, then the old copies are trimmed.
  assert.equal((await post('/api/state',{library:{...state.library,savedAt:Date.now()},baseSavedAt:state.library.savedAt||0})).status,200);
  await wait(300);
  const names=(await readdir(backups)).filter(f=>f.startsWith('session-')).sort();
  const days=new Set(names.map(n=>n.slice(8,18)));
  assert.equal(days.size,14,'one or more copies from each of the last 14 days');
  assert.ok(names.length>=20+13&&names.length<=20+14,'the newest 20 plus one per older day, got '+names.length);
  assert.ok(!names.some(n=>n.slice(8,18)===new Date(now-20*day).toISOString().slice(0,10)),'copies older than 14 days are gone');
 }finally{await stopCompanion(server);await rm(dataDir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
