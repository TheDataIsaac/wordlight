import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT,cleanDraft,cleanTextSlide,makeDeck,deckFor,snapshot} from './dist/core.mjs';
import {cleanLibrary,createShow,applyBiblePassage} from './dist/library.mjs';
import {saveLibrary,readLibrary,LIBRARY_KEY,BACKUP_KEY} from './dist/storage.mjs';
class MemoryStorage{
 constructor(){this.values=new Map();}
 get length(){return this.values.size;}key(i){return [...this.values.keys()][i]??null;}
 getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,String(v));}removeItem(k){this.values.delete(k);}
}
const same=(d)=>assert.deepEqual(deckFor(d),makeDeck(d));
test('Cached decks follow every in-place edit the studio makes',()=>{
 const d=createShow('Cache').draft,verses=[18,19,20].map(n=>({book_id:'LUK',book:'Luke',chapter:10,verse:n,text:'power verse '+n}));
 applyBiblePassage(d,{reference:'Luke 10:18-20',text:verses.map(v=>v.text).join('\n'),verses},'kjv');
 same(d);assert.equal(deckFor(d),deckFor(d));
 d.notes.push({id:'w',word:'power',meaning:'',original:'',transliteration:'',strong:'',color:'',emphasis:'highlight',slideId:''});same(d);
 d.notes[0].meaning='Authority';same(d);assert.equal(deckFor(d).filter(s=>s.type==='study').length,1);
 d.notes[0].meaning='Authority, changed in place';same(d);
 d.passageLayout='flow';same(d);d.passageLayout='verses';
 d.excludedSlides.push('passage-LUK-10-19');same(d);assert.equal(deckFor(d).filter(s=>s.type==='passage').length,2);
 d.textSlides.push(cleanTextSlide({id:'t',heading:'Hi',body:'Body'}));same(d);
 d.textSlides[0].body='Edited body';same(d);assert.equal(deckFor(d).find(s=>s.sourceId==='t').text,'Edited body');
 d.slideOrder=['text-t'];same(d);assert.equal(deckFor(d)[0].sourceId,'t');
 d.wordsPerSlide=20;d.includePassage=false;same(d);
});
test('Live snapshots never share slide objects with the studio deck cache',()=>{
 const d=cleanDraft(structuredClone(DEFAULT)),cached=deckFor(d),live=snapshot(d);
 assert.notEqual(live.slides,cached);assert.notEqual(live.slides[0],cached[0]);
 d.notes[0].meaning='Changed after send';assert.equal(live.slides[1].note.meaning,DEFAULT.notes[0].meaning);
});
test('Fast saves still back up the previous save and still reject damaged or foreign data',()=>{
 const storage=new MemoryStorage(),lib=cleanLibrary(null,DEFAULT);
 lib.savedAt=1;saveLibrary(storage,lib);const first=storage.getItem(LIBRARY_KEY);
 lib.savedAt=2;saveLibrary(storage,lib);assert.equal(storage.getItem(BACKUP_KEY),first);
 // Another tab writes a valid library: it is validated and kept as the backup.
 const other=cleanLibrary(null,DEFAULT);other.shows.push(createShow('Other tab'));const otherText=JSON.stringify(other);storage.setItem(LIBRARY_KEY,otherText);
 lib.savedAt=3;saveLibrary(storage,lib);assert.equal(storage.getItem(BACKUP_KEY),otherText);
 // Damaged primary data is never copied over the good backup.
 const good=storage.getItem(BACKUP_KEY);storage.setItem(LIBRARY_KEY,'{broken');lib.savedAt=4;saveLibrary(storage,lib);
 assert.equal(storage.getItem(BACKUP_KEY),good);assert.equal(readLibrary(storage,DEFAULT).library.savedAt,4);
});
