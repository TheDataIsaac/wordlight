import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VERSE_COUNTS,verseCount,chapterCount} from './dist/versification.mjs';
import {BIBLE_BOOKS,parseReference} from './dist/reference.mjs';
import {pickerBooks,pickVerse,selectionReference,chapterReference,sectionOf,readRecent,rememberRecent,RECENT_KEY} from './dist/picker.mjs';
import {cleanCode,readPairing,savePairing,forgetPairing,companionStatus,sendToCompanion,needsResend,nextPending,isOlderSend,companionLive,describeViewers,cleanViewers,BRIDGE_KEY} from './dist/bridge.mjs';
class MemoryStorage{constructor(){this.v=new Map();}getItem(k){return this.v.get(k)??null;}setItem(k,v){this.v.set(k,String(v));}removeItem(k){this.v.delete(k);}}
test('The verse table covers the 66-book KJV canon and agrees with the book catalogue',()=>{
 const counts=Object.values(VERSE_COUNTS);
 assert.equal(counts.length,66);assert.equal(counts.flat().length,1189);assert.equal(counts.flat().reduce((a,b)=>a+b,0),31102);
 for(const book of BIBLE_BOOKS)assert.equal(chapterCount(book.id),book.chapters,book.id);
 assert.equal(verseCount('PSA',119),176);assert.equal(verseCount('PSA',117),2);assert.equal(verseCount('JHN',3),36);assert.equal(verseCount('OBA',1),21);
 assert.equal(verseCount('3JN',1),14);assert.equal(verseCount('3JN',1,'oycb'),15,'OYCB numbers 3 John 1 to verse 15');
 assert.equal(verseCount('GEN',51),0);assert.equal(verseCount('XYZ',1),0);
});
test('Every book is in one section with a unique short name, in Bible order',()=>{
 const books=pickerBooks();assert.equal(books.length,66);assert.equal(new Set(books.map(b=>b.short)).size,66);
 assert.ok(books.every(b=>b.section));assert.equal(sectionOf('MAT'),'gospels');assert.equal(sectionOf('PHM'),'paul');assert.equal(sectionOf('REV'),'revelation');
 assert.deepEqual(books.slice(0,2).map(b=>b.short),['Gen','Exo']);
});
test('Verse selection: single verse, range in either order, Shift from the anchor, chapter crossing, and a whole chapter',()=>{
 let s=pickVerse(null,{chapter:3,verse:16});assert.equal(selectionReference('JHN',s),'John 3:16');
 s=pickVerse(s,{chapter:3,verse:18});assert.equal(selectionReference('JHN',s),'John 3:16-18');
 s=pickVerse(s,{chapter:3,verse:5});assert.equal(selectionReference('JHN',s),'John 3:5','a plain click after a range starts again');
 s=pickVerse(s,{chapter:3,verse:2});assert.equal(selectionReference('JHN',s),'John 3:2-5','second click before the first');
 s=pickVerse(pickVerse(null,{chapter:3,verse:10}),{chapter:3,verse:16});
 s=pickVerse(s,{chapter:3,verse:4},true);assert.equal(selectionReference('JHN',s),'John 3:4-10','Shift spans from the anchor backwards');
 s=pickVerse(s,{chapter:3,verse:20},true);assert.equal(selectionReference('JHN',s),'John 3:10-20','Shift spans from the anchor forwards');
 s=pickVerse(pickVerse(null,{chapter:10,verse:42}),{chapter:11,verse:2});assert.equal(selectionReference('LUK',s),'Luke 10:42-11:2');
 s=pickVerse(pickVerse(null,{chapter:3,verse:16}),{chapter:3,verse:16});assert.equal(selectionReference('JHN',s),'John 3:16');
 assert.equal(chapterReference('PSA',23),'Psalms 23');assert.equal(selectionReference('JHN',null),'');
 // Every picker reference is accepted by the same parser the lookup uses.
 assert.equal(parseReference(selectionReference('1JN',pickVerse(pickVerse(null,{chapter:1,verse:9}),{chapter:2,verse:1}))).reference,'1 John 1:9-2:1');
});
test('Recent passages keep the newest eight without duplicates and survive bad storage',()=>{
 const storage=new MemoryStorage();for(let i=1;i<=10;i++)rememberRecent(storage,'John 3:'+i,'kjv');
 rememberRecent(storage,'John 3:5','kjv');const list=readRecent(storage);
 assert.equal(list.length,8);assert.equal(list[0].reference,'John 3:5');assert.equal(list.filter(r=>r.reference==='John 3:5').length,1);
 rememberRecent(storage,'John 3:5','oycb');assert.equal(readRecent(storage)[0].translation,'oycb');
 storage.setItem(RECENT_KEY,'{broken');assert.deepEqual(readRecent(storage),[]);
 const failing={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};assert.deepEqual(readRecent(failing),[]);assert.doesNotThrow(()=>rememberRecent(failing,'John 1:1','kjv'));
});
const reply=(status,body)=>async()=>({status,ok:status>=200&&status<300,json:async()=>body});
test('Bridge client: pairing codes, outcomes, and resend only when this screen is newer',async()=>{
 assert.equal(cleanCode(' abcd efgh-jklm '),'ABCD-EFGH-JKLM');assert.equal(cleanCode('short'),'');
 const storage=new MemoryStorage();assert.equal(readPairing(storage),null);
 assert.throws(()=>savePairing(storage,'nope'),/12-character/);savePairing(storage,'abcd-efgh-jklm');assert.deepEqual(readPairing(storage),{code:'ABCD-EFGH-JKLM'});
 storage.setItem(BRIDGE_KEY,'{broken');assert.equal(readPairing(storage),null);forgetPairing(storage);
 const pairing={code:'ABCD-EFGH-JKLM'};let seen;
 const ok=await companionStatus(pairing,async(url,options)=>{seen={url,options};return {status:200,ok:true,json:async()=>({viewers:{output:1,lower:1},liveUpdated:5})};});
 assert.equal(ok.state,'connected');assert.equal(seen.url,'http://127.0.0.1:18765/api/bridge/status');assert.equal(seen.options.headers.Authorization,'Bearer ABCD-EFGH-JKLM');assert.equal(seen.options.credentials,'omit');
 assert.equal((await companionStatus(pairing,async()=>{throw new TypeError('Failed to fetch');})).state,'offline');
 assert.equal((await companionStatus(pairing,reply(401,{error:'no'}))).state,'unpaired');
 assert.deepEqual(await sendToCompanion(pairing,{updated:1},reply(409,{liveUpdated:9})),{state:'stale',liveUpdated:9});
 assert.equal((await sendToCompanion(pairing,{updated:1},reply(500,{error:'disk'}))).message,'disk');
 assert.equal((await companionStatus(null)).state,'unpaired');
 // Only a Send that did not get through is owed; any answer settles it, and an older Send's late answer never
 // replaces a newer pending one.
 const a={updated:1},b={updated:2};
 assert.equal(nextPending(null,a,'offline'),a);assert.equal(nextPending(null,a,'error'),a);
 assert.equal(nextPending(a,b,'offline'),b);assert.equal(nextPending(b,a,'offline'),b,'a late failure of an older Send keeps the newer one');
 assert.equal(nextPending(a,a,'connected'),null);assert.equal(nextPending(a,b,'stale'),null,'a newer companion screen settles it');
 assert.equal(nextPending(b,a,'connected'),b,'an older Send arriving late does not clear the newer pending one');
 assert.equal(nextPending(null,a,'connected'),null);
 // A then B; B succeeds and settles everything; A then fails late: nothing is owed again.
 assert.equal(nextPending(null,a,'offline',b),null);assert.equal(nextPending(b,a,'connected',b),b);
 assert.equal(isOlderSend(a,b),true);assert.equal(isOlderSend(b,b),false);assert.equal(isOlderSend(a,null),false);
 let asked;assert.deepEqual(await companionLive(pairing,async(url,options)=>{asked={url,options};return {ok:true,json:async()=>({live:{updated:7}})};}),{updated:7});
 assert.equal(asked.url,'http://127.0.0.1:18765/api/bridge/live');assert.equal(asked.options.method,'GET');assert.equal(asked.options.headers.Authorization,'Bearer ABCD-EFGH-JKLM');
 assert.equal(await companionLive(pairing,async()=>{throw new TypeError('Failed to fetch');}),null);assert.equal(await companionLive(null),null);
 assert.equal(needsResend({updated:10},9),true);assert.equal(needsResend({updated:9},9),false);assert.equal(needsResend({updated:5},9),false);
 assert.equal(describeViewers({output:1,lower:2}),'1 full-screen page, 2 lower-third pages connected');assert.equal(describeViewers({}),'no output pages connected');
 assert.equal(describeViewers({output:0,lower:0,graphics:1}),'1 graphics page connected','a graphics page alone counts as connected');
 assert.equal(describeViewers({output:1,lower:1,graphics:2}),'1 full-screen page, 1 lower-third page, 2 graphics pages connected');
 assert.deepEqual(ok.viewers,{output:1,lower:1,graphics:0},'an older companion without a graphics count still works');
 assert.deepEqual(cleanViewers({output:-1,lower:'3',graphics:1.5,studio:4}),{output:0,lower:0,graphics:0},'bad counts read as 0; studio tabs are not outputs');
 assert.equal(describeViewers(undefined),'no output pages connected');
});
