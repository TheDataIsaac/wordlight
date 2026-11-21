// Builds psalm-titles.json: the psalm titles ("A Psalm of David.") and Psalm 119's letter headings (ALEPH) of each
// shipped Bible, read from eBible's USFM files, where they are marked as their own lines (\d and \qa). The one-verse-
// per-line files Wordlight installs join them onto the verse that follows, so the projector showed "A Psalm of David.
// The LORD is my shepherd". bibles.mjs takes a heading off the front of its verse when the verse starts with it.
//   node tools/build-psalm-titles.mjs
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipEntries,readZipEntry} from '../ziputil.mjs';
import {CATALOG} from '../bibles.mjs';

const repo=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),cacheDir=path.join(repo,'build','cache');
async function cached(name,url){
 const file=path.join(cacheDir,name);
 try{return await readFile(file);}catch{}
 const response=await fetch(url,{signal:AbortSignal.timeout(300000)});
 if(!response.ok)throw new Error('Download failed ('+response.status+'): '+url);
 const buf=Buffer.from(await response.arrayBuffer());await mkdir(cacheDir,{recursive:true});await writeFile(file,buf);return buf;
}
// USFM markup to the plain words the verse-per-line file has: notes and cross references go, word markers keep the word.
const plain=text=>text
 // Words the translators added (\add) are in brackets in the verse-per-line files: [A Psalm] of David.
 .replace(/\\\+?add\s+(.*?)\\\+?add\*/g,'[$1]')
 .replace(/\\f\s.*?\\f\*/g,'').replace(/\\x\s.*?\\x\*/g,'')
 .replace(/\\\+?w\s+([^|\\]*)(?:\|[^\\]*)?\\\+?w\*/g,'$1')
 .replace(/\\\+?[a-z]+\d*\*?/g,'').replace(/\s+/g,' ').trim();

const titles={};
for(const [id,info] of Object.entries(CATALOG)){
 if(info.importOnly||!info.file)continue;
 const usfmName=info.file.replace(/_vpl\.zip$/,'_usfm.zip');
 const zip=await cached(usfmName,'https://ebible.org/Scriptures/'+usfmName);
 const entry=zipEntries(zip).find(e=>/PSA[^/]*\.usfm$/i.test(e.name));
 if(!entry)throw new Error('No Psalms file in '+usfmName);
 const lines=readZipEntry(zip,entry,20e6).toString('utf8').split(/\r?\n/);
 const found={};let chapter=0,pending='';
 for(const line of lines){
  const c=line.match(/^\\c\s+(\d+)/);if(c){chapter=Number(c[1]);pending='';continue;}
  const heading=line.match(/^\\(?:d|qa)\s+(.*)$/);if(heading&&chapter){pending=(pending?pending+' ':'')+plain(heading[1]);continue;}
  const v=line.match(/^\\v\s+(\d+)/);
  if(v&&chapter&&pending){(found[chapter]||={})[v[1]]=pending;pending='';}
 }
 titles[id]=found;
 console.log(id+': '+Object.values(found).reduce((n,c)=>n+Object.keys(c).length,0)+' headings');
}
await writeFile(path.join(repo,'psalm-titles.json'),JSON.stringify(titles));
