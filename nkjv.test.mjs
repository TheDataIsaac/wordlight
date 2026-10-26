// NKJV through API.Bible. Everything here is synthetic: a local mock stands in for API.Bible, and the companion runs on
// test ports with throwaway data folders. No real key or Bible text is used.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cleanText,chapterVerses} from './apibible.mjs';
import {adjacentVerse,cleanScriptureSource} from './dist/scripture.mjs';
import {applyBiblePassage} from './dist/library.mjs';
import {DEFAULT,cleanDraft} from './dist/core.mjs';

const GOOD='synthetic-good-key-0001',NO_NKJV='synthetic-no-nkjv-key',BIBLE='0000000000000000-01';
const text=(verseId,value)=>({type:'text',text:value,attrs:{verseId,verseOrgIds:[verseId]}});
const verseTag=n=>({name:'verse',type:'tag',attrs:{number:String(n),style:'v'},items:[{type:'text',text:String(n)}]});
test('Verse text: headings, notes and verse numbers are skipped; split and partial verses are joined; entities decoded',()=>{
 const content=[
  {name:'para',type:'tag',attrs:{style:'s1'},items:[{type:'text',text:'A heading'}]},
  {name:'para',type:'tag',attrs:{style:'q1'},items:[verseTag(1),text('JHN.3.1','First line &amp; more'),{name:'note',type:'tag',attrs:{style:'f'},items:[text('JHN.3.1','a footnote')]}]},
  {name:'para',type:'tag',attrs:{style:'q2'},items:[text('JHN.3.1','second line'),verseTag(2),text('JHN.3.2a','Part a,'),text('JHN.3.2b',' part b &#8212; end&nbsp;')]}];
 assert.deepEqual(chapterVerses(content,'JHN',3),[{verse:1,text:'First line & more second line'},{verse:2,text:'Part a, part b — end'}]);
 assert.throws(()=>chapterVerses([{name:'para',type:'tag',attrs:{style:'p'},items:[text('JHN.3.1','ok'),text('JHN.3.2-JHN.3.3','joined')]}],'JHN',3),/cannot place .*JHN\.3\.2-JHN\.3\.3/);
 assert.throws(()=>chapterVerses([{name:'para',type:'tag',attrs:{style:'p'},items:[{type:'text',text:'loose text'}]}],'JHN',3),/text without a verse/);
 assert.throws(()=>chapterVerses('<p>html</p>','JHN',3),/unexpected format/);
 assert.equal(cleanText('a&lt;b&gt;&quot;c&quot; &#x1F600; &#0; &bogus;'),'a<b>"c" 😀 &bogus;');
});

// A mock API.Bible: JHN 3 has 36 verses, JHN 4 has 54, PSA 119 has 176. JHN 5 is missing verse 3; ACT 1 answers 429.
const COUNTS={'JHN.3':36,'JHN.4':54,'PSA.119':176,'JHN.5':10,'GEN.50':26,'EXO.1':22,'ISA.1':400};
const calls=[],fums=[];let mock,mockPort;
function chapterBody(id){
 const [book,number]=id.split('.'),count=COUNTS[id],verses=[];
 for(let v=1;v<=count;v++)if(!(id==='JHN.5'&&v===3))verses.push(verseTag(v),text(id+'.'+v,'Synthetic '+book+' '+number+':'+v+'.'));
 return {data:{id,bibleId:BIBLE,number,bookId:book,content:[{name:'para',type:'tag',attrs:{style:'s1'},items:[{type:'text',text:'Heading'}]},{name:'para',type:'tag',attrs:{style:'p'},items:verses}],verseCount:id==='JHN.5'?count-1:count,copyright:'Synthetic copyright line'},meta:{fumsToken:'token-'+id}};
}
before(async()=>{
 mock=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://x'),key=req.headers['api-key'],send=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  if(url.pathname==='/f3'){fums.push(Object.fromEntries(url.searchParams));res.end();return;}
  calls.push(url.pathname);
  if(key!==GOOD&&key!==NO_NKJV)return send(401,{statusCode:401,error:'Unauthorized'});
  if(url.pathname==='/v1/bibles')return send(200,{data:key===GOOD?[{id:BIBLE,abbreviation:'NKJV',name:'New King James Version',language:{id:'eng'}}]:[{id:'1111111111111111-01',abbreviation:'KJV',name:'King James',language:{id:'eng'}}]});
  if(url.pathname==='/v1/bibles/'+BIBLE)return send(200,{data:{id:BIBLE,abbreviation:'NKJV',copyright:'Synthetic copyright &amp; notice'}});
  const m=url.pathname.match(/^\/v1\/bibles\/[^/]+\/chapters\/([A-Z0-9]{3}\.\d+)$/);
  if(m&&m[1]==='ACT.1')return send(429,{error:'Too Many Requests'});
  if(m&&COUNTS[m[1]]){if(url.searchParams.get('content-type')!=='json')return send(400,{});setTimeout(()=>send(200,chapterBody(m[1])),40);return;}
  send(404,{error:'Not Found'});
 });
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));mockPort=mock.address().port;
});
after(()=>mock.close());
async function companion(port,env={}){
 const dir=await mkdtemp(path.join(tmpdir(),'wordlight-nkjv-test-')),output=[];
 const child=spawn(process.execPath,['server.mjs'],{cwd:path.dirname(fileURLToPath(import.meta.url)),env:{...process.env,WORDLIGHT_API_BIBLE_KEY:'',...env,WORDLIGHT_PORT:String(port),WORDLIGHT_DATA_DIR:dir,WORDLIGHT_API_BIBLE_TEST_BASE:'http://127.0.0.1:'+mockPort,WORDLIGHT_FREESHOW_INDEX:path.join(dir,'none.json')}});
 child.stdout.on('data',c=>output.push(String(c)));child.stderr.on('data',c=>output.push(String(c)));
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<50;i++){try{if((await fetch(base+'/api/bible/status')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const call=async(p,{method='GET',body,headers={}}={})=>{const r=await fetch(base+p,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),raw:''};};
 return {dir,child,output,call,base,stop:async()=>{child.kill();await new Promise(r=>setTimeout(r,200));await rm(dir,{recursive:true,force:true});}};
}
let c;
before(async()=>{c=await companion(18788);});
after(async()=>{await c.stop();});
test('Before setup: status is not ready, lookups explain the one-time step, and bad keys are refused without saving',async()=>{
 const status=await c.call('/api/bible/status');assert.deepEqual([status.body.ready,status.body.key],[false,'none']);
 const early=await c.call('/api/bible/nkjv?book=JHN&chapter=3&verse=16');assert.equal(early.status,409);assert.match(early.body.error,/not connected/);
 assert.equal((await c.call('/api/bible/connect',{method:'POST',body:{key:''}})).status,400);
 const bad=await c.call('/api/bible/connect',{method:'POST',body:{key:'wrong-key'}});assert.equal(bad.status,401);assert.match(bad.body.error,/did not accept this key/);
 const noNkjv=await c.call('/api/bible/connect',{method:'POST',body:{key:NO_NKJV}});assert.equal(noNkjv.status,403);assert.match(noNkjv.body.error,/NKJV is not among the Bibles/);
 assert.ok(!(await readdir(c.dir)).includes('api-bible.json'),'nothing saved for a refused key');
});
test('Setup is local only, JSON only, and the key is never returned, logged or served',async()=>{
 assert.equal((await c.call('/api/bible/connect',{method:'POST',body:{key:GOOD},headers:{Origin:'https://evil.example'}})).status,403);
 const plain=await fetch(c.base+'/api/bible/connect',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({key:GOOD})});assert.equal(plain.status,415);
 const rebind=await new Promise(resolve=>http.request({host:'127.0.0.1',port:18788,path:'/api/bible/status',headers:{Host:'evil.example:18788'}},res=>{res.resume();resolve(res);}).end());assert.equal(rebind.statusCode,403);
 const ok=await c.call('/api/bible/connect',{method:'POST',body:{key:GOOD}});
 assert.equal(ok.status,200);assert.deepEqual([ok.body.ready,ok.body.key,ok.body.copyright],[true,'saved','Synthetic copyright & notice']);
 const answers=[ok,await c.call('/api/bible/status'),await c.call('/api/bible/nkjv?book=JHN&chapter=3&verse=16')];
 for(const a of answers)assert.ok(!JSON.stringify(a.body).includes(GOOD),'no response contains the key');
 assert.ok(!c.output.join('').includes(GOOD),'nothing logged contains the key');
 for(const file of ['/','/app.js','/scripture.mjs','/library.mjs','/core.mjs'])assert.ok(!(await (await fetch(c.base+file)).text()).includes(GOOD));
 assert.equal((await fetch(c.base+'/apibible.mjs')).status,404,'the provider module is not served');
 assert.equal(JSON.parse(await readFile(path.join(c.dir,'api-bible.json'),'utf8')).key,GOOD,'kept only in the data folder');
});
test('Lookups: one verse, a range, across chapters, and a whole long chapter, each checked for completeness',async()=>{
 const one=await c.call('/api/bible/nkjv?book=JHN&chapter=3&verse=16');
 assert.deepEqual(one.body.verses.map(v=>[v.book_id,v.chapter,v.verse]),[['JHN',3,16]]);assert.equal(one.body.verses[0].book,'John');
 assert.deepEqual(one.body.source.provider,'API.Bible');assert.equal(one.body.source.bibleId,BIBLE);assert.equal(one.body.copyright,'Synthetic copyright line');
 assert.deepEqual((await c.call('/api/bible/nkjv?book=JHN&chapter=3&verse=16&endChapter=3&endVerse=18')).body.verses.map(v=>v.verse),[16,17,18]);
 const across=(await c.call('/api/bible/nkjv?book=JHN&chapter=3&verse=35&endChapter=4&endVerse=2')).body.verses;
 assert.deepEqual(across.map(v=>v.chapter+':'+v.verse),['3:35','3:36','4:1','4:2']);
 const psalm=(await c.call('/api/bible/nkjv?book=PSA&chapter=119')).body.verses;assert.equal(psalm.length,176,'a 176-verse chapter arrives whole');
 assert.equal((await c.call('/api/bible/nkjv?book=JHN&chapter=3&verse=40')).status,404);
 const gap=await c.call('/api/bible/nkjv?book=JHN&chapter=5&verse=1&endVerse=2');assert.equal(gap.status,502);assert.match(gap.body.error,/incomplete/);
 assert.equal((await c.call('/api/bible/nkjv?book=ACT&chapter=1&verse=1')).status,429);
 assert.equal((await c.call('/api/bible/nkjv?book=XYZ&chapter=1')).status,400);
 assert.equal((await c.call('/api/bible/nkjv?book=JHN&chapter=1&endChapter=12')).status,400,'at most 10 chapters at a time');
});
test('Chapters are fetched once: concurrent lookups share one request, repeats come from the bounded cache',async()=>{
 const before=calls.filter(p=>p.endsWith('/chapters/GEN.50')).length;
 await Promise.all([1,2,3].map(v=>c.call('/api/bible/nkjv?book=GEN&chapter=50&verse='+v)));
 await c.call('/api/bible/nkjv?book=GEN&chapter=50&verse=26');
 assert.equal(calls.filter(p=>p.endsWith('/chapters/GEN.50')).length-before,1);
 const reports=fums.filter(f=>f.t==='token-GEN.50');assert.ok(reports.length>=1);
 assert.ok(reports.every(f=>f.dId&&f.sId&&!('uId' in f)),'fair-use reports carry device and session ids, no user id');
});
test('The NKJV memory cache never holds more than 499 verses',async()=>{
 const count=()=>calls.filter(p=>p.endsWith('/chapters/PSA.119')).length,psalm=v=>c.call('/api/bible/nkjv?book=PSA&chapter=119&verse='+v),isaiah=()=>c.call('/api/bible/nkjv?book=ISA&chapter=1&verse=1');
 await isaiah();const start=count();
 await psalm(1);await psalm(2);
 assert.equal(count()-start,1,'176 verses after the 400-verse chapter was dropped: Psalm 119 fetched once, then kept');
 await isaiah();await psalm(3);
 assert.equal(count()-start,2,'176 + 400 verses is over 499, so Psalm 119 was dropped and fetched again');
});
test('Next and previous verse cross chapter and book boundaries through the companion',async()=>{
 const get=async p=>{const [,,book,chapter]=p.split('/');return (await c.call('/api/bible/nkjv?book='+book+'&chapter='+chapter)).body;};
 const at=(bookId,chapter,verse)=>({translation:'nkjv',start:{bookId,chapter,verse},end:{bookId,chapter,verse}});
 assert.equal((await adjacentVerse(at('JHN',3,36),1,get)).reference,'John 4:1');
 assert.equal((await adjacentVerse(at('JHN',4,1),-1,get)).reference,'John 3:36');
 assert.equal((await adjacentVerse(at('GEN',50,26),1,get)).reference,'Exodus 1:1');
 const next=await adjacentVerse(at('JHN',3,16),1,get);assert.equal(next.text,'Synthetic JHN 3:17.');assert.equal(next.source.provider,'API.Bible');
});
test('Applying NKJV keeps the show’s highlights and records the provider credit and source',()=>{
 const draft=cleanDraft({...structuredClone(DEFAULT),notes:[{id:'n1',word:'love',meaning:'kept',color:'#ff0000'}]});
 const notes=JSON.stringify(draft.notes);
 applyBiblePassage(draft,{reference:'John 3:16',text:'Synthetic.',verses:[{book_id:'JHN',book:'John',chapter:3,verse:16,text:'Synthetic.'}],copyright:'Synthetic copyright line',source:{provider:'API.Bible',bibleId:BIBLE,fetchedAt:123}},'nkjv');
 assert.equal(JSON.stringify(draft.notes),notes,'highlights unchanged');
 assert.equal(draft.scriptureAttribution,'Synthetic copyright line');assert.equal(draft.translation,'NKJV');
 const saved=cleanDraft(JSON.parse(JSON.stringify(draft)));assert.deepEqual(saved.scriptureSource,{provider:'API.Bible',bibleId:BIBLE,fetchedAt:123});
 assert.deepEqual(saved.verseRange,{translation:'nkjv',start:{bookId:'JHN',chapter:3,verse:16},end:{bookId:'JHN',chapter:3,verse:16}});
 applyBiblePassage(draft,{reference:'John 3:16',text:'x',verses:[]},'kjv');assert.equal(draft.scriptureSource,null);
 assert.equal(cleanScriptureSource({provider:'<script>'}),null);
});
test('A key from WORDLIGHT_API_BIBLE_KEY is the one checked and used; a different pasted key is refused',async()=>{
 const e=await companion(18789,{WORDLIGHT_API_BIBLE_KEY:GOOD});
 try{
  assert.equal((await e.call('/api/bible/status')).body.key,'environment');
  const other=await e.call('/api/bible/connect',{method:'POST',body:{key:NO_NKJV}});assert.equal(other.status,409);assert.match(other.body.error,/WORDLIGHT_API_BIBLE_KEY/);
  const ok=await e.call('/api/bible/connect',{method:'POST',body:{}});assert.equal(ok.status,200);assert.equal(ok.body.ready,true);
  assert.ok(!(await readFile(path.join(e.dir,'api-bible.json'),'utf8')).includes(GOOD),'an environment key is not written to disk');
  assert.equal((await e.call('/api/bible/nkjv?book=JHN&chapter=3&verse=1')).status,200);
  const off=await e.call('/api/bible/disconnect',{method:'POST',body:{}});assert.equal(off.body.ready,false);
 }finally{await e.stop();}
});
test('Disconnect removes the saved key',async()=>{
 const off=await c.call('/api/bible/disconnect',{method:'POST',body:{}});assert.deepEqual([off.body.ready,off.body.key],[false,'none']);
 assert.ok(!(await readFile(path.join(c.dir,'api-bible.json'),'utf8')).includes(GOOD));
 assert.equal((await c.call('/api/bible/nkjv?book=JHN&chapter=3&verse=16')).status,409);
});
