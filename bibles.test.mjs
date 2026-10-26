// Installed Bibles. A synthetic VPL archive stands in for the eBible.org download; the companion runs on a test port with
// a throwaway data folder. No real Bible text is used.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateRawSync,crc32} from 'node:zlib';
import {BIBLE_BOOKS} from './dist/reference.mjs';
import {zipEntries,readZipEntry} from './ziputil.mjs';
import {parseVPL,createBibleLibrary} from './bibles.mjs';
import {rename,rm as remove,writeFile,mkdir} from 'node:fs/promises';
import {adjacentByChapter} from './dist/scripture.mjs';

// eBible codes for the eleven books whose codes differ.
const EBIBLE={SNG:'SOL',EZK:'EZE',JOL:'JOE',NAM:'NAH',MRK:'MAR',JHN:'JOH',PHP:'PHI',JAS:'JAM','1JN':'1JO','2JN':'2JO','3JN':'3JO'};
function vpl({skip=[],drop=''}={}){
 const lines=[];
 for(const b of BIBLE_BOOKS){if(b.id===drop)continue;for(let c=1;c<=b.chapters;c++)for(let v=1;v<=3;v++)if(!skip.includes(b.id+' '+c+':'+v))lines.push((EBIBLE[b.id]||b.id)+' '+c+':'+v+' Synthetic ['+b.id+'] '+c+':'+v+'¶');}
 return lines.join('\r\n')+'\r\n';
}
function zip(files,{badCrc=false}={}){
 const locals=[],central=[];let offset=0;
 for(const [name,content] of Object.entries(files)){
  const data=Buffer.from(content),packed=deflateRawSync(data),nameBuf=Buffer.from(name),crc=badCrc?0:crc32(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBuf.length,26);
  const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(8,10);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(packed.length,20);dir.writeUInt32LE(data.length,24);dir.writeUInt16LE(nameBuf.length,28);dir.writeUInt32LE(offset,42);
  locals.push(local,nameBuf,packed);central.push(dir,nameBuf);offset+=30+nameBuf.length+packed.length;
 }
 const dirBuf=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(dirBuf.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,dirBuf,end]);
}
test('ZIP reading checks sizes and checksums; VPL parsing maps eBible codes, keeps gaps and refuses incomplete text',()=>{
 const good=zip({'a.txt':'hello','yor_vpl.txt':vpl()}),entries=zipEntries(good);
 assert.deepEqual(entries.map(e=>e.name),['a.txt','yor_vpl.txt']);assert.equal(readZipEntry(good,entries[0],100).toString(),'hello');
 assert.throws(()=>readZipEntry(good,entries[1],10),/larger than expected/);
 const bad=zip({'a.txt':'hello'},{badCrc:true});assert.throws(()=>readZipEntry(bad,zipEntries(bad)[0],100),/checksum/);
 assert.throws(()=>zipEntries(Buffer.from('not a zip')),/not a ZIP/);
 const {books}=parseVPL(vpl({skip:['MAT 17:2']}),/[\[\]¶]/g);
 assert.equal(books.JHN[2][0],'Synthetic JHN 3:1','JOH became JHN; markup removed');assert.equal(books['3JN'][0].length,3);
 assert.equal(books.MAT[16][1],null,'a verse the translation leaves out is kept as a gap');
 assert.throws(()=>parseVPL(vpl({drop:'REV'})),/incomplete \(REV\)/);
 assert.throws(()=>parseVPL('GEN 1:1 ok\nnonsense line'),/cannot read/);
});

let mock,mockPort,downloads=0,companion,dir,base;
before(async()=>{
 const archives={'yor_vpl.zip':zip({'yor_about.htm':'<p>Synthetic notice</p>','yor_vpl.txt':vpl({skip:['MAT 17:2']})}),'eng-kjv2006_vpl.zip':zip({'eng-kjv2006_vpl.txt':vpl()}),'engwebp_vpl.zip':zip({'engwebp_vpl.txt':vpl({drop:'REV'})})};
 mock=http.createServer((req,res)=>{const name=req.url.replace('/ebible/','');downloads++;if(!archives[name]){res.writeHead(404);res.end();return;}setTimeout(()=>{res.writeHead(200,{'Content-Type':'application/zip'});res.end(archives[name]);},50);});
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));mockPort=mock.address().port;
 dir=await mkdtemp(path.join(tmpdir(),'wordlight-bibles-test-'));base='http://127.0.0.1:18791';
 companion=spawn(process.execPath,['server.mjs'],{cwd:path.dirname(fileURLToPath(import.meta.url)),env:{...process.env,WORDLIGHT_PORT:'18791',WORDLIGHT_DATA_DIR:dir,WORDLIGHT_API_BIBLE_TEST_BASE:'http://127.0.0.1:'+mockPort,WORDLIGHT_FREESHOW_INDEX:path.join(dir,'none.json'),WORDLIGHT_BIBLE_SEEDS:path.join(dir,'no-seeds')},stdio:'ignore'});
 for(let i=0;i<50;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
});
after(async()=>{companion.kill();mock.close();await new Promise(r=>setTimeout(r,200));await rm(dir,{recursive:true,force:true});});
const call=async(p,body)=>{const r=await fetch(base+p,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
const waitInstalled=async id=>{for(let i=0;i<100;i++){const b=(await call('/api/bibles')).body.bibles.find(x=>x.id===id);if(b.installed||b.job?.state==='failed')return b;await new Promise(r=>setTimeout(r,100));}};
test('Health names the app and version, so a launcher can tell which Wordlight is running',async()=>{
 const h=await call('/api/health');assert.equal(h.body.app,'wordlight');assert.equal(h.body.version,JSON.parse(await readFile('package.json','utf8')).version);assert.equal(h.body.build,'dev');
 assert.deepEqual((await call('/api/bridge/code')).body.origins,[],'without WORDLIGHT_BRIDGE_ORIGINS the web-studio bridge is off');
 assert.equal(h.body.preview,false,'a normal start is not marked as a preview');
});
test('Install once, then look up offline: verses, ranges, chapters, gaps and navigation',async()=>{
 assert.equal((await call('/api/bibles/passage?translation=oycb&book=JHN&chapter=3&verse=1')).status,404,'not installed yet');
 assert.equal((await call('/api/bibles/install',{id:'oycb'})).status,202);
 const b=await waitInstalled('oycb');assert.equal(b.installed,true);
 const one=(await call('/api/bibles/passage?translation=oycb&book=JHN&chapter=3&verse=2')).body;
 assert.deepEqual(one.verses.map(v=>[v.book_id,v.book,v.chapter,v.verse,v.text]),[['JHN','John',3,2,'Synthetic [JHN] 3:2¶']],'OYCB text is kept unchanged');
 assert.match(one.copyright,/Biblica/);assert.equal(one.source.provider,'Installed OYCB');
 assert.deepEqual((await call('/api/bibles/passage?translation=oycb&book=MAT&chapter=17&verse=1&endVerse=3')).body.verses.map(v=>v.verse),[1,3],'a left-out verse is skipped in a range');
 assert.equal((await call('/api/bibles/passage?translation=oycb&book=MAT&chapter=17&verse=2')).status,404);
 assert.equal((await call('/api/bibles/passage?translation=oycb&book=PSA&chapter=119')).body.verses.length,3,'whole chapter');
 assert.deepEqual((await call('/api/bibles/passage?translation=oycb&book=JHN&chapter=3&verse=3&endChapter=4&endVerse=1')).body.verses.map(v=>v.chapter+':'+v.verse),['3:3','4:1']);
 assert.equal((await call('/api/bibles/passage?translation=oycb&book=JHN&chapter=3&verse=9')).status,404);
 const files=await readdir(path.join(dir,'bibles','oycb'));assert.ok(files.includes('about.htm')&&files.includes('JHN.json')&&files.includes('manifest.json'));
 const get=async p=>{const [,,tr,book,chapter]=p.split('/');return (await call('/api/bibles/passage?translation='+tr+'&book='+book+'&chapter='+chapter)).body;};
 const at=(bookId,chapter,verse)=>({translation:'oycb',start:{bookId,chapter,verse},end:{bookId,chapter,verse}});
 assert.equal((await adjacentByChapter(at('JHN',3,3),1,get,'/local/oycb')).reference,'John 4:1');
 assert.equal((await adjacentByChapter(at('MAL',4,3),1,get,'/local/oycb')).reference,'Matthew 1:1');
 assert.equal((await adjacentByChapter(at('MAT',17,3),-1,get,'/local/oycb')).reference,'Matthew 17:1','navigation steps over a left-out verse');
});
test('Concurrent install requests download once; a broken archive installs nothing; remove deletes the copy',async()=>{
 const before=downloads;await Promise.all([call('/api/bibles/install',{id:'kjv'}),call('/api/bibles/install',{id:'kjv'})]);
 assert.equal((await waitInstalled('kjv')).installed,true);assert.equal(downloads-before,1);
 assert.equal((await call('/api/bibles/passage?translation=kjv&book=GEN&chapter=1&verse=1')).body.verses[0].text,'Synthetic GEN 1:1','KJV markup removed');
 await call('/api/bibles/install',{id:'web'});const web=await waitInstalled('web');
 assert.equal(web.installed,false);assert.match(web.job.message,/incomplete \(REV\)/);
 await call('/api/bibles/install',{id:'asv'});const asv=await waitInstalled('asv');assert.match(asv.job.message,/download of ASV failed \(404\)/);
 assert.deepEqual((await readdir(path.join(dir,'bibles'))).sort(),['kjv','oycb'],'no partial folders left');
 assert.equal((await call('/api/bibles/remove',{id:'kjv'})).status,200);assert.equal((await call('/api/bibles/passage?translation=kjv&book=GEN&chapter=1&verse=1')).status,404);
 assert.equal((await call('/api/bibles/install',{id:'../evil'})).status,404);
 assert.equal((await fetch(base+'/api/bibles/install',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{"id":"kjv"}'})).status,415);
 assert.equal((await fetch(base+'/api/bibles',{headers:{Origin:'https://evil.example'}})).status,403);
});

test('Seed packs install missing translations once, never replace an installed copy, and a failed swap keeps the old copy',async()=>{
 const data=await mkdtemp(path.join(tmpdir(),'wordlight-seed-test-')),seeds=path.join(data,'seeds');
 try{
  await mkdir(seeds);await writeFile(path.join(seeds,'yor_vpl.zip'),zip({'yor_vpl.txt':vpl()}));
  let downloads=0;const request=async()=>{downloads++;throw new Error('offline');};
  const lib=createBibleLibrary({dataDir:data,seedDir:seeds,request});
  await lib.seedMissing();
  const list=await lib.list();assert.deepEqual(list.filter(b=>b.installed).map(b=>b.id),['oycb'],'only the shipped pack is installed');
  assert.equal(downloads,0,'seeding needs no internet');
  const first=(await lib.list()).find(b=>b.id==='oycb').installedAt;
  await lib.seedMissing();assert.equal((await lib.list()).find(b=>b.id==='oycb').installedAt,first,'an installed copy is not replaced');
  // A rename that fails when the new copy is moved into place: the previous copy comes back.
  let failSwap=true;const fsx={rename:async(a,b)=>{if(failSwap&&path.basename(a).startsWith('.oycb-'))throw Object.assign(new Error('locked'),{code:'EPERM'});return rename(a,b);},rm:remove};
  const flaky=createBibleLibrary({dataDir:data,seedDir:seeds,request,fsx});
  await flaky.install('oycb');let b;for(let i=0;i<100;i++){b=(await flaky.list()).find(x=>x.id==='oycb');if(b.job?.state!=='running')break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(b.job.state,'failed');assert.match(b.job.message,/previous copy was kept/);
  assert.equal((await flaky.passage('oycb',{bookId:'JHN',chapter:3,verse:1})).verses.length,1,'the previous copy still answers');
  // A clean-up failure after the new copy is in place is not reported as a failed install.
  failSwap=false;const tidy=createBibleLibrary({dataDir:data,seedDir:seeds,request,fsx:{rename,rm:async(p,o)=>{if(/.old-/.test(p))throw new Error('busy');return remove(p,o);}}});
  await tidy.install('oycb');for(let i=0;i<100;i++){b=(await tidy.list()).find(x=>x.id==='oycb');if(!b.job)break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(b.installed,true);assert.equal(b.job,null,'installed, no failure reported');assert.ok(b.installedAt>first);
 }finally{await remove(data,{recursive:true,force:true});}
});

test('Your own Bible file: a FreeShow .fsb or a VPL ZIP imports into a slot such as NKJV, stays local and is used offline',async()=>{
 const raw=async(p,body,type='application/octet-stream')=>{const r=await fetch(base+p,{method:'POST',headers:{'Content-Type':type},body});return {status:r.status,body:await r.json()};};
 const before=(await call('/api/bibles')).body.bibles.find(b=>b.id==='nkjv');
 assert.deepEqual([before.installed,before.importOnly],[false,true]);
 assert.equal((await call('/api/bibles/install',{id:'nkjv'})).status,400,'NKJV is never downloaded');
 const fsb=['x',{name:'Synthetic',metadata:{copyright:''},books:BIBLE_BOOKS.map((b,i)=>({number:i+1,name:b.english,chapters:Array.from({length:b.chapters},(_,c)=>({number:String(c+1),verses:[1,2].map(v=>({number:String(v),text:'<i>Own</i> '+b.id+' '+(c+1)+':'+v}))}))}))}];
 assert.equal((await raw('/api/bibles/import?id=nkjv&name=my-nkjv.fsb',JSON.stringify(fsb),'application/json')).status,415);
 const done=await raw('/api/bibles/import?id=nkjv&name=C:/Users/me/my-nkjv.fsb',JSON.stringify(fsb));
 assert.equal(done.status,200);assert.equal(done.body.bibles.find(b=>b.id==='nkjv').installed,true);
 const one=(await call('/api/bibles/passage?translation=nkjv&book=JHN&chapter=3&verse=2')).body;
 assert.equal(one.verses[0].text,'Own JHN 3:2','markup removed');assert.match(one.copyright,/New King James Version/);
 const m=JSON.parse(await readFile(path.join(dir,'bibles','nkjv','manifest.json'),'utf8'));
 assert.deepEqual([m.from,m.source],['import','Imported file my-nkjv.fsb'],'only the file name is kept');
 const zipped=zip({'mine_vpl.txt':vpl()});
 assert.equal((await raw('/api/bibles/import?id=nkjv&name=mine.zip',zipped)).status,200,'a VPL ZIP replaces the earlier import');
 assert.equal((await call('/api/bibles/passage?translation=nkjv&book=JHN&chapter=3&verse=2')).body.verses[0].text,'Synthetic [JHN] 3:2¶');
 const bad=await raw('/api/bibles/import?id=nkjv&name=bad.txt','not a bible');assert.equal(bad.status,422);
 assert.equal((await call('/api/bibles/passage?translation=nkjv&book=JHN&chapter=3&verse=2')).status,200,'a bad file leaves the installed copy');
 assert.equal((await raw('/api/bibles/import?id=../x&name=a',zipped)).status,404);
});

test('Downloads are read with a size cap: a large declared size is refused early, an endless body is cut off',async()=>{
 const {readLimited}=await import('./dist/readlimit.mjs');
 const data=await mkdtemp(path.join(tmpdir(),'wordlight-limit-test-'));
 try{
  let pulled=0;
  const endless=()=>new Response(new ReadableStream({pull(c){pulled+=1000;c.enqueue(new Uint8Array(1000));}}));
  await assert.rejects(readLimited(endless(),5000,'The test'),/larger than expected/);assert.ok(pulled<20000,'stopped soon after the limit ('+pulled+' bytes)');
  await assert.rejects(readLimited(new Response('x',{headers:{'content-length':'999999'}}),5000),/larger than expected/);
  assert.equal((await readLimited(new Response('hello'),5000)).length,5);
  const lib=createBibleLibrary({dataDir:data,request:async()=>endless(),archiveLimit:5000});
  await lib.install('kjv');let b;for(let i=0;i<100;i++){b=(await lib.list()).find(x=>x.id==='kjv');if(b.job?.state!=='running')break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(b.job.state,'failed');assert.match(b.job.message,/KJV download is larger than expected/);
 }finally{await remove(data,{recursive:true,force:true});}
});
