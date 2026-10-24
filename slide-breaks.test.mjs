import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT,cleanDraft,cleanTextSlide,makeDeck,snapshot,paginateSections,highlightSegments} from './dist/core.mjs';
import {cleanLibrary,createShow,mergeShows,applyBiblePassage,applyPastedNKJV,NKJV_CREDIT} from './dist/library.mjs';
import {fitStage} from './dist/fit.mjs';
const pasted='First line\r\nstill first slide\r\n\r\nSecond slide\n \t \n\n\n\nThird slide\n\n';
test('Blank lines, including whitespace-only and CRLF lines, start new slides without empty slides',()=>{
 assert.deepEqual(paginateSections(pasted),['First line\nstill first slide','Second slide','Third slide']);
 assert.deepEqual(paginateSections('\n\n\n'),[]);assert.deepEqual(paginateSections('One\nTwo'),['One\nTwo']);
 const long=Array.from({length:120},(_,i)=>'word'+i).join(' '),pages=paginateSections(long+'\n\nShort',45);
 assert(pages.length>2);assert.equal(pages.at(-1),'Short');assert.equal(pages.slice(0,-1).join(' '),long);
});
test('Pasted passages and text slide bodies split on blank lines and keep highlights and order',()=>{
 const d=cleanDraft({...DEFAULT,reference:'Notes',passage:pasted,notes:[{id:'s',word:'slide',color:'#123456',emphasis:'underline'}],textSlides:[{id:'t',heading:'Song',body:'Verse one\nline two\r\n\r\n\r\nChorus'}]});
 const deck=makeDeck(d),passage=deck.filter(s=>s.type==='passage'),text=deck.filter(s=>s.type==='text');
 assert.deepEqual(passage.map(s=>s.text),['First line\nstill first slide','Second slide','Third slide']);
 assert.deepEqual(passage.map(s=>[s.page,s.pages]),[[1,3],[2,3],[3,3]]);
 assert.deepEqual(text.map(s=>s.text),['Verse one\nline two','Chorus']);assert.deepEqual(text.map(s=>s.id),['text-t','text-t-page-1']);
 const sent=snapshot(d);assert.deepEqual(highlightSegments(sent.slides[1].text,sent.style.highlights).filter(x=>x.color).map(x=>x.text),['slide']);
 d.passage='Changed';assert.equal(sent.slides[0].text,'First line\nstill first slide');
});
test('Fetched verses keep one verse per slide and NKJV paste keeps its credit with blank-line slides',()=>{
 const d=createShow('Range').draft,verses=[1,2].map(n=>({book_id:'JHN',book:'John',chapter:1,verse:n,text:'Verse '+n}));
 applyBiblePassage(d,{reference:'John 1:1-2',text:'Verse 1\n\nVerse 2',verses},'kjv');
 assert.deepEqual(makeDeck(d).map(s=>s.reference),['John 1:1','John 1:2']);
 applyPastedNKJV(d,'In the beginning\r\n\r\nwas the Word','John 1:1');
 assert.deepEqual(makeDeck(d).map(s=>s.text),['In the beginning','was the Word']);assert.equal(snapshot(d).style.scriptureAttribution,NKJV_CREDIT);
});
test('Saved, exported and imported shows keep blank-line separators',()=>{
 const d=cleanDraft({...DEFAULT,passage:pasted,textSlides:[cleanTextSlide({id:'t',body:'A\r\n\r\nB'})]});
 const lib=cleanLibrary(null,d),exported=JSON.parse(JSON.stringify(lib)),target=cleanLibrary(null,DEFAULT);
 mergeShows(target,exported);const imported=target.shows.at(-1).draft;
 assert.equal(imported.passage,pasted);
 assert.equal(imported.textSlides[0].body,'A\r\n\r\nB');
 assert.deepEqual(makeDeck(imported).map(s=>s.text),makeDeck(d).map(s=>s.text));
 const session=cleanDraft(JSON.parse(JSON.stringify({format:'wordlight-session',version:1,draft:d})).draft);assert.equal(session.passage,d.passage);
});
// A tiny stand-in for the DOM: text overflows while font-size times its factor is above the limit.
const element=base=>({dataset:{baseSize:String(base)},style:{fontSize:base+'px'}});
function stage({verseBase,verseLimit,textParts,textLimit}){
 const verse=verseBase&&{dataset:{baseSize:String(verseBase)},style:{fontSize:verseBase+'px'},clientWidth:1000,scrollWidth:0,get scrollHeight(){return parseFloat(this.style.fontSize)>verseLimit()?999:100;}};
 const parts=(textParts||[]).map(b=>element(b));
 const content=textParts&&{dataset:{},clientHeight:500,clientWidth:1000,scrollWidth:0,querySelectorAll:()=>parts,get scrollHeight(){return parseFloat(parts[0].style.fontSize)>textLimit()?999:100;}};
 return {frame:{dataset:{},querySelector:s=>s==='.text-slide-layout'?content:s==='.verse-text'?verse:null},verse,parts};
}
test('Refitting starts from design sizes, so a later narrower font can grow text back and clear the notice',()=>{
 let limit=60;const v=stage({verseBase:88,verseLimit:()=>limit});
 fitStage(v.frame);assert.equal(v.verse.style.fontSize,'60px');
 limit=80;fitStage(v.frame);assert.equal(v.verse.style.fontSize,'80px');
 limit=200;fitStage(v.frame);assert.equal(v.verse.style.fontSize,'88px');
 let textLimit=40;const t=stage({textParts:[96,56],textLimit:()=>textLimit});
 fitStage(t.frame);assert.equal(t.frame.dataset.autofit,'true');assert(parseFloat(t.parts[0].style.fontSize)<=40);
 textLimit=500;fitStage(t.frame);assert.equal(t.frame.dataset.autofit,'false');assert.equal(t.parts[0].style.fontSize,'96px');assert.equal(t.parts[1].style.fontSize,'56px');
});
