// NKJV online from bolls.life (public API, no key: https://github.com/Bolls-Bible/bain/blob/master/docs/API.md).
// Used when there is no NKJV file of your own and no API.Bible key. One chapter per request, as its documentation
// asks; the whole Bible is never downloaded. A few chapters are kept in memory only, never saved.
import {BIBLE_BOOKS} from './reference.mjs';
import {NKJV_CREDIT} from './library.mjs';
import {readLimitedJSON} from './readlimit.mjs';

// Limits: the longest chapter (Psalm 119) has 176 verses and its reply is far under 2 MB.
const BASE='https://bolls.life/get-text/NKJV/',CACHE_CHAPTERS=12,MAX_CHAPTERS=10,TIMEOUT_MS=12000,MAX_BYTES=2e6,MAX_VERSES=200,MAX_VERSE_TEXT=5000;
const cache=new Map(),inflight=new Map();

// Verse text arrives as HTML (supplied words in <i>, sometimes <br>). Only the plain words are kept.
export function bollsText(html){
 return String(html).replace(/<br\s*\/?>/gi,' ').replace(/<[^>]*>/g,'')
  .replace(/&#(\d+);/g,(m,n)=>codePoint(Number(n),m)).replace(/&#x([0-9a-f]+);/gi,(m,n)=>codePoint(parseInt(n,16),m))
  .replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
  .replace(/\s+/g,' ').trim();
}

const codePoint=(n,raw)=>n>0&&n<=0x10ffff?String.fromCodePoint(n):raw;

export async function bollsChapter(bookId,chapter,request=fetch){
 const index=BIBLE_BOOKS.findIndex(b=>b.id===bookId),book=BIBLE_BOOKS[index];
 if(!book||!Number.isInteger(chapter)||chapter<1||chapter>book.chapters)throw new Error('Check the book and chapter.');
 const key=bookId+'/'+chapter;
 if(cache.has(key)){const hit=cache.get(key);cache.delete(key);cache.set(key,hit);return hit;}
 // Two lookups of the same chapter at once share one request.
 if(inflight.has(key))return inflight.get(key);
 const job=(async()=>{
  let response;
  try{response=await request(BASE+(index+1)+'/'+chapter+'/',{signal:AbortSignal.timeout(TIMEOUT_MS)});}
  catch{throw new Error('The online NKJV (bolls.life) could not be reached. Check the internet connection and try again.');}
  if(!response.ok)throw new Error('The online NKJV (bolls.life) is not available right now ('+response.status+'). Try again later.');
  const unexpected=()=>new Error('The online NKJV (bolls.life) sent an unexpected answer.');
  let rows;try{rows=await readLimitedJSON(response,MAX_BYTES,'The NKJV chapter');}catch(err){throw err.status===413?err:unexpected();}
  // A damaged reply is refused whole, never patched: every row needs a verse number, used once, and text.
  if(!Array.isArray(rows)||!rows.length||rows.length>MAX_VERSES)throw unexpected();
  const seen=new Set();
  for(const v of rows){if(!Number.isInteger(v?.verse)||v.verse<1||v.verse>MAX_VERSES||seen.has(v.verse)||typeof v.text!=='string'||v.text.length>MAX_VERSE_TEXT)throw unexpected();seen.add(v.verse);}
  const verses=[...rows].sort((a,b)=>a.verse-b.verse).map(v=>({book_id:bookId,book:book.english,chapter,verse:v.verse,text:bollsText(v.text)})).filter(v=>v.text);
  if(!verses.length)throw new Error(book.english+' '+chapter+' was not found in the online NKJV.');
  return {verses,copyright:NKJV_CREDIT,source:{provider:'bolls.life',bibleId:'NKJV',fetchedAt:Date.now()}};
 })();
 inflight.set(key,job);
 try{
  const result=await job;
  cache.set(key,result);if(cache.size>CACHE_CHAPTERS)cache.delete(cache.keys().next().value);
  return result;
 }finally{inflight.delete(key);}
}

// A reference as parsed by parseReference. A verse with no end is that one verse; no verse means whole chapters.
export async function bollsPassage(p,request=fetch){
 const first=p.chapter,endChapter=p.endChapter??first,verse=p.verse??null;
 const endVerse=p.endVerse??(verse!==null&&endChapter===first?verse:null);
 if(endChapter<first)throw new Error('The end must come after the start.');
 if(endChapter-first+1>MAX_CHAPTERS)throw new Error('Look up at most '+MAX_CHAPTERS+' chapters at a time.');
 const verses=[];let result;
 for(let number=first;number<=endChapter;number++){
  result=await bollsChapter(p.book.id,number,request);
  const last=result.verses.at(-1).verse,from=number===first&&verse!==null?verse:1,to=number===endChapter&&endVerse!==null?endVerse:last;
  if(from>last||to>last)throw new Error(p.book.english+' '+number+' has '+last+' verses in NKJV.');
  if(to<from)throw new Error('The end must come after the start.');
  verses.push(...result.verses.filter(v=>v.verse>=from&&v.verse<=to));
 }
 return {verses,copyright:result.copyright,source:result.source};
}
