// Line search, quick capture, setlist reading and the songbook builder's cleaning rules.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newSong,editSong,cleanSong,foldWords,foldText,captureSong,addCapturedLine,setlistLines,songSlides,matchedSlide,cleanSettings,applySettings,settings,DEFAULT_SETTINGS,LINES_PER_SLIDE} from './dist/songs.mjs';
import {makeDeck,deckFor,DEFAULT,cleanDraft} from './dist/core.mjs';
import {songScreen} from './remote-content.mjs';
import {parseReference} from './dist/reference.mjs';
import {searchEntry,entryForCache,entryFromCache,findInSongbook,vocabulary} from './song-search.mjs';
import {cleanLine,isSiteLine,pageLines,sectionsFromBlocks,buildSongbook} from './tools/build-songbook.mjs';

const song=(id,title,lyrics,arrangement,meta={})=>({...editSong(newSong(title),{meta,lyrics,arrangement}),id});
const library=[
 song('wl-a','Way Maker','[Verse 1]\nYou are here moving in our midst\nI worship you\n\n[Chorus]\nWay maker miracle worker\nPromise keeper light in the darkness','Verse 1, Chorus, Chorus',{artist:'Sinach',status:'checked'}),
 song('wl-b','Ọlọ́run Ọba','[Verse 1]\nKọ ’rin iyin s’orukọ Rẹ\nOluwa l’Ọba','Verse 1',{status:'book'}),
 song('wl-c','Light Of The World','[Verse 1]\nLight in the valley\nOf the shadow','Verse 1',{status:'reserve',aliases:'Shine on'}),
].map(s=>searchEntry(s));
const find=(q,entries=library)=>findInSongbook(entries,q,()=>vocabulary(entries));

test('Folding ignores tone marks, case, apostrophes and punctuation',()=>{
 assert.equal(foldWords('Ọlọ́run, Ko’rin-iyin!'),'olorun korin iyin');
 assert.equal(foldText("Ko'rin"),foldText('Ko’rin'));
});
test('Any line finds the song, and says which line and where it is',()=>{
 const [hit]=find('promise keeper');
 assert.equal(hit.id,'wl-a');assert.equal(hit.line,'Promise keeper light in the darkness');assert.equal(hit.section,'Chorus');assert.equal(hit.position,1);assert.equal(hit.artist,'Sinach');
 assert.ok(!('words' in hit)&&!('lines' in hit),'results carry no index data');
});
test('A line in the middle of a slide keeps its slide, and a repeated section uses its first place',()=>{
 const entry=searchEntry(song('wl-d','Pages','[Verse 1]\nFirst slide\n\nSecond slide\nThird line\n\n[Chorus]\nSung twice','Chorus, Verse 1, Chorus'));
 const [slide]=find('third line',[entry]),[chorus]=find('sung twice',[entry]);
 assert.deepEqual([slide.position,slide.page],[1,1]);assert.equal(chorus.position,0);
});
test('A hidden page is skipped, and later pages are numbered as the deck numbers them',()=>{
 const base=song('wl-p','Hidden','[Verse 1]\nShown first\n\nHidden words\n\nShown last','Verse 1');
 const entry=searchEntry({...base,arrangements:[{...base.arrangements[0],hidden:{0:[1]}}]});
 assert.deepEqual(find('hidden words',[entry]).filter(h=>h.line),[]);assert.equal(find('shown last',[entry])[0].page,1);
});
test('Tone marks and spacing differences still match',()=>{
 assert.equal(find('olorun oba')[0].id,'wl-b');
 assert.equal(find('korin iyin')[0].id,'wl-b','words split differently');
 assert.equal(find('oluwa loba')[0].line,'Oluwa l’Ọba');
});
test('Typos are forgiven, only when nothing better matches',()=>{
 assert.equal(find('miracel worker')[0].id,'wl-a','two letters swapped');
 assert.equal(find('promis keeper')[0].id,'wl-a','a partial word still matches');
 assert.equal(find('wrshipped you')[0]?.id,undefined,'too far from any word');
 assert.deepEqual(find('zzzzz'),[]);
});
test('Ranking: a title beats a phrase, a phrase beats scattered words, checked songs beat reserve, and past use counts',()=>{
 assert.deepEqual(find('light in the').map(h=>h.id).slice(0,2),['wl-c','wl-a'],'title first');
 const twoLines=[searchEntry(song('wl-e','One','[Verse 1]\nmy god is good\nand faithful','Verse 1')),searchEntry(song('wl-f','Two','[Verse 1]\ngood is my god','Verse 1')),searchEntry(song('wl-g','Three','[Verse 1]\nis\ngood\nmy\ngod','Verse 1'))];
 assert.deepEqual(find('my god is',twoLines).map(h=>h.id),['wl-e','wl-f','wl-g']);
 const same=meta=>song('wl-'+meta.id,'Same','[Verse 1]\nsame words here','Verse 1',{status:meta.status});
 assert.equal(find('same words',[searchEntry(same({id:'r',status:'reserve'})),searchEntry(same({id:'c',status:'checked'}))])[0].id,'wl-c');
 assert.equal(findInSongbook([searchEntry(same({id:'x',status:'book'})),searchEntry(same({id:'y',status:'book'}),{uses:4})],'same words')[0].id,'wl-y');
});
test('Aliases, artist and hymn numbers are searchable',()=>{
 assert.equal(find('shine on')[0].id,'wl-c');assert.equal(find('sinach')[0].id,'wl-a');
 const hymn=searchEntry(song('wl-h','Hymn','[Verse 1]\nWords','Verse 1',{collection:'Iwe Orin Mimo',number:'123'}));
 assert.equal(find('iwe orin 123',[hymn])[0].id,'wl-h');assert.equal(hymn.category,'Iwe Orin Mimo');
});
test('An empty search lists every song',()=>{assert.equal(find('').length,library.length);});
test('A song with no readable lines stays findable by title',()=>{
 const entry=searchEntry({id:'wl-x',title:'Broken file',meta:{},sections:[],arrangements:[{id:'main',order:[]}]});
 assert.equal(find('broken',[entry])[0].id,'wl-x');
});
test('Quick capture: each line is its own verse, the song is a draft, and it stays a valid song',()=>{
 let song=captureSong('Baba mo dupe\nMo dupe o','2026-11-01');
 assert.equal(song.title,'Baba mo dupe');assert.equal(song.meta.status,'draft');assert.equal(song.meta.origin,'Quick capture 2026-11-01');
 song=addCapturedLine(song,' Second line ');
 assert.deepEqual(song.sections.map(s=>[s.label,s.number,s.slides[0]]),[['Verse 1',1,'Baba mo dupe\nMo dupe o'],['Verse 2',2,'Second line']]);
 assert.deepEqual(song.arrangements[0].order,['s1','s2']);assert.equal(cleanSong(song).sections.length,2);
});
test('Setlist lines lose numbers and bullets, and blank lines are skipped',()=>{
 assert.deepEqual(setlistLines('1. Way maker\n\n 2) Imela\n- Oba mi\n• Ekwueme\r\n3 days'),['Way maker','Imela','Oba mi','Ekwueme','3 days']);
});
test('Songbook cleaning: music marks and site lines go, and long blocks become four-line slides',()=>{
 assert.equal(cleanLine('mf A ba le n’igbagbo'),'A ba le n’igbagbo');assert.equal(cleanLine('cr Ti y’o si'),'Ti y’o si');assert.equal(cleanLine('Pour out'),'Pour out');
 assert.ok(isSiteLine('[Other Songs by Sinach]'));assert.ok(isSiteLine('By Joe Praize'));assert.ok(!isSiteLine('By Your grace we stand today, O Lord of all the earth, we bow before Thee'));
 assert.deepEqual(pageLines(['1','2','3','4','5']),['1\n2\n3\n4','5']);
});
test('Songbook sections: a repeated block is one chorus sung again, and one-line-per-block hymns are read under their labels',()=>{
 const repeated=sectionsFromBlocks(['First verse','We sing\nThe chorus','Second verse','We sing\nThe chorus']);
 assert.deepEqual(repeated.sections.map(s=>s.label),['Verse 1','Chorus','Verse 2']);assert.deepEqual(repeated.order,['s1','s2','s3','s2']);
 const hymn=sectionsFromBlocks(['Ẹsẹ 1','Line one','Line two','Line three','Line four','Line five','Chorus','Refrain words','Refrain more','Ẹsẹ 2','Other words']);
 assert.deepEqual(hymn.sections.map(s=>s.label),['Verse 1','Chorus','Verse 2']);assert.deepEqual(hymn.sections[0].slides,['Line one\nLine two\nLine three\nLine four','Line five']);
});
test('Songbook build: the church\u2019s own songs and named books are kept, a hymn in two books is kept once, and other blog songs are left out',async()=>{
 const show=(name,lines,extra={})=>['id-'+name,{name,slides:{a:{group:'Verse 1',items:[{lines:lines.map(value=>({text:[{value}]}))}]}},layouts:{main:{name:'Default',slides:[{id:'a'}]}},meta:{},timestamps:{},...extra}];
 const shows={
  'Typed By Hand':show('Typed By Hand',['Only our team sings this']),
  'Blog Song':show('Blog Song',['Sung on a Sunday once'],{meta:{originalSource:'GospelMinds'},timestamps:{used:5}}),
  'Unused Blog Song':show('Unused Blog Song',['Never projected at all'],{meta:{originalSource:'GospelMinds'}}),
  'Hymn One':show('Hymn One',['Praise to the Lord the Almighty']),
  'A Sermon':show('A Sermon',['Three points today'],{timestamps:{used:9}}),
 };
 const index={h:{name:'Typed By Hand',category:'c1'},b:{name:'Blog Song',category:'lib'},u:{name:'Unused Blog Song',category:'lib'},y:{name:'Hymn One',category:'vp'},s:{name:'A Sermon',category:'talk'}};
 const categories={c1:{name:'Choir Ministration'},lib:{name:'Curated Gospel Library'},vp:{name:'VideoPsalm - English Hymns - Review'},talk:{name:'Presentation (Sermon)'}};
 const row=(source,title,artist,lyrics,url)=>({original_source:source,source_id:'x:1',title,artist,url,languages:['English'],lyrics_blocks:lyrics});
 const verses=Array.from({length:8},(_,i)=>'Line number '+i+' of this worship song');
 const catalogue=[
  row('Iwe Orin Mimo','Praise to the Lord','',['Praise to the Lord, the Almighty\nThe King of creation'],'u1'),
  row('Iwe Orin Mimo','Another Hymn','',['f A different hymn altogether'],'u2'),
  row('Nigerian Praise','CHORUS 12','',['Jesus you are lifted high'],'u3'),
  row('GospelMinds','Way Maker','Sinach',[verses.join('\n')],'u4'),
  row('GospelMinds','Way Maker','Sinach',[verses.join('\n').replaceAll('Line','Word')],'u5'),
  row('GospelMinds','Some Single','Unknown Singer',[verses.join('\n')+' again'],'u6'),
  row('Catholic Book Online','Left Out','',['Not this source at all today'],'u7'),
 ];
 const {library,counts}=await buildSongbook({catalogue,freeshowIndex:index,categories,readShow:name=>shows[name]});
 const of=title=>library.songs.find(s=>s.title===title);
 assert.deepEqual([of('Typed By Hand').meta.status,of('Blog Song').meta.status],['checked','checked']);
 assert.ok(!of('Unused Blog Song')&&!of('A Sermon')&&!of('Some Single')&&!of('Left Out'));
 assert.equal(counts['Iwe Orin Mimo'],1,'the hymn already in VideoPsalm is not kept twice');
 assert.equal(of('Another Hymn').sections[0].slides[0],'A different hymn altogether');
 const chorus=of('Jesus you are lifted high');assert.equal(chorus.meta.aliases,'CHORUS 12');
 assert.equal(library.songs.filter(s=>s.meta.status==='reserve').length,1,'one reserve copy of a repeated title');assert.equal(of('Way Maker').meta.artist,'Sinach');
 assert.equal(new Set(library.songs.map(s=>s.id)).size,library.songs.length,'every song has its own id');
 assert.ok(library.songs.every(s=>/^wl-[a-z0-9-]{8,60}$/.test(s.id)));
});
test('Settings: anything unknown or out of range falls back to the defaults',()=>{
 assert.deepEqual(cleanSettings(undefined),DEFAULT_SETTINGS);assert.deepEqual(cleanSettings('junk'),DEFAULT_SETTINGS);
 const odd=cleanSettings({linesPerSlide:7,hideRepeatMarks:'yes',resultClick:'explode',phoneTap:null,extra:1,searchReserve:false});
 assert.deepEqual(odd,{...DEFAULT_SETTINGS,searchReserve:false});assert.ok(!('extra' in odd));
 for(const n of LINES_PER_SLIDE)assert.equal(cleanSettings({linesPerSlide:n}).linesPerSlide,n);
 assert.equal(cleanSettings({linesPerSlide:'4'}).linesPerSlide,4);
});
const words=(n,prefix='line')=>Array.from({length:n},(_,i)=>prefix+' '+(i+1)).join('\n');
const shown={...DEFAULT_SETTINGS,hideRepeatMarks:false};
test('Lines per slide: long pages are cut to size, blank lines stay slide breaks, nothing is lost, and the song is unchanged',()=>{
 const base=song('wl-l','Lines','[Verse 1]\n'+words(4)+'\n\n'+words(3,'more')+'\n\n[Chorus]\nC1\nC2','Verse 1, Chorus, Verse 1');
 const before=JSON.stringify(base);
 assert.deepEqual(songSlides(base,'e',shown).map(s=>s.text.split('\n').length),[4,3,2,4,3]);
 const two=songSlides(base,'e',{...shown,linesPerSlide:2});
 assert.deepEqual(two.map(s=>s.text),['line 1\nline 2','line 3\nline 4','more 1\nmore 2','more 3','C1\nC2','line 1\nline 2','line 3\nline 4','more 1\nmore 2','more 3']);
 assert.deepEqual(two.map(s=>[s.position,s.page,s.pages]).slice(0,5),[[0,0,4],[0,1,4],[0,2,4],[0,3,4],[1,0,1]]);
 const six=songSlides(base,'e',{...shown,linesPerSlide:6});assert.deepEqual(six.slice(0,2).map(s=>s.text.split('\n').length),[4,3],'a blank line always starts a new slide');
 assert.equal(JSON.stringify(base),before,'the stored song never changes');
});
test('Lines per slide: a blank cue stays in place, an all-blank section stays, and a hidden page stays hidden',()=>{
 const blank=song('wl-b2','Blank','[Verse 1]\nA\nB\n\n(blank)\n\nC\nD\n\n[Tag]\n(blank)','Verse 1, Tag');
 assert.deepEqual(songSlides(blank,'e',{...shown,linesPerSlide:1}).map(s=>s.text),['A','B','','C','D','']);
 const base=song('wl-h2','Hidden','[Verse 1]\nShown\n\nSecret\n\nLast','Verse 1');
 const hidden={...base,arrangements:[{...base.arrangements[0],hidden:{0:[1]}}]};
 assert.deepEqual(songSlides(hidden,'e',{...shown,linesPerSlide:4}).map(s=>s.text),['Shown','Last']);
});
test('Repeat marks go only at the end of a line, and a lyric is never emptied or cut',()=>{
 const look=text=>songSlides(song('wl-r','R','[Verse 1]\n'+text,'Verse 1'),'e',DEFAULT_SETTINGS)[0].text;
 assert.equal(look('Holy holy (2x)'),'Holy holy');assert.equal(look('Holy holy x3'),'Holy holy');assert.equal(look('Holy holy 2X'),'Holy holy');assert.equal(look('Holy holy [Repeat]'),'Holy holy');assert.equal(look('Holy (repeat twice)'),'Holy');assert.equal(look('Sing it (twice)'),'Sing it');
 assert.equal(look('We repeat the sounding joy'),'We repeat the sounding joy');assert.equal(look('I will repeat'),'I will repeat','repeat without brackets is a word');
 assert.equal(look('Max 2 lives'),'Max 2 lives');assert.equal(look('Psalm 23'),'Psalm 23');assert.equal(look('Fox2'),'Fox2');assert.equal(look('(2x)'),'(2x)','a line that is only a mark stays rather than vanishing');
});
test('All capitals keeps Yoruba marks, and the matched line is still found after splitting and capitals',()=>{
 const s=song('wl-c','Caps','[Verse 1]\nỌlọ́run mi (2x)\nKọ orin\nThird one\nFourth one','Verse 1');
 const pages=songSlides(s,'e',{...DEFAULT_SETTINGS,allCaps:true,linesPerSlide:2});
 assert.equal(pages[0].text,'ỌLỌ́RUN MI\nKỌ ORIN');
 assert.equal(matchedSlide(pages,'Fourth one').page,1);assert.equal(matchedSlide(pages,'Ọlọ́run mi (2x)').page,0,'a repeat mark in the search line does not stop the match');
 assert.equal(matchedSlide(pages,''),undefined);assert.equal(matchedSlide(pages,'nowhere at all'),undefined);
});
test('The deck follows the settings, only for songs, and the cached deck never goes stale',()=>{
 const entry={entryId:'e1',song:song('wl-d2','Deck','[Verse 1]\n'+words(4),'Verse 1')};
 const draft=cleanDraft({...DEFAULT,songs:[entry],notes:[],passage:'In the beginning God created the heaven and the earth.',includePassage:true});
 try{
  applySettings({linesPerSlide:0});const passage=deckFor(draft).filter(s=>s.type==='passage').map(s=>s.text);
  assert.equal(deckFor(draft).filter(s=>s.song).length,1);
  applySettings({linesPerSlide:1});assert.equal(deckFor(draft).filter(s=>s.song).length,4,'the cache does not hide the change');
  assert.deepEqual(deckFor(draft).filter(s=>s.type==='passage').map(s=>s.text),passage,'Bible slides are untouched');
  applySettings({songFooter:false});assert.equal(makeDeck(draft).find(s=>s.song).reference,'');
  applySettings({songFooter:true});assert.match(makeDeck(draft).find(s=>s.song).reference,/^Deck · Verse 1$/);
 }finally{applySettings({});}
 assert.deepEqual(settings(),DEFAULT_SETTINGS);
});
test('The phone opens a song at the slide holding the matched line',()=>{
 const live={style:{theme:'midnight'},slides:[],index:0};
 const s=song('wl-p2','Phone','[Verse 1]\n'+words(4)+'\n\n[Chorus]\nC1\nC2','Verse 1, Chorus');
 try{
  applySettings({linesPerSlide:2});
  const at=songScreen(live,s,0,'line 4');assert.equal(at.slides[at.index].text,'line 3\nline 4');
  assert.equal(songScreen(live,s,0,'not there').index,0,'no match opens the first slide of that part');
  const chorus=songScreen(live,s,1);assert.equal(chorus.slides[chorus.index].text,'C1\nC2');
  assert.throws(()=>songScreen(live,s,9),/no longer there/);
 }finally{applySettings({});}
});
test('The fast check before reading lines gives the same answers',()=>{
 for(const q of ['promise keeper','miracle','olorun oba','korin iyin','oluwa loba','light in the','sinach','shine on','you here','moving midst worship'])assert.ok(find(q).length>0,q);
 assert.deepEqual(find('here worship').map(h=>h.id),['wl-a'],'words across two lines still match');
});
test('Punctuation or emoji alone finds nothing, and only an empty box lists every song',()=>{
 for(const q of ['???','*','😀','(','%'])assert.deepEqual(find(q),[],q);
 assert.equal(find('   ').length,library.length);
});
test('Marks that look like repeats but are not stay in the words',()=>{
 const look=text=>songSlides(song('wl-r2','R','[Verse 1]\n'+text,'Verse 1'),'e',DEFAULT_SETTINGS)[0].text;
 assert.equal(look('Seventy x 7'),'Seventy x 7');assert.equal(look('Psalm 23 x'),'Psalm 23 x');
 const long=song('wl-r3','R','[Verse 1]\nwords'+' '.repeat(19000)+'more','Verse 1'),started=performance.now();songSlides(long,'e',DEFAULT_SETTINGS);assert.ok(performance.now()-started<50,'a long run of spaces costs nothing');
});
test('A page removed from a song stays out at any split, and no other words go missing',()=>{
 const entry={entryId:'e1',song:song('wl-x','Removed','[Verse 1]\nA1\nA2\n\nB1\nB2\n\nC1\nC2','Verse 1')};
 const draft=cleanDraft({...DEFAULT,songs:[entry],notes:[],passage:'',includePassage:false,excludedSlides:['song-e1-0-1']});
 const words=()=>makeDeck(draft).filter(s=>s.song).map(s=>s.text.replaceAll('\n',' '));
 try{
  assert.deepEqual(words(),['A1 A2','C1 C2']);
  applySettings({linesPerSlide:1});assert.deepEqual(words(),['A1','A2','C1','C2']);
  applySettings({linesPerSlide:4});assert.deepEqual(words(),['A1 A2','C1 C2']);
 }finally{applySettings({});}
});
test('Pages moved at one split do not scramble another',()=>{
 const entry={entryId:'e1',song:song('wl-y','Moved','[Verse 1]\nA1\nA2\n\nB1\nB2\n\nC1\nC2','Verse 1')};
 const draft=cleanDraft({...DEFAULT,songs:[entry],notes:[],passage:'',includePassage:false,slideOrder:['song-e1-0-2','song-e1-0-0','song-e1-0-1']});
 try{
  assert.deepEqual(makeDeck(draft).filter(s=>s.song).map(s=>s.text.slice(0,2)),['C1','A1','B1']);
  applySettings({linesPerSlide:1});assert.deepEqual(makeDeck(draft).filter(s=>s.song).map(s=>s.text),['A1','A2','B1','B2','C1','C2']);
 }finally{applySettings({});}
});
test('One-chapter books read a lone number as a verse',()=>{
 assert.equal(parseReference('Jude 5').reference,'Jude 1:5');assert.equal(parseReference('Jude 3-5').reference,'Jude 1:3-5');assert.equal(parseReference('Philemon 3').reference,'Philemon 1:3');
 assert.equal(parseReference('Jude 1').reference,'Jude 1','the whole book');assert.equal(parseReference('Jude 1:5').reference,'Jude 1:5');
 assert.equal(parseReference('John 3').reference,'John 3','other books keep chapters');
});

test('A song rebuilt from the search cache finds the same lines as one read from its file',()=>{
 const fresh=library;
 const restored=JSON.parse(JSON.stringify(fresh.map(entryForCache))).map((saved,i)=>entryFromCache(saved,{uses:fresh[i].uses,modified:fresh[i].modified}));
 assert.deepEqual(restored,fresh);
 for(const query of ['way maker','miracle worker','kọ rin iyin','oluwa loba','light in the valley','waymaker'])
  assert.deepEqual(findInSongbook(restored,query,vocabulary(restored)),findInSongbook(fresh,query,vocabulary(fresh)),query);
});
