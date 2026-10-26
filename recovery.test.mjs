// The companion must not start empty when session.json is damaged or missing: it loads the newest good backup.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULT,cleanDraft} from './dist/core.mjs';
import {cleanLibrary} from './dist/library.mjs';
const port=18782,remotePort=18840,root=path.dirname(fileURLToPath(import.meta.url));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const lib=title=>({app:'wordlight',library:cleanLibrary(null,cleanDraft({...DEFAULT,title}))});
function startCompanion(dataDir,env={}){
 return spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_REMOTE_PORT:String(remotePort),WORDLIGHT_REMOTE_BIND:'127.0.0.1',WORDLIGHT_DATA_DIR:dataDir,...env},stdio:'ignore'});
}
async function readState(){for(let i=0;i<50;i++){try{return await (await fetch('http://127.0.0.1:'+port+'/api/state')).json();}catch{await wait(100);}}throw new Error('companion did not start');}
async function stopCompanion(server){if(server.exitCode===null){server.kill();await new Promise(r=>server.once('exit',r));}}
test('A damaged session is kept aside and the newest readable backup is loaded',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-recovery-test-')),backups=path.join(dataDir,'backups');
 await mkdir(backups);
 await writeFile(path.join(backups,'session-2026-10-01T10-00-00-000Z.json'),JSON.stringify(lib('Older backup')));
 await writeFile(path.join(backups,'session-2026-10-02T10-00-00-000Z.json'),JSON.stringify(lib('Newest good backup')));
 await writeFile(path.join(backups,'session-2026-10-03T10-00-00-000Z.json'),'{also broken');
 await writeFile(path.join(dataDir,'session.json'),'{"library":{"format":"wordlight-library","version":1,"shows":[{"id":"x"');
 const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_DATA_DIR:dataDir},stdio:'ignore'});
 try{
  let state;for(let i=0;i<50&&!state;i++){try{state=await (await fetch('http://127.0.0.1:'+port+'/api/state')).json();}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.equal(state.library.shows[0].draft.title,'Newest good backup');
  const files=await readdir(dataDir);assert.ok(files.some(f=>/^session-damaged-.*\.json$/.test(f)),'damaged file kept');
  const kept=files.find(f=>f.startsWith('session-damaged-'));assert.match(await readFile(path.join(dataDir,kept),'utf8'),/"id":"x"/);
  assert.equal(JSON.parse(await readFile(path.join(dataDir,'session.json'),'utf8')).library.shows[0].draft.title,'Newest good backup');
 }finally{server.kill();await new Promise(r=>setTimeout(r,200));await rm(dataDir,{recursive:true,force:true});}
});

test('A missing session.json loads the newest backup, and a valid pairing code is not rewritten',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-recovery-test-')),backups=path.join(dataDir,'backups');
 await mkdir(backups);
 await writeFile(path.join(backups,'session-2026-10-01T10-00-00-000Z.json'),JSON.stringify(lib('Older backup')));
 await writeFile(path.join(backups,'session-2026-10-02T10-00-00-000Z.json'),JSON.stringify(lib('Newest good backup')));
 // Spaces that JSON.stringify would drop show whether the file was written again.
 const bridgeText='{ "code": "ABCD-EFGH-JKLM" }';await writeFile(path.join(dataDir,'bridge.json'),bridgeText);
 const server=startCompanion(dataDir);
 try{
  const state=await readState();
  assert.equal(state.library.shows[0].draft.title,'Newest good backup');
  assert.equal(JSON.parse(await readFile(path.join(dataDir,'session.json'),'utf8')).library.shows[0].draft.title,'Newest good backup');
  assert.equal(await readFile(path.join(dataDir,'bridge.json'),'utf8'),bridgeText);
 }finally{await stopCompanion(server);await rm(dataDir,{recursive:true,force:true});}
});
