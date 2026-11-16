// Verse listening: references said out loud, verses read word for word, the one-time download (checked against its
// hash), and the speech process starting, taking audio and stopping. A small script stands in for the real speech
// model, and a local HTTP server for the download sites; folders are throwaway.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {findSpokenReferences,speechTokens} from './dist/spoken-reference.mjs';
import {createListener,sharedWords,QUOTE_SCORE,QUOTE_MARGIN} from './listen.mjs';

const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,ms=4000){for(let i=0;i<ms/20;i++){if(await check())return true;await wait(20);}return false;}
function refs(lines){let context={};const out=[];for(const line of lines){const r=findSpokenReferences(line,context);context=r.context;out.push(r.references.map(x=>x.reference).join(', '));}return out;}

test('Spoken numbers become numbers: tens and units join, hundreds join, two units stay apart',()=>{
 assert.deepEqual(speechTokens('one hundred and nineteen, twenty three, three sixteen'),[119,23,3,16]);
 assert.deepEqual(speechTokens('Romans 8:28'),['romans',8,':',28]);
});

test('References said out loud are found the way preachers say them',()=>{
 assert.deepEqual(refs([
  'Let us open our Bible to Second Corinthians chapter ten, verses three and four.',
  'John three sixteen says for God so loved the world',
  'turn with me to Psalm one hundred and nineteen verse one hundred and five',
  'First John chapter one verse nine',
  'the book of Revelation chapter nineteen verse seven',
  'Isaiah 40:31',
  'Hebrews eleven verse one to three',
 ]),['2 Corinthians 10:3-4','John 3:16','Psalms 119:105','1 John 1:9','Revelation 19:7','Isaiah 40:31','Hebrews 11:1-3']);
});

test('A verse or chapter on its own means the passage already open; ordinary words are not books',()=>{
 assert.deepEqual(refs(['Genesis chapter one','verse two','verse three and four','chapter two verse five']),['Genesis 1:1','Genesis 1:2','Genesis 1:3-4','Genesis 2:5']);
 assert.deepEqual(refs(['I had a good job today and Mark my words','he acts like numbers matter','verse two']),['','','']);
 assert.deepEqual(refs(['John chapter ninety verse one']),[''],'there is no John 90');
 assert.deepEqual(refs(['go to palms twenty three','the romance eight twenty eight']),['Psalms 23:1','Romans 8:28'],'common mishearings');
 const r=findSpokenReferences('Genesis chapter one');
 assert.equal(r.references[0].confidence,75,'a chapter alone is less sure than a full reference');
 assert.equal(findSpokenReferences('John 3:16').references[0].confidence,98);
});

// A stand-in for verse search: scores set per test.
const fakeSearch=results=>({search:async()=>({results,searched:['KJV']})});

test('Shared words count meaningful words once, in any form',()=>{
 assert.equal(sharedWords('the sword of the Spirit which is the word of God','And take the helmet of salvation, and the sword of the Spirit, which is the word of God'),4);
 assert.equal(sharedWords('give it to me give it to me Lord','Give me thy hand, Lord'),2);
 assert.equal(sharedWords('I can do all things through Christ who strengthens me','I can do all things through Christ which strengtheneth me'),5,'strengthens meets strengtheneth');
});

test('Heard words become suggestions: said references, and verses read only when the match is clear',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-listen-'));
 try{
  let listener=createListener({dataDir,search:fakeSearch([])});
  let s=await listener.hear('Let us turn to John chapter three verse sixteen');
  assert.equal(s.suggestions[0].reference,'John 3:16');assert.equal(s.suggestions[0].source,'said');
  s=await listener.hear('verse seventeen');
  assert.equal(s.suggestions[0].reference,'John 3:17','the chapter stays open');
  s=await listener.hear('John three sixteen');
  assert.deepEqual(s.suggestions.map(x=>x.reference),['John 3:16','John 3:17'],'the same verse again moves to the top, once');
  // Read word for word: a clear winner is suggested, a close call is not.
  const verse={reference:'Revelation 19:8',bookId:'REV',chapter:19,verse:8,score:QUOTE_SCORE+0.5,text:'And to her was granted that she should be arrayed in fine linen, clean and white: for the fine linen is the righteousness of saints.'};
  listener=createListener({dataDir,search:fakeSearch([verse,{...verse,reference:'Revelation 3:5',score:QUOTE_SCORE}])});
  s=await listener.hear('to her was granted that she should be arrayed in fine linen clean and white');
  assert.equal(s.suggestions[0].reference,'Revelation 19:8');assert.equal(s.suggestions[0].source,'quoted');
  listener=createListener({dataDir,search:fakeSearch([verse,{...verse,reference:'Revelation 3:5',score:verse.score-QUOTE_MARGIN/2}])});
  assert.equal((await listener.hear('arrayed in fine linen clean and white for the fine linen')).suggestions.length,0,'too close to call');
  listener=createListener({dataDir,search:fakeSearch([{...verse,score:QUOTE_SCORE-0.1}])});
  assert.equal((await listener.hear('arrayed in fine linen clean and white for the fine linen')).suggestions.length,0,'too weak');
  assert.equal((await listener.hear('fine linen')).suggestions.length,0,'too few words to search');
  listener=createListener({dataDir,search:fakeSearch([{...verse,text:'Give me thy hand, I pray thee, Lord.'}])});
  assert.equal((await listener.hear('give it to me give it to me Lord give it to me')).suggestions.length,0,'chanting shares too few words with any verse');
  assert.equal(listener.clear().suggestions.length,0);
 }finally{await rm(dataDir,{recursive:true,force:true});}
});

// The downloads: two small archives made here with tar, served locally with their real hashes.
async function archives(root){
 const made=[];
 for(const [name,files] of [['engine',{'package/index.js':'module.exports=1;'}],['model',{'model-x/tokens.txt':'a 0\n','model-x/encoder.int8.onnx':'x'}]]){
  const src=path.join(root,'src-'+name);
  for(const [file,text] of Object.entries(files)){await mkdir(path.dirname(path.join(src,file)),{recursive:true});await writeFile(path.join(src,file),text);}
  const archive=path.join(root,name+'.tgz'),top=Object.keys(files)[0].split('/')[0];
  const tar=process.platform==='win32'?path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'):'tar';
  assert.equal(spawnSync(tar,['-czf',archive,'-C',src,top]).status,0);
  made.push({name,bytes:await readFile(archive)});
 }
 return made;
}
async function serve(made,{corrupt=''}={}){
 const server=http.createServer((req,res)=>{const item=made.find(m=>req.url==='/'+m.name+'.tgz');if(!item){res.statusCode=404;res.end();return;}res.end(item.name===corrupt?Buffer.from('broken'):item.bytes);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const downloads=made.map(m=>({what:'the '+m.name,url:base+'/'+m.name+'.tgz',size:m.bytes.length,sha256:createHash('sha256').update(m.bytes).digest('hex'),into:m.name==='engine'?'engine/node_modules/sherpa-onnx-node':'model'}));
 return {downloads,close:()=>server.close()};
}

test('The one-time download is checked against its hash, unpacked, and can be removed again',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-listen-'));
 const made=await archives(dataDir);
 const good=await serve(made),bad=await serve(made,{corrupt:'model'});
 try{
  const broken=createListener({dataDir,search:null,downloads:bad.downloads});
  await broken.install();
  assert.ok(await until(()=>!broken.state().installing));
  assert.match(broken.state().error,/does not match its checksum/);
  assert.equal(broken.state().installed,false);
  assert.deepEqual((await readdir(path.join(dataDir,'listen'))).filter(n=>n.startsWith('incoming')),[],'nothing half-unpacked is left');
  const listener=createListener({dataDir,search:null,downloads:good.downloads});
  await listener.install();
  assert.ok(await until(()=>!listener.state().installing));
  assert.equal(listener.state().error,'');
  assert.equal(listener.state().installed,true);
  assert.equal(await readFile(path.join(dataDir,'listen','model','tokens.txt'),'utf8'),'a 0\n');
  assert.ok(existsSync(path.join(dataDir,'listen','engine','node_modules','sherpa-onnx-node','index.js')));
  await listener.remove();
  assert.equal(existsSync(path.join(dataDir,'listen')),false);
 }finally{good.close();bad.close();await rm(dataDir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});

test('Listening starts a speech process, passes it audio, turns its words into suggestions, and stops',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-listen-'));
 // Installed (as far as the listener can tell), with a script in place of the speech model.
 await mkdir(path.join(dataDir,'listen','model'),{recursive:true});
 await writeFile(path.join(dataDir,'listen','model','tokens.txt'),'');
 await writeFile(path.join(dataDir,'listen','installed.json'),'{"version":1}');
 const fake=path.join(dataDir,'fake-worker.mjs');
 await writeFile(fake,"process.send({type:'ready'});let n=0;process.on('message',m=>{if(m.type!=='audio')return;n++;if(n===2)process.send({type:'phrase',text:'Romans chapter eight verse twenty eight',seconds:0.5});process.send({type:'ack'});});process.on('disconnect',()=>process.exit(0));");
 const states=[];
 const listener=createListener({dataDir,search:null,workerFile:fake,workerArgs:[],notify:s=>states.push(s)});
 try{
  assert.throws(()=>listener.audio(Buffer.alloc(8000)),/Listening is off/);
  listener.start();
  assert.ok(await until(()=>listener.state().ready),'the speech process says it is ready');
  listener.audio(Buffer.alloc(8000));listener.audio(Buffer.alloc(8000));
  assert.ok(await until(()=>listener.state().suggestions[0]?.reference==='Romans 8:28'),'its words become a suggestion');
  assert.equal(listener.state().phrases.at(-1).text,'Romans chapter eight verse twenty eight');
  listener.stop();
  assert.equal(listener.state().listening,false);
  assert.equal(listener.state().suggestions.length,1,'suggestions stay after stopping');
  assert.ok(states.length>2,'every change is announced');
 }finally{listener.stop();await rm(dataDir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});

test('A reference split by a pause is still found',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-listen-'));
 try{
  const listener=createListener({dataDir,search:fakeSearch([])});
  await listener.hear('Let us open our Bible to Second Corinthians');
  const s=await listener.hear('chapter ten verses three and four');
  assert.deepEqual(s.suggestions.map(x=>x.reference),['2 Corinthians 10:3-4']);
 }finally{await rm(dataDir,{recursive:true,force:true});}
});

test('A speech process that dies is started again, a few times; one that never starts, or a download that breaks off, stops without stopping Wordlight',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-listen-'));
 await mkdir(path.join(dataDir,'listen','model'),{recursive:true});
 await writeFile(path.join(dataDir,'listen','model','tokens.txt'),'');
 await writeFile(path.join(dataDir,'listen','installed.json'),'{"version":1}');
 const fake=path.join(dataDir,'drops.mjs');
 // Ready, then it drops its connection but keeps running for a moment.
 await writeFile(fake,"process.send({type:'ready'});setTimeout(()=>process.disconnect(),200);setTimeout(()=>{},1500);");
 let free=8e9;
 const listener=createListener({dataDir,search:null,workerFile:fake,workerArgs:[],restartDelays:[50,50,50],restartWaitMs:50,freeMemory:()=>free});
 try{
  listener.start();
  assert.ok(await until(()=>listener.state().ready));
  await wait(260);
  assert.equal(listener.state().listening,true,'still listening while the speech process starts again');
  assert.deepEqual(listener.audio(Buffer.alloc(8000)),{ok:true},'audio is taken (and dropped) meanwhile');
  assert.ok(await until(()=>listener.state().ready),'and it is running again');
  // While memory is short it waits instead of starting again.
  free=5e8;
  assert.ok(await until(()=>listener.state().restarting),'it dies again');
  await wait(400);
  assert.equal(listener.state().restarting,true,'still waiting for memory');
  free=8e9;
  // It keeps dying: after three restarts listening is left off, with the reason.
  assert.ok(await until(()=>!listener.state().listening,8000),'listening ends');
  assert.match(listener.state().error,/stopped 4 times.*short of memory/);
  assert.throws(()=>listener.audio(Buffer.alloc(8000)),/Listening is off/);
 }finally{listener.stop();}
 // One that drops before it was ever ready is not started again.
 const early=path.join(dataDir,'early.mjs');
 await writeFile(early,"setTimeout(()=>process.disconnect(),100);setTimeout(()=>{},1000);");
 const never=createListener({dataDir,search:null,workerFile:early,workerArgs:[]});
 try{
  never.start();
  assert.ok(await until(()=>!never.state().listening),'listening ends');
  assert.match(never.state().error,/stopped unexpectedly/);
 }finally{never.stop();}
 // A download whose connection breaks partway.
 const broken={what:'the model',url:'http://127.0.0.1:9/model.tgz',size:1000,sha256:'0'.repeat(64),into:'model'};
 const request=async()=>({ok:true,status:200,body:new ReadableStream({start(c){c.enqueue(new Uint8Array(10));c.error(new Error('connection reset'));}})});
 const downloader=createListener({dataDir:path.join(dataDir,'other'),search:null,downloads:[broken],request});
 await downloader.install();
 assert.ok(await until(()=>!downloader.state().installing));
 assert.match(downloader.state().error,/stopped: connection reset/);
 assert.equal(downloader.state().installed,false);
 await rm(dataDir,{recursive:true,force:true,maxRetries:5,retryDelay:200});
});

test('Listening lifecycle: Stop during a restart, the quiet stop, a quick Stop and Start, and Remove during a restart',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-listen-'));
 await mkdir(path.join(dataDir,'listen','model'),{recursive:true});
 await writeFile(path.join(dataDir,'listen','model','tokens.txt'),'');
 await writeFile(path.join(dataDir,'listen','installed.json'),'{"version":1}');
 // steady: runs until its connection closes. dies: runs for 150 ms, then crashes.
 const steady=path.join(dataDir,'steady.mjs'),dies=path.join(dataDir,'dies.mjs');
 await writeFile(steady,"process.send({type:'ready'});process.on('message',m=>{if(m.type==='audio')process.send({type:'ack'});});process.on('disconnect',()=>process.exit(0));");
 await writeFile(dies,"process.send({type:'ready'});setTimeout(()=>process.exit(1),150);");
 const make=(workerFile,options={})=>createListener({dataDir,search:null,workerFile,workerArgs:[],freeMemory:()=>8e9,...options});
 const listeners=[];const use=l=>{listeners.push(l);return l;};
 try{
  // Stop while waiting to start again: nothing starts afterwards.
  let l=use(make(dies,{restartDelays:[300]}));
  l.start();assert.ok(await until(()=>l.state().restarting),'it died and waits to start again');
  l.stop();
  assert.deepEqual([l.state().listening,l.state().restarting],[false,false]);
  await wait(500);assert.equal(l.state().listening,false,'and nothing started later');
  // The quiet stop: audio keeps listening on; when the studio stops sending, listening ends, without an error.
  l=use(make(steady,{quietMs:300}));
  l.start();assert.ok(await until(()=>l.state().ready));
  for(let i=0;i<6;i++){l.audio(Buffer.alloc(8000));await wait(100);}
  assert.equal(l.state().listening,true,'audio keeps it on');
  assert.ok(await until(()=>!l.state().listening,1500),'silence stops it');
  assert.equal(l.state().error,'');
  // The quiet stop also ends a pending restart.
  l=use(make(dies,{restartDelays:[800],quietMs:300}));
  l.start();assert.ok(await until(()=>l.state().restarting));
  assert.ok(await until(()=>!l.state().listening,1500),'the studio is gone, so it stops');
  await wait(900);assert.equal(l.state().listening,false,'and the restart never happens');
  // A quick Stop and Start: the old process ending does not touch the new one.
  l=use(make(steady));
  l.start();assert.ok(await until(()=>l.state().ready));
  l.stop();l.start();
  assert.ok(await until(()=>l.state().ready),'the new one runs');
  await wait(300);assert.deepEqual([l.state().listening,l.state().ready,l.state().error],[true,true,'']);
  l.stop();
  // Remove while waiting to start again: everything stops and listening needs downloading again.
  l=use(make(dies,{restartDelays:[300]}));
  l.start();assert.ok(await until(()=>l.state().restarting));
  await l.remove();
  assert.deepEqual([l.state().listening,l.state().restarting,l.state().installed],[false,false,false]);
  await wait(400);assert.equal(l.state().listening,false);
  assert.throws(()=>l.start(),/Download verse listening first/);
 }finally{for(const l of listeners)l.stop();await rm(dataDir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
