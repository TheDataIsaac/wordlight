import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {freshPresentationFiles,refreshedOutputURL} from './dist/refresh.mjs';
const base='https://wordlight.example/';
test('Refresh downloads the complete current module graph and CSS with browser cache bypass',async()=>{
 const calls=[];
 const files=await freshPresentationFiles(base,async(url,options)=>{
  calls.push({url,options});
  const name=new URL(url).pathname.slice(1)||'index.html';
  return {ok:true,text:()=>readFile(new URL('./dist/'+name,import.meta.url),'utf8')};
 });
 for(const file of ['app.js','fit.mjs','reference.mjs','lowerthird.mjs','bridge.mjs','picker.mjs','versification.mjs','core.mjs','timer.mjs','library.mjs','storage.mjs','scripture.mjs','yoruba.mjs','refresh.mjs','styles.css'])assert(files.includes(base+file),file);
 assert.equal(new Set(files).size,files.length);
 for(const {options} of calls){assert.equal(options.cache,'reload');assert.equal(options.redirect,'error');}
});
test('Offline and failed asset requests fail before navigation can be requested',async()=>{
 await assert.rejects(freshPresentationFiles(base,async()=>{throw Error('offline');}),/offline/);
 await assert.rejects(freshPresentationFiles(base,async()=>({ok:false})),/latest presentation/);
});
test('Login HTML is never treated as a valid presentation or module',async()=>{
 await assert.rejects(freshPresentationFiles(base,async()=>({ok:true,text:async()=>'<html>Sign in</html>'})),/page is unavailable/);
 let n=0;
 await assert.rejects(freshPresentationFiles(base,async()=>({ok:true,text:async()=>++n===1?'<div id="app"></div><script src="app.js"></script>':'<!doctype html>Sign in'})),/Sign in again/);
});
test('External assets are not contacted and circular local imports terminate',async()=>{
 const responses={
  [base]:'<div id="app"></div><script src="a.js"></script><script src="https://other.example/track.js"></script>',
  [base+'a.js']:"import './b.mjs';",
  [base+'b.mjs']:"export {x} from './a.js';"
 };
 const files=await freshPresentationFiles(base,async url=>({ok:true,text:async()=>{assert(url in responses);return responses[url];}}));
 assert.equal(files.length,3);
});
test('Refresh navigation targets output with a new cache key, never the editor',()=>{
 const url=new URL(refreshedOutputURL(base+'?view=studio','refresh-123'));
 assert.equal(url.searchParams.get('view'),'output');
 assert.equal(url.searchParams.get('refresh'),'refresh-123');
 assert.equal(url.origin,new URL(base).origin);
});
