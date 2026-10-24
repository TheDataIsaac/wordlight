// Bible versions from the AO catalogue and pinned versions. Synthetic catalogue and chapters only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogRows,filterRows,coverage,aoCredit,aoChapter,lookupAO,readPinned,savePinned,DEFAULT_PINNED} from './dist/versions.mjs';
import {cleanVerseRange,isLookupKey,adjacentByChapter} from './dist/scripture.mjs';
import {applyBiblePassage} from './dist/library.mjs';
import {DEFAULT,cleanDraft} from './dist/core.mjs';

const catalog={translations:[
 {id:'BSB',shortName:'BSB',englishName:'Berean Standard Bible',languageEnglishName:'English',numberOfBooks:66,license:{publicDomain:true},licenseUrl:'https://berean.bible/'},
 {id:'yor_bib',shortName:'BIB',englishName:'Yoruba Bible',languageEnglishName:'Yorùbá',numberOfBooks:66,license:{publicDomain:false,attribution:'required'},licenseUrl:'https://ebible.org/x'},
 {id:'abc_nt',shortName:'ABC',englishName:'Àbọ̀ New Testament',languageEnglishName:'Example',numberOfBooks:27,license:{},licenseUrl:'javascript:alert(1)'},
 {id:'bad id!',shortName:'X',englishName:'Unsafe'}]};
test('Catalogue rows: safe keys only, labels separate from keys, coverage and licence kept',()=>{
 const rows=catalogRows(catalog);
 assert.deepEqual(rows.map(r=>r.key),['ao:BSB','ao:yor_bib','ao:abc_nt'],'an unsafe id is dropped');
 assert.equal(rows[0].label,'BSB');assert.equal(coverage(rows[0]),'Whole Bible');assert.equal(coverage(rows[2]),'New Testament');
 assert.equal(rows[2].licenseUrl,'','only https licence links are kept');
 assert.equal(aoCredit(rows[0]),'Berean Standard Bible (BSB) · public domain · bible.helloao.org');
 assert.match(aoCredit(rows[1]),/licence: https:\/\/ebible\.org\/x/);
 assert.deepEqual(filterRows(rows,'yoruba').map(r=>r.label),['BIB'],'accents and case do not matter');
 assert.deepEqual(filterRows(rows,'abo new').map(r=>r.label),['ABC']);assert.equal(filterRows(rows,'').length,3);
 assert.deepEqual(catalogRows(null),[]);
});
test('AO chapters: verses only, a missing book is reported, and lookups check the range',async()=>{
 const raw={chapter:{content:[{type:'heading',content:['A heading']},{type:'verse',number:1,text:'First  verse.'},{type:'verse',number:2,text:'Second.'},{type:'line_break'},{type:'verse',number:3,text:'Third.'}]}};
 assert.deepEqual(aoChapter(raw,'JHN',3).map(v=>[v.book,v.verse,v.text]),[['John',1,'First verse.'],['John',2,'Second.'],['John',3,'Third.']]);
 assert.throws(()=>aoChapter(null,'MAL',1),/does not include Malachi 1/);
 const get=async p=>{const [,,id,book,ch]=p.split('/');assert.equal(id,'BSB');return {verses:aoChapter(raw,book,Number(ch))};};
 const one=await lookupAO('ao:BSB','John 3:2',get);assert.deepEqual(one.verses.map(v=>v.verse),[2]);assert.equal(one.reference,'John 3:2');assert.equal(one.translation_id,'ao:BSB');
 assert.deepEqual((await lookupAO('ao:BSB','John 3:2-3',get)).verses.map(v=>v.verse),[2,3]);
 await assert.rejects(lookupAO('ao:BSB','John 3:9',get),/John 3:9 is not in this version/);
 const at={translation:'ao:BSB',start:{bookId:'JHN',chapter:3,verse:3},end:{bookId:'JHN',chapter:3,verse:3}};
 assert.equal((await adjacentByChapter(at,1,get,'/ao/BSB')).reference,'John 4:1','next verse uses the same version');
});
test('A version key survives saving; the label and licence line go on screen, never the key',()=>{
 assert.equal(isLookupKey('ao:BSB'),true);assert.equal(isLookupKey('ao:../x'),false);assert.equal(isLookupKey('kjv'),true);
 const draft=cleanDraft(structuredClone(DEFAULT));
 applyBiblePassage(draft,{reference:'John 3:2',text:'Second.',verses:[{book_id:'JHN',book:'John',chapter:3,verse:2,text:'Second.'}],label:'BSB',attribution:'Berean Standard Bible (BSB) · public domain · bible.helloao.org',source:{provider:'AO Bible API',bibleId:'BSB',fetchedAt:5}},'ao:BSB');
 assert.equal(draft.translation,'BSB');assert.match(draft.scriptureAttribution,/Berean/);
 const saved=cleanDraft(JSON.parse(JSON.stringify(draft)));
 assert.equal(saved.verseRange.translation,'ao:BSB','the key is kept for next and previous verse');assert.equal(saved.translation,'BSB');
 assert.deepEqual(saved.scriptureSource,{provider:'AO Bible API',bibleId:'BSB',fetchedAt:5});
 const legacy=cleanDraft({...structuredClone(DEFAULT),translation:'KJV',verseRange:{translation:'kjv',start:{bookId:'JHN',chapter:3,verse:16},end:{bookId:'JHN',chapter:3,verse:16}}});
 assert.equal(legacy.verseRange.translation,'kjv','older shows keep working unchanged');
 assert.equal(cleanVerseRange({translation:'ao:bad key',start:{bookId:'JHN',chapter:1,verse:1},end:{bookId:'JHN',chapter:1,verse:1}}),null);
});
test('Pinned versions: NKJV and the Yoruba Bible by default, then whatever was pinned',()=>{
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 assert.deepEqual(readPinned(storage).map(p=>p.key),DEFAULT_PINNED.map(p=>p.key));
 savePinned(storage,[...readPinned(storage),{key:'ao:BSB',label:'BSB',name:'Berean Standard Bible',credit:'c'}]);
 assert.deepEqual(readPinned(storage).map(p=>p.key),['nkjv','oycb','ao:BSB']);
 store.set('wordlight-bible-pinned',JSON.stringify([{key:'ao:../evil',label:'x'},{key:'kjv',label:'KJV'}]));
 assert.deepEqual(readPinned(storage).map(p=>p.key),['kjv'],'bad keys are dropped');
 store.set('wordlight-bible-pinned','{broken');assert.equal(readPinned(storage).length,2);
});
