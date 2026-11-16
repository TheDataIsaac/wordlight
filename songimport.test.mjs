// Songs from other programs: SongSelect (.usr and .txt), OpenLyrics, ChordPro and plain text. The lyrics below are made up.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {songToText,arrangementText} from './dist/songs.mjs';
import {fromSongSelectUsr,fromSongSelectText,fromOpenLyrics,fromChordPro,fromPlainText,songFromImportedFile} from './dist/song-import.mjs';

const sections=song=>song.sections.map(s=>[s.label,s.slides]);
const order=song=>arrangementText(song);

test('A SongSelect .usr file keeps its sections, author, copyright and CCLI number',()=>{
 const usr=['[File]','Type=SongSelect Import File','Version=3.0','[S A1234567]','Title=Morning Light','Author=Ann Writer | Ben Composer','Copyright=2020 Sample Music','Admin=Sample Admin','Keys=G',
  'Fields=Verse 1/tChorus/tVerse 2','Words=First line of the verse/nSecond line of the verse/tChorus line one/nChorus line two/tAnother verse line/nLast line'].join('\r\n');
 const song=fromSongSelectUsr(usr);
 assert.equal(song.title,'Morning Light');
 assert.deepEqual(sections(song),[['Verse 1',['First line of the verse\nSecond line of the verse']],['Chorus',['Chorus line one\nChorus line two']],['Verse 2',['Another verse line\nLast line']]]);
 assert.deepEqual([song.meta.author,song.meta.copyright,song.meta.ccli],['Ann Writer, Ben Composer','2020 Sample Music','1234567']);
 assert.equal(order(song),'Verse 1, Chorus, Verse 2');
});

test('A SongSelect lyrics .txt reads its headings and its footer',()=>{
 const txt=`Morning Light

Verse 1
First line of the verse
Second line of the verse

Chorus
Chorus line one
Chorus line two

Verse 2
Another verse line

CCLI Song # 7654321
Ann Writer
© 2020 Sample Music
For use solely with the SongSelect® Terms of Use. All rights reserved. www.ccli.com
CCLI License # 11111`;
 const song=fromSongSelectText(txt);
 assert.equal(song.title,'Morning Light');
 assert.deepEqual(song.sections.map(s=>s.label),['Verse 1','Chorus','Verse 2']);
 assert.deepEqual([song.meta.ccli,song.meta.author,song.meta.copyright],['7654321','Ann Writer','2020 Sample Music']);
 assert.ok(!songToText(song).includes('CCLI'),'the footer is not part of the lyrics');
});

test('OpenLyrics keeps the verse order, splits slides at <lines>, joins v1a and v1b, and drops chords and tags',()=>{
 const xml=`<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9">
 <properties><titles><title>River &amp; Stone</title></titles><authors><author>Ann Writer</author><author type="music">Ben Composer</author></authors>
  <copyright>2019 Sample</copyright><ccliNo>222333</ccliNo><verseOrder>v1 c v2 c c</verseOrder></properties>
 <lyrics>
  <verse name="v1a"><lines>First <chord name="G"/>line<br/>Second line</lines></verse>
  <verse name="v1b"><lines>Third line<br/><tag name="i">Fourth</tag> line</lines></verse>
  <verse name="c"><lines>Chorus one<br/>Chorus two</lines><lines>Chorus three</lines></verse>
  <verse name="v2"><lines><!-- comment -->Verse two line</lines></verse>
 </lyrics>
</song>`;
 const song=fromOpenLyrics(xml);
 assert.equal(song.title,'River & Stone');
 assert.deepEqual(sections(song),[['Verse 1',['First line\nSecond line','Third line\nFourth line']],['Chorus',['Chorus one\nChorus two','Chorus three']],['Verse 2',['Verse two line']]]);
 assert.equal(order(song),'Verse 1, Chorus, Verse 2, Chorus','repeats kept, a doubled chorus sung once');
 assert.deepEqual([song.meta.author,song.meta.ccli],['Ann Writer, Ben Composer','222333']);
});

test('ChordPro loses its chords and keeps its title, chorus block and named verses',()=>{
 const cho=`{title: Open Door}
{artist: Ann Writer}
{ccli: 555}
# a comment line
[G]First line of [C]verse one
Second [D]line

{start_of_chorus}
[G]Chorus words here
Chorus second line
{end_of_chorus}

{comment: Verse 2}
Second verse words`;
 const song=fromChordPro(cho);
 assert.equal(song.title,'Open Door');
 assert.deepEqual(sections(song),[['Verse 1',['First line of verse one\nSecond line']],['Chorus',['Chorus words here\nChorus second line']],['Verse 2',['Second verse words']]]);
 assert.deepEqual([song.meta.author,song.meta.ccli],['Ann Writer','555']);
});

test('Plain text: headings or [markers] make sections, otherwise each paragraph is a slide; the file name is the title',()=>{
 const plain=fromPlainText('Line one\nLine two\n\nLine three\n\nLine four','Simple Song');
 assert.deepEqual(sections(plain),[['Verse 1',['Line one\nLine two','Line three','Line four']]]);
 const marked=fromPlainText('[Verse 1]\nA\n\n[Chorus]\nB\n\n[Verse 1]\nA','Marked');
 assert.deepEqual(sections(marked).map(s=>s[0]),['Verse 1','Chorus'],'the same section twice is one section');
 assert.equal(order(marked),'Verse 1, Chorus, Verse 1');
 const headed=fromPlainText('Verse 1:\nA\n\nchorus\nB','Headed');
 assert.deepEqual(sections(headed).map(s=>s[0]),['Verse 1','Chorus']);
});

test('The reader is chosen from the file name and content, and an empty file says why it failed',()=>{
 assert.equal(songFromImportedFile('song.usr','Title=X\nFields=Verse 1\nWords=a/nb').title,'X');
 assert.equal(songFromImportedFile('export.xml','<song xmlns="http://openlyrics.info/namespace/2009/song"><properties><titles><title>Y</title></titles></properties><lyrics><verse name="v1"><lines>y</lines></verse></lyrics></song>').title,'Y');
 assert.equal(songFromImportedFile('chords.cho','[C]words').title,'chords');
 assert.equal(songFromImportedFile('Morning_Light.txt','some words\nmore words').title,'Morning Light');
 assert.equal(songFromImportedFile('lyrics.txt','Title\n\nVerse 1\nwords\n\nCCLI Song # 9').meta.ccli,'9');
 assert.throws(()=>songFromImportedFile('empty.txt','   \n\n'),/No lyrics/);
});
