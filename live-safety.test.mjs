// Things that must hold during a service, run against the real companion: text survives the network, a stale tab or an
// old change cannot overwrite something newer, a failed save never stops the screen, and a phone survives a restart.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {snapshot,cleanDraft,DEFAULT} from './dist/core.mjs';
import {newSong,editSong} from './dist/songs.mjs';

const cwd=path.dirname(fileURLToPath(import.meta.url)),port=18840,remotePort=18841;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let dir,server;
async function start(){
 server=spawn(process.execPath,['server.mjs','--no-open'],{cwd,env:{...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_REMOTE_PORT:String(remotePort),WORDLIGHT_REMOTE_BIND:'127.0.0.1',WORDLIGHT_DATA_DIR:dir},stdio:'ignore'});
 for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:'+port+'/api/health')).ok)return;}catch{}await wait(100);}
 throw new Error('The companion did not start.');
}
async function stop(){const gone=new Promise(r=>server.once('exit',r));server.kill();await gone;}
const api=async(p,body)=>{const r=await fetch('http://127.0.0.1:'+port+p,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:'+port},body:JSON.stringify(body)});return {status:r.status,body:await r.json().catch(()=>null)};};
const state=async()=>(await api('/api/state')).body;
// Sends a body in two writes, cut in the middle of a character, as the network can.
function postSplit(pathname,text,cutAt){
 const bytes=Buffer.from(text,'utf8');
 return new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port,method:'POST',path:pathname,headers:{'Content-Type':'application/json','Content-Length':bytes.length}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
  req.on('error',reject);req.write(bytes.subarray(0,cutAt));setTimeout(()=>req.end(bytes.subarray(cutAt)),30);
 });
}
const liveAt=(updated,text)=>({...snapshot(cleanDraft({...DEFAULT,passage:text})),blank:false,updated});
const remote=async(p,{body,cookie}={})=>{
 const r=await fetch('http://127.0.0.1:'+remotePort+p,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json',Origin:'http://127.0.0.1:'+remotePort}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,body:await r.json().catch(()=>null),cookie:r.headers.get('set-cookie')?.split(';')[0]};
};
let commandCount=0;
const command=(cookie,body)=>remote('/remote/api/command',{cookie,body:{id:'safety-'+(++commandCount)+'-'+Date.now(),...body}});
before(async()=>{dir=await mkdtemp(path.join(tmpdir(),'wordlight-safety-'));await start();});
after(async()=>{await stop();await rm(dir,{recursive:true,force:true});});

test('A letter split across two network chunks arrives whole, on every route that takes text',async()=>{
 const text='Ọlọ́run ni ìfẹ́, ẹ yin Olúwa';
 const body=JSON.stringify({live:liveAt(Date.now(),text)}),cut=Buffer.from(body,'utf8').indexOf(Buffer.from('Ọ','utf8'))+1;
 assert.equal(await postSplit('/api/state',body,cut),200);
 assert.equal((await state()).live.slides[0].text.includes(text),true);
 const song=JSON.stringify({song:editSong(newSong('Ìfẹ́'),{lyrics:'[Verse 1]\n'+text,arrangement:'Verse 1'})}),at=Buffer.from(song,'utf8').indexOf(Buffer.from('Ọ','utf8'))+1;
 assert.equal(await postSplit('/api/songs/library',song,at),201);
 assert.equal((await api('/api/songs?q=olorun+ni+ife&source=wordlight')).body.items[0].line,text);
});
test('A tab that has not seen the newest shows cannot replace them',async()=>{
 const current=(await state()).library,newer={...current,savedAt:Number(current.savedAt||0)+10};
 assert.equal((await api('/api/state',{library:newer,baseSavedAt:Number(current.savedAt||0)})).status,200);
 const stale=await api('/api/state',{library:{...current,savedAt:Number(current.savedAt||0)+20},baseSavedAt:Number(current.savedAt||0)});
 assert.equal(stale.status,409);assert.equal(stale.body.stale,true);assert.equal(stale.body.savedAt,newer.savedAt,'the refusal says what the companion holds');
 assert.equal((await api('/api/state',{library:{...current,savedAt:Number(current.savedAt||0)+30}})).status,409,'a tab that sends no base, such as one opened before an update, is refused too');
 assert.equal((await state()).library.savedAt,newer.savedAt,'the newer shows stayed');
});
test('An older screen, or a change made from an older screen, never moves the screen back',async()=>{
 const start=Date.now()+1000;
 assert.equal((await api('/api/state',{live:liveAt(start,'newest words')})).status,200);
 const old=await api('/api/state',{live:liveAt(start-500,'old words')});
 assert.equal(old.body.superseded,true);assert.match((await state()).live.slides[0].text,/newest/);
 const stale=await api('/api/state',{live:liveAt(start+500,'from an old deck'),base:start-1});
 assert.equal(stale.body.superseded,true);assert.match((await state()).live.slides[0].text,/newest/);
 const fine=await api('/api/state',{live:liveAt(start+600,'next words'),base:start});
 assert.equal(fine.body.ok,true);assert.ok(!fine.body.superseded);assert.match((await state()).live.slides[0].text,/next words/);
});
test('A failed save still changes the screen, says so, and catches up when the disk works again',async()=>{
 // A folder in the temporary file's place makes every screen save (live.json) fail.
 const blocker=path.join(dir,'live.tmp');await mkdir(blocker);
 // The studio hears about a failed save on its live stream, even when the save fails after the slide was answered.
 const stream=await fetch('http://127.0.0.1:'+port+'/api/events'),reader=stream.body.getReader(),decoder=new TextDecoder();
 try{
  const updated=Date.now()+5000,sent=await api('/api/state',{live:liveAt(updated,'on screen anyway')});
  assert.equal(sent.status,200);
  assert.match((await state()).live.slides[0].text,/on screen anyway/);
  let heard='';while(!heard.includes('"saveProblem":true')){const {value,done}=await Promise.race([reader.read(),wait(5000).then(()=>({done:true}))]);if(done)break;heard+=decoder.decode(value);}
  assert.ok(heard.includes('"saveProblem":true'),'open studios are told the save failed');
 }finally{await reader.cancel().catch(()=>{});await rm(blocker,{recursive:true,force:true});}
 for(let i=0;i<80;i++){await wait(100);try{if(JSON.parse(await readFile(path.join(dir,'live.json'),'utf8')).live.slides[0].text.includes('on screen anyway'))return;}catch{}}
 assert.fail('The screen was never saved after the disk recovered.');
});
test('The phone: stays signed in across a restart, changes only its own settings, and cannot act on a stale list',async()=>{
 await api('/api/remote/password',{password:'safety pass 1'});await api('/api/remote/enabled',{enabled:true});
 const login=await remote('/remote/api/login',{body:{password:'safety pass 1'}}),cookie=login.cookie;assert.equal(login.status,200);
 const three={...snapshot(cleanDraft({...DEFAULT,passage:'one\n\ntwo\n\nthree',wordsPerSlide:20})),blank:false,updated:Date.now()+20000};
 await api('/api/state',{live:three});
 const saved=await remote('/remote/api/settings',{cookie,body:{linesPerSlide:2,checkFirst:false,resultClick:'send'}});
 assert.equal(saved.body.linesPerSlide,2);assert.equal(saved.body.checkFirst,true,'Check first stays with the laptop');assert.equal(saved.body.resultClick,'preview');
 await remote('/remote/api/settings',{cookie,body:{linesPerSlide:0}});
 const live=(await remote('/remote/api/live',{cookie})).body;
 assert.equal((await command(cookie,{action:'goto',index:0,slideId:'some-other-slide',base:live.updated})).status,409);
 await stop();await start();
 for(let i=0;i<40&&(await remote('/remote/api/live',{cookie}).catch(()=>({status:0}))).status!==200;i++)await wait(100);
 assert.equal((await remote('/remote/api/live',{cookie})).status,200,'still signed in after the restart');
 await command(cookie,{action:'blank',blank:true});
 const hidden=(await remote('/remote/api/live',{cookie})).body;
 assert.equal((await command(cookie,{action:'next',base:hidden.updated})).status,200);
 assert.equal((await remote('/remote/api/live',{cookie})).body.blank,true,'Next does not reveal a hidden screen');
 await command(cookie,{action:'blank',blank:false});
});
test('Verse steps keep a hidden screen hidden, and the phone list knows two passages with the same slide ids apart',async()=>{
 await api('/api/remote/enabled',{enabled:true});
 const {cookie}=await remote('/remote/api/login',{body:{password:'safety pass 1'}});
 const a={...snapshot(cleanDraft({...DEFAULT,passage:'John words\n\nmore John',wordsPerSlide:20})),blank:false,updated:Date.now()+30000};
 await api('/api/state',{live:a});
 const first=(await remote('/remote/api/screen',{cookie})).body.slides,deck=(await remote('/remote/api/live',{cookie})).body.deck;
 const b={...snapshot(cleanDraft({...DEFAULT,passage:'Romans words\n\nmore Romans',wordsPerSlide:20})),blank:false,updated:Date.now()+31000};
 await api('/api/state',{live:b});
 const after=(await remote('/remote/api/live',{cookie})).body;assert.notEqual(after.deck,deck,'the list refreshes for the new passage');
 assert.equal((await command(cookie,{action:'goto',index:1,slideId:first[1].id,base:after.updated})).status,409,'a tap from the old list is refused');
});
test('A phone locked out by wrong passwords is freed by a new password',async()=>{
 for(let i=0;i<5;i++)await remote('/remote/api/login',{body:{password:'wrong password '+i}});
 assert.equal((await remote('/remote/api/login',{body:{password:'safety pass 1'}})).status,429);
 await api('/api/remote/password',{password:'safety pass 2'});
 assert.equal((await remote('/remote/api/login',{body:{password:'safety pass 2'}})).status,200);
});
