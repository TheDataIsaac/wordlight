import http from 'node:http';
import {readFile,writeFile,mkdir,rename,copyFile,readdir,unlink,stat,rm} from 'node:fs/promises';
import os from 'node:os';
import {freeShowToSong,searchSongs,foldText,foldWords,cleanSong,settings,applySettings,cleanSettings} from './dist/songs.mjs';
import {searchEntry,entryForCache,entryFromCache,findInSongbook,vocabulary} from './song-search.mjs';
import {createHash} from 'node:crypto';
import {cleanGraphics} from './dist/graphics.mjs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {DEFAULT,cleanDraft,snapshot,validLive} from './dist/core.mjs';
import {cleanLibrary,activeShow,backgroundAssetIds} from './dist/library.mjs';
import {createApiBible} from './apibible.mjs';
import {createBibleLibrary} from './bibles.mjs';
import {createBibleSearch} from './bible-search.mjs';
import {createListener} from './listen.mjs';
import {readNotices,addNotice,dismissNotice} from './notices.mjs';
import {readEasyWorship} from './easyworship.mjs';
import {createRemote} from './remote-server.mjs';
import {createBibleLookup,wordsOnLive} from './remote-content.mjs';
import {createProjector} from './projector.mjs';
import {stageState,cleanStageMessage} from './dist/stage.mjs';
import {createUpdater} from './updates.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.WORDLIGHT_PORT)||18765;
const dataDir=process.env.WORDLIGHT_DATA_DIR||path.join(root,'.wordlight-data');
const APP_VERSION=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version||'0';
// A packaged build carries build.json (version and commit); a source checkout reports 'dev'.
// WORDLIGHT_PREVIEW=1 marks a review copy so the studio can label itself; normal starts are not marked.
const APP_PREVIEW=process.env.WORDLIGHT_PREVIEW==='1';
const APP_BUILD=await readFile(path.join(root,'build.json'),'utf8').then(t=>String(JSON.parse(t).build||'dev')).catch(()=>'dev');
const initialLibrary=cleanLibrary(null,DEFAULT);initialLibrary.shows.forEach(s=>s.updated=0);initialLibrary.savedAt=0;
let state={app:'wordlight',library:initialLibrary,draft:activeShow(initialLibrary).draft,live:{...snapshot(DEFAULT),blank:true}};
let liveFromDisk=false;
function loadSaved(saved){if(saved.library||saved.draft){state.library=cleanLibrary(saved.library,saved.draft);state.draft=activeShow(state.library).draft;}if(validLive(saved.live)){liveFromDisk=true;state.live=saved.live;try{state.live.graphics=cleanGraphics(saved.live.graphics);}catch(err){console.error('Saved graphics settings were not valid and were reset: '+err.message);state.live.graphics=cleanGraphics();}}}
// Windows can refuse a read or rename for a moment while another program (OneDrive, antivirus, an indexer) holds
// the file. This tries again a few times over about 1.5 s before giving up.
async function retryBusy(work){
 for(let attempt=0;;attempt++){
  try{return await work();}
  catch(err){if(attempt>=4||!['EPERM','EBUSY','EACCES'].includes(err.code))throw err;await new Promise(r=>setTimeout(r,150*(attempt+1)));}
 }
}
// When a backup in backups/ was made, in local time (its name, session-2026-11-16T10-23-45-123Z.json, is in UTC).
const backupTime=name=>{const m=/^session-(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)/.exec(name);return m?new Date(m[1]+'T'+m[2]+':'+m[3]+':'+m[4]+'Z').toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):name;};
// A damaged session.json is kept under a new name and the newest readable backup is loaded instead,
// so a bad write never silently starts the companion with an empty library. A missing or unreadable session.json
// also falls back to the newest backup, if there is one.
{
 const file=path.join(dataDir,'session.json');let text=null,readError=null,damaged=false;
 try{text=await retryBusy(()=>readFile(file,'utf8'));}catch(err){readError=err;}
 if(text!==null){try{loadSaved(JSON.parse(text));}catch{damaged=true;}}
 if(damaged){
  const kept=path.join(dataDir,'session-damaged-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
  await rename(file,kept).catch(()=>{});console.error('session.json could not be read. It was kept as '+path.basename(kept)+'.');
  await addNotice(dataDir,{kind:'recovery',level:'warning',text:'Your saved shows could not be read when Wordlight started, so the damaged file was kept as '+path.basename(kept)+'. Check your shows.'}).catch(()=>{});
 }
 if(damaged||readError){
  const dir=path.join(dataDir,'backups');let names=[];try{names=(await readdir(dir)).filter(f=>/^session-.*\.json$/.test(f)).sort().reverse();}catch{}
  // A first start has no session.json and no backups: nothing to report.
  if(readError&&names.length)console.error(readError.code==='ENOENT'?'session.json is missing.':'session.json could not be read ('+(readError.code||readError.message)+').');
  for(const name of names){
   try{loadSaved(JSON.parse(await readFile(path.join(dir,name),'utf8')));}catch{continue;}
   // An unreadable (not missing) session.json is left in place: the next save keeps a copy in backups/ first.
   console.error('Loaded the backup '+name+'.');
   await addNotice(dataDir,{kind:'recovery',level:'warning',text:'Wordlight opened your shows from the backup made '+backupTime(name)+'. Changes made after that may be missing.'}).catch(()=>{});
   if(damaged||readError?.code==='ENOENT')await copyFile(path.join(dir,name),file).catch(()=>{});break;
  }
 }
}
// The screen saved on its own after the last library save, if it is newer than the one in session.json (or session.json
// had none: the starting blank screen is stamped with the time Wordlight started, so it is not compared).
try{const saved=JSON.parse(await retryBusy(()=>readFile(path.join(dataDir,'live.json'),'utf8')));if(validLive(saved?.live)&&(!liveFromDisk||Number(saved.live.updated)>Number(state.live.updated||0)))loadSaved({live:saved.live});}catch{}
// Pairing for the hosted studio bridge. The code lives only in this data folder and is shown in the local studio.
// The bridge accepts live screen state, never shows, and only from the configured hosted origins.
// The web-studio bridge is off unless WORDLIGHT_BRIDGE_ORIGINS names the https site allowed to send screens.
const bridgeOrigins=new Set((process.env.WORDLIGHT_BRIDGE_ORIGINS||'').split(',').map(o=>o.trim()).filter(o=>/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o)));
const newCode=()=>randomBytes(9).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g,'X').match(/.{4}/g).join('-');
let bridge=null;
try{const saved=JSON.parse(await retryBusy(()=>readFile(path.join(dataDir,'bridge.json'),'utf8')));if(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){2}$/.test(saved.code))bridge=saved;}catch{}
// bridge.json is written only when there is a new code, through a temporary file, so a crash or power cut while
// writing it cannot lose the code a web studio is paired with.
async function saveBridge(next){await mkdir(dataDir,{recursive:true});await writeAtomic(path.join(dataDir,'bridge.json'),JSON.stringify(next));}
if(!bridge){bridge={code:newCode()};await saveBridge(bridge).catch(()=>{});}
const sameCode=value=>{const a=Buffer.from(String(value||'')),b=Buffer.from(bridge.code);return a.length===b.length&&timingSafeEqual(a,b);};
// Output pages that currently hold the live event stream open, by view. This counts connections to the
// companion only; it cannot tell whether OBS or a TV is actually showing them.
const viewers={output:0,lower:0,graphics:0,studio:0,projector:0};
const clients=new Set();
let writes=Promise.resolve();
// Before replacing session.json, keep a copy at most every 10 minutes in backups/. Kept: the newest 20, and the newest
// of each of the last 14 days, so a show deleted on Sunday and missed until Wednesday can still be found.
let lastBackup=0;
async function backup(){
 if(Date.now()-lastBackup<600000)return;
 const dir=path.join(dataDir,'backups');await mkdir(dir,{recursive:true});
 // No session.json yet (first save): nothing to keep, and the next save tries again.
 try{await copyFile(path.join(dataDir,'session.json'),path.join(dir,'session-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'));}catch{return;}
 lastBackup=Date.now();
 const names=(await readdir(dir)).filter(f=>/^session-.*\.json$/.test(f)).sort(),keep=new Set(names.slice(-20)),days=new Set();
 for(const name of [...names].reverse()){const day=name.slice(8,18);if(days.size<14&&!days.has(day)){days.add(day);keep.add(name);}}
 for(const f of names)if(!keep.has(f))await unlink(path.join(dir,f)).catch(()=>{});
}
// Changes to the session (studio saves, sends from the web studio and the phone remote) run one at a time, so each
// starts from the last saved state and a failed save can simply put the previous state back.
let stateQueue=Promise.resolve();
// The id of the last library save, so a tab whose answer was lost can tell that save was its own.
let lastWriteId='';
const inStateQueue=task=>{const run=stateQueue.then(task,task);stateQueue=run.catch(()=>{});return run;};
// A screen change (the next slide, a verse from the phone) saves only the screen, in live.json, so it never rewrites
// every show. Library saves still write the whole session to session.json. At start the newer screen of the two wins.
function persistLive(){const json=JSON.stringify({live:state.live});writes=writes.catch(()=>{}).then(async()=>{await mkdir(dataDir,{recursive:true});const tmp=path.join(dataDir,'live.tmp');await writeFile(tmp,json,'utf8');await retryBusy(()=>rename(tmp,path.join(dataDir,'live.json')));});return writes;}
function persist(){const json=JSON.stringify(state);writes=writes.catch(()=>{}).then(async()=>{await mkdir(dataDir,{recursive:true});await backup().catch(()=>{});const tmp=path.join(dataDir,'session.tmp');await writeFile(tmp,json,'utf8');await retryBusy(()=>rename(tmp,path.join(dataDir,'session.json')));});return writes;}
function json(res,code,data,extra={}){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(data));}
const localOrigins=()=>['http://127.0.0.1:'+port,'http://localhost:'+port];
const corsFor=origin=>({'Access-Control-Allow-Origin':origin,'Vary':'Origin'});
// Bytes are joined before they are decoded: a letter split across two network chunks would otherwise be destroyed.
async function readBuffer(req,limit){const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>limit)throw Object.assign(new Error('Too large.'),{status:413});parts.push(part);}return Buffer.concat(parts);}
async function readBytes(req,limit){return (await readBuffer(req,limit)).toString('utf8');}
async function readJSON(req,limit){return JSON.parse(await readBytes(req,limit));}
// Read-only FreeShow song library for the local studio. Locations come from FreeShow's own settings
// (overridable for tests). The metadata index is kept in memory and reloaded when shows.json changes; a song's
// .show file is read only when that song is opened. Nothing is ever written to FreeShow.
async function freeShowPaths(){
 const appData=process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming');
 let settings={};try{settings=JSON.parse(await readFile(path.join(appData,'FreeShow','settings.json'),'utf8'));}catch{}
 const data=process.env.WORDLIGHT_FREESHOW_DATA||settings.dataPath||path.join(os.homedir(),'Documents','FreeShow');
 return {index:process.env.WORDLIGHT_FREESHOW_INDEX||path.join(appData,'FreeShow','shows.json'),shows:path.resolve(process.env.WORDLIGHT_FREESHOW_SHOWS||settings.showsPath||path.join(data,'Shows')),categories:path.join(data,'Config','settings_synced.json')};
}
let songLibrary=null;
async function loadSongLibrary(){
 const paths=await freeShowPaths();
 let info;try{info=await stat(paths.index);}catch{throw Object.assign(new Error('No FreeShow song library was found on this computer.'),{status:404});}
 if(songLibrary&&songLibrary.paths.index===paths.index&&songLibrary.mtime===info.mtimeMs)return songLibrary;
 const raw=JSON.parse(await readFile(paths.index,'utf8'));let names={};
 try{const c=JSON.parse(await readFile(paths.categories,'utf8')).categories||{};names=Object.fromEntries(Object.entries(c).map(([id,v])=>[id,typeof v?.name==='string'?v.name:id]));}catch{}
 const list=Object.entries(raw&&typeof raw==='object'?raw:{}).filter(([,e])=>typeof e?.name==='string').map(([id,e])=>({id,name:e.name,category:names[e.category]||String(e.category||''),modified:Number(e.timestamps?.modified)||0,source:'freeshow',folded:foldText(e.name)})).sort((a,b)=>a.name.localeCompare(b.name));
 const categories=[...list.reduce((m,s)=>m.set(s.category,(m.get(s.category)||0)+1),new Map())].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
 songLibrary={paths,mtime:info.mtimeMs,list,categories,byId:new Map(list.map(s=>[s.id,s]))};return songLibrary;
}
// Settings shared by the studio and the phone. A change is saved first, then used, then announced to open studios.
const settingsFile=path.join(dataDir,'settings.json');
async function loadSettings(){try{applySettings(JSON.parse(await readFile(settingsFile,'utf8')));}catch(err){applySettings({});if(err.code!=='ENOENT')console.error('settings.json could not be read, so the default settings are in use.');}}
let settingsQueue=Promise.resolve();
function changeSettings(change){
 const run=settingsQueue.then(async()=>{
  const next=cleanSettings({...settings(),...(change&&typeof change==='object'?change:{})});
  await mkdir(dataDir,{recursive:true});await writeAtomic(settingsFile,JSON.stringify(next));
  applySettings(next);
  const message='data: '+JSON.stringify({settings:next})+'\n\n';for(const client of clients)client.write(message);
  // The stage display follows one setting (how much of the next slide it shows).
  broadcastStage();remote.stageChanged();
  return next;
 });
 settingsQueue=run.catch(()=>{});return run;
}
// Graphics images: stored once in the data folder, named by the hash of their bytes, and served with immutable
// caching so OBS Browser sources (which do not share the studio's browser storage) can load them.
// Only PNG, JPEG and WebP are accepted, checked by their file signature and pixel size; SVG is refused.
const ASSET_LIMITS={bytes:3_000_000,pixels:4096,count:200};
const ASSET_TYPES={png:'image/png',jpg:'image/jpeg',webp:'image/webp'};
const assetDir=path.join(dataDir,'assets'),assetIndexFile=path.join(assetDir,'assets.json');
export function imageInfo(buf){
 if(buf.length>24&&buf.readUInt32BE(0)===0x89504e47&&buf.readUInt32BE(4)===0x0d0a1a0a&&buf.toString('ascii',12,16)==='IHDR')return {type:'png',width:buf.readUInt32BE(16),height:buf.readUInt32BE(20)};
 if(buf.length>4&&buf[0]===0xff&&buf[1]===0xd8){
  for(let p=2;p+9<buf.length;){
   if(buf[p]!==0xff){p++;continue;}
   const marker=buf[p+1];if(marker===0xd8||marker===0x01||(marker>=0xd0&&marker<=0xd7)){p+=2;continue;}
   const len=buf.readUInt16BE(p+2);
   if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker))return {type:'jpg',width:buf.readUInt16BE(p+7),height:buf.readUInt16BE(p+5)};
   p+=2+len;
  }
  return null;
 }
 if(buf.length>=30&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP'){
  const chunk=buf.toString('ascii',12,16);
  if(chunk==='VP8 ')return {type:'webp',width:buf.readUInt16LE(26)&0x3fff,height:buf.readUInt16LE(28)&0x3fff};
  if(chunk==='VP8L'){const b=buf.subarray(21,25);return {type:'webp',width:1+(b[0]|((b[1]&0x3f)<<8)),height:1+((b[1]>>6)|(b[2]<<2)|((b[3]&0x0f)<<10))};}
  if(chunk==='VP8X')return {type:'webp',width:1+buf.readUIntLE(24,3),height:1+buf.readUIntLE(27,3)};
 }
 return null;
}
let assetQueue=Promise.resolve();
const inAssetQueue=task=>{const run=assetQueue.then(task,task);assetQueue=run.catch(()=>{});return run;};
async function writeAssetIndex(list){const tmp=assetIndexFile+'.'+process.pid+'.'+Date.now()+'.tmp';await writeFile(tmp,JSON.stringify(list));await retryBusy(()=>rename(tmp,assetIndexFile));}
// A missing index is an empty store. A damaged one is kept as assets.json.damaged and reported, never replaced by
// an empty list on the next upload. Rows are checked before any file path is built from them.
async function readAssetIndex(){
 let text;try{text=await readFile(assetIndexFile,'utf8');}catch(err){if(err.code==='ENOENT')return [];throw Object.assign(new Error('The image index could not be read.'),{status:500});}
 let list=null;try{list=JSON.parse(text);}catch{}
 if(!Array.isArray(list)){
  await copyFile(assetIndexFile,assetIndexFile+'.damaged').catch(()=>{});
  throw Object.assign(new Error('The image index (assets/assets.json) is damaged. A copy was kept as assets.json.damaged; restore the index from a backup or move it away to start a new one.'),{status:500});
 }
 return list.filter(a=>a&&typeof a.id==='string'&&/^[a-f0-9]{16}$/.test(a.id)&&Object.hasOwn(ASSET_TYPES,a.type));
}
async function handleAssets(req,res,url,trusted=false){
 try{await handleAssetsInner(req,res,url,trusted);}catch(err){if(!res.headersSent)json(res,err.status||500,{error:err.status?err.message:'The image store could not be used.'});}
}
async function handleAssetsInner(req,res,url,trusted=false){
 const origin=req.headers.origin;if(!trusted&&origin&&!localOrigins().includes(origin)){json(res,403,{error:'Graphics images are only available in the local studio.'});return;}
 const id=url.pathname.slice('/api/assets/'.length);
 // Images removed from the image library are left out of the list but still served by id (see DELETE).
 if(url.pathname==='/api/assets'&&req.method==='GET'){json(res,200,{assets:(await readAssetIndex()).filter(a=>!a.removed),limits:ASSET_LIMITS});return;}
 if(url.pathname==='/api/assets'&&req.method==='POST'){
  const type=String(req.headers['content-type']||'').split(';')[0];
  if(!Object.values(ASSET_TYPES).includes(type)){json(res,415,{error:'Use a PNG, JPEG or WebP image. SVG and other formats are not accepted.'});return;}
  const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>ASSET_LIMITS.bytes){json(res,413,{error:'The image is larger than '+ASSET_LIMITS.bytes/1e6+' MB.'});return;}parts.push(part);}
  const buf=Buffer.concat(parts),info=imageInfo(buf);
  if(!info||ASSET_TYPES[info.type]!==type){json(res,400,{error:'The file is not a valid '+type.split('/')[1].toUpperCase()+' image.'});return;}
  if(!info.width||!info.height||info.width>ASSET_LIMITS.pixels||info.height>ASSET_LIMITS.pixels){json(res,400,{error:'The image is '+info.width+' × '+info.height+' pixels; the limit is '+ASSET_LIMITS.pixels+' × '+ASSET_LIMITS.pixels+'.'});return;}
  const assetId=createHash('sha256').update(buf).digest('hex').slice(0,16);
  const result=await inAssetQueue(async()=>{
  const list=await readAssetIndex(),existing=list.find(a=>a.id===assetId);
  if(existing&&!existing.removed)return {code:200,body:{asset:existing}};
  if(list.filter(a=>!a.removed).length>=ASSET_LIMITS.count)return {code:409,body:{error:'The image store holds '+ASSET_LIMITS.count+' images. Remove one first.'}};
  // Uploading an image that was removed from the image library brings its row back.
  if(existing){const asset={...existing};delete asset.removed;await mkdir(assetDir,{recursive:true});await writeFile(path.join(assetDir,assetId+'.'+info.type),buf);await writeAssetIndex(list.map(a=>a.id===assetId?asset:a));return {code:200,body:{asset}};}
  const name=String(url.searchParams.get('name')||'image').replace(/[^\p{L}\p{N} ._()-]/gu,'').slice(0,80)||'image';
  const asset={id:assetId,type:info.type,width:info.width,height:info.height,bytes:buf.length,name,added:Date.now()};
  await mkdir(assetDir,{recursive:true});await writeFile(path.join(assetDir,assetId+'.'+info.type),buf);
  await writeAssetIndex([...list,asset]);return {code:201,body:{asset}};
  });
  json(res,result.code,result.body);return;
 }
 if(!/^[a-f0-9]{16}$/.test(id)){json(res,404,{error:'Not found'});return;}
 const list=await readAssetIndex(),asset=list.find(a=>a.id===id);
 if(!asset){json(res,404,{error:'That image is not in the store.'});return;}
 if(req.method==='GET'||req.method==='HEAD'){
  let body;try{body=await readFile(path.join(assetDir,id+'.'+asset.type));}catch{json(res,404,{error:'The image file is missing.'});return;}
  res.writeHead(200,{'Content-Type':ASSET_TYPES[asset.type],'Content-Length':body.length,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);return;
 }
 if(req.method==='DELETE'){
  const g=state.live.graphics||{};
  if(g.logo?.assetId===id||g.background?.assetId===id){json(res,409,{error:'This image is used by the graphics output. Choose another image first.'});return;}
  // Slide backgrounds: the screen on air and every item saved in the local studio. Shows kept only in a web
  // studio's browser are not known here; their exports carry the images.
  if(state.live.style?.backgroundAssetId===id||state.live.slides.some(s=>s.format?.image===id)||backgroundAssetIds(state.library).has(id)){json(res,409,{error:'This image is a slide background in a show. Choose another background first.'});return;}
  // Remove from the image library: the image leaves the lists, but its file stays and is still served by id, because a
  // show kept only in a web studio's browser may still use it. Uploading the same image again brings it back.
  await inAssetQueue(async()=>{await writeAssetIndex((await readAssetIndex()).map(a=>a.id===id?{...a,removed:true}:a));});
  json(res,200,{ok:true});return;
 }
 json(res,405,{error:'Method not allowed.'});
}
// Native song library, the church songbook: one validated song per file in songs/, plus a metadata-only index. Every change goes through
// one queue with atomic writes; a damaged index is kept and reported, never replaced. Saving checks the modified time
// the studio last saw, so an older copy cannot overwrite a newer one. Removed songs move to songs/removed/.
// If the index cannot be written, the song files are put back as they were, so a failed change changes nothing.
const SONG_LIBRARY_LIMIT=6000,SEARCH_BATCH=40,SONG_FILE_BYTES=50_000_000,songDir=path.join(dataDir,'songs'),songIndexFile=path.join(songDir,'index.json'),songUsageFile=path.join(songDir,'usage.json');
const nativeId=id=>typeof id==='string'&&/^wl-[a-z0-9-]{8,60}$/.test(id);
const songPath=id=>path.join(songDir,id+'.json');
let songQueue=Promise.resolve();
const inSongQueue=task=>{const run=songQueue.then(task,task);songQueue=run.catch(()=>{});return run;};
const libraryError=message=>Object.assign(new Error(message),{status:500});
const indexStamp=()=>stat(songIndexFile).then(s=>s.mtimeMs+':'+s.size,()=>'');
// Every search asks for the index, so it is only read again when the file has changed.
let indexRead=null;
async function readSongIndex(){
 const stamp=await indexStamp();if(stamp&&indexRead?.stamp===stamp)return indexRead.list;
 const list=await readIndexFile();indexRead={stamp,list};return list;
}
async function readIndexFile(){
 let text;try{text=await readFile(songIndexFile,'utf8');}catch(err){if(err.code==='ENOENT')return [];throw libraryError('The song library index could not be read.');}
 let list=null;try{list=JSON.parse(text);}catch{}
 if(!Array.isArray(list)){await copyFile(songIndexFile,songIndexFile+'.damaged').catch(()=>{});throw libraryError('The song library index (songs/index.json) is damaged. A copy was kept as index.json.damaged; restore it from a backup or move it away to start a new one.');}
 return list.filter(e=>e&&nativeId(e.id)&&typeof e.title==='string');
}
// Writes a temporary file and renames it over the target; a failed write leaves no temporary file behind.
async function writeAtomic(file,text){const tmp=file+'.'+process.pid+'.'+Date.now()+'.tmp';try{await writeFile(tmp,text,'utf8');await retryBusy(()=>rename(tmp,file));}catch(err){await unlink(tmp).catch(()=>{});throw err;}}
const indexEntry=(song,modified)=>({id:song.id,title:song.title,author:song.meta.author||song.meta.artist||'',ccli:song.meta.ccli||'',collection:song.meta.collection||'',modified});
const libraryCategory=entry=>entry.collection||'Wordlight library';
// Line search keeps every song's lines in memory, built on first use from the song files. Each change to the library
// updates it in place. A song file that cannot be read stays findable by title, with no lines.
let songSearch=null,songList=null,songWords=null;
const CACHE_DELAY_MS=20000,CACHE_VERSION=2;
const searchCacheFile=path.join(dataDir,'song-search-cache.json');
const readUsage=async()=>{try{return JSON.parse(await readFile(songUsageFile,'utf8'))||{};}catch{return {};}};
function songbook(){
 songSearch??=(async()=>{
  const [list,usage,stamp]=await Promise.all([readSongIndex(),readUsage(),indexStamp()]),entries=new Map();
  // One file holds every song's search entry, so a restart reads one file, not thousands. It is only trusted while
  // the library index is the one it was made from. Only the entries are kept in memory, not whole songs.
  let cached=null;try{const saved=JSON.parse(await readFile(searchCacheFile,'utf8'));if(stamp&&saved.stamp===stamp&&saved.version===CACHE_VERSION)cached=new Map(saved.entries.map(s=>[s[0],s]));}catch{}
  const load=async entry=>{
   const details={uses:Number(usage[entry.id])||0,modified:entry.modified};
   try{
    const saved=cached?.get(entry.id);
    entries.set(entry.id,saved?entryFromCache(saved,details):searchEntry(JSON.parse(await readFile(songPath(entry.id),'utf8')),details));
   }catch{entries.set(entry.id,searchEntry({id:entry.id,title:entry.title,meta:{author:entry.author,collection:entry.collection},sections:[],arrangements:[{id:'main',order:[]}]},details));}
  };
  // A pause between batches keeps the live screen and the phone answering while this loads.
  for(let i=0;i<list.length;i+=SEARCH_BATCH){await Promise.all(list.slice(i,i+SEARCH_BATCH).map(load));await new Promise(setImmediate);}
  if(!cached&&stamp&&stamp===await indexStamp())writeSearchCache();
  return entries;
 })().catch(err=>{songSearch=null;throw err;});
 return songSearch;
}
// Applied after any build in progress, so a build that read the old file cannot undo a change.
function changeSongbook(change,{sameSongs=false}={}){if(!songSearch)return;songSearch=songSearch.then(entries=>{change(entries);songList=null;return entries;});songSearch.catch(()=>{});if(!sameSongs)writeCacheSoon();}
// Quick capture saves songs during a service, so the cache is rewritten soon after a change, not at the next start.
let cacheTimer=null;
function writeCacheSoon(){clearTimeout(cacheTimer);cacheTimer=setTimeout(writeSearchCache,CACHE_DELAY_MS);cacheTimer.unref?.();}
async function writeSearchCache(){
 const stamp=await indexStamp(),entries=await songSearch?.catch(()=>null);if(!stamp||!entries)return;
 await writeAtomic(searchCacheFile,JSON.stringify({version:CACHE_VERSION,stamp,entries:[...entries.values()].map(entryForCache)})).catch(()=>{});
}
// The typo word list only ever gains words, so a save never makes the next search rebuild it.
const indexSong=(song,modified)=>changeSongbook(entries=>{
 const entry=searchEntry(song,{uses:entries.get(song.id)?.uses||0,modified});entries.set(song.id,entry);
 if(songWords)for(const word of vocabulary([entry]))songWords.add(word);
});
// Counts how often a song went into a show, so the songs this church sings rank first.
async function markSongUsed(id){
 return inSongQueue(async()=>{
  const usage=await readUsage();usage[id]=(Number(usage[id])||0)+1;
  await mkdir(songDir,{recursive:true});await writeAtomic(songUsageFile,JSON.stringify(usage));
  changeSongbook(entries=>{const entry=entries.get(id);if(entry)entry.uses=usage[id];},{sameSongs:true});
 });
}
const librarySong=(raw,id,modified)=>cleanSong({...raw,id,source:{app:'wordlight',id,name:raw?.title,modified},category:'Wordlight library'});
async function saveNativeSong(raw,expectedModified){
 return inSongQueue(async()=>{
  const list=await readSongIndex(),existing=nativeId(raw?.id)?list.find(e=>e.id===raw.id):null;
  if(existing&&Number(expectedModified)!==existing.modified)return {code:409,body:{error:'The library copy of this song changed since you opened it. Save it as a new song, or reopen it from the library.',modified:existing.modified}};
  if(!existing&&list.length>=SONG_LIBRARY_LIMIT)return {code:409,body:{error:'The song library holds '+SONG_LIBRARY_LIMIT+' songs.'}};
  const id=existing?existing.id:'wl-'+crypto.randomUUID(),modified=Math.max(Date.now(),(existing?.modified||0)+1);
  const song=librarySong(raw,id,modified);
  const previous=existing?await readFile(songPath(id),'utf8').catch(()=>null):null;
  await mkdir(songDir,{recursive:true});await writeAtomic(songPath(id),JSON.stringify(song));
  try{await writeAtomic(songIndexFile,JSON.stringify([...list.filter(e=>e.id!==id),indexEntry(song,modified)]));}
  catch{
   // The index still describes the old version: put the old file back, or remove a new one.
   if(previous!==null)await writeAtomic(songPath(id),previous).catch(()=>{});else await unlink(songPath(id)).catch(()=>{});
   throw libraryError('The song library index could not be written, so the song was not saved.');
  }
  indexSong(song,modified);
  return {code:existing?200:201,body:{id,modified,song}};
 });
}
// One import is one change: every row is checked first, library ids from the file are kept (so importing the same
// file again skips them, as do repeats within the file), the limit applies to the whole import, and the index is
// written once. If anything cannot be written, the new files are removed and nothing is imported.
async function importNativeSongs(rows){
 return inSongQueue(async()=>{
  const list=await readSongIndex(),seen=new Set(list.map(e=>e.id)),added=[],errors=[],modified=Date.now();let skipped=0;
  // A song already in the library (same title and first line, ignoring case and punctuation) is not added again, so
  // importing the same folder twice does not double every song.
  const sameSong=(title,line)=>foldWords(title)+'|'+foldWords(line);
  const known=new Set([...(await songbook()).values()].map(e=>sameSong(e.name,e.lines[0]?.text||'')));
  const firstLine=raw=>{const a=raw?.arrangements?.find?.(x=>x.id===raw.arrangementId)||raw?.arrangements?.[0],s=raw?.sections?.find?.(x=>x.id===a?.order?.[0])||raw?.sections?.[0];return String(s?.slides?.[0]||'').split('\n')[0];};
  for(const raw of rows){
   if(nativeId(raw?.id)&&seen.has(raw.id)){skipped++;continue;}
   const key=sameSong(raw?.title||'',firstLine(raw));
   if(known.has(key)){skipped++;continue;}
   known.add(key);
   const id=nativeId(raw?.id)?raw.id:'wl-'+crypto.randomUUID();
   try{added.push(librarySong(raw,id,modified));seen.add(id);}
   catch(err){errors.push((typeof raw?.title==='string'&&raw.title.trim()?raw.title.slice(0,80):'A song without a title')+': '+err.message);}
  }
  const counts={added:added.length,skipped,failed:errors.length,errors:errors.slice(0,10)};
  if(list.length+added.length>SONG_LIBRARY_LIMIT)return {code:409,body:{...counts,added:0,error:'This import would bring the library to '+(list.length+added.length)+' songs; it holds '+SONG_LIBRARY_LIMIT+'. Nothing was imported.'}};
  if(!added.length)return {code:200,body:counts};
  const written=[];
  try{
   await mkdir(songDir,{recursive:true});
   for(const song of added){await writeAtomic(songPath(song.id),JSON.stringify(song));written.push(song.id);}
   await writeAtomic(songIndexFile,JSON.stringify([...list,...added.map(song=>indexEntry(song,modified))]));
  }catch{
   for(const id of written)await unlink(songPath(id)).catch(()=>{});
   throw libraryError('The song library could not be written, so nothing was imported.');
  }
  for(const song of added)indexSong(song,modified);
  return {code:200,body:counts};
 });
}
// Export reads the index once and then one song file at a time, and stops at the size an import accepts.
async function exportNativeSongs(){
 return inSongQueue(async()=>{
  const songs=[];let bytes=100;
  for(const entry of await readSongIndex()){
   let song;try{song=cleanSong(JSON.parse(await readFile(songPath(entry.id),'utf8')));}catch{throw libraryError('“'+entry.title+'” could not be read from the song library, so nothing was exported.');}
   bytes+=Buffer.byteLength(JSON.stringify(song))+1;
   if(bytes>SONG_FILE_BYTES)throw Object.assign(new Error('The library is larger than one export file can hold ('+SONG_FILE_BYTES/1e6+' MB).'),{status:413});
   songs.push(song);
  }
  return {format:'wordlight-song-library',version:1,songs};
 });
}
async function removeNativeSong(id){
 return inSongQueue(async()=>{
  const list=await readSongIndex();if(!list.some(e=>e.id===id))return false;
  const removed=path.join(songDir,'removed',id+'.json');
  await mkdir(path.dirname(removed),{recursive:true});
  // The song stays listed unless its file was moved aside. A file that is already missing can be unlisted.
  let moved=true;
  try{await rename(songPath(id),removed);}catch(err){if(err.code!=='ENOENT')throw libraryError('The song file could not be moved to songs/removed, so the song was kept.');moved=false;}
  try{await writeAtomic(songIndexFile,JSON.stringify(list.filter(e=>e.id!==id)));}
  catch{if(moved)await rename(removed,songPath(id)).catch(()=>{});throw libraryError('The song library index could not be written, so the song was kept.');}
  changeSongbook(entries=>{entries.delete(id);});
  return true;
 });
}
async function readNativeSong(id){
 if(!nativeId(id))return null;
 const entry=(await readSongIndex()).find(e=>e.id===id);if(!entry)return null;
 return {song:cleanSong(JSON.parse(await readFile(songPath(id),'utf8'))),modified:entry.modified};
}
// The FreeShow catalogue is optional: a missing or unreadable FreeShow library never stops the native library.
async function freeShowCatalogue(){
 try{return {library:await loadSongLibrary(),error:''};}
 catch(err){return {library:null,error:err.status===404?'':'The FreeShow library could not be read.'};}
}
// One song by id, from the Wordlight library or FreeShow. A problem carries the status and message to show.
async function readSong(id){
 const problem=(status,message)=>Object.assign(new Error(message),{status});
 if(nativeId(id)){const item=await readNativeSong(id);if(!item)throw problem(404,'That song is not in the library.');return item;}
 const {library:lib,error}=await freeShowCatalogue();if(!lib)throw problem(error?500:404,error||'No FreeShow song library was found on this computer.');
 const entry=lib.byId.get(id);if(!entry)throw problem(404,'That song is not in the FreeShow library.');
 // FreeShow names each file after the show. Refuse names that would leave the Shows folder.
 const file=path.resolve(lib.paths.shows,entry.name+'.show');
 if(path.dirname(file)!==lib.paths.shows||/[\\/]/.test(entry.name))throw problem(400,'This song name cannot be opened safely.');
 let raw;try{raw=JSON.parse(await readFile(file,'utf8'));}catch{throw problem(404,'The song file could not be read.');}
 if(Array.isArray(raw)&&raw[0]!==entry.id)throw problem(409,'The song file does not match the library index. Reopen FreeShow to refresh it.');
 return {song:freeShowToSong(raw,{categoryName:entry.category})};
}
// Library songs by any lyric line, best first, then FreeShow songs by title. "Drafts" lists songs still to be checked.
async function songResults({query='',source='all',category='',offset=0,limit=50}){
 const size=Math.min(100,Math.max(1,limit));
 let hits=[];
 const {searchFreeShow,searchReserve}=settings();
 if(source!=='freeshow'){
  const entries=songList??=[...(await songbook()).values()];
  hits=findInSongbook(entries,query,()=>songWords??=vocabulary(entries));
  if(category)hits=hits.filter(h=>h.category===category);
  if(source==='drafts')hits=hits.filter(h=>h.status==='draft');
  if(!searchReserve&&source==='all')hits=hits.filter(h=>h.status!=='reserve');
 }
 const items=hits.slice(offset,offset+size);
 const wanted=source==='freeshow'||(source==='all'&&searchFreeShow);
 const catalogue=source==='wordlight'||source==='drafts'||!wanted?null:await freeShowCatalogue(),list=catalogue?.library?.list||[];
 const freeshow=catalogue?searchSongs(list,{query,category,offset:Math.max(0,offset-hits.length),limit:size-items.length||1}):{total:0,items:[]};
 return {total:hits.length+freeshow.total,offset,items:[...items,...(items.length<size?freeshow.items:[])],catalogue};
}
// The phone's song search: the same two sources as the studio.
async function findSongs(query,offset){return songResults({query,offset,limit:30});}
async function handleSongs(req,res,url,trusted=false){
 const origin=req.headers.origin;if(!trusted&&origin&&!localOrigins().includes(origin)){json(res,403,{error:'The song library is only available in the local studio.'});return;}
 try{
  const q=url.searchParams;
  if(url.pathname==='/api/songs/library'&&req.method==='POST'){
   let body;try{body=await readJSON(req,5_000_000);}catch(err){json(res,err.status||400,{error:err.status?'The song is too large.':'Invalid JSON.'});return;}
   let result;try{result=await saveNativeSong(body?.song,body?.expectedModified);}catch(err){if(err.status)throw err;json(res,400,{error:err.message||'That song could not be saved.'});return;}
   json(res,result.code,result.body);return;
  }
  // EasyWorship 6 and 7: the two database files the operator picked, sent as raw bytes one after the other (songsBytes
  // says where Songs.db ends and SongWords.db begins). They are written to a temporary folder and read in a worker
  // thread (easyworship.mjs), and every song goes through the library import below (duplicates skipped). Nothing is kept.
  if(url.pathname==='/api/songs/library/import-easyworship'&&req.method==='POST'){
   let body;try{body=await readBuffer(req,SONG_FILE_BYTES*2);}catch(err){json(res,err.status||400,{error:'The EasyWorship files are too large (the limit is '+SONG_FILE_BYTES*2/1e6+' MB together).'});return;}
   const split=Number(q.get('songsBytes'));
   if(!Number.isInteger(split)||split<=0||split>=body.length){json(res,400,{error:'Choose both Songs.db and SongWords.db from EasyWorship (in its Databases\\Data folder).'});return;}
   const temp=path.join(dataDir,'easyworship-'+Date.now());
   let read=null,problem=null;
   try{
    await mkdir(temp,{recursive:true});
    await writeFile(path.join(temp,'Songs.db'),body.subarray(0,split));await writeFile(path.join(temp,'SongWords.db'),body.subarray(split));body=null;
    read=await readEasyWorship(temp,{limit:SONG_LIBRARY_LIMIT});
   }catch(err){problem={error:'These are not EasyWorship 6 or 7 song databases ('+(err.message||err)+'). Choose Songs.db and SongWords.db from EasyWorship\'s Databases\\Data folder.'};}
   finally{await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});}
   // Answered only after the temporary files are gone.
   if(problem){json(res,400,problem);return;}
   if(read.tooMany){json(res,409,{added:0,skipped:0,failed:0,error:'This EasyWorship library has more than '+SONG_LIBRARY_LIMIT+' songs, more than Wordlight\'s library holds. Nothing was imported.'});return;}
   const result=await importNativeSongs(read.songs);
   json(res,result.code,{...result.body,failed:(result.body.failed||0)+read.skipped});return;
  }
  if(url.pathname==='/api/songs/library/import'&&req.method==='POST'){
   let body;try{body=await readJSON(req,SONG_FILE_BYTES);}catch(err){json(res,err.status||400,{error:err.status?'The file is too large.':'Invalid JSON.'});return;}
   if(body?.format!=='wordlight-song-library'||body.version!==1||!Array.isArray(body.songs)){json(res,400,{error:'This is not a Wordlight song library file.'});return;}
   const result=await importNativeSongs(body.songs);json(res,result.code,result.body);return;
  }
  if(url.pathname==='/api/songs/library/used'&&req.method==='POST'){
   let body;try{body=await readJSON(req,1000);}catch(err){json(res,err.status||400,{error:'Invalid JSON.'});return;}
   if(!nativeId(body?.id)||!(await songbook()).has(body.id)){json(res,404,{error:'That song is not in the library.'});return;}
   await markSongUsed(body.id);json(res,200,{ok:true});return;
  }
  if(url.pathname==='/api/songs/library/export'&&req.method==='GET'){json(res,200,await exportNativeSongs());return;}
  if(url.pathname.startsWith('/api/songs/library/')&&req.method==='DELETE'){
   const id=url.pathname.slice('/api/songs/library/'.length);if(!nativeId(id)){json(res,404,{error:'Not found'});return;}
   const done=await removeNativeSong(id);
   json(res,done?200:404,done?{ok:true}:{error:'That song is not in the library.'});return;
  }
  if(req.method!=='GET'){json(res,405,{error:'Method not allowed.'});return;}
  if(url.pathname==='/api/songs/item'){json(res,200,await readSong(q.get('id')||''));return;}
  const source=q.get('source')||'all',native=await readSongIndex(),total=native.length;
  // My library never reads FreeShow; its counts are then left out and the studio keeps the last ones it saw.
  const counts=catalogue=>({library:total+(catalogue?.library?.list.length||0),native:total,...(catalogue?{freeshow:catalogue.library?catalogue.library.list.length:null,freeshowError:catalogue.error}:{})});
  if(url.pathname==='/api/songs'){
   const {catalogue,...found}=await songResults({query:q.get('q')||'',source,category:q.get('category')||'',offset:Math.max(0,Number(q.get('offset'))||0),limit:Number(q.get('limit'))||50});
   json(res,200,{...found,...counts(catalogue)});return;
  }
  if(url.pathname==='/api/songs/categories'){
   const catalogue=source==='wordlight'||source==='drafts'?null:await freeShowCatalogue(),collections=new Map();
   for(const entry of native)collections.set(libraryCategory(entry),(collections.get(libraryCategory(entry))||0)+1);
   const categories=[...[...collections].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count),...(catalogue?.library?.categories||[])];
   json(res,200,{categories,...counts(catalogue)});return;
  }
  json(res,404,{error:'Not found'});
 }catch(err){json(res,err.status||500,{error:err.status?err.message:'The song library could not be read.'});}
}
// NKJV via API.Bible, local studio only. Tests may point the provider at a loopback mock; nothing else can change it.
const testBase=/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(process.env.WORDLIGHT_API_BIBLE_TEST_BASE||'')?process.env.WORDLIGHT_API_BIBLE_TEST_BASE:'';
const apiBible=createApiBible({dataDir,...(testBase?{base:testBase+'/v1',fumsUrl:testBase+'/f3'}:{})});
// Seed packs: official Bible archives shipped beside the app in the portable package (../bibles), or a folder named
// by WORDLIGHT_BIBLE_SEEDS. Missing translations are installed from them on start; installed copies are never replaced.
const seedDir=process.env.WORDLIGHT_BIBLE_SEEDS||path.join(root,'..','bibles');
const bibleLibrary=createBibleLibrary({dataDir,seedDir,...(testBase?{base:testBase+'/ebible/'}:{})});
// Finding a verse by its words, in the Bibles installed on this computer.
const bibleSearch=createBibleSearch({root:path.join(dataDir,'bibles'),listInstalled:()=>bibleLibrary.list()});
// Verse listening: suggestions from what the preacher says, for the local studio (listen.mjs). Off until turned on.
const listenClients=new Set();
const listener=createListener({dataDir,search:bibleSearch,notify:state=>{
 const message='data: '+JSON.stringify(state)+'\n\n';
 for(const client of listenClients){if(client.writableLength>1e6){client.destroy();continue;}client.write(message);}
}});
// Installed Bibles: list, install from the official archive, remove, and offline lookups. Local studio only.
async function handleBibles(req,res,url,trusted=false){
 const origin=req.headers.origin;if(!trusted&&origin&&!localOrigins().includes(origin)){json(res,403,{error:'Installed Bibles are only available in the local studio.'});return;}
 const q=url.searchParams,int=name=>q.has(name)&&q.get(name)!==''?Number(q.get(name)):null;
 try{
  if(url.pathname==='/api/bibles'&&req.method==='GET'){json(res,200,{bibles:await bibleLibrary.list()});return;}
  // A Bible file the user chose: raw bytes, local studio only, up to 50 MB.
  if(url.pathname==='/api/bibles/import'&&req.method==='POST'){
   if(req.headers['content-type']!=='application/octet-stream'){json(res,415,{error:'Send the file as application/octet-stream.'});return;}
   const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>50_000_000){json(res,413,{error:'Choose a Bible file up to 50 MB.'});return;}parts.push(part);}
   json(res,200,{bibles:await bibleLibrary.importFile(q.get('id')||'',Buffer.concat(parts),q.get('name')||'')});return;
  }
  if(req.method==='POST'){
   if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON is required.'});return;}
   let body;try{body=await readJSON(req,1000);}catch(err){json(res,err.status||400,{error:'Invalid JSON.'});return;}
   if(url.pathname==='/api/bibles/install'){json(res,202,{bibles:await bibleLibrary.install(String(body?.id||''))});return;}
   if(url.pathname==='/api/bibles/remove'){json(res,200,{bibles:await bibleLibrary.remove(String(body?.id||''))});return;}
  }
  if(url.pathname==='/api/bibles/search'&&req.method==='GET'){json(res,200,await bibleSearch.search(q.get('q')||''));return;}
  if(url.pathname==='/api/bibles/passage'&&req.method==='GET'){
   const chapter=int('chapter'),verse=int('verse'),endChapter=int('endChapter')??chapter,endVerse=int('endVerse')??(verse!==null&&endChapter===chapter?verse:null);
   json(res,200,await bibleLibrary.passage(q.get('translation')||'',{bookId:q.get('book')||'',chapter,verse,endChapter,endVerse}));return;
  }
  json(res,404,{error:'Not found'});
 }catch(err){json(res,err.status>=400&&err.status<600?err.status:500,{error:err.status?err.message:'The Bible lookup failed.'});}
}
async function handleBible(req,res,url,trusted=false){
 const origin=req.headers.origin;if(!trusted&&origin&&!localOrigins().includes(origin)){json(res,403,{error:'NKJV lookup is only available in the local studio.'});return;}
 const q=url.searchParams,int=name=>q.has(name)&&q.get(name)!==''?Number(q.get(name)):null;
 try{
  if(url.pathname==='/api/bible/status'&&req.method==='GET'){json(res,200,await apiBible.status());return;}
  if(req.method==='POST'&&!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON is required.'});return;}
  if(url.pathname==='/api/bible/connect'&&req.method==='POST'){
   let body;try{body=await readJSON(req,2000);}catch(err){json(res,err.status||400,{error:err.status?'The request is too large.':'Invalid JSON.'});return;}
   json(res,200,await apiBible.connect(body?.key));return;
  }
  if(url.pathname==='/api/bible/disconnect'&&req.method==='POST'){json(res,200,await apiBible.disconnect());return;}
  if(url.pathname==='/api/bible/nkjv'&&req.method==='GET'){
   // One verse stays one verse when no end is sent; whole chapters are sent without a verse.
   const chapter=int('chapter'),verse=int('verse'),endChapter=int('endChapter')??chapter,endVerse=int('endVerse')??(verse!==null&&endChapter===chapter?verse:null);
   json(res,200,await apiBible.passage({bookId:q.get('book')||'',chapter,verse,endChapter,endVerse}));return;
  }
  json(res,404,{error:'Not found'});
 }catch(err){json(res,err.status>=400&&err.status<600?err.status:500,{error:err.status?err.message:'The NKJV lookup failed.'});}
}
// /api/bridge/*: for the hosted studio (allowed origin + pairing code) and the local studio (local origin).
async function handleBridge(req,res,url){
 const origin=req.headers.origin||'',hosted=bridgeOrigins.has(origin),local=!origin||localOrigins().includes(origin);
 if(req.method==='OPTIONS'){
  if(!hosted){json(res,403,{error:'This origin is not allowed.'});return;}
  // Chrome asks before a public site reaches 127.0.0.1 (Private Network Access); answer only for allowed origins.
  res.writeHead(204,{...corsFor(origin),'Access-Control-Allow-Methods':'GET, POST','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600',...(req.headers['access-control-request-private-network']==='true'?{'Access-Control-Allow-Private-Network':'true'}:{})});res.end();return;
 }
 if(!hosted&&!local){json(res,403,{error:'This origin is not allowed.'});return;}
 const cors=hosted?corsFor(origin):{};
 // The pairing code itself is only ever given to the local studio.
 if(url.pathname==='/api/bridge/code'){
  if(!local){json(res,403,{error:'Open the local studio to see the pairing code.'},cors);return;}
  if(req.method==='POST'){const next={code:newCode()};try{await saveBridge(next);}catch{json(res,500,{error:'The new code could not be saved. The old code still works.'});return;}bridge=next;}
  else if(req.method!=='GET'){json(res,405,{error:'Method not allowed.'});return;}
  json(res,200,{code:bridge.code,origins:[...bridgeOrigins],viewers,liveUpdated:state.live.updated||0});return;
 }
 if(hosted&&!sameCode((req.headers.authorization||'').replace(/^Bearer\s+/i,''))){json(res,401,{error:'Pairing code does not match. Copy it again from the local studio.'},cors);return;}
 if(req.method==='GET'&&url.pathname==='/api/bridge/status'){json(res,200,{app:'wordlight',paired:true,viewers,liveUpdated:state.live.updated||0},cors);return;}
 // Read-only copy of the screen, so a newly paired or reloaded web studio shows what is on air without changing it.
 if(req.method==='GET'&&url.pathname==='/api/bridge/live'){json(res,200,{live:state.live},cors);return;}
 if(req.method==='POST'&&url.pathname==='/api/bridge/live'){
  if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON is required.'},cors);return;}
  let update;try{update=await readJSON(req,10_000_000);}catch(err){json(res,err.status||400,{error:err.status?'Live state is too large.':'Invalid JSON.'},cors);return;}
  if(!validLive(update?.live)){json(res,400,{error:'Invalid live slide data.'},cors);return;}
  await inStateQueue(async()=>{
   // Never replace a newer screen (for example one sent from the local studio) with an older one.
   if(!(Number(update.live.updated)>Number(state.live.updated||0))){json(res,409,{error:'The companion already has a newer screen.',liveUpdated:state.live.updated||0},cors);return;}
   // Graphics belong to the local studio (they refer to images stored here), so a web studio screen keeps them.
   const previous=state;state={...state,live:{...update.live,graphics:state.live.graphics}};
   try{await persistLive();}catch{state=previous;json(res,500,{error:'The companion could not save the screen.'},cors);return;}
   broadcast();json(res,200,{ok:true,liveUpdated:state.live.updated,viewers},cors);
  });return;
 }
 // A paired web studio may also search and open songs, save one to the song library, read installed Bibles, look up
 // NKJV, and list and upload images. Only these routes pass; they run the local handlers with this site's CORS headers.
 // Removing, importing, installing and the API.Bible key stay in the local studio.
 const inner=url.pathname.replace(/^\/api\/bridge(?=\/(songs|bibles|bible|assets)(\/|$))/,'/api');
 if(inner!==url.pathname&&BRIDGE_ROUTES.some(([method,pattern])=>method===req.method&&pattern.test(inner))){
  for(const [key,value] of Object.entries(cors))res.setHeader(key,value);
  const target=new URL(inner+url.search,'http://127.0.0.1');
  if(inner.startsWith('/api/songs'))await handleSongs(req,res,target,true);
  else if(inner.startsWith('/api/bible/'))await handleBible(req,res,target,true);
  else if(inner.startsWith('/api/bibles'))await handleBibles(req,res,target,true);
  else await handleAssets(req,res,target,true);
  return;
 }
 json(res,404,{error:'Not found'},cors);
}
const BRIDGE_ROUTES=[['GET',/^\/api\/songs(\/categories|\/item)?$/],['POST',/^\/api\/songs\/library(\/used)?$/],['GET',/^\/api\/bibles(\/passage|\/search)?$/],['GET',/^\/api\/bible\/(status|nkjv)$/],['GET',/^\/api\/assets(\/[a-f0-9]{16})?$/],['POST',/^\/api\/assets$/]];
// A page that stopped reading its live stream (a frozen OBS, a sleeping computer) would make every screen pile up in
// memory here. Past 16 MB unread, its stream is closed; the browser reconnects and gets the latest screen.
function broadcast(){const message='data: '+JSON.stringify({live:state.live})+'\n\n';for(const client of clients){if(client.writableLength>16e6){client.destroy();continue;}client.write(message);}remote.liveChanged(state.live);broadcastStage();}
// Stage display: the live screen plus the operator's message, for screens facing the singers or the preacher. The message
// is kept in memory only: it is for this moment of the service, not for saving.
let stageMessage=null;const stageClients=new Set();
const stageNow=()=>stageState(state.live,stageMessage,{nextLines:settings().stageNextLines});
function broadcastStage(){
 const message='data: '+JSON.stringify(stageNow())+'\n\n';
 for(const client of stageClients){if(client.writableLength>1e6){client.destroy();continue;}client.write(message);}
}
const allowed=new Map([['/','index.html'],['/index.html','index.html'],['/app.js','app.js'],['/refresh.mjs','refresh.mjs'],['/fit.mjs','fit.mjs'],['/reference.mjs','reference.mjs'],['/lowerthird.mjs','lowerthird.mjs'],['/versification.mjs','versification.mjs'],['/picker.mjs','picker.mjs'],['/bridge.mjs','bridge.mjs'],['/songs.mjs','songs.mjs'],['/versions.mjs','versions.mjs'],['/bolls.mjs','bolls.mjs'],['/readlimit.mjs','readlimit.mjs'],['/graphics.mjs','graphics.mjs'],['/core.mjs','core.mjs'],['/storage.mjs','storage.mjs'],['/yoruba.mjs','yoruba.mjs'],['/timer.mjs','timer.mjs'],['/library.mjs','library.mjs'],['/scripture.mjs','scripture.mjs'],['/verse-search.mjs','verse-search.mjs'],['/stage','stage.html'],['/stage.mjs','stage.mjs'],['/stage-page.mjs','stage-page.mjs'],['/stage.css','stage.css'],['/stage-setup.mjs','stage-setup.mjs'],['/listen-panel.mjs','listen-panel.mjs'],['/notices-bar.mjs','notices-bar.mjs'],['/song-import.mjs','song-import.mjs'],['/getting-started.mjs','getting-started.mjs'],['/listen-worklet.js','listen-worklet.js'],['/update-setup.mjs','update-setup.mjs'],['/styles.css','styles.css'],['/wordlight-obs-companion.zip','wordlight-obs-companion.zip']]);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.zip':'application/zip'};
async function handle(req,res){
 const hosts=new Set(['127.0.0.1:'+port,'localhost:'+port]);if(!hosts.has(req.headers.host)){json(res,403,{error:'Use the local Wordlight address.'});return;}
 let url;try{url=new URL(req.url,'http://127.0.0.1:'+port);}catch{json(res,400,{error:'Invalid URL'});return;}
 if(url.pathname.startsWith('/api/bridge/')){await handleBridge(req,res,url);return;}
 if(url.pathname==='/api/songs'||url.pathname.startsWith('/api/songs/')){await handleSongs(req,res,url);return;}
 if(url.pathname.startsWith('/api/bible/')){await handleBible(req,res,url);return;}
 if(url.pathname.startsWith('/api/remote/')){await remote.handleAdmin(req,res,url);return;}
 if(url.pathname==='/api/bibles'||url.pathname.startsWith('/api/bibles/')){await handleBibles(req,res,url);return;}
 // Identity for launchers: which app and version answers on this port.
 // Memory in MB and minutes running, so a long service can be checked (tools/soak.mjs reads them too).
 if(req.method==='GET'&&url.pathname==='/api/health'){const m=process.memoryUsage();json(res,200,{app:'wordlight',version:APP_VERSION,build:APP_BUILD,preview:APP_PREVIEW,
  memory:{rssMB:Math.round(m.rss/1e6),heapMB:Math.round(m.heapUsed/1e6)},upMinutes:Math.round(process.uptime()/60)});return;}
 // Quit from the Stop Wordlight launcher or the local studio: pending saves finish first. Local, JSON only.
 if(req.method==='POST'&&url.pathname==='/api/app/quit'){
  const origin=req.headers.origin;if(origin&&!localOrigins().includes(origin)){json(res,403,{error:'Only the local studio can quit Wordlight.'});return;}
  if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON is required.'});return;}
  json(res,200,{ok:true});
  server.close();await remote.close();await remote.idle();await Promise.allSettled([stateQueue,writes,assetQueue,songQueue]);setTimeout(()=>process.exit(0),100);return;
 }
 if(url.pathname.startsWith('/api/projector/')){
  const origin=req.headers.origin;if(origin&&!localOrigins().includes(origin)){json(res,403,{error:'Only the local studio can change the projector.'});return;}
  if(req.method!=='POST'){json(res,405,{error:'Method not allowed.'});return;}
  if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON is required.'});return;}
  try{
   if(url.pathname==='/api/projector/open'){json(res,200,viewers.projector?{ok:true,already:true}:await projector.open());return;}
   if(url.pathname==='/api/projector/close'){json(res,200,await projector.close());return;}
   if(url.pathname==='/api/projector/reload'){const message='data: '+JSON.stringify({reload:'projector'})+'\n\n';for(const client of clients)client.write(message);json(res,200,{ok:true,windows:viewers.projector});return;}
   json(res,404,{error:'Not found'});return;
  }catch(err){json(res,err.status||500,{error:err.status?err.message:'The projector could not be changed.'});return;}
 }
 if(url.pathname==='/api/assets'||url.pathname.startsWith('/api/assets/')){await handleAssets(req,res,url);return;}
 // Output pages (OBS, the projector) ask for the screen only, so a large library is never sent to each of them.
 if(req.method==='GET'&&url.pathname==='/api/state'){json(res,200,url.searchParams.get('only')==='live'?{app:state.app,live:state.live}:{...state,writeId:lastWriteId});return;}
 if(req.method==='GET'&&url.pathname==='/api/events'){
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Content-Type-Options':'nosniff'});
  // "retry" makes a page that lost the stream try again after half a second, not the browser's usual three.
  res.write('retry: 500\ndata: '+JSON.stringify({live:state.live,settings:settings(),build:APP_BUILD,...(saveProblem?{saveProblem:true}:{})})+'\n\n');clients.add(res);
  const view=['output','lower','graphics'].includes(url.searchParams.get('view'))?url.searchParams.get('view'):'studio',isProjector=view==='output'&&url.searchParams.has('projector');viewers[view]++;if(isProjector)viewers.projector++;
  const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),15000);req.on('close',()=>{clearInterval(heartbeat);clients.delete(res);viewers[view]--;if(isProjector)viewers.projector--;});return;
 }
 if(req.method==='GET'&&url.pathname==='/stage/events'){
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Content-Type-Options':'nosniff'});
  res.write('retry: 1000\ndata: '+JSON.stringify(stageNow())+'\n\n');stageClients.add(res);
  const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),15000);req.on('close',()=>{clearInterval(heartbeat);stageClients.delete(res);});return;
 }
 // The stage message: read it and the number of stage screens, or set it (an empty text clears it). {hidden:true} takes
 // it off the stage screens but keeps it, and {hidden:false} shows it again. Local studio only.
 if(url.pathname==='/api/stage'&&req.method==='GET'){json(res,200,{message:stageMessage,screens:stageClients.size+remote.stageScreens()});return;}
 if(url.pathname==='/api/stage'&&req.method==='POST'){
  const origin=req.headers.origin;if(origin&&!localOrigins().includes(origin)){json(res,403,{error:'This request must come from the local studio.'});return;}
  if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON is required.'});return;}
  let body;try{body=await readJSON(req,2000);}catch(err){json(res,err.status||400,{error:err.status?'Too large.':'Invalid JSON.'});return;}
  if(body?.message===undefined&&typeof body?.hidden==='boolean'){if(stageMessage)stageMessage={...stageMessage,hidden:body.hidden,at:body.hidden?stageMessage.at:Date.now()};}
  else{const text=cleanStageMessage(body?.message);stageMessage=text?{text,at:Date.now(),hidden:false}:null;}
  broadcastStage();remote.stageChanged();
  json(res,200,{message:stageMessage,screens:stageClients.size+remote.stageScreens()});return;
 }
 // Updates (local studio only): status, check now, download, restart into the update, go back to the previous version.
 if(url.pathname==='/api/update'&&req.method==='GET'){json(res,200,await updater.status());return;}
 if(url.pathname.startsWith('/api/update/')&&req.method==='POST'){
  const origin=req.headers.origin;if(origin&&!localOrigins().includes(origin)){json(res,403,{error:'This request must come from the local studio.'});return;}
  if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON is required.'});return;}
  const action=url.pathname.slice('/api/update/'.length);
  try{
   if(action==='check'){json(res,200,await updater.check());return;}
   if(action==='download'){json(res,200,await updater.download());return;}
   if(action==='restart'){updater.restart();json(res,200,{restarting:true});return;}
   if(action==='back'){await updater.goBack();json(res,200,{restarting:true});return;}
   json(res,404,{error:'Not found'});
  }catch(err){json(res,err.status>=400&&err.status<600?err.status:500,{error:err.message||'The update failed.'});}
  return;
 }
 // Verse listening (local studio only): its state and stream, the one-time download, start and stop, and the audio
 // the studio captures (16 kHz mono 16-bit, a quarter of a second at a time).
 if(url.pathname==='/api/listen'&&req.method==='GET'){json(res,200,listener.state());return;}
 if(url.pathname==='/api/listen/events'&&req.method==='GET'){
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Content-Type-Options':'nosniff'});
  res.write('retry: 2000\ndata: '+JSON.stringify(listener.state())+'\n\n');listenClients.add(res);
  const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),15000);req.on('close',()=>{clearInterval(heartbeat);listenClients.delete(res);});return;
 }
 if(url.pathname.startsWith('/api/listen/')&&req.method==='POST'){
  const origin=req.headers.origin;if(origin&&!localOrigins().includes(origin)){json(res,403,{error:'This request must come from the local studio.'});return;}
  const action=url.pathname.slice('/api/listen/'.length);
  try{
   if(action==='audio'){
    if(req.headers['content-type']!=='application/octet-stream'){json(res,415,{error:'Send audio as application/octet-stream.'});return;}
    const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>64000){json(res,413,{error:'Too large.'});return;}parts.push(part);}
    json(res,200,listener.audio(Buffer.concat(parts)));return;
   }
   if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON is required.'});return;}
   if(action==='install'){json(res,202,await listener.install());return;}
   if(action==='start'){json(res,200,listener.start());return;}
   if(action==='stop'){json(res,200,listener.stop());return;}
   if(action==='clear'){json(res,200,listener.clear());return;}
   if(action==='remove'){json(res,200,await listener.remove());return;}
   json(res,404,{error:'Not found'});
  }catch(err){json(res,err.status>=400&&err.status<600?err.status:500,{error:err.message||'Listening did not work.'});}
  return;
 }
 // Notices for the operator (local studio only): updates installed or refused, shows opened from a backup.
 if(url.pathname==='/api/notices'&&req.method==='GET'){json(res,200,{notices:await readNotices(dataDir)});return;}
 if(url.pathname==='/api/notices/dismiss'&&req.method==='POST'){
  const origin=req.headers.origin;if(origin&&!localOrigins().includes(origin)){json(res,403,{error:'This request must come from the local studio.'});return;}
  if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON is required.'});return;}
  let body;try{body=await readJSON(req,1000);}catch{json(res,400,{error:'Invalid JSON.'});return;}
  json(res,200,{notices:await dismissNotice(dataDir,String(body?.id||''))});return;
 }
 if(url.pathname==='/api/settings'&&req.method==='GET'){json(res,200,settings());return;}
 if(url.pathname==='/api/settings'&&req.method==='POST'){
  const origin=req.headers.origin;if(origin&&!localOrigins().includes(origin)){json(res,403,{error:'This request must come from the local studio.'});return;}
  if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON is required.'});return;}
  let body;try{body=await readJSON(req,2000);}catch(err){json(res,err.status||400,{error:err.status?'Too large.':'Invalid JSON.'});return;}
  try{json(res,200,await changeSettings(body));}catch{json(res,500,{error:'The settings could not be saved.'});}return;
 }
 if(req.method==='POST'&&url.pathname==='/api/state'){
  const origin=req.headers.origin;if(origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(origin)){json(res,403,{error:'This request must come from the local studio.'});return;}
  if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON is required.'});return;}
  try{
   let body;try{body=await readBytes(req,25_000_000);}catch(err){if(err.status!==413)throw err;json(res,413,{error:'Session is too large.'});return;}
   const update=JSON.parse(body);
   let answer={ok:true};
   await inStateQueue(async()=>{
    // A tab that has not seen the newest library must not replace it. Its base is the save it last knew about.
    if(update.library&&Number(update.baseSavedAt)!==Number(state.library?.savedAt||0)){answer={stale:true};return;}
    // A slide change made from an older screen, or arriving after a newer one, must not move the screen back.
    const current=Number(state.live?.updated||0),incoming=Number(update.live?.updated);
    if(update.live&&((update.base!==undefined&&Number(update.base)!==current)||(Number.isFinite(incoming)&&incoming<=current))){
     if(!update.library&&!update.draft){answer={ok:true,superseded:true};return;}
     delete update.live;
    }
    let nextLibrary=state.library,nextDraft=state.draft,nextLive=state.live;
    if(update.library){nextLibrary=cleanLibrary(update.library);nextDraft=activeShow(nextLibrary).draft;}
    else if(update.draft){nextDraft=cleanDraft(update.draft);nextLibrary=cleanLibrary(state.library);activeShow(nextLibrary).draft=nextDraft;}
    if(update.live){if(!validLive(update.live))throw new Error('Invalid live slide data.');nextLive={...update.live,graphics:cleanGraphics(update.live.graphics)};}
    else nextLive=wordsOnLive(state.live,state.library,nextLibrary);
    const previous=state,previousWrite=lastWriteId;state={app:'wordlight',library:nextLibrary,draft:nextDraft,live:nextLive};if(update.library)lastWriteId=String(update.writeId||'').slice(0,64);
    // A screen change goes out first: a locked or full disk must never stop the projector. Shows are saved first,
    // because a library that could not be written must not be reported as saved.
    if(update.live&&!update.library&&!update.draft){broadcast();answer={ok:true,saveFailed:!await keepScreen()};return;}
    try{await persist();}catch(err){state=previous;lastWriteId=previousWrite;throw new Error('Your session could not be saved to disk.');}
    if(nextLive!==previous.live)broadcast();
   });
   if(answer.stale){json(res,409,{error:'Another tab saved newer changes.',stale:true,savedAt:Number(state.library?.savedAt||0),writeId:lastWriteId});return;}
   json(res,200,answer);return;
  }catch(err){json(res,400,{error:err.message||'Invalid session.'});return;}
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){json(res,405,{error:'Method not allowed.'});return;}
 const filename=allowed.get(url.pathname);if(!filename){json(res,404,{error:'Not found'});return;}
 try{const body=await readFile(path.join(root,'dist',filename));res.writeHead(200,{'Content-Type':types[path.extname(filename)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:body);}catch{json(res,404,{error:'File not found'});}
}
// Phone remote (opt-in, its own port). It reads shows and the live screen, and changes the screen only through
// commitLive, so OBS outputs, studios and saved state stay in step. Its settings are changed through /api/remote/*.
for(const file of ['remote-setup.mjs','qr.mjs'])allowed.set('/'+file,file);
// The phone remote's screen changes: change(state) decides the new screen inside the session queue (or returns nothing
// to leave it alone). A failed save puts the previous state back.
function commitLive(change){return inStateQueue(async()=>{const live=change(state);if(!live)return;state={...state,live};broadcast();await keepScreen();});}
// The screen has already changed when this runs. A failed save keeps trying, and open studios are told.
let saveRetry=null,saveProblem=false;
const SAVE_WAIT_MS=2000;
function announceSave(problem){if(problem===saveProblem)return;saveProblem=problem;const message='data: '+JSON.stringify({saveProblem:problem})+'\n\n';for(const client of clients)client.write(message);}
let saving=null,saveAgain=false;
function saveNewest(){
 if(saving){saveAgain=true;return saving;}
 saving=persistLive().then(()=>{announceSave(false);return true;},err=>{
  console.error('The screen changed but could not be saved: '+(err?.message||err));announceSave(true);
  if(!saveRetry)saveRetry=setTimeout(()=>{saveRetry=null;saveNewest();},5000);
  return false;
 }).then(saved=>{saving=null;if(!saveAgain)return saved;saveAgain=false;return saveNewest();});
 return saving;
}
// A slide is answered once it is safely on disk. While saves are known to be failing, nothing waits for them, so a
// locked or full disk never holds up the next slide.
const keepScreen=()=>{const saved=saveNewest();return saveProblem?true:Promise.race([saved,new Promise(resolve=>setTimeout(resolve,SAVE_WAIT_MS,true))]);};
const projector=createProjector({url:'http://127.0.0.1:'+port+'/?view=output&projector=1',dataDir});
const updater=createUpdater({root,dataDir,version:APP_VERSION,build:APP_BUILD,port});
const remote=createRemote({getState:()=>state,commitLive,dataDir,root,localOrigins,bible:createBibleLookup({bibles:bibleLibrary,apiBible,search:bibleSearch}),stage:()=>stageNow(),findSongs,readSong,settings:{get:settings,change:changeSettings}});
// Any unexpected failure answers this request with an error instead of stopping the companion.
const server=http.createServer((req,res)=>{handle(req,res).catch(err=>{console.error(err?.message||err);if(!res.headersSent)json(res,500,{error:'The companion hit an error. Try again.'});else res.end();});});
server.on('error',err=>{if(err.code==='EADDRINUSE')console.error('Wordlight is already running, or port '+port+' is in use. Open http://127.0.0.1:'+port);else console.error(err.message);process.exitCode=1;});
await loadSettings();
server.listen(port,'127.0.0.1',()=>{
 bibleLibrary.seedMissing().catch(err=>console.error('Seed Bibles: '+(err?.message||err)));
 // Line search loads here, so the first song search during a service doesn't have to wait for it.
 songbook().then(entries=>{songList??=[...entries.values()];songWords??=vocabulary(songList);}).catch(err=>console.error('Song search: '+(err?.message||err)));
 // Verse search builds its word index a little later, so it never slows the start, and is ready before it is needed.
 setTimeout(()=>bibleSearch.warm().catch(err=>console.error('Verse search: '+(err?.message||err))),8000).unref();
 const url='http://127.0.0.1:'+port;
 console.log('Wordlight is ready: '+url);console.log('OBS full screen: '+url+'/?view=output&obs=1');console.log('OBS lower third: '+url+'/?view=lower&obs=1');console.log('Keep this app running during projection. Press Ctrl+C to stop.');
 // The phone remote starts only after the companion itself is running, and only if it was turned on. If it cannot
 // start, the studio and OBS outputs keep running.
 remote.start().catch(err=>console.error('The phone remote could not start: '+(err?.message||err)));
 updater.schedule();
 if(process.argv.includes('--open')){
  if(process.platform==='win32')spawn('explorer.exe',[url],{stdio:'ignore',windowsHide:true}).unref();
  else spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore'}).unref();
 }
});
process.on('SIGINT',()=>{for(const res of clients)res.end();server.close(()=>process.exit(0));});
