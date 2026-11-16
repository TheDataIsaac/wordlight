// Songs from other programs, so a church can bring the songs it already has:
//   CCLI SongSelect, both the .usr file and the lyrics .txt download
//   OpenLyrics .xml, which OpenLP and several other programs export
//   ChordPro (.cho, .chordpro, .chopro, .pro), with the chords taken out
//   plain text, where a blank line starts a new slide and [Verse 1] lines name sections
//   EasyWorship 6 and 7 (its Songs.db and SongWords.db, read by the companion; the words are RTF)
// Each becomes Wordlight's own lyric text and goes through the song editor (editSong), so an imported song follows the
// same rules as one typed in. Nothing here touches the network or the disk.
import {newSong,editSong} from './songs.mjs';

export const SONG_IMPORT_EXTENSIONS=['.usr','.txt','.xml','.cho','.chordpro','.chopro','.pro'];
const OPENLYRICS_LABELS={v:'Verse',c:'Chorus',b:'Bridge',p:'Pre-Chorus',e:'Ending',i:'Intro',o:'Other',t:'Tag'};
// Section headings as SongSelect and most lyric sheets write them: "Verse 1", "Chorus", "Pre-Chorus 2", "Tag".
const HEADING=/^(verse|chorus|bridge|pre-?chorus|refrain|tag|ending|intro|outro|interlude|instrumental|vamp|misc|coda|slide)(\s*\d+)?\s*:?\s*$/i;
const tidyHeading=text=>text.trim().replace(/:$/,'').replace(/\s+/g,' ').replace(/^\w/,c=>c.toUpperCase()).replace(/^Pre-?chorus/i,'Pre-Chorus');
const paragraphs=text=>String(text).replace(/\r/g,'').split(/\n\s*\n/).map(p=>p.split('\n').map(l=>l.trim()).filter(Boolean).join('\n')).filter(Boolean);

// sections: [{label, slides:[text]}] in the order written; order: labels as sung (empty means as written).
// A label used twice with the same words is one section sung twice; with different words it gets a number.
function songFrom({title,meta={},sections,order=[]}){
 const kept=[],byLabel=new Map(),written=[];
 for(const section of sections){
  if(!section.slides.length)continue;
  let label=section.label;
  const same=byLabel.get(label.toLowerCase());
  if(same&&same.slides.join('\n\n')===section.slides.join('\n\n')){written.push(same.label);continue;}
  for(let n=2;byLabel.has(label.toLowerCase());n++)label=section.label+' '+n;
  const entry={label,slides:section.slides};kept.push(entry);byLabel.set(label.toLowerCase(),entry);written.push(label);
 }
 if(!kept.length)throw new Error('No lyrics were found in it.');
 const sung=order.filter(label=>byLabel.has(label.toLowerCase()));
 const lyrics=kept.map(s=>'['+s.label+']\n'+s.slides.join('\n\n')).join('\n\n');
 const name=String(title||'').trim()||'Imported song';
 const cleanMeta=Object.fromEntries(Object.entries(meta).filter(([,v])=>v));
 return editSong(newSong(name),{title:name,meta:cleanMeta,lyrics,arrangement:(sung.length?sung:written).join(', ')});
}

// SongSelect .usr: "Key=value" lines; Fields and Words list the sections, separated by "/t", with "/n" between lines.
export function fromSongSelectUsr(text){
 const value=key=>(new RegExp('^'+key+'=(.*)$','mi').exec(text)||[])[1]?.trim()||'';
 const fields=value('Fields').split('/t'),words=value('Words').split('/t');
 const sections=fields.map((label,i)=>({label:tidyHeading(label)||'Verse '+(i+1),slides:paragraphs((words[i]||'').split('/n').join('\n'))}));
 return songFrom({title:value('Title'),meta:{author:value('Author').replace(/\s*\|\s*/g,', '),copyright:value('Copyright'),ccli:(/^\[S\s*A?(\d+)\]/mi.exec(text)||[])[1]||''},sections});
}

// SongSelect lyrics .txt: the title, then headed sections, then a footer from "CCLI Song #" on.
export function fromSongSelectText(text){
 const lines=String(text).replace(/\r/g,'').split('\n');
 const footerAt=lines.findIndex(l=>/^\s*CCLI Song #/i.test(l));
 const body=footerAt>=0?lines.slice(0,footerAt):lines,footer=footerAt>=0?lines.slice(footerAt).map(l=>l.trim()).filter(Boolean):[];
 const titleAt=body.findIndex(l=>l.trim());
 const sections=readHeaded(body.slice(titleAt+1).join('\n'));
 const author=footer.find((l,i)=>i>0&&!/^©|^\(c\)|^for use|^ccli|^all rights|^www\./i.test(l))||'';
 return songFrom({title:body[titleAt]?.trim(),meta:{author,copyright:(footer.find(l=>/^©|^\(c\)/i.test(l))||'').replace(/^©\s*|^\(c\)\s*/i,''),ccli:(/CCLI Song #\s*(\d+)/i.exec(text)||[])[1]||''},sections});
}
// Text with heading lines ("Verse 1", "Chorus") or [Verse 1] markers. Paragraphs under a heading are its slides; text
// before any heading is Verse 1.
function readHeaded(text){
 const sections=[];let current=null,buffer=[];
 const close=()=>{if(buffer.length){const slides=paragraphs(buffer.join('\n'));if(slides.length){if(!current){current={label:'Verse '+(sections.length+1),slides:[]};sections.push(current);}current.slides.push(...slides);}}buffer=[];};
 for(const line of String(text).replace(/\r/g,'').split('\n')){
  const marker=/^\s*\[([^\]]{1,60})\]\s*$/.exec(line),heading=marker?marker[1]:HEADING.test(line.trim())?line:'';
  if(heading){close();current={label:tidyHeading(heading),slides:[]};sections.push(current);continue;}
  buffer.push(line);
 }
 close();
 return sections;
}

// OpenLyrics XML. Read with patterns, not a full XML parser: only the parts below are used, and anything else (chords,
// comments, formatting tags) is dropped. Each <lines> is a slide; v1a and v1b are two parts of Verse 1.
const ENTITIES={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
const decode=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,e)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):Number(e.slice(1))):ENTITIES[e.toLowerCase()]);
const xmlText=s=>decode(String(s).replace(/<!--[\s\S]*?-->/g,'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'')).split('\n').map(l=>l.trim()).filter(Boolean).join('\n');
const first=(xml,tag)=>{const m=new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+tag+'>','i').exec(xml);return m?xmlText(m[1]):'';};
export function fromOpenLyrics(xml){
 if(!/<song[\s>]/i.test(xml))throw new Error('This is not an OpenLyrics song.');
 const labelFor=name=>{const m=/^([a-z])(\d*)([a-z]?)$/i.exec(name);if(!m)return name;return (OPENLYRICS_LABELS[m[1].toLowerCase()]||'Verse')+(m[2]?' '+m[2]:'');};
 const sections=[],byLabel=new Map();
 for(const m of xml.matchAll(/<verse\s[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/verse>/gi)){
  const label=labelFor(m[1]),slides=[...m[2].matchAll(/<lines(?:\s[^>]*)?>([\s\S]*?)<\/lines>/gi)].map(l=>xmlText(l[1])).filter(Boolean);
  if(byLabel.has(label))byLabel.get(label).slides.push(...slides);else{const s={label,slides};byLabel.set(label,s);sections.push(s);}
 }
 // v1a v1b (two parts of Verse 1) become one entry; a part written twice, such as c c, is sung twice.
 const tokens=first(xml,'verseOrder').split(/\s+/).filter(Boolean),order=tokens.map(labelFor).filter((l,i)=>!(i&&l===labelFor(tokens[i-1])&&tokens[i]!==tokens[i-1]));
 const authors=[...xml.matchAll(/<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/gi)].map(m=>xmlText(m[1])).filter(Boolean).join(', ');
 return songFrom({title:first(xml,'title'),meta:{author:authors,copyright:first(xml,'copyright'),ccli:first(xml,'ccliNo')},sections,order});
}

// ChordPro: {title: …} and other directives, [G] chords inside the words, and {start_of_chorus} … {end_of_chorus}
// blocks. {comment: Verse 2} names the next section, as most ChordPro sheets use it.
export function fromChordPro(text,fallbackTitle=''){
 const meta={},sections=[];let title='',current=null,buffer=[];
 const close=()=>{const slides=paragraphs(buffer.join('\n'));buffer=[];if(!slides.length)return;if(!current){current={label:'Verse '+(sections.filter(s=>/^Verse/.test(s.label)).length+1),slides:[]};sections.push(current);}current.slides.push(...slides);};
 const start=label=>{close();current={label,slides:[],named:true};sections.push(current);};
 for(const raw of String(text).replace(/\r/g,'').split('\n')){
  const line=raw.trim();
  if(line.startsWith('#'))continue;
  const directive=/^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i.exec(line);
  if(directive){
   const [,name,value='']=directive,key=name.toLowerCase();
   if(key==='title'||key==='t')title=value;
   else if(['subtitle','st','artist','composer','lyricist'].includes(key))meta.author=meta.author?meta.author+', '+value:value;
   else if(key==='copyright')meta.copyright=value;
   else if(key==='ccli')meta.ccli=value.replace(/\D/g,'');
   else if(key==='start_of_chorus'||key==='soc')start(value||'Chorus');
   else if(key==='start_of_bridge'||key==='sob')start(value||'Bridge');
   else if(key==='start_of_verse'||key==='sov')start(value||'Verse '+(sections.filter(s=>/^Verse/.test(s.label)).length+1));
   else if(/^end_of_|^eo[cvb]$/.test(key)){close();current=null;}
   else if(['comment','c','ci','comment_italic','cb'].includes(key)&&HEADING.test(value))start(tidyHeading(value));
   continue;
  }
  // A blank line ends a paragraph; outside a named block, the next paragraph is a new verse.
  if(!line){if(current&&!current.named){close();current=null;}else buffer.push('');continue;}
  buffer.push(raw.replace(/\[[^\]]*\]/g,'').replace(/\s{2,}/g,' ').trim());
 }
 close();
 return songFrom({title:title||fallbackTitle,meta,sections});
}

// Plain lyrics: headed sections if it has headings or [markers], otherwise one verse with a slide per paragraph.
export function fromPlainText(text,title){
 const sections=readHeaded(text);
 return songFrom({title,sections});
}

// A song file's bytes as text. SongSelect and other Windows programs write UTF-16 (with or without a byte order mark)
// or an older Windows code page as well as UTF-8, so each is recognised. A file that is not text at all, such as a
// ProPresenter 7 .pro file (which is binary), is refused rather than imported as nonsense.
export function decodeSongFile(bytes,name=''){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(b[0]===0xff&&b[1]===0xfe)return new TextDecoder('utf-16le').decode(b.subarray(2));
 if(b[0]===0xfe&&b[1]===0xff)return new TextDecoder('utf-16be').decode(b.subarray(2));
 // UTF-16 without a mark: plain letters leave every other byte zero.
 let zerosEven=0,zerosOdd=0;const sample=Math.min(b.length,2000);
 for(let i=0;i<sample;i++)if(b[i]===0){if(i%2)zerosOdd++;else zerosEven++;}
 if(sample>=4&&zerosOdd>sample*0.3&&zerosEven<sample*0.05)return new TextDecoder('utf-16le').decode(b);
 if(sample>=4&&zerosEven>sample*0.3&&zerosOdd<sample*0.05)return new TextDecoder('utf-16be').decode(b);
 if(zerosEven+zerosOdd>0)throw new Error(/\.pro$/i.test(name)?'this looks like a ProPresenter file, which cannot be read yet: export the song from ProPresenter as text':'this is not a text song file');
 try{return new TextDecoder('utf-8',{fatal:true}).decode(b).replace(/^\uFEFF/,'');}
 catch{return new TextDecoder('windows-1252').decode(b);}
}
// ChordPro directives such as {title: …} or {soc}.
const CHORDPRO=/^\s*\{\s*(title|t|subtitle|st|artist|start_of_chorus|soc|start_of_verse|sov|comment|c)\s*[:}]/mi;
// RTF to plain text, enough for song words: paragraphs and line breaks become new lines, \'e9 and \u233 become
// letters (Windows-1252 for the first), and font, colour and style tables are left out.
const CP1252=new TextDecoder('windows-1252');
const SKIP=new Set(['fonttbl','colortbl','stylesheet','info','pict','header','footer','listtable','listoverridetable','generator','themedata','datastore','latentstyles','rsidtbl']);
export function rtfToText(rtf){
 const s=String(rtf);let out='',i=0,depth=0,skipUntil=-1,ucSkip=1,pendingSkip=0;
 while(i<s.length){
  const c=s[i];
  if(c==='{'){depth++;i++;if(s[i]==='\\'&&s[i+1]==='*'&&skipUntil<0)skipUntil=depth;continue;}
  if(c==='}'){if(depth===skipUntil)skipUntil=-1;depth--;i++;continue;}
  if(c==='\\'){
   const next=s[i+1];
   if(next==="'"){const byte=parseInt(s.slice(i+2,i+4),16);i+=4;if(pendingSkip){pendingSkip--;continue;}if(skipUntil<0&&!Number.isNaN(byte))out+=CP1252.decode(new Uint8Array([byte]));continue;}
   if(next==='\\'||next==='{'||next==='}'){if(skipUntil<0)out+=next;i+=2;continue;}
   if(next==='~'){if(skipUntil<0)out+=' ';i+=2;continue;}
   if(next==='-'||next==='_'||next==='*'){i+=2;continue;}
   const m=/^\\([a-zA-Z]+)(-?\d+)? ?/.exec(s.slice(i,i+40));
   if(!m){i+=2;continue;}
   i+=m[0].length;const word=m[1],arg=m[2]===undefined?null:Number(m[2]);
   if(SKIP.has(word)&&skipUntil<0){skipUntil=depth;continue;}
   if(skipUntil>=0)continue;
   if(word==='par'||word==='line'||word==='sect'||word==='page')out+='\n';
   else if(word==='tab')out+='\t';
   else if(word==='uc')ucSkip=arg??1;
   else if(word==='u'){out+=String.fromCharCode(arg<0?arg+65536:arg);pendingSkip=ucSkip;}
   continue;
  }
  if(c==='\r'||c==='\n'){i++;continue;}
  if(pendingSkip){pendingSkip--;i++;continue;}
  if(skipUntil<0)out+=c;
  i++;
 }
 return out.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
// One EasyWorship song: its row from Songs.db and its RTF words from SongWords.db. Section names ("Verse 1",
// "Chorus") are lines of their own, and a blank line starts a new slide.
export function fromEasyWorship({title,author,copyright,ccli,words}){
 const text=/^\s*\{\\rtf/.test(String(words||''))?rtfToText(words):String(words||'');
 return songFrom({title,meta:{author:String(author||'').split(/\s*[\/;]\s*/).filter(Boolean).join(', '),copyright:copyright||'',ccli:String(ccli||'').replace(/\D/g,'')},sections:readHeaded(text)});
}

// Picks the reader by file name and content. Returns a Wordlight song, or throws with a reason the operator can read.
export function songFromImportedFile(name,text){
 const lower=String(name).toLowerCase(),base=String(name).replace(/\.[^.]+$/,'').replace(/[_]+/g,' ').trim();
 if(lower.endsWith('.usr')||/^Type=SongSelect Import File/mi.test(text))return fromSongSelectUsr(text);
 if(lower.endsWith('.xml')||/<song[^>]+openlyrics/i.test(text))return fromOpenLyrics(text);
 // .pro is ChordPro's extension and also ProPresenter's, so a .pro file must look like ChordPro to be read as it.
 if(lower.endsWith('.pro')&&!CHORDPRO.test(text))throw new Error('this .pro file is not ChordPro (ProPresenter files cannot be read yet: export the song from ProPresenter as text)');
 if(/\.(cho|chordpro|chopro|pro)$/.test(lower)||CHORDPRO.test(text))return fromChordPro(text,base);
 if(/^\s*CCLI Song #/mi.test(text))return fromSongSelectText(text);
 return fromPlainText(text,base);
}
