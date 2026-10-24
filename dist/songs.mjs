// Songs: FreeShow show files to Wordlight song snapshots, and song slides in a show's deck.
// FreeShow keeps one song per .show file: a JSON array [id, show] (hand-made files may be the bare show).
// A section is a slide with a group label (Verse 1, Chorus...) plus its continuation slides listed in `children`.
// An arrangement is a layout: an ordered list of section ids where repeats are allowed. A layout entry can be
// disabled, or hide some continuation pages for that one occurrence; Wordlight plays them the same way.
// Nothing is silently dropped: content over the limits is refused with exact counts, and anything not carried
// over (media, non-text items, styling) is listed in `skipped`.
// textPerSong and textPerShow bound the total lyrics, so saves (25 MB) and the bridge (10 MB) stay well within limits.
// expanded* bound what arrangements expand to (repeats included), which is what the deck and the live screen carry.
export const SONG_LIMITS={songsPerShow:60,sections:200,pagesPerSection:60,arrangements:20,arrangementLength:400,textLength:20000,textPerSong:200000,textPerShow:1500000,
 titleLength:300,metaLength:2000,expandedSlidesPerSong:1000,expandedTextPerSong:300000,expandedSlidesPerShow:3000,expandedTextPerShow:2000000};
const str=(v,max=500)=>typeof v==='string'?v.slice(0,max):'';
export const SECTION_KINDS=['verse','chorus','pre-chorus','bridge','intro','outro','tag','vamp','spoken','interlude','ending'];
export function sectionKind(label){
 const word=String(label||'').toLowerCase().replace(/\s*\d+\s*$/,'').trim().replace(/\s+/g,'-');
 return SECTION_KINDS.includes(word)?word:word==='prechorus'?'pre-chorus':'other';
}
export function sectionNumber(label){const m=String(label||'').match(/(\d+)\s*$/);return m?Number(m[1]):null;}
const over=(what,count,limit)=>{if(count>limit)throw new Error('This song has '+count+' '+what+'; Wordlight supports up to '+limit+'. Nothing was imported.');};
// Text of one FreeShow slide: every run of every line kept exactly, lines joined by line breaks, and text items
// (for example one per language) kept in their original order on separate lines. A slide with no text is a blank cue.
function slideText(slide){
 return (Array.isArray(slide?.items)?slide.items:[]).filter(it=>!it.type||it.type==='text')
  .map(it=>(Array.isArray(it.lines)?it.lines:[]).map(line=>(Array.isArray(line.text)?line.text:[]).map(run=>typeof run?.value==='string'?run.value:'').join('')).join('\n'))
  .filter(t=>t.trim()).join('\n');
}
export function freeShowToSong(raw,{categoryName=''}={}){
 const envelope=Array.isArray(raw)&&raw.length===2&&typeof raw[0]==='string';
 const id=envelope?raw[0]:str(raw?.id,100),show=envelope?raw[1]:raw;
 if(!show||typeof show!=='object'||Array.isArray(show)||!show.slides||typeof show.slides!=='object')throw new Error('This is not a FreeShow show.');
 const slides=show.slides,skipped=[];
 const childIds=new Set(Object.values(slides).flatMap(s=>Array.isArray(s?.children)?s.children:[]));
 const sections=[];let nonText=0;
 for(const [slideId,slide] of Object.entries(slides)){
  if(childIds.has(slideId)||!slide||typeof slide!=='object')continue;
  const children=(Array.isArray(slide.children)?slide.children:[]).filter(c=>slides[c]);
  const pages=[slide,...children.map(c=>slides[c])];
  over('continuation slides in '+(slide.group||'one section'),pages.length,SONG_LIMITS.pagesPerSection);
  for(const p of pages)nonText+=(p.items||[]).filter(it=>it.type&&it.type!=='text').length;
  const texts=pages.map(slideText);
  for(const t of texts)over('characters on one slide',t.length,SONG_LIMITS.textLength);
  const label=str(slide.group,60)||'Slide';
  sections.push({id:str(slideId,100),label,kind:sectionKind(label),number:sectionNumber(label),slides:texts,childIds:children});
 }
 over('sections',sections.length,SONG_LIMITS.sections);
 if(nonText)skipped.push(nonText+' non-text item'+(nonText===1?'':'s')+' (images, video or other media on slides)');
 const known=new Map(sections.map(s=>[s.id,s]));let unknown=0;
 const layouts=Object.entries(show.layouts&&typeof show.layouts==='object'?show.layouts:{});
 over('arrangements',layouts.length,SONG_LIMITS.arrangements);
 const arrangements=layouts.map(([layoutId,layout])=>{
  const order=[],hidden={};
  for(const ref of Array.isArray(layout?.slides)?layout.slides:[]){
   if(!ref||ref.disabled)continue;
   const section=known.get(ref.id);if(!section){unknown++;continue;}
   // Continuation pages hidden for this occurrence only (FreeShow layout child overrides).
   const pages=section.childIds.map((c,i)=>ref.children?.[c]?.disabled?i+1:null).filter(i=>i!==null);
   if(pages.length)hidden[order.length]=pages;
   order.push(section.id);
  }
  over('entries in one arrangement',order.length,SONG_LIMITS.arrangementLength);
  return {id:str(layoutId,100),name:str(layout?.name,80)||'Default',order,hidden};
 }).filter(a=>a.order.length);
 if(unknown)skipped.push(unknown+' layout entr'+(unknown===1?'y points':'ies point')+' to slides that are not in the file');
 // A show without a usable layout plays its sections in file order.
 if(!arrangements.length)arrangements.push({id:'all',name:'All sections',order:sections.map(s=>s.id),hidden:{}});
 const active=arrangements.find(a=>a.id===show.settings?.activeLayout)?.id||arrangements[0].id;
 const media=show.media&&typeof show.media==='object'?Object.keys(show.media).length:0;if(media)skipped.push(media+' media file'+(media===1?'':'s'));
 skipped.push('FreeShow text styles, positions and backgrounds (Wordlight uses the show’s Design)');
 const m=show.meta||{},meta={};
 for(const [key,from] of [['title','title'],['author','author'],['artist','artist'],['composer','composer'],['copyright','copyright'],['ccli','CCLI'],['publisher','publisher'],['collection','collection'],['number','number'],['year','year'],['key','key']]){const v=String(m[from]??'').trim();if(v)meta[key]=v;}
 const title=String(show.name||'').trim()||meta.title||'Untitled song';
 return cleanSong({format:'wordlight-song',version:1,id:str(id,100)||str(show.name,100),title,meta,category:categoryName,
  source:{app:'freeshow',id:str(id,100),name:title,modified:Number(show.timestamps?.modified)||0},
  sections:sections.map(({childIds,...s})=>s),arrangements,arrangementId:active,skipped});
}
// Checks a saved or imported song snapshot. Invalid or over-limit data is refused, never trimmed.
export function cleanSong(v){
 if(!v||v.format!=='wordlight-song'||v.version!==1||!Array.isArray(v.sections)||!Array.isArray(v.arrangements))throw new Error('This is not a Wordlight song.');
 over('sections',v.sections.length,SONG_LIMITS.sections);over('arrangements',v.arrangements.length,SONG_LIMITS.arrangements);
 const seen=new Set();
 const sections=v.sections.map((s,i)=>{
  const id=str(s?.id,100);if(!id||seen.has(id))throw new Error('Song section IDs must be unique.');seen.add(id);
  if(!Array.isArray(s.slides)||!s.slides.length||s.slides.some(t=>typeof t!=='string'))throw new Error('A song section has no readable slides.');
  over('continuation slides in one section',s.slides.length,SONG_LIMITS.pagesPerSection);for(const t of s.slides)over('characters on one slide',t.length,SONG_LIMITS.textLength);
  const label=str(s.label,60)||'Slide';return {id,label,kind:sectionKind(label),number:sectionNumber(label),slides:[...s.slides]};
 });
 over('characters of lyrics',songTextLength({sections}),SONG_LIMITS.textPerSong);
 const byId=new Map(sections.map(s=>[s.id,s]));
 const arrangements=v.arrangements.map((a,i)=>{
  const order=Array.isArray(a?.order)?a.order:[];
  if(!order.length||order.some(x=>!byId.has(x)))throw new Error('A song arrangement refers to a missing section.');
  over('entries in one arrangement',order.length,SONG_LIMITS.arrangementLength);
  const hidden={};
  for(const [pos,pages] of Object.entries(a.hidden&&typeof a.hidden==='object'?a.hidden:{})){
   const n=Number(pos),section=byId.get(order[n]);
   if(!Number.isInteger(n)||!section||!Array.isArray(pages))continue;
   const valid=pages.filter(p=>Number.isInteger(p)&&p>0&&p<section.slides.length);if(valid.length)hidden[n]=[...new Set(valid)];
  }
  return {id:str(a.id,100)||'arrangement-'+i,name:str(a.name,80)||'Arrangement',order:[...order],hidden};
 });
 // Every arrangement must stay within the expanded limits, since any of them can be chosen and sent.
 for(const a of arrangements){const size=expandedSize({sections,arrangements:[a],arrangementId:a.id});over('slides when “'+a.name+'” is expanded',size.slides,SONG_LIMITS.expandedSlidesPerSong);over('characters when “'+a.name+'” is expanded',size.chars,SONG_LIMITS.expandedTextPerSong);}
 const meta={};
 for(const [k,x] of Object.entries(v.meta&&typeof v.meta==='object'?v.meta:{})){
  if(typeof x!=='string'||!x.trim())continue;
  if(k.length>30)throw new Error('A song detail has an unexpected name.');
  over('characters in “'+k+'”',x.length,SONG_LIMITS.metaLength);meta[k]=x;
 }
 const title=typeof v.title==='string'&&v.title.trim()?v.title:'Untitled song';over('characters in the title',title.length,SONG_LIMITS.titleLength);
 return {format:'wordlight-song',version:1,id:str(v.id,100)||'song',title,meta,category:str(v.category,200),
  source:{app:str(v.source?.app,30),id:str(v.source?.id,100),name:typeof v.source?.name==='string'&&v.source.name.length<=SONG_LIMITS.titleLength?v.source.name:title,modified:Number(v.source?.modified)||0},
  sections,arrangements,arrangementId:arrangements.some(a=>a.id===v.arrangementId)?v.arrangementId:arrangements[0].id,
  skipped:(Array.isArray(v.skipped)?v.skipped:[]).filter(x=>typeof x==='string').slice(0,20),edited:v.edited===true};
}
// Slides and characters the chosen arrangement expands to (repeats counted each time, hidden pages left out).
export function expandedSize(song){
 const a=song.arrangements.find(x=>x.id===song.arrangementId)||song.arrangements[0],byId=new Map(song.sections.map(s=>[s.id,s]));
 let slides=0,chars=0;
 a.order.forEach((id,position)=>{const s=byId.get(id),hidden=new Set(a.hidden?.[position]||[]);if(!s)return;s.slides.forEach((t,page)=>{if(!hidden.has(page)){slides++;chars+=t.length;}});});
 return {slides,chars};
}
export function songTextLength(song){return song.sections.reduce((n,s)=>n+s.slides.reduce((m,t)=>m+t.length,0),0);}
// The credit line shown on song slides: copyright and CCLI number as stored in the song, never looked up.
export function songCredit(song){return [song.meta.copyright,song.meta.ccli?'CCLI Song # '+song.meta.ccli:''].filter(Boolean).join(' · ');}
// Deck slides for one song in its chosen arrangement: each page of each section, in order, repeats included,
// minus pages hidden for that occurrence.
export function songSlides(song,entryId){
 const arrangement=song.arrangements.find(a=>a.id===song.arrangementId)||song.arrangements[0],byId=new Map(song.sections.map(s=>[s.id,s]));
 const slides=[];
 arrangement.order.forEach((sectionId,position)=>{
  const section=byId.get(sectionId),hidden=new Set(arrangement.hidden?.[position]||[]);if(!section)return;
  const shown=section.slides.map((text,page)=>({text,page})).filter(p=>!hidden.has(p.page));
  shown.forEach(({text,page},i)=>slides.push({entryId,position,page:i,pages:shown.length,sourcePage:page,section:section.label,kind:section.kind,number:section.number,text}));
 });
 return slides;
}
// Search over the song index (names only). Accent- and case-insensitive; every word must appear.
export const foldText=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
export function searchSongs(index,{query='',category='',offset=0,limit=50}={}){
 const words=foldText(query).split(/\s+/).filter(Boolean);
 const hits=index.filter(s=>(!category||s.category===category)&&words.every(w=>s.folded.includes(w)));
 return {total:hits.length,offset,items:hits.slice(offset,offset+Math.min(100,Math.max(1,limit))).map(({folded,...s})=>s)};
}
// Editing. Lyrics are plain text: a "[Section label]" line starts a section, a blank line starts a new slide in
// it, and a section with no lines is one blank cue. The arrangement is the section labels in order, comma
// separated, with repeats allowed ("Verse 1, Chorus, Verse 2, Chorus"). Edits change the show's copy only.
// A slide containing only "(blank)" is a blank cue, so blank slides inside a section survive editing.
const BLANK='(blank)';
export function songToText(song){
 return song.sections.map(s=>'['+s.label+']\n'+s.slides.map(t=>t===''?BLANK:t).join('\n\n')).join('\n\n');
}
export function arrangementText(song,arrangementId=song.arrangementId){
 const byId=new Map(song.sections.map(s=>[s.id,s.label])),a=song.arrangements.find(x=>x.id===arrangementId)||song.arrangements[0];
 return a.order.map(id=>byId.get(id)).join(', ');
}
export function parseSongText(text){
 const sections=[];let current=null,page=[];
 const closePage=()=>{if(current&&page.length){const text=page.join('\n');current.slides.push(text.trim()===BLANK?'':text);page=[];}};
 for(const raw of String(text).replace(/\r\n?/g,'\n').split('\n')){
  const header=raw.trim().match(/^\[(.+)\]$/);
  if(header){closePage();current={label:header[1].trim().slice(0,60),slides:[]};sections.push(current);continue;}
  if(!raw.trim()){closePage();continue;}
  if(!current)throw new Error('Start the lyrics with a section label such as [Verse 1].');
  page.push(raw.replace(/\s+$/,''));
 }
 closePage();
 if(!sections.length)throw new Error('Add at least one section, such as [Verse 1].');
 const labels=new Set();
 for(const s of sections){const key=s.label.toLowerCase();if(labels.has(key))throw new Error('The section label “'+s.label+'” is used twice. Give each section its own label (for example Verse 1, Verse 2).');labels.add(key);if(!s.slides.length)s.slides.push('');}
 return sections;
}
// Returns an edited copy of the song. Sections keep their ids when their label is unchanged, so other saved
// arrangements stay valid; an arrangement that still uses a removed section is an error, not a silent change.
export function editSong(song,{title,meta={},lyrics,arrangement}){
 const parsed=parseSongText(lyrics),byLabel=new Map(song.sections.map(s=>[s.label.toLowerCase(),s.id])),used=new Set();
 let n=0;const newId=()=>{let id;do id='s'+(++n);while(byLabel.has(id)||used.has(id)||song.sections.some(s=>s.id===id));return id;};
 const sections=parsed.map(s=>{const id=byLabel.get(s.label.toLowerCase())||newId();used.add(id);return {id,label:s.label,slides:s.slides};});
 const idFor=new Map(sections.map(s=>[s.label.toLowerCase(),s.id]));
 const order=String(arrangement||'').split(',').map(x=>x.trim()).filter(Boolean).map(label=>{const id=idFor.get(label.toLowerCase());if(!id)throw new Error('The arrangement uses “'+label+'”, which is not a section label.');return id;});
 if(!order.length)throw new Error('List at least one section in the arrangement.');
 const current=song.arrangements.find(a=>a.id===song.arrangementId)||song.arrangements[0];
 const unchanged=current.order.length===order.length&&current.order.every((id,i)=>id===order[i]);
 const others=song.arrangements.filter(a=>a.id!==current.id).map(a=>{const missing=a.order.filter(id=>!used.has(id));if(missing.length)throw new Error('The arrangement “'+a.name+'” still uses '+missing.length+' removed section'+(missing.length===1?'':'s')+'. Keep those sections or remove that arrangement.');return a;});
 const kept=Object.fromEntries(Object.entries(meta).map(([k,v])=>[k,String(v||'').trim()]).filter(([,v])=>v));
 return cleanSong({...song,title:String(title||'').trim()||song.title,meta:{...Object.fromEntries(Object.entries(song.meta).filter(([k])=>!(k in meta))),...kept},
  sections,arrangements:[{...current,order,hidden:unchanged?current.hidden:{}},...others],arrangementId:current.id,edited:true});
}
export function newSong(title='New song'){
 return cleanSong({format:'wordlight-song',version:1,id:'native-'+(globalThis.crypto?.randomUUID?.()||Date.now()),title,meta:{},category:'',source:{app:'wordlight'},sections:[{id:'s1',label:'Verse 1',slides:['']}],arrangements:[{id:'main',name:'Default',order:['s1'],hidden:{}}],arrangementId:'main',skipped:[]});
}
// Song files for export/import without FreeShow.
export function songFile(song){return {format:'wordlight-song-file',version:1,song};}
export function readSongFile(raw){
 if(raw?.format==='wordlight-song-file'&&raw.version===1)return cleanSong(raw.song);
 if(raw?.format==='wordlight-song')return cleanSong(raw);
 return freeShowToSong(raw);
}
