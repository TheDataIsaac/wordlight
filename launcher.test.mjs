// The Windows launcher and crash-recovery supervisor, run against real servers on free test ports with throwaway
// data folders. Nothing here uses port 18765 or the default data folder, and no test opens a browser window.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,open,readFile,rm,stat,utimes,writeFile} from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {claimSupervisor,emptyIfHuge,LAUNCHER_LOG_MAX,loadCompanionEnv,loadConfig,requestStop,writeLog} from './tools/launcher/shared.mjs';
import {supervise} from './tools/launcher/supervisor.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const startScript=path.join(root,'tools','launcher','start.mjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function freePort(){
 return new Promise((resolve,reject)=>{
  const probe=net.createServer();probe.on('error',reject);
  probe.listen(0,'127.0.0.1',()=>{const {port}=probe.address();probe.close(()=>resolve(port));});
 });
}
// An isolated copy of the setup: its own port, its own data folder, and no Bible or FreeShow folders of the real user.
async function sandbox(){
 const port=await freePort(),dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-launcher-test-'));
 assert.ok(port>20000,'test ports come from the free range, never from 18765');
 const env={...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_DATA_DIR:dataDir,WORDLIGHT_BIBLE_SEEDS:path.join(dataDir,'none')};
 return {port,dataDir,env,base:'http://127.0.0.1:'+port,cfg:loadConfig(env)};
}
function launcher(box,...args){
 return new Promise(resolve=>{
  execFile(process.execPath,[startScript,...args],{env:box.env,cwd:root,timeout:60_000,windowsHide:true},(error,stdout,stderr)=>resolve({code:error?(error.code??1):0,out:stdout+stderr}));
 });
}
async function waitFor(check,ms=20_000){
 for(const end=Date.now()+ms;Date.now()<end;){const found=await check();if(found)return found;await sleep(200);}
 return null;
}
const readState=async box=>{try{return JSON.parse(await readFile(box.cfg.stateFile,'utf8'));}catch{return null;}};
const health=async box=>{try{return await (await fetch(box.base+'/api/health')).json();}catch{return null;}};
// Never signals pid 0 (a whole process group) or the test runner itself.
const kill=pid=>{if(Number.isInteger(pid)&&pid>1&&pid!==process.pid)try{process.kill(pid);}catch{}};
async function cleanup(box){
 await launcher(box,'stop');
 const state=await readState(box);
 if(state){kill(state.child);kill(state.pid);}
 await sleep(300);
 await rm(box.dataDir,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
// A program that is not Wordlight and answers on the port. `seen` lists every path requested from it.
async function foreignServer(port,answer=true){
 const seen=[],sockets=new Set();
 const server=answer?http.createServer((req,res)=>{seen.push(req.url);res.writeHead(200,{'Content-Type':'text/plain'});res.end('not wordlight');}):net.createServer(()=>{});
 // Every connection is tracked and destroyed on close, so a silent server cannot keep the test run waiting.
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
 return {seen,close:()=>new Promise(resolve=>{server.close(resolve);for(const socket of sockets)socket.destroy();})};
}

test('Starting twice, even at the same moment, leaves one supervisor and one server',async()=>{
 const box=await sandbox();
 try{
  const [a,b]=await Promise.all([launcher(box,'start','--no-open'),launcher(box,'start','--no-open')]);
  assert.equal(a.code,0,a.out);assert.equal(b.code,0,b.out);
  const first=await waitFor(async()=>{const s=await readState(box);return s?.child&&s;});
  assert.ok(first,'supervisor recorded its server');
  assert.equal((await health(box)).app,'wordlight');
  const again=await launcher(box,'start','--no-open');
  assert.equal(again.code,0,again.out);assert.match(again.out,/already running/);
  const second=await readState(box);
  assert.equal(second.pid,first.pid);assert.equal(second.child,first.child);
 }finally{await cleanup(box);}
});

test('A crashed server is restarted and the last screen on air is still there',async()=>{
 const box=await sandbox();
 try{
  assert.equal((await launcher(box,'start','--no-open')).code,0);
  const before=await waitFor(async()=>{const s=await readState(box);return s?.child&&s;});
  const {live}=await (await fetch(box.base+'/api/state')).json();
  const onAir={...live,blank:false,updated:Date.now()};
  const sent=await fetch(box.base+'/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({live:onAir})});
  assert.equal(sent.status,200);

  kill(before.child);
  const after=await waitFor(async()=>{const s=await readState(box);return s?.child&&s.child!==before.child&&await health(box)&&s;},30_000);
  assert.ok(after,'server came back by itself');
  assert.equal(after.pid,before.pid,'same supervisor');
  const restored=(await (await fetch(box.base+'/api/state')).json()).live;
  assert.equal(restored.updated,onAir.updated);assert.equal(restored.blank,false);
  assert.match(await readFile(box.cfg.launcherLog,'utf8'),/stopped unexpectedly/);
 }finally{await cleanup(box);}
});

test('Stop Wordlight and the studio quit button are stops on purpose: nothing restarts',async()=>{
 const box=await sandbox();
 try{
  assert.equal((await launcher(box,'start','--no-open')).code,0);
  const stopped=await launcher(box,'stop');
  assert.equal(stopped.code,0,stopped.out);
  assert.equal(await health(box),null);assert.equal(await readState(box),null,'supervisor has exited');
  await sleep(3000);
  assert.equal(await health(box),null,'not restarted after Stop');

  assert.equal((await launcher(box,'start','--no-open')).code,0);
  const quit=await fetch(box.base+'/api/app/quit',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(quit.status,200);
  assert.ok(await waitFor(async()=>!await health(box)&&!await readState(box)),'server and supervisor both ended');
  await sleep(3000);
  assert.equal(await health(box),null,'not restarted after quit');
 }finally{await cleanup(box);}
});

test('Another program on the port is left alone, whether it answers or stays silent',async()=>{
 for(const answers of [true,false]){
  const box=await sandbox(),foreign=await foreignServer(box.port,answers);
  try{
   const started=await launcher(box,'start','--no-open');
   assert.equal(started.code,3,started.out);assert.match(started.out,/Port \d+ is in use/);assert.match(started.out,/Nothing was stopped, started or opened/);
   assert.equal(await readState(box),null,'no supervisor was started');
   const stopped=await launcher(box,'stop');
   assert.equal(stopped.code,3,stopped.out);assert.match(stopped.out,/not Wordlight/);
   // Still the same program on the port, and it was only ever asked who it is.
   if(answers){assert.equal(await (await fetch(box.base+'/')).text(),'not wordlight');assert.ok(foreign.seen.filter(url=>url!=='/').every(url=>url==='/api/health'),foreign.seen.join(' '));}
  }finally{await foreign.close();await cleanup(box);}
 }
});

test('The supervisor does not start a server while another program holds the port',async()=>{
 const box=await sandbox(),foreign=await foreignServer(box.port);
 try{
  const running=supervise(box.cfg);
  await sleep(1500);
  await requestStop(box.cfg);
  assert.equal(await running,0);
  const log=await readFile(box.cfg.launcherLog,'utf8');
  assert.match(log,/Port \d+ is taken/);assert.doesNotMatch(log,/Started server/);
  assert.ok(foreign.seen.every(url=>url==='/api/health'),foreign.seen.join(' '));
 }finally{await foreign.close();await cleanup(box);}
});

test('A supervisor lock left by a dead process or an old file is replaced; a live one is respected',async()=>{
 const box=await sandbox();
 try{
  await mkdir(box.dataDir,{recursive:true});
  const gone=spawn(process.execPath,['-e','0']);await once(gone,'exit');
  await writeFile(box.cfg.stateFile,JSON.stringify({pid:gone.pid}));
  assert.equal(await claimSupervisor(box.cfg,{pid:process.pid}),true,'dead process');
  // The lock now belongs to this (live) process and is fresh.
  assert.equal(await claimSupervisor(box.cfg,{pid:process.pid+1}),false,'live and fresh');
  const old=new Date(Date.now()-10*60_000);await utimes(box.cfg.stateFile,old,old);
  assert.equal(await claimSupervisor(box.cfg,{pid:process.pid}),true,'live process but not heard from for minutes');
  // And a real start works over a stale file.
  await writeFile(box.cfg.stateFile,JSON.stringify({pid:gone.pid}));
  assert.equal((await launcher(box,'start','--no-open')).code,0);
  assert.equal((await health(box)).app,'wordlight');
 }finally{await cleanup(box);}
});

test('Logs stay bounded: old copies are kept, and a log the server holds open is emptied in place',async()=>{
 const box=await sandbox();
 try{
  const size=async file=>(await stat(file).catch(()=>({size:-1}))).size;
  // Each round starts from a log that is already over the limit, so a single new line triggers one rotation.
  await mkdir(box.cfg.logDir,{recursive:true});
  for(let round=1;round<=3;round++){
   await writeFile(box.cfg.launcherLog,'x'.repeat(LAUNCHER_LOG_MAX+10));
   await writeLog(box.cfg,'test','round '+round);
   assert.ok(await size(box.cfg.launcherLog)<200,'a fresh log was started');
   assert.equal(await size(box.cfg.launcherLog+'.1'),LAUNCHER_LOG_MAX+10,'the full log became .1');
  }
  assert.equal(await size(box.cfg.launcherLog+'.2'),LAUNCHER_LOG_MAX+10);
  assert.equal(await size(box.cfg.launcherLog+'.3'),-1,'only two old copies are kept');

  const held=await open(box.cfg.serverLog,'a');
  await held.write('a'.repeat(100));
  assert.equal(await emptyIfHuge(box.cfg.serverLog,1000),false);
  assert.equal(await emptyIfHuge(box.cfg.serverLog,50),true);
  await held.write('after');await held.close();
  assert.equal(await readFile(box.cfg.serverLog,'utf8'),'after');
 }finally{await cleanup(box);}
});

test('Setup uses the same port and data folder defaults as server.mjs and rejects a bad port',()=>{
 const defaults=loadConfig({});
 assert.equal(defaults.port,18765);assert.equal(defaults.dataDir,path.join(root,'.wordlight-data'));
 assert.equal(loadConfig({WORDLIGHT_DATA_DIR:'elsewhere'}).dataDir,path.join(root,'elsewhere'));
 assert.throws(()=>loadConfig({WORDLIGHT_PORT:'70000'}),/not a port number/);
});

test('Start Wordlight.cmd and Stop Wordlight.cmd work from any folder (Windows)',{skip:process.platform!=='win32'},async()=>{
 const box=await sandbox();
 const run=file=>new Promise(resolve=>{
  // cmd /s /c strips the outer pair of quotes, which keeps the space in the file name safe.
  execFile('cmd.exe',['/d','/s','/c','""'+path.join(root,file)+'" --no-open --no-pause"'],{env:{...box.env,WORDLIGHT_NODE:process.execPath},cwd:tmpdir(),windowsVerbatimArguments:true,timeout:60_000,windowsHide:true},(error,stdout,stderr)=>resolve({code:error?(error.code??1):0,out:stdout+stderr}));
 });
 try{
  const started=await run('Start Wordlight.cmd');
  assert.equal(started.code,0,started.out);assert.match(started.out,/with crash recovery/);
  assert.equal((await health(box)).app,'wordlight');
  const again=await run('Start Wordlight.cmd');
  assert.equal(again.code,0,again.out);assert.match(again.out,/already running/);
  const stopped=await run('Stop Wordlight.cmd');
  assert.equal(stopped.code,0,stopped.out);
  assert.equal(await health(box),null);
 }finally{await cleanup(box);}
});

test('companion.env settings reach the server, and the environment wins over the file',async()=>{
 for(const fromEnvironment of [false,true]){
  const box=await sandbox();
  try{
   await writeFile(path.join(box.dataDir,'companion.env'),'WORDLIGHT_BRIDGE_ORIGINS=https://from-file.example.org\n');
   if(fromEnvironment)box.env.WORDLIGHT_BRIDGE_ORIGINS='https://from-environment.example.org';
   else delete box.env.WORDLIGHT_BRIDGE_ORIGINS;
   const started=await launcher(box,'start','--no-open');
   assert.equal(started.code,0,started.out);
   const {origins}=await (await fetch(box.base+'/api/bridge/code')).json();
   assert.deepEqual(origins,[fromEnvironment?'https://from-environment.example.org':'https://from-file.example.org']);
  }finally{await cleanup(box);}
 }
});

test('companion.env is read by the launcher process itself and an existing variable is kept',async()=>{
 const box=await sandbox(),key='WORDLIGHT_LAUNCHER_TEST_KEY',kept='WORDLIGHT_LAUNCHER_TEST_KEPT';
 try{
  await writeFile(path.join(box.dataDir,'companion.env'),key+'=1\n'+kept+'=from-file\n');
  process.env[kept]='from-environment';
  assert.equal(loadCompanionEnv(box.cfg),true);
  assert.equal(process.env[key],'1');assert.equal(process.env[kept],'from-environment');
  await rm(path.join(box.dataDir,'companion.env'));
  assert.equal(loadCompanionEnv(box.cfg),false,'no file is not an error');
 }finally{delete process.env[key];delete process.env[kept];await cleanup(box);}
});
