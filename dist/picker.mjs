// Passage picker logic: books by section, chapter/verse grids and range selection. No network access.
import {BIBLE_BOOKS,parseReference} from './reference.mjs';
import {verseCount,chapterCount} from './versification.mjs';
export const SECTIONS=[
 ['law','Law','GEN','DEU'],['history','History','JOS','EST'],['poetry','Poetry','JOB','SNG'],['major','Major prophets','ISA','DAN'],['minor','Minor prophets','HOS','MAL'],
 ['gospels','Gospels','MAT','JHN'],['acts','Acts','ACT','ACT'],['paul','Paul’s letters','ROM','PHM'],['general','Other letters','HEB','JUD'],['revelation','Revelation','REV','REV']];
const SHORT={JDG:'Jdg',RUT:'Rut','1SA':'1Sa','2SA':'2Sa','1KI':'1Ki','2KI':'2Ki','1CH':'1Ch','2CH':'2Ch',PSA:'Psa',PRO:'Pro',ECC:'Ecc',SNG:'Sng',EZK:'Ezk',JOL:'Joe',NAM:'Nah',MRK:'Mrk',JHN:'Jhn',PHP:'Php',PHM:'Phm','1JN':'1Jn','2JN':'2Jn','3JN':'3Jn',JUD:'Jud'};
const id=book=>BIBLE_BOOKS.findIndex(b=>b.id===book);
export function sectionOf(bookId){const i=id(bookId);return SECTIONS.find(([, , first,last])=>i>=id(first)&&i<=id(last))?.[0]||'';}
export function pickerBooks(){return BIBLE_BOOKS.map(b=>({id:b.id,english:b.english,name:b.name,short:SHORT[b.id]||b.id[0]+b.id.slice(1).toLowerCase(),section:sectionOf(b.id),chapters:chapterCount(b.id)}));}
const before=(a,b)=>a.chapter<b.chapter||a.chapter===b.chapter&&a.verse<b.verse;
// A click sets the anchor (first verse); the next click sets the other end, in either order. After a complete
// range a plain click starts again. Shift-click always spans from the anchor to the clicked verse.
export function pickVerse(selection,point,extend=false){
 const anchor=selection?.anchor||selection?.start;
 if(!anchor||(selection.end&&!extend))return {anchor:point,start:point,end:null};
 if(!selection.end&&!extend&&anchor.chapter===point.chapter&&anchor.verse===point.verse)return {anchor:point,start:point,end:null};
 return before(point,anchor)?{anchor,start:point,end:anchor}:{anchor,start:anchor,end:point};
}
export function selectionReference(bookId,selection){
 const book=BIBLE_BOOKS.find(b=>b.id===bookId),start=selection?.start;if(!book||!start)return '';
 const end=selection.end||start,tail=start.chapter+':'+start.verse+(end.chapter!==start.chapter?'-'+end.chapter+':'+end.verse:end.verse!==start.verse?'-'+end.verse:'');
 return parseReference(book.english+' '+tail).reference;
}
export function chapterReference(bookId,chapter){const book=BIBLE_BOOKS.find(b=>b.id===bookId);return book?parseReference(book.english+' '+chapter).reference:'';}
export function versesIn(bookId,chapter,translation){return verseCount(bookId,chapter,translation);}
export const RECENT_KEY='wordlight-recent-passages';
export function readRecent(storage){try{const list=JSON.parse(storage.getItem(RECENT_KEY)||'[]');return Array.isArray(list)?list.filter(r=>typeof r?.reference==='string'&&typeof r.translation==='string').slice(0,8):[];}catch{return [];}}
export function rememberRecent(storage,reference,translation){
 const list=[{reference,translation},...readRecent(storage).filter(r=>!(r.reference===reference&&r.translation===translation))].slice(0,8);
 try{storage.setItem(RECENT_KEY,JSON.stringify(list));}catch{}return list;
}
