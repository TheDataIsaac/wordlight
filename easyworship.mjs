// EasyWorship 6 and 7 song import: reads the two song databases the operator chose (Songs.db and SongWords.db).
// The reading runs in a worker thread with a time and memory limit, so a very large or damaged database cannot hold up
// the companion, and the screen it serves, while it is read.
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Resolves with {songs, skipped, problems, tooMany} once the worker has finished and closed both files (so they can be deleted).
export function readEasyWorship(folder,{limit,timeoutMs=60000}){
 return new Promise((resolve,reject)=>{
  let result=null,timedOut=false;
  const worker=new Worker(fileURLToPath(import.meta.url),{workerData:{folder,limit},resourceLimits:{maxOldGenerationSizeMb:512}});
  const timer=setTimeout(()=>{timedOut=true;worker.terminate();},timeoutMs);
  worker.on('message',message=>{result=message;});
  worker.on('error',err=>{result=err.code==='ERR_WORKER_OUT_OF_MEMORY'?{outOfMemory:true}:{error:err.message||String(err)};});
  worker.on('exit',()=>{
   clearTimeout(timer);
   // Too slow, or past the worker's memory limit: marked tooBig, so the operator is not told the files are wrong.
   if(timedOut)reject(Object.assign(new Error('reading them took longer than '+Math.round(timeoutMs/1000)+' seconds'),{tooBig:true}));
   else if(result?.outOfMemory)reject(Object.assign(new Error('reading them needed more memory than allowed'),{tooBig:true}));
   else if(!result||result.error)reject(new Error(result?.error||'the reader stopped'));
   else resolve(result);
  });
 });
}

const MAX_WORDS=2_000_000;
if(!isMainThread){
 const {DatabaseSync}=await import('node:sqlite');
 const {fromEasyWorship}=await import('./dist/song-import.mjs');
 let songsDb,wordsDb,result;
 try{
  songsDb=new DatabaseSync(path.join(workerData.folder,'Songs.db'),{readOnly:true});
  wordsDb=new DatabaseSync(path.join(workerData.folder,'SongWords.db'),{readOnly:true});
  // Real tables only: a view under the same name could make every read slow.
  // Ordinary stored tables and columns only. A view, a virtual table or a generated column runs code at every read,
  // and SQLite's own memory is outside this thread's limit, so a crafted file could use them to exhaust the computer.
  const plainTable=(db,name,columns)=>{
   const row=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name);
   if(!row||/^\s*create\s+virtual/i.test(String(row.sql)))return false;
   const kinds=new Map(db.prepare('SELECT name,hidden FROM pragma_table_xinfo(?)').all(name).map(c=>[String(c.name).toLowerCase(),Number(c.hidden)]));
   return columns.every(c=>kinds.get(c)===0);
  };
  if(!plainTable(songsDb,'song',['title','author','copyright','vendor_id'])||!plainTable(wordsDb,'word',['song_id','words']))throw new Error('the song tables are missing or not plain tables');
  // All the words in one pass: EasyWorship has no index on song_id, so a lookup per song would read the whole table
  // once for every song.
  const words=new Map();
  // Words longer than MAX_WORDS (no real song comes close) are left out, and that song is named as skipped.
  const tooLong=new Set();
  for(const row of wordsDb.prepare('SELECT song_id,words FROM word').iterate()){
   if(!row.words||words.has(row.song_id))continue;
   if(String(row.words).length>MAX_WORDS){tooLong.add(row.song_id);continue;}
   words.set(row.song_id,String(row.words));
  }
  // The first few songs left out are named, so the operator knows which to look at.
  const songs=[],problems=[];let skipped=0,tooMany=false;
  const leaveOut=(title,why)=>{skipped++;if(problems.length<10)problems.push((String(title||'').trim().slice(0,80)||'A song without a title')+': '+why);};
  for(const row of songsDb.prepare('SELECT rowid,title,author,copyright,vendor_id FROM song').iterate()){
   if(songs.length>=workerData.limit){tooMany=true;break;}
   const text=words.get(row.rowid);
   if(!text){leaveOut(row.title,tooLong.has(row.rowid)?'its words are too long':'no words');continue;}
   try{const {id,...song}=fromEasyWorship({title:row.title,author:row.author,copyright:row.copyright,ccli:row.vendor_id,words:text});songs.push(song);}
   catch(err){leaveOut(row.title,err.message||'could not be read');}
  }
  result={songs,skipped,problems,tooMany};
 }catch(err){result={error:err.message||String(err)};}
 finally{songsDb?.close();wordsDb?.close();}
 parentPort.postMessage(result);
}
