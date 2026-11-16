// Phone remote content: everything the phone asks for runs here on the laptop. The phone sends a typed reference or a
// song id; this file finds the text and builds the screen, so the phone only ever receives short summaries.
// Bibles work as in the studio: an installed Bible first, then NKJV through the API.Bible key or bolls.life, then the
// public online sources. A failed lookup is reported; another version is never used instead.
import {cleanDraft,snapshot,cleanTextSlide,getHighlights,nextHighlightColor} from './dist/core.mjs';
import {songSlides,matchedSlide,songSlideId} from './dist/songs.mjs';
import {applyBiblePassage,activeShow} from './dist/library.mjs';
import {BIBLE_BOOKS,parseReference} from './dist/reference.mjs';
import {VERSE_COUNTS} from './dist/versification.mjs';
import {TRANSLATIONS,adjacentVerse,adjacentByChapter} from './dist/scripture.mjs';
import {lookupYoruba} from './dist/yoruba.mjs';
import {bollsPassage,bollsChapter} from './dist/bolls.mjs';
import {readLimitedJSON} from './dist/readlimit.mjs';

const VERSION_NAMES={kjv:'King James Version',web:'World English Bible',asv:'American Standard Version',bbe:'Bible in Basic English',darby:'Darby Bible','oeb-us':'Open English Bible (US)',oycb:'Yoruba Contemporary Bible',nkjv:'New King James Version'};
const ONLINE_TIMEOUT_MS=12000,CHAPTERS_KEPT=60;
const fail=(status,message)=>Object.assign(new Error(message),{status});

// Books, chapters and verse counts for the phone's picker. Sent once after sign-in.
export function bibleBooks(){return BIBLE_BOOKS.map(b=>({id:b.id,name:b.english,verses:VERSE_COUNTS[b.id]||[]}));}

// A phone keyboard hides the colon, so "John 3 16" and "1 Cor 13 4 7" are read as "John 3:16" and "1 Cor 13:4-7".
// With a verse on screen, "17" and "14-16" mean that chapter, and "4:2" or "4 2" mean that book.
export function phoneReference(input,onScreen=null){
 let text=String(input??'').trim().replace(/\s+/g,' ');
 if(text.length>100)throw fail(400,'That reference is too long.');
 const numbers=text.match(/^(\d+)(?:[:; ](\d+))?(?:-(\d+))?$/);
 if(numbers){
  if(!onScreen)throw fail(400,'Add the book name, such as John 3:16.');
  const [,first,second,to]=numbers;
  text=onScreen.bookId+' '+(second?first+':'+second:onScreen.chapter+':'+first)+(to?'-'+to:'');
 }
 const spaced=text.match(/^(.*[^\d\s]\s*\d+) (\d+(?:-\d+)?)(?: (\d+))?$/);
 if(spaced)text=spaced[1]+':'+spaced[2]+(spaced[3]?'-'+spaced[3]:'');
 return parseReference(text);
}

export function createBibleLookup({bibles,apiBible,search=null,request=fetch}){
 const chapters=new Map();
 function keep(key,value){chapters.delete(key);chapters.set(key,value);while(chapters.size>CHAPTERS_KEPT)chapters.delete(chapters.keys().next().value);return value;}
 async function online(url){
  if(chapters.has(url))return keep(url,chapters.get(url));
  let response;
  try{response=await request(url,{signal:AbortSignal.timeout(ONLINE_TIMEOUT_MS)});}
  catch{throw fail(502,'This version needs the internet and the laptop could not reach it. Use an installed version.');}
  if(response.status===429)throw fail(429,'Bible lookup is busy. Wait a moment and try again.');
  if(!response.ok)throw fail(response.status===404?404:502,'Could not load the passage. Check the reference.');
  const data=await readLimitedJSON(response,2e6,'The passage');
  if(data.error)throw fail(404,String(data.error));
  return keep(url,data);
 }
 const nkjvKey=async()=>!!(await apiBible.status()).ready;
 // The paths the shared verse-stepping code asks for.
 async function get(path){
  const installed=path.match(/^\/local\/([a-z-]+)\/([A-Z0-9]{3})\/(\d+)$/);
  if(installed)return bibles.passage(installed[1],{bookId:installed[2],chapter:Number(installed[3])});
  const nkjv=path.match(/^\/nkjv\/([A-Z0-9]{3})\/(\d+)$/);
  if(nkjv){
   const chapter=Number(nkjv[2]);
   return await nkjvKey()?apiBible.passage({bookId:nkjv[1],chapter,verse:null,endChapter:chapter,endVerse:null}):bollsChapter(nkjv[1],chapter);
  }
  const yoruba=path.match(/^\/yoruba\/([A-Z0-9]{3})\/(\d+)$/);
  return online(yoruba?'https://bible.helloao.org/api/yor_bib/'+yoruba[1]+'/'+yoruba[2]+'.simple.json':'https://bible-api.com'+path);
 }
 async function lookup(version,p){
  const range={bookId:p.book.id,chapter:p.chapter,verse:p.verse,endChapter:p.endChapter,endVerse:p.endVerse};
  if(await bibles.installed(version))return bibles.passage(version,range);
  if(version==='nkjv')return await nkjvKey()?apiBible.passage(range):bollsPassage(p);
  if(version==='oycb')return lookupYoruba(p.reference,get);
  return online('https://bible-api.com/'+encodeURIComponent(p.reference)+'?translation='+version+'&single_chapter_book_matching=indifferent');
 }
 return {
  // Versions installed on the laptop come first: they need no internet and answer at once.
  async versions(){
   const installed=new Set((await bibles.list()).filter(b=>b.installed).map(b=>b.id)),nkjvReady=await nkjvKey();
   const rows=TRANSLATIONS.map(id=>({id,name:VERSION_NAMES[id],installed:installed.has(id)||(id==='nkjv'&&nkjvReady)}));
   return rows.sort((a,b)=>b.installed-a.installed);
  },
  async passage(version,p){
   if(!TRANSLATIONS.includes(version))throw fail(400,'Choose a Bible version.');
   const data=await lookup(version,p);
   if(!Array.isArray(data?.verses)||!data.verses.length)throw fail(404,'No passage found.');
   return {...data,reference:p.reference,text:data.verses.map(v=>v.text).join('\n')};
  },
  // Verses that contain the typed words, from the Bibles installed on the laptop.
  async search(query){
   if(!search)return {results:[],searched:[]};
   return search.search(query);
  },
  // The verse before or after a point, or null at either end of the Bible.
  async adjacent(version,point,delta){
   const range={translation:version,start:point,end:point};
   if(await bibles.installed(version))return adjacentByChapter(range,delta,get,'/local/'+version);
   return adjacentVerse(range,delta,get);
  }
 };
}
// The version key of a slide on screen, when the phone can look up its neighbours.
export function slideVersion(live,slide){
 const key=live?.bibleVersion||String(slide?.translation||'').toLowerCase();
 return TRANSLATIONS.includes(key)?key:'';
}

// ---- Building screens. New content keeps the look of what is on screen now, so it matches the service. ----
function draftWithLook(live,fields){
 const s=live?.style||{};
 return cleanDraft({schema:1,passage:'',reference:'',translation:'',includePassage:false,theme:s.theme,font:s.font,fontSize:s.fontSize,bold:s.bold,italic:s.italic,brand:s.brand,accent:s.accent,fit:s.fit,fitPadding:s.fitPadding,backgroundAssetId:s.backgroundAssetId,backgroundDim:s.backgroundDim,referenceSize:s.referenceSize,lowerReferenceSize:s.lowerReferenceSize,referenceColor:s.referenceColor,...fields});
}
// The studio's words, in the colours of the look on screen. Formatting set for one text slide stays with that slide.
const wordsFor=(style,notes,everySlide=false)=>getHighlights({notes,accent:style.accent,theme:style.theme}).filter(h=>everySlide||!h.slideId);
const withWords=(style,highlights)=>({...style,highlights,highlightWords:highlights.map(h=>h.word)});
// Words highlighted in the studio stay highlighted on a verse from the phone. They go on the look, not the draft, so
// no word-study slides join the verse.
export function bibleScreen(live,data,version,notes=[]){
 const draft=draftWithLook(live,{title:data.reference});
 applyBiblePassage(draft,data,version);
 const screen=snapshot(draft);
 return {...screen,style:withWords(screen.style,wordsFor(screen.style,notes)),bibleVersion:version,showTitle:data.reference};
}
// A word changed in the studio shows at once when the screen has that item, or a verse from the phone. Moving to another
// item or show changes only the preview. Returns the same live object when the screen stays as it is.
export function wordsOnLive(live,before,after){
 const was=activeShow(before),show=activeShow(after),sameItem=live.showId===show.id&&live.sceneId===show.activeSceneId;
 if(was.id!==show.id||was.activeSceneId!==show.activeSceneId||!(sameItem||live.bibleVersion))return live;
 const highlights=wordsFor(live.style,show.draft.notes,sameItem);
 if(JSON.stringify(highlights)===JSON.stringify(wordsFor(live.style,was.draft.notes,sameItem)))return live;
 return {...live,style:withWords(live.style,highlights),updated:Math.max(Date.now(),Number(live.updated||0)+1)};
}
// A tap on the phone lights up a word on the screen showing now, or clears it. It stays with the screen, not the saved show.
export function toggleWord(live,word){
 const style=live.style,list=style.highlights||[],same=h=>h.word.toLowerCase()===word.toLowerCase();
 if(list.some(same))return {...live,style:withWords(style,list.filter(h=>!same(h)))};
 const look={accent:style.accent,theme:style.theme},color=nextHighlightColor({...look,notes:list});
 return {...live,style:withWords(style,[...list,...getHighlights({...look,notes:[{word,color}]})])};
}
export function songScreen(live,song,position,line=''){
 // A search match opens at the slide holding that line, however the song is split on screen.
 const entryId='phone',matched=matchedSlide(songSlides(song,entryId).filter(s=>s.position===position),line);
 const first=songSlideId(entryId,position,matched?.page||0);
 const screen=snapshot(draftWithLook(live,{title:song.title,songs:[{entryId,song}]}),first);
 if(!screen.slides.some(s=>s.id===first))throw fail(404,'That part of the song is no longer there.');
 return {...screen,showTitle:song.title};
}
export function textScreen(live,heading,body){
 const slide=cleanTextSlide({id:'phone',heading,body,align:'center',fit:true});
 return {...snapshot(draftWithLook(live,{title:heading||'Text',textSlides:[slide]})),showTitle:heading||'Text'};
}
