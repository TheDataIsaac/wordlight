// Native song library: runs the real companion on test ports with throwaway folders, one with a FreeShow-shaped
// library and one without FreeShow.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {newSong,editSong} from './dist/songs.mjs';
const cwd=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const servers=[];let dir;
async function start(port,env){
 const child=spawn(process.execPath,['server.mjs'],{cwd,env:{...process.env,WORDLIGHT_PORT:String(port),...env},stdio:'ignore'});servers.push(child);
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:'+port+'/api/songs/categories')).status<500)break;}catch{}await new Promise(r=>setTimeout(r,100));}
}
const api=port=>async(p,{method='GET',body}={})=>{const r=await fetch('http://127.0.0.1:'+port+p,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
const withFs=api(18785),noFs=api(18786);
const song=(title,lyrics='[Verse 1]\nHello')=>editSong(newSong(title),{lyrics,arrangement:'Verse 1'});
const freeShowShow=['fs-1',{name:'Amazing Grace',category:'cat1',settings:{},timestamps:{modified:1},meta:{},slides:{v1:{group:'Verse',globalGroup:'verse',items:[{lines:[{text:[{value:'Amazing grace'}]}]}]}},layouts:{L1:{name:'Default',slides:[{id:'v1'}]}}}];
before(async()=>{
 dir=await mkdtemp(path.join(tmpdir(),'wordlight-songlib-test-'));const shows=path.join(dir,'Shows');await mkdir(shows);await mkdir(path.join(dir,'Config'));
 await writeFile(path.join(dir,'shows.json'),JSON.stringify({'fs-1':{name:'Amazing Grace',category:'cat1',timestamps:{modified:1}}}));
 await writeFile(path.join(dir,'Config','settings_synced.json'),JSON.stringify({categories:{cat1:{name:'Hymns'}}}));
 await writeFile(path.join(shows,'Amazing Grace.show'),JSON.stringify(freeShowShow));
 await start(18785,{WORDLIGHT_DATA_DIR:path.join(dir,'data'),WORDLIGHT_FREESHOW_INDEX:path.join(dir,'shows.json'),WORDLIGHT_FREESHOW_SHOWS:shows,WORDLIGHT_FREESHOW_DATA:dir});
 await start(18786,{WORDLIGHT_DATA_DIR:path.join(dir,'data-alone'),WORDLIGHT_FREESHOW_INDEX:path.join(dir,'missing.json'),WORDLIGHT_FREESHOW_SHOWS:path.join(dir,'missing'),WORDLIGHT_FREESHOW_DATA:path.join(dir,'missing')});
});
after(async()=>{for(const s of servers)s.kill();await new Promise(r=>setTimeout(r,200));await rm(dir,{recursive:true,force:true});});
test('Saving: a new song gets a wl- id, an update needs the modified time last seen, and a stale save is refused',async()=>{
 const created=await withFs('/api/songs/library',{method:'POST',body:{song:song('Grace Alone')}});
 assert.equal(created.status,201);assert.match(created.body.id,/^wl-/);assert.equal(created.body.song.source.app,'wordlight');assert.equal(created.body.song.source.modified,created.body.modified);
 const opened=await withFs('/api/songs/item?id='+created.body.id);assert.equal(opened.body.song.title,'Grace Alone');assert.equal(opened.body.modified,created.body.modified);
 const changed=editSong(opened.body.song,{title:'Grace Alone (v2)',lyrics:'[Verse 1]\nChanged',arrangement:'Verse 1'});
 const updated=await withFs('/api/songs/library',{method:'POST',body:{song:changed,expectedModified:opened.body.modified}});
 assert.equal(updated.status,200);assert.equal(updated.body.id,created.body.id);assert.ok(updated.body.modified>created.body.modified);
 const stale=await withFs('/api/songs/library',{method:'POST',body:{song:{...changed,title:'Old tab'},expectedModified:opened.body.modified}});
 assert.equal(stale.status,409);assert.equal(stale.body.modified,updated.body.modified);
 assert.equal((await withFs('/api/songs/item?id='+created.body.id)).body.song.title,'Grace Alone (v2)','the refused save changed nothing');
 assert.equal((await withFs('/api/songs/library',{method:'POST',body:{song:{title:''}}})).status,400);
});
test('Concurrent saves keep every song in the index',async()=>{
 const results=await Promise.all(Array.from({length:8},(_,i)=>withFs('/api/songs/library',{method:'POST',body:{song:song('Parallel '+i)}})));
 assert.ok(results.every(r=>r.status===201));
 const index=JSON.parse(await readFile(path.join(dir,'data','songs','index.json'),'utf8'));
 for(const r of results)assert.ok(index.some(e=>e.id===r.body.id));
});
test('Search merges the library with FreeShow, filters by source, and never writes FreeShow files',async()=>{
 const before=await readFile(path.join(dir,'Shows','Amazing Grace.show'),'utf8'),indexBefore=await readFile(path.join(dir,'shows.json'),'utf8');
 const all=await withFs('/api/songs?q=grace');assert.deepEqual(all.body.items.map(s=>[s.name,s.source]).sort(),[['Amazing Grace','freeshow'],['Grace Alone (v2)','wordlight']]);
 assert.equal(all.body.freeshow,1);assert.ok(all.body.native>=9);
 assert.deepEqual((await withFs('/api/songs?q=grace&source=wordlight')).body.items.map(s=>s.name),['Grace Alone (v2)']);
 assert.deepEqual((await withFs('/api/songs?q=grace&source=freeshow')).body.items.map(s=>s.name),['Amazing Grace']);
 assert.ok(all.body.items.every(s=>!('folded' in s)&&!('sections' in s)),'results carry metadata only');
 const fs=await withFs('/api/songs/item?id=fs-1');assert.equal(fs.status,200);
 assert.equal((await withFs('/api/songs/library',{method:'POST',body:{song:fs.body.song}})).status,201,'a FreeShow song saved to the library becomes a new library song');
 assert.equal(await readFile(path.join(dir,'Shows','Amazing Grace.show'),'utf8'),before);assert.equal(await readFile(path.join(dir,'shows.json'),'utf8'),indexBefore);
 assert.deepEqual(await readdir(path.join(dir,'Shows')),['Amazing Grace.show']);
});
test('Without FreeShow the library still works and says FreeShow was not found',async()=>{
 const empty=await noFs('/api/songs');assert.equal(empty.status,200);assert.equal(empty.body.freeshow,null);assert.equal(empty.body.total,0);
 const saved=await noFs('/api/songs/library',{method:'POST',body:{song:song('On its own')}});assert.equal(saved.status,201);
 assert.deepEqual((await noFs('/api/songs')).body.items.map(s=>s.name),['On its own']);
 assert.equal((await noFs('/api/songs/item?id=fs-1')).status,404);
});
test('Export and import: existing ids are skipped, other songs added, bad files refused',async()=>{
 const exported=await withFs('/api/songs/library/export');assert.equal(exported.body.format,'wordlight-song-library');assert.ok(exported.body.songs.length>=10);
 const again=await withFs('/api/songs/library/import',{method:'POST',body:exported.body});assert.deepEqual([again.body.added,again.body.skipped],[0,exported.body.songs.length]);
 const into=await noFs('/api/songs/library/import',{method:'POST',body:exported.body});assert.equal(into.body.added,exported.body.songs.length);
 assert.equal((await noFs('/api/songs/library/import',{method:'POST',body:{format:'other',songs:[]}})).status,400);
 const mixed=await noFs('/api/songs/library/import',{method:'POST',body:{format:'wordlight-song-library',version:1,songs:[{title:''},song('Fresh')]}});
 assert.equal(mixed.body.added,1);assert.equal(mixed.body.errors.length,1);
});
test('Import keeps library ids: the same file twice adds once, and repeats within one file are skipped',async()=>{
 const file={format:'wordlight-song-library',version:1,songs:[{...song('Identity'),id:'wl-identity-12345678'}]};
 const first=await noFs('/api/songs/library/import',{method:'POST',body:file});assert.deepEqual([first.body.added,first.body.skipped,first.body.failed],[1,0,0]);
 const second=await noFs('/api/songs/library/import',{method:'POST',body:file});assert.deepEqual([second.body.added,second.body.skipped,second.body.failed],[0,1,0]);
 assert.deepEqual((await noFs('/api/songs?q=identity')).body.items.map(s=>s.id),['wl-identity-12345678']);
 const twice={...file,songs:[{...song('Twice'),id:'wl-twice-12345678'},{...song('Twice again'),id:'wl-twice-12345678'},{title:''}]};
 const repeat=await noFs('/api/songs/library/import',{method:'POST',body:twice});assert.deepEqual([repeat.body.added,repeat.body.skipped,repeat.body.failed],[1,1,1]);
 assert.equal((await noFs('/api/songs?q=twice')).body.total,1);
});
test('An import over the library limit is refused whole',async()=>{
 const before=(await noFs('/api/songs')).body.native,tiny=song('Bulk');
 const big=await noFs('/api/songs/library/import',{method:'POST',body:{format:'wordlight-song-library',version:1,songs:Array.from({length:5000},()=>({...tiny,id:undefined}))}});
 assert.equal(big.status,409);assert.match(big.body.error,/Nothing was imported/);assert.equal(big.body.added,0);
 assert.equal((await noFs('/api/songs')).body.native,before);
 assert.equal((await readdir(path.join(dir,'data-alone','songs'))).filter(f=>f.endsWith('.json')&&f!=='index.json').length,before,'no song files were left behind');
});
test('A malformed FreeShow index does not stop the library, and My library never reads FreeShow',async()=>{
 const index=path.join(dir,'shows.json'),good=await readFile(index,'utf8');await writeFile(index,'{malformed');
 try{
  const mine=await withFs('/api/songs?source=wordlight&q=grace');assert.equal(mine.status,200);assert.ok(!('freeshow' in mine.body),'FreeShow counts are left out');assert.ok(mine.body.items.length&&mine.body.items.every(s=>s.source==='wordlight'));
  const all=await withFs('/api/songs?q=grace');assert.equal(all.status,200);assert.equal(all.body.freeshow,null);assert.match(all.body.freeshowError,/could not be read/);
  const cats=await withFs('/api/songs/categories');assert.equal(cats.status,200);assert.equal(cats.body.categories[0].name,'Wordlight library');
  assert.equal((await withFs('/api/songs/item?id='+mine.body.items.find(s=>s.name==='Grace Alone (v2)').id)).status,200,'a library song opens without FreeShow');
  assert.equal((await withFs('/api/songs/item?id=fs-1')).status,500);
 }finally{await writeFile(index,good);}
 assert.equal((await withFs('/api/songs?q=amazing&source=freeshow')).body.items.length,1,'FreeShow is back once its index is readable');
});
test('When the index cannot be written, saves, imports and removes change nothing',async()=>{
 const {chmod}=await import('node:fs/promises');
 const songs=path.join(dir,'data','songs'),index=path.join(songs,'index.json');
 const id=(await withFs('/api/songs?source=wordlight&q=grace')).body.items.find(s=>s.name==='Grace Alone (v2)').id,opened=await withFs('/api/songs/item?id='+id),fileBefore=await readFile(path.join(songs,id+'.json'),'utf8');
 const listing=async()=>(await readdir(songs)).filter(f=>f!=='removed').sort(),filesBefore=await listing();
 await chmod(index,0o444);
 try{
  const update=await withFs('/api/songs/library',{method:'POST',body:{song:{...opened.body.song,title:'Not saved'},expectedModified:opened.body.modified}});
  assert.equal(update.status,500);assert.equal(await readFile(path.join(songs,id+'.json'),'utf8'),fileBefore,'the previous song file is put back');
  assert.equal((await withFs('/api/songs/library',{method:'POST',body:{song:song('Not new')}})).status,500);
  assert.equal((await withFs('/api/songs/library/import',{method:'POST',body:{format:'wordlight-song-library',version:1,songs:[song('Not imported')]}})).status,500);
  assert.equal((await withFs('/api/songs/library/'+id,{method:'DELETE'})).status,500);
  assert.deepEqual(await listing(),filesBefore,'no new, missing or moved song files, and no temporary files');
 }finally{await chmod(index,0o666);}
 assert.equal((await withFs('/api/songs/item?id='+id)).body.song.title,'Grace Alone (v2)');
 // A song file that cannot be moved aside is kept listed.
 await mkdir(path.join(songs,'removed',id+'.json'),{recursive:true});
 assert.equal((await withFs('/api/songs/library/'+id,{method:'DELETE'})).status,500);
 assert.equal((await withFs('/api/songs/item?id='+id)).status,200,'still in the library with its file');
 await rm(path.join(songs,'removed',id+'.json'),{recursive:true});
 assert.equal((await withFs('/api/songs/library/'+id,{method:'DELETE'})).status,200);
});
test('Remove moves the song file aside; a damaged index is kept and reported',async()=>{
 const id=(await noFs('/api/songs?q=fresh')).body.items[0].id;
 assert.equal((await noFs('/api/songs/library/'+id,{method:'DELETE'})).status,200);
 assert.equal((await noFs('/api/songs/item?id='+id)).status,404);assert.equal((await noFs('/api/songs/library/'+id,{method:'DELETE'})).status,404);
 assert.ok((await readdir(path.join(dir,'data-alone','songs','removed'))).includes(id+'.json'));
 assert.equal((await noFs('/api/songs/library/..%2Fevil',{method:'DELETE'})).status,404);
 const file=path.join(dir,'data-alone','songs','index.json');await writeFile(file,'{damaged');
 const list=await noFs('/api/songs');assert.equal(list.status,500);assert.match(list.body.error,/damaged/);
 assert.equal((await noFs('/api/songs/library',{method:'POST',body:{song:song('After damage')}})).status,500);
 assert.equal(await readFile(file,'utf8'),'{damaged');assert.equal(await readFile(file+'.damaged','utf8'),'{damaged');
});
