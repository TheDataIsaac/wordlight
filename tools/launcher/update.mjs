// Installing a downloaded update, or going back to the previous version. The launcher runs this just before it starts
// Wordlight, so nothing from the folder is running.
//
// The Windows package folder holds app\ (the code) and runtime\ (node.exe). A downloaded update waits in update\app\
// with update\ready.json. Installing it renames app\ to app-previous\ and update\app\ to app\. Going back swaps
// app\ and app-previous\. While Wordlight runs, its processes work inside app\, so Windows refuses the rename and
// nothing changes. Shows and settings live in the data folder, which is never moved; a few files are copied to
// backups\before-update-<version>\ first so they can be put back by hand.
import {cp,mkdir,readFile,rename,rm,stat} from 'node:fs/promises';
import path from 'node:path';

const DATA_FILES=['session.json','settings.json','remote.json','songs/index.json'];

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
 return {app:path.join(top,'app'),previous:path.join(top,'app-previous'),staged:path.join(top,'update','app'),
  ready:path.join(top,'update','ready.json'),rollback:path.join(top,'update','rollback.json'),folder:path.join(top,'update')};
}

async function backUpData(dataDir,label){
 const target=path.join(dataDir,'backups','before-update-'+label.replace(/[^\w.+-]/g,'_')+'-'+Date.now());
 for(const name of DATA_FILES){
  const from=path.join(dataDir,name);
  if(await exists(from)){await mkdir(path.dirname(path.join(target,name)),{recursive:true});await cp(from,path.join(target,name));}
 }
 return target;
}

// Returns what happened, for the launcher log: 'none', 'updated', 'rolled-back', or 'failed' with a reason.
export async function applyPending({top,dataDir}){
 const p=updatePaths(top);
 const rollback=await exists(p.rollback),ready=await readJson(p.ready);
 if(rollback){
  await rm(p.rollback,{force:true});
  if(!await exists(p.previous))return {result:'failed',why:'there is no previous version to go back to'};
  const from=(await readJson(path.join(p.app,'build.json')))?.build||'this version';
  await backUpData(dataDir,'rollback-from-'+from);
  const swap=path.join(top,'app-swap');
  try{await renameRetry(p.app,swap);}catch(err){return {result:'failed',why:'app is in use ('+err.code+')'};}
  try{await renameRetry(p.previous,p.app);}catch(err){await renameRetry(swap,p.app).catch(()=>{});return {result:'failed',why:'could not move app-previous ('+err.code+')'};}
  await renameRetry(swap,p.previous).catch(()=>{});
  return {result:'rolled-back',from};
 }
 if(!ready||!await exists(p.staged))return {result:'none'};
 const backup=await backUpData(dataDir,ready.version||'update');
 await rm(p.previous,{recursive:true,force:true});
 try{await renameRetry(p.app,p.previous);}catch(err){return {result:'failed',why:'app is in use ('+err.code+')'};}
 try{await renameRetry(p.staged,p.app);}
 catch(err){await renameRetry(p.previous,p.app).catch(()=>{});return {result:'failed',why:'could not move the update into place ('+err.code+')'};}
 await rm(p.folder,{recursive:true,force:true}).catch(()=>{});
 return {result:'updated',version:ready.version,backup};
}
