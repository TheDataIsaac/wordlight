// Installing a downloaded update, or going back to the previous version. The launcher runs this just before it starts
// Wordlight, so nothing from the folder is running.
//
// The Windows package folder holds app\ (the code) and runtime\ (node.exe). A downloaded update waits in update\app\
// with update\ready.json. Every swap first moves the running version aside as app-swap\, then moves the other version
// into app\, and only then turns app-swap\ into app-previous\. Nothing is deleted before the new app\ is in place.
// If a swap is cut short (power cut, killed process), app-swap\ is still the version that ran last: the Start scripts,
// which live outside app\, move it back to app\ when app\ is missing, and the next start finishes or retries the swap.
// While Wordlight runs, its processes work inside app\, so Windows refuses the rename and nothing changes.
// Shows and settings live in the data folder, which is never moved; a few files are copied to
// backups\before-update-<version>\ first so they can be put back by hand.
import {cp,mkdir,open,readFile,rename,rm,stat} from 'node:fs/promises';
import path from 'node:path';

const DATA_FILES=['session.json','settings.json','remote.json','songs/index.json'];
// A lock older than this was left by a start that died; it no longer holds anything.
const LOCK_STALE_MS=2*60*1000;

const exists=file=>stat(file).then(()=>true,()=>false);
const readJson=file=>readFile(file,'utf8').then(JSON.parse,()=>null);
// Windows can refuse a rename for a moment while an antivirus or indexer looks at new files.
async function renameRetry(from,to){
 for(let attempt=0;;attempt++){
  try{return await rename(from,to);}
  catch(err){if(attempt>=6||!['EPERM','EBUSY','EACCES'].includes(err.code))throw err;await new Promise(r=>setTimeout(r,250*(attempt+1)));}
 }
}

export function updatePaths(top){
 return {app:path.join(top,'app'),previous:path.join(top,'app-previous'),swap:path.join(top,'app-swap'),staged:path.join(top,'update','app'),
  ready:path.join(top,'update','ready.json'),rollback:path.join(top,'update','rollback.json'),folder:path.join(top,'update'),lock:path.join(top,'update.lock')};
}

async function backUpData(dataDir,label){
 const target=path.join(dataDir,'backups','before-update-'+label.replace(/[^\w.+-]/g,'_')+'-'+Date.now());
 for(const name of DATA_FILES){
  const from=path.join(dataDir,name);
  if(await exists(from)){await mkdir(path.dirname(path.join(target,name)),{recursive:true});await cp(from,path.join(target,name));}
 }
 return target;
}

// Only one start swaps at a time: two Starts at once (a double-click, Start with Windows) must not both move folders.
// A second start waits up to 30 seconds for the first, then looks again at what is still waiting.
async function takeLock(file){
 for(const end=Date.now()+30000;;){
  try{const handle=await open(file,'wx');await handle.writeFile(String(process.pid));await handle.close();return true;}
  catch(err){
   if(err.code!=='EEXIST')return false;
   const age=Date.now()-((await stat(file).catch(()=>null))?.mtimeMs||0);
   if(age>=LOCK_STALE_MS){await rm(file,{force:true});continue;}
   if(Date.now()>end)return false;
   await new Promise(r=>setTimeout(r,250));
  }
 }
}

// A swap that was cut short: app-swap\ is the version that ran last. With no app\, it goes back; next to a working
// app\, it becomes the kept previous version.
async function finishInterrupted(p){
 if(!await exists(p.swap))return;
 if(!await exists(p.app)){await renameRetry(p.swap,p.app);return;}
 await rm(p.previous,{recursive:true,force:true});
 await renameRetry(p.swap,p.previous);
}

// Moves `incoming` into app\, keeping the running version as app-previous\. Returns null when done, or why not.
async function swapIn(p,incoming){
 try{await renameRetry(p.app,p.swap);}catch(err){return 'app is in use ('+err.code+')';}
 try{await renameRetry(incoming,p.app);}
 catch(err){await renameRetry(p.swap,p.app).catch(()=>{});return 'could not move the new version into place ('+err.code+')';}
 // The new app\ is in place; only now is the old previous version removed.
 await rm(p.previous,{recursive:true,force:true}).catch(()=>{});
 await renameRetry(p.swap,p.previous).catch(()=>{});
 return null;
}

// Returns what happened, for the launcher log: 'none', 'updated', 'rolled-back', or 'failed' with a reason.
export async function applyPending({top,dataDir}){
 const p=updatePaths(top);
 if(!await takeLock(p.lock))return {result:'none'};
 try{
  await finishInterrupted(p);
  if(await exists(p.rollback)){
   await rm(p.rollback,{force:true});
   if(!await exists(p.previous))return {result:'failed',why:'there is no previous version to go back to'};
   const from=(await readJson(path.join(p.app,'build.json')))?.build||'this version';
   await backUpData(dataDir,'rollback-from-'+from);
   const why=await swapIn(p,p.previous);
   return why?{result:'failed',why}:{result:'rolled-back',from};
  }
  const ready=await readJson(p.ready);
  if(!ready||!await exists(p.staged))return {result:'none'};
  const backup=await backUpData(dataDir,ready.version||'update');
  const why=await swapIn(p,p.staged);
  if(why)return {result:'failed',why};
  await rm(p.folder,{recursive:true,force:true}).catch(()=>{});
  return {result:'updated',version:ready.version,backup};
 }finally{await rm(p.lock,{force:true}).catch(()=>{});}
}
