// NKJV through API.Bible, used only by the local companion. The API key stays in this process: it comes from
// WORDLIGHT_API_BIBLE_KEY or api-bible.json in the data folder, is sent only to API.Bible, and is never returned.
// Chapters are fetched whole (no 200-verse passage cap) and kept in memory for an hour at most.
import {readFile,writeFile,rename,unlink,mkdir} from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {BIBLE_BOOKS} from './dist/reference.mjs';
import {readLimitedJSON} from './dist/readlimit.mjs';

const API_BASE='https://rest.api.bible/v1',FUMS_URL='https://fums.api.bible/f3';
// The memory cache holds at most 499 verses for at most an hour, until API.Bible's caching terms are clarified.
const CACHE_MS=60*60*1000,CACHE_VERSES=499,MAX_CHAPTERS=10,TIMEOUT_MS=10000;
const BOOKS=new Map(BIBLE_BOOKS.map(b=>[b.id,b]));
// Paragraph styles that are headings or titles, not verse text.
const HEADINGS=/^(s\d?|ms\d?|mr|mt\d?|r|sr|sp|d|qa|cl|cd)$/;
const ENTITIES={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
const fail=(status,message)=>Object.assign(new Error(message),{status});

// Decodes HTML entities and tidies whitespace. Control characters and invalid code points are dropped.
export function cleanText(value){
 const char=code=>Number.isInteger(code)&&code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'';
 return String(value??'').replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi,(match,entity)=>{
  if(entity[0]==='#')return char(/^#x/i.test(entity)?parseInt(entity.slice(2),16):Number(entity.slice(1)));
  return ENTITIES[entity.toLowerCase()]??match;
 }).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim();
}

// Verse text from API.Bible JSON content: text nodes carry a verseId such as "PSA.119.1". Verse-number tags,
// notes and heading paragraphs are skipped; text split across several nodes of one verse is joined. Text that
// cannot be placed in a verse of this chapter stops the lookup instead of being dropped.
export function chapterVerses(content,bookId,chapter){
 if(!Array.isArray(content))throw fail(502,'API.Bible returned verse text in an unexpected format.');
 // A new paragraph (a poetry line, for example) adds a space when it continues a verse.
 const prefix=bookId+'.'+chapter+'.',text=new Map();let unplaced='',newParagraph=false;
 const walk=(nodes,skip)=>{
  for(const node of nodes){
   if(!node||typeof node!=='object')continue;
   if(node.type==='text'){
    const id=node.attrs?.verseId,match=typeof id==='string'&&id.startsWith(prefix)?id.slice(prefix.length).match(/^(\d+)[a-z]?$/):null;
    if(skip||typeof node.text!=='string'||!node.text.trim())continue;
    if(match){const verse=Number(match[1]),before=text.get(verse)||'';text.set(verse,before+(newParagraph&&before?' ':'')+node.text);newParagraph=false;}
    else unplaced||=typeof id==='string'?id.slice(0,40):'text without a verse';
   }else if(Array.isArray(node.items)){
    if(node.name==='para')newParagraph=true;
    walk(node.items,skip||node.name==='note'||node.name==='verse'||HEADINGS.test(node.attrs?.style||''));
   }
  }
 };
 walk(content,false);
 if(unplaced)throw fail(502,'API.Bible returned text Wordlight cannot place in '+bookId+' '+chapter+' ('+unplaced+'), so nothing was loaded.');
 return [...text].sort((a,b)=>a[0]-b[0]).map(([verse,raw])=>({verse,text:cleanText(raw)})).filter(v=>v.text);
}

export function createApiBible({dataDir,env=process.env,request=fetch,base=API_BASE,fumsUrl=FUMS_URL}){
 const file=path.join(dataDir,'api-bible.json'),sessionId=crypto.randomUUID(),cache=new Map(),inflight=new Map();
 let config=null;
 const envKey=()=>String(env.WORDLIGHT_API_BIBLE_KEY||'').trim();
 const keyOf=c=>envKey()||(typeof c.key==='string'?c.key:'');
 async function load(){
  if(config)return config;
  try{config=JSON.parse(await readFile(file,'utf8'));}catch{config={};}
  if(!config||typeof config!=='object'||Array.isArray(config))config={};
  return config;
 }
 async function save(next){
  await mkdir(dataDir,{recursive:true});
  const tmp=file+'.'+process.pid+'.'+Date.now()+'.tmp';
  try{await writeFile(tmp,JSON.stringify(next));await rename(tmp,file);}catch(err){await unlink(tmp).catch(()=>{});throw err;}
  config=next;
 }
 async function call(key,pathname){
  let response;
  try{response=await request(base+pathname,{headers:{'api-key':key,accept:'application/json'},signal:AbortSignal.timeout(TIMEOUT_MS)});}
  catch(err){throw fail(502,err?.name==='TimeoutError'?'API.Bible did not answer within 10 seconds. Check the internet connection and try again.':'Could not reach API.Bible. Check the internet connection and try again.');}
  // At most 5 MB per answer (a whole chapter is far smaller).
  let body=null;try{body=await readLimitedJSON(response,5e6,'The API.Bible answer');}catch(err){if(err.status===413)throw fail(502,err.message);}
  if(response.ok&&body&&typeof body==='object')return body;
  if(response.status===401)throw fail(401,'API.Bible did not accept this key. Check it in your API.Bible dashboard and connect again.');
  if(response.status===403)throw fail(403,'This API.Bible account is not allowed to read NKJV. Check the Bibles your plan includes.');
  if(response.status===404)throw fail(404,'API.Bible could not find that passage in NKJV.');
  if(response.status===429)throw fail(429,'API.Bible request limit reached. Wait a minute and try again.');
  throw fail(502,'API.Bible returned an error'+(response.status?' ('+response.status+')':'')+'. Try again shortly.');
 }
 // Fair-use report (FUMS) for scripture shown: an anonymous device id and a per-run session id, no user id.
 function report(c,token){
  if(typeof token!=='string'||!token||!c.deviceId)return;
  request(fumsUrl+'?t='+encodeURIComponent(token)+'&dId='+encodeURIComponent(c.deviceId)+'&sId='+sessionId,{signal:AbortSignal.timeout(5000)}).catch(()=>{});
 }
 async function status(){
  const c=await load();
  return {provider:'API.Bible',translation:'NKJV',key:envKey()?'environment':c.key?'saved':'none',ready:!!(keyOf(c)&&c.bibleId),bibleName:c.name||'',copyright:c.copyright||'',checkedAt:c.checkedAt||0};
 }
 // Checks the key and that NKJV is among this account's Bibles before anything is saved.
 async function connect(raw){
  // A key set in WORDLIGHT_API_BIBLE_KEY is the one used; a different pasted key is refused rather than ignored.
  const pasted=String(raw??'').trim();
  if(envKey()&&pasted&&pasted!==envKey())throw fail(409,'This computer sets the key in WORDLIGHT_API_BIBLE_KEY. Change it there, or connect without pasting a key.');
  const key=envKey()||pasted;
  if(!key)throw fail(400,'Paste your API.Bible key first.');
  if(key.length>200||/\s/.test(key))throw fail(400,'That does not look like an API.Bible key.');
  const list=await call(key,'/bibles?abbreviation=NKJV');
  const bible=(Array.isArray(list.data)?list.data:[]).find(b=>/^nkjv$/i.test(String(b?.abbreviation||b?.abbreviationLocal||''))&&/^[A-Za-z0-9-]{1,64}$/.test(String(b.id)));
  if(!bible)throw fail(403,'The key works, but NKJV is not among the Bibles this API.Bible account can use. Check the account’s Bible access, then connect again.');
  const details=await call(key,'/bibles/'+bible.id);
  const c=await load(),next={bibleId:bible.id,name:cleanText(bible.name||'New King James Version').slice(0,120),copyright:cleanText(details.data?.copyright||'').slice(0,600),checkedAt:Date.now(),deviceId:c.deviceId||crypto.randomUUID()};
  if(!envKey())next.key=key;
  await save(next);cache.clear();
  return status();
 }
 async function disconnect(){
  const c=await load();await save(c.deviceId?{deviceId:c.deviceId}:{});cache.clear();
  return status();
 }
 async function chapter(bookId,number){
  const book=BOOKS.get(bookId);
  if(!book||!Number.isInteger(number)||number<1||number>book.chapters)throw fail(400,'Unknown book or chapter.');
  const c=await load(),key=keyOf(c);
  if(!key||!c.bibleId)throw fail(409,'NKJV is not connected yet. In the Bible tab, choose NKJV and connect your API.Bible key.');
  const id=bookId+'.'+number,hit=cache.get(id);
  if(hit&&Date.now()-hit.at<CACHE_MS){report(c,hit.fumsToken);return hit.value;}
  if(inflight.has(id))return inflight.get(id);
  const run=(async()=>{
   const body=await call(key,'/bibles/'+c.bibleId+'/chapters/'+id+'?content-type=json&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=false&include-verse-spans=false');
   const verses=chapterVerses(body.data?.content,bookId,number);
   // A chapter must arrive whole: verses 1 to n with no gaps, and as many as API.Bible says it holds.
   const whole=verses.length&&verses.every((v,i)=>v.verse===i+1)&&(typeof body.data?.verseCount!=='number'||body.data.verseCount===verses.length);
   if(!whole)throw fail(502,'API.Bible returned '+book.english+' '+number+' incomplete, so nothing was loaded.');
   const value={verses,copyright:cleanText(body.data?.copyright||'')||c.copyright||''};
   cache.delete(id);cache.set(id,{at:Date.now(),value,fumsToken:body.meta?.fumsToken});
   let held=[...cache.values()].reduce((n,e)=>n+e.value.verses.length,0);
   while(held>CACHE_VERSES&&cache.size>1){const [oldest,entry]=cache.entries().next().value;cache.delete(oldest);held-=entry.value.verses.length;}
   if(held>CACHE_VERSES)cache.delete(id);
   report(c,body.meta?.fumsToken);
   return value;
  })();
  inflight.set(id,run);
  try{return await run;}finally{inflight.delete(id);}
 }
 // A parsed reference: whole chapters, one verse, or a range within or across chapters of one book.
 async function passage({bookId,chapter:first,verse=null,endChapter=first,endVerse=null}){
  // A verse with no end is that one verse; no verse means whole chapters.
  if(verse!==null&&endVerse===null&&endChapter===first)endVerse=verse;
  const book=BOOKS.get(bookId),ints=[first,endChapter].every(Number.isInteger)&&[verse,endVerse].every(v=>v===null||Number.isInteger(v)&&v>0);
  if(!book||!ints||first<1||endChapter<first||endChapter>book.chapters)throw fail(400,'Check the book, chapter and verses.');
  if(endChapter-first+1>MAX_CHAPTERS)throw fail(400,'Look up at most '+MAX_CHAPTERS+' chapters at a time.');
  const c=await load(),verses=[];let copyright='';
  for(let number=first;number<=endChapter;number++){
   const result=await chapter(bookId,number),last=result.verses.length;copyright||=result.copyright;
   const from=number===first&&verse!==null?verse:1,to=number===endChapter&&endVerse!==null?endVerse:last;
   if(from>last||to>last)throw fail(404,book.english+' '+number+' has '+last+' verses in NKJV.');
   if(to<from)throw fail(400,'The end must come after the start.');
   for(let v=from;v<=to;v++)verses.push({book_id:bookId,book:book.english,chapter:number,verse:v,text:result.verses[v-1].text});
  }
  return {verses,copyright,source:{provider:'API.Bible',bibleId:c.bibleId,fetchedAt:Date.now()}};
 }
 return {status,connect,disconnect,chapter,passage};
}
