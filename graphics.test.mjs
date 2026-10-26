// Graphics output and image store. The server part runs the real companion on a test port with a throwaway folder.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import {deflateSync} from 'node:zlib';
import {cleanGraphics,graphicsMarkup,graphicsTimerShown,placement,GRAPHICS_LIMITS} from './dist/graphics.mjs';
import {DEFAULT,snapshot} from './dist/core.mjs';
import {createShow,addItem} from './dist/library.mjs';
const ID='0123456789abcdef';
test('Graphics default to nothing shown, with the holding background off',()=>{
 const g=cleanGraphics();assert.deepEqual([g.logo.visible,g.timer.visible,g.background.visible,g.card.visible],[false,false,false,false]);
 assert.equal(graphicsMarkup(g),'<div class="stage-canvas graphics-canvas"></div>','an empty graphics output is just a transparent canvas');
 assert.equal(cleanGraphics({logo:{visible:true}}).logo.visible,false,'a logo without an image cannot be shown');
 assert.equal(cleanGraphics({card:{visible:true,title:'  '}}).card.visible,false,'an empty card cannot be shown');
 assert.equal(cleanGraphics({logo:{visible:true,assetId:'../etc/passwd'}}).logo.assetId,'');
 assert.equal(cleanGraphics({background:{visible:true,color:'red;position:fixed'}}).background.color,'#000000');
});
test('Graphics markup: logo, centered timer placeholder, background and card only when shown; bounds enforced',()=>{
 const html=graphicsMarkup({logo:{visible:true,assetId:ID,position:'top-right',size:9999,opacity:50},timer:{visible:true,position:'center'},card:{visible:false,title:'Hidden'}});
 assert.match(html,new RegExp('src="/api/assets/'+ID+'"'));assert.match(html,/width:900px;opacity:0.5/);assert.match(html,/data-graphics-timer="true" style="top:50%;left:50%;transform:translate\(-50%,-50%\)"/);
 assert.doesNotMatch(html,/graphics-card|graphics-background/);
 assert.match(graphicsMarkup({card:{visible:true,title:'<b>Sunday</b>',subtitle:'Pastor A'}}),/&lt;b&gt;Sunday&lt;\/b&gt;.*Pastor A/,'card text is escaped');
 assert.match(graphicsMarkup({background:{visible:true,kind:'image',assetId:ID}}),/<img class="graphics-background"/);
 assert.throws(()=>cleanGraphics({card:{title:'x'.repeat(GRAPHICS_LIMITS.titleLength+1)}}),/allows 120 characters/,'an over-long title is refused, not cut');
 assert.equal(placement('bottom-center',80),'bottom:80px;left:50%;transform:translateX(-50%)');
});
test('The graphics timer shares the timer clock and can hide at zero',()=>{
 const g={timer:{visible:true,hideAtZero:true}};
 assert.equal(graphicsTimerShown(g,{mode:'countdown'},1000),true);assert.equal(graphicsTimerShown(g,{mode:'countdown'},0),false);
 assert.equal(graphicsTimerShown(g,{mode:'stopwatch'},0),true,'a stopwatch at zero still shows');
 assert.equal(graphicsTimerShown({timer:{visible:true}},{mode:'countdown'},0),true,'without hide at zero, 00:00 stays');
});
const port=18784,base='http://127.0.0.1:'+port;let server,dataDir;
function request(method,pathname,{headers={},body}={}){
 return new Promise((resolve,reject)=>{
  const data=body===undefined?undefined:Buffer.isBuffer(body)?body:Buffer.from(typeof body==='string'?body:JSON.stringify(body));
  const req=http.request({host:'127.0.0.1',port,method,path:pathname,headers:{Host:'127.0.0.1:'+port,...(data&&!headers['Content-Type']?{'Content-Type':'application/json'}:{}),...(data?{'Content-Length':data.length}:{}),...headers}},res=>{
   const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const buf=Buffer.concat(chunks);let json=null;try{json=JSON.parse(buf);}catch{}resolve({status:res.statusCode,headers:res.headers,body:json,raw:buf});});
  });req.on('error',reject);if(data)req.write(data);req.end();
 });
}
// Small valid image headers for each accepted type.
function png(w,h,seed=0){const crc=()=>Buffer.alloc(4),chunk=(t,d)=>Buffer.concat([Buffer.from([0,0,0,d.length].map((_,i)=>(d.length>>>(24-8*i))&255)),Buffer.from(t),d,crc()]);
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.alloc(h*(w*4+1),seed))),chunk('IEND',Buffer.alloc(0))]);}
const jpeg=(w,h)=>Buffer.from([0xff,0xd8,0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0,0xff,0xc0,0,17,8,h>>8,h&255,w>>8,w&255,3,1,0x22,0,2,0x11,1,3,0x11,1,0xff,0xd9]);
function webpX(w,h){const b=Buffer.alloc(30);b.write('RIFF',0);b.writeUInt32LE(22,4);b.write('WEBP',8);b.write('VP8X',12);b.writeUInt32LE(10,16);b.writeUIntLE(w-1,24,3);b.writeUIntLE(h-1,27,3);return b;}
const upload=(buf,type,name='img')=>request('POST','/api/assets?name='+name,{headers:{'Content-Type':type},body:buf});
before(async()=>{
 dataDir=await mkdtemp(path.join(tmpdir(),'wordlight-graphics-test-'));
 server=spawn(process.execPath,['server.mjs'],{cwd:path.dirname(fileURLToPath(import.meta.url)),env:{...process.env,WORDLIGHT_PORT:String(port),WORDLIGHT_DATA_DIR:dataDir,WORDLIGHT_BRIDGE_ORIGINS:'https://studio.example'},stdio:'ignore'});
 for(let i=0;i<50;i++){try{if((await request('GET','/api/assets')).status===200)break;}catch{}await new Promise(r=>setTimeout(r,100));}
});
after(async()=>{server.kill();await new Promise(r=>setTimeout(r,200));await rm(dataDir,{recursive:true,force:true});});
test('Image store accepts PNG, JPEG and WebP by signature and size, refuses SVG and mismatches, and stores each image once',async()=>{
 const a=await upload(png(512,256),'image/png','logo');assert.equal(a.status,201);assert.match(a.body.asset.id,/^[a-f0-9]{16}$/);assert.deepEqual([a.body.asset.width,a.body.asset.height,a.body.asset.type],[512,256,'png']);
 assert.equal((await upload(png(512,256),'image/png','again')).status,200,'the same bytes are stored once');
 assert.equal((await upload(jpeg(1920,1080),'image/jpeg','bg')).body.asset.type,'jpg');
 assert.deepEqual([(await upload(webpX(300,200),'image/webp')).body.asset.width],[300]);
 assert.equal((await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),'image/svg+xml')).status,415);
 assert.equal((await upload(jpeg(10,10),'image/png')).status,400,'type must match the file signature');
 assert.match((await upload(png(5000,10),'image/png')).body.error,/5000 × 10 pixels; the limit is 4096/);
 assert.equal((await upload(Buffer.alloc(3_000_001),'image/png')).status,413);
 const list=(await request('GET','/api/assets')).body.assets;assert.equal(list.length,3,'index lists metadata only');assert.ok(list.every(x=>!('data' in x)));
 const got=await request('GET','/api/assets/'+a.body.asset.id);assert.equal(got.status,200);assert.equal(got.headers['content-type'],'image/png');assert.match(got.headers['cache-control'],/immutable/);assert.ok(got.raw.equals(png(512,256)));
 assert.equal((await request('GET','/api/assets/'+a.body.asset.id,{headers:{Origin:'https://studio.example'}})).status,403,'the web studio origin cannot read the store');
 assert.equal((await request('GET','/api/assets/zzzz')).status,404);
});
test('Concurrent uploads keep every index entry',async()=>{
 const results=await Promise.all(Array.from({length:6},(_,i)=>upload(png(20+i,20,i),'image/png','c'+i)));
 assert.ok(results.every(r=>r.status===201),results.map(r=>r.status).join(','));
 const list=(await request('GET','/api/assets')).body.assets;for(const r of results)assert.ok(list.some(x=>x.id===r.body.asset.id));
 assert.equal(JSON.parse(await readFile(path.join(dataDir,'assets','assets.json'),'utf8')).length,list.length);
});
const liveWith=(graphics,extra={})=>({...snapshot(structuredClone(DEFAULT)),blank:false,graphics,updated:Date.now(),...extra});
test('Graphics are checked on save, kept through blanking and bridge sends, and images in use cannot be deleted',async()=>{
 const logo=(await upload(png(100,100,9),'image/png','in-use')).body.asset.id;
 assert.equal((await request('POST','/api/state',{body:{live:liveWith({logo:{visible:true,assetId:logo}})}})).status,200);
 assert.equal((await request('POST','/api/state',{body:{live:liveWith({card:{title:'x'.repeat(121)}})}})).status,400,'an over-limit card is refused before it is saved');
 assert.equal((await request('GET','/api/state')).body.live.graphics.logo.visible,true,'the refused save changed nothing');
 const blanked=(await request('GET','/api/state')).body.live;await request('POST','/api/state',{body:{live:{...blanked,blank:true,updated:Date.now()}}});
 assert.equal((await request('GET','/api/state')).body.live.graphics.logo.visible,true,'blanking slides keeps graphics');
 assert.equal((await request('DELETE','/api/assets/'+logo)).status,409);
 const code=(await request('GET','/api/bridge/code')).body.code;
 const fromWeb={...liveWith(undefined),updated:Date.now()+5000};delete fromWeb.graphics;
 assert.equal((await request('POST','/api/bridge/live',{headers:{Origin:'https://studio.example',Authorization:'Bearer '+code},body:{live:fromWeb}})).status,200);
 assert.equal((await request('GET','/api/state')).body.live.graphics.logo.assetId,logo,'a web studio screen keeps the companion graphics');
 await request('POST','/api/state',{body:{live:liveWith(undefined,{updated:Date.now()+9000})}});
 const old=(await request('GET','/api/state')).body.live.graphics;assert.equal(old.logo.visible,false,'live state without graphics loads with graphics off');
 assert.equal((await request('DELETE','/api/assets/'+logo)).status,200,'no longer in use');
});
test('Slide background images in any saved item or on air cannot be deleted; a paired web studio can read them',async()=>{
 const id=(await upload(png(64,36,3),'image/png','slide-bg')).body.asset.id;
 // Saved in the second item of a show, not the current one.
 const show=createShow('Backgrounds');addItem(show,'Second');show.draft.backgroundAssetId=id;addItem(show,'Third');
 const library={format:'wordlight-library',version:1,activeShowId:show.id,shows:[show]};
 assert.equal((await request('POST','/api/state',{body:{library}})).status,200);
 assert.equal((await request('DELETE','/api/assets/'+id)).status,409,'used by a saved item');
 const plain=createShow('Plain');
 assert.equal((await request('POST','/api/state',{body:{library:{...library,activeShowId:plain.id,shows:[plain]}}})).status,200);
 assert.equal((await request('POST','/api/state',{body:{live:{...liveWith(undefined),style:{...liveWith(undefined).style,backgroundAssetId:id},updated:Date.now()+20000}}})).status,200);
 assert.equal((await request('DELETE','/api/assets/'+id)).status,409,'used on air');
 const code=(await request('GET','/api/bridge/code')).body.code;
 const web=await request('GET','/api/bridge/assets/'+id,{headers:{Origin:'https://studio.example',Authorization:'Bearer '+code}});
 assert.equal(web.status,200);assert.equal(web.headers['access-control-allow-origin'],'https://studio.example');assert.ok(web.raw.equals(png(64,36,3)));
 assert.equal((await request('DELETE','/api/bridge/assets/'+id,{headers:{Origin:'https://studio.example',Authorization:'Bearer '+code}})).status,404,'the web studio cannot delete images');
 assert.equal((await request('POST','/api/state',{body:{live:{...liveWith(undefined),updated:Date.now()+30000}}})).status,200);
 assert.equal((await request('DELETE','/api/assets/'+id)).status,200,'no longer used anywhere');
});
test('Removing an image only takes it out of the image library: it is still served by id, and uploading it again brings it back',async()=>{
 const bytes=png(48,27,7),id=(await upload(bytes,'image/png','hidden-use')).body.asset.id;
 assert.equal((await request('DELETE','/api/assets/'+id)).status,200);
 assert.ok(!(await request('GET','/api/assets')).body.assets.some(a=>a.id===id),'left out of the list');
 const still=await request('GET','/api/assets/'+id);assert.equal(still.status,200,'a show kept in a web studio still gets it');assert.ok(still.raw.equals(bytes));
 const again=await upload(bytes,'image/png','again');assert.equal(again.status,200);assert.equal(again.body.asset.id,id);
 assert.ok((await request('GET','/api/assets')).body.assets.some(a=>a.id===id),'back in the list');
 // The limit counts only images in the library.
 const index=JSON.parse(await readFile(path.join(dataDir,'assets','assets.json'),'utf8'));
 assert.equal(index.filter(a=>a.id===id).length,1,'one row per image');
 let active=(await request('GET','/api/assets')).body.assets.length;
 for(let i=0;active<40;i++,active++)assert.equal((await upload(png(30,30,100+i),'image/png','fill'+i)).status,201);
 assert.equal((await upload(png(31,31,1),'image/png','over')).status,409,'40 in the library is the limit');
 assert.equal((await request('DELETE','/api/assets/'+id)).status,200);
 assert.equal((await upload(png(31,31,1),'image/png','fits')).status,201,'a removed image does not count');
});
test('A damaged image index is kept and reported, never silently replaced',async()=>{
 const {writeFile:write,readFile:read}=await import('node:fs/promises');
 await upload(png(30,30,77),'image/png','keep');
 const file=path.join(dataDir,'assets','assets.json'),good=await read(file,'utf8');
 await write(file,'{damaged');
 const list=await request('GET','/api/assets');assert.equal(list.status,500);assert.match(list.body.error,/damaged.*assets\.json\.damaged/);
 assert.equal((await upload(png(31,31,78),'image/png','new')).status,500,'an upload does not overwrite the damaged index');
 assert.equal(await read(file,'utf8'),'{damaged');assert.equal(await read(file+'.damaged','utf8'),'{damaged');
 await write(file,JSON.stringify([...JSON.parse(good),{id:'../../evil',type:'png'},{id:'abcdefabcdefabcd',type:'svg'}]));
 const cleaned=(await request('GET','/api/assets')).body.assets;assert.ok(cleaned.every(a=>/^[a-f0-9]{16}$/.test(a.id)&&a.type!=='svg'),'bad rows are ignored');
 await write(file,good);
});
