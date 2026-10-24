// Online NKJV from bolls.life, with a fake request: synthetic verse text only, no network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bollsText,bollsChapter,bollsPassage} from './dist/bolls.mjs';
import {parseReference,BIBLE_BOOKS} from './dist/reference.mjs';
import {NKJV_CREDIT} from './dist/library.mjs';

// A chapter of n synthetic verses, in the shape bolls.life sends.
const chapter=n=>Array.from({length:n},(_,i)=>({pk:i,verse:i+1,text:'Verse <i>'+(i+1)+'</i>  text'}));
const reply=(body,status=200)=>new Response(typeof body==='string'?body:JSON.stringify(body),{status});
function fakeServer(sizes={}){
 const calls=[];
 const request=async url=>{calls.push(url);const [,book,ch]=url.match(/NKJV\/(\d+)\/(\d+)\/$/);return reply(chapter(sizes[book+'/'+ch]??20));};
 return {calls,request};
}
test('Verse HTML becomes plain text, numeric entities included',()=>{
 assert.equal(bollsText('He gave His <i>only</i>  begotten<br/>Son &amp; more'),'He gave His only begotten Son & more');
 assert.equal(bollsText('it&#8217;s &#x2019;quoted&#x2019; &#0; &#xFFFFFFF;'),'it’s ’quoted’ &#0; &#xFFFFFFF;');
 assert.equal(bollsText('<script>x</script>Plain'),'xPlain');
});
test('Book numbers follow the canonical 66-book order that bolls.life uses',()=>{
 // From bolls.life get-books/NKJV: 1 Genesis 50, 19 Psalms 150, 22 Song of Solomon 8, 43 John 21, 66 Revelation 22.
 assert.equal(BIBLE_BOOKS.length,66);
 for(const [number,id,chapters] of [[1,'GEN',50],[19,'PSA',150],[22,'SNG',8],[43,'JHN',21],[66,'REV',22]])
  assert.deepEqual([BIBLE_BOOKS[number-1].id,BIBLE_BOOKS[number-1].chapters],[id,chapters]);
});
test('One chapter per request, by book number, with the Thomas Nelson credit; repeats come from memory',async()=>{
 const {calls,request}=fakeServer();
 const one=await bollsChapter('JHN',3,request);
 assert.equal(calls[0],'https://bolls.life/get-text/NKJV/43/3/');
 assert.equal(one.verses[0].text,'Verse 1 text');assert.equal(one.verses[0].book,'John');assert.equal(one.copyright,NKJV_CREDIT);assert.equal(one.source.provider,'bolls.life');
 await bollsChapter('JHN',3,request);assert.equal(calls.length,1,'cached');
 // Two lookups at once share one request.
 await Promise.all([bollsChapter('GEN',1,request),bollsChapter('GEN',1,request)]);assert.equal(calls.filter(u=>u.endsWith('/1/1/')).length,1);
 await bollsChapter('SNG',8,request);assert.equal(calls.at(-1),'https://bolls.life/get-text/NKJV/22/8/');
 await assert.rejects(bollsChapter('JHN',99,request),/Check the book and chapter/);
});
test('Passages: one verse, ranges and ranges across chapters; a verse past the end is an error',async()=>{
 const {request}=fakeServer({'45/1':32,'45/2':29});
 const single=await bollsPassage(parseReference('Romans 1:16'),request);assert.deepEqual(single.verses.map(v=>v.verse),[16]);
 const range=await bollsPassage(parseReference('Romans 1:30-2:2'),request);assert.deepEqual(range.verses.map(v=>v.chapter+':'+v.verse),['1:30','1:31','1:32','2:1','2:2']);
 const whole=await bollsPassage(parseReference('Romans 2'),request);assert.equal(whole.verses.length,29);
 await assert.rejects(bollsPassage(parseReference('Romans 2:40'),request),/Romans 2 has 29 verses in NKJV/);
});
test('Outages and damaged replies are reported plainly, refused whole, and not cached',async()=>{
 await assert.rejects(bollsChapter('PSA',23,async()=>{throw new TypeError('Failed to fetch');}),/could not be reached/);
 await assert.rejects(bollsChapter('PSA',23,async()=>reply({},503)),/not available right now \(503\)/);
 for(const bad of ['not json',{detail:'x'},[],[{verse:1,text:'a'},{verse:1,text:'b'}],[{verse:'1',text:'a'}],[{verse:1,text:'x'.repeat(5001)}],Array.from({length:201},(_,i)=>({verse:i+1,text:'a'}))])
  await assert.rejects(bollsChapter('PSA',23,async()=>reply(bad)),/unexpected answer/,JSON.stringify(bad).slice(0,40));
 await assert.rejects(bollsChapter('PSA',23,async()=>reply('['+'"x",'.repeat(5e5)+'"x"]')),/larger than expected/);
 const {calls,request}=fakeServer();await bollsChapter('PSA',23,request);assert.equal(calls.length,1,'a failed chapter is fetched again next time');
});
