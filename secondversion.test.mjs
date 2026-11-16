// A second Bible version under each verse (for example Yoruba under NKJV): kept with the show, lined up verse by verse,
// credited on screen, and chosen once in the settings shared by the studio and the phone.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT,cleanDraft,makeDeck,snapshot} from './dist/core.mjs';
import {applyBiblePassage,applySecondVersion} from './dist/library.mjs';
import {versesReference} from './dist/scripture.mjs';
import {cleanSettings} from './dist/songs.mjs';
import {YORUBA_CREDIT} from './dist/yoruba.mjs';

const verse=(chapter,v,text)=>({book_id:'JHN',book:'John',chapter,verse:v,text});
const primary={reference:'John 3:16-17',text:'English 16\nEnglish 17',verses:[verse(3,16,'English 16'),verse(3,17,'English 17')]};
const yoruba={translation:'oycb',verses:[verse(3,16,'Yoruba 16')]};

test('Each verse slide carries the same verse in the second version, and a verse it lacks shows alone',()=>{
 const draft=cleanDraft(structuredClone(DEFAULT));
 applyBiblePassage(draft,{...primary,second:yoruba},'kjv');
 const deck=makeDeck(draft).filter(s=>s.type==='passage');
 assert.deepEqual(deck.map(s=>s.second?.text||''),['Yoruba 16','']);
 assert.equal(deck[0].second.translation,'OYCB');
 const live=snapshot(draft);
 assert.equal(live.style.secondAttribution,YORUBA_CREDIT,'the Yoruba licence line goes with the screen');
});

test('Flowing text has no verse boundaries, so it shows the first version only',()=>{
 const draft=cleanDraft(structuredClone(DEFAULT));
 applyBiblePassage(draft,{...primary,second:yoruba},'kjv');draft.passageLayout='flow';
 const deck=makeDeck(draft).filter(s=>s.type==='passage');
 assert.ok(deck.every(s=>!s.second));
 assert.equal(snapshot(draft).style.secondAttribution,'','no credit for a version not on screen');
});

test('A lookup without a second version removes the old one; it can also be added or removed later',()=>{
 const draft=cleanDraft(structuredClone(DEFAULT));
 applyBiblePassage(draft,{...primary,second:yoruba},'kjv');
 applyBiblePassage(draft,primary,'kjv');
 assert.deepEqual([draft.secondVerses,draft.secondTranslation,draft.secondAttribution],[[],'','']);
 applySecondVersion(draft,{translation:'web',verses:[verse(3,17,'WEB 17')]});
 assert.equal(makeDeck(draft).find(s=>s.id==='passage-JHN-3-17').second.text,'WEB 17');
 assert.equal(draft.secondTranslation,'WEB');
});

test('Saved second-version data is cleaned like the rest of a show',()=>{
 const draft=cleanDraft({...structuredClone(DEFAULT),secondVerses:[{book_id:'JHN',chapter:3,verse:16,text:'ok'},{book_id:'bad',chapter:1,verse:1,text:'x'},'junk'],secondTranslation:'X'.repeat(80),secondAttribution:5});
 assert.equal(draft.secondVerses.length,1);
 assert.equal(draft.secondTranslation.length,30);
 assert.equal(draft.secondAttribution,'');
});

test('The reference for the second lookup is built from book ids, so a Yoruba book name never reaches an English source',()=>{
 assert.equal(versesReference([verse(3,16,'a')]),'John 3:16');
 assert.equal(versesReference([verse(3,16,'a'),verse(3,18,'b')]),'John 3:16-18');
 assert.equal(versesReference([{bookId:'LUK',book:'Luku',chapter:10,verse:42,text:'a'},{bookId:'LUK',chapter:11,verse:2,text:'b'}]),'Luke 10:42-11:2');
 assert.equal(versesReference([]),'');
});

test('Settings accept only built-in versions for the second version, and the fade is on unless turned off',()=>{
 assert.equal(cleanSettings({secondVersion:'oycb'}).secondVersion,'oycb');
 assert.equal(cleanSettings({secondVersion:'ao:BSB'}).secondVersion,'');
 assert.equal(cleanSettings({secondVersion:'<script>'}).secondVersion,'');
 assert.equal(cleanSettings({}).fadeSlides,true);
 assert.equal(cleanSettings({fadeSlides:false}).fadeSlides,false);
});
