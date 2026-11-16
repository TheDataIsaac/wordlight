// Finding a verse by its words. A tiny synthetic Bible stands in for the installed ones; no real Bible text is used
// except a few public-domain verses written out below.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BIBLE_BOOKS} from './dist/reference.mjs';
import {createBibleSearch} from './bible-search.mjs';
import {wordKey,looksLikeWords,markMatches,verseResultsMarkup} from './dist/verse-search.mjs';

// Every book gets one chapter of filler; the verses given are placed where they belong.
async function installBible(root,id,verses){
 const folder=path.join(root,id);await mkdir(folder,{recursive:true});
 for(const book of BIBLE_BOOKS){
  const chapters=Array.from({length:book.chapters},()=>['Filler words about nothing in particular.']);
  for(const [ref,text] of Object.entries(verses)){
   const [bookId,chapter,verse]=ref.split(/[ :]/);if(bookId!==book.id)continue;
   const list=chapters[Number(chapter)-1];while(list.length<Number(verse))list.push(null);list[Number(verse)-1]=text;
  }
  await writeFile(path.join(folder,book.id+'.json'),JSON.stringify(chapters));
 }
}
async function setup(){
 const root=await mkdtemp(path.join(tmpdir(),'wordlight-search-'));
 await installBible(root,'kjv',{'PHP 4:13':'I can do all things through Christ which strengtheneth me.','ROM 8:28':'And we know that all things work together for good to them that love God.','JHN 11:35':'Jesus wept.','1PE 4:11':'If any man speak, let him speak as the oracles of God.'});
 await installBible(root,'web',{'PHP 4:13':'I can do all things through Christ, who strengthens me.'});
 await installBible(root,'oycb',{'JHN 3:16':'“Nítorí Ọlọ́run fẹ́ aráyé tó bẹ́ẹ̀ gẹ́ẹ́, tí ó fi ọmọ rẹ̀ kan ṣoṣo fún ni.'});
 const bibles=[{id:'kjv',abbreviation:'KJV',installed:true,installedAt:1},{id:'web',abbreviation:'WEB',installed:true,installedAt:1},{id:'oycb',abbreviation:'OYCB',installed:true,installedAt:1}];
 return {root,bibles,search:createBibleSearch({root,listInstalled:async()=>bibles})};
}

test('A quote finds its verse first, in another version when its wording matches better',async()=>{
 const {root,search}=await setup();
 try{
  const nkjvWording=await search.search('I can do all things through Christ who strengthens me');
  assert.equal(nkjvWording.results[0].reference,'Philippians 4:13');
  assert.equal(nkjvWording.results[0].translation,'WEB');
  assert.equal(nkjvWording.results[0].exact,true);
  assert.equal(nkjvWording.results.filter(r=>r.reference==='Philippians 4:13').length,1,'one row per verse, whichever version matched best');
  const partial=await search.search('all things work together');
  assert.equal(partial.results[0].reference,'Romans 8:28');
  assert.deepEqual(partial.searched,['KJV','WEB','OYCB']);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Tone marks, case and punctuation do not matter, so Yoruba typed without marks is found',async()=>{
 const {root,search}=await setup();
 try{
  const found=await search.search('nitori olorun fe araye');
  assert.equal(found.results[0].reference,'John 3:16');
  assert.equal(found.results[0].translation,'OYCB');
  assert.equal(found.results[0].exact,true);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Nothing typed, nothing installed, or nothing close gives no results instead of a guess',async()=>{
 const {root,bibles,search}=await setup();
 try{
  assert.deepEqual((await search.search('   ')).results,[]);
  assert.deepEqual((await search.search('zebra quantum telescope')).results,[]);
  bibles.length=0;
  assert.deepEqual(await search.search('Jesus wept'),{results:[],searched:[]});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('A version installed again is searched again, and a removed one is no longer searched',async()=>{
 const {root,bibles,search}=await setup();
 try{
  assert.equal((await search.search('Jesus wept')).results[0].reference,'John 11:35');
  await installBible(root,'kjv',{'JHN 11:35':'Jesus cried.'});bibles[0].installedAt=2;
  assert.equal((await search.search('Jesus wept')).results.length,0,'the new copy replaced the old index');
  bibles.splice(0,1);
  assert.deepEqual((await search.search('Jesus cried')).searched,['WEB','OYCB']);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Words match on their first five letters; quotes and references are told apart',()=>{
 assert.equal(wordKey('strengthens'),wordKey('strengtheneth'));
 assert.equal(wordKey('loves'),wordKey('love'));
 assert.notEqual(wordKey('god'),wordKey('good'));
 assert.equal(looksLikeWords('for God so loved'),true);
 assert.equal(looksLikeWords('John 3 16'),false);
 assert.equal(looksLikeWords('Jude'),false);
 assert.equal(looksLikeWords('1 cor love is patient'),false,'a number means a reference');
});

test('Result text is escaped and only the typed words are bold',()=>{
 const html=markMatches('<img src=x onerror=alert(1)> Jesus wept & the people','jesus wept the');
 assert.ok(!html.includes('<img'));
 assert.ok(html.includes('&lt;img'));
 assert.ok(html.includes('<b>Jesus</b> <b>wept</b>'));
 assert.ok(!html.includes('<b>the</b>'),'small words are not bold');
 const list=verseResultsMarkup({query:'x',results:[{reference:'John "3"',translation:'<b>',text:'t',exact:false}],searched:['KJV']},'');
 assert.ok(list.includes('John &quot;3&quot;')&&list.includes('&lt;b&gt;'));
});

test('The index is saved beside each version and reused, rebuilt after a reinstall, and a damaged file is ignored',async()=>{
 const {root,bibles}=await setup();
 const {stat}=await import('node:fs/promises');
 try{
  const first=createBibleSearch({root,listInstalled:async()=>bibles});
  const quote='I can do all things through Christ which strengtheneth me';
  const fresh=await first.search(quote);
  const file=path.join(root,'kjv','search-index.bin');
  for(let i=0;i<50&&!(await stat(file).catch(()=>null));i++)await new Promise(r=>setTimeout(r,20));
  assert.ok(await stat(file),'saved after the first build');
  // A second start reads the saved file and finds the same verses, texts included.
  const second=createBibleSearch({root,listInstalled:async()=>bibles});
  assert.deepEqual(await second.search(quote),fresh);
  assert.equal((await second.search('olorun fe araye')).results[0].text,'“Nítorí Ọlọ́run fẹ́ aráyé tó bẹ́ẹ̀ gẹ́ẹ́, tí ó fi ọmọ rẹ̀ kan ṣoṣo fún ni.','Yoruba text survives the packing');
  // Reinstalled (new installedAt) with different text: the saved file is not used.
  await installBible(root,'kjv',{'JHN 11:35':'Jesus wept bitterly.'});
  const reinstalled=bibles.map(b=>b.id==='kjv'?{...b,installedAt:2}:b);
  const third=createBibleSearch({root,listInstalled:async()=>reinstalled});
  assert.equal((await third.search('jesus wept bitterly')).results[0].text,'Jesus wept bitterly.');
  // A damaged file is rebuilt from the books.
  await writeFile(file,Buffer.from('WLSI2 garbage'));
  const fourth=createBibleSearch({root,listInstalled:async()=>reinstalled});
  assert.equal((await fourth.search('jesus wept bitterly')).results[0].reference,'John 11:35');
 }finally{await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
