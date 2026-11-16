// Updates for the Windows package: is there a newer release, download it, and restart into it.
//
// Releases are published on GitHub with three files: the full package ZIP (for a first install), a small app ZIP
// (only the app\ folder, what an update needs) and SHA256SUMS.txt. Wordlight asks GitHub for the latest release once
// a day and when the operator presses Check now; it never downloads or installs anything by itself. Download checks
// the app ZIP against SHA256SUMS.txt, unpacks it to update\app\ beside the running app\, and leaves it there. The
// launcher puts it in place the next time Wordlight starts (tools/launcher/update.mjs), so a service is never
// interrupted by an update, and the previous version is kept for going back.
import {existsSync} from 'node:fs';
import {mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {zipEntries,readZipEntry} from './ziputil.mjs';
import {readLimited} from './dist/readlimit.mjs';
import {updatePaths} from './tools/launcher/update.mjs';

const LATEST_RELEASE='https://api.github.com/repos/TheDataIsaac/wordlight/releases/latest';
const CHECK_EVERY_MS=24*60*60*1000,APP_ZIP_LIMIT=50e6,FILE_LIMIT=20e6;
const fail=(status,message)=>Object.assign(new Error(message),{status});

// "1.10.0" is newer than "1.9.2". Anything that is not three numbers counts as 0.0.0.
export function compareVersions(a,b){
 const parts=v=>(/^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v||'').trim())||[0,0,0,0]).slice(1).map(Number);
 const x=parts(a),y=parts(b);
 for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;
 return 0;
}
// The parts of a GitHub release answer that Wordlight uses.
export function readRelease(release){
 const version=String(release?.tag_name||'').replace(/^v/,'');
 const assets=Array.isArray(release?.assets)?release.assets:[];
 const find=pattern=>assets.find(a=>pattern.test(String(a?.name||'')));
 const appZip=find(/^Wordlight-app-\d+\.\d+\.\d+\.zip$/),sums=find(/^SHA256SUMS\.txt$/);
 return {version,name:String(release?.name||'').slice(0,120),notes:String(release?.body||'').slice(0,3000),page:String(release?.html_url||''),
  appZip:appZip?{name:appZip.name,url:appZip.browser_download_url}:null,sums:sums?{url:sums.browser_download_url}:null};
}
// The checksum for one file from a SHA256SUMS.txt ("<64 hex>  <name>" per line).
export function checksumFor(sums,name){
 for(const line of String(sums).split(/\r?\n/)){const m=/^([a-f0-9]{64})\s+\*?(.+)$/i.exec(line.trim());if(m&&m[2]===name)return m[1].toLowerCase();}
 return '';
}

// root: the app folder (where server.mjs is). In the Windows package it sits beside runtime\node.exe.
export function createUpdater({root,dataDir,version,build,port,request=fetch,feed=process.env.WORDLIGHT_UPDATE_URL||LATEST_RELEASE}){
 const top=path.dirname(root),paths=updatePaths(top);
 const isPackage=existsSync(path.join(top,'runtime','node.exe'));
 let latest=null,checkedAt=0,checkError='',busy='',downloadError='';

 async function getBytes(url,limit,what){
  let response;
  try{response=await request(url,{signal:AbortSignal.timeout(120000),headers:{'User-Agent':'Wordlight-updater','Accept':'application/octet-stream'}});}
  catch{throw fail(502,'Could not reach GitHub to download '+what+'. Check the internet connection.');}
  if(!response.ok)throw fail(502,'The download of '+what+' failed ('+response.status+').');
  return Buffer.from(await readLimited(response,limit,what));
 }
 async function readJson(file){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}

 async function status(){
  const ready=await readJson(paths.ready),previous=await readJson(path.join(paths.previous,'build.json'));
  return {version,build,isPackage,latest,newer:!!latest&&compareVersions(latest.version,version)>0,checkedAt,checkError,busy,downloadError,
   ready:ready&&existsSync(paths.staged)?{version:ready.version,build:ready.build}:null,
   previous:previous?{version:previous.version,build:previous.build}:null};
 }
 async function check(){
  try{
   const response=await request(feed,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Wordlight-updater','Accept':'application/vnd.github+json'}});
   if(!response.ok)throw new Error('GitHub answered '+response.status+'.');
   latest=readRelease(JSON.parse(Buffer.from(await readLimited(response,1e6,'The release information')).toString('utf8')));
   checkError='';
  }catch(err){checkError=err.name==='TimeoutError'||err.name==='AbortError'?'GitHub did not answer. Check the internet connection.':(err.message||'The check failed.');}
  checkedAt=Date.now();
  return status();
 }
 // Downloads and checks the app ZIP, then unpacks it to update\app\. Nothing running is touched.
 async function download(){
  if(!isPackage)throw fail(409,'This copy runs from source, so it cannot update itself. Download the new version from GitHub.');
  if(busy)throw fail(409,'An update is already downloading.');
  if(!latest)await check();
  if(!latest||compareVersions(latest.version,version)<=0)throw fail(409,'There is no newer version to download.');
  if(!latest.appZip||!latest.sums)throw fail(422,'This release has no update files. Download the full package from GitHub instead.');
  busy='Downloading '+latest.version+'…';downloadError='';
  const release=latest,temp=path.join(top,'update','app-'+process.pid+'-'+Date.now());
  try{
   const sums=(await getBytes(release.sums.url,64000,'the checksums')).toString('utf8');
   const expected=checksumFor(sums,release.appZip.name);
   if(!expected)throw fail(422,'SHA256SUMS.txt has no checksum for '+release.appZip.name+'. Nothing was installed.');
   const zip=await getBytes(release.appZip.url,APP_ZIP_LIMIT,'the update');
   if(createHash('sha256').update(zip).digest('hex')!==expected)throw fail(422,'The downloaded update does not match its checksum. Nothing was installed.');
   busy='Unpacking '+release.version+'…';
   const files=zipEntries(zip).filter(e=>e.name.startsWith('app/')&&!e.name.endsWith('/'));
   for(const entry of files){
    // A name that would leave app\ ("app/../x") is refused rather than written.
    const relative=path.normalize(entry.name.slice(4));
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw fail(422,'The update contains an unsafe file name. Nothing was installed.');
    const target=path.join(temp,relative);await mkdir(path.dirname(target),{recursive:true});
    await writeFile(target,readZipEntry(zip,entry,FILE_LIMIT));
   }
   const info=await readJson(path.join(temp,'build.json')),pkg=await readJson(path.join(temp,'package.json'));
   if(!existsSync(path.join(temp,'server.mjs'))||pkg?.version!==release.version)throw fail(422,'The update is incomplete or for another version. Nothing was installed.');
   // The update reuses this package's runtime\node.exe, so it must be built for the same Node.js.
   if(info?.node&&info.node!==process.version)throw fail(409,'Version '+release.version+' needs a newer runtime. Download the full package from GitHub this time.');
   await rm(paths.staged,{recursive:true,force:true});await rename(temp,paths.staged);
   await writeFile(paths.ready,JSON.stringify({version:release.version,build:info?.build||release.version,downloadedAt:Date.now()}));
  }catch(err){downloadError=err.message||'The download failed.';await rm(temp,{recursive:true,force:true}).catch(()=>{});throw err;}
  finally{busy='';}
  return status();
 }
 // Restarts through the package's launcher, which installs the waiting update (or goes back) before starting again.
 // The launcher runs from the package folder, outside app\, so app\ can be swapped once Wordlight has stopped.
 function restart(){
  if(!isPackage)throw fail(409,'This copy runs from source. Stop and start it the way it was started.');
  const child=spawn(path.join(top,'runtime','node.exe'),[path.join(root,'tools','launcher','start.mjs'),'restart','--no-open'],
   {cwd:top,detached:true,windowsHide:true,stdio:'ignore',env:{...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_DATA_DIR:dataDir}});
  child.on('error',()=>{});child.unref();
 }
 async function goBack(){
  if(!isPackage||!existsSync(paths.previous))throw fail(409,'There is no previous version kept on this computer.');
  await mkdir(paths.folder,{recursive:true});await writeFile(paths.rollback,JSON.stringify({requestedAt:Date.now()}));
  restart();
 }
 // The daily check, in the Windows package only. It starts a minute after Wordlight, so it never slows the start, and
 // a failure only shows in Settings. A copy run from source checks only when asked.
 function schedule(){
  if(!isPackage)return;
  const run=()=>check().catch(()=>{});
  setTimeout(run,60000).unref();setInterval(run,CHECK_EVERY_MS).unref();
 }
 return {status,check,download,restart,goBack,schedule};
}
