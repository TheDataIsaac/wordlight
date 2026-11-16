// Verse listening, in the local studio and only when the operator turns it on. The studio captures the sound desk's
// feed and posts it here; speech recognition runs in a separate low-priority process (listen-worker.mjs); this module
// finds Bible references said out loud and verses read word for word, and offers them to the operator. Nothing goes on
// screen by itself: a suggestion is clicked into the preview, then sent like any other verse.
//
// The speech engine (sherpa-onnx) and model (NVIDIA Nemotron streaming English, int8) are downloaded once, about 475 MB,
// each checked against the SHA-256 written below, into <data>/listen. No audio and no words leave this computer.
// English only: the interpreter's Yoruba is heard as noise and ignored.
import {spawn,fork} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createWriteStream,existsSync} from 'node:fs';
import {mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {findSpokenReferences} from './dist/spoken-reference.mjs';
import {wordKey,SMALL_WORDS} from './dist/verse-search.mjs';

const MODEL='sherpa-onnx-nemotron-speech-streaming-en-0.6b-560ms-int8-2026-04-25';
export const LISTEN_DOWNLOADS=[
 {what:'the speech engine',url:'https://registry.npmjs.org/sherpa-onnx-node/-/sherpa-onnx-node-2.0.1.tgz',size:12709,
  sha256:'06ef8dfb9ea0f3cc77c1866620cbe05bf11b7dd70a973a454b77ce4a66cbcee1',into:'engine/node_modules/sherpa-onnx-node'},
 {what:'the speech engine for Windows',url:'https://registry.npmjs.org/sherpa-onnx-win-x64/-/sherpa-onnx-win-x64-2.0.1.tgz',size:8779375,
  sha256:'217cec234c6026dbfd2b9c06523507180796fe4227c7cc9d11cfe218260a2519',into:'engine/node_modules/sherpa-onnx-win-x64'},
 {what:'the speech model',url:'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/'+MODEL+'.tar.bz2',size:463945051,
  sha256:'78e2b79fcf7271553a74402a76b771b09ea40117a39566a79f52235b23db6358',into:'model'},
];
const INSTALLED_VERSION=1;
// A verse read word for word: verse search's score for the words heard (see bible-search.mjs) must reach QUOTE_SCORE,
// beat the next verse by QUOTE_MARGIN, and share at least QUOTE_SHARED meaningful words with it. The last rule keeps
// prayer and chanting ("give it to me, Lord") from matching a verse. Chosen on two recorded sermons with
// tools/listen-eval (see README, Verse listening).
export const QUOTE_SCORE=1.0,QUOTE_MARGIN=0.25,QUOTE_SHARED=4;
// Distinct meaningful words (not "the", "and", "you"…) that the words heard and a verse have in common, compared by
// verse search's word key so "strengthens" meets "strengtheneth".
export function sharedWords(heard,verse){
 const keys=text=>new Set(String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z ]/g,' ').split(/\s+/)
  .filter(w=>w.length>2&&!SMALL_WORDS.has(w)).map(wordKey));
 const inVerse=keys(verse);
 return [...keys(heard)].filter(k=>inVerse.has(k)).length;
}
const QUOTE_WORDS=24,KEEP_PHRASES=12,KEEP_SUGGESTIONS=8,SAME_VERSE_MS=90000,QUIET_STOP_MS=20000,MAX_BEHIND=12;
// A speech process that was running and then dies (Windows ends it when the computer runs out of memory) is started
// again after a growing wait (RESTART_DELAYS), up to that many times in RESTART_WINDOW_MS; after that listening stays
// off with a reason. While less than RESTART_FREE_BYTES of memory is free it waits longer, so the restart does not
// take memory OBS needs: missing verse suggestions costs less than dropped frames on the stream.
const RESTART_DELAYS=[5000,30000,120000],RESTART_WINDOW_MS=10*60000,RESTART_FREE_BYTES=1.2e9,RESTART_WAIT_MS=15000;
const fail=(status,message)=>Object.assign(new Error(message),{status});

// workerFile and workerArgs let tests stand in for the speech process.
// restartDelays, restartWaitMs, quietMs and freeMemory let tests run restarts and the quiet stop quickly, and pretend
// memory is short.
export function createListener({dataDir,search,notify=()=>{},request=fetch,downloads=LISTEN_DOWNLOADS,workerFile=fileURLToPath(new URL('./listen-worker.mjs',import.meta.url)),workerArgs=null,
 restartDelays=RESTART_DELAYS,restartWaitMs=RESTART_WAIT_MS,quietMs=QUIET_STOP_MS,freeMemory=os.freemem}){
 const folder=path.join(dataDir,'listen'),marker=path.join(folder,'installed.json');
 let installing=null,progress=null,error='',worker=null,ready=false,behind=0,skipped=false,quietTimer=null,startedAt=0;
 let restartTimer=null,restarts=[],ranOnce=false,waitingForMemory=false;
 let phrases=[],partial='',suggestions=[],context={},heard=0;

 const installed=()=>existsSync(marker)&&existsSync(path.join(folder,'model','tokens.txt'));
 function state(){
  return {installed:installed(),installing:!!installing,progress,error,listening:!!worker||!!restartTimer,restarting:!!restartTimer,waitingForMemory,ready,skipped,
   downloadMB:Math.round(downloads.reduce((n,d)=>n+d.size,0)/1e6),phrases:phrases.slice(-KEEP_PHRASES),partial,suggestions};
 }
 const changed=()=>notify(state());

 // Download one file to disk, hashing as it arrives, and refuse it unless the hash matches.
 async function download(item,file){
  let response;
  try{response=await request(item.url,{signal:AbortSignal.timeout(30*60000)});}catch{throw fail(502,'Could not download '+item.what+'. Check the internet connection.');}
  if(!response.ok||!response.body)throw fail(502,'The download of '+item.what+' failed ('+response.status+').');
  const hash=createHash('sha256');let got=0;
  // One pipeline from the network to the file, so a full disk or a dropped connection becomes an error here
  // instead of an unhandled stream error that would stop the companion.
  const check=new Transform({transform(chunk,encoding,done){
   hash.update(chunk);got+=chunk.length;
   if(got>item.size*1.05){done(fail(422,item.what+' is larger than expected, so it was not used.'));return;}
   progress={what:item.what,doneMB:Math.round((progress.baseMB*1e6+got)/1e6),totalMB:progress.totalMB,baseMB:progress.baseMB};
   if(got%(8*1024*1024)<chunk.length)changed();
   done(null,chunk);
  }});
  try{await pipeline(Readable.fromWeb(response.body),check,createWriteStream(file));}
  catch(err){throw err.status?err:fail(500,err.code==='ENOSPC'?'The disk is full, so '+item.what+' could not be saved.':'The download of '+item.what+' stopped: '+(err.message||err));}
  if(hash.digest('hex')!==item.sha256)throw fail(422,item.what+' does not match its checksum, so it was not used.');
 }
 // The archives are .tgz (engine) and .tar.bz2 (model); Windows 10 and later have tar.exe for both.
 function untar(archive,target){
  const tar=process.platform==='win32'?path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'):'tar';
  return new Promise((resolve,reject)=>{
   const child=spawn(tar,['-xf',archive,'-C',target,'--strip-components','1'],{windowsHide:true,stdio:'ignore'});
   child.on('error',()=>reject(fail(500,'Could not unpack the download (tar is missing).')));
   child.on('exit',code=>code===0?resolve():reject(fail(500,'Could not unpack the download.')));
  });
 }
 async function install(){
  if(installed())return state();
  if(installing)return state();
  error='';
  const totalMB=Math.round(downloads.reduce((n,d)=>n+d.size,0)/1e6),temp=path.join(folder,'incoming-'+Date.now());
  installing=(async()=>{
   try{
    await mkdir(temp,{recursive:true});let baseMB=0;
    for(const item of downloads){
     progress={what:item.what,doneMB:baseMB,totalMB,baseMB};changed();
     const archive=path.join(temp,path.basename(new URL(item.url).pathname));
     await download(item,archive);
     const target=path.join(temp,item.into);await mkdir(target,{recursive:true});
     await untar(archive,target);await rm(archive,{force:true});
     baseMB+=item.size/1e6;
    }
    for(const part of ['engine','model']){await rm(path.join(folder,part),{recursive:true,force:true});await rename(path.join(temp,part),path.join(folder,part));}
    await writeFile(path.join(folder,'engine','package.json'),'{"private":true}');
    await writeFile(marker,JSON.stringify({version:INSTALLED_VERSION,model:MODEL,installedAt:Date.now()}));
   }catch(err){error=err.message||'The download failed.';}
   finally{await rm(temp,{recursive:true,force:true}).catch(()=>{});installing=null;progress=null;changed();}
  })();
  changed();
  return state();
 }
 async function remove(){
  stop();if(installing)throw fail(409,'Wait for the download to finish.');
  await rm(folder,{recursive:true,force:true});changed();return state();
 }

 function start(){
  if(!installed())throw fail(409,'Download verse listening first.');
  if(worker||restartTimer)return state();
  restarts=[];ranOnce=false;error='';
  launch();quiet();changed();
  return state();
 }
 function launch(){
  const args=workerArgs||[path.join(folder,'engine'),path.join(folder,'model'),'1'];
  worker=fork(workerFile,args,{serialization:'advanced',stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
  ready=false;behind=0;skipped=false;partial='';startedAt=Date.now();
  // Below normal, so OBS and the screen always come first; when the computer is busy the words arrive a little later.
  try{os.setPriority(worker.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}
  const mine=worker;
  mine.stderr?.on('data',()=>{});
  mine.on('message',message=>{if(worker===mine)receive(message);});
  // However the speech process ends (exit, lost connection, failure to start), nothing it does can stop the companion.
  // Once listening has worked this session, a process that dies is started again (see RESTART_DELAYS) while the studio
  // keeps sending audio; the quiet timer still stops everything if the studio goes away. Otherwise listening stops.
  const ended=message=>{
   if(worker!==mine)return;
   worker=null;ready=false;try{mine.kill();}catch{}
   const now=Date.now();restarts=restarts.filter(t=>now-t<RESTART_WINDOW_MS);
   if(message&&ranOnce&&restarts.length<restartDelays.length){
    restarts.push(now);partial='';
    restartLater(restartDelays[restarts.length-1]);
   }else if(message){
    giveUp(ranOnce?'Listening stopped '+(restartDelays.length+1)+' times in a few minutes, so it was left off. The computer may be short of memory: close other programs, then start it again.':message);
   }else clearTimeout(quietTimer);
   changed();
  };
  mine.on('exit',(code,signal)=>ended(code||signal?'Listening stopped unexpectedly. Start it again.':''));
  mine.on('disconnect',()=>ended('Listening stopped unexpectedly. Start it again.'));
  mine.on('error',()=>ended('The speech process could not run. Start listening again.'));
 }
 function restartLater(ms){
  restartTimer=setTimeout(()=>{
   restartTimer=null;
   if(freeMemory()<RESTART_FREE_BYTES){waitingForMemory=true;restartLater(restartWaitMs);changed();return;}
   waitingForMemory=false;
   // fork can throw when the computer is out of memory; that must not stop the companion.
   try{launch();}catch{giveUp('The speech process could not start again. The computer may be short of memory: close other programs, then start listening again.');}
   changed();
  },ms);
  restartTimer.unref?.();
 }
 function giveUp(message){clearTimeout(quietTimer);error=message;}
 function stop(){
  clearTimeout(quietTimer);clearTimeout(restartTimer);restartTimer=null;waitingForMemory=false;
  if(worker){const w=worker;worker=null;ready=false;w.kill();}
  partial='';changed();return state();
 }
 // The studio sends audio while it listens. If it stops (closed, refreshed), listening stops after a short while.
 function quiet(){clearTimeout(quietTimer);quietTimer=setTimeout(stop,quietMs);quietTimer.unref?.();}
 function audio(buffer){
  if(!worker&&!restartTimer)throw fail(409,'Listening is off.');
  quiet();
  // While the speech process starts again, audio is dropped.
  if(!worker)return {ok:true};
  if(!ready)return {ok:true};
  // If recognition falls more than about 3 s behind, new audio is skipped rather than queued, so it catches up.
  if(behind>=MAX_BEHIND){if(!skipped){skipped=true;changed();}return {ok:true,skipped:true};}
  if(!worker.connected){worker.emit('disconnect');throw fail(409,'Listening is off.');}
  const mine=worker;behind++;
  mine.send({type:'audio',samples:buffer},err=>{if(err&&worker===mine)mine.emit('disconnect');});
  return {ok:true};
 }
 function receive(message){
  // Running again after a restart: an error from before no longer applies.
  if(message.type==='ready'){ready=true;ranOnce=true;error='';changed();return;}
  if(message.type==='ack'){behind=Math.max(0,behind-1);if(skipped&&behind===0){skipped=false;changed();}return;}
  if(message.type==='error'){error=message.message;changed();return;}
  if(message.type==='partial'){partial=message.text;changed();return;}
  if(message.type==='phrase'){partial='';hear(message.text).catch(()=>{});}
 }
 // A finished phrase: references said in it, then verses quoted in it (with the phrase before, for long verses).
 async function hear(text){
  const at=Date.now();heard++;
  const previous=phrases.at(-1)?.text||'';
  phrases.push({text,at});phrases=phrases.slice(-KEEP_PHRASES);
  // A pause can split a reference ("…to Second Corinthians" | "chapter ten, verses three and four"), so the previous
  // phrase is read again with this one. A reference found twice is merged by suggest(). context is the passage open
  // before the previous phrase.
  const said=findSpokenReferences((previous+' '+text).trim(),context);
  context=findSpokenReferences(previous,context).context;
  for(const ref of said.references)suggest({...ref,source:'said',at});
  const words=phrases.slice(-2).map(p=>p.text).join(' ').split(/\s+/).slice(-QUOTE_WORDS).join(' ');
  if(search&&words.split(' ').length>=6){
   try{
    const found=await search.search(words),[top,second]=found.results;
    if(top&&top.score>=QUOTE_SCORE&&top.score-(second?.score||0)>=QUOTE_MARGIN&&sharedWords(words,top.text)>=QUOTE_SHARED){
     suggest({reference:top.reference,bookId:top.bookId,chapter:top.chapter,verse:top.verse,endVerse:top.verse,
      confidence:Math.min(95,Math.round(40+top.score*25)),kind:'quoted',heard:words,source:'quoted',at});
    }
   }catch{}
  }
  changed();
 }
 // Newest first. The same verse heard again within 90 s moves to the top instead of appearing twice.
 function suggest(item){
  const index=suggestions.findIndex(s=>s.reference===item.reference&&item.at-s.at<SAME_VERSE_MS);
  if(index>=0){const old=suggestions.splice(index,1)[0];item={...item,confidence:Math.max(old.confidence,item.confidence),source:old.source==='said'?'said':item.source};}
  suggestions.unshift({id:item.at.toString(36)+'-'+suggestions.length,...item});
  suggestions=suggestions.slice(0,KEEP_SUGGESTIONS);
 }
 function clear(){suggestions=[];phrases=[];partial='';context={};error='';changed();return state();}
 return {state,install,remove,start,stop,audio,clear,
  // For tests and the studio: feed words as if they were heard.
  hear:text=>hear(text).then(state)};
}
