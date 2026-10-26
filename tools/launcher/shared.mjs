// Helpers shared by the launcher (start.mjs) and the crash-recovery supervisor (supervisor.mjs).
import http from 'node:http';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {appendFile,mkdir,open,readFile,rename,stat,truncate,unlink,writeFile} from 'node:fs/promises';

export const appRoot=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','..');

// Log limits: launcher.log and server.log each keep two older copies, and a single server run can never grow
// server.log past SERVER_LOG_HARD (the server holds the file open, so it is emptied rather than renamed).
export const LAUNCHER_LOG_MAX=256*1024,SERVER_LOG_MAX=1024*1024,SERVER_LOG_HARD=5*1024*1024;
// A supervisor that has not touched its state file for this long is treated as gone, even if its process id exists.
const STALE_MS=60_000;

// Port and data folder follow the same variables and defaults as server.mjs, so the launcher, supervisor and
// server always agree. A relative data folder is resolved against the app folder, like the server's working folder.
export function loadConfig(env=process.env){
 const port=Number(env.WORDLIGHT_PORT)||18765;
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('WORDLIGHT_PORT is "'+env.WORDLIGHT_PORT+'", which is not a port number from 1 to 65535. Fix or remove it, then start again.');
 const dataDir=path.resolve(appRoot,env.WORDLIGHT_DATA_DIR||'.wordlight-data');
 const logDir=path.join(dataDir,'logs');
 return {port,dataDir,logDir,root:path.resolve(appRoot),node:process.execPath,
  url:'http://127.0.0.1:'+port,
  launcherLog:path.join(logDir,'launcher.log'),serverLog:path.join(logDir,'server.log'),
  stateFile:path.join(dataDir,'supervisor.json'),stopFile:path.join(dataDir,'stop-requested')};
}

// Settings kept in <data folder>/companion.env (see deploy/hetzner/README.md) apply to the server this launcher starts,
// as with `node --env-file-if-exists=...`. A variable that is already set in the environment wins over the file.
// Uses process.loadEnvFile, which needs Node.js 20.12 or newer (or 21.7+); run.cmd checks for it.
export function loadCompanionEnv(cfg){
 const file=path.join(cfg.dataDir,'companion.env');
 if(!existsSync(file))return false;
 if(typeof process.loadEnvFile!=='function')throw new Error('Reading '+file+' needs Node.js 20.12 or newer. Update Node.js from https://nodejs.org and start again.');
 try{process.loadEnvFile(file);return true;}
 catch(err){throw new Error('Could not read '+file+' ('+err.message+'). Fix or move that file, then start again.');}
}

export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// ---- Logs ----
// Keeps `file`, `file.1` and `file.2`: once `file` passes maxBytes it becomes `file.1` and the old `.1` becomes `.2`.
export async function rotateIfLarge(file,maxBytes){
 let size=0;try{size=(await stat(file)).size;}catch{return;}
 if(size<=maxBytes)return;
 await rename(file+'.1',file+'.2').catch(()=>{});
 await rename(file,file+'.1').catch(()=>{});
}
// Empties a log that a running process still holds open. Returns true if it was emptied.
export async function emptyIfHuge(file,maxBytes){
 try{if((await stat(file)).size<=maxBytes)return false;await truncate(file,0);return true;}catch{return false;}
}
// A logging problem must never stop the launcher or the supervisor, so failures only reach the console.
export async function writeLog(cfg,who,text){
 try{
  await mkdir(cfg.logDir,{recursive:true});
  await rotateIfLarge(cfg.launcherLog,LAUNCHER_LOG_MAX);
  await appendFile(cfg.launcherLog,new Date().toISOString()+' ['+who+'] '+text+'\n');
 }catch(err){console.error('Could not write '+cfg.launcherLog+': '+err.message);}
}
// The last few lines of a file, for error messages. Reads only the end of the file.
export async function tailLines(file,count=5){
 try{
  const handle=await open(file,'r');
  try{
   const {size}=await handle.stat(),length=Math.min(size,4096),buffer=Buffer.alloc(length);
   await handle.read(buffer,0,length,size-length);
   return buffer.toString('utf8').split(/\r?\n/).filter(Boolean).slice(-count).join('\n');
  }finally{await handle.close();}
 }catch{return '';}
}

// ---- Talking to the server on the port ----
// Plain HTTP without keep-alive, so no socket stays open. Resolves {status,body} or {error:code}.
function request(cfg,method,pathname,timeout){
 return new Promise(resolve=>{
  const req=http.request({host:'127.0.0.1',port:cfg.port,path:pathname,method,agent:false,timeout,headers:method==='POST'?{'Content-Type':'application/json','Content-Length':2}:{}},res=>{
   let text='';res.setEncoding('utf8');
   res.on('data',chunk=>{if(text.length<100000)text+=chunk;});
   res.on('end',()=>{let body=null;try{body=JSON.parse(text);}catch{}resolve({status:res.statusCode,body});});
   res.on('close',()=>resolve({error:'closed'}));
  });
  req.on('timeout',()=>{req.destroy();resolve({error:'timeout'});});
  req.on('error',err=>resolve({error:err.code||'error'}));
  if(method==='POST')req.write('{}');
  req.end();
 });
}
// What is on the port: nothing (connection refused), a Wordlight, or something else. A program that holds the port
// but does not answer counts as "other", never as free.
export async function whoIsThere(cfg){
 const health=await request(cfg,'GET','/api/health',3000);
 if(health.error==='ECONNREFUSED')return {kind:'nothing'};
 if(health.error)return {kind:'other',why:'it did not answer ('+health.error+')'};
 if(health.body?.app==='wordlight')return {kind:'wordlight',version:health.body.version,build:health.body.build};
 return {kind:'other',why:'it is not Wordlight'};
}
// Asks the Wordlight on the port to finish its saves and quit (the same call Stop Wordlight uses).
export const askToQuit=cfg=>request(cfg,'POST','/api/app/quit',5000);

// ---- Supervisor state file and stop request ----
// supervisor.json doubles as the "one supervisor per data folder" lock: it is created exclusively, rewritten every
// few seconds by its owner, and counts as a live supervisor only while its process exists and the file is fresh.
const pidAlive=pid=>{try{process.kill(pid,0);return true;}catch(err){return err.code==='EPERM';}};
export async function readState(cfg){try{return JSON.parse(await readFile(cfg.stateFile,'utf8'));}catch{return null;}}
export async function supervisorAlive(cfg){
 let age;try{age=Date.now()-(await stat(cfg.stateFile)).mtimeMs;}catch{return null;}
 const state=await readState(cfg);
 // A file that is empty or half written was changed a moment ago by a supervisor that is still writing it.
 if(!state)return age<5000?{pid:0}:null;
 return pidAlive(state.pid)&&age<STALE_MS?state:null;
}
// True if this process now owns the lock; false if a live supervisor already does. A stale file is replaced.
export async function claimSupervisor(cfg,state){
 await mkdir(cfg.dataDir,{recursive:true});
 for(let attempt=0;attempt<2;attempt++){
  try{await writeFile(cfg.stateFile,JSON.stringify(state),{flag:'wx'});return true;}
  catch(err){if(err.code!=='EEXIST')throw err;}
  if(await supervisorAlive(cfg))return false;
  await unlink(cfg.stateFile).catch(()=>{});
 }
 return false;
}
// Rewrites the state file (which also refreshes its age). False only if the file clearly belongs to another
// supervisor. Updates run one at a time, so this process never reads the file while it is half written by itself;
// a missing or unreadable file is simply written again.
let updates=Promise.resolve();
export function updateState(cfg,changes){
 const run=updates.then(async()=>{
  const state=await readState(cfg);
  if(state&&state.pid!==process.pid)return false;
  await writeFile(cfg.stateFile,JSON.stringify({pid:process.pid,port:cfg.port,...state,...changes}));return true;
 });
 updates=run.catch(()=>{});return run;
}
export async function releaseSupervisor(cfg){
 const state=await readState(cfg);
 if(state?.pid===process.pid)await unlink(cfg.stateFile).catch(()=>{});
}
// Stop Wordlight leaves this file so the supervisor knows the stop was on purpose and does not restart the server.
export const requestStop=cfg=>writeFile(cfg.stopFile,new Date().toISOString());
export const stopRequested=cfg=>stat(cfg.stopFile).then(()=>true,()=>false);
export const clearStop=cfg=>unlink(cfg.stopFile).catch(()=>{});
