// Phone remote: starts the real companion on test ports with a throwaway data folder and synthetic shows.
// The remote listens on 127.0.0.1 here (WORDLIGHT_REMOTE_BIND) so tests never open a network port.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import {cleanTextSlide,snapshot,validLive} from './dist/core.mjs';
import {createShow,addScene} from './dist/library.mjs';
import {cleanTimer} from './dist/timer.mjs';
import {createLoginLimiter,createCommandLog,lanAddresses,hostAllowed,liveSummary,checkPassword,hashPassword,validStoredPassword} from './remote-server.mjs';
import {rsEcc,formatBits,qrMatrix,qrSvg} from './dist/qr.mjs';

const port=18828,remotePort=18829,remoteHost='127.0.0.1:'+remotePort,remoteOrigin='http://'+remoteHost;
const cwd=path.dirname(fileURLToPath(import.meta.url));
let server,dataDir,password='sample pass 1';
const wait=ms=>new Promise(r=>setTimeout(r,ms));

function request(targetPort,method,pathname,{headers={},body,raw}={}){
 return new Promise((resolve,reject)=>{
  const data=raw!==undefined?raw:body===undefined?undefined:JSON.stringify(body);
  const req=http.request({host:'127.0.0.1',port:targetPort,method,path:pathname,headers:{Host:'127.0.0.1:'+targetPort,...(data!==undefined&&raw===undefined?{'Content-Type':'application/json'}:{}),...(data!==undefined?{'Content-Length':Buffer.byteLength(data)}:{}),...headers}},res=>{
   let text='';res.on('data',c=>text+=c);res.on('end',()=>{let json=null;try{json=JSON.parse(text);}catch{}resolve({status:res.statusCode,headers:res.headers,body:json,text});});
  });
  req.on('error',reject);if(data!==undefined)req.write(data);req.end();
 });
}
const admin=(method,p,body,headers={})=>request(port,method,'/api/remote/'+p,{body,headers:{Origin:'http://127.0.0.1:'+port,...headers}});
const remote=(method,p,{body,cookie,headers={}}={})=>request(remotePort,method,p,{body,headers:{...(method==='POST'?{Origin:remoteOrigin}:{}),...(cookie?{Cookie:cookie}:{}),...headers}});
const state=async()=>(await request(port,'GET','/api/state')).body;
async function login(pass=password){
 const r=await remote('POST','/remote/api/login',{body:{password:pass}});
 assert.equal(r.status,200,JSON.stringify(r.body));
 return r.headers['set-cookie'][0].split(';')[0];
}
let commandCount=0;
const command=(cookie,body,id='cmd-'+(++commandCount)+'-'+Date.now())=>remote('POST','/remote/api/command',{cookie,body:{id,...body}});
// Opens an event stream and collects its messages.
function stream(targetPort,pathname,headers={}){
 return new Promise((resolve,reject)=>{
  const req=http.get({host:'127.0.0.1',port:targetPort,path:pathname,headers:{Host:'127.0.0.1:'+targetPort,...headers}},res=>{
   const messages=[];let buffer='';
   const ended=new Promise(done=>res.on('close',done));
   res.on('data',c=>{buffer+=c;let i;while((i=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,i);buffer=buffer.slice(i+2);const line=block.split('\n').find(l=>l.startsWith('data: '));if(line)messages.push(JSON.parse(line.slice(6)));}});
   resolve({status:res.statusCode,messages,ended,close:()=>req.destroy()});
  });
  req.on('error',reject);
 });
}
async function until(check,ms=2000){for(let i=0;i<ms/20;i++){if(await check())return true;await wait(20);}return false;}
const portOpen=targetPort=>new Promise(resolve=>{const req=http.get({host:'127.0.0.1',port:targetPort,path:'/remote',headers:{Host:'127.0.0.1:'+targetPort}},res=>{res.resume();resolve(true);});req.on('error',()=>resolve(false));});

async function startServer(){
 server=spawn(process.execPath,['server.mjs'],{cwd,env:{...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_REMOTE_PORT:String(remotePort),WORDLIGHT_REMOTE_BIND:'127.0.0.1',WORDLIGHT_DATA_DIR:dataDir},stdio:'ignore'});
 assert.ok(await until(async()=>{try{return (await request(port,'GET','/api/remote/status')).status===200;}catch{return false;}},5000),'companion did not start');
}
async function stopServer(){server.kill();await new Promise(r=>server.once('exit',r));}

// Synthetic fixture: two shows; the first has two scenes. Live shows scene 1, slide 1, with a timer and lower third set.
const slide=(id,heading,body)=>cleanTextSlide({id,heading,body});
let fixture;
before(async()=>{
 dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-remote-test-'));
 const service=createShow('Sample service');service.draft.textSlides=[slide('w','Welcome','Sample welcome text'),slide('a','Announcements','Sample notice one'),slide('c','Closing','Sample closing words')];
 const sermon=addScene(service,'Sermon');sermon.draft.textSlides=[slide('s1','Point one','Sample point one'),slide('s2','Point two','Sample point two '+'long text '.repeat(200))];
 const other=createShow('Sample evening');other.draft.textSlides=[slide('e','Evening','Sample evening text')];
 const library={format:'wordlight-library',version:1,activeShowId:service.id,shows:[service,other]};
 const live={...snapshot(service.draft,'text-w'),blank:false,timer:cleanTimer({durationMs:120000}),lowerThird:{height:280},showId:service.id,showTitle:'Sample service',sceneId:service.activeSceneId,sceneName:'Scene 1'};
 assert.ok(validLive(live));
 fixture={service,sermon,other};
 await mkdir(dataDir,{recursive:true});await writeFile(path.join(dataDir,'session.json'),JSON.stringify({app:'wordlight',library,live}));
 await startServer();
});
after(async()=>{await stopServer();await rm(dataDir,{recursive:true,force:true});});

test('The remote is off by default: no password, nothing listening, and it cannot be turned on without a password',async()=>{
 const s=(await admin('GET','status')).body;
 assert.equal(s.enabled,false);assert.equal(s.hasPassword,false);assert.equal(s.running,false);
 assert.equal(await portOpen(remotePort),false);
 assert.equal((await admin('POST','enabled',{enabled:true})).status,409);
 assert.equal(await portOpen(remotePort),false);
});

test('Remote settings answer only the local studio',async()=>{
 assert.equal((await admin('GET','status',undefined,{Origin:'https://evil.example'})).status,403);
 assert.equal((await admin('POST','password',{password:'evil password'},{Origin:'https://studio.example.org'})).status,403);
 assert.equal((await request(port,'GET','/api/remote/status',{headers:{Host:'192.168.1.20:'+port}})).status,403);
 assert.equal((await request(port,'POST','/api/remote/password',{raw:'password=evilpassword',headers:{'Content-Type':'application/x-www-form-urlencoded'}})).status,415);
 assert.equal((await admin('GET','status')).body.hasPassword,false);
});

test('The password is stored only as a salted scrypt hash and is never returned',async()=>{
 assert.equal((await admin('POST','password',{password:'short'})).status,400);
 const first=await admin('POST','password',{password});
 assert.equal(first.status,200);assert.equal(first.body.hasPassword,true);
 assert.ok(!first.text.includes(password));assert.ok(!/hash|salt/i.test(first.text));
 const saved=JSON.parse(await readFile(path.join(dataDir,'remote.json'),'utf8'));
 assert.ok(!JSON.stringify(saved).includes(password));
 assert.equal(saved.password.algorithm,'scrypt');assert.ok(validStoredPassword(saved.password));
 assert.equal(Buffer.from(saved.password.salt,'base64').length,16);
 assert.equal(saved.enabled,false);
 // Setting it again uses a new salt.
 await admin('POST','password',{password});
 const again=JSON.parse(await readFile(path.join(dataDir,'remote.json'),'utf8'));
 assert.notEqual(again.password.salt,saved.password.salt);assert.notEqual(again.password.hash,saved.password.hash);
 // The password file is outside dist/ and the session file has no remote settings.
 assert.ok(!(await readFile(path.join(dataDir,'session.json'),'utf8')).includes('scrypt'));
});

test('Turning it on serves only the remote page; the page itself holds no show data',async()=>{
 const on=await admin('POST','enabled',{enabled:true});
 assert.equal(on.status,200);assert.equal(on.body.running,true);assert.ok(on.body.urls.length>=1);
 assert.ok(on.body.urls.every(u=>/^http:\/\/[\d.]+:18829\/remote$/.test(u.url)));
 const page=await remote('GET','/remote');
 assert.equal(page.status,200);assert.match(page.headers['content-security-policy'],/default-src 'none'/);
 assert.equal(page.headers['x-frame-options'],'DENY');
 assert.ok(!page.text.includes('Sample'));
 for(const file of ['/remote.mjs','/remote.css'])assert.equal((await remote('GET',file)).status,200,file);
});

test('Without signing in, nothing can be read or changed, and no studio route exists on the remote port',async()=>{
 for(const p of ['/remote/api/live','/remote/api/shows','/remote/api/slides','/remote/api/events'])assert.equal((await remote('GET',p)).status,401,p);
 assert.equal((await remote('POST','/remote/api/command',{body:{id:'unsigned-1',action:'blank',blank:true}})).status,401);
 for(const p of ['/api/state','/api/events','/api/remote/status','/api/songs','/api/assets','/api/bible/status','/api/bridge/code','/index.html','/app.js','/qr.mjs','/remote-setup.mjs','/remote/../api/state'])assert.equal((await remote('GET',p)).status,404,p);
 assert.equal((await remote('POST','/api/remote/password',{body:{password:'takeover pass'}})).status,404);
 assert.equal((await remote('POST','/api/state',{body:{live:null}})).status,404);
 // DNS rebinding: a request naming another host is refused.
 assert.equal((await remote('GET','/remote',{headers:{Host:'evil.example:'+remotePort}})).status,403);
 assert.equal((await state()).live.blank,false);
});

test('Sign-in needs JSON from the remote page itself and sets an HttpOnly SameSite cookie',async()=>{
 assert.equal((await request(remotePort,'POST','/remote/api/login',{raw:'password='+encodeURIComponent(password),headers:{Origin:remoteOrigin,'Content-Type':'application/x-www-form-urlencoded'}})).status,415);
 assert.equal((await request(remotePort,'POST','/remote/api/login',{body:{password}})).status,403,'missing Origin');
 assert.equal((await remote('POST','/remote/api/login',{body:{password},headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await remote('POST','/remote/api/login',{body:{password},headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
 assert.equal((await remote('POST','/remote/api/login',{body:{password:'wrong password'}})).status,401);
 const ok=await remote('POST','/remote/api/login',{body:{password}});
 assert.equal(ok.status,200);
 const cookie=ok.headers['set-cookie'][0];
 assert.match(cookie,/^wordlight_remote=[A-Za-z0-9_-]{40,};/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Max-Age=43200/);
 assert.deepEqual(ok.body,{ok:true});
 assert.equal((await remote('GET','/remote/api/live',{cookie:cookie.split(';')[0]})).status,200);
});

test('Browsing shows, scenes and slides never changes the studio preview or the screen; replies stay small',async t=>{
 const cookie=await login(),before=await state();
 const shows=await remote('GET','/remote/api/shows',{cookie});
 assert.equal(shows.status,200);
 assert.deepEqual(shows.body.shows.map(s=>s.title),['Sample service','Sample evening']);
 assert.deepEqual(shows.body.shows[0].scenes.map(s=>s.name),['Scene 1','Sermon']);
 assert.ok(!('draft' in shows.body.shows[0])&&!shows.text.includes('Sample welcome text'));
 const slides=await remote('GET','/remote/api/slides?show='+fixture.service.id+'&scene='+fixture.sermon.id,{cookie});
 // The long second slide continues on three more pages.
 assert.equal(slides.status,200);assert.equal(slides.body.total,5);
 assert.deepEqual(slides.body.slides.map(s=>s.id),['text-s1','text-s2','text-s2-page-1','text-s2-page-2','text-s2-page-3']);
 assert.ok(slides.body.slides[1].text.length<=120);
 assert.equal((await remote('GET','/remote/api/slides?show=nope',{cookie})).status,404);
 const live=await remote('GET','/remote/api/live',{cookie});
 assert.equal(live.body.current.id,'text-w');assert.equal(live.body.next.title,'Announcements');
 const after=await state();
 assert.equal(JSON.stringify(after.library),JSON.stringify(before.library));assert.equal(JSON.stringify(after.live),JSON.stringify(before.live));
 t.diagnostic('bytes: live '+live.text.length+', shows '+shows.text.length+', slides page '+slides.text.length);
});

test('Send to live uses the chosen scene, keeps timer and lower third, and reaches OBS outputs and phones',async()=>{
 const cookie=await login(),before=await state();
 const output=await stream(port,'/api/events?view=output'),phone=await stream(remotePort,'/remote/api/events',{Cookie:cookie});
 assert.equal(phone.status,200);
 assert.ok(await until(()=>output.messages.length===1&&phone.messages.length===1));
 const r=await command(cookie,{action:'send',showId:fixture.service.id,sceneId:fixture.sermon.id,slideId:'text-s2'});
 assert.equal(r.status,200,JSON.stringify(r.body));
 const now=(await state()).live;
 assert.equal(now.sceneId,fixture.sermon.id);assert.equal(now.sceneName,'Sermon');assert.equal(now.slides[now.index].id,'text-s2');assert.equal(now.blank,false);
 assert.deepEqual(now.timer,before.live.timer);assert.equal(now.lowerThird.height,280);
 assert.ok(now.updated>before.live.updated);
 // The studio's own library, active scene and preview are untouched.
 assert.equal(JSON.stringify((await state()).library),JSON.stringify(before.library));
 assert.ok(await until(()=>output.messages.length===2&&phone.messages.length===2));
 assert.equal(output.messages[1].live.updated,now.updated);
 assert.equal(phone.messages[1].updated,now.updated);assert.equal(phone.messages[1].current.id,'text-s2');
 assert.ok(phone.messages[1].current.text.length<=600);
 assert.equal((await command(cookie,{action:'send',showId:fixture.service.id,sceneId:fixture.sermon.id,slideId:'text-missing'})).status,404);
 assert.equal((await command(cookie,{action:'send',showId:fixture.other.id,sceneId:'not-a-scene',slideId:'text-e'})).status,404);
 output.close();phone.close();
});

test('Next and previous: a resent command id is applied once and a stale screen is refused',async()=>{
 const cookie=await login();
 await command(cookie,{action:'send',showId:fixture.service.id,sceneId:fixture.service.activeSceneId,slideId:'text-w'});
 let live=(await state()).live;
 const first=await command(cookie,{action:'next',base:live.updated},'retry-next-0001');
 assert.equal(first.status,200);assert.equal(first.body.live.index,1);
 // The same id again (a network retry) answers the same and does not move a second time.
 const repeat=await command(cookie,{action:'next',base:live.updated},'retry-next-0001');
 assert.deepEqual(repeat.body,first.body);
 assert.equal((await state()).live.index,1);
 // A new tap carrying the old screen is refused instead of jumping.
 const stale=await command(cookie,{action:'next',base:live.updated});
 assert.equal(stale.status,409);assert.equal(stale.body.live.index,1);
 assert.equal((await state()).live.index,1);
 live=(await state()).live;
 assert.equal((await command(cookie,{action:'previous',base:live.updated})).body.live.index,0);
 live=(await state()).live;
 assert.equal((await command(cookie,{action:'previous',base:live.updated})).body.live.index,0,'stays on the first slide');
 assert.equal((await command(cookie,{action:'next'},'short')).status,400,'id too short');
 assert.equal((await command(cookie,{action:'jump'})).status,400);
});

test('Hide/show and the countdown go through the same live state',async()=>{
 const cookie=await login();
 assert.equal((await command(cookie,{action:'blank',blank:true})).status,200);
 assert.equal((await state()).live.blank,true);
 assert.equal((await command(cookie,{action:'blank'})).status,400);
 assert.equal((await command(cookie,{action:'blank',blank:false})).status,200);
 assert.equal((await state()).live.blank,false);
 assert.equal((await command(cookie,{action:'timer',timer:'start'})).status,200);
 let t=(await state()).live.timer;assert.equal(t.running,true);assert.ok(t.startedAt>0);
 await wait(30);
 assert.equal((await command(cookie,{action:'timer',timer:'pause'})).body.live.timer.running,false);
 t=(await state()).live.timer;assert.equal(t.running,false);assert.ok(t.valueMs<120000);
 await command(cookie,{action:'timer',timer:'reset'});
 t=(await state()).live.timer;assert.equal(t.valueMs,120000);assert.equal(t.mode,'countdown');
 assert.equal((await command(cookie,{action:'timer',timer:'show'})).status,400,'only start, pause and reset');
 assert.equal((await command(cookie,{action:'timer',timer:'start'})).status,200);
});

test('Closing the phone or losing the connection leaves the screen alone; a reconnect gets the latest screen',async()=>{
 const cookie=await login(),before=(await state()).live;
 const phone=await stream(remotePort,'/remote/api/events',{Cookie:cookie});
 assert.ok(await until(()=>phone.messages.length===1));
 phone.close();await wait(150);
 const after=(await state()).live;
 assert.equal(after.updated,before.updated);assert.equal(after.blank,false);assert.equal(after.timer.running,true);
 // Meanwhile the studio changes the screen; the next connection starts with it.
 await request(port,'POST','/api/state',{body:{live:{...after,index:2,updated:Date.now()+5}},headers:{Origin:'http://127.0.0.1:'+port}});
 const again=await stream(remotePort,'/remote/api/events',{Cookie:cookie});
 assert.ok(await until(()=>again.messages.length===1));
 assert.equal(again.messages[0].index,2);assert.equal(again.messages[0].updated,(await state()).live.updated);
 again.close();
});

test('Changing the password, signing out and turning off end sessions, including open live streams',async()=>{
 const a=await login();
 const open=await stream(remotePort,'/remote/api/events',{Cookie:a});
 assert.ok(await until(()=>open.messages.length===1));
 password='another pass 2';
 assert.equal((await admin('POST','password',{password})).status,200);
 await Promise.race([open.ended,wait(1000).then(()=>assert.fail('stream stayed open'))]);
 assert.equal((await remote('GET','/remote/api/live',{cookie:a})).status,401);
 assert.equal((await remote('POST','/remote/api/login',{body:{password:'sample pass 1'}})).status,401);
 const b=await login();
 assert.equal((await admin('POST','signout',{})).status,200);
 assert.equal((await remote('GET','/remote/api/live',{cookie:b})).status,401);
 const c=await login();
 assert.equal((await remote('POST','/remote/api/logout',{cookie:c,body:{}})).status,200);
 assert.equal((await remote('GET','/remote/api/live',{cookie:c})).status,401);
 const d=await login();
 assert.equal((await admin('POST','enabled',{enabled:false})).body.running,false);
 assert.equal(await portOpen(remotePort),false);
 assert.equal((await admin('POST','enabled',{enabled:true})).body.running,true);
 assert.equal((await remote('GET','/remote/api/live',{cookie:d})).status,401);
 // Turning the remote off or on never touched the screen.
 assert.equal((await state()).live.blank,false);
});

test('Many commands at once are answered or refused, never left growing',async()=>{
 const cookie=await login();
 const results=await Promise.all([...Array(12)].map((_,i)=>command(cookie,{action:'blank',blank:i%2===0})));
 assert.ok(results.every(r=>r.status===200||r.status===429),results.map(r=>r.status).join());
 assert.equal((await command(cookie,{action:'blank',blank:false})).status,200);
 assert.equal((await state()).live.blank,false);
});

test('A damaged or tampered password file leaves the remote off until a new password is set',async()=>{
 await stopServer();
 const file=path.join(dataDir,'remote.json'),good=JSON.parse(await readFile(file,'utf8'));
 assert.equal(good.enabled,true);
 for(const bad of [{...good.password,hash:''},{...good.password,N:2},{...good.password,salt:'AAAA'},{algorithm:'scrypt'}]){
  assert.equal(validStoredPassword(bad),false);assert.equal(await checkPassword('',bad),false);assert.equal(await checkPassword(password,bad),false);
 }
 await writeFile(file,JSON.stringify({...good,password:{...good.password,hash:''}}));
 await startServer();
 let s=(await admin('GET','status')).body;
 assert.equal(s.enabled,false);assert.equal(s.hasPassword,false);assert.match(s.error,/damaged/);
 assert.equal(await portOpen(remotePort),false);
 await stopServer();
 await writeFile(file,'{not json');
 await startServer();
 s=(await admin('GET','status')).body;assert.equal(s.hasPassword,false);assert.match(s.error,/damaged/);
 assert.equal((await admin('POST','password',{password})).status,200);
 s=(await admin('POST','enabled',{enabled:true})).body;assert.equal(s.running,true);assert.equal(s.error,'');
 // A restart with a good file starts the remote again by itself.
 await stopServer();await startServer();
 assert.ok(await until(()=>portOpen(remotePort)));
 await login();
});

test('Repeated wrong passwords lock that address for a while',async()=>{
 for(let i=0;i<5;i++)assert.equal((await remote('POST','/remote/api/login',{body:{password:'wrong '+i+' pass'}})).status,401);
 const locked=await remote('POST','/remote/api/login',{body:{password}});
 assert.equal(locked.status,429);assert.ok(Number(locked.headers['retry-after'])>0);
});

test('Helpers: bounded tables, network address choice, host check, trimmed live summary',async()=>{
 const limiter=createLoginLimiter({maxEntries:50,globalPerMinute:1e9});
 for(let i=0;i<1000;i++)limiter.fail('10.0.'+Math.floor(i/250)+'.'+(i%250),1000);
 assert.ok(limiter.size<=50);
 const small=createLoginLimiter({perAddress:2,windowMs:1000,globalPerMinute:1e9});
 small.fail('a',0);assert.equal(small.blocked('a',10),0);small.fail('a',10);assert.ok(small.blocked('a',20)>0);assert.equal(small.blocked('a',2000),0);
 const log=createCommandLog(5);for(let i=0;i<50;i++)log.set('k'+i,i);assert.equal(log.size,5);assert.equal(log.get('k49'),49);assert.equal(log.get('k0'),undefined);
 const found=lanAddresses({
  Tailscale:[{family:'IPv4',address:'100.101.102.103',internal:false}],
  'vEthernet (WSL)':[{family:'IPv4',address:'172.20.0.1',internal:false}],
  'Ethernet 2':[{family:'IPv4',address:'10.0.0.8',internal:false}],
  'Wi-Fi':[{family:'IPv6',address:'fe80::1',internal:false},{family:'IPv4',address:'192.168.1.23',internal:false},{family:'IPv4',address:'169.254.3.4',internal:false}],
  'Loopback Pseudo-Interface 1':[{family:'IPv4',address:'127.0.0.1',internal:true}],
  'ZeroTier One':[{family:'IPv4',address:'10.147.17.5',internal:false}]
 });
 assert.deepEqual(found,[{name:'Wi-Fi',address:'192.168.1.23'},{name:'Ethernet 2',address:'10.0.0.8'}]);
 assert.equal(hostAllowed('192.168.1.23:18766',18766,['192.168.1.23']),true);
 assert.equal(hostAllowed('192.168.1.23:18765',18766,['192.168.1.23']),false);
 assert.equal(hostAllowed('evil.example:18766',18766,['192.168.1.23']),false);
 assert.equal(hostAllowed('100.101.102.103:18766',18766,['192.168.1.23']),false);
 const live={...snapshot({...fixture.service.draft},'text-w'),blank:false};live.slides[0]={...live.slides[0],text:'x'.repeat(5000)};
 const summary=liveSummary(live);
 assert.ok(summary.current.text.length<=600);assert.ok(!('slides' in summary));
 const stored=await hashPassword('helper pass 1');assert.equal(await checkPassword('helper pass 1',stored),true);assert.equal(await checkPassword('helper pass 2',stored),false);
});

test('QR encoder: Reed-Solomon, format bits and layout match the QR standard',()=>{
 // ISO/IEC 18004 example: "HELLO WORLD" at 1-M has these error correction codewords.
 assert.deepEqual(rsEcc([32,91,11,120,209,114,220,77,67,64,236,17,236,17,236,17],10),[196,35,39,119,235,215,231,226,93,23]);
 assert.equal(formatBits(0),0b101010000010010);
 const m=qrMatrix('http://192.168.1.23:18766/remote');
 assert.equal(m.length,29);
 for(const [x,y] of [[0,0],[22,0],[0,22]]){for(let i=0;i<7;i++){assert.equal(m[y][x+i],true);assert.equal(m[y+6][x+i],true);}assert.equal(m[y+1][x+1],false);assert.equal(m[y+3][x+3],true);}
 assert.equal(m[21][8],true,'dark module');
 assert.throws(()=>qrMatrix('x'.repeat(300)));
 assert.match(qrSvg('http://10.0.0.8:18766/remote'),/^<svg [^>]*viewBox="0 0 37 37"/);
});
