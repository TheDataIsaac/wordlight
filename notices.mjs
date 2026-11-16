// Things the operator must hear about once, even though they happened while nobody was looking: an update installed or
// refused at start, or shows opened from a backup because session.json could not be read. The launcher and the server
// add them to <data>/notices.json; the studio shows them in a bar until the operator dismisses each one.
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';

const KEEP=10;
const fileIn=dataDir=>path.join(dataDir,'notices.json');

export async function readNotices(dataDir){
 try{const list=JSON.parse(await readFile(fileIn(dataDir),'utf8'));return Array.isArray(list)?list.filter(n=>n&&typeof n.text==='string'):[];}catch{return [];}
}
async function save(dataDir,list){
 await mkdir(dataDir,{recursive:true});
 const temp=fileIn(dataDir)+'.'+process.pid+'.tmp';
 await writeFile(temp,JSON.stringify(list.slice(-KEEP)));await rename(temp,fileIn(dataDir));
}
// kind: 'update' or 'recovery'; level: 'info' or 'warning'.
export async function addNotice(dataDir,{kind,level='info',text}){
 const list=await readNotices(dataDir);
 list.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),at:Date.now(),kind,level,text:String(text).slice(0,500)});
 await save(dataDir,list);
}
export async function dismissNotice(dataDir,id){
 const list=await readNotices(dataDir);
 await save(dataDir,list.filter(n=>n.id!==id));
 return readNotices(dataDir);
}
