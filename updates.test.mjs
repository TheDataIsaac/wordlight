// Updates for the Windows package: finding a newer release, downloading and checking it, and putting it in place
// (or going back) when Wordlight starts. A local HTTP server stands in for GitHub; folders are throwaway.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {writeZip} from './ziputil.mjs';
import {compareVersions,readRelease,checksumFor,createUpdater as realUpdater,signedByRelease,RELEASE_KEY} from './updates.mjs';
import {applyPending} from './tools/launcher/update.mjs';

const sha=buf=>createHash('sha256').update(buf).digest('hex');
// A throwaway release key: the fake GitHub signs with it and the updater under test trusts it.
const testKey=generateKeyPairSync('ed25519'),otherKey=generateKeyPairSync('ed25519');
const testPublic=testKey.publicKey.export({type:'spki',format:'pem'});
const signWith=(key,bytes)=>sign(null,Buffer.from(bytes),key.privateKey).toString('base64');
const createUpdater=options=>realUpdater({releaseKey:testPublic,...options});
const exists=file=>stat(file).then(()=>true,()=>false);
const appZip=(version,extra={})=>writeZip({'app/server.mjs':Buffer.from('// server '+version),'app/package.json':Buffer.from(JSON.stringify({version})),'app/build.json':Buffer.from(JSON.stringify({version,build:version+'+test',node:process.version})),...extra});

// A package folder with app\ at 1.1.0 and a runtime, plus a data folder.
async function packageFolder(){
 const top=await mkdtemp(path.join(tmpdir(),'wordlight-update-'));
 await mkdir(path.join(top,'runtime'));await writeFile(path.join(top,'runtime','node.exe'),'');
 await mkdir(path.join(top,'app'));
 await writeFile(path.join(top,'app','package.json'),JSON.stringify({version:'1.1.0'}));
 await writeFile(path.join(top,'app','build.json'),JSON.stringify({version:'1.1.0',build:'1.1.0+old'}));
 const data=path.join(top,'data');await mkdir(path.join(data,'songs'),{recursive:true});
 await writeFile(path.join(data,'session.json'),'{"saved":true}');await writeFile(path.join(data,'songs','index.json'),'[]');
 return {top,data,root:path.join(top,'app')};
}
// A stand-in for GitHub's latest-release answer and its two files.
async function fakeGitHub(zip,{sums,signature,signed=true}={}){
 const server=http.createServer((req,res)=>{
  const base='http://127.0.0.1:'+server.address().port;
  if(req.url==='/latest'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({tag_name:'v1.2.0',name:'Wordlight 1.2.0',body:'What changed',html_url:base+'/page',
   assets:[{name:'Wordlight-portable-1.2.0-win-x64.zip',browser_download_url:base+'/full'},{name:'Wordlight-app-1.2.0.zip',browser_download_url:base+'/app'},{name:'SHA256SUMS.txt',browser_download_url:base+'/sums'},...(signed?[{name:'SHA256SUMS.txt.sig',browser_download_url:base+'/sig'}]:[])]}));return;}
  if(req.url==='/app'){res.end(zip);return;}
  const sumsText=sums??sha(zip)+'  Wordlight-app-1.2.0.zip\n';
  if(req.url==='/sums'){res.end(sumsText);return;}
  if(req.url==='/sig'){res.end(signature??signWith(testKey,sumsText));return;}
  res.statusCode=404;res.end();
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {feed:'http://127.0.0.1:'+server.address().port+'/latest',close:()=>server.close()};
}

test('Only the release key verifies a signature, and the built-in key is a real Ed25519 key',()=>{
 assert.equal(signedByRelease(Buffer.from('sums'),signWith(testKey,'sums'),testPublic),true);
 assert.equal(signedByRelease(Buffer.from('sums changed'),signWith(testKey,'sums'),testPublic),false);
 assert.equal(signedByRelease(Buffer.from('sums'),signWith(otherKey,'sums'),testPublic),false);
 assert.equal(signedByRelease(Buffer.from('sums'),'not base64 at all',testPublic),false);
 assert.equal(signedByRelease(Buffer.from('sums'),signWith(testKey,'sums')),false,'the real key does not trust the test key');
 assert.match(RELEASE_KEY,/BEGIN PUBLIC KEY/);
});

test('Versions compare by number, and a release gives its update files and notes',()=>{
 assert.equal(compareVersions('1.10.0','1.9.2'),1);
 assert.equal(compareVersions('v1.2.0','1.2.0'),0);
 assert.equal(compareVersions('1.1.0','1.2.0'),-1);
 assert.equal(compareVersions('nonsense','0.0.0'),0);
 const r=readRelease({tag_name:'v1.2.0',body:'Notes',assets:[{name:'Wordlight-app-1.2.0.zip',browser_download_url:'u1'},{name:'SHA256SUMS.txt',browser_download_url:'u2'},{name:'Wordlight-app-1.2.0.zip.bak',browser_download_url:'x'}]});
 assert.deepEqual([r.version,r.appZip.url,r.sums.url,r.notes],['1.2.0','u1','u2','Notes']);
 assert.equal(checksumFor('a'.repeat(64)+'  other.zip\n'+'B'.repeat(64)+' *Wordlight-app-1.2.0.zip','Wordlight-app-1.2.0.zip'),'b'.repeat(64));
 assert.equal(checksumFor('','x.zip'),'');
});

test('A newer release is found, downloaded, checked and set aside without touching the running app',async()=>{
 const {top,data,root}=await packageFolder(),gh=await fakeGitHub(appZip('1.2.0'));
 try{
  const updater=createUpdater({root,dataDir:data,version:'1.1.0',build:'1.1.0+old',port:1,feed:gh.feed});
  const checked=await updater.check();
  assert.equal(checked.newer,true);assert.equal(checked.latest.version,'1.2.0');assert.equal(checked.isPackage,true);
  const after=await updater.download();
  assert.deepEqual(after.ready,{version:'1.2.0',build:'1.2.0+test'});
  assert.equal(await readFile(path.join(top,'update','app','server.mjs'),'utf8'),'// server 1.2.0');
  assert.equal(JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version,'1.1.0','the running app is unchanged');
 }finally{gh.close();await rm(top,{recursive:true,force:true});}
});

test('A download that is unsigned, signed with another key, fails its checksum, holds an unsafe name or needs another runtime is refused and nothing is set aside',async()=>{
 const cases=[
  [appZip('1.2.0'),{signed:false},/not signed/],
  [appZip('1.2.0'),{signature:signWith(otherKey,'anything')},/not signed with Wordlight's release key/],
  [appZip('1.2.0'),{sums:'0'.repeat(64)+'  Wordlight-app-1.2.0.zip\n'},/does not match its checksum/],
  [appZip('1.2.0',{'app/../escape.txt':Buffer.from('x')}),{},/unsafe file name/],
  [writeZip({'app/server.mjs':Buffer.from('x'),'app/package.json':Buffer.from('{"version":"1.2.0"}'),'app/build.json':Buffer.from('{"node":"v1.0.0"}')}),{},/needs a newer runtime/],
  [writeZip({'app/package.json':Buffer.from('{"version":"1.2.0"}')}),{},/incomplete/],
 ];
 for(const [zip,options,message] of cases){
  const {top,data,root}=await packageFolder(),gh=await fakeGitHub(zip,options);
  try{
   const updater=createUpdater({root,dataDir:data,version:'1.1.0',build:'1.1.0+old',port:1,feed:gh.feed});
   await assert.rejects(updater.download(),message);
   assert.equal(await exists(path.join(top,'update','app')),false);
   assert.equal(await exists(path.join(top,'escape.txt')),false);
   assert.deepEqual((await readdir(path.join(top,'update')).catch(()=>[])),[],'no half-unpacked folder is left');
  }finally{gh.close();await rm(top,{recursive:true,force:true});}
 }
});

test('A copy run from source never downloads; the same version is not an update',async()=>{
 const top=await mkdtemp(path.join(tmpdir(),'wordlight-update-')),gh=await fakeGitHub(appZip('1.2.0'));
 try{
  await mkdir(path.join(top,'app'));
  const source=createUpdater({root:path.join(top,'app'),dataDir:top,version:'1.1.0',build:'dev',port:1,feed:gh.feed});
  await assert.rejects(source.download(),/runs from source/);
  const {top:pkg,data,root}=await packageFolder();
  const same=createUpdater({root,dataDir:data,version:'1.2.0',build:'x',port:1,feed:gh.feed});
  assert.equal((await same.check()).newer,false);
  await assert.rejects(same.download(),/no newer version/);
  await rm(pkg,{recursive:true,force:true});
 }finally{gh.close();await rm(top,{recursive:true,force:true});}
});

test('At the next start the update goes in, the old version is kept, data is copied first, and going back swaps them',async()=>{
 const {top,data,root}=await packageFolder(),gh=await fakeGitHub(appZip('1.2.0'));
 try{
  await createUpdater({root,dataDir:data,version:'1.1.0',build:'1.1.0+old',port:1,feed:gh.feed}).download();
  const done=await applyPending({top,dataDir:data});
  assert.equal(done.result,'updated');
  assert.equal(JSON.parse(await readFile(path.join(top,'app','package.json'),'utf8')).version,'1.2.0');
  assert.equal(JSON.parse(await readFile(path.join(top,'app-previous','package.json'),'utf8')).version,'1.1.0');
  assert.equal(await readFile(path.join(done.backup,'session.json'),'utf8'),'{"saved":true}');
  assert.equal(await exists(path.join(top,'update')),false);
  assert.deepEqual(await applyPending({top,dataDir:data}),{result:'none'},'nothing waiting: nothing changes');
  await writeFile(path.join(top,'app','update-marker'),'');
  await mkdir(path.join(top,'update'));await writeFile(path.join(top,'update','rollback.json'),'{}');
  assert.equal((await applyPending({top,dataDir:data})).result,'rolled-back');
  assert.equal(JSON.parse(await readFile(path.join(top,'app','package.json'),'utf8')).version,'1.1.0');
  assert.equal(await exists(path.join(top,'app-previous','update-marker')),true,'the newer version is kept as the previous one');
  assert.equal(await readFile(path.join(data,'session.json'),'utf8'),'{"saved":true}','shows are never moved');
 }finally{gh.close();await rm(top,{recursive:true,force:true});}
});

test('While something runs inside app, the update waits and the app is left as it was (Windows)',{skip:process.platform!=='win32'},async()=>{
 const {top,data,root}=await packageFolder(),gh=await fakeGitHub(appZip('1.2.0'));
 const busy=spawn(process.execPath,['-e','setTimeout(()=>{},20000)'],{cwd:root,stdio:'ignore'});
 try{
  await new Promise(r=>setTimeout(r,300));
  await createUpdater({root,dataDir:data,version:'1.1.0',build:'1.1.0+old',port:1,feed:gh.feed}).download();
  const done=await applyPending({top,dataDir:data});
  assert.equal(done.result,'failed');
  assert.equal(JSON.parse(await readFile(path.join(top,'app','package.json'),'utf8')).version,'1.1.0');
  assert.equal(await exists(path.join(top,'update','ready.json')),true,'the update still waits for the next start');
 }finally{busy.kill();gh.close();await new Promise(r=>setTimeout(r,300));await rm(top,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});

test('A swap cut short is finished or undone at the next start, and nothing kept is lost',async()=>{
 const {top,data,root}=await packageFolder(),gh=await fakeGitHub(appZip('1.2.0'));
 const version=folder=>readFile(path.join(top,folder,'package.json'),'utf8').then(t=>JSON.parse(t).version,()=>null);
 try{
  await createUpdater({root,dataDir:data,version:'1.1.0',build:'1.1.0+old',port:1,feed:gh.feed}).download();
  // Cut short after the running version was moved aside: app\ is missing. The Start script puts app-swap\ back,
  // the same step finishInterrupted takes, and the update is still waiting.
  const {rename}=await import('node:fs/promises');
  await rename(path.join(top,'app'),path.join(top,'app-swap'));
  const done=await applyPending({top,dataDir:data});
  assert.equal(done.result,'updated');
  assert.equal(await version('app'),'1.2.0');assert.equal(await version('app-previous'),'1.1.0');
  // Cut short after the new version went in: app\ works and app-swap\ holds the old one, which becomes the kept version.
  await rename(path.join(top,'app-previous'),path.join(top,'app-swap'));
  assert.deepEqual(await applyPending({top,dataDir:data}),{result:'none'});
  assert.equal(await version('app-previous'),'1.1.0');assert.equal(await exists(path.join(top,'app-swap')),false);
 }finally{gh.close();await rm(top,{recursive:true,force:true});}
});

test('Two starts at once install the update once and keep the previous version',async()=>{
 const {top,data,root}=await packageFolder(),gh=await fakeGitHub(appZip('1.2.0'));
 try{
  await createUpdater({root,dataDir:data,version:'1.1.0',build:'1.1.0+old',port:1,feed:gh.feed}).download();
  const results=(await Promise.all([applyPending({top,dataDir:data}),applyPending({top,dataDir:data})])).map(r=>r.result).sort();
  assert.deepEqual(results,['none','updated']);
  assert.equal(JSON.parse(await readFile(path.join(top,'app-previous','package.json'),'utf8')).version,'1.1.0');
  assert.equal(await exists(path.join(top,'update.lock')),false);
 }finally{gh.close();await rm(top,{recursive:true,force:true});}
});
