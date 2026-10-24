// Phone remote: a second, opt-in web server for phones on the same Wi-Fi or Ethernet network.
// It is off until the operator sets a password and turns it on in the local studio. It serves only the remote page
// and a few remote APIs: read the live screen, browse show/scene/slide titles, and change the screen through
// commitLive (the same save-and-broadcast path the studio uses). Everything else (shows, files, songs, keys,
// settings, OBS) stays on the loopback-only companion. Settings live in <data>/remote.json and can only be changed
// from the loopback companion through handleAdmin.
//
// Contract with server.mjs:
// - getState() returns the companion's current state ({library, live, ...}); it is only read here.
// - commitLive(live) must make live current synchronously (before its first await), save it, then broadcast it,
//   which calls liveChanged(). If saving fails it throws and undoes only its own change, never a newer write from
//   the studio or the web bridge. Commands therefore read the live state and call commitLive in one synchronous
//   step, and answer with getState().live afterwards.
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {readFile,writeFile,rename,mkdir,unlink} from 'node:fs/promises';
import {scrypt,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {snapshot,deckFor,validLive} from './dist/core.mjs';
import {sceneDraft,MAIN_SCENE} from './dist/library.mjs';
import {cleanTimer,changeTimer} from './dist/timer.mjs';
import {cleanLowerThird} from './dist/lowerthird.mjs';

export const REMOTE_PORT=18766;
const SESSION_MS=12*60*60*1000,MAX_SESSIONS=20,MAX_STREAMS=10,MAX_QUEUE=4,PAGE=100;
const SCRYPT={N:16384,r:8,p:1,keylen:32};
const COOKIE='wordlight_remote';

// ---- Passwords: scrypt with a random salt; only the salt and hash are stored ----
function derive(password,salt,params){
 return new Promise((resolve,reject)=>scrypt(password,salt,params.keylen,{N:params.N,r:params.r,p:params.p,maxmem:64*1024*1024},(err,key)=>err?reject(err):resolve(key)));
}
export function passwordProblem(password){
 if(typeof password!=='string')return 'Enter a password.';
 if(password.length<8)return 'Use at least 8 characters.';
 if(password.length>128)return 'Use at most 128 characters.';
 return '';
}
export async function hashPassword(password){
 const salt=randomBytes(16),key=await derive(password,salt,SCRYPT);
 return {algorithm:'scrypt',...SCRYPT,salt:salt.toString('base64'),hash:key.toString('base64')};
}
// A stored hash is used only if it has exactly the settings hashPassword writes. Anything else (an empty hash,
// other scrypt costs, a short salt) is treated as no password, so a damaged file can never accept any password.
export function validStoredPassword(stored){
 if(!stored||typeof stored!=='object'||stored.algorithm!=='scrypt')return false;
 if(stored.N!==SCRYPT.N||stored.r!==SCRYPT.r||stored.p!==SCRYPT.p||stored.keylen!==SCRYPT.keylen)return false;
 const b64=/^[A-Za-z0-9+/]+={0,2}$/;
 if(typeof stored.salt!=='string'||typeof stored.hash!=='string'||!b64.test(stored.salt)||!b64.test(stored.hash))return false;
 return Buffer.from(stored.salt,'base64').length===16&&Buffer.from(stored.hash,'base64').length===SCRYPT.keylen;
}
export async function checkPassword(password,stored){
 if(typeof password!=='string'||password.length>128||!validStoredPassword(stored))return false;
 const expected=Buffer.from(stored.hash,'base64');
 const key=await derive(password,Buffer.from(stored.salt,'base64'),SCRYPT);
 return key.length===SCRYPT.keylen&&timingSafeEqual(key,expected);
}

// ---- Network addresses: physical Wi-Fi/Ethernet private IPv4 only; VPN and virtual adapters are not listed ----
const VIRTUAL=/tailscale|zerotier|hamachi|wireguard|openvpn|vpn|\bwg\d|\btun|\btap|utun|virtual|vmware|vbox|hyper-v|vethernet|docker|wsl|loopback|pseudo|bluetooth|npcap/i;
function privateIPv4(ip){
 const p=String(ip).split('.').map(Number);
 return p.length===4&&(p[0]===10||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168));
}
export function lanAddresses(interfaces=os.networkInterfaces()){
 const list=[];
 for(const [name,addresses] of Object.entries(interfaces||{})){
  if(VIRTUAL.test(name))continue;
  for(const a of addresses||[])if(!a.internal&&(a.family==='IPv4'||a.family===4)&&privateIPv4(a.address))list.push({name,address:a.address});
 }
 const rank=name=>/wi-?fi|wlan|wireless/i.test(name)?0:/ethernet|^en|^eth/i.test(name)?1:2;
 return list.sort((a,b)=>rank(a.name)-rank(b.name));
}
// DNS-rebinding guard: the Host header must name this server by one of its own addresses.
export function hostAllowed(host,port,addresses){
 const match=/^([a-z0-9.-]+):(\d+)$/i.exec(String(host||''));
 if(!match||Number(match[2])!==port)return false;
 const name=match[1].toLowerCase();
 return name==='127.0.0.1'||name==='localhost'||addresses.includes(name);
}

// ---- Bounded helpers ----
// Failed sign-ins per address: 5 failures lock that address for the rest of a 10-minute window. Across all addresses,
// at most 30 failures a minute are checked. The table never holds more than maxEntries addresses.
export function createLoginLimiter({perAddress=5,windowMs=600000,globalPerMinute=30,maxEntries=500}={}){
 const failures=new Map();let globalStart=0,globalCount=0;
 const prune=now=>{for(const [ip,f] of failures)if(now-f.first>windowMs)failures.delete(ip);};
 return {
  blocked(ip,now=Date.now()){
   if(now-globalStart>60000){globalStart=now;globalCount=0;}
   if(globalCount>=globalPerMinute)return 60000-(now-globalStart);
   const f=failures.get(ip);if(!f||now-f.first>windowMs)return 0;
   return f.count>=perAddress?windowMs-(now-f.first):0;
  },
  fail(ip,now=Date.now()){
   globalCount++;
   let f=failures.get(ip);
   if(!f||now-f.first>windowMs){
    failures.delete(ip);
    if(failures.size>=maxEntries)prune(now);
    if(failures.size>=maxEntries)failures.delete(failures.keys().next().value);
    f={first:now,count:0};failures.set(ip,f);
   }
   f.count++;
  },
  succeed(ip){failures.delete(ip);},
  get size(){return failures.size;}
 };
}
// Remembers the result of each recent command id, so a phone that resends after a network drop gets the first
// answer instead of a second change. Oldest entries are dropped first.
export function createCommandLog(limit=200){
 const results=new Map();
 return {
  get:key=>results.get(key),
  set(key,value){results.delete(key);results.set(key,value);while(results.size>limit)results.delete(results.keys().next().value);},
  delete:key=>results.delete(key),
  get size(){return results.size;}
 };
}

// ---- What the phone receives: only the live slide, its neighbours' titles and the timer ----
const clip=(v,n)=>{const s=typeof v==='string'?v:'';return s.length>n?s.slice(0,n-1)+'…':s;};
const brief=(slide,chars)=>slide?{id:String(slide.id||''),title:clip(slide.title,120),text:clip(slide.text,chars)}:null;
export function liveSummary(live){
 const slides=Array.isArray(live?.slides)?live.slides:[],index=Number.isInteger(live?.index)?live.index:0,t=cleanTimer(live?.timer);
 return {
  updated:Number(live?.updated)||0,blank:!!live?.blank,showId:live?.showId||'',showTitle:clip(live?.showTitle,100),
  sceneId:live?.showId?live.sceneId||MAIN_SCENE:'',sceneName:clip(live?.sceneName,80),index,count:slides.length,
  current:brief(slides[index],600),previous:brief(slides[index-1],140),next:brief(slides[index+1],140),
  timer:{mode:t.mode,durationMs:t.durationMs,valueMs:t.valueMs,running:t.running,startedAt:t.startedAt,visible:t.visible},
  serverNow:Date.now()
 };
}
function showList(library){
 const shows=(library?.shows||[]).map(s=>({id:s.id,title:clip(s.draft?.title,100)||'Untitled show',activeSceneId:s.activeSceneId,scenes:(s.scenes||[]).map(c=>({id:c.id,name:clip(c.name,80)}))}));
 return {activeShowId:library?.activeShowId||'',shows};
}

export function createRemote({getState,commitLive,dataDir,root,localOrigins,port=Number(process.env.WORDLIGHT_REMOTE_PORT)||REMOTE_PORT,bind=process.env.WORDLIGHT_REMOTE_BIND==='127.0.0.1'?'127.0.0.1':'0.0.0.0'}){
 const configFile=path.join(dataDir,'remote.json');
 let config={version:1,enabled:false,password:null};
 let server=null,error='',configProblem='',generation=0;
 const sessions=new Map(),streams=new Set(),limiter=createLoginLimiter(),commands=createCommandLog();
 let checking=0,queue=Promise.resolve(),queued=0;

 // A missing file means "never set up". An unreadable file or a malformed password leaves the remote off with no
 // password until a new one is set in the studio (fail closed).
 async function loadConfig(){
  let text;try{text=await readFile(configFile,'utf8');}catch(err){if(err.code!=='ENOENT')configProblem='The phone remote settings could not be read. Set a new password to use the remote.';return;}
  let saved=null;try{saved=JSON.parse(text);}catch{}
  if(!saved||typeof saved!=='object'){configProblem='The phone remote settings file is damaged. Set a new password to use the remote.';return;}
  if(saved.password!=null&&!validStoredPassword(saved.password)){configProblem='The saved phone remote password is damaged. Set a new password to use the remote.';return;}
  config={version:1,enabled:saved.enabled===true&&!!saved.password,password:saved.password||null};
 }
 const loaded=loadConfig();
 async function saveConfig(next){
  await mkdir(dataDir,{recursive:true});
  const tmp=configFile+'.'+process.pid+'.'+Date.now()+'.tmp';
  try{await writeFile(tmp,JSON.stringify(next),'utf8');await rename(tmp,configFile);}catch(err){await unlink(tmp).catch(()=>{});throw err;}
  config=next;configProblem='';
 }
 // Ends every phone session and live stream. Used by password change, sign-out-all and turning the remote off.
 function revokeAll(){generation++;sessions.clear();for(const s of streams)s.res.end();streams.clear();}
 // An open live stream stays only while its session exists, has not expired and was made after the last revoke.
 function streamValid(stream){const s=sessions.get(stream.key);return !!s&&s.expires>=Date.now()&&stream.generation===generation;}
 function endStream(stream){streams.delete(stream);stream.res.end();}

 const tokenKey=token=>createHash('sha256').update(token).digest('hex');
 function sessionFor(req){
  const cookie=String(req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith(COOKIE+'='));
  if(!cookie)return null;
  const key=tokenKey(cookie.slice(COOKIE.length+1)),session=sessions.get(key);
  if(!session)return null;
  if(session.expires<Date.now()){sessions.delete(key);return null;}
  return {key,...session};
 }
 function newSession(){
  const token=randomBytes(32).toString('base64url');
  if(sessions.size>=MAX_SESSIONS)sessions.delete(sessions.keys().next().value);
  sessions.set(tokenKey(token),{expires:Date.now()+SESSION_MS});
  return token;
 }

 const baseHeaders={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Cache-Control':'no-store'};
 function send(res,code,data,extra={}){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8',...baseHeaders,...extra});res.end(JSON.stringify(data));}
 async function readBody(req){
  let body='';for await(const part of req){body+=part;if(body.length>2048)throw Object.assign(new Error('The request is too large.'),{status:413});}
  try{return JSON.parse(body);}catch{throw Object.assign(new Error('Invalid JSON.'),{status:400});}
 }
 // Changes must be JSON from the remote page itself: same origin, and not from another site.
 function mutationProblem(req){
  if(req.method!=='POST')return [405,'Method not allowed.'];
  if(!String(req.headers['content-type']||'').startsWith('application/json'))return [415,'JSON is required.'];
  if(req.headers.origin!=='http://'+req.headers.host)return [403,'This request must come from the remote page.'];
  const site=req.headers['sec-fetch-site'];if(site&&site!=='same-origin')return [403,'This request must come from the remote page.'];
  return null;
 }

 // ---- Commands ----
 function conflict(message,live){return {status:409,body:{error:message,live:liveSummary(live)}};}
 async function execute(body){
  const state=getState(),live=state.live,now=Date.now();let next;
  if(body.action==='next'||body.action==='previous'){
   // The phone sends the screen it saw, so a repeated or late tap never moves past a change made elsewhere.
   if(Number(body.base)!==Number(live.updated||0))return conflict('The screen changed. Check it and tap again.',live);
   if(!live.slides.length)return conflict('Nothing is on screen yet.',live);
   const index=Math.max(0,Math.min(live.slides.length-1,live.index+(body.action==='next'?1:-1)));
   next={...live,index,blank:false};
  }else if(body.action==='blank'){
   if(typeof body.blank!=='boolean')return {status:400,body:{error:'Choose hide or show.'}};
   next={...live,blank:body.blank};
  }else if(body.action==='timer'){
   if(!['start','pause','reset'].includes(body.timer))return {status:400,body:{error:'Unknown timer action.'}};
   next={...live,timer:changeTimer(cleanTimer(live.timer),body.timer,now)};
  }else if(body.action==='send'){
   const show=state.library.shows.find(s=>s.id===body.showId),draft=show&&sceneDraft(show,String(body.sceneId||''));
   if(!draft)return {status:404,body:{error:'That show or scene is no longer there.'}};
   if(!deckFor(draft).some(s=>s.id===body.slideId))return {status:404,body:{error:'That slide is no longer in this scene.'}};
   const scene=show.scenes.find(s=>s.id===body.sceneId);
   next={...snapshot(draft,body.slideId),timer:cleanTimer(live.timer),lowerThird:cleanLowerThird(live.lowerThird),graphics:live.graphics,showId:show.id,showTitle:show.draft.title,sceneId:scene.id,sceneName:scene.name};
  }else return {status:400,body:{error:'Unknown command.'}};
  next.updated=Math.max(now,Number(live.updated||0)+1);
  if(!validLive(next))return {status:500,body:{error:'The new screen was not valid, so nothing changed.'}};
  try{await commitLive(next);}catch{return {status:500,body:{error:'The companion could not save the screen. Nothing changed.'}};}
  // The studio may have sent a newer screen while this one was being saved; answer with whatever is live now.
  return {status:200,body:{ok:true,live:liveSummary(getState().live)}};
 }
 // Commands run one at a time, at most MAX_QUEUE waiting. A repeated id returns the first result.
 function command(session,body){
  if(typeof body?.id!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(body.id))return Promise.resolve({status:400,body:{error:'Missing command id.'}});
  const key=session.key+':'+body.id,seen=commands.get(key);if(seen)return seen;
  if(queued>=MAX_QUEUE)return Promise.resolve({status:429,body:{error:'Too many commands at once. Wait a moment.'}});
  queued++;
  const run=queue.then(()=>execute(body)).catch(()=>({status:500,body:{error:'The command failed. Nothing changed.'}})).then(result=>{
   queued--;
   // A failed save may be retried with the same id.
   if(result.status>=500)commands.delete(key);
   return result;
  });
  queue=run;commands.set(key,run);return run;
 }

 // ---- Remote server (LAN) ----
 async function serveFile(res,name,type,method){
  try{
   const body=await readFile(path.join(root,'dist',name));
   const csp="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
   res.writeHead(200,{'Content-Type':type,...baseHeaders,'Cache-Control':'no-cache','Content-Security-Policy':csp});res.end(method==='HEAD'?undefined:body);
  }catch{send(res,404,{error:'Not found'});}
 }
 const files={'/remote':['remote.html','text/html; charset=utf-8'],'/remote.mjs':['remote.mjs','text/javascript; charset=utf-8'],'/remote.css':['remote.css','text/css; charset=utf-8']};
 async function handle(req,res){
  const own=bind==='127.0.0.1'?[]:lanAddresses().map(a=>a.address),local=String(req.socket.localAddress||'').replace(/^::ffff:/,'');
  if(!hostAllowed(req.headers.host,port,own)||!(local==='127.0.0.1'||own.includes(local))){send(res,403,{error:'Use the address shown in Wordlight.'});return;}
  let url;try{url=new URL(req.url,'http://'+req.headers.host);}catch{send(res,400,{error:'Invalid URL'});return;}
  const p=url.pathname;
  if((req.method==='GET'||req.method==='HEAD')&&files[p]){await serveFile(res,...files[p],req.method);return;}
  if(req.method==='GET'&&(p==='/'||p==='/remote/')){res.writeHead(302,{Location:'/remote',...baseHeaders});res.end();return;}
  if(!p.startsWith('/remote/api/')){send(res,404,{error:'Not found'});return;}
  const ip=String(req.socket.remoteAddress||'');
  if(p==='/remote/api/login'){
   const problem=mutationProblem(req);if(problem){send(res,problem[0],{error:problem[1]});return;}
   const wait=limiter.blocked(ip);if(wait){send(res,429,{error:'Too many wrong passwords. Try again in '+Math.ceil(wait/60000)+' min.'},{'Retry-After':String(Math.ceil(wait/1000))});return;}
   if(checking>=2){send(res,429,{error:'Busy. Try again in a moment.'});return;}
   let body;try{body=await readBody(req);}catch(err){send(res,err.status,{error:err.message});return;}
   const stored=config.password,started=generation;
   checking++;let ok=false;try{ok=!!stored&&await checkPassword(body?.password,stored);}catch{}finally{checking--;}
   if(!ok){limiter.fail(ip);send(res,401,{error:'Wrong password.'});return;}
   // The password may have changed, or the remote been turned off, while this one was being checked.
   if(started!==generation||config.password!==stored||!server){send(res,401,{error:'The password changed. Try again.'});return;}
   limiter.succeed(ip);
   const token=newSession();
   send(res,200,{ok:true},{'Set-Cookie':COOKIE+'='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+SESSION_MS/1000});return;
  }
  const session=sessionFor(req);
  if(!session){send(res,401,{error:'Sign in first.'});return;}
  if(p==='/remote/api/logout'){
   const problem=mutationProblem(req);if(problem){send(res,problem[0],{error:problem[1]});return;}
   sessions.delete(session.key);for(const s of streams)if(s.key===session.key){s.res.end();streams.delete(s);}
   send(res,200,{ok:true},{'Set-Cookie':COOKIE+'=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});return;
  }
  if(p==='/remote/api/command'){
   const problem=mutationProblem(req);if(problem){send(res,problem[0],{error:problem[1]});return;}
   let body;try{body=await readBody(req);}catch(err){send(res,err.status,{error:err.message});return;}
   const result=await command(session,body);send(res,result.status,result.body);return;
  }
  if(req.method!=='GET'){send(res,405,{error:'Method not allowed.'});return;}
  const state=getState();
  if(p==='/remote/api/live'){send(res,200,liveSummary(state.live));return;}
  if(p==='/remote/api/shows'){send(res,200,showList(state.library));return;}
  if(p==='/remote/api/slides'){
   const show=state.library.shows.find(s=>s.id===url.searchParams.get('show')),sceneId=url.searchParams.get('scene')||show?.activeSceneId,draft=show&&sceneDraft(show,sceneId);
   if(!draft){send(res,404,{error:'That show or scene is no longer there.'});return;}
   const deck=deckFor(draft),offset=Math.max(0,Math.floor(Number(url.searchParams.get('offset'))||0));
   send(res,200,{showId:show.id,sceneId,total:deck.length,offset,slides:deck.slice(offset,offset+PAGE).map(s=>({id:s.id,title:clip(s.title,80),text:clip(s.text,120)}))});return;
  }
  if(p==='/remote/api/events'){
   if(streams.size>=MAX_STREAMS){send(res,503,{error:'Too many phones are connected.'});return;}
   res.writeHead(200,{'Content-Type':'text/event-stream',...baseHeaders,'Cache-Control':'no-cache','Connection':'keep-alive'});
   res.write('retry: 3000\n\ndata: '+JSON.stringify(liveSummary(state.live))+'\n\n');
   const stream={res,key:session.key,generation};streams.add(stream);
   // The keepalive also ends the stream once its session has expired or been revoked.
   const heartbeat=setInterval(()=>{if(!streamValid(stream)){endStream(stream);return;}res.write(': keepalive\n\n');},25000);
   req.on('close',()=>{clearInterval(heartbeat);streams.delete(stream);});return;
  }
  send(res,404,{error:'Not found'});
 }

 function start(){
  if(server||!config.enabled||!config.password)return Promise.resolve();
  error='';
  return new Promise(resolve=>{
   const s=http.createServer((req,res)=>{handle(req,res).catch(()=>{if(!res.headersSent)send(res,500,{error:'The remote hit an error. Try again.'});else res.end();});});
   s.on('error',err=>{error=err.code==='EADDRINUSE'?'Port '+port+' is already in use, so the phone remote could not start.':'The phone remote could not start: '+err.message;if(server===s)server=null;resolve();});
   s.listen(port,bind,()=>{server=s;console.log('Phone remote is on, port '+port+'.');resolve();});
  });
 }
 function stop(){
  revokeAll();
  if(!server)return Promise.resolve();
  const s=server;server=null;
  return new Promise(resolve=>{s.close(()=>resolve());s.closeAllConnections?.();});
 }

 // ---- Loopback-only settings, called from the main companion's /api/remote/* routes ----
 function status(){
  const urls=bind==='127.0.0.1'?[{name:'This computer',address:'127.0.0.1'}]:lanAddresses();
  return {enabled:config.enabled,hasPassword:!!config.password,running:!!server,port,error:configProblem||error,phones:streams.size,urls:urls.map(a=>({name:a.name,url:'http://'+a.address+':'+port+'/remote'}))};
 }
 async function handleAdmin(req,res,url){
  await loaded;
  const origin=req.headers.origin;if(origin&&!localOrigins().includes(origin)){send(res,403,{error:'Phone remote settings are only available in the local studio.'});return;}
  if(url.pathname==='/api/remote/status'&&req.method==='GET'){send(res,200,status());return;}
  if(req.method!=='POST'){send(res,405,{error:'Method not allowed.'});return;}
  if(!String(req.headers['content-type']||'').startsWith('application/json')){send(res,415,{error:'JSON is required.'});return;}
  let body;try{body=await readBody(req);}catch(err){send(res,err.status,{error:err.message});return;}
  try{
   if(url.pathname==='/api/remote/password'){
    const problem=passwordProblem(body?.password);if(problem){send(res,400,{error:problem});return;}
    await saveConfig({...config,password:await hashPassword(body.password)});
    revokeAll();send(res,200,status());return;
   }
   if(url.pathname==='/api/remote/enabled'){
    if(typeof body?.enabled!=='boolean'){send(res,400,{error:'Choose on or off.'});return;}
    if(body.enabled&&!config.password){send(res,409,{error:'Set a password first.'});return;}
    await saveConfig({...config,enabled:body.enabled});
    if(body.enabled)await start();else await stop();
    send(res,200,status());return;
   }
   if(url.pathname==='/api/remote/signout'){revokeAll();send(res,200,status());return;}
  }catch{send(res,500,{error:'The phone remote settings could not be saved.'});return;}
  send(res,404,{error:'Not found'});
 }
 function liveChanged(live){
  if(!streams.size)return;
  const message='data: '+JSON.stringify(liveSummary(live))+'\n\n';
  for(const s of streams){if(streamValid(s))s.res.write(message);else endStream(s);}
 }
 return {
  async start(){await loaded;await start();},
  handleAdmin,liveChanged,close:stop,
  // Settles when every command already queued has finished (used when Wordlight quits).
  idle:()=>queue.catch(()=>{})
 };
}
