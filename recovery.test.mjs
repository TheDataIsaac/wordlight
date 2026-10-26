// The companion must not start empty when session.json is damaged: it keeps the damaged file and loads the newest good backup.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULT,cleanDraft} from './dist/core.mjs';
import {cleanLibrary} from './dist/library.mjs';
const port=18782,root=path.dirname(fileURLToPath(import.meta.url));
test('A damaged session is kept aside and the newest readable backup is loaded',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-recovery-test-')),backups=path.join(dataDir,'backups');
 await mkdir(backups);
 const lib=title=>({app:'wordlight',library:cleanLibrary(null,cleanDraft({...DEFAULT,title}))});
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
