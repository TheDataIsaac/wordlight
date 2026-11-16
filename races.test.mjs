// Things that finish late must not undo something newer. The real phone remote runs here on a test port, with the Bible
// answer held back so each order of events can be forced. Nothing here touches a network or the real data folder.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {cleanDraft,snapshot} from './dist/core.mjs';
import {createRemote,hashPassword} from './remote-server.mjs';

const port=18870,host='127.0.0.1:'+port,origin='http://'+host,password='sample pass 1',root=path.dirname(fileURLToPath(import.meta.url));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const verse={reference:'John 3:16',text:'Sample verse',verses:[{book_id:'JHN',book:'John',chapter:3,verse:16,text:'Sample verse'}]};
let dir,state,held,remote,cookie,commitGate=null,commitReached=null,commitDone=null;
const screen=()=>({...snapshot(cleanDraft({schema:1,title:'Service',passage:'Sample words',reference:'Sample 1:1'})),updated:1000,blank:false});
// A held lookup also says when the request reached it, so a test changes the screen only after that, however busy the computer.
const bible={passage:()=>{if(!held)return Promise.resolve(verse);held.arrived();return held.promise;},versions:async()=>[],adjacent:async()=>null};
const hold=()=>{let release,arrived;const promise=new Promise(r=>{release=()=>r(verse);}),reached=new Promise(r=>{arrived=r;});held={promise,release,reached,arrived};return held;};

function post(pathname,body,headers={}){
 return new Promise((resolve,reject)=>{
  const text=JSON.stringify(body),req=http.request({host:'127.0.0.1',port,method:'POST',path:pathname,headers:{Host:host,Origin:origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(text),...(cookie?{Cookie:cookie}:{}),...headers}},res=>{
   let out='';res.on('data',c=>out+=c);res.on('end',()=>{let json={};try{json=JSON.parse(out);}catch{}resolve({status:res.statusCode,body:json,headers:res.headers});});
  });
  req.on('error',reject);req.end(text);
 });
}
let ids=0;const command=body=>post('/remote/api/command',{id:'race-command-'+(++ids),...body});
async function startRemote(){
 remote=createRemote({getState:()=>state,commitLive:async change=>{commitReached?.();await commitGate;const live=change(state);if(live)state={...state,live};commitDone?.();},dataDir:dir,root,localOrigins:()=>[],bible,findSongs:async()=>({total:0,items:[]}),readSong:async()=>({}),settings:{get:()=>({}),change:async()=>({})},port,bind:'127.0.0.1'});
 await remote.start();
 cookie='';const r=await post('/remote/api/login',{password});assert.equal(r.status,200);cookie=r.headers['set-cookie'][0].split(';')[0];
}
before(async()=>{
 dir=await mkdtemp(path.join(tmpdir(),'wordlight-races-'));
 await writeFile(path.join(dir,'remote.json'),JSON.stringify({version:1,enabled:true,password:await hashPassword(password)}));
 state={library:{shows:[]},draft:{notes:[]},live:screen()};
 await startRemote();
});
after(async()=>{await remote.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});});

test('Hide wins over a verse that was still loading, however short the wait',async()=>{
 state.live=screen();const gate=hold(),sending=command({action:'bible',reference:'John 3:16',version:'kjv'});
 await gate.reached;
 assert.equal((await command({action:'blank',blank:true})).status,200);
 gate.release();held=null;
 const answer=await sending;
 assert.equal(answer.status,409,JSON.stringify(answer.body));
 assert.equal(state.live.blank,true,'the screen stays hidden');
 assert.notEqual(state.live.showTitle,'John 3:16');
});
test('A new middle slide from the studio wins over a verse that was still loading',async()=>{
 const base=screen(),slide=base.slides[0],deck=['one','two','three'].map(text=>({...slide,id:'slide-'+text,text}));
 state.live={...base,slides:deck,index:1};
 const gate=hold(),sending=command({action:'bible',reference:'John 3:16',version:'kjv'});
 await gate.reached;
 state.live={...state.live,slides:[deck[0],{...deck[1],text:'new middle slide'},deck[2]],updated:state.live.updated+1};
 gate.release();held=null;
 assert.equal((await sending).status,409);
 assert.equal(state.live.slides[1].text,'new middle slide');
});
test('A timer change or a lit word does not cancel a verse that is loading',async()=>{
 for(const change of [{action:'timer',timer:'start'},{action:'word',word:'Sample',base:null}]){
  state.live=screen();const gate=hold(),sending=command({action:'bible',reference:'John 3:16',version:'kjv'});
  await gate.reached;
  assert.equal((await command({...change,...(change.base===null?{base:state.live.updated}:{})})).status,200);
  gate.release();held=null;
  assert.equal((await sending).status,200);assert.equal(state.live.showTitle,'John 3:16');
 }
});
test('A verse with nothing happening meanwhile still goes straight out',async()=>{
 state.live=screen();
 assert.equal((await command({action:'bible',reference:'John 3:16',version:'kjv'})).status,200);
 assert.equal(state.live.showTitle,'John 3:16');
});
test('A login flood cannot start more than two password checks at once',async()=>{
 // Headers first, bodies together: every request passes the first check before any is finished.
 const text=JSON.stringify({password:'wrong answer'}),answers=[];
 const requests=Array.from({length:12},()=>{
  const req=http.request({host:'127.0.0.1',port,method:'POST',path:'/remote/api/login',headers:{Host:host,Origin:origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(text)}},res=>{res.resume();answers.push(res.statusCode);});
  req.on('error',()=>{});req.flushHeaders();return req;
 });
 await wait(150);
 for(const req of requests)req.end(text);
 for(let i=0;i<200&&answers.length<12;i++)await wait(25);
 assert.equal(answers.length,12);
 assert.ok(answers.filter(code=>code===401).length<=2,'answers: '+answers.join());
});
test('A phone that stops reading its live stream is closed instead of filling memory',async()=>{
 let socket,stalled;
 const closed=new Promise(resolve=>{
  const req=http.get({host:'127.0.0.1',port,path:'/remote/api/events',headers:{Host:host,Cookie:cookie}},res=>{stalled=res;socket=res.socket;socket.pause();socket.once('close',()=>resolve(true));res.on('error',()=>{});});
  req.on('error',()=>resolve(true));
 });
 await wait(100);
 const wide={...state.live,slides:[{...state.live.slides[0],text:'x'.repeat(600)}]};
 for(let i=0;i<20000;i++){remote.liveChanged({...wide,updated:2000+i});if(i%200===0)await wait(0);}
 // Reading again shows whether the laptop kept the stream or closed it. A kept stream would stay open.
 socket.resume();stalled.resume();
 assert.equal(await Promise.race([closed,wait(3000).then(()=>false)]),true,'the stalled stream was closed');
});
// Last: this one closes the remote.
test('A phone signed out while its verse is loading has no effect',async()=>{
 state.live=screen();const before=state.live,gate=hold();
 // Each check waits for the command's turn at the screen to finish (the remote always takes its turn and decides there).
 let done=new Promise(r=>{commitDone=r;});
 command({action:'bible',reference:'John 3:16',version:'kjv'}).catch(()=>{});
 await gate.reached;
 await remote.close();
 gate.release();held=null;await done;
 assert.equal(state.live,before,'the screen did not change');
 // The same when the command had already joined the line for the screen: the sign-out comes once it is waiting there.
 await startRemote();let open;commitGate=new Promise(r=>{open=r;});
 const inLine=new Promise(r=>{commitReached=r;});
 done=new Promise(r=>{commitDone=r;});
 command({action:'bible',reference:'John 3:16',version:'kjv'}).catch(()=>{});
 await inLine;await remote.close();open();await done;commitGate=null;commitReached=null;commitDone=null;
 assert.equal(state.live,before,'the screen did not change');
});
