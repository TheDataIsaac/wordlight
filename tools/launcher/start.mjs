// Windows launcher, run by run.cmd (Start Wordlight.cmd and Stop Wordlight.cmd).
//   node start.mjs start [--foreground] [--no-open]   start Wordlight with crash recovery, or open the running one
//   node start.mjs stop                               stop Wordlight on purpose (saves finish first)
// Port and data folder come from WORDLIGHT_PORT and WORDLIGHT_DATA_DIR, as for server.mjs.
// Exit codes: 0 done, 1 bad setup, 2 could not stop, 3 the port belongs to another program, 4 start failed.
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {askToQuit,clearStop,loadCompanionEnv,loadConfig,requestStop,sleep,supervisorAlive,tailLines,whoIsThere,writeLog} from './shared.mjs';
import {supervise} from './supervisor.mjs';

const [command='start',...flags]=process.argv.slice(2);
let cfg;
try{
 cfg=loadConfig();
 // companion.env can set WORDLIGHT_PORT and the other settings, so it is read before the final setup is made.
 if(loadCompanionEnv(cfg))cfg=loadConfig();
}catch(err){console.error(err.message);process.exit(1);}

async function finish(code,message){
 await writeLog(cfg,'launcher',message.split('\n')[0]);
 (code===0?console.log:console.error)(message);
 process.exit(code);
}
function openWindow(){
 const child=process.platform==='win32'?spawn(path.join(process.env.SystemRoot||'C:\\Windows','explorer.exe'),[cfg.url],{detached:true,stdio:'ignore',windowsHide:true})
  :spawn(process.platform==='darwin'?'open':'xdg-open',[cfg.url],{detached:true,stdio:'ignore'});
 child.on('error',()=>{});child.unref();
}
// Polls until Wordlight answers on the port, up to 20 seconds. `supervisorEnded()` says if the supervisor we started has failed.
async function waitUntilRunning(supervisorEnded){
 for(const end=Date.now()+20_000;Date.now()<end;){
  if((await whoIsThere(cfg)).kind==='wordlight')return true;
  if(supervisorEnded())return false;
  await sleep(250);
 }
 return false;
}
const portTaken=there=>'Port '+cfg.port+' is in use and Wordlight needs it (OBS uses this address): '+there.why+'. Nothing was stopped, started or opened.\nClose the program that uses the port, or set WORDLIGHT_PORT to a free port, then start Wordlight again.';
const failedToStart=async(reason)=>{
 const tail=await tailLines(cfg.serverLog,5),notes=await tailLines(cfg.launcherLog,3);
 return finish(4,'Wordlight did not start: '+reason+'\nDetails: '+cfg.logDir+(notes?'\n\nLast launcher log lines:\n'+notes:'')+(tail?'\n\nLast server output:\n'+tail:'')+'\n\nIf the problem is fixed, start Wordlight again. Stop Wordlight cancels any retries still running.');
};

async function start(){
 const there=await whoIsThere(cfg);
 if(there.kind==='other')return finish(3,portTaken(there));
 const open=!flags.includes('--no-open');

 if(there.kind==='wordlight'){
  const supervised=await supervisorAlive(cfg);
  if(open)openWindow();
  return finish(0,supervised?'Wordlight is already running at '+cfg.url+' with crash recovery.'
   :'Wordlight is already running at '+cfg.url+', but it was not started by this launcher, so it will not restart itself if it stops. Nothing was changed.\nTo add crash recovery, run Stop Wordlight and then Start Wordlight at a quiet moment; OBS outputs keep their last screen meanwhile.');
 }

 if(flags.includes('--foreground')){
  // The supervisor runs in this window (or Task Scheduler task) until Wordlight is stopped.
  waitUntilRunning(()=>false).then(running=>{if(running&&open)openWindow();});
  console.log('Wordlight supervisor running. Press Ctrl+C to stop Wordlight.');
  const code=await supervise(cfg);
  return finish(code,code===0?'Wordlight supervisor ended. Details: '+cfg.logDir:portTaken({why:'another program holds it'}));
 }

 let supervisorEnded=()=>false;
 if(!await supervisorAlive(cfg)){
  // The supervisor outlives this window, so closing it does not stop Wordlight.
  const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'supervise'],{cwd:cfg.root,detached:true,windowsHide:true,stdio:'ignore',env:{...process.env,WORDLIGHT_PORT:String(cfg.port),WORDLIGHT_DATA_DIR:cfg.dataDir}});
  let ended=null;child.on('exit',code=>{ended=code;});child.on('error',()=>{ended=1;});child.unref();
  // Exit code 0 means another start won the race for the supervisor lock; its server is the one we wait for.
  supervisorEnded=()=>ended!==null&&ended!==0;
 }
 if(!await waitUntilRunning(supervisorEnded)){
  const now=await whoIsThere(cfg);
  if(now.kind==='other')return finish(3,portTaken(now));
  return failedToStart(supervisorEnded()?'the supervisor stopped.':'it did not answer within 20 seconds.');
 }
 if(open)openWindow();
 return finish(0,'Wordlight is running at '+cfg.url+' with crash recovery.\nClosing this window does not stop it. Use Stop Wordlight to stop it.\nLogs: '+cfg.logDir);
}

async function stop(){
 const there=await whoIsThere(cfg),supervisor=await supervisorAlive(cfg);
 if(there.kind==='other'&&!supervisor)return finish(3,'Port '+cfg.port+' is used by another program, not Wordlight ('+there.why+'). Nothing was stopped.');
 if(there.kind==='nothing'&&!supervisor){await clearStop(cfg);return finish(0,'Wordlight is not running.');}
 // The stop request goes first, so the supervisor does not treat the server quitting as a crash.
 if(supervisor)await requestStop(cfg);
 if(there.kind==='wordlight'){
  const answer=await askToQuit(cfg);
  if(answer.status!==200)return finish(2,'Wordlight ('+there.version+') did not accept the stop request. Nothing was force-closed. Stop it the way it was started.');
 }
 // Done when the Wordlight we asked has left the port and the supervisor has exited (up to 15 seconds).
 const settled=async()=>(there.kind!=='wordlight'||(await whoIsThere(cfg)).kind==='nothing')&&!await supervisorAlive(cfg);
 for(let i=0;i<60&&!await settled();i++)await sleep(250);
 if(!await settled())return finish(2,'Wordlight was asked to stop but is still running. Details: '+cfg.logDir);
 await clearStop(cfg);
 return finish(0,'Wordlight stopped. OBS outputs from it are now blank until it starts again.');
}

if(command==='start')await start();
else if(command==='stop')await stop();
// Internal: the detached process that Start Wordlight leaves running.
else if(command==='supervise')process.exit(await supervise(cfg));
else await finish(1,'Use start or stop.');
