// Bible book catalogue, reference parsing and book suggestions. No network access.
export const BIBLE_BOOKS=[{"id":"GEN","name":"Gẹnẹsisi","english":"Genesis","chapters":50},{"id":"EXO","name":"Eksodu","english":"Exodus","chapters":40},{"id":"LEV","name":"Lefitiku","english":"Leviticus","chapters":27},{"id":"NUM","name":"Numeri","english":"Numbers","chapters":36},{"id":"DEU","name":"Deuteronomi","english":"Deuteronomy","chapters":34},{"id":"JOS","name":"Joṣua","english":"Joshua","chapters":24},{"id":"JDG","name":"Onidajọ","english":"Judges","chapters":21},{"id":"RUT","name":"Rutu","english":"Ruth","chapters":4},{"id":"1SA","name":"1 Samuẹli","english":"1 Samuel","chapters":31},{"id":"2SA","name":"2 Samuẹli","english":"2 Samuel","chapters":24},{"id":"1KI","name":"1 Ọba","english":"1 Kings","chapters":22},{"id":"2KI","name":"2 Ọba","english":"2 Kings","chapters":25},{"id":"1CH","name":"1 Kronika","english":"1 Chronicles","chapters":29},{"id":"2CH","name":"2 Kronika","english":"2 Chronicles","chapters":36},{"id":"EZR","name":"Esra","english":"Ezra","chapters":10},{"id":"NEH","name":"Nehemiah","english":"Nehemiah","chapters":13},{"id":"EST","name":"Esteri","english":"Esther","chapters":10},{"id":"JOB","name":"Jobu","english":"Job","chapters":42},{"id":"PSA","name":"Saamu","english":"Psalms","chapters":150},{"id":"PRO","name":"Òwe","english":"Proverbs","chapters":31},{"id":"ECC","name":"Oniwaasu","english":"Ecclesiastes","chapters":12},{"id":"SNG","name":"Orin Solomoni","english":"Song of Solomon","chapters":8},{"id":"ISA","name":"Isaiah","english":"Isaiah","chapters":66},{"id":"JER","name":"Jeremiah","english":"Jeremiah","chapters":52},{"id":"LAM","name":"Ẹkún Jeremiah","english":"Lamentations","chapters":5},{"id":"EZK","name":"Esekiẹli","english":"Ezekiel","chapters":48},{"id":"DAN","name":"Daniẹli","english":"Daniel","chapters":12},{"id":"HOS","name":"Hosea","english":"Hosea","chapters":14},{"id":"JOL","name":"Joẹli","english":"Joel","chapters":3},{"id":"AMO","name":"Amosi","english":"Amos","chapters":9},{"id":"OBA","name":"Obadiah","english":"Obadiah","chapters":1},{"id":"JON","name":"Jona","english":"Jonah","chapters":4},{"id":"MIC","name":"Mika","english":"Micah","chapters":7},{"id":"NAM","name":"Nahumu","english":"Nahum","chapters":3},{"id":"HAB","name":"Habakuku","english":"Habakkuk","chapters":3},{"id":"ZEP","name":"Sefaniah","english":"Zephaniah","chapters":3},{"id":"HAG","name":"Hagai","english":"Haggai","chapters":2},{"id":"ZEC","name":"Sekariah","english":"Zechariah","chapters":14},{"id":"MAL","name":"Malaki","english":"Malachi","chapters":4},{"id":"MAT","name":"Matiu","english":"Matthew","chapters":28},{"id":"MRK","name":"Marku","english":"Mark","chapters":16},{"id":"LUK","name":"Luku","english":"Luke","chapters":24},{"id":"JHN","name":"Johanu","english":"John","chapters":21},{"id":"ACT","name":"Ìṣe àwọn Aposteli","english":"Acts","chapters":28},{"id":"ROM","name":"Romu","english":"Romans","chapters":16},{"id":"1CO","name":"1 Kọrinti","english":"1 Corinthians","chapters":16},{"id":"2CO","name":"2 Kọrinti","english":"2 Corinthians","chapters":13},{"id":"GAL","name":"Galatia","english":"Galatians","chapters":6},{"id":"EPH","name":"Efesu","english":"Ephesians","chapters":6},{"id":"PHP","name":"Filipi","english":"Philippians","chapters":4},{"id":"COL","name":"Kolose","english":"Colossians","chapters":4},{"id":"1TH","name":"1 Tẹsalonika","english":"1 Thessalonians","chapters":5},{"id":"2TH","name":"2 Tẹsalonika","english":"2 Thessalonians","chapters":3},{"id":"1TI","name":"1 Timotiu","english":"1 Timothy","chapters":6},{"id":"2TI","name":"2 Timotiu","english":"2 Timothy","chapters":4},{"id":"TIT","name":"Titu","english":"Titus","chapters":3},{"id":"PHM","name":"Filemoni","english":"Philemon","chapters":1},{"id":"HEB","name":"Heberu","english":"Hebrews","chapters":13},{"id":"JAS","name":"Jakọbu","english":"James","chapters":5},{"id":"1PE","name":"1 Peteru","english":"1 Peter","chapters":5},{"id":"2PE","name":"2 Peteru","english":"2 Peter","chapters":3},{"id":"1JN","name":"1 Johanu","english":"1 John","chapters":5},{"id":"2JN","name":"2 Johanu","english":"2 John","chapters":1},{"id":"3JN","name":"3 Johanu","english":"3 John","chapters":1},{"id":"JUD","name":"Juda","english":"Jude","chapters":1},{"id":"REV","name":"Ìfihàn","english":"Revelation","chapters":22}];
// Standard abbreviations, written as lowercase keys without spaces or dots.
const ABBREVIATIONS={GEN:['gen','ge','gn'],EXO:['exod','ex','exo'],LEV:['lev','lv','le'],NUM:['num','nu','nm','nb'],DEU:['deut','dt','de','deu'],JOS:['josh','jsh'],JDG:['judg','jdg','jg','jdgs'],RUT:['ru','rth'],
 '1SA':['1sam','1sa','1sm'],'2SA':['2sam','2sa','2sm'],'1KI':['1kgs','1ki','1kg'],'2KI':['2kgs','2ki','2kg'],'1CH':['1chr','1ch','1chron'],'2CH':['2chr','2ch','2chron'],EZR:['ezr'],NEH:['neh','ne'],EST:['esth','es'],JOB:['jb'],
 PSA:['ps','psa','psalm','pss','psm','pslm'],PRO:['prov','pr','prv','pro'],ECC:['eccl','ecc','eccles','qoh','ec'],SNG:['song','sos','songofsongs','canticles','sg'],ISA:['isa','is'],JER:['jer','je','jr'],LAM:['lam','la'],EZK:['ezek','eze','ezk'],
 DAN:['dan','da','dn'],HOS:['hos','ho'],JOL:['jl'],AMO:['am'],OBA:['obad','ob'],JON:['jnh'],MIC:['mic','mc'],NAM:['nah','na'],HAB:['hab','hb'],ZEP:['zeph','zp'],HAG:['hag','hg'],ZEC:['zech','zc'],MAL:['mal','ml'],
 MAT:['matt','mt','mat'],MRK:['mk','mar'],LUK:['lk','lu'],JHN:['jn','joh'],ACT:['ac','act'],ROM:['rom','ro','rm'],'1CO':['1cor','1co'],'2CO':['2cor','2co'],GAL:['gal','ga'],EPH:['eph','ephes'],PHP:['phil','pp'],COL:['col'],
 '1TH':['1thess','1th','1thes'],'2TH':['2thess','2th','2thes'],'1TI':['1tim','1ti','1tm'],'2TI':['2tim','2ti','2tm'],TIT:['tit'],PHM:['philem','phlm','phile'],HEB:['heb'],JAS:['jas','jm','jam'],
 '1PE':['1pet','1pe','1pt'],'2PE':['2pet','2pe','2pt'],'1JN':['1jn','1jo','1jhn','1joh'],'2JN':['2jn','2jo','2jhn','2joh'],'3JN':['3jn','3jo','3jhn','3joh'],JUD:['jd'],REV:['rev','re','rv','revelations','apocalypse']};
// "First John", "1st John", "I John" and "1 John" all become the key "1john".
export function bookKey(text){
 return String(text).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim()
  .replace(/^(iii|third|3rd)\s+/,'3').replace(/^(ii|second|2nd)\s+/,'2').replace(/^(i|first|1st)\s+/,'1').replace(/[.\s]+/g,'');
}
let aliasIndex;
function aliases(){
 if(!aliasIndex){
  aliasIndex=new Map();
  for(const book of BIBLE_BOOKS)for(const key of new Set([book.id,book.english,book.name,...(ABBREVIATIONS[book.id]||[])].map(bookKey))){
   if(aliasIndex.has(key)&&aliasIndex.get(key)!==book)throw new Error('Book alias '+key+' is ambiguous.');
   aliasIndex.set(key,book);
  }
 }
 return aliasIndex;
}
export function bookAliases(){return aliases();}
export function findBook(text){return aliases().get(bookKey(text))||null;}
// Books whose name, abbreviation or code starts with what was typed, in Bible order.
export function matchingBooks(text,limit=6){
 const key=bookKey(text);if(!key)return [];
 const exact=findBook(text),found=new Set(exact?[exact]:[]);
 for(const [alias,book] of aliases())if(alias.startsWith(key))found.add(book);
 return [...found].sort((a,b)=>(a===exact?-1:b===exact?1:BIBLE_BOOKS.indexOf(a)-BIBLE_BOOKS.indexOf(b))).slice(0,limit);
}
const DASHES=/[‐-―−﹘﹣－]/g;
// Splits "1 Cor 13:4" into the book text and the chapter/verse tail. The book must start with a letter,
// after an optional book number.
function splitReference(input){
 const text=String(input??'').normalize('NFC').replace(DASHES,'-').replace(/：/g,':').replace(/；/g,';').trim();
 const match=text.match(/^((?:[1-3]|iii|ii|i|first|second|third|1st|2nd|3rd)?\s*[^\d\s:;-][^\d:;]*?)\s*(\d[\s\S]*)?$/iu);
 return match?{book:match[1].trim(),tail:(match[2]||'').trim()}:{book:'',tail:text};
}
const EXAMPLE='Use a reference such as John 3:16-18, Luke 10:18-20 or Psalm 23.';
export function parseReference(input){
 if(!String(input??'').trim())throw new Error('Enter a reference first. '+EXAMPLE);
 const parts=splitReference(input);
 if(!parts.book)throw new Error('Start with a book name. '+EXAMPLE);
 const book=findBook(parts.book);
 if(!book){
  const options=matchingBooks(parts.book);
  throw new Error(options.length>1?'“'+parts.book+'” could be '+options.map(b=>b.english).join(', ')+'. Type more of the book name.':options.length===1?'Book not found. Did you mean '+options[0].english+'?':'Book not found. Use its full Yoruba or English name, a standard abbreviation, or its three-letter code.');
 }
 if(!parts.tail)throw new Error('Add a chapter, such as '+book.english+' 1.');
 // Accept "10;18", "10 : 18", "18 to 20" and Unicode dashes, but nothing that changes what was meant.
 const tail=parts.tail.replace(/(\d)\s*to\s*(\d)/gi,'$1-$2').replace(/\s*([:;-])\s*/g,'$1');
 const m=tail.match(/^(\d+)(?:[:;](\d+))?(?:-(?:(\d+)[:;])?(\d+))?$/);
 if(!m)throw new Error('Check the reference format. Separate chapter and verse with “:” and ranges with “-”. '+EXAMPLE);
 const [chapter,verse,toChapter,toNumber]=m.slice(1).map(v=>v===undefined?null:Number(v));
 if(verse===null&&toChapter!==null)throw new Error('Check the range: “'+parts.tail+'” is ambiguous. Write it as '+book.english+' '+chapter+':1-'+toChapter+':'+toNumber+'.');
 let endChapter=chapter,endVerse=verse;
 if(verse===null&&toNumber!==null)endChapter=toNumber;
 else if(toNumber!==null){endChapter=toChapter??chapter;endVerse=toNumber;}
 if(chapter<1||(verse!==null&&verse<1)||(endVerse!==null&&endVerse<1)||endChapter<chapter||endChapter===chapter&&verse!==null&&endVerse<verse)
  throw new Error('Check the chapter and verse range. The end must come after the start.');
 if(chapter>book.chapters||endChapter>book.chapters)throw new Error('Check the chapter and verse range. '+book.english+' has '+book.chapters+' chapter'+(book.chapters===1?'':'s')+'.');
 const end=endVerse!==null&&(endChapter!==chapter||endVerse!==verse)?'-'+(endChapter!==chapter?endChapter+':':'')+endVerse:endVerse===null&&endChapter!==chapter?'-'+endChapter:'';
 return {book,chapter,verse,endChapter,endVerse,reference:book.english+' '+chapter+(verse!==null?':'+verse:'')+end};
}
// Suggestions while typing. The chapter and verse typed so far are kept when a book is chosen.
export function suggestBooks(input){
 const parts=splitReference(input);
 if(!parts.book||(parts.tail&&findBook(parts.book)))return {books:[],tail:parts.tail};
 return {books:matchingBooks(parts.book),tail:parts.tail};
}
export function withBook(input,book){const {tail}=splitReference(input);return book.english+' '+tail;}
// Tab in the reference field: the typed book (an abbreviation, a Yoruba name or the start of a name) becomes its full
// English name, keeping the chapter and verse. Returns null when there is nothing to complete.
export function completeBook(input){
 const parts=splitReference(input);if(!parts.book)return null;
 const book=findBook(parts.book)||matchingBooks(parts.book)[0];if(!book)return null;
 const out=withBook(input,book);
 return out.trimEnd()===String(input).trimEnd()?null:out;
}
