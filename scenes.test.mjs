import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT,cleanDraft,cleanTextSlide,makeDeck,snapshot,validLive} from './dist/core.mjs';
import {cleanLibrary,createShow,activeShow,mergeShows,copyShow,activeScene,sceneDraft,switchScene,addScene,renameScene,removeScene,restoreScene,copyGroups,removeGroups,slideGroups,applyBiblePassage,applyPastedNKJV,MAX_SCENES,MAIN_SCENE} from './dist/library.mjs';
import {parseReference,suggestBooks,withBook,bookAliases,findBook,BIBLE_BOOKS} from './dist/reference.mjs';
import {parseYorubaReference} from './dist/yoruba.mjs';
const roundTrip=lib=>cleanLibrary(JSON.parse(JSON.stringify(lib)));
const verses=(book,chapter,numbers)=>numbers.map(n=>({book_id:book,book:book==='LUK'?'Luke':'John',chapter,verse:n,text:book+' '+chapter+':'+n}));
function lukeShow(){
 const show=createShow('Sunday');
 applyBiblePassage(show.draft,{reference:'Luke 10:18-20',text:'x',verses:verses('LUK',10,[18,19,20])},'kjv');
 show.draft=cleanDraft({...show.draft,notes:[{id:'p',word:'power',color:'#ff0000',emphasis:'underline',meaning:'Authority',bold:true}]});
 return show;
}
test('Libraries saved before scenes migrate into one scene without changing the show',()=>{
 const old=cleanLibrary(null,cleanDraft({...DEFAULT,title:'Old show',passage:'Old text'}));
 const legacy=JSON.parse(JSON.stringify(old));for(const s of legacy.shows){delete s.scenes;delete s.activeSceneId;}
 const migrated=cleanLibrary(legacy),show=activeShow(migrated);
 assert.deepEqual(show.scenes,[{id:MAIN_SCENE,name:'Scene 1'}]);assert.equal(show.activeSceneId,MAIN_SCENE);
 assert.deepEqual(show.draft,old.shows[0].draft);assert.deepEqual(roundTrip(migrated),migrated);
});
test('Scenes keep their own passage, words, text slides and preview, and return unchanged',()=>{
 const show=lukeShow(),luke=JSON.stringify(show.draft);
 const copy=addScene(show,'John',show.draft);switchScene(show,copy.id);
 applyBiblePassage(show.draft,{reference:'John 3:16-18',text:'y',verses:verses('JHN',3,[16,17,18])},'kjv');
 show.draft.textSlides.push(cleanTextSlide({id:'t',heading:'Notes',body:'One\n\nTwo'}));show.draft.previewId='passage-JHN-3-17';
 assert.equal(JSON.stringify(sceneDraft(show,MAIN_SCENE)),luke);
 const saved=roundTrip({format:'wordlight-library',version:1,activeShowId:show.id,shows:[show]}),again=activeShow(saved);
 assert.equal(again.activeSceneId,copy.id);assert.equal(again.scenes.length,2);assert.deepEqual(makeDeck(again.draft).map(s=>s.reference).slice(0,3),['John 3:16','John 3:17','John 3:18']);
 assert.equal(again.draft.previewId,'passage-JHN-3-17');assert.equal(again.draft.notes[0].color,'#ff0000');
 switchScene(again,MAIN_SCENE);assert.equal(JSON.stringify({...again.draft,title:'Sunday'}),luke);
 assert.equal(again.scenes.find(s=>s.id===copy.id).draft.textSlides[0].body,'One\n\nTwo');
 assert.ok(!again.scenes.find(s=>s.id===MAIN_SCENE).draft,'the active scene is stored once, in show.draft');
});
test('The show title stays with the show when switching scenes; scene names are separate',()=>{
 const show=lukeShow(),other=addScene(show,'Prayer');show.draft.title='Renamed show';
 switchScene(show,other.id);assert.equal(show.draft.title,'Renamed show');assert.equal(activeScene(show).name,'Prayer');
 renameScene(show,other.id,'  Closing  ');assert.equal(activeScene(show).name,'Closing');renameScene(show,other.id,'');assert.equal(activeScene(show).name,'Closing');
});
test('Removing a scene can be undone, the last scene stays, and the limit is enforced without losing data',()=>{
 const show=lukeShow(),second=addScene(show,'Second',show.draft);switchScene(show,second.id);show.draft.reference='Changed in second';
 const removed=removeScene(show,second.id);assert.equal(show.activeSceneId,MAIN_SCENE);assert.equal(show.scenes.length,1);
 assert.throws(()=>removeScene(show,MAIN_SCENE),/at least one/);
 restoreScene(show,removed);assert.equal(sceneDraft(show,second.id).reference,'Changed in second');
 while(show.scenes.length<MAX_SCENES)addScene(show,'');
 assert.throws(()=>addScene(show,'one too many'),/up to 60/);
 const raw=JSON.parse(JSON.stringify({format:'wordlight-library',version:1,shows:[show]}));raw.shows[0].scenes.push({id:'extra',name:'x',draft:show.draft});
 assert.throws(()=>cleanLibrary(raw),/up to 60/);
 raw.shows[0].scenes=[{id:'a',name:'A'},{id:'a',name:'B',draft:show.draft}];assert.throws(()=>cleanLibrary(raw),/unique/);
});
test('Unusual saved scene lists are repaired without dropping any scene content',()=>{
 const show=lukeShow(),raw=JSON.parse(JSON.stringify({format:'wordlight-library',version:1,shows:[show]}));
 const other=cleanDraft({...DEFAULT,reference:'Kept'});
 raw.shows[0].scenes=[{id:'x',name:'Has content',draft:other}];raw.shows[0].activeSceneId='x';
 const fixed=activeShow(cleanLibrary(raw));assert.equal(fixed.scenes.length,2);assert.equal(sceneDraft(fixed,'x').reference,'Kept');
 assert.equal(fixed.draft.reference,'Luke 10:18-20');assert.notEqual(fixed.activeSceneId,'x');
});
test('Duplicate show, Save show export and Import keep every scene as an independent copy',()=>{
 const show=lukeShow(),second=addScene(show,'John',show.draft);sceneDraft(show,second.id).reference='John 3:16';
 const dup=copyShow(show,'Sunday (copy)');assert.notEqual(dup.id,show.id);assert.equal(dup.scenes.length,2);assert.equal(dup.draft.title,'Sunday (copy)');
 sceneDraft(dup,second.id).reference='Edited copy';assert.equal(sceneDraft(show,second.id).reference,'John 3:16');
 const exported=JSON.parse(JSON.stringify({format:'wordlight-library',version:1,activeShowId:show.id,shows:[show]}));
 const lib=cleanLibrary(null,DEFAULT);assert.equal(mergeShows(lib,exported),1);
 const imported=activeShow(lib);assert.equal(imported.scenes.length,2);assert.equal(sceneDraft(imported,second.id).reference,'John 3:16');assert.equal(imported.activeSceneId,show.activeSceneId);
 const legacy=cleanLibrary(null,DEFAULT);mergeShows(legacy,{format:'wordlight-session',version:1,draft:cleanDraft({...DEFAULT,title:'Session'})});
 assert.equal(activeShow(legacy).scenes.length,1);assert.equal(activeShow(legacy).draft.title,'Session');
});
test('Copying and moving slides into an inactive scene persists after save, and moves can be undone',()=>{
 const show=lukeShow(),target=addScene(show,'Target');
 show.draft.textSlides.push(cleanTextSlide({id:'long',heading:'Long',body:'word '.repeat(400)}));
 const key='text-long',pages=slideGroups(show.draft).find(g=>g.id===key).slides.length;assert.ok(pages>1);
 const before={source:JSON.stringify(show.draft),target:JSON.stringify(sceneDraft(show,target.id))};
 copyGroups(show.draft,sceneDraft(show,target.id),[key,'passage-LUK-10-19']);removeGroups(show.draft,[key]);
 const saved=activeShow(roundTrip({format:'wordlight-library',version:1,shows:[show]}));
 const moved=sceneDraft(saved,target.id),long=moved.textSlides.find(s=>s.heading==='Long');assert.equal(moved.textSlides.length,2);assert.equal(makeDeck(moved).filter(s=>s.sourceId===long.id).length,pages);
 assert.ok(moved.textSlides.some(s=>s.footer==='Luke 10:19 · KJV'));assert.ok(!saved.draft.textSlides.some(s=>s.id==='long'));
 // Undo restores both sides from copies taken before the move.
 Object.assign(show.draft,JSON.parse(before.source));const t=sceneDraft(show,target.id);for(const k of Object.keys(t))delete t[k];Object.assign(t,JSON.parse(before.target));
 assert.equal(sceneDraft(show,target.id).textSlides.length,0);assert.ok(show.draft.textSlides.some(s=>s.id==='long'));
 const full=sceneDraft(show,target.id);full.textSlides=Array.from({length:200},(_,i)=>cleanTextSlide({id:'f'+i}));
 assert.throws(()=>copyGroups(show.draft,full,[key]),/200/);
});
test('Live snapshots carry their scene and stay unchanged when scenes are switched or edited',()=>{
 const show=lukeShow(),sent={...snapshot(show.draft),showId:show.id,sceneId:show.activeSceneId,sceneName:'Scene 1'};
 assert.ok(validLive(sent));const copy=addScene(show,'Copy',show.draft);switchScene(show,copy.id);
 show.draft.bibleVerses[0].text='edited';show.draft.notes[0].color='#00ff00';
 assert.equal(sent.slides[0].text,'LUK 10:18');assert.equal(sent.style.highlights[0].color,'#ff0000');
 // Same slide IDs exist in both scenes; only the scene ID tells them apart.
 assert.equal(makeDeck(show.draft)[0].id,sent.slides[0].id);assert.notEqual(show.activeSceneId,sent.sceneId);
});
test('References normalize separators, dashes, spacing and "to" without changing their meaning',()=>{
 const cases={'Luke10;18–20':'Luke 10:18-20','luke 10 : 18 − 20':'Luke 10:18-20','Lk 10:18 to 20':'Luke 10:18-20','Luke 10:18—20':'Luke 10:18-20','1 Jn 2:1':'1 John 2:1','First John 2:1':'1 John 2:1','I John 2:1':'1 John 2:1','1john2:1':'1 John 2:1',
  'Ps 23':'Psalms 23','Psalm 23:1-6':'Psalms 23:1-6','Psalms 1-2':'Psalms 1-2','Luku 10:42-11:2':'Luke 10:42-11:2','Gẹnẹsisi 1:1':'Genesis 1:1','genesisi 1:1':'Genesis 1:1','Ìṣe àwọn Aposteli 2:1':'Acts 2:1','Song 2:1':'Song of Solomon 2:1','JHN 3:16':'John 3:16','Phil 4:13':'Philippians 4:13','Phlm 1':'Philemon 1','Jude 1:3':'Jude 1:3','Rev 22:21':'Revelation 22:21','Isaiah 9:6':'Isaiah 9:6','Luke 10:18-18':'Luke 10:18'};
 for(const [input,expected] of Object.entries(cases))assert.equal(parseReference(input).reference,expected,input);
 const r=parseReference('Luke 10:42-11:2');assert.deepEqual([r.chapter,r.verse,r.endChapter,r.endVerse],[10,42,11,2]);
});
test('Ambiguous, unknown and invalid references give clear errors instead of guesses',()=>{
 assert.throws(()=>parseReference('Jo 3:16'),/could be Joshua, Job, Joel, Jonah, John/);
 assert.throws(()=>parseReference('Ph 1:1'),/could be/);assert.throws(()=>parseReference('Hezekiah 1:1'),/Book not found/);
 assert.throws(()=>parseReference('Luke'),/Add a chapter/);assert.throws(()=>parseReference(''),/Enter a reference/);assert.throws(()=>parseReference('10:18'),/book name/);
 assert.throws(()=>parseReference('Luke 10-11:3'),/ambiguous/);assert.throws(()=>parseReference('Luke 10:20-18'),/end must come after/);
 assert.throws(()=>parseReference('Luke 25:1'),/24 chapters/);assert.throws(()=>parseReference('Luke 10:18,20'),/format/);assert.throws(()=>parseReference('Luke 0:1'),/Check/);
 assert.throws(()=>parseYorubaReference('Luke 1-11'),/10 chapters/);assert.equal(parseYorubaReference('Luku10;18–20').last,20);
});
test('Book aliases never point to two books, and suggestions keep the typed chapter and verse',()=>{
 assert.ok(bookAliases().size>BIBLE_BOOKS.length*3);assert.equal(BIBLE_BOOKS.length,66);
 assert.deepEqual(suggestBooks('jo 3:16').books.map(b=>b.id),['JOS','JOB','JOL','JON','JHN']);
 assert.equal(suggestBooks('1 jo').books[0].id,'1JN');assert.equal(suggestBooks('luk').books[0].id,'LUK');
 assert.deepEqual(suggestBooks('Luke 10:18').books,[]);assert.equal(suggestBooks('ise').books[0].id,'ACT');
 assert.equal(withBook('jo 3:16-18',findBook('John')),'John 3:16-18');assert.equal(withBook('saam',findBook('PSA')),'Psalms ');
});
test('NKJV manual references use the same rules and reject invalid ones without changing the show',()=>{
 const d=structuredClone(DEFAULT);applyPastedNKJV(d,'Text','Luke10;19');assert.equal(d.reference,'Luke 10:19');
 const before=JSON.stringify(d);assert.throws(()=>applyPastedNKJV(d,'Text','Jo 3'),/could be/);assert.equal(JSON.stringify(d),before);
});
