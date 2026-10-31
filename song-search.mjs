// Line search for the song library. Every lyric line is held in memory on the laptop, folded so that tone marks, case,
// apostrophes and punctuation don't matter. The operator can type any line they hear, and a result says which line
// matched and where it is in the song, so sending it opens that part.
import {foldWords} from './dist/songs.mjs';

const MAX_WORDS=12,FUZZY_WHEN_FEWER_THAN=3;
const STATUS_RANK={checked:30,book:20,draft:10,reserve:0};
const LIBRARY='Wordlight library';

// One search entry for one song. A line sung twice is held once, at its first place in the arrangement.
export function searchEntry(song,{uses=0,modified=0}={}){
 const arrangement=song.arrangements.find(a=>a.id===song.arrangementId)||song.arrangements[0],seen=new Set(),lines=[];
 for(const section of song.sections){
  const position=arrangement.order.indexOf(section.id);if(position<0)continue;
  // Deck pages count only the slides shown at that position, so hidden pages are left out of the numbering.
  const hidden=new Set(arrangement.hidden?.[position]||[]);let shown=-1;
  section.slides.forEach((slide,index)=>{
   if(hidden.has(index))return;
   const page=++shown;
   for(const text of slide.split('\n')){
    const words=foldWords(text);if(!words||seen.has(words))continue;seen.add(words);
    lines.push({text:text.trim(),words:' '+words,squeezed:words.replaceAll(' ',''),section:section.label,position,page});
   }
  });
 }
 const meta=song.meta,artist=meta.artist||meta.author||'';
 return {id:song.id,name:song.title,artist,status:meta.status||'',category:meta.collection||LIBRARY,modified,uses,lines,
  head:' '+foldWords([song.title,meta.aliases,artist,meta.collection,meta.number].filter(Boolean).join(' ')),all:lines.map(l=>l.words).join('')};
}
export function vocabulary(entries){
 const words=new Set();
 for(const entry of entries)for(const line of entry.lines)for(const word of line.words.split(' '))if(word.length>=4)words.add(word);
 return words;
}
// Edit distance, where swapping two letters counts as one typo. It gives up once it passes the limit, which is what
// keeps the typo check fast.
function closeEnough(a,b,limit){
 if(Math.abs(a.length-b.length)>limit)return false;
 let older=[],previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const row=[i];let best=i;
  for(let j=1;j<=b.length;j++){
   row[j]=Math.min(previous[j]+1,row[j-1]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
   if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])row[j]=Math.min(row[j],older[j-2]+1);
   if(row[j]<best)best=row[j];
  }
  if(best>limit)return false;
  older=previous;previous=row;
 }
 return previous[b.length]<=limit;
}
// A word nobody sings is treated as a typo: it stands for the words within one or two letters of it.
function spellings(word,known){
 if(word.length<4)return [word];
 for(const w of known)if(w.startsWith(word))return [word];
 const limit=word.length>=8?2:1,close=[];
 for(const w of known)if(closeEnough(word,w,limit))close.push(w);
 return close.length?close:[word];
}
const hasWord=(text,word)=>text.includes(' '+word);
function bestLine(entry,words,phrase,squeezed){
 let best=null,score=0;
 for(const line of entry.lines){
  let s=0;
  if(line.words.startsWith(phrase))s=850;
  else if(line.words.includes(phrase))s=800;
  // Same letters, split differently: "ko rin" for "korin", "mofe" for "mo fe".
  else if(squeezed.length>=6&&line.squeezed.includes(squeezed))s=700;
  else if(words.every(w=>hasWord(line.words,w)))s=600;
  if(s>score){score=s;best=line;}
 }
 return {line:best,score};
}
function exactMatch(entry,words,phrase,squeezed){
 const {line,score}=bestLine(entry,words,phrase,squeezed);
 let title=0;
 if(entry.head.startsWith(phrase))title=900;
 else if(entry.head.includes(phrase))title=750;
 else if(words.every(w=>hasWord(entry.head,w)))title=500;
 if(score||title)return {line:score?line:null,score:Math.max(score,title)};
 // Every word somewhere in the song, across lines.
 if(words.every(w=>hasWord(entry.all,w)))return {line:entry.lines.find(l=>hasWord(l.words,words[0])),score:300};
 return null;
}
function fuzzyMatch(entry,alternatives){
 const inText=(text,options)=>options.some(w=>hasWord(text,w));
 const line=entry.lines.find(l=>alternatives.every(options=>inText(l.words,options)));
 if(line)return {line,score:250};
 if(alternatives.every(options=>inText(entry.head,options)))return {line:null,score:220};
 if(alternatives.every(options=>inText(entry.all,options)))return {line:entry.lines.find(l=>inText(l.words,alternatives[0])),score:150};
 return null;
}
const result=(entry,match)=>({id:entry.id,name:entry.name,category:entry.category,modified:entry.modified,source:'wordlight',artist:entry.artist,status:entry.status,uses:entry.uses,score:match.score+Math.min(entry.uses,20)*5+(STATUS_RANK[entry.status]??STATUS_RANK.book),
 ...(match.line?{line:match.line.text,section:match.line.section,position:match.line.position,page:match.line.page}:{})});
const ranked=hits=>hits.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).map(({score,uses,...hit})=>hit);
// Every matching song, best first. `known` is the vocabulary, built once and passed in, or a function that builds it.
export function findInSongbook(entries,query,known){
 const words=foldWords(query).split(' ').filter(Boolean).slice(0,MAX_WORDS);
 if(!words.length)return ranked(entries.map(entry=>result(entry,{line:null,score:0})));
 const phrase=' '+words.join(' '),squeezed=words.join(''),hits=[];
 for(const entry of entries){const match=exactMatch(entry,words,phrase,squeezed);if(match)hits.push(result(entry,match));}
 if(hits.length<FUZZY_WHEN_FEWER_THAN&&known){
  const vocab=typeof known==='function'?known():known;
  const alternatives=words.map(word=>spellings(word,vocab)),found=new Set(hits.map(h=>h.id));
  if(alternatives.some((options,i)=>options[0]!==words[i]))for(const entry of entries){
   if(found.has(entry.id))continue;
   const match=fuzzyMatch(entry,alternatives);if(match)hits.push(result(entry,match));
  }
 }
 return ranked(hits);
}
