// Checks the built Windows package the way a church would first use it: unpacks build/Wordlight-portable-<version>-win-x64.zip
// into a throwaway folder, starts it with its own runtime on a free test port and a throwaway data folder, and checks
// that the companion answers with the right build, serves the studio, the stage page and the update status, and stops.
//   node tools/smoke-package.mjs
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipEntries,readZipEntry} from '../ziputil.mjs';

const repo=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const {version}=JSON.parse(await readFile(path.join(repo,'package.json'),'utf8'));
const zipFile=path.join(repo,'build','Wordlight-portable-'+version+'-win-x64.zip');
const folder=await mkdtemp(path.join(tmpdir(),'wordlight-smoke-')),port=18980;
const fail=message=>{console.error('SMOKE CHECK FAILED: '+message);process.exitCode=1;};
try{
 const zip=await readFile(zipFile);
 for(const entry of zipEntries(zip)){
  if(entry.name.endsWith('/'))continue;
  const target=path.join(folder,entry.name);await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,readZipEntry(zip,entry,200e6));
 }
 const top=path.join(folder,'Wordlight'),node=path.join(top,'runtime','node.exe');
 const env={...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_REMOTE_PORT:String(port+1),WORDLIGHT_REMOTE_BIND:'127.0.0.1',WORDLIGHT_DATA_DIR:path.join(folder,'data'),WORDLIGHT_BIBLE_SEEDS:path.join(top,'bibles')};
 const start=spawnSync(node,['app/tools/launcher/start.mjs','start','--no-open'],{cwd:top,env,encoding:'utf8',timeout:120000});
 if(start.status!==0)fail('the package did not start: '+start.stdout+start.stderr);
 const base='http://127.0.0.1:'+port,get=async p=>{const r=await fetch(base+p);return {status:r.status,text:await r.text()};};
 const build=JSON.parse(await readFile(path.join(top,'app','build.json'),'utf8')).build;
 const health=JSON.parse((await get('/api/health')).text);
 if(health.build!==build)fail('the companion reports build '+health.build+', the package holds '+build);
 for(const page of ['/','/app.js','/stage','/?view=output&obs=1'])if((await get(page)).status!==200)fail(page+' did not load');
 const update=JSON.parse((await get('/api/update')).text);
 if(!update.isPackage)fail('the updater does not see itself running in the package');
 console.log('Package '+build+': started, answered in '+health.memory.rssMB+' MB, studio, stage, output and update status all fine.');
 const stop=spawnSync(node,['app/tools/launcher/start.mjs','stop'],{cwd:top,env,encoding:'utf8',timeout:60000});
 if(stop.status!==0)fail('the package did not stop: '+stop.stdout+stop.stderr);
}catch(err){fail(err.message);}
finally{await rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:300}).catch(()=>{});}
