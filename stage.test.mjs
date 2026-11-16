// Stage display: what it shows, the operator's message, and who may read it. The companion runs on test ports with a
// throwaway data folder; the phone remote listens on 127.0.0.1 only.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import {stageState,cleanStageMessage} from './dist/stage.mjs';
import {cleanTextSlide,snapshot,cleanDraft,DEFAULT} from './dist/core.mjs';
import {createShow} from './dist/library.mjs';
import {BIBLE_BOOKS} from './dist/reference.mjs';

const song=(section,text)=>({id:'song-'+section,type:'text',song:{entryId:'e',title:'Sample hymn',section},text,title:'Sample hymn · '+section});
const passage=(reference,text,second)=>({id:'passage-'+reference,type:'passage',text,reference,translation:'KJV',...(second?{second:{text:second,translation:'OYCB'}}:{})});

test('The stage shows the slide on screen and the next one, with short names for each',()=>{
 const live={slides:[song('Verse 1','Line one\nLine two'),song('Chorus','Chorus line')],index:0,blank:false,showTitle:'Sunday',timer:{durationMs:60000}};
 const stage=stageState(live);
 assert.deepEqual(stage.current,{label:'Verse 1',text:'Line one\nLine two',second:''});
 assert.equal(stage.next.label,'Chorus');
 assert.equal(stage.position,'1 / 2');
 assert.equal(stageState({...live,index:1}).next,null,'nothing after the last slide');
 const verse=stageState({slides:[passage('John 3:16','English','Yoruba')],index:0});
 assert.deepEqual(verse.current,{label:'John 3:16 · KJV',text:'English',second:'Yoruba'});
 const text=stageState({slides:[{id:'t',type:'text',heading:'Welcome',subtitle:'',text:'Body',title:'Welcome'}],index:0});
 assert.deepEqual([text.current.label,text.current.text],['Welcome','Welcome\nBody']);
 assert.equal(stageState({slides:[],index:0}).current,null);
});

test('The message is one tidy line of at most 200 characters, and an empty one clears it',()=>{
 assert.equal(cleanStageMessage('  5   minutes\nleft '),'5 minutes left');
 assert.equal(cleanStageMessage('x'.repeat(300)).length,200);
 assert.equal(cleanStageMessage(null),'');
 assert.equal(stageState({slides:[],index:0},{text:'Wrap up',at:5}).message.text,'Wrap up');
 assert.equal(stageState({slides:[],index:0},null).message,null);
 assert.equal(stageState({slides:[],index:0},{text:'Wrap up',at:5,hidden:true}).message,null,'a hidden message is not sent');
 assert.equal(stageState({slides:[],index:0}).nextLines,2,'two lines of the next slide by default');
 assert.equal(stageState({slides:[],index:0},null,{nextLines:0}).nextLines,0);
 assert.equal(stageState({slides:[],index:0},null,{nextLines:7}).nextLines,2);
});

// ---- The real companion ----
const port=18880,remotePort=18885,remoteOrigin='http://127.0.0.1:'+remotePort;
const cwd=path.dirname(fileURLToPath(import.meta.url));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let server,dataDir;
function request(targetPort,method,pathname,{headers={},body}={}){
 return new Promise((resolve,reject)=>{
  const data=body===undefined?undefined:JSON.stringify(body);
  const req=http.request({host:'127.0.0.1',port:targetPort,method,path:pathname,headers:{Host:'127.0.0.1:'+targetPort,...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),...headers}},res=>{
   let text='';res.on('data',c=>text+=c);res.on('end',()=>{let json=null;try{json=JSON.parse(text);}catch{}resolve({status:res.statusCode,headers:res.headers,body:json});});
  });
  req.on('error',reject);if(data)req.write(data);req.end();
 });
}
function stream(targetPort,pathname,headers={}){
 return new Promise((resolve,reject)=>{
  const req=http.get({host:'127.0.0.1',port:targetPort,path:pathname,headers:{Host:'127.0.0.1:'+targetPort,...headers}},res=>{
   const messages=[];let buffer='';
   res.on('data',c=>{buffer+=c;let i;while((i=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,i);buffer=buffer.slice(i+2);const line=block.split('\n').find(l=>l.startsWith('data: '));if(line)messages.push(JSON.parse(line.slice(6)));}});
   resolve({status:res.statusCode,messages,close:()=>req.destroy()});
  });
  req.on('error',reject);
 });
}
async function until(check,ms=3000){for(let i=0;i<ms/20;i++){if(await check())return true;await wait(20);}return false;}

before(async()=>{
 dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-stage-test-'));
 const show=createShow('Sample service');show.draft.textSlides=[cleanTextSlide({id:'a',heading:'Welcome',body:'Sample welcome'}),cleanTextSlide({id:'b',heading:'Notices',body:'Sample notice'})];
 const live={...snapshot(show.draft,'text-a'),blank:false,showId:show.id,showTitle:'Sample service'};
 await writeFile(path.join(dataDir,'session.json'),JSON.stringify({library:{format:'wordlight-library',version:1,activeShowId:show.id,shows:[show]},draft:show.draft,live}));
 // One installed version, so the verse search route has something to search.
 const folder=path.join(dataDir,'bibles','kjv');await mkdir(folder,{recursive:true});
 await writeFile(path.join(folder,'manifest.json'),JSON.stringify({id:'kjv',abbreviation:'KJV',name:'King James Version',credit:'',installedAt:1,verses:1}));
 for(const book of BIBLE_BOOKS){
  const chapters=Array.from({length:book.chapters},()=>['Filler words.']);
  if(book.id==='JHN')chapters[10]=[...Array(34).fill('Filler words.'),'Jesus wept.'];
  await writeFile(path.join(folder,book.id+'.json'),JSON.stringify(chapters));
 }
 server=spawn(process.execPath,['server.mjs'],{cwd,env:{...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_REMOTE_PORT:String(remotePort),WORDLIGHT_REMOTE_BIND:'127.0.0.1',WORDLIGHT_DATA_DIR:dataDir,WORDLIGHT_FREESHOW_INDEX:path.join(dataDir,'none.json')},stdio:'ignore'});
 assert.ok(await until(async()=>{try{return (await request(port,'GET','/api/health')).status===200;}catch{return false;}},6000),'companion did not start');
});
after(async()=>{server.kill();await new Promise(r=>server.once('exit',r));await rm(dataDir,{recursive:true,force:true,maxRetries:5,retryDelay:200});});

test('The local stage page follows the screen, and only the local studio can set the message',async()=>{
 const local={Origin:'http://127.0.0.1:'+port};
 assert.equal((await request(port,'GET','/stage')).status,200);
 const s=await stream(port,'/stage/events');
 try{
  assert.ok(await until(()=>s.messages.length>0));
  assert.equal(s.messages[0].current.label,'Welcome');
  assert.equal(s.messages[0].next.label,'Notices');
  assert.equal((await request(port,'POST','/api/stage',{body:{message:'x'},headers:{Origin:'https://evil.example'}})).status,403);
  const set=await request(port,'POST','/api/stage',{body:{message:'  5 minutes  '},headers:local});
  assert.equal(set.status,200);assert.equal(set.body.message.text,'5 minutes');assert.equal(set.body.screens,1);
  assert.ok(await until(()=>s.messages.at(-1)?.message?.text==='5 minutes'),'the stage hears the message at once');
  // Hide takes it off the stage but keeps it; Show again brings it back.
  const hidden=await request(port,'POST','/api/stage',{body:{hidden:true},headers:local});
  assert.equal(hidden.body.message.text,'5 minutes');assert.equal(hidden.body.message.hidden,true);
  assert.ok(await until(()=>s.messages.at(-1)?.message===null),'the stage no longer shows it');
  await request(port,'POST','/api/stage',{body:{hidden:false},headers:local});
  assert.ok(await until(()=>s.messages.at(-1)?.message?.text==='5 minutes'),'shown again');
  await request(port,'POST','/api/stage',{body:{message:''},headers:local});
  assert.ok(await until(()=>s.messages.at(-1)?.message===null),'an empty message clears it');
  assert.equal((await request(port,'GET','/api/stage')).body.message,null,'and it is gone, not hidden');
  // How much of the next slide shows is a setting, and the stage follows it at once.
  assert.equal((await request(port,'POST','/api/settings',{body:{stageNextLines:1},headers:local})).status,200);
  assert.ok(await until(()=>s.messages.at(-1)?.nextLines===1),'the stage hears the setting');
  await request(port,'POST','/api/settings',{body:{stageNextLines:2},headers:local});
  // The message never reaches the audience outputs.
  const state=(await request(port,'GET','/api/state')).body;
  assert.ok(!JSON.stringify(state.live).includes('5 minutes'));
 }finally{s.close();}
});

test('On the phone remote address the stage display needs the remote sign-in',async()=>{
 const admin=(p,body)=>request(port,'POST','/api/remote/'+p,{body,headers:{Origin:'http://127.0.0.1:'+port}});
 assert.equal((await admin('password',{password:'sample pass 1'})).status,200);
 assert.equal((await admin('enabled',{enabled:true})).status,200);
 assert.ok(await until(async()=>{try{return (await request(remotePort,'GET','/remote/stage')).status===200;}catch{return false;}}));
 assert.equal((await request(remotePort,'GET','/remote/api/stage')).status,401);
 const login=await request(remotePort,'POST','/remote/api/login',{body:{password:'sample pass 1'},headers:{Origin:remoteOrigin}});
 const cookie=login.headers['set-cookie'][0].split(';')[0];
 const s=await stream(remotePort,'/remote/api/stage',{Cookie:cookie});
 try{
  assert.equal(s.status,200);
  assert.ok(await until(()=>s.messages.length>0));
  assert.equal(s.messages[0].current.label,'Welcome');
  await request(port,'POST','/api/stage',{body:{message:'Wrap up'},headers:{Origin:'http://127.0.0.1:'+port}});
  assert.ok(await until(()=>s.messages.at(-1)?.message?.text==='Wrap up'));
  // Signing out every phone also closes stage screens.
  await admin('signout',{});
  assert.equal((await request(remotePort,'GET','/remote/api/stage',{headers:{Cookie:cookie}})).status,401);
 }finally{s.close();}
});

test('Verse search answers in the local studio and on the phone, from the installed Bible',async()=>{
 const local=await request(port,'GET','/api/bibles/search?q='+encodeURIComponent('Jesus wept'));
 assert.equal(local.status,200);
 assert.equal(local.body.results[0].reference,'John 11:35');
 assert.deepEqual(local.body.searched,['KJV']);
 const login=await request(remotePort,'POST','/remote/api/login',{body:{password:'sample pass 1'},headers:{Origin:remoteOrigin}});
 const cookie=login.headers['set-cookie'][0].split(';')[0];
 const phone=await request(remotePort,'GET','/remote/api/bible/search?q=jesus%20wept',{headers:{Cookie:cookie}});
 assert.equal(phone.status,200);
 assert.equal(phone.body.results[0].reference,'John 11:35');
 assert.equal((await request(remotePort,'GET','/remote/api/bible/search?q=jesus%20wept')).status,401);
});
