import {cleanLibrary} from './library.mjs';
export const LIBRARY_KEY='wordlight-library',BACKUP_KEY='wordlight-library-backup';
export function libraryTime(library){return Math.max(Number(library?.savedAt)||0,...(library?.shows||[]).map(s=>Number(s.updated)||0));}
export function readLibrary(storage,fallback){
 let problem=false;
 for(const key of [LIBRARY_KEY,BACKUP_KEY]){
  let value;try{value=storage.getItem(key);}catch{throw new Error('Browser storage is unavailable. Export your show to keep a copy.');}
  if(value===null)continue;
  try{return {library:cleanLibrary(JSON.parse(value)),recovered:key===BACKUP_KEY};}catch{problem=true;}
 }
 if(problem)throw new Error('Saved library could not be read. Existing saved data has been kept.');
 const migrated=cleanLibrary(null,fallback);migrated.savedAt=0;migrated.shows.forEach(s=>s.updated=0);return {library:migrated,recovered:false};
}
export function clearLookupCache(storage){
 const keys=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(/^wordlight-(bible-|verse-|dictionary-)/.test(key||''))keys.push(key);}
 keys.forEach(key=>storage.removeItem(key));return keys.length;
}
// Text this module last wrote to each storage. Saves run on every keystroke, and re-parsing and
// validating our own previous write each time was the most expensive part of a save.
const lastWritten=new WeakMap();
export function saveLibrary(storage,library){
 const text=JSON.stringify(library);let previous=null;
 try{previous=storage.getItem(LIBRARY_KEY);if(previous&&previous!==lastWritten.get(storage)){cleanLibrary(JSON.parse(previous));}}catch{previous=null;}
 if(previous&&previous!==text){try{storage.setItem(BACKUP_KEY,previous);}catch{}}
 try{storage.setItem(LIBRARY_KEY,text);}catch{clearLookupCache(storage);storage.setItem(LIBRARY_KEY,text);}
 lastWritten.set(storage,text);
 // The compatibility copy is optional; a full library save is authoritative.
 try{const active=library.shows.find(s=>s.id===library.activeShowId)||library.shows[0];storage.setItem('wordlight-draft',JSON.stringify(active.draft));}catch{}
 return true;
}
export function chooseLocalLibrary(browserLibrary,serverLibrary){return libraryTime(browserLibrary)>libraryTime(serverLibrary)?browserLibrary:serverLibrary;}
