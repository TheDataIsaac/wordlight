// Finding a verse by its words, for when the preacher quotes a verse without saying where it is.
// It searches the Bibles installed on this computer, so it needs no internet and answers in a few milliseconds.
//
// Each installed version gets a word index: for every word, the list of verses that contain it. It is built once from
// the version's book files and saved beside them (search-index.bin), so later starts only read one file, and the verse
// texts stay packed as UTF-8 until a search needs one. Words are compared folded (no case, tone marks or punctuation) and by their first five letters, so
// "strengthens" finds "strengtheneth" and "ife" finds "ìfẹ́". A verse scores by how many of the typed words it has, and
// a verse that holds the typed words in order as one phrase comes first. Every installed version is searched and the
// best match for each verse is kept, so a quote in NKJV wording still finds the verse through WEB or KJV.
import {readFile,writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {BIBLE_BOOKS} from './dist/reference.mjs';
import {foldWords} from './dist/songs.mjs';
import {wordKey,SMALL_WORDS} from './dist/verse-search.mjs';

const MAX_QUERY_WORDS=16,MAX_RESULTS=20,CANDIDATES_CHECKED=400;
// A verse must hold this share of the typed words (small words count a quarter) to be listed.
const SHARE_NEEDED=0.6;
const verseNumber=(bookIndex,chapter,verse)=>bookIndex*1e6+chapter*1e3+verse;
const CACHE_FILE='search-index.bin',CACHE_MAGIC='WLSI2';

// A list of whole numbers that grows, kept in a typed array (4 bytes each) instead of a plain array.
function growingList(size=1<<15){
 let data=new Int32Array(size),length=0;
 return {
  push(value){if(length===data.length){const bigger=new Int32Array(data.length*2);bigger.set(data);data=bigger;}data[length++]=value;},
  done(){return data.slice(0,length);},
 };
}

// Reads one installed version from disk into a word index. Versions are one JSON file per book: [[verse text|null,…],…].
// The index is packed to keep memory low: every word gets a number k, and the verses holding word k are
// positions[starts[k]] … positions[starts[k+1]-1], all in one array, instead of a separate list per word.
async function buildIndex(folder){
 const numbers=growingList(),texts=[],keyIds=new Map(),verseKeys=growingList(1<<18),keysPerVerse=growingList();
 for(const [bookIndex,book] of BIBLE_BOOKS.entries()){
  // A book file that is missing or unreadable is skipped, so the rest of the version can still be searched.
  let chapters;try{chapters=JSON.parse(await readFile(path.join(folder,book.id+'.json'),'utf8'));}catch{continue;}
  if(!Array.isArray(chapters))continue;
  chapters.forEach((verses,c)=>(Array.isArray(verses)?verses:[]).forEach((text,v)=>{
   if(typeof text!=='string'||!text)return;
   numbers.push(verseNumber(bookIndex,c+1,v+1));texts.push(text);
   let count=0;
   for(const key of new Set(foldWords(text).split(' ').filter(Boolean).map(wordKey))){
    let id=keyIds.get(key);if(id===undefined){id=keyIds.size;keyIds.set(key,id);}
    verseKeys.push(id);count++;
   }
   keysPerVerse.push(count);
  }));
 }
 // Second pass: count each word's verses, then place every verse under its words, in verse order.
 const ids=verseKeys.done(),perVerse=keysPerVerse.done(),starts=new Int32Array(keyIds.size+1);
 for(const id of ids)starts[id+1]++;
 for(let k=1;k<starts.length;k++)starts[k]+=starts[k-1];
 const fill=starts.slice(0,keyIds.size),positions=new Int32Array(ids.length);
 for(let position=0,i=0;position<perVerse.length;position++)for(let n=0;n<perVerse[position];n++)positions[fill[ids[i++]]++]=position;
 // The texts, packed end to end as UTF-8: verse p is bytes textStarts[p] to textStarts[p+1].
 const encoded=texts.map(t=>Buffer.from(t,'utf8')),textStarts=new Int32Array(texts.length+1);
 encoded.forEach((b,p)=>{textStarts[p+1]=textStarts[p]+b.length;});
 return packedIndex({numbers:numbers.done(),keys:[...keyIds.keys()],starts,positions,textStarts,textBytes:Buffer.concat(encoded)});
}
function packedIndex(parts){
 const {textStarts,textBytes}=parts;
 return {...parts,keyIds:new Map(parts.keys.map((key,k)=>[key,k])),verses:parts.numbers.length,
  text:position=>textBytes.toString('utf8',textStarts[position],textStarts[position+1])};
}

// The saved index: "WLSI2", the length of a JSON header, the header ({installedAt, keys, sizes}), then the number
// arrays and the text bytes, each starting on a 4-byte boundary so they can be read in place.
const SECTIONS=['numbers','starts','positions','textStarts'];
async function saveIndex(file,index,installedAt){
 const sizes=Object.fromEntries(SECTIONS.map(name=>[name,index[name].length]));
 let header=Buffer.from(JSON.stringify({installedAt,keys:index.keys,sizes,textBytes:index.textBytes.length}));
 header=Buffer.concat([header,Buffer.alloc((4-(header.length+9)%4)%4,32)]);
 const lead=Buffer.alloc(9);lead.write(CACHE_MAGIC,0,'latin1');lead.writeUInt32LE(header.length,5);
 const parts=[lead,header,...SECTIONS.map(name=>Buffer.from(index[name].buffer,index[name].byteOffset,index[name].byteLength)),index.textBytes];
 const temp=file+'.'+process.pid+'.tmp';
 await writeFile(temp,Buffer.concat(parts));await rename(temp,file).catch(async err=>{await rm(temp,{force:true});throw err;});
}
async function loadIndex(file,installedAt){
 const data=await readFile(file);
 if(data.toString('latin1',0,5)!==CACHE_MAGIC)return null;
 const headerLength=data.readUInt32LE(5),header=JSON.parse(data.toString('utf8',9,9+headerLength));
 if(header.installedAt!==installedAt)return null;
 let offset=9+headerLength;const parts={keys:header.keys};
 for(const name of SECTIONS){
  const length=header.sizes[name];
  // A fresh copy if the file's bytes are not 4-byte aligned in memory; otherwise read in place.
  parts[name]=(data.byteOffset+offset)%4?new Int32Array(data.buffer.slice(data.byteOffset+offset,data.byteOffset+offset+length*4)):new Int32Array(data.buffer,data.byteOffset+offset,length);
  offset+=length*4;
 }
 parts.textBytes=data.subarray(offset,offset+header.textBytes);
 if(parts.textBytes.length!==header.textBytes||parts.starts[parts.starts.length-1]!==parts.positions.length)return null;
 return packedIndex(parts);
}
// The saved index if it belongs to this install of the version, otherwise a fresh one (saved for next time).
async function openIndex(folder,installedAt){
 const file=path.join(folder,CACHE_FILE);
 try{const saved=await loadIndex(file,installedAt);if(saved)return saved;}catch{}
 const index=await buildIndex(folder);
 saveIndex(file,index,installedAt).catch(()=>{});
 return index;
}

// Scores every verse of one index against the typed words. Returns [{position, score, exact}] best first.
function searchIndex(index,words){
 const weights=new Map();
 for(const word of words){const key=wordKey(word);weights.set(key,Math.max(weights.get(key)||0,SMALL_WORDS.has(word)?0.25:1));}
 const total=[...weights.values()].reduce((sum,w)=>sum+w,0);
 // Scores in a flat array, one per verse, with the verses touched listed once.
 const scores=new Float32Array(index.verses),touched=[];
 for(const [key,weight] of weights){
  const k=index.keyIds.get(key);if(k===undefined)continue;
  for(let i=index.starts[k];i<index.starts[k+1];i++){const position=index.positions[i];if(!scores[position])touched.push(position);scores[position]+=weight;}
 }
 // Only the best-scoring verses are read again, to check for the whole phrase and for typed words kept side by side
 // ("Oluwa ni oluso" puts Psalm 23:1 above a verse that has the same words scattered).
 const needed=total*SHARE_NEEDED;
 const candidates=touched.filter(p=>scores[p]>=needed).map(p=>[p,scores[p]]).sort((a,b)=>b[1]-a[1]).slice(0,CANDIDATES_CHECKED);
 const phrase=' '+words.join(' ')+' ',keys=words.map(wordKey);
 const typedPairs=keys.slice(1).map((key,i)=>keys[i]+' '+key);
 return candidates.map(([position,score])=>{
  const folded=foldWords(index.text(position)),verseKeys=folded.split(' ').map(wordKey);
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
  const build=openIndex(path.join(root,bible.id),bible.installedAt);
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
    best.set(number,{...hit,number,text:index.text(hit.position),translation:bible.abbreviation});
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
