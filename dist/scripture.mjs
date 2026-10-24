import {adjacentYoruba} from './yoruba.mjs';
import {BIBLE_BOOKS} from './reference.mjs';
// NKJV comes from your own file, your API.Bible key (through the companion) or bolls.life; the others from public sources.
export const TRANSLATIONS=['kjv','web','asv','bbe','darby','oeb-us','oycb','nkjv'];
// A lookup key: a built-in version, or an AO catalogue version such as "ao:BSB".
export const isLookupKey=key=>TRANSLATIONS.includes(key)||/^ao:[A-Za-z0-9_-]{2,40}$/.test(String(key));
export function cleanVerseRange(v){
 if(!v||!isLookupKey(v.translation))return null;
 const point=p=>p&&/^[A-Z0-9]{3}$/.test(p.bookId)&&Number.isInteger(p.chapter)&&p.chapter>0&&Number.isInteger(p.verse)&&p.verse>0?{bookId:p.bookId,chapter:p.chapter,verse:p.verse}:null;
 const start=point(v.start),end=point(v.end);return start&&end?{translation:v.translation,start,end}:null;
}
export function rangeFromResponse(data,tr){
 const verses=data?.verses;if(!Array.isArray(verses)||!verses.length)return null;
 const point=v=>({bookId:v.book_id,chapter:v.chapter,verse:v.verse});
 return cleanVerseRange({translation:tr,start:point(verses[0]),end:point(verses.at(-1))});
}
export async function adjacentVerse(range,delta,get){
 range=cleanVerseRange(range);if(!range)throw new Error('Look up a Bible reference first to enable verse navigation.');
 if(range.translation==='oycb')return adjacentYoruba(range,delta,get);
 if(range.translation==='nkjv')return adjacentByChapter(range,delta,get,'/nkjv');
 const point=delta<0?range.start:range.end,tr=range.translation;
 const chapter=await get('/data/'+tr+'/'+point.bookId+'/'+point.chapter);
 if(!Array.isArray(chapter.verses))throw new Error('The chapter could not be loaded.');
 const verseIndex=chapter.verses.findIndex(v=>v.verse===point.verse);
 if(verseIndex<0)throw new Error('This verse is unavailable in the selected translation.');
 let verse=chapter.verses[verseIndex+delta];
 if(!verse){
  const book=await get('/data/'+tr+'/'+point.bookId);
  const chapters=book.chapters;if(!Array.isArray(chapters))throw new Error('The chapter list could not be loaded.');
  const ci=chapters.findIndex(c=>c.chapter===point.chapter);if(ci<0)throw new Error('Chapter not found.');
  let nextChapter=chapters[ci+delta];
  if(!nextChapter){
   const catalog=await get('/data/'+tr);if(!Array.isArray(catalog.books))throw new Error('The book list could not be loaded.');
   const bi=catalog.books.findIndex(b=>b.id===point.bookId);if(bi<0)throw new Error('Book not found.');
   const nextBook=catalog.books[bi+delta];if(!nextBook)return null;
   const details=await get('/data/'+tr+'/'+nextBook.id);
   if(!Array.isArray(details.chapters)||!details.chapters.length)throw new Error('The next book could not be loaded.');
   nextChapter=delta<0?details.chapters.at(-1):details.chapters[0];
  }
  const next=await get('/data/'+tr+'/'+nextChapter.book_id+'/'+nextChapter.chapter);
  if(!Array.isArray(next.verses)||!next.verses.length)throw new Error('The next chapter could not be loaded.');
  verse=delta<0?next.verses.at(-1):next.verses[0];
 }
 return {reference:(verse.book||verse.book_name)+' '+verse.chapter+':'+verse.verse,text:verse.text,verses:[verse],translation_id:tr};
}

// NKJV and installed Bibles move through whole chapters from the companion: get(prefix+'/BOOK/CHAPTER') returns
// {verses,copyright,source}. Verses a translation leaves out are simply not in the list.
export async function adjacentByChapter(range,delta,get,prefix){
 range=cleanVerseRange(range);if(!range)throw new Error('Look up a Bible reference first to enable verse navigation.');
 const point=delta<0?range.start:range.end;
 let index=BIBLE_BOOKS.findIndex(b=>b.id===point.bookId);if(index<0)throw new Error('Book not found.');
 let book=BIBLE_BOOKS[index],chapter=point.chapter,data=await get(prefix+'/'+book.id+'/'+chapter);
 const i=data.verses.findIndex(v=>v.verse===point.verse);if(i<0)throw new Error('That verse is unavailable in this translation.');
 let verse=data.verses[i+delta];
 if(!verse){
  chapter+=delta;
  if(chapter<1||chapter>book.chapters){index+=delta;book=BIBLE_BOOKS[index];if(!book)return null;chapter=delta<0?book.chapters:1;}
  data=await get(prefix+'/'+book.id+'/'+chapter);verse=delta<0?data.verses.at(-1):data.verses[0];
 }
 return {...data,reference:verse.book+' '+verse.chapter+':'+verse.verse,text:verse.text,verses:[verse],translation_id:range.translation};
}
// Where looked-up text came from, kept with the show so it can be checked again later.
export function cleanScriptureSource(v){
 if(!v||typeof v.provider!=='string'||!/^[A-Za-z0-9 .-]{1,40}$/.test(v.provider))return null;
 return {provider:v.provider,bibleId:typeof v.bibleId==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v.bibleId)?v.bibleId:'',fetchedAt:Number.isFinite(v.fetchedAt)&&v.fetchedAt>0?v.fetchedAt:0};
}

export function cleanBibleVerses(verses){
 return (Array.isArray(verses)?verses:[]).slice(0,2500).filter(v=>v&&typeof v.text==='string'&&/^[A-Z0-9]{3}$/.test(v.bookId||v.book_id)&&Number.isInteger(v.chapter)&&v.chapter>0&&Number.isInteger(v.verse)&&v.verse>0).map(v=>{
 const book=String(v.book||v.book_name||v.bookId||v.book_id).slice(0,80);
 return {bookId:v.bookId||v.book_id,book,chapter:v.chapter,verse:v.verse,text:v.text.slice(0,10000).trim(),reference:book+' '+v.chapter+':'+v.verse};
 }).filter(v=>v.text);
}
