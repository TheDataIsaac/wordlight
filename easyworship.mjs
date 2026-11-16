// EasyWorship 6 and 7 song import: reads the two song databases the operator chose (Songs.db and SongWords.db).
// The reading runs in a worker thread with a time and memory limit, so a very large or damaged database cannot hold up
// the companion, and the screen it serves, while it is read.
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Resolves with {songs, skipped, tooMany} once the worker has finished and closed both files (so they can be deleted).
export function readEasyWorship(folder,{limit,timeoutMs=60000}){
 return new Promise((resolve,reject)=>{
  let result=null,timedOut=false;
  const worker=new Worker(fileURLToPath(import.meta.url),{workerData:{folder,limit},resourceLimits:{maxOldGenerationSizeMb:512}});
  const timer=setTimeout(()=>{timedOut=true;worker.terminate();},timeoutMs);
  worker.on('message',message=>{result=message;});
  worker.on('error',err=>{result={error:err.message||String(err)};});
  worker.on('exit',()=>{
   clearTimeout(timer);
   if(timedOut)reject(new Error('reading them took longer than '+Math.round(timeoutMs/1000)+' seconds'));
   else if(!result||result.error)reject(new Error(result?.error||'the reader stopped'));
   else resolve(result);
  });
 });
}

if(!isMainThread){
 const {DatabaseSync}=await import('node:sqlite');
 const {fromEasyWorship}=await import('./dist/song-import.mjs');
 let songsDb,wordsDb,result;
 try{
  songsDb=new DatabaseSync(path.join(workerData.folder,'Songs.db'),{readOnly:true});
  wordsDb=new DatabaseSync(path.join(workerData.folder,'SongWords.db'),{readOnly:true});
  // Real tables only: a view under the same name could make every read slow.
  const isTable=(db,name)=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  if(!isTable(songsDb,'song')||!isTable(wordsDb,'word'))throw new Error('the song tables are missing');
  // All the words in one pass: EasyWorship has no index on song_id, so a lookup per song would read the whole table
  // once for every song.
  const words=new Map();
  for(const row of wordsDb.prepare('SELECT song_id,words FROM word').iterate())if(row.words&&!words.has(row.song_id))words.set(row.song_id,String(row.words));
  const songs=[];let skipped=0,tooMany=false;
  for(const row of songsDb.prepare('SELECT rowid,title,author,copyright,vendor_id FROM song').iterate()){
   if(songs.length>=workerData.limit){tooMany=true;break;}
   const text=words.get(row.rowid);
   if(!text){skipped++;continue;}
   try{const {id,...song}=fromEasyWorship({title:row.title,author:row.author,copyright:row.copyright,ccli:row.vendor_id,words:text});songs.push(song);}
   catch{skipped++;}
  }
  result={songs,skipped,tooMany};
 }catch(err){result={error:err.message||String(err)};}
 finally{songsDb?.close();wordsDb?.close();}
 parentPort.postMessage(result);
}
