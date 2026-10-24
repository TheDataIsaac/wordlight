import {YORUBA_CREDIT} from './yoruba.mjs';
import {rangeFromResponse,cleanBibleVerses} from './scripture.mjs';
import {DEFAULT,THEMES,cleanDraft,cleanTextSlide,makeDeck} from './core.mjs';
import {parseReference} from './reference.mjs';
const copy=v=>JSON.parse(JSON.stringify(v));
export const MAX_SHOWS=100,MAX_SCENES=60,MAIN_SCENE='scene-main';
// A show's saved size is checked before items are added, so a long service cannot grow past what saving accepts.
export const MAX_SHOW_BYTES=10_000_000;
const emptyDraft=title=>cleanDraft({...DEFAULT,title,passage:'',reference:'',notes:[],textSlides:[],slideOrder:[],includePassage:false,previewId:'',selectedNoteId:''});
export function createShow(title='Untitled show',source=null){
 const draft=source?cleanDraft(copy(source)):emptyDraft(title);
 draft.title=String(title).slice(0,100)||'Untitled show';
 return {id:crypto.randomUUID(),draft,updated:Date.now(),scenes:[{id:MAIN_SCENE,name:'Scene 1'}],activeSceneId:MAIN_SCENE};
}
// Scenes. show.draft is always the active scene's content, so code that only knows about show.draft
// keeps working. The active entry in show.scenes holds just its id and name; every other scene keeps
// its own draft. Nothing is stored twice. Shows saved before scenes existed get one scene.
function cleanScenes(raw){
 const scenes=[],seen=new Set();
 const list=Array.isArray(raw?.scenes)?raw.scenes:[];
 if(list.length>MAX_SCENES)throw new Error('A show can hold up to '+MAX_SCENES+' scenes.');
 for(const s of list){
  const id=typeof s?.id==='string'?s.id.slice(0,100):'';
  if(!id||seen.has(id))throw new Error('Scene IDs must be unique.');
  seen.add(id);scenes.push({id,name:typeof s.name==='string'&&s.name.trim()?s.name.slice(0,80):'Scene',...(s.draft?{draft:cleanDraft(s.draft)}:{})});
 }
 // Only an entry without its own draft can be the active one; entries that hold a draft are never dropped.
 let active=scenes.find(s=>s.id===raw?.activeSceneId&&!s.draft)||scenes.find(s=>!s.draft);
 if(!active){
  // Every listed scene has its own content, so show.draft needs an entry of its own. Refuse rather than
  // drop a scene or save more scenes than the next load accepts.
  if(scenes.length>=MAX_SCENES)throw new Error('This show has more than '+MAX_SCENES+' scenes, which is over the limit. Nothing was changed.');
  let id=MAIN_SCENE,n=2;while(seen.has(id))id=MAIN_SCENE+'-'+n++;active={id,name:'Scene '+(scenes.length+1)};scenes.unshift(active);
 }
 for(const s of scenes)if(s!==active&&!s.draft)s.draft=emptyDraft('');
 return {scenes,activeSceneId:active.id};
}
export function activeScene(show){return show.scenes.find(s=>s.id===show.activeSceneId)||show.scenes[0];}
export function sceneDraft(show,id){return id===show.activeSceneId?show.draft:show.scenes.find(s=>s.id===id)?.draft||null;}
export function switchScene(show,id){
 if(id===show.activeSceneId)return show.draft;
 const next=show.scenes.find(s=>s.id===id);if(!next?.draft)throw new Error('Scene not found.');
 const title=show.draft.title;activeScene(show).draft=show.draft;
 show.draft=next.draft;delete next.draft;show.draft.title=title;show.activeSceneId=id;show.updated=Date.now();return show.draft;
}
// Adds a scene after the active one: a copy of source, or empty. Does not switch to it.
export function addScene(show,name,source=null){
 if(show.scenes.length>=MAX_SCENES)throw new Error('A show can hold up to '+MAX_SCENES+' items. Remove one first.');checkShowSize(show,source);
 const draft=source?cleanDraft(copy(source)):emptyDraft(show.draft.title);draft.title=show.draft.title;
 const scene={id:crypto.randomUUID(),name:String(name||'').trim().slice(0,80)||'Item '+(show.scenes.length+1),draft};
 show.scenes.splice(show.scenes.indexOf(activeScene(show))+1,0,scene);show.updated=Date.now();return scene;
}
export function renameScene(show,id,name){const scene=show.scenes.find(s=>s.id===id);if(scene){scene.name=String(name).trim().slice(0,80)||scene.name;show.updated=Date.now();}return scene;}
// Returns what is needed to undo. Removing the active scene switches to its neighbour first.
export function removeScene(show,id){
 if(show.scenes.length<=1)throw new Error('Keep at least one scene in this show.');
 let index=show.scenes.findIndex(s=>s.id===id);if(index<0)throw new Error('Scene not found.');
 if(id===show.activeSceneId)switchScene(show,show.scenes[index+1]?.id||show.scenes[index-1].id);
 index=show.scenes.findIndex(s=>s.id===id);const [scene]=show.scenes.splice(index,1);show.updated=Date.now();return {scene,index};
}
export function restoreScene(show,removed){
 if(show.scenes.length>=MAX_SCENES)throw new Error('Remove a scene before restoring this one.');
 if(show.scenes.some(s=>s.id===removed.scene.id))throw new Error('This scene is already in the show.');
 show.scenes.splice(Math.min(removed.index,show.scenes.length),0,removed.scene);show.updated=Date.now();
}
// An independent copy of a show with every scene, for Duplicate and Import.
export function copyShow(show,title=show.draft.title){
 const clean=cleanScenes(copy({scenes:show.scenes,activeSceneId:show.activeSceneId}));
 const draft=cleanDraft(copy(show.draft));draft.title=String(title).slice(0,100)||'Untitled show';
 return {id:crypto.randomUUID(),draft,updated:Date.now(),...clean};
}
export function cleanLibrary(raw,legacy=DEFAULT){
 if(!raw){const show=createShow(legacy.title,legacy);return {format:'wordlight-library',version:1,activeShowId:show.id,shows:[show]};}
 if(raw.format!=='wordlight-library'||raw.version!==1||!Array.isArray(raw.shows)||!raw.shows.length)throw new Error('This is not a Wordlight show library.');
 if(raw.shows.length>MAX_SHOWS)throw new Error('A library can hold up to 100 shows.');
 const seen=new Set();
 const shows=raw.shows.map(s=>{if(!s||typeof s.id!=='string'||!s.id||seen.has(s.id))throw new Error('Show IDs must be unique.');seen.add(s.id);return {id:s.id.slice(0,100),draft:cleanDraft(s.draft),updated:Number(s.updated)||0,...cleanScenes(s)};});
 if(new Set(shows.map(s=>s.id)).size!==shows.length)throw new Error('Duplicate show IDs.');
 return {format:'wordlight-library',version:1,savedAt:Number(raw.savedAt)||0,activeShowId:seen.has(raw.activeShowId)?raw.activeShowId:shows[0].id,shows};
}
export function activeShow(library){return library.shows.find(s=>s.id===library.activeShowId)||library.shows[0];}
export function mergeShows(library,raw){
 const imported=raw?.format==='wordlight-library'?cleanLibrary(raw).shows:[createShow((raw.draft||raw).title,raw.draft||raw)];
 if(library.shows.length+imported.length>MAX_SHOWS)throw new Error('Import would exceed the 100-show limit. Export and remove unused shows first.');
 const additions=imported.map(s=>raw?.format==='wordlight-library'?copyShow(s):createShow(s.draft.title,s.draft));
 library.shows.push(...additions);library.activeShowId=additions[0].id;return additions.length;
}
export function groupKey(slide){return slide.song?'song-'+slide.song.entryId:slide.sourceId?'text-'+slide.sourceId:slide.versePoint?slide.id:slide.note?'study-'+slide.note.id:'bible';}
export function slideGroups(draft){
 const groups=new Map();
 for(const slide of makeDeck(draft)){const key=groupKey(slide);if(!groups.has(key))groups.set(key,{id:key,title:slide.song?slide.song.title:slide.sourceId?slide.title:slide.versePoint?slide.reference:slide.note?slide.title:(draft.reference||'Bible / pasted passage'),kind:slide.song?'Song':slide.sourceId?'Text slide':slide.versePoint?'Bible verse':slide.note?'Word study':'Bible passage',slides:[]});groups.get(key).slides.push(slide);}
 return [...groups.values()];
}
export function moveGroups(draft,selected,delta){
 const ids=slideGroups(draft).map(g=>g.id),chosen=new Set(selected);
 if(delta<0){for(let i=1;i<ids.length;i++)if(chosen.has(ids[i])&&!chosen.has(ids[i-1]))[ids[i-1],ids[i]]=[ids[i],ids[i-1]];}
 else {for(let i=ids.length-2;i>=0;i--)if(chosen.has(ids[i])&&!chosen.has(ids[i+1]))[ids[i],ids[i+1]]=[ids[i+1],ids[i]];}
 draft.slideOrder=ids;return ids;
}
export function removeGroups(draft,selected){
 const ids=new Set(selected),removedText=new Set(draft.textSlides.filter(s=>ids.has('text-'+s.id)).map(s=>s.id));
 draft.textSlides=draft.textSlides.filter(s=>!removedText.has(s.id));draft.notes=draft.notes.filter(n=>!removedText.has(n.slideId));
 draft.songs=(draft.songs||[]).filter(s=>!ids.has('song-'+s.entryId));
 draft.excludedSlides=[...new Set([...(draft.excludedSlides||[]),...selected.filter(id=>!id.startsWith('text-')&&!id.startsWith('song-'))])];
 draft.slideOrder=(draft.slideOrder||[]).filter(id=>!ids.has(id));draft.previewId=makeDeck(draft)[0]?.id||'';
}
// Copies are independent. Bible blocks become editable text pages so several passages can coexist.
export function copyGroups(source,target,selected){
 // Songs are copied as whole song entries (an independent snapshot), not converted into text slides.
 const songs=(source.songs||[]).filter(s=>selected.includes('song-'+s.entryId));
 if((target.songs||[]).length+songs.length>60)throw new Error('A show can hold up to 60 songs.');
 const songCopies=songs.map(s=>({entryId:crypto.randomUUID(),song:copy(s.song)}));
 const groups=slideGroups(source).filter(g=>selected.includes(g.id)&&!g.id.startsWith('song-')),existing=slideGroups(target).map(g=>g.id),added=[];
 const count=groups.reduce((n,g)=>n+(g.slides[0].type!=='text'?g.slides.length:1),0);
 if(target.textSlides.length+count>200)throw new Error('A show can hold up to 200 text slides.');
 const additions=[],notes=[];
 for(const g of groups){
  const originals=g.slides[0].type!=='text'?g.slides:[source.textSlides.find(s=>'text-'+s.id===g.id)];
  for(const item of originals){
   const id=crypto.randomUUID();let slide;
   if(g.slides[0].type!=='text'){
    slide=cleanTextSlide({id,layout:item.note?'split':'content',heading:item.note?.word||'',subtitle:item.note?[item.note.original,item.note.transliteration,item.note.strong].filter(Boolean).join(' · '):'',body:item.note?item.text+'\n'+item.note.meaning:item.text,footer:[item.reference,item.translation].filter(Boolean).join(' · '),bodySize:source.fontSize,font:source.font,theme:source.theme,bold:source.bold,italic:source.italic,attribution:source.scriptureAttribution});
    notes.push(...source.notes.filter(n=>!n.slideId).map(n=>({...copy(n),color:source===target?n.color:(n.color||source.accent||THEMES[source.theme].accent),id:crypto.randomUUID(),slideId:id})));
   }else{
    slide=cleanTextSlide({...copy(item),id,theme:source===target?item.theme:(item.theme||source.theme),font:source===target?item.font:(item.font||source.font)});
    notes.push(...source.notes.filter(n=>n.slideId===item.id).map(n=>({...copy(n),color:source===target?n.color:(n.color||source.accent||THEMES[source.theme].accent),id:crypto.randomUUID(),slideId:id})));
   }
   additions.push(slide);added.push('text-'+id);
  }
 }
 if(target.notes.length+notes.length>200)throw new Error('Copy would exceed 200 word styles in the destination show.');
 target.textSlides.push(...additions);target.notes.push(...notes);target.songs=[...(target.songs||[]),...songCopies];added.push(...songCopies.map(s=>'song-'+s.entryId));target.slideOrder=[...existing,...added];return added;
}

// Page-level operations for slides selected in the deck. Each visible slide (one verse, one blank-line
// section of pasted text, one continuation page) is handled on its own. The organizer keeps whole items.
function pagesByItem(draft){const items=new Map();for(const slide of makeDeck(draft)){const key=groupKey(slide);if(!items.has(key))items.set(key,[]);items.get(key).push(slide);}return items;}
export function moveSlides(draft,selected,delta){
 const ids=makeDeck(draft).map(s=>s.id),chosen=new Set(selected);
 if(delta<0){for(let i=1;i<ids.length;i++)if(chosen.has(ids[i])&&!chosen.has(ids[i-1]))[ids[i-1],ids[i]]=[ids[i],ids[i-1]];}
 else {for(let i=ids.length-2;i>=0;i--)if(chosen.has(ids[i])&&!chosen.has(ids[i+1]))[ids[i],ids[i+1]]=[ids[i+1],ids[i]];}
 draft.slideOrder=ids;return ids;
}
export function removeSlides(draft,selected){
 const ids=new Set(selected),whole=[],pages=[];
 for(const [key,list] of pagesByItem(draft)){const picked=list.filter(s=>ids.has(s.id));if(!picked.length)continue;if(picked.length===list.length)whole.push(key);else pages.push(...picked.map(s=>s.id));}
 if(whole.length)removeGroups(draft,whole);
 draft.excludedSlides=[...new Set([...(draft.excludedSlides||[]),...pages])];
 draft.slideOrder=(draft.slideOrder||[]).filter(id=>!ids.has(id));draft.previewId=makeDeck(draft)[0]?.id||'';
}
// Copies each selected visible page as its own text slide, in deck order. Only what is on screen is copied, so
// deleted pages stay deleted and reordered pages keep their order. Blank lines inside a copied page are joined to
// single line breaks, so one copied slide never splits into several.
const onePage=text=>String(text).replace(/\n[^\S\n]*\n\s*/g,'\n');
export function copySlides(source,target,selected){
 const ids=new Set(selected),pages=makeDeck(source).filter(p=>ids.has(p.id));
 if(target.textSlides.length+pages.length>200)throw new Error('A show can hold up to 200 text slides.');
 const order=makeDeck(target).map(s=>s.id),additions=[],notes=[],added=[];
 const tint=n=>source===target?n.color:(n.color||source.accent||THEMES[source.theme].accent);
 for(const p of pages){
  const id=crypto.randomUUID();let slide;
  if(p.type==='text'){
   // A song page has no text slide of its own; its generated format carries the styling.
   const original=source.textSlides.find(t=>t.id===p.sourceId)||p.format||{};
   slide=cleanTextSlide({...copy(original),id,body:onePage(p.text),theme:source===target?original.theme:(original.theme||source.theme),font:source===target?original.font:(original.font||source.font)});
   notes.push(...source.notes.filter(n=>p.sourceId&&n.slideId===p.sourceId).map(n=>({...copy(n),color:tint(n),id:crypto.randomUUID(),slideId:id})));
  }else{
   slide=cleanTextSlide({id,layout:p.note?'split':'content',heading:p.note?.word||'',subtitle:p.note?[p.note.original,p.note.transliteration,p.note.strong].filter(Boolean).join(' · '):'',body:onePage(p.note?p.text+'\n'+p.note.meaning:p.text),footer:[p.reference,p.translation].filter(Boolean).join(' · '),bodySize:source.fontSize,font:source.font,theme:source.theme,bold:source.bold,italic:source.italic,attribution:source.scriptureAttribution,fit:source.fit,fitPadding:source.fitPadding});
   notes.push(...source.notes.filter(n=>!n.slideId).map(n=>({...copy(n),color:tint(n),id:crypto.randomUUID(),slideId:id})));
  }
  additions.push(slide);added.push('text-'+id);
 }
 if(target.notes.length+notes.length>200)throw new Error('Copy would exceed 200 word styles in the destination show.');
 target.textSlides.push(...additions);target.notes.push(...notes);
 const after=source===target?Math.max(...order.map((id,i)=>ids.has(id)?i:-1)):-1;
 if(after>=0)order.splice(after+1,0,...added);else order.push(...added);
 target.slideOrder=order;return added;
}

export function applyBiblePassage(draft,data,translation){
 // Words belong to the show. Changing the passage never edits the chosen words or their styles.
 // NKJV carries the provider's copyright line and where and when it was fetched.
 // AO catalogue versions carry their licence line and a short label; the key ("ao:BSB") never appears on screen.
 const ao=translation.startsWith('ao:');
 draft.scriptureAttribution=translation==='oycb'?YORUBA_CREDIT:translation==='nkjv'?(data.copyright||NKJV_CREDIT):ao?String(data.attribution||'').slice(0,1000):'';
 draft.scriptureSource=(translation==='nkjv'||ao)&&data.source?{...data.source}:null;draft.includePassage=true;draft.reference=data.reference;draft.passage=data.text.trim();draft.translation=ao?String(data.label||translation.slice(3)).slice(0,30):translation.toUpperCase();
 draft.excludedSlides=[];draft.bibleVerses=cleanBibleVerses(data.verses);draft.verseRange=rangeFromResponse(data,translation);
 draft.previewId=draft.bibleVerses.length?'passage-'+draft.bibleVerses[0].bookId+'-'+draft.bibleVerses[0].chapter+'-'+draft.bibleVerses[0].verse:'passage-0';
}

export const NKJV_CREDIT='Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.';
export function applyPastedNKJV(draft,text,reference){
 if(typeof text!=='string'||!text.trim())throw new Error('Paste the NKJV text you want to use first.');
 if(typeof reference!=='string'||!reference.trim())throw new Error('Enter the passage reference first.');
 if(text.length>500000||reference.length>100)throw new Error('The pasted passage or reference is too long.');
 // The same reference rules as lookups, so "Luke10;19" is shown as "Luke 10:19". Invalid references are rejected.
 applyBiblePassage(draft,{reference:parseReference(reference).reference,text,verses:[]},'nkjv');
 draft.scriptureAttribution=NKJV_CREDIT;
}

// ---- Service items ----
// Items are the show's scenes, shown as an ordered rundown. Each holds its own slides; ids are unchanged, so live
// snapshots, the phone remote and the web bridge keep working.
function checkShowSize(show,extra=null){
 // UTF-8 bytes, as saved (Yoruba marks take more than one byte).
 const utf8=v=>new TextEncoder().encode(JSON.stringify(v)).length,bytes=utf8(show)+(extra?utf8(extra):0);
 if(bytes>MAX_SHOW_BYTES)throw new Error('This show is too large for another item ('+Math.round(bytes/1e6)+' MB). Start a new show for more.');
}
const kindOf=slide=>slide.song?'Song':slide.sourceId?'Presentation':'Scripture';
// What an item holds: Song, Scripture, Presentation, Mixed (older items with several kinds or several songs) or Empty.
// The deck can be passed in (the studio's cached one) so a rundown does not rebuild every item's slides.
export function itemSummary(draft,deck=makeDeck(draft)){
 const kinds=new Set(deck.map(kindOf)),songs=new Set(deck.filter(s=>s.song).map(s=>s.song.entryId));
 return {kind:kinds.size>1||songs.size>1?'Mixed':kinds.size?[...kinds][0]:'Empty',count:deck.length};
}
export function itemKind(draft,deck){return itemSummary(draft,deck).kind;}
export function itemSlideCount(draft,deck){return itemSummary(draft,deck).count;}
// Nothing in it at all, hidden content included, so it can be reused for the next song or passage. Word styles
// without an explanation are not content.
const study=n=>[n.meaning,n.original,n.transliteration,n.strong].some(v=>typeof v==='string'&&v.trim());
export function isEmptyDraft(d){
 return !(d.songs||[]).length&&!(d.textSlides||[]).length&&!(d.bibleVerses||[]).length&&!String(d.passage||'').trim()&&!(d.notes||[]).some(study);
}
// New items inherit all of these. Apply design to all items leaves out the version and the passage layout and words
// per slide, which would repaginate other readings and change their slide ids (and so their exclusions).
const DESIGN_FIELDS=['theme','font','fontSize','bold','italic','brand','accent','backgroundAssetId','backgroundDim','fit','fitPadding','wordsPerSlide','passageLayout','translation'];
const APPLY_FIELDS=['theme','font','fontSize','bold','italic','brand','accent','backgroundAssetId','backgroundDim','fit','fitPadding'];
// Word highlight styles that are not tied to one slide: the word and how it looks, without its explanation (an
// explanation would add a study slide to every item).
const wordStyles=notes=>(notes||[]).filter(n=>!n.slideId).map(n=>({id:crypto.randomUUID(),word:n.word,color:n.color,emphasis:n.emphasis,bold:n.bold,italic:n.italic}));
// A new item: the current item's design and word styles, no content.
export function newItemDraft(show){
 const d=emptyDraft(show.draft.title);
 for(const key of DESIGN_FIELDS)d[key]=copy(show.draft[key]);
 d.notes=wordStyles(show.draft.notes);
 return cleanDraft(d);
}
// Adds an item after the current one and selects it. The screen is not changed.
export function addItem(show,name,draft=newItemDraft(show)){
 const scene=addScene(show,name,draft);switchScene(show,scene.id);return scene;
}
export function moveScene(show,id,delta){
 const i=show.scenes.findIndex(s=>s.id===id),j=i+delta;
 if(i<0||j<0||j>=show.scenes.length)return false;
 const [scene]=show.scenes.splice(i,1);show.scenes.splice(j,0,scene);show.updated=Date.now();return true;
}
// Every item's draft by item id, the current one included, for actions that touch all items. Undo is keyed by id,
// so reordering items in between cannot put values on the wrong item.
const allDrafts=show=>show.scenes.map(s=>[s.id,s.id===show.activeSceneId?show.draft:s.draft]);
// Background images used by any item of these shows, for image clean-up guards and exports.
export function backgroundAssetIds(library){
 const ids=new Set();
 for(const show of library?.shows||[])for(const [,d] of allDrafts(show))if(d?.backgroundAssetId)ids.add(d.backgroundAssetId);
 return ids;
}
// Design of the current item onto all items. Returns what Undo needs.
export function applyDesignToAll(show){
 const fields=APPLY_FIELDS;
 const before=Object.fromEntries(allDrafts(show).map(([id,d])=>[id,Object.fromEntries(fields.map(k=>[k,copy(d[k])]))]));
 for(const [,d] of allDrafts(show))for(const key of fields)d[key]=copy(show.draft[key]);
 show.updated=Date.now();return before;
}
export function undoDesignToAll(show,before){for(const [id,d] of allDrafts(show))if(before[id])Object.assign(d,copy(before[id]));show.updated=Date.now();}
// The current item's word styles in every item: matching words take the style, others are added. Explanations and
// slide-specific words are left as they are. Returns what Undo needs.
export function wordsToAll(show){
 const before=Object.fromEntries(allDrafts(show).map(([id,d])=>[id,copy(d.notes)]));
 const styles=wordStyles(show.draft.notes),same=(a,b)=>a.toLocaleLowerCase()===b.toLocaleLowerCase();
 for(const [,d] of allDrafts(show)){
  if(d===show.draft)continue;
  for(const style of styles){
   const match=d.notes.find(n=>!n.slideId&&same(n.word,style.word));
   if(match)Object.assign(match,{color:style.color,emphasis:style.emphasis,bold:style.bold,italic:style.italic});
   else if(d.notes.length<200)d.notes.push({...style,id:crypto.randomUUID()});
  }
 }
 show.updated=Date.now();return before;
}
export function undoWordsToAll(show,before){for(const [id,d] of allDrafts(show))if(before[id])d.notes=copy(before[id]);show.updated=Date.now();}

// ---- Split an older mixed item ----
// Each song becomes its own item, the passage with its word studies one Scripture item, and each run of text slides
// one Presentation item. Content is moved, never converted, so slide ids, page exclusions, arrangements, edits and
// notes are kept. If the pieces are interleaved, splitting would change the order, so it is refused.
function pieceKey(slide){return slide.song?'song:'+slide.song.entryId:slide.sourceId?'text':'scripture';}
export function planSplit(draft,liveSlideId=''){
 const deck=makeDeck(draft),pieces=[];
 for(const slide of deck){
  const key=pieceKey(slide),last=pieces.at(-1);
  if(last&&last.key===key){last.slides.push(slide);continue;}
  // A song or the passage that appears again after something else would have to move.
  if(key!=='text'&&pieces.some(p=>p.key===key))return {error:'This item mixes songs, Bible and text slides in an order that splitting would change. Reorder its slides first, or keep it as one item.'};
  pieces.push({key,slides:[slide]});
 }
 // A text slide whose pages fall in two runs would be split apart.
 const sourcesSeen=new Map();
 for(const [i,p] of pieces.entries())if(p.key==='text')for(const slide of p.slides){if(sourcesSeen.has(slide.sourceId)&&sourcesSeen.get(slide.sourceId)!==i)return {error:'A text slide in this item is split around other slides. Reorder its slides first, or keep it as one item.'};sourcesSeen.set(slide.sourceId,i);}
 if(pieces.length<2)return {error:'This item holds one kind of content already, so there is nothing to split.'};
 const anchor=Math.max(0,pieces.findIndex(p=>p.slides.some(s=>s.id===liveSlideId)));
 return {anchor,pieces:pieces.map(p=>({key:p.key,kind:p.key==='text'?'Presentation':p.key==='scripture'?'Scripture':'Song',
  name:p.key==='scripture'?(draft.reference||'Scripture'):p.key==='text'?(p.slides[0].title||'Presentation'):p.slides[0].song.title,
  count:p.slides.length,ids:p.slides.map(s=>s.id),sources:[...new Set(p.slides.map(s=>s.sourceId).filter(Boolean))]}))};
}
// Which order and exclusion entries belong to a piece: its song entries, its text slides, and the passage (verses,
// whole-passage pages and word studies) if it holds the passage. Entries are page ids or whole-item keys.
function ownsEntry(d,id){
 if((d.songs||[]).some(e=>id==='song-'+e.entryId||id.startsWith('song-'+e.entryId+'-')))return true;
 if((d.textSlides||[]).some(t=>id==='text-'+t.id||id.startsWith('text-'+t.id+'-page-')))return true;
 return hasPassage(d)&&(id==='bible'||id.startsWith('passage-')||id.startsWith('study-'));
}
// Older items may hold word studies with no passage text; those still own the passage entries.
const hasPassage=d=>!!((d.bibleVerses||[]).length||String(d.passage||'').trim()||(d.notes||[]).some(n=>!n.slideId&&study(n)));
// A piece's draft. The anchor piece also keeps what is not on any slide (hidden songs, text slides or passage, and
// slide-specific words whose slide no longer exists), so splitting never drops content.
function pieceDraft(draft,piece,anchor,visible){
 const d=copy(draft);
 d.songs=(draft.songs||[]).filter(e=>piece.key==='song:'+e.entryId||(anchor&&!visible.songs.has(e.entryId))).map(copy);
 d.textSlides=(draft.textSlides||[]).filter(t=>piece.sources.includes(t.id)||(anchor&&!visible.texts.has(t.id))).map(copy);
 const texts=new Set(d.textSlides.map(t=>t.id)),allTexts=new Set((draft.textSlides||[]).map(t=>t.id));
 const keepsPassage=piece.key==='scripture'||(anchor&&!visible.scripture);
 d.notes=(draft.notes||[]).filter(n=>!n.slideId||texts.has(n.slideId)||(anchor&&!allTexts.has(n.slideId))).map(copy);
 if(!keepsPassage){
  Object.assign(d,{includePassage:false,passage:'',reference:'',bibleVerses:[],verseRange:null,scriptureAttribution:'',scriptureSource:null,bibleHistory:[]});
  // Word studies stay with the passage; other pieces keep only the word styles.
  d.notes=d.notes.map(n=>n.slideId?n:{id:n.id,word:n.word,color:n.color,emphasis:n.emphasis,bold:n.bold,italic:n.italic});
 }
 d.slideOrder=(draft.slideOrder||[]).filter(id=>ownsEntry(d,id));
 d.excludedSlides=(draft.excludedSlides||[]).filter(id=>ownsEntry(d,id));
 d.previewId=piece.ids[0];
 return cleanDraft(d);
}
// What an item's content is, ignoring which slide is selected; used to tell whether Undo split is still safe.
const contentOf=d=>JSON.stringify({...d,previewId:'',selectedNoteId:''});
// Splits the current item. The piece holding the live slide keeps the item's id (so LIVE stays correct), otherwise the
// first piece does; the piece holding the slide being prepared becomes the current item. Everything is built and
// size-checked before the show changes. The live snapshot itself is never changed. Returns what Undo needs.
export function splitItem(show,liveSlideId=''){
 const deck=makeDeck(show.draft),plan=planSplit(show.draft,liveSlideId);if(plan.error)throw new Error(plan.error);
 if(show.scenes.length-1+plan.pieces.length>MAX_SCENES)throw new Error('Splitting would make more than '+MAX_SCENES+' items.');
 const visible={songs:new Set(deck.filter(s=>s.song).map(s=>s.song.entryId)),texts:new Set(deck.map(s=>s.sourceId).filter(Boolean)),scripture:deck.some(s=>pieceKey(s)==='scripture')};
 const original=activeScene(show),index=show.scenes.indexOf(original);
 const scenes=plan.pieces.map((piece,i)=>{
  const draft=pieceDraft(show.draft,piece,i===plan.anchor,visible);draft.title=show.draft.title;
  return {id:i===plan.anchor?original.id:crypto.randomUUID(),name:piece.name.slice(0,80),draft};
 });
 const previewId=show.draft.previewId,chosen=Math.max(0,plan.pieces.findIndex(p=>p.ids.includes(previewId))),current=scenes[chosen];
 if(plan.pieces[chosen].ids.includes(previewId))current.draft.previewId=previewId;
 // The finished show, exactly as it will be saved, must fit the size limit before anything changes.
 const entries=scenes.map(s=>s===current?{id:s.id,name:s.name}:s),result=[...show.scenes];result.splice(index,1,...entries);
 checkShowSize({...show,draft:current.draft,scenes:result});
 const undo={scene:{id:original.id,name:original.name},draft:copy(show.draft),index,pieceIds:scenes.map(s=>s.id),contents:Object.fromEntries(scenes.map(s=>[s.id,s.name+'\n'+contentOf(s.draft)]))};
 show.scenes=result;
 show.draft=current.draft;show.activeSceneId=current.id;show.updated=Date.now();
 return undo;
}
// Undo split puts the original item back, but only while the pieces still hold what the split made: an edit since
// would otherwise be lost (renaming counts). Choosing or reordering items does not.
export function undoSplit(show,undo){
 const draftOf=id=>id===show.activeSceneId?show.draft:show.scenes.find(s=>s.id===id)?.draft;
 const nameOf=id=>show.scenes.find(s=>s.id===id)?.name;
 if(!undo.pieceIds.every(id=>show.scenes.some(s=>s.id===id)&&nameOf(id)+'\n'+contentOf(draftOf(id))===undo.contents[id]))
  throw new Error('The split items have been changed since, so Undo split would lose those changes. Nothing was undone.');
 // The original returns where the first piece is; it is the current item if one of the pieces was current.
 const wasActive=undo.pieceIds.includes(show.activeSceneId);
 const index=show.scenes.findIndex(s=>undo.pieceIds.includes(s.id));
 show.scenes=show.scenes.filter(s=>!undo.pieceIds.includes(s.id));
 if(wasActive){show.scenes.splice(index,0,{id:undo.scene.id,name:undo.scene.name});show.draft=copy(undo.draft);show.activeSceneId=undo.scene.id;}
 else show.scenes.splice(index,0,{id:undo.scene.id,name:undo.scene.name,draft:copy(undo.draft)});
 show.updated=Date.now();
}
// Puts new content (a song, a passage, text slides) in its own item. The complete draft is built and checked first,
// size included; only then is an empty current item reused or a new item added and selected. If anything fails,
// the show is unchanged. Returns the draft now in use.
const autoItemName=name=>/^(Scene|Item) \d+$/.test(name);
export function addContent(show,name,fill,{reuseEmpty=true}={}){
 const reuse=reuseEmpty&&isEmptyDraft(show.draft),candidate=reuse?copy(show.draft):newItemDraft(show);
 fill(candidate);
 const draft=cleanDraft(candidate);draft.title=show.draft.title;
 if(reuse){
  checkShowSize({...show,draft});
  show.draft=draft;const scene=activeScene(show);if(autoItemName(scene.name))renameScene(show,scene.id,name);show.updated=Date.now();
 }else addItem(show,name,draft);
 return show.draft;
}
