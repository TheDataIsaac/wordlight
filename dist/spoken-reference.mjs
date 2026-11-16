// Bible references said out loud, found in a running transcript: "Second Corinthians chapter ten, verses three and
// four", "John three sixteen", "Romans 8:28", or "verse nine" in the chapter already open. Speech recognition writes
// numbers as words and mishears some book names, so both are put right before looking for a reference.
// A book name only counts when a chapter number follows it, so "a good job" or "Mark my words" are never references.
import {BIBLE_BOOKS,bookKey} from './reference.mjs';
import {verseCount,chapterCount} from './versification.mjs';

const UNITS={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19};
const TENS={twenty:20,thirty:30,forty:40,fourty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
const BOOK_NUMBERS={first:'1',second:'2',third:'3','1st':'1','2nd':'2','3rd':'3',one:'1',two:'2',three:'3',i:'1',ii:'2',iii:'3'};
// What speech recognition writes for some book names. Only used when a chapter number follows.
const MISHEARD={palms:'psalms',palm:'psalm',sams:'psalms',psalmist:'psalms',romance:'romans',roman:'romans',revelations:'revelation',revolution:'revelation',
 hebrew:'hebrews',proverb:'proverbs',genesys:'genesis',corinthian:'corinthians',carinthians:'corinthians',galatian:'galatians',ephesian:'ephesians',
 philippian:'philippians',philippines:'philippians',filipinos:'philippians',colossian:'colossians',thessalonian:'thessalonians',lamentation:'lamentations',
 chronicle:'chronicles',king:'kings',act:'acts',isaiahs:'isaiah',jeremiahs:'jeremiah',ezekiels:'ezekiel',deuteronomy:'deuteronomy',duteronomy:'deuteronomy'};
// Books are recognised by their full English names only. Written abbreviations ("is" for Isaiah, "am" for Amos)
// are ordinary words when spoken.
const SPOKEN_BOOKS=new Map();
for(const book of BIBLE_BOOKS)SPOKEN_BOOKS.set(bookKey(book.english),book);
for(const [name,id] of [['psalm','PSA'],['song of songs','SNG'],['song of solomon','SNG'],['songs of solomon','SNG']])SPOKEN_BOOKS.set(bookKey(name),BIBLE_BOOKS.find(b=>b.id===id));
const RANGE_WORDS=new Set(['to','through','till','until','and','-']);
const CHAPTER_WORDS=new Set(['chapter','chapters','chap']);
const VERSE_WORDS=new Set(['verse','verses','vs','versus','v']);
const FILLER=new Set(['the','book','of','gospel','according','to','saint','st','letter','epistle']);

// Words to tokens, with spoken numbers as numbers: "twenty three" is 23, "one hundred and nineteen" is 119, and "three
// sixteen" stays two numbers, 3 and 16. "8:28" becomes 8, ':' and 28.
export function speechTokens(text){
 const words=String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/([a-z])-([a-z])/g,'$1 $2').replace(/(\d)\s*:\s*(\d)/g,'$1 : $2').replace(/(\d)\s*[-–]\s*(\d)/g,'$1 - $2').replace(/[^a-z0-9:\- ]+/g,' ').split(/\s+/).filter(Boolean);
 const tokens=[];
 for(let i=0;i<words.length;){
  if(/^\d+$/.test(words[i])){tokens.push(Number(words[i]));i++;continue;}
  const spoken=readNumber(words,i);
  if(spoken){tokens.push(spoken.value);i=spoken.next;continue;}
  tokens.push(MISHEARD[words[i]]||words[i]);i++;
 }
 return tokens;
}
// One spoken number from words[i]: [one] hundred [and] [twenty] [three]. A unit after a unit starts a new number, so
// "three sixteen" is read as 3 here and 16 next time. Returns {value, next} or null.
function readNumber(words,i){
 let j=i,value=0,seen=false;
 if(words[j] in UNITS&&words[j+1]==='hundred'){value=UNITS[words[j]]*100;j+=2;seen=true;}
 else if(words[j]==='hundred'){value=100;j++;seen=true;}
 if(seen&&words[j]==='and'&&(words[j+1] in TENS||words[j+1] in UNITS))j++;
 if(words[j] in TENS){
  value+=TENS[words[j]];j++;seen=true;
  if(UNITS[words[j]]>=1&&UNITS[words[j]]<=9){value+=UNITS[words[j]];j++;}
 }else if(words[j] in UNITS){value+=UNITS[words[j]];j++;seen=true;}
 return seen?{value,next:j}:null;
}

// A book name at tokens[i], up to four words long ("song of solomon", "second corinthians"). Returns the book and how
// many tokens it used, or null.
function bookAt(tokens,i){
 let start=i;
 while(FILLER.has(tokens[start])&&start-i<4)start++;
 for(let length=Math.min(4,tokens.length-start);length>=1;length--){
  const words=tokens.slice(start,start+length);
  if(words.some(w=>typeof w==='number'&&!(words[0]===w&&w<=3)))continue;
  let name=words.join(' ');
  const first=String(words[0]);
  if(length>1&&(first in BOOK_NUMBERS||/^[123]$/.test(first)))name=(BOOK_NUMBERS[first]||first)+' '+words.slice(1).join(' ');
  const book=SPOKEN_BOOKS.get(bookKey(name));
  if(book&&!/^\d+$/.test(name))return {book,used:start-i+length};
 }
 return null;
}

const plausible=(book,chapter,verse)=>chapter>=1&&chapter<=chapterCount(book.id)&&(verse==null||(verse>=1&&verse<=verseCount(book.id,chapter)));

// Every reference in one stretch of transcript. context {book, chapter, verse} is the passage already open: "verse
// nine" means that book and chapter, and "chapter five verse two" that book. Returns references in the order said,
// each with how sure it is (0-100) and the words it came from, and the context after them.
export function findSpokenReferences(text,context={}){
 const tokens=speechTokens(text),found=[];
 let book=context.book||null,chapter=context.chapter||0,lastVerse=context.verse||0;
 const number=i=>typeof tokens[i]==='number'?tokens[i]:null;
 // A verse, or a range "3 to 5" / "3 and 4" / "3 - 5", starting at tokens[i]. "and" only joins neighbours (3 and 4).
 function verses(i){
  const first=number(i);if(first==null)return null;
  if(RANGE_WORDS.has(tokens[i+1])&&number(i+2)!=null){
   const end=number(i+2);
   if(end>first&&(tokens[i+1]!=='and'||end===first+1))return {verse:first,endVerse:end,used:3};
  }
  return {verse:first,endVerse:first,used:1};
 }
 for(let i=0;i<tokens.length;i++){
  const start=i,named=bookAt(tokens,i);
  if(named){
   let j=i+named.used;const saidChapter=CHAPTER_WORDS.has(tokens[j]);if(saidChapter)j++;
   const c=number(j);if(c==null||!plausible(named.book,c))continue;
   j++;
   let v=null,saidVerse=false;
   if(tokens[j]===':'){v=verses(j+1);j+=1;}
   else if(VERSE_WORDS.has(tokens[j])){saidVerse=true;v=verses(j+1);j+=1;}
   else if(number(j)!=null&&!saidChapter)v=verses(j);
   if(v&&plausible(named.book,c,v.verse)){
    const end=plausible(named.book,c,v.endVerse)?v.endVerse:v.verse;
    found.push(make(named.book,c,v.verse,end,saidVerse||tokens[j-1]===':'||saidChapter?98:90,'full',tokens.slice(start,j+v.used)));
    book=named.book;chapter=c;lastVerse=end;i=j+v.used-1;continue;
   }
   // Book and chapter only: the chapter opens at verse 1, less sure.
   found.push(make(named.book,c,1,1,75,'chapter',tokens.slice(start,j)));
   book=named.book;chapter=c;lastVerse=1;i=j-1;continue;
  }
  if(!book)continue;
  // "chapter five verse two" in the book already open.
  if(CHAPTER_WORDS.has(tokens[i])&&number(i+1)!=null&&VERSE_WORDS.has(tokens[i+2])){
   const c=number(i+1),v=verses(i+3);
   if(v&&plausible(book,c,v.verse)){
    found.push(make(book,c,v.verse,plausible(book,c,v.endVerse)?v.endVerse:v.verse,85,'in-book',tokens.slice(i,i+3+v.used)));
    chapter=c;lastVerse=found.at(-1).endVerse;i+=2+v.used;continue;
   }
  }
  // "verse nine" in the chapter already open. The next verse is the likeliest thing to be read.
  if(VERSE_WORDS.has(tokens[i])&&chapter&&number(i+1)!=null){
   const v=verses(i+1);
   if(v&&plausible(book,chapter,v.verse)){
    found.push(make(book,chapter,v.verse,plausible(book,chapter,v.endVerse)?v.endVerse:v.verse,v.verse===lastVerse+1?85:80,'in-chapter',tokens.slice(i,i+1+v.used)));
    lastVerse=found.at(-1).endVerse;i+=v.used;continue;
   }
  }
 }
 return {references:found,context:{book,chapter,verse:lastVerse}};
}
function make(book,chapter,verse,endVerse,confidence,kind,words){
 const reference=book.english+' '+chapter+':'+verse+(endVerse>verse?'-'+endVerse:'');
 return {reference,bookId:book.id,chapter,verse,endVerse,confidence,kind,heard:words.join(' ').replace(/ : /g,':')};
}
