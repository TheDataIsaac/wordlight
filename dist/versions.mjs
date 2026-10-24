// Bible versions beyond the built-in list: the AO catalogue of open translations (bible.helloao.org), read online one
// chapter at a time, and the pinned versions shown first in the Bible panel. A version is looked up by its key
// ("ao:BSB"); the short label ("BSB") is what appears on screen.
import {BIBLE_BOOKS,parseReference} from './reference.mjs';

export const AO_CATALOG_URL='https://bible.helloao.org/api/available_translations.json';
export const AO_KEY=/^ao:[A-Za-z0-9_-]{2,40}$/;
const BOOKS=new Map(BIBLE_BOOKS.map(b=>[b.id,b]));
const fold=s=>String(s??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();

// The catalogue reduced to what the version list needs.
export function catalogRows(data){
 const list=Array.isArray(data?.translations)?data.translations:[];
 return list.filter(t=>typeof t?.id==='string'&&AO_KEY.test('ao:'+t.id)).map(t=>({
  key:'ao:'+t.id,label:String(t.shortName||t.id).slice(0,20),name:String(t.englishName||t.name||t.id).slice(0,120),
  language:String(t.languageEnglishName||t.languageName||t.language||'').slice(0,60),books:Number(t.numberOfBooks)||0,
  publicDomain:!!t.license?.publicDomain,attributionRequired:t.license?.attribution==='required',licenseUrl:/^https:\/\//.test(t.licenseUrl||'')?String(t.licenseUrl).slice(0,300):''}));
}
// Case- and accent-insensitive search over name, label, language and id.
export function filterRows(rows,query){
 const words=fold(query).split(/\s+/).filter(Boolean);
 if(!words.length)return rows;
 return rows.filter(r=>{const text=fold(r.name+' '+r.label+' '+r.language+' '+r.key);return words.every(w=>text.includes(w));});
}
export function coverage(row){return row.books>=66?'Whole Bible':row.books===27?'New Testament':row.books+' book'+(row.books===1?'':'s');}
export function aoCredit(row){
 return row.name+' ('+row.label+')'+(row.publicDomain?' · public domain':row.licenseUrl?' · licence: '+row.licenseUrl:'')+' · bible.helloao.org';
}

// One AO chapter (simple format) as verses. Missing books or chapters are reported, never replaced by another version.
export function aoChapter(data,bookId,chapter){
 if(!Array.isArray(data?.chapter?.content))throw new Error('This version does not include '+(BOOKS.get(bookId)?.english||bookId)+' '+chapter+'.');
 const book=BOOKS.get(bookId)?.english||bookId;
 return data.chapter.content.filter(v=>v.type==='verse'&&Number.isInteger(v.number)&&typeof v.text==='string'&&v.text.trim())
  .map(v=>({book_id:bookId,book,chapter,verse:v.number,text:v.text.replace(/\s+/g,' ').trim()}));
}
export async function lookupAO(key,query,get){
 const p=parseReference(query),id=key.slice(3),verses=[];
 if(p.endChapter-p.chapter>9)throw new Error('Look up at most 10 chapters at a time.');
 const last=p.endVerse??p.verse;
 for(let c=p.chapter;c<=p.endChapter;c++){
  const chapter=(await get('/ao/'+id+'/'+p.book.id+'/'+c)).verses;
  if(c===p.chapter&&p.verse!==null&&!chapter.some(v=>v.verse===p.verse))throw new Error(p.book.english+' '+c+':'+p.verse+' is not in this version.');
  if(c===p.endChapter&&last!==null&&!chapter.some(v=>v.verse===last))throw new Error(p.book.english+' '+c+':'+last+' is not in this version.');
  verses.push(...chapter.filter(v=>(c!==p.chapter||p.verse===null||v.verse>=p.verse)&&(c!==p.endChapter||last===null||v.verse<=last)));
 }
 if(!verses.length)throw new Error('No verses found in that range.');
 return {reference:p.reference,text:verses.map(v=>v.text).join('\n'),verses,translation_id:key};
}

// Pinned versions: shown first in the Bible panel. NKJV and the Yoruba Bible are pinned until changed.
export const PINNED_KEY='wordlight-bible-pinned';
export const DEFAULT_PINNED=[{key:'nkjv',label:'NKJV',name:'New King James Version'},{key:'oycb',label:'OYCB',name:'Open Yoruba Contemporary Bible'}];
export function readPinned(storage){
 try{const list=JSON.parse(storage.getItem(PINNED_KEY)||'null');if(Array.isArray(list))return list.filter(p=>typeof p?.key==='string'&&(AO_KEY.test(p.key)||/^[a-z-]{2,10}$/.test(p.key))&&typeof p.label==='string').slice(0,12).map(p=>({key:p.key,label:p.label.slice(0,20),name:String(p.name||p.label).slice(0,120),credit:typeof p.credit==='string'?p.credit.slice(0,400):''}));}catch{}
 return DEFAULT_PINNED.map(p=>({...p,credit:''}));
}
export function savePinned(storage,list){try{storage.setItem(PINNED_KEY,JSON.stringify(list.slice(0,12)));}catch{}}
