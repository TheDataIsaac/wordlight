// Things the operator must hear about once, even though they happened while nobody was looking: an update installed or
// refused at start, or shows opened from a backup because session.json could not be read. The launcher and the server
// add them to <data>/notices.json; the studio shows them in a bar until the operator dismisses each one.
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';

const KEEP=10;
const fileIn=dataDir=>path.join(dataDir,'notices.json');

// strict: a read that fails for any reason but a missing file throws, so a change never saves over notices it could
// not read (a file busy for a moment would otherwise look empty).
async function readList(dataDir,strict){
 let text;
 try{text=await readFile(fileIn(dataDir),'utf8');}catch(err){if(err.code==='ENOENT'||!strict)return [];throw err;}
 try{const list=JSON.parse(text);return Array.isArray(list)?list.filter(n=>n&&typeof n.text==='string'):[];}catch{return [];}
}
export const readNotices=dataDir=>readList(dataDir,false);
async function save(dataDir,list){
 await mkdir(dataDir,{recursive:true});
 const temp=fileIn(dataDir)+'.'+process.pid+'.tmp';
 await writeFile(temp,JSON.stringify(list.slice(-KEEP)));
 // Windows refuses the rename for a moment while the file is being read (the studio asking for notices, an antivirus
 // scan), so it is tried again a few times, as the companion's other saves are.
 for(let attempt=0;;attempt++){
  try{await rename(temp,fileIn(dataDir));return;}
  catch(err){if(attempt>=6||!['EPERM','EBUSY','EACCES'].includes(err.code))throw err;await new Promise(r=>setTimeout(r,60*(attempt+1)));}
 }
}
// kind: 'update' or 'recovery'; level: 'info' or 'warning'.
export async function addNotice(dataDir,{kind,level='info',text}){
 const list=await readList(dataDir,true);
 list.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),at:Date.now(),kind,level,text:String(text).slice(0,500)});
 await save(dataDir,list);
}
export async function dismissNotice(dataDir,id){
 const list=await readList(dataDir,true);
 await save(dataDir,list.filter(n=>n.id!==id));
 return readNotices(dataDir);
}
