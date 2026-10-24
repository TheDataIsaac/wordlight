import {BIBLE_BOOKS,parseReference} from './reference.mjs';
export const YORUBA_BOOKS=BIBLE_BOOKS;

export const YORUBA_CREDIT='Biblica® Open Yoruba Contemporary Bible™ © 2009, 2017 Biblica, Inc. · CC BY-SA 4.0';
export const YORUBA_SOURCE='https://ebible.org/Scriptures/details.php?id=yor';
// Yoruba lookups use the shared reference parser, with the existing 10-chapter limit per lookup.
export function parseYorubaReference(query){
 const r=parseReference(query);
 if(r.endChapter-r.chapter>9)throw new Error('Check the chapter and verse range. Load up to 10 chapters at a time.');
 return {book:r.book,chapter:r.chapter,first:r.verse,endChapter:r.endChapter,last:r.endVerse??r.verse};
}
export function yorubaChapter(data){
 if(!data?.book?.id||!Array.isArray(data.chapter?.content))throw new Error('The Yoruba chapter could not be loaded.');
 return data.chapter.content.filter(v=>v.type==='verse'&&Number.isInteger(v.number)&&typeof v.text==='string').map(v=>({book_id:data.book.id,book_name:data.book.name,chapter:data.chapter.number,verse:v.number,text:v.text.trim()}));
}
export function yorubaResponse(verses){
 if(!verses.length)throw new Error('No verses found in that range.');
 const first=verses[0],last=verses.at(-1),start=first.book_name+' '+first.chapter+':'+first.verse;
 const reference=verses.length===1?start:start+'-'+(last.chapter===first.chapter?'':last.chapter+':')+last.verse;
 return {reference,text:verses.map(v=>v.text).join('\n'),verses,translation_id:'oycb',attribution:YORUBA_CREDIT};
}
export async function lookupYoruba(query,get){
 const p=parseYorubaReference(query),verses=[];
 for(let c=p.chapter;c<=p.endChapter;c++){
  const chapter=yorubaChapter(await get('/yoruba/'+p.book.id+'/'+c));
  if(c===p.chapter&&p.first!==null&&!chapter.some(v=>v.verse===p.first))throw new Error('The starting verse does not exist in this chapter.');
  if(c===p.endChapter&&p.last!==null&&!chapter.some(v=>v.verse===p.last))throw new Error('The ending verse does not exist in this chapter.');
  verses.push(...chapter.filter(v=>(c!==p.chapter||p.first===null||v.verse>=p.first)&&(c!==p.endChapter||p.last===null||v.verse<=p.last)));
 }
 return yorubaResponse(verses);
}
export async function adjacentYoruba(range,delta,get){
 const point=delta<0?range.start:range.end;
 let index=YORUBA_BOOKS.findIndex(b=>b.id===point.bookId);if(index<0)throw new Error('Yoruba book not found.');
 let book=YORUBA_BOOKS[index],chapter=point.chapter;
 const verses=yorubaChapter(await get('/yoruba/'+book.id+'/'+chapter)),i=verses.findIndex(v=>v.verse===point.verse);
 if(i<0)throw new Error('That verse is unavailable.');
 let next=verses[i+delta];
 if(!next){
  chapter+=delta;
  if(chapter<1||chapter>book.chapters){index+=delta;book=YORUBA_BOOKS[index];if(!book)return null;chapter=delta<0?book.chapters:1;}
  const nextVerses=yorubaChapter(await get('/yoruba/'+book.id+'/'+chapter));next=delta<0?nextVerses.at(-1):nextVerses[0];
 }
 return yorubaResponse([next]);
}
