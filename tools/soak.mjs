// A service in fast-forward, to check that Wordlight holds steady over hours: a test companion on its own port, run on a
// copy of a data folder, with OBS-style output pages and stage screens connected, sends a slide every few seconds and
// runs song and verse searches, and reports the companion's memory and the output pages' memory at the start and end.
//   node tools/soak.mjs <data folder copy> [sends=1500] [ms between sends=1000]
// Never point it at the live data folder: it changes the screen of the copy it runs on. Needs Chrome or Edge.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const [dataDir,sendsArg='1500',gapArg='1000']=process.argv.slice(2);
if(!dataDir){console.error('Usage: node tools/soak.mjs <data folder copy> [sends] [ms between sends]');process.exit(1);}
const repo=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),port=18970,debugPort=18972,base='http://127.0.0.1:'+port;
const sends=Number(sendsArg),gap=Number(gapArg),wait=ms=>new Promise(r=>setTimeout(r,ms));
const browserPath=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(Boolean);

const server=spawn(process.execPath,['server.mjs'],{cwd:repo,stdio:'ignore',env:{...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_REMOTE_PORT:String(port+1),WORDLIGHT_REMOTE_BIND:'127.0.0.1',WORDLIGHT_DATA_DIR:dataDir,WORDLIGHT_BIBLE_SEEDS:path.join(dataDir,'no-seeds')}});
for(let i=0;i<200;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await wait(100);}
const profile=await mkdtemp(path.join(tmpdir(),'wordlight-soak-'));
const chrome=spawn(browserPath,['--headless=new','--remote-debugging-port='+debugPort,'--user-data-dir='+profile,'--no-first-run','about:blank'],{stdio:'ignore'});

// One browser tab per output, driven over the DevTools protocol, only to read its memory.
async function tab(url){
 let target;for(let i=0;i<100;i++){try{target=await (await fetch('http://127.0.0.1:'+debugPort+'/json/new?about:blank',{method:'PUT'})).json();break;}catch{await wait(100);}}
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0;const waiting=new Map();ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&waiting.has(m.id)){waiting.get(m.id)(m);waiting.delete(m.id);}});
 const cdp=(method,params={})=>new Promise(r=>{const n=++id;waiting.set(n,r);ws.send(JSON.stringify({id:n,method,params}));});
 await cdp('Performance.enable');await cdp('Page.navigate',{url});
 return {url,async heapMB(){await cdp('HeapProfiler.collectGarbage');const m=(await cdp('Performance.getMetrics')).result.metrics;return +(m.find(x=>x.name==='JSHeapUsedSize').value/1e6).toFixed(1);},close:()=>ws.close()};
}
const health=async()=>(await (await fetch(base+'/api/health')).json()).memory;
const tabs=[];
try{
 for(const view of ['?view=output&obs=1','?view=lower&obs=1','?view=graphics&obs=1','stage'])tabs.push(await tab(base+'/'+view));
 await wait(5000);
 const startServer=await health(),startTabs=await Promise.all(tabs.map(t=>t.heapMB()));
 console.log('start: companion',JSON.stringify(startServer),'| output pages heap MB',startTabs.join(', '));
 const {live,library}=await (await fetch(base+'/api/state')).json();
 const show=library.shows.find(s=>s.id===library.activeShowId)||library.shows[0];
 const queries=['amazing grace','how great is our god','way maker','for god so loved the world','the lord is my shepherd','be still and know'];
 const started=Date.now();let refused=0;
 for(let i=0;i<sends;i++){
  // A new screen: the live deck with the next slide, as the studio's arrows send it.
  const next={...live,index:live.slides.length?i%live.slides.length:0,blank:false,updated:Date.now()};
  const r=await fetch(base+'/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({live:next})});
  if(!r.ok)refused++;
  if(i%10===0){const q=queries[(i/10)%queries.length];await fetch(base+(q.includes('god so')||q.includes('shepherd')||q.includes('still')?'/api/bibles/search?q=':'/api/songs?q=')+encodeURIComponent(q));}
  if(i%100===0&&i)console.log('after',i,'sends:',JSON.stringify(await health()),Math.round((Date.now()-started)/1000)+' s');
  await wait(gap);
 }
 await wait(5000);
 const endServer=await health(),endTabs=await Promise.all(tabs.map(t=>t.heapMB()));
 console.log('end: companion',JSON.stringify(endServer),'| output pages heap MB',endTabs.join(', '),'| sends refused',refused,'| show',JSON.stringify(show?.draft?.title||''));
 console.log('change: companion rss',(endServer.rssMB-startServer.rssMB)+' MB, heap',(endServer.heapMB-startServer.heapMB)+' MB; pages',endTabs.map((v,i)=>(v-startTabs[i]).toFixed(1)).join(', ')+' MB');
}finally{for(const t of tabs)t.close();chrome.kill();server.kill();await wait(800);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300}).catch(()=>{});}
