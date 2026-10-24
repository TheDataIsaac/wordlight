import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT,cleanDraft,cleanTextSlide,makeDeck,snapshot,validLive,fitPadding,FIT_PADDING} from './dist/core.mjs';
import {cleanLibrary,createShow,activeShow,addScene,switchScene,sceneDraft,copyShow,mergeShows,moveSlides,removeSlides,copySlides,moveGroups,slideGroups,applyPastedNKJV,MAX_SCENES} from './dist/library.mjs';
import {fitStage,largestFitting,FIT_LIMITS} from './dist/fit.mjs';
import {cleanLowerThird,lowerThirdBandStyle,lowerThirdContent,TOP_SAFE,LOWER_THIRD_LIMITS} from './dist/lowerthird.mjs';
const roundTrip=d=>cleanDraft(JSON.parse(JSON.stringify(d)));

test('Fit settings default to off, keep bounds, and survive save, scenes, copies, import and live snapshots',()=>{
 const old=cleanDraft({...DEFAULT});assert.equal(old.fit,false);assert.equal(old.fitPadding,FIT_PADDING.default);
 assert.equal(cleanTextSlide({}).fit,false);assert.equal(fitPadding(-5),0);assert.equal(fitPadding(9999),240);assert.equal(fitPadding('abc'),64);
 const d=cleanDraft({...DEFAULT,fit:true,fitPadding:120,textSlides:[{id:'t',heading:'Hi',body:'Body',fit:true,fitPadding:30}]});
 assert.equal(roundTrip(d).fit,true);assert.equal(roundTrip(d).fitPadding,120);assert.equal(roundTrip(d).textSlides[0].fitPadding,30);
 const sent=snapshot(d);assert.equal(sent.style.fit,true);assert.equal(sent.style.fitPadding,120);assert.equal(sent.slides.find(s=>s.type==='text').format.fit,true);
 d.fit=false;d.fitPadding=0;d.textSlides[0].fit=false;assert.equal(sent.style.fit,true);assert.equal(sent.slides.find(s=>s.type==='text').format.fitPadding,30);
 const show=createShow('Fit',d),other=addScene(show,'Other');switchScene(show,other.id);switchScene(show,'scene-main');
 const lib=cleanLibrary(JSON.parse(JSON.stringify({format:'wordlight-library',version:1,shows:[show]})));assert.equal(activeShow(lib).draft.textSlides[0].fitPadding,30);
 const dup=copyShow(activeShow(lib));assert.equal(dup.draft.textSlides[0].fit,false);
 const target=cleanLibrary(null,DEFAULT);mergeShows(target,lib);assert.equal(activeShow(target).draft.textSlides[0].fitPadding,30);
 const copied=createShow('Copy').draft;d.fit=true;copySlides(d,copied,[makeDeck(d)[0].id]);assert.equal(copied.textSlides[0].fit,true);
});
// Fake verse slide: text height grows with font size and line count; the content box shrinks with padding.
function verseFrame({chars,fit,padding=64,base=88,areaHeight=640,areaWidth=1500}){
 const verse={dataset:{baseSize:String(base)},style:{fontSize:base+'px'},clientWidth:areaWidth,scrollWidth:0,
  get scrollHeight(){const size=parseFloat(this.style.fontSize),perLine=Math.max(1,Math.floor(areaWidth/(size*.5)));return Math.ceil(chars/perLine)*size*1.46;}};
 const area={dataset:{fit:String(fit),fitPad:String(padding)},clientHeight:areaHeight};
 let reads=0;const counted=new Proxy(verse,{get(t,k){if(k==='scrollHeight')reads++;return Reflect.get(t,k,t);}});
 return {frame:{dataset:{},querySelector:s=>s==='.verse-text'?counted:s==='.slide-content'?area:null},verse,area,reads:()=>reads};
}
test('Fit to screen grows short verses, shrinks long ones, respects padding and uses a bounded number of measurements',()=>{
 const short=verseFrame({chars:40,fit:true});fitStage(short.frame);const shortSize=parseFloat(short.verse.style.fontSize);
 assert.ok(shortSize>88,'short text grows: '+shortSize);assert.ok(short.reads()<=16,'measurements: '+short.reads());
 const long=verseFrame({chars:900,fit:true});fitStage(long.frame);const longSize=parseFloat(long.verse.style.fontSize);
 assert.ok(longSize<88&&longSize>=FIT_LIMITS.verseMin,'long text shrinks: '+longSize);
 assert.ok(long.verse.scrollHeight<=long.area.clientHeight-2*64,'fits inside the padding');
 const padded=verseFrame({chars:400,fit:true,padding:200}),loose=verseFrame({chars:400,fit:true,padding:0});
 fitStage(padded.frame);fitStage(loose.frame);assert.ok(parseFloat(padded.verse.style.fontSize)<parseFloat(loose.verse.style.fontSize));
 const manual=verseFrame({chars:40,fit:false});fitStage(manual.frame);assert.equal(manual.verse.style.fontSize,'88px','manual sizing is unchanged');
});
test('Refitting after a late font change moves Fit sizes both ways and keeps heading/body proportions',()=>{
 const f=verseFrame({chars:300,fit:true});fitStage(f.frame);const first=parseFloat(f.verse.style.fontSize);
 f.area.clientHeight=320;fitStage(f.frame);const smaller=parseFloat(f.verse.style.fontSize);assert.ok(smaller<first);
 f.area.clientHeight=640;fitStage(f.frame);assert.equal(parseFloat(f.verse.style.fontSize),first);
 const parts=[96,56].map(b=>({dataset:{baseSize:String(b)},style:{fontSize:b+'px'}}));let limit=180;
 const content={dataset:{fit:'true'},clientHeight:500,clientWidth:1000,scrollWidth:0,querySelectorAll:()=>parts,get scrollHeight(){return parseFloat(parts[0].style.fontSize)>limit?999:100;}};
 const frame={dataset:{},querySelector:s=>s==='.text-slide-layout'?content:null};
 fitStage(frame);const grown=parseFloat(parts[0].style.fontSize);assert.ok(grown>96&&grown<=180,'short text slide grows: '+grown);
 assert.ok(Math.abs(parseFloat(parts[0].style.fontSize)/parseFloat(parts[1].style.fontSize)-96/56)<.01,'proportions kept');
 limit=60;fitStage(frame);assert.ok(parseFloat(parts[0].style.fontSize)<=60);assert.equal(frame.dataset.fitmode,'true');
 let calls=0;largestFitting(1,1000,v=>{calls++;return v<500;});assert.ok(calls<=14);
});
function pastedDeck(){return cleanDraft({...DEFAULT,notes:[],reference:'Notes',passage:'One\n\nTwo\n\nThree\n\nFour'});}
test('Deck selection deletes, reorders and keeps single pasted sections without regrouping',()=>{
 const d=pastedDeck();assert.deepEqual(makeDeck(d).map(s=>s.text),['One','Two','Three','Four']);
 removeSlides(d,['passage-1']);assert.deepEqual(makeDeck(d).map(s=>s.text),['One','Three','Four']);
 moveSlides(d,['passage-3'],-1);moveSlides(d,['passage-3'],-1);assert.deepEqual(makeDeck(d).map(s=>s.text),['Four','One','Three']);
 assert.deepEqual(makeDeck(roundTrip(d)).map(s=>s.text),['Four','One','Three'],'page order survives save');
 const e=pastedDeck();moveSlides(e,['passage-0','passage-2'],1);assert.deepEqual(makeDeck(e).map(s=>s.text),['Two','One','Four','Three']);
 removeSlides(e,makeDeck(e).map(s=>s.id));assert.equal(makeDeck(e).length,0,'deleting every page removes the passage item');
 const g=pastedDeck();moveSlides(g,['passage-2'],-1);moveGroups(g,[slideGroups(g)[0].id],1);assert.equal(makeDeck(g).length,4,'organizer moves keep every page');
});
test('Copying selected pages copies only visible pages, in visible order, one slide each',()=>{
 const d=pastedDeck();removeSlides(d,['passage-1']);const all=makeDeck(d).map(s=>s.id);
 const target=createShow('T').draft;copySlides(d,target,all);assert.deepEqual(makeDeck(target).map(s=>s.text),['One','Three','Four'],'deleted middle page is not resurrected');
 const r=pastedDeck();moveSlides(r,['passage-3'],-1);const out=createShow('R').draft;copySlides(r,out,makeDeck(r).map(s=>s.id));
 assert.deepEqual(makeDeck(out).map(s=>s.text),['One','Two','Four','Three'],'reordered pages keep their order');
 const t=cleanDraft({...DEFAULT,notes:[],includePassage:false,textSlides:[{id:'x',heading:'Song',body:'A\n\nB\n\nC'}]});
 removeSlides(t,['text-x-page-1']);moveSlides(t,['text-x-page-2'],-1);
 const tt=createShow('TT').draft;copySlides(t,tt,makeDeck(t).map(s=>s.id));assert.deepEqual(makeDeck(tt).map(s=>[s.heading,s.text]),[['Song','C'],['Song','A']]);
 const study=cleanDraft({...DEFAULT,passage:'In the beginning was the Word.\n\nAnd the Word was with God.'});
 const page=makeDeck(study).find(s=>s.type==='study');const st=createShow('S').draft;copySlides(study,st,[page.id]);
 assert.equal(makeDeck(st).length,1,'one word-study page copies as one slide');assert.match(makeDeck(st)[0].text,/Word, speech/);
 const same=pastedDeck(),ids=copySlides(same,same,['passage-1']);assert.deepEqual(makeDeck(same).map(s=>s.text),['One','Two','Two','Three','Four']);assert.equal(ids.length,1);
});
test('A show with 60 scenes that all hold content and no current scene is refused instead of growing to 61',()=>{
 const show=createShow('Full'),raw=JSON.parse(JSON.stringify({format:'wordlight-library',version:1,shows:[show]}));
 raw.shows[0].scenes=Array.from({length:MAX_SCENES},(_,i)=>({id:'s'+i,name:'S'+i,draft:show.draft}));raw.shows[0].activeSceneId='s0';
 assert.throws(()=>cleanLibrary(raw),/more than 60 scenes/);
 raw.shows[0].scenes.pop();const ok=activeShow(cleanLibrary(raw));assert.equal(ok.scenes.length,MAX_SCENES);
});
test('Lower third settings are bounded, keep the band inside the canvas, and survive the live state',()=>{
 const d=cleanLowerThird({});assert.deepEqual([d.height,d.width,d.bottom,d.align,d.opacity,d.fit],[300,90,60,'center',85,true]);
 for(const height of [120,700,9999])for(const bottom of [0,400,-50])for(const width of [30,100])for(const side of [0,400])for(const align of ['left','center','right']){
  const t=cleanLowerThird({height,bottom,width,side,align});
  assert.ok(t.bottom>=0&&t.bottom+t.height<=1080-TOP_SAFE,JSON.stringify(t));
  assert.ok(t.width>=LOWER_THIRD_LIMITS.width[0]&&t.width<=100);
  const css=lowerThirdBandStyle(t),max=Number(css.match(/max-height:(\d+)px/)[1]);assert.ok(max>=t.height&&t.bottom+max<=1080-TOP_SAFE,css);
 }
 assert.equal(cleanLowerThird({background:'red;position:fixed'}).background,'#0b1520');assert.match(lowerThirdBandStyle({background:'#102030',opacity:50}),/rgba\(16,32,48,0\.5\)/);
 const live={...snapshot(cleanDraft({...DEFAULT})),blank:false,lowerThird:cleanLowerThird({height:400,fit:false})};
 const reloaded=JSON.parse(JSON.stringify(live));assert.ok(validLive(reloaded));assert.deepEqual(cleanLowerThird(reloaded.lowerThird),live.lowerThird);
 const next={...structuredClone(reloaded),index:1};assert.equal(cleanLowerThird(next.lowerThird).height,400,'live arrows keep the settings');
});
test('Lower third content keeps headings, verse context, explanations, references and credits',()=>{
 const d=cleanDraft({...DEFAULT,textSlides:[{id:'t',heading:'Welcome',subtitle:'Sunday',body:'Body text',footer:'Pastor A',attribution:'Credit line'}]});
 applyPastedNKJV(d,'For God so loved the world','John 3:16');
 const deck=makeDeck(d),style=snapshot(d).style;
 const passage=lowerThirdContent(deck.find(s=>s.type==='passage'),style);assert.equal(passage.text,'For God so loved the world');assert.equal(passage.reference,'John 3:16');assert.equal(passage.translation,'NKJV');assert.match(passage.credit,/Thomas Nelson/);
 const study=lowerThirdContent(deck.find(s=>s.type==='study'),style);assert.equal(study.heading,'Word');assert.match(study.subtitle,/λόγος/);assert.ok(study.text.length>0,'verse context kept');assert.match(study.detail,/Word, speech/);
 const text=lowerThirdContent(deck.find(s=>s.type==='text'),style);assert.deepEqual([text.heading,text.subtitle,text.text,text.reference,text.credit],['Welcome','Sunday','Body text','Pastor A','Credit line']);
 assert.equal(lowerThirdContent(undefined,style),null);
});
test('Lower-third styles never outrank the per-word highlight, underline, outline and text-color rules',async()=>{
 const {readFile}=await import('node:fs/promises');
 const css=(await readFile(new URL('./dist/styles.css',import.meta.url),'utf8')).replace(/\/\*[\s\S]*?\*\//g,'');
 const rules=[...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m=>({selector:m[1].trim(),body:m[2]}));
 for(const emphasis of ['highlight','underline','text','outline'])assert.ok(rules.some(r=>r.selector.includes('mark[data-emphasis='+emphasis+']')),emphasis);
 // A lower-third rule that styles mark must add no specificity (:where), or it overrides the emphasis rules.
 const lowerMarks=rules.filter(r=>/lower/.test(r.selector)&&/\bmark\b/.test(r.selector)&&/background|color|text-decoration|outline/.test(r.body));
 assert.ok(lowerMarks.length>0);
 for(const r of lowerMarks)assert.match(r.selector,/^:where\([^)]*lower[^)]*\)\s+mark$/,r.selector);
});
test('Lower-third text rewraps: line breaks made for the full screen become spaces, song lines are kept',async()=>{
 const {lowerThirdFlow}=await import('./dist/lowerthird.mjs');
 assert.equal(lowerThirdFlow('Ìgbéraga àyà rẹ\n  ìwọ tí ń gbé  inú\n\nàpáta'),'Ìgbéraga àyà rẹ ìwọ tí ń gbé inú àpáta','words and Yoruba marks kept, breaks reflowed');
 assert.equal(lowerThirdFlow('First lyric line\nSecond lyric line',{song:{}}),'First lyric line\nSecond lyric line');
 assert.equal(lowerThirdFlow(undefined),'');
});
test('App name: Wordlight · Church Media',async()=>{
 const {readFile}=await import('node:fs/promises');
 assert.match(await readFile(new URL('./dist/index.html',import.meta.url),'utf8'),/<title>Wordlight · Church Media<\/title>/);
 assert.match(await readFile(new URL('./dist/app.js',import.meta.url),'utf8'),/const APP_NAME='Wordlight · Church Media'/);
});
