// Portable launcher, run by the bundled node.exe from Start Wordlight.vbs and Stop Wordlight.vbs.
//   node launcher.mjs start [--no-window]   reuse a running Wordlight of this version, or start one, then open it
//   node launcher.mjs stop                  ask the running Wordlight to quit (saves finish first)
// Messages for the user are written to launcher-message.txt in the data folder; the .vbs file shows them.
// Exit codes: 0 done, 2 another Wordlight version is running, 3 the port belongs to another program, 4 start failed.
import {spawn} from 'node:child_process';
import http from 'node:http';
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const appDir=path.join(here,'..','app'),node=process.execPath;
const port=Number(process.env.WORDLIGHT_PORT)||18765,base='http://127.0.0.1:'+port;
const dataDir=process.env.WORDLIGHT_DATA_DIR||path.join(process.env.LOCALAPPDATA||path.join(here,'..'),'Wordlight','data');
const version=JSON.parse(await readFile(path.join(appDir,'package.json'),'utf8')).version;
// The packaged build id (version and commit); two builds of one version are told apart.
const build=await readFile(path.join(appDir,'build.json'),'utf8').then(t=>String(JSON.parse(t).build||'dev')).catch(()=>'dev');
const label=version+' ('+build+')';
const [command='start',...flags]=process.argv.slice(2);

async function say(code,message){
 await mkdir(dataDir,{recursive:true});await writeFile(path.join(dataDir,'launcher-message.txt'),message);
 console.log(message);process.exit(code);
}
// Plain HTTP without keep-alive: no socket stays open when the launcher exits.
function request(method,pathname,timeout){
 return new Promise(resolve=>{
  const req=http.request({host:'127.0.0.1',port,path:pathname,method,agent:false,timeout,headers:method==='POST'?{'Content-Type':'application/json','Content-Length':2}:{}},res=>{
   let text='';res.setEncoding('utf8');res.on('data',c=>{if(text.length<100000)text+=c;});
   res.on('end',()=>{let body=null;try{body=JSON.parse(text);}catch{}resolve({status:res.statusCode,body});});
  });
  req.on('timeout',()=>req.destroy());req.on('error',()=>resolve(null));
  if(method==='POST')req.write('{}');req.end();
 });
}
const get=pathname=>request('GET',pathname,1500);
// What answers on the port: nothing, this version, another Wordlight, or another program.
async function whoIsThere(){
 const health=await get('/api/health');
 if(!health)return {kind:'nothing'};
 if(health.body?.app==='wordlight'){const same=health.body.version===version&&String(health.body.build||'dev')===build;return {kind:same?'same':'other-version',version:health.body.version+' ('+(health.body.build||'dev')+')'};}
 const state=await get('/api/state');
 if(state?.body?.app==='wordlight')return {kind:'other-version',version:'an older version'};
 return {kind:'other-program'};
}
function openWindow(){
 const url=base+'/';
 const edge=['ProgramFiles(x86)','ProgramFiles'].map(v=>process.env[v]&&path.join(process.env[v],'Microsoft','Edge','Application','msedge.exe')).find(p=>p&&existsSync(p));
 // An Edge app window looks like a desktop app; otherwise the default browser opens the address.
 const child=edge?spawn(edge,['--app='+url,'--new-window'],{detached:true,stdio:'ignore'}):spawn(path.join(process.env.SystemRoot||'C:\\Windows','explorer.exe'),[url],{detached:true,stdio:'ignore'});
 child.unref();
}
async function start(){
 const there=await whoIsThere();
 if(there.kind==='other-version')return say(2,'Wordlight '+there.version+' is already running on this computer (port '+port+'). This package is Wordlight '+label+'.\n\nTo use this version, stop the running one first (Stop Wordlight in its folder, or end it from Task Manager if it was started another way), then start this one again. Nothing was stopped.');
 if(there.kind==='other-program')return say(3,'Another program is using port '+port+', which Wordlight needs (OBS uses this address). Close that program, then start Wordlight again.');
 if(there.kind==='nothing'){
  await mkdir(dataDir,{recursive:true});
  const logFile=path.join(dataDir,'companion.log'),log=await open(logFile,'a');
  const child=spawn(node,[path.join(appDir,'server.mjs')],{cwd:appDir,detached:true,windowsHide:true,stdio:['ignore',log.fd,log.fd],env:{...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_DATA_DIR:dataDir}});
  let exited=false;child.on('exit',()=>{exited=true;});child.unref();await log.close();
  // Wait up to 20 seconds. If the new companion stops early, another start may have won the port (a double-click):
  // use that one if it is this version, otherwise report why it stopped.
  const deadline=Date.now()+20000;let ready=false;
  while(!ready&&Date.now()<deadline){
   await new Promise(r=>setTimeout(r,250));
   const now=await whoIsThere();ready=now.kind==='same';
   if(!ready&&exited){
    if(now.kind==='other-version'||now.kind==='other-program')return start();
    const tail=(await readFile(logFile,'utf8').catch(()=>'')).trim().split(/\r?\n/).slice(-3).join('\n');
    return say(4,'Wordlight stopped while starting.'+(/EADDRINUSE|already running|in use/.test(tail)?' Port '+port+' is in use.':'')+' Details are in '+logFile+(tail?':\n\n'+tail:'.'));
   }
  }
  if(!ready)return say(4,'Wordlight did not answer within 20 seconds. Details are in '+path.join(dataDir,'companion.log')+'.');
 }
 if(!flags.includes('--no-window'))openWindow();
 return say(0,there.kind==='same'?'Wordlight '+label+' was already running; opened it.':'Wordlight '+label+' started.');
}
async function stop(){
 const there=await whoIsThere();
 if(there.kind==='nothing')return say(0,'Wordlight is not running.');
 if(there.kind==='other-program')return say(3,'Port '+port+' is used by another program, not Wordlight. Nothing was stopped.');
 const r=await request('POST','/api/app/quit',5000);
 if(r?.status!==200)return say(2,'This Wordlight ('+there.version+') cannot be stopped from here. Stop it the way it was started.');
 for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,250));if((await whoIsThere()).kind==='nothing')return say(0,'Wordlight stopped. OBS outputs from it are now blank.');}
 return say(4,'Wordlight was asked to stop but is still running.');
}
if(command==='start')await start();else if(command==='stop')await stop();else await say(1,'Use start or stop.');
