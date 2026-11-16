// Finding a verse by its words, for when the preacher quotes a verse without saying where it is.
// It searches the Bibles installed on this computer, so it needs no internet and answers in a few milliseconds.
//
// Each installed version gets a word index the first time it is searched: for every word, the list of verses that
// contain it. Words are compared folded (no case, tone marks or punctuation) and by their first five letters, so
// "strengthens" finds "strengtheneth" and "ife" finds "ìfẹ́". A verse scores by how many of the typed words it has, and
// a verse that holds the typed words in order as one phrase comes first. Every installed version is searched and the
// best match for each verse is kept, so a quote in NKJV wording still finds the verse through WEB or KJV.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {BIBLE_BOOKS} from './dist/reference.mjs';
import {foldWords} from './dist/songs.mjs';
import {wordKey,SMALL_WORDS} from './dist/verse-search.mjs';

const MAX_QUERY_WORDS=16,MAX_RESULTS=20,CANDIDATES_CHECKED=400;
// A verse must hold this share of the typed words (small words count a quarter) to be listed.
const SHARE_NEEDED=0.6;
const verseNumber=(bookIndex,chapter,verse)=>bookIndex*1e6+chapter*1e3+verse;

// Reads one installed version from disk into a word index. Versions are one JSON file per book: [[verse text|null,…],…].
async function buildIndex(folder){
 const numbers=[],texts=[],lists=new Map();
 for(const [bookIndex,book] of BIBLE_BOOKS.entries()){
  // A book file that is missing or unreadable is skipped, so the rest of the version can still be searched.
  let chapters;try{chapters=JSON.parse(await readFile(path.join(folder,book.id+'.json'),'utf8'));}catch{continue;}
  if(!Array.isArray(chapters))continue;
  chapters.forEach((verses,c)=>(Array.isArray(verses)?verses:[]).forEach((text,v)=>{
   if(typeof text!=='string'||!text)return;
   const position=texts.length;
   numbers.push(verseNumber(bookIndex,c+1,v+1));texts.push(text);
   for(const key of new Set(foldWords(text).split(' ').filter(Boolean).map(wordKey))){
    if(!lists.has(key))lists.set(key,[]);
    lists.get(key).push(position);
   }
  }));
 }
 // Typed arrays hold the verse lists in about a quarter of the memory of plain arrays.
 const postings=new Map();
 for(const [key,list] of lists)postings.set(key,Int32Array.from(list));
 return {numbers:Int32Array.from(numbers),texts,postings};
}

// Scores every verse of one index against the typed words. Returns [{position, score, exact}] best first.
function searchIndex(index,words){
 const weights=new Map();
 for(const word of words){const key=wordKey(word);weights.set(key,Math.max(weights.get(key)||0,SMALL_WORDS.has(word)?0.25:1));}
 const total=[...weights.values()].reduce((sum,w)=>sum+w,0);
 const scores=new Map();
 for(const [key,weight] of weights){
  const list=index.postings.get(key);if(!list)continue;
  for(const position of list)scores.set(position,(scores.get(position)||0)+weight);
 }
 // Only the best-scoring verses are read again, to check for the whole phrase and for typed words kept side by side
 // ("Oluwa ni oluso" puts Psalm 23:1 above a verse that has the same words scattered).
 const candidates=[...scores].filter(([,score])=>score>=total*SHARE_NEEDED).sort((a,b)=>b[1]-a[1]).slice(0,CANDIDATES_CHECKED);
 const phrase=' '+words.join(' ')+' ',keys=words.map(wordKey);
 const typedPairs=keys.slice(1).map((key,i)=>keys[i]+' '+key);
 return candidates.map(([position,score])=>{
  const folded=foldWords(index.texts[position]),verseKeys=folded.split(' ').map(wordKey);
  const versePairs=new Set(verseKeys.slice(1).map((key,i)=>verseKeys[i]+' '+key));
  const pairShare=typedPairs.length?typedPairs.filter(pair=>versePairs.has(pair)).length/typedPairs.length:0;
  const exact=(' '+folded+' ').includes(phrase);
  return {position,exact,score:score/total+pairShare/2+(exact?1:0)};
 });
}

// listInstalled() gives [{id, abbreviation, installed, installedAt}] as the Bible library lists them.
export function createBibleSearch({root,listInstalled}){
 const indexes=new Map();
 // An index is rebuilt when its version is installed again (installedAt changes) and dropped when it is removed.
 async function indexFor(bible){
  const held=indexes.get(bible.id);
  if(held&&held.installedAt===bible.installedAt)return held.build;
  const build=buildIndex(path.join(root,bible.id));
  indexes.set(bible.id,{installedAt:bible.installedAt,build});
  build.catch(()=>indexes.delete(bible.id));
  return build;
 }
 async function installed(){
  const bibles=(await listInstalled()).filter(b=>b.installed);
  for(const id of indexes.keys())if(!bibles.some(b=>b.id===id))indexes.delete(id);
  return bibles;
 }
 async function search(query){
  const words=foldWords(String(query||'').slice(0,200)).split(' ').filter(Boolean).slice(0,MAX_QUERY_WORDS);
  const bibles=await installed();
  if(!words.length||!bibles.length)return {results:[],searched:bibles.map(b=>b.abbreviation)};
  // The best match for each verse across all versions. On a tie the version listed first wins.
  const best=new Map();
  for(const bible of bibles){
   let index;try{index=await indexFor(bible);}catch{continue;}
   for(const hit of searchIndex(index,words)){
    const number=index.numbers[hit.position];
    if((best.get(number)?.score??-1)>=hit.score)continue;
    best.set(number,{...hit,number,text:index.texts[hit.position],translation:bible.abbreviation});
   }
  }
  const results=[...best.values()].sort((a,b)=>b.score-a.score||a.number-b.number).slice(0,MAX_RESULTS).map(hit=>{
   const book=BIBLE_BOOKS[Math.floor(hit.number/1e6)],chapter=Math.floor(hit.number/1e3)%1e3,verse=hit.number%1e3;
   return {reference:book.english+' '+chapter+':'+verse,bookId:book.id,chapter,verse,text:hit.text,translation:hit.translation,exact:hit.exact,score:Math.round(hit.score*1000)/1000};
  });
  return {results,searched:bibles.map(b=>b.abbreviation)};
 }
 // Builds the indexes ahead of time, one version after another, so the first search in a service is instant.
 async function warm(){for(const bible of await installed())await indexFor(bible).catch(()=>{});}
 return {search,warm};
}
