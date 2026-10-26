// Crash recovery for Wordlight. Runs server.mjs and starts it again if it dies, with a growing wait between tries.
// It does nothing else: no polling of the server, no network traffic while the server is running.
//   - A server that exits with code 0, or any exit after Stop Wordlight, is a stop on purpose and is not restarted.
//   - If something else holds the port, nothing is started and nothing on the port is touched.
//   - The server keeps running if the supervisor itself is closed or killed (OBS keeps its screen).
import {spawn} from 'node:child_process';
import {appendFile,mkdir,open} from 'node:fs/promises';
import path from 'node:path';
import {askToQuit,claimSupervisor,clearStop,emptyIfHuge,releaseSupervisor,rotateIfLarge,sleep,stopRequested,tailLines,updateState,whoIsThere,writeLog,SERVER_LOG_HARD,SERVER_LOG_MAX} from './shared.mjs';

const HEARTBEAT_MS=10_000;   // refresh the state file and keep server.log bounded
const HEALTHY_MS=60_000;     // a server that ran this long was not crash-looping, so the wait starts over
const MAX_WAIT_MS=30_000;
const PORT_TRIES=5;          // starts to attempt while the port is taken, before giving up

// Returns an exit code: 0 stopped on purpose (or another supervisor is already running), 3 the port stayed taken.
export async function supervise(cfg){
 const log=text=>writeLog(cfg,'supervisor',text);
 if(!await claimSupervisor(cfg,{pid:process.pid,port:cfg.port,child:0,restarts:0,started:Date.now()})){
  await log('Another supervisor is already running for '+cfg.dataDir+'. This one is exiting.');
  return 0;
 }
 await clearStop(cfg);
 // The data folder exists (the lock is in it); the log folder is made here, before the server's output file is opened.
 try{await mkdir(cfg.logDir,{recursive:true});}
 catch(err){
  console.error('Wordlight could not create its log folder '+cfg.logDir+': '+err.message);
  await releaseSupervisor(cfg);return 4;
 }
 await log('Supervisor started (pid '+process.pid+') for port '+cfg.port+', data folder '+cfg.dataDir+'.');
 let child=null,stopping=false,restarts=0;
 const shouldStop=async()=>stopping||await stopRequested(cfg);
 // Waits, but wakes up early when a stop is requested.
 async function pause(ms){
  for(const end=Date.now()+ms;Date.now()<end&&!await shouldStop();)await sleep(Math.min(500,end-Date.now()));
 }
 // Ctrl+C in a foreground window: let the server finish its saves, and kill it only if it does not quit in 10 seconds.
 const onSignal=()=>{
  stopping=true;
  if(!child)return;
  askToQuit(cfg);
  setTimeout(()=>child?.kill(),10_000).unref();
 };
 for(const signal of ['SIGINT','SIGTERM','SIGBREAK'])process.on(signal,onSignal);
 const heartbeat=setInterval(async()=>{
  if(!await updateState(cfg,{child:child?.pid||0,restarts}).catch(()=>true)){
   await log('Another supervisor took over the state file. This one is exiting; the server is left running.');
   process.exit(0);
  }
  if(await emptyIfHuge(cfg.serverLog,SERVER_LOG_HARD))await log('server.log passed '+SERVER_LOG_HARD/1e6+' MB while the server ran, so it was emptied.');
 },HEARTBEAT_MS);

 // One server run. Resolves when the process ends or cannot be started.
 async function runServer(){
  let file;
  try{
   await rotateIfLarge(cfg.serverLog,SERVER_LOG_MAX);
   await appendFile(cfg.serverLog,'--- '+new Date().toISOString()+' starting server ---\n');
   file=await open(cfg.serverLog,'a');
  }catch(err){
   // Reported like a crash: it is logged, and the supervisor tries again after the usual wait.
   return {code:-1,reason:'the server log could not be opened: '+err.message};
  }
  const ended=new Promise(resolve=>{
   // The server writes straight into server.log. A pipe to this process would break the server if the supervisor died.
   try{child=spawn(cfg.node,[path.join(cfg.root,'server.mjs')],{cwd:cfg.root,detached:true,windowsHide:true,stdio:['ignore',file.fd,file.fd],env:{...process.env,WORDLIGHT_PORT:String(cfg.port),WORDLIGHT_DATA_DIR:cfg.dataDir}});}
   catch(err){resolve({code:-1,reason:err.message});return;}
   child.once('error',err=>resolve({code:-1,reason:err.message}));
   child.once('exit',(code,signal)=>resolve({code,reason:signal?'signal '+signal:'code '+code}));
  });
  await file.close();
  if(child?.pid){await log('Started server (pid '+child.pid+') on port '+cfg.port+'.');await updateState(cfg,{child:child.pid,restarts}).catch(()=>{});}
  const result=await ended;
  child=null;await updateState(cfg,{child:0}).catch(()=>{});
  return result;
 }

 let wait=1000,portTries=0,exitCode=0;
 try{
  while(!await shouldStop()){
   const there=await whoIsThere(cfg);
   if(there.kind!=='nothing'){
    if(++portTries>PORT_TRIES){
     await log('Port '+cfg.port+' is still taken ('+(there.why||'a Wordlight is running there')+'). Giving up; nothing on the port was touched.');
     exitCode=3;break;
    }
    await log('Port '+cfg.port+' is taken ('+(there.why||'a Wordlight is running there')+'). Not starting; trying again in '+wait/1000+' s ('+portTries+' of '+PORT_TRIES+').');
    await pause(wait);wait=Math.min(wait*2,MAX_WAIT_MS);continue;
   }
   portTries=0;
   const startedAt=Date.now(),result=await runServer(),ranMs=Date.now()-startedAt;
   if(result.code===0||await shouldStop()){await log('Server stopped on purpose ('+result.reason+'). Supervisor exiting.');break;}
   restarts++;
   if(ranMs>=HEALTHY_MS)wait=1000;
   const tail=await tailLines(cfg.serverLog,3);
   await log('Server stopped unexpectedly ('+result.reason+') after '+Math.round(ranMs/1000)+' s. Restart '+restarts+' in '+wait/1000+' s.'+(tail?' Last server output:\n'+tail:''));
   await pause(wait);wait=Math.min(wait*2,MAX_WAIT_MS);
  }
 }finally{
  clearInterval(heartbeat);
  for(const signal of ['SIGINT','SIGTERM','SIGBREAK'])process.off(signal,onSignal);
  await releaseSupervisor(cfg);await clearStop(cfg);
 }
 return exitCode;
}
