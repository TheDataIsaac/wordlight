import {cleanVerseRange,cleanBibleVerses,cleanScriptureSource} from './scripture.mjs';
import {cleanSong,songSlides,songCredit,songTextLength,expandedSize,SONG_LIMITS} from './songs.mjs';
export const FONTS={serif:{name:'Georgia',css:"Georgia,serif"},sans:{name:'Segoe UI',css:"'Segoe UI',sans-serif"},arial:{name:'Arial',css:"Arial,sans-serif"},verdana:{name:'Verdana',css:"Verdana,sans-serif"},trebuchet:{name:'Trebuchet MS',css:"'Trebuchet MS',sans-serif"},times:{name:'Times New Roman',css:"'Times New Roman',serif"},palatino:{name:'Palatino',css:"'Palatino Linotype',Palatino,serif"},mono:{name:'Courier New',css:"'Courier New',monospace"}};
export const THEMES = {
 midnight:{name:'Midnight',bg:'#141e29',fg:'#f4eedf',accent:'#e6c68a',glow:'#4e596c66',line:'#e5d4ab33',line2:'#e5d4ab08',line3:'#e5d4ab04'},
 forest:{name:'Olive grove',bg:'#163b31',fg:'#f2efdf',accent:'#d8c98b',glow:'#7a906a55',line:'#d6deaa33',line2:'#d6deaa08',line3:'#d6deaa04'},
 parchment:{name:'Parchment',bg:'#eee4cd',fg:'#423c30',accent:'#8b5b31',glow:'#c3a26844',line:'#67472833',line2:'#67472808',line3:'#67472804'},
 plum:{name:'Evening',bg:'#2a2033',fg:'#f2e9de',accent:'#e6b8aa',glow:'#936e8655',line:'#e2b8aa33',line2:'#e2b8aa08',line3:'#e2b8aa04'}
};
export const DEFAULT = {
 schema:1,title:'New show',reference:'John 1:1',translation:'KJV',
 passage:'In the beginning was the Word, and the Word was with God, and the Word was God.',
 notes:[{id:'example-word',word:'Word',original:'λόγος',transliteration:'logos',strong:'G3056',meaning:'Word, speech, or message.\nRead John 1:14 alongside this verse.',source:'https://biblehub.com/greek/3056.htm'}],
 theme:'midnight',font:'serif',fontSize:96,bold:true,wordsPerSlide:45,brand:'',accent:'',previewId:'passage-0',selectedNoteId:'example-word'
};
const str=(v,max=2000)=>typeof v==='string'?v.slice(0,max):'';
export function cleanDraft(v){
 if(!v || v.schema!==1 || typeof v.passage!=='string') throw new Error('This is not a Wordlight session file.');
 const d={...DEFAULT,...v};
 delete d.library;delete d.shows;d.verseRange=cleanVerseRange(v.verseRange);d.bibleVerses=cleanBibleVerses(v.bibleVerses);d.passageLayout=v.passageLayout==='flow'?'flow':'verses';d.excludedSlides=(Array.isArray(v.excludedSlides)?v.excludedSlides:[]).filter(x=>typeof x==='string').slice(0,25000);
 d.scriptureAttribution=str(v.scriptureAttribution,1000);d.scriptureSource=cleanScriptureSource(v.scriptureSource);
 d.title=str(v.title,100)||'Bible study'; d.reference=str(v.reference,100);
 d.translation=str(v.translation,30); d.passage=str(v.passage,500000);
 d.theme=THEMES[v.theme]?v.theme:'midnight';d.font=FONTS[v.font]?v.font:'serif';d.bold=!!v.bold;d.italic=!!v.italic;
 d.fontSize=Math.max(52,Math.min(112,Number(v.fontSize)||88));d.wordsPerSlide=Math.max(20,Math.min(80,Number(v.wordsPerSlide)||45));
 d.brand=str(v.brand,80);d.accent=/^#[a-f0-9]{6}$/i.test(v.accent)?v.accent:'';
 // Background image: an id in the companion's image store (never the image itself) and how much the theme color fades it.
 const dim=Number(v.backgroundDim);d.backgroundAssetId=assetId(v.backgroundAssetId);d.backgroundDim=v.backgroundDim!=null&&Number.isFinite(dim)?Math.max(0,Math.min(80,Math.round(dim))):45;
 d.notes=(Array.isArray(v.notes)?v.notes:[]).slice(0,200).map((n,i)=>({
 id:str(n.id,100)||'word-'+i,word:str(n.word,200),original:str(n.original,200),transliteration:str(n.transliteration,200),
 strong:str(n.strong,20),meaning:str(n.meaning,30000),source:str(n.source,1000),color:safeColor(n.color),emphasis:safeEmphasis(n.emphasis),slideId:str(n.slideId,100),bold:!!n.bold,italic:!!n.italic
 })).filter(n=>n.word);
 d.textSlides=(Array.isArray(v.textSlides)?v.textSlides:[]).slice(0,200).map(cleanTextSlide);d.slideOrder=(Array.isArray(v.slideOrder)?v.slideOrder:[]).filter(x=>typeof x==='string').slice(0,25000);d.bibleHistory=(Array.isArray(v.bibleHistory)?v.bibleHistory:[]).slice(-50).map(h=>{
 const saved=cleanDraft({schema:1,passage:str(h?.passage,500000),reference:h?.reference,translation:h?.translation,notes:Array.isArray(h?.notes)?h.notes.filter(n=>!n.slideId):[]});
 return {reference:saved.reference,translation:saved.translation,passage:saved.passage,notes:saved.notes};
});
 // Songs are snapshots copied into the show, so the show runs offline and never changes when the song library does.
 // A damaged song is an error for the whole show, so storage recovery can step in; it is never dropped silently.
 const songs=Array.isArray(v.songs)?v.songs:[];if(songs.length>SONG_LIMITS.songsPerShow)throw new Error('A show can hold up to '+SONG_LIMITS.songsPerShow+' songs.');
 const entryIds=new Set();
 d.songs=songs.map((entry,i)=>{const entryId=str(entry?.entryId,100)||'song-entry-'+i;if(entryIds.has(entryId))throw new Error('Song entries in a show must be unique.');entryIds.add(entryId);try{return {entryId,song:cleanSong(entry?.song)};}catch(err){throw new Error('A song in this show could not be read: '+err.message);}});
 const expanded=d.songs.reduce((n,s)=>{const x=expandedSize(s.song);return {slides:n.slides+x.slides,chars:n.chars+x.chars};},{slides:0,chars:0});
 if(expanded.slides>SONG_LIMITS.expandedSlidesPerShow)throw new Error('The songs in this show expand to '+expanded.slides+' slides; a show supports up to '+SONG_LIMITS.expandedSlidesPerShow+'. Put some songs in another scene.');
 if(expanded.chars>SONG_LIMITS.expandedTextPerShow)throw new Error('The songs in this show expand to '+expanded.chars+' characters; a show supports up to '+SONG_LIMITS.expandedTextPerShow+'. Put some songs in another scene.');
 const songText=d.songs.reduce((n,s)=>n+songTextLength(s.song),0);if(songText>SONG_LIMITS.textPerShow)throw new Error('The songs in this show have '+songText+' characters of lyrics; a show supports up to '+SONG_LIMITS.textPerShow+'.');
 d.fit=v.fit===true;d.fitPadding=fitPadding(v.fitPadding);
 d.includePassage=v.includePassage!==false;d.previewId=str(v.previewId,120);d.selectedNoteId=str(v.selectedNoteId,100);return d;
}
export const assetId=v=>typeof v==='string'&&/^[a-f0-9]{16}$/.test(v)?v:'';
export function paginate(text,words=45,chars=630){
 const tokens=text.match(/\S+\s*|\s+/gu)||[];const pages=[];let page='',count=0;
 for(let token of tokens){
  while(token.length>chars){if(page.trim()){pages.push(page.trim());page='';count=0;} pages.push(token.slice(0,chars));token=token.slice(chars);}
  if((count>=words||page.length+token.length>chars)&&page.trim()){pages.push(page.trim());page='';count=0;}
  page+=token;if(token.trim())count++;
 }
 if(page.trim())pages.push(page.trim());return pages;
}
// Blank lines (empty or whitespace-only, LF or CRLF) mark explicit slide breaks in typed or pasted text.
// A single line break stays on the same slide, and each section still splits by length to fit.
export function paginateSections(text,words=45,chars=630){
 return String(text).replace(/\r\n?/g,'\n').split(/\n[^\S\n]*\n\s*/).flatMap(section=>paginate(section,words,chars));
}
export function matchRegex(word){
 const escaped=word.replace(/[$.*+?^{}()|[\]\\]/g,'\\$&');
 return new RegExp('(^|[^\\p{L}\\p{N}\\p{M}])('+escaped+')(?=$|[^\\p{L}\\p{N}\\p{M}])','giu');
}
export function occurrences(text,word){if(!word.trim())return 0;return [...text.matchAll(matchRegex(word.trim()))].length;}
export function makeDeck(d){
 const excluded=new Set(d.excludedSlides||[]);
 const verses=d.includePassage===false?[]:cleanBibleVerses(d.bibleVerses).filter(v=>!excluded.has('passage-'+v.bookId+'-'+v.chapter+'-'+v.verse));
 const passage=(d.bibleVerses||[]).length?verses.map(v=>v.text).join('\n'):d.passage;
 const pages=d.includePassage===false?[]:(d.bibleVerses||[]).length?paginate(passage,d.wordsPerSlide):paginateSections(passage,d.wordsPerSlide);
 const slides=verses.length&&d.passageLayout!=='flow'?verses.map((v,i)=>({id:'passage-'+v.bookId+'-'+v.chapter+'-'+v.verse,type:'passage',text:v.text,reference:v.reference,translation:d.translation,versePoint:{bookId:v.bookId,chapter:v.chapter,verse:v.verse},page:i+1,pages:verses.length,title:v.reference})):pages.map((text,i)=>({id:'passage-'+i,type:'passage',text,reference:d.reference,translation:d.translation,page:i+1,pages:pages.length,title:pages.length>1?'Passage '+(i+1):'Passage'}));
 for(const n of d.includePassage===false?[]:d.notes){
  if(n.slideId)continue;
  if(![n.meaning,n.original,n.transliteration,n.strong].some(v=>typeof v==='string'&&v.trim()))continue;
  const verseContext=verses.find(v=>occurrences(v.text,n.word));
  const contexts=paginate(verseContext?.text||d.passage,30,400);
  const context=contexts.find(t=>occurrences(t,n.word))||contexts[0]||'';
  const meaningPages=paginate(n.meaning,45,420);if(!meaningPages.length)meaningPages.push('');
  meaningPages.forEach((meaning,i)=>slides.push({
   id:'study-'+n.id+'-'+i,type:'study',text:context,reference:verseContext?.reference||d.reference,translation:d.translation,
   note:{...n,meaning},page:i+1,pages:meaningPages.length,title:n.word+(meaningPages.length>1?' '+(i+1):'')
  }));
 }
 for(const raw of d.textSlides||[]){const s=cleanTextSlide(raw);const chunks=paginateSections(s.body,120,1000);if(!chunks.length)chunks.push('');chunks.forEach((text,i)=>slides.push({id:'text-'+s.id+(i?'-page-'+i:''),sourceId:s.id,type:'text',text,title:s.heading||s.footer||'Untitled slide',heading:s.heading,subtitle:s.subtitle,reference:s.footer,translation:'',format:{...s},page:i+1,pages:chunks.length}));}
 // Song slides are text slides that follow the show's Design, fitted to the screen, with the song credit.
 for(const {entryId,song} of d.songs||[]){
  const credit=songCredit(song);
  for(const page of songSlides(song,entryId)){
   const footer=song.title+' · '+page.section+(page.pages>1?' ('+(page.page+1)+'/'+page.pages+')':'');
   slides.push({id:'song-'+entryId+'-'+page.position+'-'+page.page,type:'text',song:{entryId,title:song.title,section:page.section,kind:page.kind,number:page.number,position:page.position},text:page.text,title:song.title+' · '+page.section,heading:'',subtitle:'',reference:footer,translation:'',
    format:cleanTextSlide({id:'song-'+entryId,layout:'content',align:'center',body:'',footer,attribution:credit,bodySize:64,fit:true,fitPadding:d.fitPadding,bold:d.bold,italic:d.italic}),page:page.page+1,pages:page.pages});
  }
 }
 const ranks=new Map((d.slideOrder||[]).map((id,i)=>[id,i]));const key=s=>s.song?'song-'+s.song.entryId:s.sourceId?'text-'+s.sourceId:s.versePoint?s.id:s.note?'study-'+s.note.id:'bible';
 const visible=slides.filter(s=>!excluded.has(s.id)&&!excluded.has(key(s)));
 // A page can have its own position (moved in the deck) or follow its item (moved in the organizer).
 // A page with neither, such as a new continuation page, goes right after the last placed page of its item.
 const placed=s=>ranks.get(s.id)??ranks.get(key(s)),last=new Map();
 for(const s of visible){const r=placed(s);if(r!==undefined&&!(last.get(key(s))>=r))last.set(key(s),r);}
 const rank=s=>placed(s)??(last.has(key(s))?last.get(key(s))+.5:1e9);
 return visible.sort((a,b)=>rank(a)-rank(b));
}
// The studio asks for the deck many times per keystroke. Drafts are edited in place, so the cache
// is keyed on the deck's inputs, not on object identity. Callers must treat the result as read-only;
// snapshot() keeps calling makeDeck so live decks never share objects with the cache.
const deckCache=new WeakMap(),songIds=new WeakMap();let nextSongId=0;
const songIdentity=song=>{if(!songIds.has(song))songIds.set(song,++nextSongId);return songIds.get(song);};
export function deckFor(d){
 // Song snapshots are never edited in place except for the chosen arrangement, so they are keyed by identity
 // (plus arrangement) instead of stringifying every song's lyrics on each call.
 const songKey=(d.songs||[]).map(s=>[s.entryId,s.song.arrangementId,songIdentity(s.song)]);
 const key=JSON.stringify([d.includePassage,d.passageLayout,d.wordsPerSlide,d.translation,d.reference,d.passage,d.bibleVerses,d.excludedSlides,d.notes,d.textSlides,d.slideOrder,songKey,d.fitPadding,d.bold,d.italic]);
 const hit=deckCache.get(d);if(hit&&hit.key===key)return hit.deck;
 const deck=makeDeck(d);deckCache.set(d,{key,deck});return deck;
}
export function snapshot(d,id=d.previewId){
 const slides=makeDeck(d);const index=Math.max(0,slides.findIndex(s=>s.id===id));
 return {schema:1,slides,index,blank:false,style:{scriptureAttribution:d.scriptureAttribution,fit:!!d.fit,fitPadding:fitPadding(d.fitPadding),theme:d.theme,font:d.font,fontSize:d.fontSize,brand:d.brand,accent:d.accent,backgroundAssetId:assetId(d.backgroundAssetId),backgroundDim:d.backgroundDim??45,bold:!!d.bold,italic:!!d.italic,highlightWords:d.notes.map(n=>n.word),highlights:getHighlights(d)},updated:Date.now()};
}
export function validLive(v){
 return !!v&&v.schema===1&&Array.isArray(v.slides)&&v.slides.length<=25000&&
 Number.isInteger(v.index)&&v.index>=0&&(v.slides.length===0||v.index<v.slides.length)&&
 v.slides.every(s=>s&&typeof s.text==='string'&&['passage','study','text'].includes(s.type)&&
 (s.type!=='study'||s.note&&typeof s.note.word==='string'))&&v.style&&!!THEMES[v.style.theme];
}

export function safeColor(value){
 return typeof value==='string'&&/^#[a-f0-9]{6}$/i.test(value)?value.toLowerCase():'';
}
export function highlightPalette(d){
 const light=d.theme==='parchment';
 const colors=light?['#8b5b31','#1e6594','#9e3d64','#36754a','#6a4c9c','#a45622']:['#e6c68a','#8fcde8','#eea0b7','#9cd2a5','#c1a8ef','#f3b484'];
 return colors.map((color,i)=>({color,name:['Gold','Blue','Pink','Green','Purple','Orange'][i]}));
}
export function getHighlights(d){
 const fallback=safeColor(d.accent)||(THEMES[d.theme]||THEMES.midnight).accent;
 return (d.notes||[]).filter(n=>typeof n.word==='string'&&n.word.trim()).map(n=>({word:n.word.trim(),color:safeColor(n.color)||fallback,emphasis:safeEmphasis(n.emphasis),slideId:str(n.slideId,100),bold:!!n.bold,italic:!!n.italic}));
}
export function nextHighlightColor(d){
 const used=new Set(getHighlights(d).map(h=>h.color));
 const palette=highlightPalette(d);
 return palette.find(h=>!used.has(h.color))?.color||palette[d.notes.length%palette.length].color;
}
export function highlightSegments(text,entries,fallback='#e6c68a'){
 const defaultColor=safeColor(fallback)||'#e6c68a';
 const highlights=(Array.isArray(entries)?entries:[]).map(h=>typeof h==='string'?{word:h,color:defaultColor}:h)
 .filter(h=>h&&typeof h.word==='string'&&h.word.trim())
 .map(h=>({word:h.word.trim(),color:safeColor(h.color)||defaultColor,emphasis:safeEmphasis(h.emphasis),bold:!!h.bold,italic:!!h.italic})).sort((a,b)=>b.word.length-a.word.length);
 let spans=[{text,color:''}];
 for(const h of highlights){
  const next=[];
  const pattern=matchRegex(h.word);
  for(const s of spans){
   if(s.color){next.push(s);continue;}
   let cursor=0;
   for(const m of s.text.matchAll(pattern)){
    const start=m.index+m[1].length;
    if(start>cursor)next.push({text:s.text.slice(cursor,start),color:''});
    next.push({text:m[2],color:h.color,emphasis:h.emphasis,bold:h.bold,italic:h.italic});cursor=start+m[2].length;
   }
   if(cursor<s.text.length)next.push({text:s.text.slice(cursor),color:''});
  }
  spans=next;
 }
 return spans;
}

export function safeEmphasis(v){return ['highlight','underline','text','outline','none'].includes(v)?v:'highlight';}
export function contrastInk(color){const hex=safeColor(color)||'#e6c68a';const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);const l=.2126*c[0]+.7152*c[1]+.0722*c[2];return (l+.05)/.05>=1.05/(l+.05)?'#000000':'#ffffff';}
const numberIn=(v,min,max,fallback)=>Math.max(min,Math.min(max,Number(v)||fallback));
export function cleanTextSlide(s={},i=0){return {id:str(s.id,100)||'slide-'+i,heading:str(s.heading,400),subtitle:str(s.subtitle,600),body:str(s.body,30000),footer:str(s.footer,150),attribution:str(s.attribution,1000),layout:['title','content','quote','split'].includes(s.layout)?s.layout:'content',align:['left','center','right'].includes(s.align)?s.align:'left',headingSize:numberIn(s.headingSize,36,160,96),subtitleSize:numberIn(s.subtitleSize,24,90,42),bodySize:numberIn(s.bodySize,28,112,56),bold:!!s.bold,italic:!!s.italic,bullets:!!s.bullets,headingColor:safeColor(s.headingColor),bodyColor:safeColor(s.bodyColor),background:safeColor(s.background),theme:THEMES[s.theme]?s.theme:'',font:FONTS[s.font]?s.font:'',headingFont:FONTS[s.headingFont]?s.headingFont:'',subtitleFont:FONTS[s.subtitleFont]?s.subtitleFont:'',headingBold:s.headingBold!==false,headingItalic:!!s.headingItalic,subtitleBold:!!s.subtitleBold,subtitleItalic:!!s.subtitleItalic,fit:s.fit===true,fitPadding:fitPadding(s.fitPadding)};}
// Inset in canvas pixels kept clear around fitted text. Saved designs without it use the default.
export const FIT_PADDING={min:0,max:240,default:64};
export function fitPadding(v){return v===''||v==null||!Number.isFinite(Number(v))?FIT_PADDING.default:Math.round(Math.max(FIT_PADDING.min,Math.min(FIT_PADDING.max,Number(v))));}
