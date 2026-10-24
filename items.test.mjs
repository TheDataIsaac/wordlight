// Service items (the show's scenes shown as a rundown): new items, kinds, apply-to-all and splitting older mixed items.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addContent,MAX_SHOW_BYTES,createShow,activeScene,switchScene,addScene,MAX_SCENES,newItemDraft,addItem,itemKind,itemSlideCount,isEmptyDraft,moveScene,applyDesignToAll,undoDesignToAll,wordsToAll,undoWordsToAll,planSplit,splitItem,undoSplit,moveSlides,backgroundAssetIds} from './dist/library.mjs';
import {cleanDraft,makeDeck,DEFAULT,snapshot} from './dist/core.mjs';
import {newSong,editSong} from './dist/songs.mjs';

const song=(title,lyrics)=>editSong(newSong(title),{lyrics,arrangement:'Verse 1, Chorus'});
const verses=[1,2,3].map(v=>({bookId:'JHN',book:'John',chapter:3,verse:v,text:'Verse '+v+' about the Word.'}));
// An older item holding everything: three verses (one excluded), a word study, a two-page text slide with its own
// highlighted word, and two songs.
function mixedShow(){
 const show=createShow('Sunday');
 Object.assign(show.draft,cleanDraft({...show.draft,includePassage:true,reference:'John 3:1-3',translation:'KJV',passage:verses.map(v=>v.text).join('\n'),bibleVerses:verses,
  excludedSlides:['passage-JHN-3-2'],theme:'midnight',fontSize:96,accent:'#336699',
  notes:[{id:'n1',word:'Word',meaning:'logos',color:'#ff0000'},{id:'n2',word:'grace',color:'#00aa00',slideId:'t1'}],
  textSlides:[{id:'t1',layout:'content',heading:'Welcome',body:'First page\n\nSecond page with grace'}],
  songs:[{entryId:'s1',song:song('Song One','[Verse 1]\nOne\n\n[Chorus]\nRefrain')},{entryId:'s2',song:song('Song Two','[Verse 1]\nTwo\n\n[Chorus]\nAgain')}]}));
 return show;
}
const deckIds=d=>makeDeck(d).map(s=>s.id);
test('A new item has the design and word styles of the current one, and no content',()=>{
 const show=mixedShow(),d=newItemDraft(show);
 assert.deepEqual([d.theme,d.fontSize,d.accent],['midnight',96,'#336699']);
 assert.deepEqual(d.notes.map(n=>[n.word,n.color,n.meaning]),[['Word','#ff0000','']],'style kept, explanation and slide-specific words not');
 assert.equal(isEmptyDraft(d),true);assert.equal(itemKind(d),'Empty');assert.equal(itemSlideCount(d),0);
 assert.equal(isEmptyDraft(show.draft),false);
 const first=show.activeSceneId,scene=addItem(show,'Song One');
 assert.equal(show.activeSceneId,scene.id,'the new item is selected');assert.equal(show.scenes[1].id,scene.id,'placed after the current item');
 switchScene(show,first);assert.equal(itemKind(show.draft),'Mixed');
});
test('Item kinds, order and the item limit',()=>{
 const show=createShow('Kinds');
 Object.assign(show.draft,cleanDraft({...show.draft,songs:[{entryId:'a',song:song('A','[Verse 1]\nx\n\n[Chorus]\ny')}]}));assert.equal(itemKind(show.draft),'Song');
 const b=addItem(show,'B');Object.assign(show.draft,cleanDraft({...show.draft,includePassage:true,passage:'Text',reference:'Ps 1:1'}));assert.equal(itemKind(show.draft),'Scripture');
 const c=addItem(show,'C');Object.assign(show.draft,cleanDraft({...show.draft,textSlides:[{id:'t',layout:'title',heading:'Hi'}]}));assert.equal(itemKind(show.draft),'Presentation');
 assert.deepEqual(show.scenes.map(s=>s.name),['Scene 1','B','C']);
 assert.equal(moveScene(show,c.id,-2),true);assert.deepEqual(show.scenes.map(s=>s.name),['C','Scene 1','B']);assert.equal(moveScene(show,c.id,-1),false);
 assert.equal(MAX_SCENES,60);for(let i=show.scenes.length;i<60;i++)addScene(show,'x');
 assert.throws(()=>addScene(show,'one too many'),/up to 60 items/);
});
test('Apply design and words to all items, each with undo; explanations and slide words stay',()=>{
 const show=mixedShow(),first=show.activeSceneId;addItem(show,'Other');
 Object.assign(show.draft,{theme:'paper',fontSize:70});show.draft.notes=[{id:'x',word:'word',meaning:'kept here',color:'#000000',emphasis:'highlight',bold:false,italic:false}];
 const design=applyDesignToAll(show);switchScene(show,first);
 assert.deepEqual([show.draft.theme,show.draft.fontSize],['paper',70]);
 undoDesignToAll(show,design);assert.deepEqual([show.draft.theme,show.draft.fontSize],['midnight',96]);
 const other=show.scenes[1].id;switchScene(show,other);
 const words=wordsToAll(show);switchScene(show,first);
 const updated=show.draft.notes.find(n=>n.id==='n1');assert.deepEqual([updated.color,updated.meaning],['#000000','logos'],'matching word takes the style, keeps its explanation');
 assert.ok(show.draft.notes.some(n=>n.id==='n2'&&n.slideId==='t1'),'slide-specific word untouched');
 switchScene(show,other);undoWordsToAll(show,words);switchScene(show,first);assert.equal(show.draft.notes.find(n=>n.id==='n1').color,'#ff0000');
});
test('Split keeps every slide, id, exclusion, arrangement and note, in the original order',()=>{
 const show=mixedShow(),original=deckIds(show.draft),texts=makeDeck(show.draft).map(s=>s.text),id=show.activeSceneId;const arrangement=structuredClone(show.draft.songs[0].song);
 const plan=planSplit(show.draft);
 assert.deepEqual(plan.pieces.map(p=>[p.kind,p.name]),[['Scripture','John 3:1-3'],['Presentation','Welcome'],['Song','Song One'],['Song','Song Two']]);
 const undo=splitItem(show);
 const drafts=show.scenes.map(s=>s.id===show.activeSceneId?show.draft:s.draft);
 assert.deepEqual(drafts.flatMap(deckIds),original,'same slides in the same order');
 assert.deepEqual(drafts.flatMap(d=>makeDeck(d).map(s=>s.text)),texts);
 assert.deepEqual(drafts.map(d=>itemKind(d)),['Scripture','Presentation','Song','Song']);
 assert.equal(show.scenes[0].id,id,'with no live slide here, the first piece keeps the item id');
 assert.ok(!deckIds(drafts[0]).includes('passage-JHN-3-2'),'the excluded verse stays excluded');
 assert.ok(deckIds(drafts[0]).some(i=>i.startsWith('study-n1')),'the word study stays with the passage');
 assert.ok(drafts[1].notes.some(n=>n.slideId==='t1'),'the text slide keeps its own word');
 assert.equal(drafts[2].songs[0].entryId,'s1');assert.deepEqual(drafts[2].songs[0].song,arrangement,'the song entry, its arrangement included, is unchanged');
 undoSplit(show,undo);
 assert.equal(show.scenes.length,1);assert.equal(show.activeSceneId,id);assert.deepEqual(deckIds(show.draft),original,'undo restores the item');
});
test('The piece with the live slide keeps the item id; the live snapshot is not touched',()=>{
 const show=mixedShow(),id=show.activeSceneId,liveSlide=deckIds(show.draft).find(i=>i.startsWith('song-s2'));
 const live={sceneId:id,slides:[{id:liveSlide}],index:0},frozen=JSON.stringify(live);
 splitItem(show,liveSlide);
 const piece=show.scenes.find(s=>s.id===id),draft=piece.id===show.activeSceneId?show.draft:piece.draft;
 assert.equal(piece.name,'Song Two');assert.ok(deckIds(draft).includes(liveSlide),'LIVE stays on the item that holds the live slide');
 assert.equal(JSON.stringify(live),frozen);
});
test('Split refuses when it would change the order, or when there is nothing to split',()=>{
 const show=mixedShow(),ids=deckIds(show.draft),songSlide=ids.find(i=>i.startsWith('song-s1'));
 // Move a song slide up between the verses.
 for(let i=0;i<ids.length;i++)moveSlides(show.draft,[songSlide],-1);
 assert.match(planSplit(show.draft).error,/order that splitting would change/);assert.throws(()=>splitItem(show),/order/);
 const single=createShow('One');Object.assign(single.draft,cleanDraft({...single.draft,songs:[{entryId:'a',song:song('A','[Verse 1]\nx\n\n[Chorus]\ny')}]}));
 assert.match(planSplit(single.draft).error,/nothing to split/);
});

test('Review cases: several songs are Mixed, hidden passage text or studies are not empty, undo follows item ids',()=>{
 const show=createShow('Songs');
 Object.assign(show.draft,cleanDraft({...show.draft,songs:['a','b'].map(id=>({entryId:id,song:song(id,'[Verse 1]\nx\n\n[Chorus]\ny')}))}));
 assert.equal(itemKind(show.draft),'Mixed');assert.deepEqual(planSplit(show.draft).pieces.map(p=>p.name),['a','b'],'a list of songs can be split');
 const base=newItemDraft(show);
 assert.equal(isEmptyDraft({...base,includePassage:false,passage:'Hidden pasted text'}),false);
 assert.equal(isEmptyDraft({...base,notes:[{id:'x',word:'w',meaning:'an explanation'}]}),false);
 assert.equal(isEmptyDraft({...base,notes:[{id:'x',word:'w',color:'#ff0000'}]}),true,'a word style alone is not content');
 const first=show.activeSceneId,b=addItem(show,'B');Object.assign(show.draft,{theme:'paper'});
 const before=applyDesignToAll(show);moveScene(show,b.id,-1);undoDesignToAll(show,before);
 assert.equal(show.draft.theme,'paper','B gets its own earlier design back after a reorder');
 switchScene(show,first);assert.equal(show.draft.theme,'midnight','and the first item its own');
});
test('Split selects the piece with the slide being prepared; the item id stays with the live slide',()=>{
 const show=mixedShow(),id=show.activeSceneId,ids=deckIds(show.draft);
 const working=ids.find(i=>i.startsWith('song-s1')),liveSlide=ids.find(i=>i.startsWith('song-s2'));
 show.draft.previewId=working;
 splitItem(show,liveSlide);
 assert.equal(activeScene(show).name,'Song One','the operator stays on the song they were preparing');
 assert.equal(show.draft.previewId,working,'with the same slide selected');
 const owner=show.scenes.find(s=>s.id===id);assert.equal(owner.name,'Song Two','the original id stays with the live piece');
});

const draftOf=(show,id)=>id===show.activeSceneId?show.draft:show.scenes.find(s=>s.id===id).draft;
test('Undo split refuses once a piece was edited or renamed; choosing and reordering items are fine',()=>{
 let show=mixedShow(),undo=splitItem(show);
 const ids=show.scenes.map(s=>s.id);switchScene(show,ids[3]);moveScene(show,ids[3],-1);
 undoSplit(show,undo);assert.equal(show.scenes.length,1,'switch and reorder alone still undo');
 show=mixedShow();undo=splitItem(show);draftOf(show,show.scenes[2].id).songs[0].song.title='Edited';
 assert.throws(()=>undoSplit(show,undo),/changed since/);assert.equal(show.scenes.length,4,'nothing undone');
 show=mixedShow();undo=splitItem(show);show.scenes[1].name='Renamed';
 assert.throws(()=>undoSplit(show,undo),/changed since/);
});
test('Each piece keeps only its own order and exclusion entries, hidden pages stay hidden, orphan notes stay',()=>{
 const show=mixedShow(),hiddenSongPage=deckIds(show.draft).find(i=>i.startsWith('song-s2'));
 show.draft.excludedSlides.push(hiddenSongPage,'text-t1-page-1');
 show.draft.notes.push({id:'orphan',word:'lost',slideId:'gone-slide',color:'#123456'});
 splitItem(show);
 const drafts=show.scenes.map(s=>draftOf(show,s.id));
 assert.deepEqual(drafts[0].excludedSlides,['passage-JHN-3-2']);
 assert.deepEqual(drafts[1].excludedSlides,['text-t1-page-1']);
 assert.deepEqual(drafts[2].excludedSlides,[]);assert.deepEqual(drafts[3].excludedSlides,[hiddenSongPage]);
 assert.ok(!deckIds(drafts[3]).includes(hiddenSongPage),'still hidden');
 assert.ok(drafts[0].notes.some(n=>n.id==='orphan'),'a slide word whose slide is gone stays with the anchor piece');
});
test('Older word-study-only content keeps its studies when split',()=>{
 const show=createShow('Study');
 Object.assign(show.draft,cleanDraft({...show.draft,includePassage:true,passage:'',notes:[{id:'w',word:'grace',meaning:'favour'}],songs:[{entryId:'s',song:song('S','[Verse 1]\nx\n\n[Chorus]\ny')}]}));
 const before=deckIds(show.draft);assert.ok(before.some(i=>i.startsWith('study-w')));
 splitItem(show);
 assert.deepEqual(show.scenes.map(s=>s.id===show.activeSceneId?show.draft:s.draft).flatMap(deckIds),before);
});
test('Apply design to all leaves passage layout, words per slide and so verse slide ids alone',()=>{
 const show=mixedShow(),first=show.activeSceneId,before=deckIds(show.draft);
 addItem(show,'Other');Object.assign(show.draft,{passageLayout:'flow',wordsPerSlide:20,theme:'paper'});
 applyDesignToAll(show);switchScene(show,first);
 assert.equal(show.draft.theme,'paper');assert.equal(show.draft.passageLayout,'verses');assert.deepEqual(deckIds(show.draft),before);
});
// Grows a show with filler items until it is just under the saved-size limit (UTF-8 bytes).
const bytes=v=>new TextEncoder().encode(JSON.stringify(v)).length;
function fillTo(show,room){
 const base=cleanDraft({...show.draft,songs:[],textSlides:[],notes:[],includePassage:true,passage:''});let n=0;
 while(bytes(show)<MAX_SHOW_BYTES-room){
  const left=MAX_SHOW_BYTES-room-bytes(show)-300;if(left<=0)break;
  show.scenes.push({id:'fill'+n,name:'Filler',draft:{...base,passage:'y'.repeat(Math.min(490000,left))}});n++;
 }
}
test('Adding content is all or nothing: a failure or a too-large item leaves the show as it was; an empty item is reused',()=>{
 const show=createShow('Atomic'),snapshot=JSON.stringify(show);
 assert.throws(()=>addContent(show,'Bad',d=>{d.songs=[{entryId:'x',song:{}}];}),/song/i);
 assert.equal(JSON.stringify(show),snapshot,'a song that cannot be added leaves no empty item behind');
 const id=show.activeSceneId;addContent(show,'First song',d=>{d.songs=[{entryId:'a',song:song('First song','[Verse 1]\nx\n\n[Chorus]\ny')}];});
 assert.equal(show.activeSceneId,id,'the empty first item is reused');assert.equal(activeScene(show).name,'First song');
 addContent(show,'Second song',d=>{d.songs=[{entryId:'b',song:song('Second song','[Verse 1]\nx\n\n[Chorus]\ny')}];});
 assert.equal(show.scenes.length,2);assert.equal(activeScene(show).name,'Second song');assert.equal(itemKind(show.draft),'Song');
 fillTo(show,200);const full=JSON.stringify(show);
 assert.throws(()=>addContent(show,'One more',d=>{d.songs=[{entryId:'c',song:song('One more','[Verse 1]\nx\n\n[Chorus]\ny')}];}),/too large/);
 assert.equal(JSON.stringify(show),full,'a song that would pass the size limit is refused before anything changes');
});
test('A split that would be too large is refused before the show changes',()=>{
 const show=mixedShow();fillTo(show,300);
 const snapshot=JSON.stringify(show);
 assert.throws(()=>splitItem(show),/too large/);assert.equal(JSON.stringify(show),snapshot);
});

test('A background image is part of an item design: kept, checked, inherited, applied to all and undone',()=>{
 const id='0123456789abcdef';
 assert.equal(cleanDraft({...DEFAULT,backgroundAssetId:id,backgroundDim:50}).backgroundAssetId,id);
 assert.equal(cleanDraft({...DEFAULT,backgroundAssetId:'data:image/png;base64,AAAA'}).backgroundAssetId,'','only a store id is kept, never image data');
 assert.equal(cleanDraft({...DEFAULT,backgroundDim:500}).backgroundDim,80);assert.equal(cleanDraft(DEFAULT).backgroundDim,45);assert.equal(cleanDraft({...DEFAULT,backgroundDim:0}).backgroundDim,0);
 const style=snapshot(cleanDraft({...DEFAULT,backgroundAssetId:id,backgroundDim:20})).style;assert.equal(style.backgroundAssetId,id);assert.equal(style.backgroundDim,20);
 const show=createShow('Bg');show.draft.backgroundAssetId=id;show.draft.backgroundDim=60;
 addItem(show,'Next');assert.equal(show.draft.backgroundAssetId,id,'a new item starts with the current design');assert.equal(show.draft.backgroundDim,60);
 show.draft.backgroundAssetId='';addItem(show,'Last');show.draft.backgroundAssetId='fedcba9876543210';
 const before=applyDesignToAll(show);
 assert.deepEqual([...backgroundAssetIds({shows:[show]})],['fedcba9876543210']);
 undoDesignToAll(show,before);assert.deepEqual([...backgroundAssetIds({shows:[show]})].sort(),['0123456789abcdef','fedcba9876543210']);
});
