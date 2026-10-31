// Builds the church songbook file from the FreeShow library and the July song catalogue. The result is one
// wordlight-song-library file that the studio's Import library button accepts. Nothing is written to FreeShow.
//   node tools/build-songbook.mjs --catalogue songs.json --freeshow-index shows.json --shows Shows
//     --categories settings_synced.json --out songbook.json
// Which records are kept, and why (the audit of 31 October 2026):
//   checked  words the team typed by hand, and any show the church has ever put on screen
//   book     named hymn books and short chorus collections
//   reserve  blog copies of core Nigerian worship songs: searchable, but the words are checked before first use
// Everything else in the catalogue is left out. Lyrics are never committed to this repository.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {cleanSong,freeShowToSong,foldWords} from '../dist/songs.mjs';

const SLIDE_LINES=4,LONG_SLIDE=6;
const BOOKS=['Iwe Orin Mimo','Apostolic Faith WECA'];
const CHORUS_SOURCES=['Nigerian Praise','VoGStudio','Believers Portal','Nigerian Christian Songs (Baylor)'];
const BLOG_SOURCES=['GospelLyricsNG','GospelMinds','African Gospel Lyrics','NgLyrics','PraiseVibes'];
const VIDEOPSALM=[['VideoPsalm - C&S Yoruba Hymns - Review','VideoPsalm C&S'],['VideoPsalm - English Hymns - Review','VideoPsalm English']];
const CORE_ARTISTS=['Sinach','Nathaniel Bassey','Dunsin Oyekan','Mercy Chinwo','Moses Bliss','Judikay','Theophilus Sunday','Minister GUC','Eben','Tope Alabi','Yinka Ayefele','Lara George','Frank Edwards','Tim Godfrey','Steve Crown','Prospa Ochimana','Chioma Jesus','Ada Ehi','Sammie Okposo','Panam Percy Paul','Midnight Crew','Bidemi Olaoba','Gaise Baba','Lawrence Oyor','Victoria Orenze','Jimmy D Psalmist','Nosa','Preye Odede','Joe Praize','Samsong','Onos Ariyo','Mike Abdul','Neon Adejo','Kefee','Tosin Martins','Ebuka Songs','Folabi Nuel','Emmaohmagod','EmmaOMG','Kent Edunjobi','Tolu Odukoya','Efe Nathan','Dr Paul Enenche','Tolu Odukoya-Ijogun','Pastor Bimbo Ademoye','Sunmisola Agbebi','GUC','Limoblaze','Chandler Moore'].map(foldWords);

// A section label on a line of its own, read after folding. "Ese" is the Yoruba books' word for a verse.
const LABEL=/^(verse|stanza|ese|chorus|refrain|bridge|pre ?chorus|tag|vamp|ending|outro|intro) ?(\d*)$/;
// Dynamics printed at the start of a hymn line in Iwe Orin Mimo, such as "mf A ba le n'igbagbo".
const MUSIC_MARK=/^(?:mf|mp|ff|pp|cr|dim|rall|f|p)[.,]?\s+(?=\S)/;
// Lines the sites added: headers, adverts and links. They are not lyrics.
const SITE_LINE=/https?:|www\.|\.com\b|download|\bmp3\b|\bmp4\b|lyrics? (?:by|to|video)|^song title|^the video|^video:|^audio:|^artist:|^album:|^by [\w .'-]{3,40}$|^for .+ by |\[other songs|other songs by|^tip \d|^source:|©|copyright/i;

// Stable ids, so importing a newer file skips songs already in the library.
const songId=key=>'wl-'+createHash('sha256').update(key).digest('hex').slice(0,32);
// Hymns are matched across books by the start of their first line, spacing and spelling marks ignored.
const rowKey=row=>row.original_source+'|'+(row.url||row.source_id)+'|'+row.title;
const hymnKey=lines=>foldWords(lines[0]||'').replaceAll(' ','').slice(0,24);
const labelName=(word,number)=>{const name={stanza:'verse',ese:'verse',refrain:'chorus',prechorus:'pre-chorus','pre chorus':'pre-chorus'}[word]||word;return name.charAt(0).toUpperCase()+name.slice(1)+(number?' '+number:'');};

export function cleanLine(line){return String(line||'').replace(MUSIC_MARK,'').replace(/\s+/g,' ').trim();}
export const isSiteLine=line=>SITE_LINE.test(line);
// Long blocks become slides of at most four lines, which is what the team types by hand.
export function pageLines(lines,size=SLIDE_LINES){
 const pages=[];
 for(let i=0;i<lines.length;i+=size)pages.push(lines.slice(i,i+size).join('\n'));
 return pages.length?pages:[''];
}
// Blocks of text to sections. A repeated block is one section sung again, so the first repeated block is the chorus.
// Sites that put one line in each block (Apostolic Faith) are read line by line under their labels.
export function sectionsFromBlocks(blocks){
 const groups=[];let group=null;
 const start=label=>{group={label,lines:[]};groups.push(group);};
 const oneLinePerBlock=blocks.filter(b=>!b.includes('\n')).length>blocks.length*0.6&&blocks.length>8;
 for(const block of blocks){
  if(!oneLinePerBlock)group=null;
  for(const raw of block.split('\n')){
   const line=cleanLine(raw);if(!line)continue;
   const label=foldWords(line).match(LABEL);
   if(label){start(labelName(label[1],label[2]));continue;}
   if(isSiteLine(line))continue;
   if(!group)start('');
   group.lines.push(line);
  }
 }
 const filled=groups.filter(g=>g.lines.length),byText=new Map(),order=[];
 for(const g of filled){
  const text=foldWords(g.lines.join(' '));
  if(byText.has(text)){byText.get(text).repeats++;order.push(byText.get(text));continue;}
  const section={...g,repeats:0};byText.set(text,section);order.push(section);
 }
 const unique=[...byText.values()],used=new Set();let verse=0,chorus=0;
 const unused=name=>{let label=name,n=2;while(used.has(label.toLowerCase()))label=name+' '+n++;used.add(label.toLowerCase());return label;};
 unique.forEach((s,i)=>{
  if(s.label){s.label=unused(s.label);return;}
  s.label=s.repeats?unused(++chorus===1?'Chorus':'Chorus '+chorus):unused('Verse '+(++verse));
 });
 unique.forEach((s,i)=>{s.id='s'+(i+1);});
 return {sections:unique.map(s=>({id:s.id,label:s.label,slides:pageLines(s.lines)})),order:order.map(s=>s.id)};
}
function librarySong({key,title,artist,language,collection,number,status,origin,aliases,blocks}){
 const {sections,order}=sectionsFromBlocks(blocks);
 if(!sections.length)return null;
 const meta={artist,language,collection,number,status,origin,aliases};
 return cleanSong({format:'wordlight-song',version:1,id:songId(key),title,meta,category:'',source:{app:'wordlight'},sections,arrangements:[{id:'main',name:'Default',order,hidden:{}}],arrangementId:'main',skipped:[]});
}
const firstLines=song=>song.sections.flatMap(s=>s.slides).join('\n').split('\n').filter(Boolean);
// FreeShow's slides are kept as they are, except that very long slides are split for the screen.
function fromFreeShow(raw,{key,collection,status,origin}){
 const song=freeShowToSong(raw,{categoryName:''});
 const sections=song.sections.map(s=>({...s,slides:s.slides.flatMap(t=>{const lines=t.split('\n').map(cleanLine).filter(Boolean);return lines.length>LONG_SLIDE?pageLines(lines):[lines.join('\n')];})}));
 return cleanSong({...song,id:songId(key),category:'',meta:{...song.meta,collection,status,origin},source:{app:'wordlight'},sections,skipped:[],arrangements:song.arrangements.map(a=>({...a,hidden:{}}))});
}
const artistIsCore=artist=>{const name=' '+foldWords(artist)+' ';return CORE_ARTISTS.some(a=>name.includes(' '+a+' '));};
// A blog record is only worth holding if it looks like one song with its words, not a page.
function usableBlog(row){
 const lines=row.lyrics_blocks.flatMap(b=>b.split('\n')).map(cleanLine).filter(Boolean);
 return lines.length>=6&&lines.length<=150&&lines.filter(isSiteLine).length<3&&!/download|mp3|^\d+$/i.test(row.title);
}

export async function buildSongbook({catalogue,freeshowIndex,categories,readShow}){
 const songs=[],seen=new Set(),counts={},failed=[];
 const add=(song,tier,keys=[])=>{if(!song)return;songs.push(song);counts[tier]=(counts[tier]||0)+1;for(const k of keys)seen.add(k);};
 // The church's own songs first: shows typed by hand (no scraper source, and not in the imported review
 // categories) and any show that has ever been projected, whatever its source.
 const names=Object.fromEntries(Object.entries(categories).map(([id,c])=>[id,c?.name||id]));
 const entries=Object.entries(freeshowIndex).filter(([,e])=>typeof e?.name==='string');
 const importedByHand=e=>!/Curated Gospel Library|^VideoPsalm|Presentation/.test(names[e.category]||'')&&names[e.category];
 for(const [id,entry] of entries){
  const raw=await readShow(entry.name);if(!raw)continue;
  const show=Array.isArray(raw)?raw[1]:raw;
  const handMade=!show?.meta?.originalSource&&(importedByHand(entry)||names[entry.category]==='Curated Gospel Library');
  const projected=!!show?.timestamps?.used&&!/Presentation/.test(names[entry.category]||'');
  if(!handMade&&!projected)continue;
  try{const song=fromFreeShow(raw,{key:'hand:'+id,collection:'Church songs',status:'checked',origin:handMade?'Typed by the team in FreeShow':'Projected from the FreeShow library'});add(song,handMade?'hand-made':'projected',[hymnKey(firstLines(song))]);}
  catch(err){failed.push(entry.name+': '+err.message);}
 }
 // Hymn books, best text first. Apostolic Faith comes last because its hymns mostly repeat the others.
 for(const [category,collection] of VIDEOPSALM){
  for(const [id,entry] of entries.filter(([,e])=>names[e.category]===category)){
   const raw=await readShow(entry.name);if(!raw)continue;
   try{
    const song=fromFreeShow(raw,{key:'videopsalm:'+id,collection,status:'book',origin:collection}),key=hymnKey(firstLines(song));
    if(!key||seen.has(key))continue;add(song,collection,[key]);
   }catch(err){failed.push(entry.name+': '+err.message);}
  }
 }
 for(const book of BOOKS){
  for(const row of catalogue.filter(r=>r.original_source===book)){
   try{
    const song=librarySong({key:rowKey(row),title:row.title,artist:row.artist||'',language:row.languages?.[0]||'',collection:book,status:'book',origin:book+' '+(row.url||''),blocks:row.lyrics_blocks});
    if(!song)continue;const key=hymnKey(firstLines(song));if(!key||seen.has(key))continue;add(song,book,[key]);
   }catch(err){failed.push(row.title+': '+err.message);}
  }
 }
 // Short choruses are known by their first line, so that becomes the title and the old title stays searchable.
 for(const collection of CHORUS_SOURCES){
  for(const row of catalogue.filter(r=>r.original_source===collection)){
   try{
    const made=librarySong({key:rowKey(row),title:row.title,artist:row.artist||'',language:row.languages?.[0]||'',collection,status:'book',origin:collection+' '+(row.url||''),aliases:row.title,blocks:row.lyrics_blocks});
    if(!made)continue;const lines=firstLines(made),key=hymnKey(lines);if(!key||seen.has(key))continue;
    add({...made,title:lines[0].slice(0,120)},collection,[key]);
   }catch(err){failed.push(row.title+': '+err.message);}
  }
 }
 const keptBeforeReserve=songs.length;
 const reserveTitles=new Set();
 for(const row of catalogue.filter(r=>BLOG_SOURCES.includes(r.original_source)&&artistIsCore(r.artist)&&usableBlog(r))){
  const titleKey=foldWords(row.title+' '+row.artist);if(reserveTitles.has(titleKey))continue;
  try{
   const song=librarySong({key:rowKey(row),title:row.title,artist:row.artist||'',language:row.languages?.[0]||'',collection:'Reserve',status:'reserve',origin:row.original_source+' '+(row.url||''),blocks:row.lyrics_blocks});
   if(!song)continue;const key=hymnKey(firstLines(song));if(!key||seen.has(key))continue;add(song,'reserve',[key]);reserveTitles.add(titleKey);
  }catch(err){failed.push(row.title+': '+err.message);}
 }
 return {library:{format:'wordlight-song-library',version:1,songs},counts,kept:keptBeforeReserve,failed};
}

async function main(){
 const args=Object.fromEntries(process.argv.slice(2).reduce((pairs,word,i,all)=>word.startsWith('--')?[...pairs,[word.slice(2),all[i+1]]]:pairs,[]));
 for(const need of ['catalogue','freeshow-index','shows','categories','out'])if(!args[need])throw new Error('Missing --'+need);
 const json=async file=>JSON.parse(await readFile(file,'utf8'));
 const readShow=name=>/[\\/]/.test(name)?null:json(args.shows+'/'+name+'.show').catch(()=>null);
 const result=await buildSongbook({catalogue:await json(args.catalogue),freeshowIndex:await json(args['freeshow-index']),categories:(await json(args.categories)).categories||{},readShow});
 await writeFile(args.out,JSON.stringify(result.library));
 console.log(JSON.stringify({total:result.library.songs.length,kept:result.kept,counts:result.counts,failed:result.failed.length,firstFailures:result.failed.slice(0,5)},null,1));
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)main().catch(err=>{console.error(err.message);process.exit(1);});
