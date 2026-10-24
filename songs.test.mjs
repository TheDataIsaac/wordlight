// Song import and song slides. Fixtures are synthetic but follow FreeShow's real file structure ([id, show]).
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {freeShowToSong,cleanSong,songSlides,songCredit,searchSongs,foldText,SONG_LIMITS} from './dist/songs.mjs';
import {DEFAULT,cleanDraft,makeDeck,deckFor,snapshot,validLive} from './dist/core.mjs';
import {cleanLibrary,createShow,activeShow,copyShow,mergeShows,addScene,switchScene,sceneDraft,slideGroups,removeGroups,copyGroups,removeSlides,copySlides,moveGroups,groupKey} from './dist/library.mjs';
import {lowerThirdContent} from './dist/lowerthird.mjs';
const run=(text)=>({value:text,style:''});
const item=(lines,language='')=>({type:'text',language,align:'',style:'',lines:lines.map(l=>({align:'',text:[run(l)]}))});
// Verse 1 has two continuation pages, Chorus one page, Bridge a blank cue; the layout repeats the chorus.
function fixture({layoutSlides,meta={},media={},extraSlides={}}={}){
 const slides={
  v1:{group:'Verse 1',color:'',settings:{},notes:'',items:[item(['Ẹ ṣé o, Olúwa','line two'])],children:['v1a','v1b']},
  v1a:{group:null,items:[item(['page two'])]},v1b:{group:null,items:[item(['page three']),item(['second language'],'en')]},
  ch:{group:'Chorus',items:[item(['chorus line'])]},
  br:{group:'Bridge',items:[]},
  ...extraSlides};
 return ['song-1',{name:'Test Song',category:'cat1',settings:{activeLayout:'L1'},timestamps:{modified:1700000000000},meta:{title:'Test Song',author:'A. Writer',copyright:'© 2001 Example',CCLI:'1234567',...meta},
  slides,layouts:{L1:{name:'Default',slides:layoutSlides||[{id:'v1'},{id:'ch'},{id:'br'},{id:'ch'}]}},media}];
}
test('Imports sections with continuation pages, repeats, blank cues and exact text, in FreeShow order',()=>{
 const song=freeShowToSong(fixture());
 assert.deepEqual(song.sections.map(s=>[s.label,s.kind,s.number,s.slides.length]),[['Verse 1','verse',1,3],['Chorus','chorus',null,1],['Bridge','bridge',null,1]]);
 assert.equal(song.sections[0].slides[0],'Ẹ ṣé o, Olúwa\nline two','Unicode and line breaks kept exactly');
 assert.equal(song.sections[0].slides[2],'page three\nsecond language','text items stay in their original order');
 assert.equal(song.sections[2].slides[0],'','an empty slide is kept as a blank cue');
 const deck=songSlides(song,'e1');
 assert.deepEqual(deck.map(s=>s.section+':'+s.page),['Verse 1:0','Verse 1:1','Verse 1:2','Chorus:0','Bridge:0','Chorus:0'],'the repeated chorus plays twice');
 assert.equal(song.meta.ccli,'1234567');assert.equal(songCredit(song),'© 2001 Example · CCLI Song # 1234567');
 assert.ok(song.skipped.some(x=>/styles/.test(x)));
 const bare=freeShowToSong(fixture()[1]);assert.equal(bare.sections.length,3,'a bare show object (no envelope) also imports');
});
test('Disabled layout entries and continuation pages hidden for one occurrence play as in FreeShow',()=>{
 const song=freeShowToSong(fixture({layoutSlides:[{id:'v1',children:{v1a:{disabled:true}}},{id:'ch',disabled:true},{id:'v1'},{id:'missing'}]}));
 assert.deepEqual(songSlides(song,'e').map(s=>s.text.split('\n')[0]),['Ẹ ṣé o, Olúwa','page three','Ẹ ṣé o, Olúwa','page two','page three']);
 assert.ok(song.skipped.some(x=>/1 layout entry points to slides that are not in the file/.test(x)));
});
test('Media and non-text items are reported, not silently dropped; malformed files are refused',()=>{
 const song=freeShowToSong(fixture({media:{m1:{path:'x.mp4'}},extraSlides:{im:{group:'Intro',items:[{type:'media',src:'x'}]}}}));
 assert.ok(song.skipped.includes('1 media file'));assert.ok(song.skipped.some(x=>/1 non-text item/.test(x)));
 assert.throws(()=>freeShowToSong(null),/not a FreeShow show/);assert.throws(()=>freeShowToSong(['id','text']),/not a FreeShow show/);assert.throws(()=>freeShowToSong({name:'x'}),/not a FreeShow show/);
});
test('Content over the limits is refused with exact counts, never truncated',()=>{
 const many=Object.fromEntries(Array.from({length:SONG_LIMITS.pagesPerSection+1},(_,i)=>['c'+i,{group:null,items:[item(['x'])]}]));
 assert.throws(()=>freeShowToSong(fixture({extraSlides:{...many,big:{group:'Verse 9',items:[item(['x'])],children:Object.keys(many)}}})),/has 62 continuation slides in Verse 9; Wordlight supports up to 60/);
 assert.throws(()=>freeShowToSong(fixture({extraSlides:{long:{group:'Tag',items:[item(['y'.repeat(20001)])]}}})),/20001 characters on one slide/);
 const big=cleanSong(freeShowToSong(fixture()));big.sections=Array.from({length:12},(_,i)=>({id:'s'+i,label:'Verse '+i,slides:Array.from({length:60},()=>'z'.repeat(300))}));big.arrangements=[{id:'a',name:'a',order:['s0']}];
 assert.throws(()=>cleanSong(big),/216000 characters of lyrics; Wordlight supports up to 200000/);
 const song=freeShowToSong(fixture());assert.throws(()=>cleanSong({...song,arrangements:[{id:'a',order:['nope']}]}),/missing section/);
 assert.throws(()=>cleanSong({...song,sections:[...song.sections,song.sections[0]]}),/unique/);
});
const withSong=(d,entryId='e1')=>cleanDraft({...d,songs:[...(d.songs||[]),{entryId,song:freeShowToSong(fixture())}]});
test('Songs in a show render as fitted text slides with credit, and survive save, scenes, copies and import',()=>{
 const d=withSong(cleanDraft({...DEFAULT,notes:[]}));
 const slides=makeDeck(d).filter(s=>s.song);assert.equal(slides.length,6);
 assert.equal(slides[0].type,'text');assert.equal(slides[0].format.fit,true);assert.equal(slides[0].format.attribution,'© 2001 Example · CCLI Song # 1234567');
 assert.equal(slides[0].reference,'Test Song · Verse 1 (1/3)');assert.equal(new Set(slides.map(s=>s.id)).size,6,'repeated sections get distinct slide ids');
 assert.deepEqual(cleanDraft(JSON.parse(JSON.stringify(d))).songs,d.songs);
 const show=createShow('S',d),scene=addScene(show,'Two',d);switchScene(show,scene.id);
 const lib=cleanLibrary(JSON.parse(JSON.stringify({format:'wordlight-library',version:1,shows:[show]})));
 assert.equal(sceneDraft(activeShow(lib),'scene-main').songs.length,1);assert.equal(activeShow(lib).draft.songs.length,1);
 const dup=copyShow(activeShow(lib));dup.draft.songs[0].song.arrangementId='x';assert.notEqual(activeShow(lib).draft.songs[0].song.arrangementId,'x');
 const target=cleanLibrary(null,DEFAULT);mergeShows(target,lib);assert.equal(activeShow(target).draft.songs.length,1);
 assert.throws(()=>cleanDraft({...d,songs:[...d.songs,{...d.songs[0]}]}),/unique/);
 assert.throws(()=>cleanDraft({...d,songs:[{entryId:'bad',song:{format:'nope'}}]}),/could not be read/,'a damaged song is an error, not a silent drop');
});
test('The deck cache follows song changes; arrangement switches change the preview, never the sent screen',()=>{
 const d=withSong(cleanDraft({...DEFAULT,notes:[]}));d.songs[0].song.arrangements.push({id:'short',name:'Short',order:['ch'],hidden:{}});
 const before=deckFor(d).filter(s=>s.song).length,sent=snapshot(d);assert.ok(validLive(sent));
 d.songs[0].song.arrangementId='short';assert.equal(deckFor(d).filter(s=>s.song).length,1);assert.equal(sent.slides.filter(s=>s.song).length,before);
 d.songs=[];assert.equal(deckFor(d).filter(s=>s.song).length,0);assert.equal(sent.slides.filter(s=>s.song).length,6);
});
test('A song is its own organizer item: delete, duplicate, page deletion and copies to another show keep credit and independence',()=>{
 const d=withSong(cleanDraft({...DEFAULT}));const item=slideGroups(d).find(g=>g.id==='song-e1');
 assert.equal(item.kind,'Song');assert.equal(item.slides.length,6);assert.ok(slideGroups(d).some(g=>g.id==='bible'),'the passage stays a separate item');
 const copy=structuredClone(d);removeGroups(copy,['song-e1']);assert.equal(copy.songs.length,0);assert.equal(makeDeck(copy).filter(s=>s.type==='passage').length,1,'deleting the song leaves the passage');
 const self=structuredClone(d),ids=copyGroups(self,self,['song-e1']);assert.equal(self.songs.length,2);assert.match(ids[0],/^song-/);
 self.songs[1].song.arrangementId='changed';assert.notEqual(self.songs[0].song.arrangementId,'changed');
 const pages=makeDeck(d).filter(s=>s.song),page=structuredClone(d);removeSlides(page,[pages[1].id]);assert.equal(makeDeck(page).filter(s=>s.song).length,5);
 const other=createShow('Other').draft;copyGroups(d,other,['song-e1']);assert.equal(other.songs.length,1);assert.equal(songCredit(other.songs[0].song),songCredit(d.songs[0].song));
 const one=createShow('One').draft;copySlides(d,one,[pages[3].id]);assert.equal(one.textSlides.length,1);assert.equal(one.textSlides[0].attribution,'© 2001 Example · CCLI Song # 1234567');assert.equal(makeDeck(one).length,1);
 moveGroups(d,['song-e1'],-1);moveGroups(d,['song-e1'],-1);assert.equal(groupKey(makeDeck(d)[0]),'song-e1','two moves earlier put the song first');
});
test('The lower third shows song text, title and section, and the credit',()=>{
 const d=withSong(cleanDraft({...DEFAULT,notes:[]})),slide=makeDeck(d).find(s=>s.song),c=lowerThirdContent(slide,snapshot(d).style);
 assert.equal(c.text,'Ẹ ṣé o, Olúwa\nline two');assert.equal(c.reference,'Test Song · Verse 1 (1/3)');assert.equal(c.credit,'© 2001 Example · CCLI Song # 1234567');
});
test('Song search is accent- and case-insensitive, paged, and filtered by category',()=>{
 const index=['Ẹ ṣé o','Amazing Grace','Grace Alone','Ọlọrun Ọba'].map((name,i)=>({id:'s'+i,name,category:i<2?'Hymns':'Other',modified:0,folded:foldText(name)}));
 assert.deepEqual(searchSongs(index,{query:'grace'}).items.map(s=>s.name),['Amazing Grace','Grace Alone']);
 assert.deepEqual(searchSongs(index,{query:'olorun oba'}).items.map(s=>s.name),['Ọlọrun Ọba']);assert.equal(searchSongs(index,{query:'e se'}).total,1);
 assert.equal(searchSongs(index,{category:'Hymns'}).total,2);const page=searchSongs(index,{limit:1,offset:1});assert.equal(page.total,4);assert.equal(page.items.length,1);assert.equal(page.items[0].folded,undefined);
});
// Companion song API against a throwaway FreeShow-shaped library.
const port=18783;let server,dir;
before(async()=>{
 dir=await mkdtemp(path.join(tmpdir(),'wordlight-songs-test-'));const shows=path.join(dir,'Shows');await mkdir(shows);await mkdir(path.join(dir,'Config'));
 const index={'song-1':{name:'Test Song',category:'cat1',timestamps:{modified:1}},'song-2':{name:'Other Hymn',category:'cat2',timestamps:{modified:2}},'evil':{name:'..\\..\\escape',category:'cat1',timestamps:{}},'song-3':{name:'Mismatch',category:'cat1',timestamps:{}}};
 await writeFile(path.join(dir,'shows.json'),JSON.stringify(index));
 await writeFile(path.join(dir,'Config','settings_synced.json'),JSON.stringify({categories:{cat1:{name:'Hymns'},cat2:{name:'Choir'}}}));
 await writeFile(path.join(shows,'Test Song.show'),JSON.stringify(fixture()));await writeFile(path.join(shows,'Mismatch.show'),JSON.stringify(['another-id',fixture()[1]]));
 server=spawn(process.execPath,['server.mjs'],{cwd:path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1')),env:{...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_DATA_DIR:path.join(dir,'data'),WORDLIGHT_FREESHOW_INDEX:path.join(dir,'shows.json'),WORDLIGHT_FREESHOW_SHOWS:shows,WORDLIGHT_FREESHOW_DATA:dir},stdio:'ignore'});
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:'+port+'/api/songs/categories')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
});
after(async()=>{server.kill();await new Promise(r=>setTimeout(r,200));await rm(dir,{recursive:true,force:true});});
test('Companion song API: categories, paged search, lazy open, and safe refusals',async()=>{
 const get=async(p,headers)=>{const r=await fetch('http://127.0.0.1:'+port+p,{headers});return {status:r.status,body:await r.json()};};
 const cats=await get('/api/songs/categories');assert.equal(cats.body.library,4);assert.deepEqual(cats.body.categories.find(c=>c.name==='Hymns'),{name:'Hymns',count:3});
 const found=await get('/api/songs?q=test');assert.deepEqual(found.body.items.map(s=>[s.id,s.name,s.category]),[['song-1','Test Song','Hymns']]);
 const opened=await get('/api/songs/item?id=song-1');assert.equal(opened.status,200);assert.equal(opened.body.song.sections.length,3);assert.equal(opened.body.song.category,'Hymns');
 assert.equal((await get('/api/songs/item?id=song-2')).status,404,'listed in the index but no file');
 assert.equal((await get('/api/songs/item?id=evil')).status,400,'a name that would leave the Shows folder');
 assert.equal((await get('/api/songs/item?id=song-3')).status,409,'file id does not match the index');
 assert.equal((await get('/api/songs?q=x',{Origin:'https://studio.example.org'})).status,403,'local studio only');
 assert.equal((await fetch('http://127.0.0.1:'+port+'/api/songs',{method:'POST'})).status,405);
});
import {newSong,editSong,songToText,arrangementText,parseSongText,readSongFile,songFile} from './dist/songs.mjs';
test('Editing a song: lyrics text round trip, blank cues, repeats, clear errors and other arrangements kept',()=>{
 const imported=freeShowToSong(fixture());
 const text=songToText(imported);assert.match(text,/^\[Verse 1\]\nẸ ṣé o, Olúwa\nline two\n\npage two\n\n/);assert.match(text,/\[Bridge\]\n\(blank\)$/);
 const same=editSong(imported,{lyrics:text,arrangement:arrangementText(imported)});
 assert.deepEqual(same.sections,imported.sections,'saving unchanged text changes nothing');assert.deepEqual(songSlides(same,'e').map(s=>s.text),songSlides(imported,'e').map(s=>s.text));
 assert.equal(arrangementText(imported),'Verse 1, Chorus, Bridge, Chorus');
 const edited=editSong(imported,{title:'Renamed',meta:{author:'B. Writer',ccli:''},lyrics:text+'\n\n[Verse 2]\nnew verse\n\n(blank)',arrangement:'Verse 1, Chorus, Verse 2, chorus'});
 assert.equal(edited.title,'Renamed');assert.equal(edited.meta.author,'B. Writer');assert.equal(edited.meta.ccli,undefined,'a cleared field is removed');assert.equal(edited.meta.copyright,'© 2001 Example','untouched fields stay');
 assert.deepEqual(edited.sections.find(s=>s.label==='Verse 2').slides,['new verse','']);assert.equal(edited.sections[0].id,'v1','unchanged labels keep their ids');assert.equal(edited.edited,true);
 assert.deepEqual(songSlides(edited,'e').map(s=>s.section),['Verse 1','Verse 1','Verse 1','Chorus','Verse 2','Verse 2','Chorus']);
 assert.throws(()=>editSong(imported,{lyrics:text,arrangement:'Verse 1, Verse 7'}),/“Verse 7”, which is not a section label/);
 assert.throws(()=>parseSongText('no label'),/Start the lyrics/);assert.throws(()=>parseSongText('[A]\nx\n[a]\ny'),/used twice/);assert.throws(()=>editSong(imported,{lyrics:text,arrangement:''}),/at least one section/);
 const two=cleanSong({...imported,arrangements:[...imported.arrangements,{id:'L2',name:'Short',order:['br'],hidden:{}}]});
 assert.throws(()=>editSong(two,{lyrics:'[Verse 1]\nx\n\n[Chorus]\ny',arrangement:'Verse 1'}),/“Short” still uses 1 removed section/);
 const kept=editSong(two,{lyrics:text,arrangement:'Chorus'});assert.deepEqual(kept.arrangements.map(a=>a.name),['Default','Short']);
});
test('New songs and song files work without FreeShow, and imports accept FreeShow files too',()=>{
 const s=newSong('Mine');assert.equal(s.source.app,'wordlight');assert.deepEqual(songSlides(s,'e').map(x=>x.text),['']);
 const written=editSong(s,{lyrics:'[Verse 1]\nHello',arrangement:'Verse 1'});
 assert.deepEqual(readSongFile(JSON.parse(JSON.stringify(songFile(written)))),written);
 assert.equal(readSongFile(fixture()).sections.length,3);assert.throws(()=>readSongFile({format:'wordlight-song-file',version:1,song:{}}),/not a Wordlight song/);
});
test('Arrangements are bounded by what they expand to, and long details are kept or refused, never cut',()=>{
 const base=freeShowToSong(fixture());
 const big={...base,sections:[{id:'s',label:'Verse 1',slides:Array.from({length:60},()=>'w'.repeat(3000))}],arrangements:[{id:'a',name:'Many',order:['s','s'],hidden:{}}],arrangementId:'a'};
 assert.throws(()=>cleanSong(big),/360000 characters when “Many” is expanded; Wordlight supports up to 300000/,'unique lyrics fit, but the repeats would not');
 const slides={...base,sections:[{id:'s',label:'Chorus',slides:['x','y']}],arrangements:[{id:'a',name:'Loop',order:Array(400).fill('s'),hidden:{}}],arrangementId:'a'};
 assert.doesNotThrow(()=>cleanSong(slides),'800 expanded slides is within the per-song limit');
 const tooMany={...slides,sections:[{id:'s',label:'Chorus',slides:['x','y','z']}]};assert.throws(()=>cleanSong(tooMany),/1200 slides when “Loop” is expanded; Wordlight supports up to 1000/);
 const longCopyright=('© '+'Long rights holder, '.repeat(90)).trim();assert.ok(longCopyright.length>300&&longCopyright.length<2000);
 const kept=freeShowToSong(fixture({meta:{copyright:longCopyright}}));assert.equal(kept.meta.copyright,longCopyright,'a long copyright is kept in full');assert.match(songCredit(kept),/Long rights holder,/);
 assert.throws(()=>freeShowToSong(fixture({meta:{copyright:'c'.repeat(2001)}})),/2001 characters in “copyright”; Wordlight supports up to 2000/);
 const named=fixture();named[1].name='n'.repeat(301);assert.throws(()=>freeShowToSong(named),/301 characters in the title/);
 // Show level: four songs that each expand to 800 slides exceed 3000 together.
 const entries=Array.from({length:4},(_,i)=>({entryId:'e'+i,song:cleanSong(slides)}));
 assert.throws(()=>cleanDraft({...DEFAULT,songs:entries}),/expand to 3200 slides; a show supports up to 3000/);
 assert.equal(cleanDraft({...DEFAULT,songs:entries.slice(0,3)}).songs.length,3);
});
