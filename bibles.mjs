// Installed Bibles for offline lookup. Each translation is installed once from its official single-file archive
// (eBible.org VPL: one verse per line) into the data folder as one JSON file per book, then read lazily; only a few
// books are kept in memory. Nothing is bundled with the app and no Bible text goes into the studio page or shows
// beyond the verses looked up.
import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {zipEntries,readZipEntry} from './ziputil.mjs';
import {BIBLE_BOOKS} from './dist/reference.mjs';
import {YORUBA_CREDIT} from './dist/yoruba.mjs';
import {NKJV_CREDIT} from './dist/library.mjs';
import {readLimited} from './dist/readlimit.mjs';

// Licence notes come from each archive's details page on eBible.org.
export const CATALOG={
 kjv:{name:'King James Version',abbreviation:'KJV',file:'eng-kjv2006_vpl.zip',details:'https://ebible.org/Scriptures/details.php?id=eng-kjv2006',credit:'King James Version (public domain outside the UK) · text from eBible.org',strip:/[\[\]¶]/g},
 asv:{name:'American Standard Version',abbreviation:'ASV',file:'eng-asv_vpl.zip',details:'https://ebible.org/Scriptures/details.php?id=eng-asv',credit:'American Standard Version (public domain) · text from eBible.org'},
 web:{name:'World English Bible',abbreviation:'WEB',file:'engwebp_vpl.zip',details:'https://ebible.org/Scriptures/details.php?id=engwebp',credit:'World English Bible (public domain) · text from eBible.org'},
 oycb:{name:'Open Yoruba Contemporary Bible',abbreviation:'OYCB',file:'yor_vpl.zip',details:'https://ebible.org/Scriptures/details.php?id=yor',credit:YORUBA_CREDIT},
 // NKJV is never downloaded or shipped: it is installed only by importing a file the user is licensed to use.
 nkjv:{name:'New King James Version',abbreviation:'NKJV',file:'',importOnly:true,details:'',credit:NKJV_CREDIT}};
const DOWNLOAD_BASE='https://ebible.org/Scriptures/',ARCHIVE_LIMIT=25e6,TEXT_LIMIT=30e6,BOOKS_IN_MEMORY=12;
// eBible uses its own codes for eleven books.
const EBIBLE_CODES={SOL:'SNG',EZE:'EZK',JOE:'JOL',NAH:'NAM',MAR:'MRK',JOH:'JHN',PHI:'PHP',JAM:'JAS','1JO':'1JN','2JO':'2JN','3JO':'3JN'};
const BOOKS=new Map(BIBLE_BOOKS.map(b=>[b.id,b]));
const fail=(status,message)=>Object.assign(new Error(message),{status});

// VPL text ("GEN 1:1 In the beginning…") to {BOOK:[[verse 1 text, …], …]}. Verses a translation leaves out are null.
export function parseVPL(text,strip){
 const books={};let count=0;
 for(const line of text.split(/\r?\n/)){
  if(!line.trim())continue;
  const m=line.match(/^([A-Z0-9]{3}) (\d+):(\d+) (.*)$/);if(!m)throw fail(422,'The Bible text has a line Wordlight cannot read.');
  const id=EBIBLE_CODES[m[1]]||m[1],book=BOOKS.get(id);if(!book)continue;
  const chapter=Number(m[2]),verse=Number(m[3]),value=(strip?m[4].replace(strip,''):m[4]).replace(/\s+/g,' ').trim();
  if(chapter<1||chapter>book.chapters||verse<1||verse>200)throw fail(422,'The Bible text has a reference out of range ('+id+' '+chapter+':'+verse+').');
  const chapters=books[id]||=Array.from({length:book.chapters},()=>[]),list=chapters[chapter-1];
  while(list.length<verse-1)list.push(null);
  list[verse-1]=value||null;count++;
 }
 const missing=BIBLE_BOOKS.filter(b=>!books[b.id]||books[b.id].some(c=>!c.length)).map(b=>b.id);
 if(missing.length)throw fail(422,'The Bible text is incomplete ('+missing.slice(0,5).join(', ')+(missing.length>5?'…':'')+').');
 return {books,verses:count};
}

// seedDir: official archives shipped with the portable app, used instead of a download and on first start.
// fsx lets tests make a rename fail.
// FreeShow Bible (.fsb): [id, {name, books:[{number, chapters:[{number, verses:[{number, text}]}]}]}], books numbered
// 1-66 in the usual order. Markup in verse text is removed.
export function parseFSB(data){
 const bible=Array.isArray(data)?data[1]:data;
 if(!Array.isArray(bible?.books))throw fail(422,'This is not a FreeShow Bible file.');
 const lines=[];
 for(const book of bible.books){
  const id=BIBLE_BOOKS[Number(book?.number)-1]?.id;if(!id||!Array.isArray(book.chapters))continue;
  for(const chapter of book.chapters)for(const verse of Array.isArray(chapter?.verses)?chapter.verses:[]){
   const text=String(verse?.text??'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
   if(text&&Number(chapter.number)>0&&Number(verse.number)>0)lines.push(id+' '+Number(chapter.number)+':'+Number(verse.number)+' '+text);
  }
 }
 return parseVPL(lines.join('\n'));
}
export function createBibleLibrary({dataDir,request=fetch,base=DOWNLOAD_BASE,seedDir='',fsx={rename,rm},archiveLimit=ARCHIVE_LIMIT}){
 const root=path.join(dataDir,'bibles'),books=new Map(),jobs=new Map();
 const manifestFile=id=>path.join(root,id,'manifest.json');
 async function manifest(id){try{return JSON.parse(await readFile(manifestFile(id),'utf8'));}catch{return null;}}
 async function list(){
  const out=[];
  for(const [id,info] of Object.entries(CATALOG)){
   const m=await manifest(id),job=jobs.get(id);
   out.push({id,name:info.name,abbreviation:info.abbreviation,details:info.details,installed:!!m,importOnly:!!info.importOnly,from:m?.from||'',installedAt:m?.installedAt||0,verses:m?.verses||0,job:job?{state:job.state,message:job.message}:null});
  }
  return out;
 }
 // The archive: a seed pack shipped with the app when there is one, otherwise one download from eBible.org.
 async function archiveFor(info){
  if(info.importOnly)throw fail(400,info.abbreviation+' can only be added by importing your own file.');
  if(seedDir){try{return {archive:await readFile(path.join(seedDir,info.file)),from:'seed'};}catch{}}
  let response;
  try{response=await request(base+info.file,{signal:AbortSignal.timeout(120000)});}catch{throw fail(502,'Could not download '+info.abbreviation+'. Check the internet connection and try again.');}
  if(!response.ok)throw fail(502,'The download of '+info.abbreviation+' failed ('+response.status+').');
  // Read with a size cap: an unexpected response stops at the limit instead of filling memory.
  return {archive:Buffer.from(await readLimited(response,archiveLimit,'The '+info.abbreviation+' download')),from:'download'};
 }
 // Checks and converts the archive into a temporary folder, then swaps it into place. If the swap fails the
 // previous copy is put back; once the new copy is in place, a failed clean-up of the old one is not an error.
 async function run(id,job){
  try{
   const info=CATALOG[id],{archive,from}=await archiveFor(info);
   if(archive.length>archiveLimit)throw fail(413,'The '+info.abbreviation+' archive is larger than expected.');
   job.message='Installing…';
   const entries=zipEntries(archive),vpl=entries.find(e=>/_vpl\.txt$/.test(e.name)),about=entries.find(e=>/_about\.htm$/.test(e.name));
   if(!vpl)throw fail(422,'The '+info.abbreviation+' archive has no verse text.');
   const parsed=parseVPL(readZipEntry(archive,vpl,TEXT_LIMIT).toString('utf8'),info.strip);
   await place(id,job,parsed,about?readZipEntry(archive,about,2e6):null,{from,source:base+info.file,note:'Converted from the official VPL file; verse text unchanged except markup removed for display.'});
  }catch(err){
   job.state='failed';job.message=err.status?err.message:'Installing '+CATALOG[id].abbreviation+' failed.';
  }
 }
 // Writes converted text to a temporary folder, then swaps it into place. If the swap fails the previous copy is put
 // back; once the new copy is in place, a failed clean-up of the old one is not an error.
 // Windows can refuse a folder rename for a moment while another program (antivirus, an indexer) holds the folder.
 async function renameRetry(from,to){
  for(let attempt=0;;attempt++){
   try{return await fsx.rename(from,to);}
   catch(err){if(attempt>=4||!['EPERM','EBUSY','EACCES'].includes(err.code))throw err;await new Promise(r=>setTimeout(r,150*(attempt+1)));}
  }
 }
 async function place(id,job,{books:parsed,verses},about,meta){
  const info=CATALOG[id],temp=path.join(root,'.'+id+'-'+process.pid+'-'+Date.now());
  try{
   await mkdir(temp,{recursive:true});
   for(const [book,chapters] of Object.entries(parsed))await writeFile(path.join(temp,book+'.json'),JSON.stringify(chapters));
   // The archive's own notice is kept unchanged beside the converted text.
   if(about)await writeFile(path.join(temp,'about.htm'),about);
   await writeFile(path.join(temp,'manifest.json'),JSON.stringify({id,name:info.name,abbreviation:info.abbreviation,source:meta.source,from:meta.from,details:info.details,credit:info.credit,installedAt:Date.now(),verses,note:meta.note}));
   const target=path.join(root,id),old=target+'.old-'+Date.now();let moved=false;
   try{await renameRetry(target,old);moved=true;}catch(err){if(err.code!=='ENOENT')throw fail(500,'Installing '+info.abbreviation+' failed; the installed copy was kept.');}
   try{await renameRetry(temp,target);}
   catch{if(moved)await renameRetry(old,target).catch(()=>{});throw fail(500,'Installing '+info.abbreviation+' failed; '+(moved?'the previous copy was kept.':'nothing was installed.'));}
   for(const key of books.keys())if(key.startsWith(id+'/'))books.delete(key);
   jobs.delete(id);
   if(moved)await fsx.rm(old,{recursive:true,force:true}).catch(()=>{});
  }catch(err){
   await fsx.rm(temp,{recursive:true,force:true}).catch(()=>{});
   job.state='failed';job.message=err.status?err.message:'Installing '+info.abbreviation+' failed.';
  }
 }
 async function install(id){
  if(!CATALOG[id])throw fail(404,'Unknown translation.');
  if(CATALOG[id].importOnly)throw fail(400,CATALOG[id].abbreviation+' can only be added by importing your own file.');
  if(jobs.get(id)?.state==='running')return list();
  const job={state:'running',message:seedDir?'Installing…':'Downloading…'};jobs.set(id,job);
  run(id,job);
  return list();
 }
 // First start of the portable app: installs each shipped seed pack whose translation is not installed yet.
 // An installed copy is never replaced.
 async function seedMissing(){
  if(!seedDir)return;
  for(const [id,info] of Object.entries(CATALOG)){
   if(info.importOnly||await manifest(id)||jobs.get(id)?.state==='running')continue;
   try{await readFile(path.join(seedDir,info.file));}catch{continue;}
   const job={state:'running',message:'Installing…'};jobs.set(id,job);await run(id,job);
  }
 }
 // Import a Bible file the user provides (FreeShow .fsb, a VPL .txt, or a ZIP with one) into one of the version slots.
 // It stays on this computer; it is never shipped or shared.
 async function importFile(id,buffer,fileName){
  const info=CATALOG[id];if(!info)throw fail(404,'Unknown translation.');
  if(jobs.get(id)?.state==='running')throw fail(409,'Wait for the install to finish.');
  if(!buffer?.length||buffer.length>ARCHIVE_LIMIT*2)throw fail(413,'Choose a Bible file up to 50 MB.');
  let parsed;
  if(buffer.readUInt32LE(0)===0x04034b50){
   const entries=zipEntries(buffer),entry=entries.find(e=>/_vpl\.txt$/i.test(e.name))||entries.find(e=>/\.(txt|vpl)$/i.test(e.name))||entries.find(e=>/\.fsb$/i.test(e.name));
   if(!entry)throw fail(422,'The ZIP has no Bible text Wordlight can read.');
   const text=readZipEntry(buffer,entry,TEXT_LIMIT).toString('utf8');
   parsed=/\.fsb$/i.test(entry.name)?parseFSB(JSON.parse(text)):parseVPL(text,info.strip);
  }else{
   const text=buffer.toString('utf8').replace(/^\uFEFF/,''),start=text.trimStart()[0];
   if(start==='['||start==='{'){let data;try{data=JSON.parse(text);}catch{throw fail(422,'The file is not valid FreeShow Bible JSON.');}parsed=parseFSB(data);}
   else parsed=parseVPL(text,info.strip);
  }
  const job={state:'running',message:'Installing…'};jobs.set(id,job);
  await place(id,job,parsed,null,{from:'import',source:'Imported file '+path.basename(String(fileName||'bible')).slice(0,80),note:'Imported from a file you provided. It stays on this computer and is not shared.'});
  if(job.state==='failed')throw fail(500,job.message);
  return list();
 }
 async function remove(id){
  if(!CATALOG[id])throw fail(404,'Unknown translation.');
  if(jobs.get(id)?.state==='running')throw fail(409,'Wait for the install to finish.');
  await rm(path.join(root,id),{recursive:true,force:true});jobs.delete(id);
  for(const key of books.keys())if(key.startsWith(id+'/'))books.delete(key);
  return list();
 }
 // One book from disk, kept in a small most-recently-used cache.
 async function book(id,bookId){
  const key=id+'/'+bookId;
  if(books.has(key)){const value=books.get(key);books.delete(key);books.set(key,value);return value;}
  let value;try{value=JSON.parse(await readFile(path.join(root,id,bookId+'.json'),'utf8'));}catch{throw fail(404,CATALOG[id].abbreviation+' is not installed on this computer.');}
  books.set(key,value);while(books.size>BOOKS_IN_MEMORY)books.delete(books.keys().next().value);
  return value;
 }
 // Same request and answer shape as the NKJV lookup: one verse, a range, or whole chapters of one book.
 async function passage(id,{bookId,chapter:first,verse=null,endChapter=first,endVerse=null}){
  // A verse with no end is that one verse; no verse means whole chapters.
  if(verse!==null&&endVerse===null&&endChapter===first)endVerse=verse;
  const info=CATALOG[id],b=BOOKS.get(bookId);
  if(!info)throw fail(404,'Unknown translation.');
  const m=await manifest(id);if(!m)throw fail(404,info.abbreviation+' is not installed on this computer.');
  const ints=[first,endChapter].every(Number.isInteger)&&[verse,endVerse].every(v=>v===null||Number.isInteger(v)&&v>0);
  if(!b||!ints||first<1||endChapter<first||endChapter>b.chapters)throw fail(400,'Check the book, chapter and verses.');
  const chapters=await book(id,bookId),verses=[];
  for(let number=first;number<=endChapter;number++){
   const list=chapters[number-1]||[],last=list.length;
   const from=number===first&&verse!==null?verse:1,to=number===endChapter&&endVerse!==null?endVerse:last;
   if(from>last||to>last)throw fail(404,b.english+' '+number+' has '+last+' verses in '+info.abbreviation+'.');
   for(let v=from;v<=to;v++)if(list[v-1])verses.push({book_id:bookId,book:b.english,chapter:number,verse:v,text:list[v-1]});
  }
  if(!verses.length)throw fail(404,'That verse is not in '+info.abbreviation+'.');
  return {verses,copyright:m.credit,source:{provider:'Installed '+m.abbreviation,bibleId:id,fetchedAt:m.installedAt}};
 }
 const installed=async id=>!!(CATALOG[id]&&await manifest(id));
 return {list,install,remove,passage,installed,seedMissing,importFile};
}
