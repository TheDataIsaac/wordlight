// Starts the real companion server on a test port with a throwaway data folder and checks the hosted-studio bridge.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {DEFAULT,snapshot} from './dist/core.mjs';
import {describeViewers} from './dist/bridge.mjs';
import {newSong,editSong} from './dist/songs.mjs';
const port=18781,hosted='https://studio.example.org',base='http://127.0.0.1:'+port;
let server,dataDir,code;
// node's fetch cannot set Host or Origin freely, so use http.request.
function request(method,pathname,{headers={},body}={}){
 return new Promise((resolve,reject)=>{
  const data=body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body);
  const req=http.request({host:'127.0.0.1',port,method,path:pathname,headers:{Host:'127.0.0.1:'+port,...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),...headers}},res=>{
   let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:text?JSON.parse(text):null}));
  });
  req.on('error',reject);if(data)req.write(data);req.end();
 });
}
const live=(updated,text='Bridge slide')=>({...snapshot({...structuredClone(DEFAULT),passage:text}),blank:false,updated});
before(async()=>{
 dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-bridge-test-'));
 server=spawn(process.execPath,['server.mjs'],{cwd:path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1')),env:{...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_DATA_DIR:dataDir,WORDLIGHT_BRIDGE_ORIGINS:hosted,WORDLIGHT_BIBLE_SEEDS:path.join(dataDir,'none'),WORDLIGHT_FREESHOW_DATA:path.join(dataDir,'none'),WORDLIGHT_FREESHOW_INDEX:path.join(dataDir,'none','index.json'),WORDLIGHT_FREESHOW_SHOWS:path.join(dataDir,'none')},stdio:'ignore'});
 for(let i=0;i<50;i++){try{const r=await request('GET','/api/bridge/code');if(r.status===200){code=r.body.code;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.match(code,/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});
after(async()=>{server.kill();await new Promise(r=>setTimeout(r,200));await rm(dataDir,{recursive:true,force:true});});
test('Only the local studio can read the pairing code; it is saved in the data folder',async()=>{
 assert.equal((await request('GET','/api/bridge/code',{headers:{Origin:hosted}})).status,403);
 assert.equal((await request('GET','/api/bridge/code',{headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await request('GET','/api/bridge/code',{headers:{Origin:base}})).body.code,code);
 assert.equal(JSON.parse(await readFile(path.join(dataDir,'bridge.json'),'utf8')).code,code);
});
test('Preflight answers only the allowed hosted origin, including Private Network Access',async()=>{
 const ok=await request('OPTIONS','/api/bridge/live',{headers:{Origin:hosted,'Access-Control-Request-Method':'POST','Access-Control-Request-Private-Network':'true'}});
 assert.equal(ok.status,204);assert.equal(ok.headers['access-control-allow-origin'],hosted);assert.equal(ok.headers['access-control-allow-private-network'],'true');
 assert.match(ok.headers['access-control-allow-headers'],/Authorization/);
 for(const origin of ['https://evil.example','http://studio.example.org','https://studio.example.org.evil.example','null']){
  const bad=await request('OPTIONS','/api/bridge/live',{headers:{Origin:origin,'Access-Control-Request-Private-Network':'true'}});
  assert.equal(bad.status,403,origin);assert.equal(bad.headers['access-control-allow-origin'],undefined);
 }
});
test('The hosted studio needs the pairing code; wrong origins and DNS-rebinding hosts are refused',async()=>{
 assert.equal((await request('GET','/api/bridge/status',{headers:{Origin:hosted}})).status,401);
 assert.equal((await request('GET','/api/bridge/status',{headers:{Origin:hosted,Authorization:'Bearer AAAA-BBBB-CCCC'}})).status,401);
 const ok=await request('GET','/api/bridge/status',{headers:{Origin:hosted,Authorization:'Bearer '+code}});
 assert.equal(ok.status,200);assert.equal(ok.body.paired,true);assert.equal(ok.headers['access-control-allow-origin'],hosted);
 assert.equal((await request('POST','/api/bridge/live',{headers:{Origin:'https://evil.example',Authorization:'Bearer '+code},body:{live:live(Date.now())}})).status,403);
 assert.equal((await request('GET','/api/bridge/status',{headers:{Host:'evil.example:'+port,Origin:hosted,Authorization:'Bearer '+code}})).status,403);
 // The existing state API still refuses other origins, so a hosted page cannot replace shows.
 assert.equal((await request('POST','/api/state',{headers:{Origin:hosted},body:{library:null}})).status,403);
});
test('Paired live updates reach output streams, are saved, and never replace a newer screen',async()=>{
 const auth={Origin:hosted,Authorization:'Bearer '+code};
 const events=await new Promise(resolve=>{const req=http.get({host:'127.0.0.1',port,path:'/api/events?view=lower',headers:{Host:'127.0.0.1:'+port}},res=>{const seen=[];res.on('data',c=>seen.push(String(c)));resolve({seen,req});});});
 await new Promise(r=>setTimeout(r,100));
 assert.equal((await request('GET','/api/bridge/status',{headers:auth})).body.viewers.lower,1);
 const t=Date.now()+1000,sent=await request('POST','/api/bridge/live',{headers:auth,body:{live:live(t,'From hosted')}});
 assert.equal(sent.status,200);await new Promise(r=>setTimeout(r,150));
 assert.ok(events.seen.join('').includes('From hosted'),'output stream received it');
 const saved=JSON.parse(await readFile(path.join(dataDir,'session.json'),'utf8'));assert.equal(saved.live.updated,t);
 const stale=await request('POST','/api/bridge/live',{headers:auth,body:{live:live(t-5,'Older')}});
 assert.equal(stale.status,409);assert.equal(stale.body.liveUpdated,t);
 assert.equal((await request('GET','/api/state')).body.live.updated,t,'older state was ignored');
 assert.equal((await request('POST','/api/bridge/live',{headers:auth,body:{live:{schema:1,slides:[{}],index:0}}})).status,400);
 assert.equal((await request('POST','/api/bridge/live',{headers:auth,body:'{broken'})).status,400);
 const library=(await request('GET','/api/state')).body.library;
 assert.equal((await request('POST','/api/bridge/live',{headers:auth,body:{live:live(t+10),library:{format:'wordlight-library',version:1,shows:[]}}})).status,200);
 assert.deepEqual((await request('GET','/api/state')).body.library,library,'the bridge never changes shows');
 events.req.destroy();
});
test('A connected graphics page is counted and named in the studio status, and uncounted when it closes',async()=>{
 const auth={Origin:hosted,Authorization:'Bearer '+code};
 const open=view=>new Promise(resolve=>{const req=http.get({host:'127.0.0.1',port,path:'/api/events?view='+view,headers:{Host:'127.0.0.1:'+port}},()=>resolve(req));});
 const graphics=await open('graphics');await new Promise(r=>setTimeout(r,100));
 const hostedView=(await request('GET','/api/bridge/status',{headers:auth})).body.viewers,localView=(await request('GET','/api/bridge/code')).body.viewers;
 assert.deepEqual([hostedView.output,hostedView.lower,hostedView.graphics],[0,0,1]);assert.equal(localView.graphics,1);
 assert.equal(describeViewers(hostedView),'1 graphics page connected');assert.equal(describeViewers(localView),'1 graphics page connected');
 graphics.destroy();await new Promise(r=>setTimeout(r,200));
 assert.equal(describeViewers((await request('GET','/api/bridge/code')).body.viewers),'no output pages connected');
});
test('A paired web studio can read the current screen without changing it',async()=>{
 const auth={Origin:hosted,Authorization:'Bearer '+code};
 const before=(await request('GET','/api/state',{headers:{Origin:base}})).body.live;
 const read=await request('GET','/api/bridge/live',{headers:auth});
 assert.equal(read.status,200);assert.equal(read.headers['access-control-allow-origin'],hosted);assert.equal(read.body.live.updated,before.updated);
 assert.equal((await request('GET','/api/state',{headers:{Origin:base}})).body.live.updated,before.updated,'reading changed nothing');
 assert.equal((await request('GET','/api/bridge/live',{headers:{Origin:hosted,Authorization:'Bearer AAAA-BBBB-CCCC'}})).status,401);
});
test('A paired web studio can search, open and save songs and read installed Bibles, and nothing else',async()=>{
 const auth={Origin:hosted,Authorization:'Bearer '+code};
 const saved=await request('POST','/api/bridge/songs/library',{headers:auth,body:{song:editSong(newSong('Bridge Song'),{lyrics:'[Verse 1]\nHello',arrangement:'Verse 1'})}});
 assert.equal(saved.status,201);assert.equal(saved.headers['access-control-allow-origin'],hosted);
 const found=await request('GET','/api/bridge/songs?q=Bridge&source=wordlight&offset=0&limit=50',{headers:auth});
 assert.equal(found.status,200);assert.equal(found.headers['access-control-allow-origin'],hosted);assert.deepEqual(found.body.items.map(s=>s.name),['Bridge Song']);
 assert.equal((await request('GET','/api/bridge/songs/item?id='+saved.body.id,{headers:auth})).body.song.title,'Bridge Song');
 assert.equal((await request('GET','/api/bridge/songs/categories',{headers:auth})).status,200);
 const bibles=await request('GET','/api/bridge/bibles',{headers:auth});
 assert.equal(bibles.status,200);assert.ok(Array.isArray(bibles.body.bibles));
 // NKJV readiness and lookup pass too; the status names where a key comes from, never the key.
 const nkjv=await request('GET','/api/bridge/bible/status',{headers:auth});
 assert.equal(nkjv.status,200);assert.equal(nkjv.body.ready,false);assert.equal(nkjv.body.key,'none');
 const lookup=await request('GET','/api/bridge/bible/nkjv?book=JHN&chapter=3&verse=16',{headers:auth});
 assert.notEqual(lookup.status,404);assert.equal(lookup.headers['access-control-allow-origin'],hosted);
 // Removing, importing, exporting, installing, API keys and image deletion stay in the local studio.
 for(const [method,pathname] of [['DELETE','/api/bridge/songs/library/'+saved.body.id],['POST','/api/bridge/songs/library/import'],['GET','/api/bridge/songs/library/export'],['POST','/api/bridge/bibles/install'],['POST','/api/bridge/bibles/remove'],['POST','/api/bridge/bibles/import'],['POST','/api/bridge/bible/connect'],['POST','/api/bridge/bible/disconnect'],['DELETE','/api/bridge/assets/abc'],['GET','/api/bridge/state']])
  assert.equal((await request(method,pathname,{headers:auth,body:method==='POST'?{}:undefined})).status,404,method+' '+pathname);
 assert.equal((await request('GET','/api/bridge/songs?q=Bridge',{headers:{Origin:hosted,Authorization:'Bearer AAAA-BBBB-CCCC'}})).status,401);
 assert.equal((await request('GET','/api/bridge/songs?q=Bridge',{headers:{Origin:'https://evil.example',Authorization:'Bearer '+code}})).status,403);
 assert.equal((await request('GET','/api/songs?q=Bridge',{headers:{Origin:hosted}})).status,403,'the direct routes still refuse the web studio');
});
test('Rotating the code locks out the old pairing',async()=>{
 const old=code,rotated=await request('POST','/api/bridge/code',{headers:{Origin:base}});
 assert.notEqual(rotated.body.code,old);code=rotated.body.code;
 assert.equal((await request('GET','/api/bridge/status',{headers:{Origin:hosted,Authorization:'Bearer '+old}})).status,401);
 assert.equal((await request('POST','/api/bridge/code',{headers:{Origin:hosted,Authorization:'Bearer '+code}})).status,403);
});
test('The companion keeps a rolling backup of the previous save',async()=>{
 const files=await readdir(path.join(dataDir,'backups'));assert.ok(files.some(f=>/^session-.*\.json$/.test(f)));
});
test('The companion serves every module the studio imports',async()=>{
 const imports=new Set();
 for(const file of ['app.js',...(await readdir(new URL('./dist/',import.meta.url))).filter(f=>f.endsWith('.mjs'))]){
  const text=await readFile(new URL('./dist/'+file,import.meta.url),'utf8');
  for(const m of text.matchAll(/from '\.\/([a-z-]+\.mjs)'/g))imports.add(m[1]);
 }
 for(const name of imports){const r=await new Promise((resolve,reject)=>http.get({host:'127.0.0.1',port,path:'/'+name,headers:{Host:'127.0.0.1:'+port}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject));assert.equal(r,200,name);}
 assert.ok(imports.has('bolls.mjs'));
});
