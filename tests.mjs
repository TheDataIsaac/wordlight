import {cleanTextSlide} from './dist/core.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT,paginate,makeDeck,cleanDraft,snapshot,occurrences,validLive} from './dist/core.mjs';
test('Long passages keep every word, in order, across slides',()=>{
 const text=Array.from({length:15000},(_,i)=>'verse'+i+(i%13===0?'\n\n':' ')).join('');
 const pages=paginate(text,45);assert(pages.length>300);
 assert.equal(pages.join(' ').replace(/\s/g,''),text.replace(/\s/g,''));
 assert(pages.every(p=>p.length<=630));
});
test('Long words and unspaced Unicode text fit without being dropped',()=>{
 const text='א'.repeat(4000)+' '+'耶穌'.repeat(2000);
 const pages=paginate(text);assert(pages.every(p=>p.length<=630));
 assert.equal(pages.join('').replace(/\s/g,''),text.replace(/\s/g,''));
});
test('Word matching respects whole words, Unicode and punctuation',()=>{
 assert.equal(occurrences('Word, word. words sword Word','word'),3);
 assert.equal(occurrences('God Godly God’s','God'),2);
 assert.equal(occurrences('λόγος λόγος, λογος','λόγος'),2);
 assert.equal(occurrences('C++ is C++','C++'),2);
 assert.equal(occurrences('the Word, the word','the word'),2);
});
test('Live decks are snapshots, with draft changes kept separate',()=>{
 const d=structuredClone(DEFAULT),live=snapshot(d);
 d.passage='New draft';d.notes[0].meaning='Changed';d.theme='forest';
 assert.equal(live.slides[0].text,DEFAULT.passage);
 assert.equal(live.slides[1].note.meaning,DEFAULT.notes[0].meaning);
 assert.equal(live.style.theme,'midnight');assert(validLive(live));
});
test('Long explanations create multiple complete word-study slides',()=>{
 const d=structuredClone(DEFAULT);d.notes[0].meaning=Array.from({length:300},(_,i)=>'meaning'+i).join(' ');
 const deck=makeDeck(d).filter(s=>s.type==='study');assert(deck.length>5);
 assert.equal(deck.map(s=>s.note.meaning).join(' '),d.notes[0].meaning);
});
test('Imported session bounds and theme values are normalized',()=>{
 const d=cleanDraft({...DEFAULT,theme:'bad',fontSize:900,wordsPerSlide:-3});
 assert.equal(d.theme,'midnight');assert.equal(d.fontSize,112);assert.equal(d.wordsPerSlide,20);
 assert.throws(()=>cleanDraft({schema:2,passage:'bad'}));assert(!validLive({schema:1,slides:[{}],index:0,style:{theme:'midnight'}}));
});

import {getHighlights,highlightSegments} from './dist/core.mjs';
test('Several words retain distinct colors across repeated whole-word matches',()=>{
 const text='faith, hope and love. Faith is not faithfulness.';
 const spans=highlightSegments(text,[{word:'faith',color:'#e6c68a'},{word:'hope',color:'#8fcde8'},{word:'love',color:'#eea0b7'}]);
 assert.equal(spans.map(s=>s.text).join(''),text);
 assert.deepEqual(spans.filter(s=>s.color).map(s=>[s.text,s.color]),[['faith','#e6c68a'],['hope','#8fcde8'],['love','#eea0b7'],['Faith','#e6c68a']]);
});
test('Overlapping phrases take precedence over individual words without losing text',()=>{
 const text='the Word of God and the Word';
 const spans=highlightSegments(text,[{word:'Word',color:'#8fcde8'},{word:'Word of God',color:'#e6c68a'}]);
 assert.equal(spans.map(s=>s.text).join(''),text);
 assert.deepEqual(spans.filter(s=>s.color).map(s=>[s.text,s.color]),[['Word of God','#e6c68a'],['Word','#8fcde8']]);
});
test('Saved sessions keep word colors and older sessions follow the theme',()=>{
 const d=structuredClone(DEFAULT);d.notes[0].color='#8FCDE8';
 const reopened=cleanDraft(JSON.parse(JSON.stringify(d)));
 assert.equal(reopened.notes[0].color,'#8fcde8');
 assert.equal(getHighlights(reopened)[0].color,'#8fcde8');
 delete d.notes[0].color;d.accent='#123456';
 assert.equal(getHighlights(cleanDraft(d))[0].color,'#123456');
});
test('Sent colors stay unchanged while the draft colors are edited',()=>{
 const d=structuredClone(DEFAULT);d.notes[0].color='#8fcde8';
 const sent=snapshot(d);d.notes[0].color='#eea0b7';
 assert.equal(sent.style.highlights[0].color,'#8fcde8');
 assert.equal(sent.slides[1].note.color,'#8fcde8');
 assert.equal(getHighlights(d)[0].color,'#eea0b7');
});
test('Invalid color values are rejected before rendering or saving',()=>{
 const d=structuredClone(DEFAULT);d.notes[0].color='red";onclick="bad';
 const normalized=cleanDraft(d);assert.equal(normalized.notes[0].color,'');
 const spans=highlightSegments('Word',[{word:'Word',color:'red";onclick="bad'}],'#8fcde8');
 assert.equal(spans[0].color,'#8fcde8');
});

test('Highlight-only selections color the passage without creating empty word slides',()=>{
 const d=structuredClone(DEFAULT);d.passage='Faith, hope and love.';
 d.notes=['Faith','hope','love'].map((word,i)=>({id:String(i),word,color:['#e6c68a','#8fcde8','#eea0b7'][i],meaning:'',original:'',transliteration:'',strong:''}));
 assert.equal(makeDeck(d).length,1);assert.equal(snapshot(d).style.highlights.length,3);
 d.notes[0].meaning='An explanation for this word.';assert.equal(makeDeck(d).length,2);
});

test('Per-word styles survive save and keep sent snapshots unchanged',()=>{
 const d=cleanDraft({...DEFAULT,notes:[{id:'p',word:'power',color:'#ffff00',emphasis:'highlight'},{id:'e',word:'enemy',color:'#8fcde8',emphasis:'underline'}]});
 const saved=cleanDraft(JSON.parse(JSON.stringify(d)));const sent=snapshot(saved);saved.notes[0].emphasis='outline';
 assert.equal(sent.style.highlights[0].emphasis,'highlight');assert.equal(sent.style.highlights[1].emphasis,'underline');
 assert.deepEqual(highlightSegments('power over the enemy',sent.style.highlights).filter(x=>x.color).map(x=>x.emphasis),['highlight','underline']);
 assert.equal(cleanDraft({...d,notes:[{word:'power',emphasis:'invalid'}]}).notes[0].emphasis,'highlight');
});
test('Text slide formatting and independent word scopes survive save and send',()=>{
 const d=cleanDraft({...DEFAULT,includePassage:false,textSlides:[{id:'a',heading:'My heading',subtitle:'My subheading',body:'My own text',headingSize:120,bodySize:64,layout:'split',bold:true,align:'right',background:'#123456'}],notes:[{word:'text',slideId:'a',emphasis:'underline',color:'#abcdef'}]});
 const sent=snapshot(d);assert(validLive(sent));assert.equal(sent.slides.length,1);assert.equal(sent.slides[0].heading,'My heading');assert.equal(sent.slides[0].format.layout,'split');assert.equal(sent.style.highlights[0].slideId,'a');
 d.textSlides[0].heading='Draft edit';d.textSlides[0].bodySize=80;assert.equal(sent.slides[0].heading,'My heading');assert.equal(sent.slides[0].format.bodySize,64);
 const restored=cleanDraft(JSON.parse(JSON.stringify(d)));assert.equal(restored.textSlides[0].background,'#123456');assert.equal(restored.notes[0].slideId,'a');
});
test('Text slide pagination keeps all words and honors deck order',()=>{
 const body=Array.from({length:1500},(_,i)=>'idea'+i).join(' ');
 const d=cleanDraft({...DEFAULT,includePassage:false,textSlides:[{id:'a',body},{id:'b',heading:'First'}],slideOrder:['text-b','text-a']});
 const deck=makeDeck(d);assert.equal(deck[0].sourceId,'b');assert.equal(deck.filter(x=>x.sourceId==='a').map(x=>x.text).join(' '),body);
 assert(deck.filter(x=>x.sourceId==='a').length>5);assert.equal(new Set(deck.map(x=>x.id)).size,deck.length);
});

test('Font choices and combined bold/italic word styling survive saved decks',()=>{
 const d=cleanDraft({...DEFAULT,font:'verdana',bold:true,italic:true,textSlides:[{id:'font-slide',heading:'Title',headingFont:'arial',subtitleFont:'times',font:'trebuchet',headingBold:false,headingItalic:true,subtitleBold:true}],notes:[{word:'Title',slideId:'font-slide',emphasis:'underline',bold:true,italic:true}]});
 const restored=cleanDraft(JSON.parse(JSON.stringify(d)));assert.equal(restored.font,'verdana');assert.equal(restored.textSlides[0].headingFont,'arial');assert.equal(restored.textSlides[0].headingBold,false);assert.equal(restored.textSlides[0].subtitleBold,true);
 const live=snapshot(restored);assert.equal(live.style.bold,true);assert.equal(live.style.italic,true);
 const segment=highlightSegments('Title',live.style.highlights)[0];assert.equal(segment.emphasis,'underline');assert.equal(segment.bold,true);assert.equal(segment.italic,true);
});

import {cleanLibrary,createShow,activeShow,mergeShows,slideGroups,moveGroups,removeGroups,copyGroups} from './dist/library.mjs';
import {adjacentVerse,rangeFromResponse} from './dist/scripture.mjs';
test('Legacy sessions migrate to a show without losing text, formatting, or word styles',()=>{
 const old=cleanDraft({...DEFAULT,textSlides:[{id:'a',heading:'Welcome',font:'arial'}],notes:[{id:'w',word:'Welcome',slideId:'a',emphasis:'underline',color:'#123456',bold:true}]});
 const lib=cleanLibrary(null,old),saved=cleanLibrary(JSON.parse(JSON.stringify(lib)));
 assert.deepEqual(activeShow(saved).draft,old);assert.equal(saved.shows.length,1);
 const duplicate=createShow('Copy',old);duplicate.draft.textSlides[0].heading='Changed';assert.equal(old.textSlides[0].heading,'Welcome');
});
test('Library and old-session imports append independent shows without replacing existing work',()=>{
 const lib=cleanLibrary(null,DEFAULT),originalId=lib.activeShowId;
 assert.equal(mergeShows(lib,{draft:cleanDraft({...DEFAULT,title:'Imported'})}),1);
 assert.equal(lib.shows.length,2);assert.equal(lib.shows[0].id,originalId);
 const imported=JSON.parse(JSON.stringify(lib));mergeShows(lib,imported);
 assert.equal(new Set(lib.shows.map(s=>s.id)).size,4);
 assert.throws(()=>cleanLibrary({...lib,shows:[lib.shows[0],lib.shows[0]]}),/unique/);
});
test('Bulk reorder preserves selected order and continuation pages, delete keeps sent snapshot intact',()=>{
 const d=createShow('Set').draft;d.textSlides=['a','b','c','d'].map(id=>cleanTextSlide({id,heading:id,body:id==='b'?('Long text '.repeat(160)):'Body'}));
 moveGroups(d,['text-b','text-c'],-1);assert.deepEqual(slideGroups(d).map(g=>g.id),['text-b','text-c','text-a','text-d']);
 moveGroups(d,['text-b','text-c'],1);assert.deepEqual(slideGroups(d).map(g=>g.id),['text-a','text-b','text-c','text-d']);
 const sent=snapshot(d);const count=sent.slides.length;removeGroups(d,['text-b','text-c']);
 assert.deepEqual(slideGroups(d).map(g=>g.id),['text-a','text-d']);assert.equal(sent.slides.length,count);
 assert.ok(count>4);
});
test('Copy across shows retains scoped marks and uses independent slide IDs',()=>{
 const source=createShow('Source').draft,target=createShow('Destination').draft;
 source.textSlides=[cleanTextSlide({id:'a',heading:'Hello',font:'mono',headingItalic:true})];
 source.notes=[{id:'w',word:'Hello',slideId:'a',emphasis:'underline',color:'#123456',bold:true}];
 const ids=copyGroups(source,target,['text-a']);assert.equal(ids.length,1);
 assert.notEqual(target.textSlides[0].id,'a');assert.equal(target.notes[0].slideId,target.textSlides[0].id);assert.equal(target.notes[0].emphasis,'underline');assert.equal(target.textSlides[0].font,'mono');
 target.textSlides[0].heading='Different';target.notes[0].color='#ffffff';assert.equal(source.textSlides[0].heading,'Hello');assert.equal(source.notes[0].color,'#123456');
});
test('Keeping Bible blocks allows multiple passages and copying to self never duplicates unrelated marks',()=>{
 const d=cleanDraft({...DEFAULT,reference:'Luke 10:19',passage:'I give unto you power.',notes:[{id:'p',word:'power',color:'#123456',emphasis:'highlight'}]});
 const ids=copyGroups(d,d,['bible']);assert.equal(ids.length,1);assert.equal(d.textSlides[0].footer,'Luke 10:19 · KJV');
 d.reference='Luke 10:20';d.passage='Rejoice.';assert.equal(d.textSlides[0].body,'I give unto you power.');
 d.includePassage=false;assert.equal(makeDeck(d).length,1);
 const before=JSON.stringify(d);const full={...d,textSlides:Array.from({length:200},(_,i)=>cleanTextSlide({id:'full'+i}))};assert.throws(()=>copyGroups(d,full,ids),/200/);assert.equal(JSON.stringify(d),before);
});
const verse=(book,chapter,n)=>({book_id:book,book,chapter,verse:n,text:book+' '+chapter+':'+n});
const bibleFixture={
 '/data/kjv':{books:[{id:'AAA'},{id:'BBB'}]},
 '/data/kjv/AAA':{chapters:[{book_id:'AAA',chapter:1},{book_id:'AAA',chapter:2}]},
 '/data/kjv/BBB':{chapters:[{book_id:'BBB',chapter:1}]},
 '/data/kjv/AAA/1':{verses:[verse('AAA',1,1),verse('AAA',1,2),verse('AAA',1,4)]},
 '/data/kjv/AAA/2':{verses:[verse('AAA',2,1),verse('AAA',2,2)]},
 '/data/kjv/BBB/1':{verses:[verse('BBB',1,1),verse('BBB',1,2)]}
};
const getFixture=async path=>{if(!bibleFixture[path])throw new Error('Unexpected request '+path);return bibleFixture[path];};
const range=(...verses)=>rangeFromResponse({verses},'kjv');
test('Verse navigation respects range endpoints and unavailable verse numbers',async()=>{
 assert.equal((await adjacentVerse(range(verse('AAA',1,2)),1,getFixture)).reference,'AAA 1:4');
 assert.equal((await adjacentVerse(range(verse('AAA',1,2),verse('AAA',1,4)),-1,getFixture)).reference,'AAA 1:1');
 assert.equal((await adjacentVerse(range(verse('AAA',1,2),verse('AAA',1,4)),1,getFixture)).reference,'AAA 2:1');
});
test('Verse navigation crosses chapters and books in both directions and stops at Bible bounds',async()=>{
 assert.equal((await adjacentVerse(range(verse('AAA',2,1)),-1,getFixture)).reference,'AAA 1:4');
 assert.equal((await adjacentVerse(range(verse('AAA',2,2)),1,getFixture)).reference,'BBB 1:1');
 assert.equal((await adjacentVerse(range(verse('BBB',1,1)),-1,getFixture)).reference,'AAA 2:2');
 assert.equal(await adjacentVerse(range(verse('AAA',1,1)),-1,getFixture),null);
 assert.equal(await adjacentVerse(range(verse('BBB',1,2)),1,getFixture),null);
});
test('Invalid verse metadata and failed network lookup cannot fabricate the next verse',async()=>{
 assert.equal(rangeFromResponse({verses:[]},'kjv'),null);
 await assert.rejects(()=>adjacentVerse(null,1,getFixture),/Look up/);
 await assert.rejects(()=>adjacentVerse(range(verse('AAA',1,3)),1,getFixture),/unavailable/);
 await assert.rejects(()=>adjacentVerse(range(verse('AAA',1,1)),1,async()=>{throw new Error('Offline');}),/Offline/);
});

test('Returning to a verse restores saved word studies after reload and preserves text-slide styles',async()=>{
 const {applyBiblePassage}=await import('./dist/library.mjs');
 let d=cleanDraft({...DEFAULT,reference:'AAA 1:1',passage:'One',translation:'KJV',notes:[{id:'one',word:'One',meaning:'Study note',color:'#ff0000'},{id:'heading',word:'Heading',slideId:'title',color:'#0000ff'}]});
 applyBiblePassage(d,{reference:'AAA 1:2',text:'Two',verses:[verse('AAA',1,2)]},'kjv');
 assert.equal(d.notes.length,2);assert.equal(d.notes[1].slideId,'title');
 d=cleanDraft(JSON.parse(JSON.stringify(d)));
 applyBiblePassage(d,{reference:'AAA 1:1',text:'One',verses:[verse('AAA',1,1)]},'kjv');
 assert.equal(d.notes.find(n=>n.word==='One').meaning,'Study note');assert.equal(d.notes.find(n=>n.slideId==='title').color,'#0000ff');
});

test('A Bible range becomes separately referenced verse slides and survives save/reopen',async()=>{
 const {applyBiblePassage}=await import('./dist/library.mjs');
 let d=createShow('Range').draft;
 const verses=[18,19,20].map(n=>({...verse('LUK',10,n),book:'Luke'}));
 applyBiblePassage(d,{reference:'Luke 10:18-20',text:verses.map(v=>v.text).join(' '),verses},'kjv');
 let deck=makeDeck(d);assert.deepEqual(deck.map(s=>s.reference),['Luke 10:18','Luke 10:19','Luke 10:20']);
 assert.equal(deck[1].text,'LUK 10:19');
 d=cleanDraft(JSON.parse(JSON.stringify(d)));deck=makeDeck(d);assert.equal(deck.length,3);
 const mid=deck[1].id;moveGroups(d,[mid],-1);assert.equal(makeDeck(d)[0].reference,'Luke 10:19');
 const sent=snapshot(d);removeGroups(d,[mid]);assert.deepEqual(makeDeck(d).map(s=>s.reference),['Luke 10:18','Luke 10:20']);assert.equal(sent.slides.length,3);
 assert.equal(makeDeck(cleanDraft(JSON.parse(JSON.stringify(d)))).length,2);
 const destination=createShow('Copies').draft;copyGroups(d,destination,[makeDeck(d)[0].id]);assert.equal(destination.textSlides.length,1);assert.equal(destination.textSlides[0].footer,'Luke 10:18 · KJV');
});
test('Pasted text keeps length-based pagination without invented verse boundaries',()=>{
 const d=cleanDraft({...DEFAULT,notes:[],passage:'Text '.repeat(100)});const deck=makeDeck(d);assert.ok(deck.length>1);assert.ok(deck.every(s=>!s.versePoint));assert.equal(deck.map(s=>s.text).join(' ').split(/\s+/).length,100);
});

test('Duplicating slides in the same show preserves wording, inheritance, order, and independent styles',()=>{
 const d=createShow('Copies').draft;d.textSlides=[cleanTextSlide({id:'original',heading:'Welcome',body:'Same wording',font:'',theme:''})];
 d.notes=[{id:'style',word:'Welcome',slideId:'original',color:'',emphasis:'underline',bold:true}];
 const ids=copyGroups(d,d,['text-original']);assert.equal(ids.length,1);assert.equal(d.textSlides.length,2);
 assert.equal(d.textSlides[1].heading,'Welcome');assert.equal(d.textSlides[1].body,'Same wording');assert.equal(d.textSlides[1].font,'');assert.equal(d.textSlides[1].theme,'');
 assert.equal(d.notes[1].color,'');assert.notEqual(d.notes[1].id,d.notes[0].id);
 const sent=snapshot(d);removeGroups(d,[ids[0]]);assert.equal(d.textSlides.length,1);assert.equal(d.notes.length,1);assert.equal(sent.slides.length,2);
});

test('Changing verses preserves the exact chosen words, styles, explanations, and selected word',async()=>{
 const {applyBiblePassage}=await import('./dist/library.mjs');
 const d=cleanDraft({...DEFAULT,selectedNoteId:'word1',notes:[{id:'word1',word:'power',emphasis:'underline',color:'#00ff00',bold:true,italic:true,meaning:'Authority'},{id:'word2',word:'enemy',color:'#ff0000',emphasis:'highlight'}]});
 const before=JSON.stringify(d.notes);applyBiblePassage(d,{reference:'Luke 10:20',text:'Rejoice.',verses:[{...verse('LUK',10,20),book:'Luke'}]},'kjv');
 assert.equal(JSON.stringify(d.notes),before);assert.equal(d.selectedNoteId,'word1');
 applyBiblePassage(d,{reference:'Luke 10:19',text:'Power over the enemy.',verses:[{...verse('LUK',10,19),book:'Luke'}]},'web');
 assert.equal(JSON.stringify(d.notes),before);assert.equal(cleanDraft(JSON.parse(JSON.stringify(d))).selectedNoteId,'word1');
});
import {cleanTimer,timerValue,formatTimer,changeTimer} from './dist/timer.mjs';
test('Countdown pause, resume, reset, and completion are deterministic across displays',()=>{
 let timer=changeTimer({durationMs:60000,valueMs:60000,visible:true},'start',1000);
 assert.equal(timerValue(timer,11000),50000);timer=changeTimer(timer,'pause',11000);
 assert.equal(timerValue(timer,50000),50000);timer=changeTimer(timer,'start',51000);
 assert.equal(formatTimer(timerValue(timer,62000)),'00:39');assert.equal(timerValue(timer,200000),0);
 const remote=JSON.parse(JSON.stringify(timer));assert.equal(timerValue(remote,70000),timerValue(timer,70000));
 timer=changeTimer(timer,'reset',70000);assert.equal(timer.running,false);assert.equal(timerValue(timer,90000),60000);assert.equal(timer.visible,true);
});
test('Stopwatch, visibility, duration, and overlay position survive persistence safely',()=>{
 let timer=cleanTimer({mode:'stopwatch',valueMs:0,position:'bottom-left'});
 timer=changeTimer(timer,'start',1000);assert.equal(formatTimer(timerValue(timer,62000)),'01:01');
 timer=changeTimer(timer,'show',62000);assert.equal(timer.visible,true);assert.equal(timer.running,true);
 timer=changeTimer(timer,'hide',63000);assert.equal(timerValue(timer,64000),63000);
 const restored=cleanTimer(JSON.parse(JSON.stringify(timer)));assert.deepEqual(restored,timer);
 assert.equal(cleanTimer({position:'bad',durationMs:-10}).position,'top-right');
 assert.equal(formatTimer(3661000),'1:01:01');
});

import {lookupYoruba,parseYorubaReference,yorubaChapter,adjacentYoruba} from './dist/yoruba.mjs';
import {readLibrary,saveLibrary,chooseLocalLibrary,LIBRARY_KEY,BACKUP_KEY} from './dist/storage.mjs';
class MemoryStorage{
 constructor(){this.values=new Map();this.failPrimaryOnce=false;}
 get length(){return this.values.size;}key(i){return [...this.values.keys()][i]??null;}
 getItem(k){return this.values.get(k)??null;}setItem(k,v){if(k===LIBRARY_KEY&&this.failPrimaryOnce){this.failPrimaryOnce=false;throw new Error('quota');}this.values.set(k,String(v));}removeItem(k){this.values.delete(k);}
}
test('Passage layout is a saved choice and switching modes does not change words or drop text',async()=>{
 const {applyBiblePassage}=await import('./dist/library.mjs');
 const d=createShow('Layouts').draft,verses=[18,19,20].map(n=>({...verse('LUK',10,n),book:'Luke'}));
 d.notes=[{id:'power',word:'power',color:'#ff0000',emphasis:'underline'}];const before=JSON.stringify(d.notes);
 applyBiblePassage(d,{reference:'Luke 10:18-20',text:verses.map(v=>v.text).join('\n'),verses},'kjv');
 assert.equal(makeDeck(d).filter(s=>s.type==='passage').length,3);
 d.passageLayout='flow';const flow=makeDeck(d).filter(s=>s.type==='passage');assert.equal(flow.length,1);assert.equal(flow[0].text,verses.map(v=>v.text).join('\n'));
 assert.equal(cleanDraft(JSON.parse(JSON.stringify(d))).passageLayout,'flow');assert.equal(JSON.stringify(d.notes),before);
 d.passageLayout='verses';assert.equal(makeDeck(d).filter(s=>s.type==='passage').length,3);
});
test('Yoruba reference parsing accepts English, local names, accents, book codes, and validates ranges',()=>{
 assert.equal(parseYorubaReference('Luke 10:18-20').book.id,'LUK');assert.equal(parseYorubaReference('Luku 10:18-20').last,20);
 assert.equal(parseYorubaReference('Gẹnẹsisi 1:1').book.id,'GEN');assert.equal(parseYorubaReference('Genesisi 1:1').book.id,'GEN');
 assert.equal(parseYorubaReference('1 John 2:1').book.id,'1JN');assert.equal(parseYorubaReference('LUK 10:42-11:2').endChapter,11);
 assert.throws(()=>parseYorubaReference('Luke 10:20-18'),/Check/);assert.throws(()=>parseYorubaReference('Luke 99:1'),/Check/);
});
test('Yoruba lookup preserves diacritics and verse metadata with chapter crossing navigation',async()=>{
 const chapter=(number,verses)=>({book:{id:'LUK',name:'Luku'},chapter:{number,content:verses.map(([n,text])=>({type:'verse',number:n,text}))}});
 const rows={'/yoruba/LUK/10':chapter(10,[[18,'Ọ̀run'],[19,'Àṣẹ àti agbára'],[20,'Ẹ yọ̀'],[42,'Ọ̀rọ̀']]),'/yoruba/LUK/11':chapter(11,[[1,'Àdúrà'],[2,'Baba']])};
 const get=async p=>{if(!rows[p])throw new Error(p);return rows[p];};
 const response=await lookupYoruba('Luke 10:18-20',get);assert.equal(response.reference,'Luku 10:18-20');assert.equal(response.verses.length,3);assert.match(response.text,/Àṣẹ àti agbára/);
 const range={translation:'oycb',start:{bookId:'LUK',chapter:10,verse:42},end:{bookId:'LUK',chapter:10,verse:42}};
 assert.equal((await adjacentYoruba(range,1,get)).reference,'Luku 11:1');
 const crossing=await lookupYoruba('Luku 10:42-11:2',get);assert.equal(crossing.verses.length,3);
 await assert.rejects(()=>lookupYoruba('Luke 10:99',get),/starting verse/);
});
test('Refresh retains the full library and recovers the previous good save when primary data is damaged',()=>{
 const storage=new MemoryStorage(),lib=cleanLibrary(null,DEFAULT);lib.savedAt=10;saveLibrary(storage,lib);
 lib.shows.push(createShow('Second show'));lib.savedAt=20;saveLibrary(storage,lib);
 assert.equal(readLibrary(storage,DEFAULT).library.shows.length,2);
 storage.setItem(LIBRARY_KEY,'broken JSON');const recovered=readLibrary(storage,DEFAULT);assert.equal(recovered.recovered,true);assert.equal(recovered.library.shows.length,1);
 const oldBackup=storage.getItem(BACKUP_KEY);saveLibrary(storage,recovered.library);assert.equal(storage.getItem(BACKUP_KEY),oldBackup);assert.equal(readLibrary(storage,DEFAULT).recovered,false);
});
test('Save pressure evicts lookup caches only and never erases saved shows or live output',()=>{
 const storage=new MemoryStorage(),lib=cleanLibrary(null,DEFAULT);storage.setItem('wordlight-bible-v2-test','cached verse');storage.setItem('wordlight-live','live');storage.setItem('other-app','keep');
 storage.failPrimaryOnce=true;saveLibrary(storage,lib);assert.equal(readLibrary(storage,DEFAULT).library.shows.length,1);
 assert.equal(storage.getItem('wordlight-bible-v2-test'),null);assert.equal(storage.getItem('wordlight-live'),'live');assert.equal(storage.getItem('other-app'),'keep');
});
test('Local refresh selects newer browser edits, but a fresh browser cannot overwrite saved server shows',()=>{
 const browser=cleanLibrary(null,DEFAULT),server=cleanLibrary(null,DEFAULT);browser.savedAt=500;server.savedAt=400;browser.shows[0].updated=500;server.shows[0].updated=400;
 assert.equal(chooseLocalLibrary(browser,server),browser);
 const fresh=readLibrary(new MemoryStorage(),DEFAULT).library;assert.equal(chooseLocalLibrary(fresh,server),server);
 server.savedAt=600;assert.equal(chooseLocalLibrary(browser,server),server);
});

import {applyPastedNKJV,NKJV_CREDIT} from './dist/library.mjs';
test('Explicit NKJV paste preserves wording, chosen words and saved copyright without online navigation',()=>{
 const d=structuredClone(DEFAULT),notes=structuredClone(d.notes),text='  User-provided NKJV passage.\nSecond line.  ';
 applyPastedNKJV(d,text,'Luke 10:19');
 assert.equal(d.passage,text.trim());assert.equal(d.translation,'NKJV');assert.deepEqual(d.notes,notes);
 assert.equal(d.scriptureAttribution,NKJV_CREDIT);assert.equal(d.verseRange,null);assert.deepEqual(d.bibleVerses,[]);
 const saved=cleanDraft(JSON.parse(JSON.stringify(d)));assert.equal(saved.scriptureAttribution,NKJV_CREDIT);assert.equal(snapshot(saved).style.scriptureAttribution,NKJV_CREDIT);
 const before=JSON.stringify(d);assert.throws(()=>applyPastedNKJV(d,'','Luke 10:19'),/Paste/);assert.equal(JSON.stringify(d),before);
 assert.throws(()=>applyPastedNKJV(d,'text',''),/reference/);assert.equal(JSON.stringify(d),before);
});
test('Tab completes the typed book to its full name and keeps the chapter and verse',async()=>{
 const {completeBook}=await import('./dist/reference.mjs');
 assert.equal(completeBook('song'),'Song of Solomon ');assert.equal(completeBook('song 2:1'),'Song of Solomon 2:1');
 assert.equal(completeBook('jn 3:16'),'John 3:16');assert.equal(completeBook('luku 10:18'),'Luke 10:18','a Yoruba name too');
 assert.equal(completeBook('John 3:16'),null,'nothing to complete: Tab moves focus');assert.equal(completeBook('xyz 1'),null);assert.equal(completeBook(''),null);
});
