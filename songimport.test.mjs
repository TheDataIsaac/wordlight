// Songs from other programs: SongSelect (.usr and .txt), OpenLyrics, ChordPro and plain text. The lyrics below are made up.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {songToText,arrangementText} from './dist/songs.mjs';
import {fromSongSelectUsr,fromSongSelectText,fromOpenLyrics,fromChordPro,fromPlainText,songFromImportedFile,decodeSongFile,rtfToText,fromEasyWorship} from './dist/song-import.mjs';

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
 assert.equal(order(song),'Verse 1, Chorus, Verse 2, Chorus, Chorus','a chorus written twice is sung twice');
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

test('Song files in UTF-16 or an old Windows code page are read; binary files such as ProPresenter 7 .pro are refused',()=>{
 const usr='Title=Wide Text\r\nFields=Verse 1\r\nWords=Line with é accent/nSecond line';
 const utf16=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(usr,'utf16le')]);
 assert.equal(songFromImportedFile('a.usr',decodeSongFile(utf16)).title,'Wide Text');
 assert.match(decodeSongFile(Buffer.from(usr,'utf16le')),/é accent/,'UTF-16 without a mark');
 assert.match(decodeSongFile(Buffer.from([0x63,0x61,0x66,0xe9])),/café/,'Windows-1252');
 assert.equal(decodeSongFile(Buffer.from('\uFEFFHello','utf8')),'Hello','UTF-8 mark dropped');
 const binary=Buffer.from([0x0a,0x12,0x00,0x08,0x01,0x12,0x0c,0x00,0x8f,0x01,0x00,0x22]);
 assert.throws(()=>decodeSongFile(binary,'Song.pro'),/ProPresenter/);
 assert.throws(()=>decodeSongFile(binary,'thing.txt'),/not a text song file/);
 assert.throws(()=>songFromImportedFile('Song.pro','Just some words'),/not ChordPro/);
 assert.equal(songFromImportedFile('Song.pro','{title: Real ChordPro}\n[C]words').title,'Real ChordPro');
});

test('EasyWorship words (RTF) become sections and slides; accents and Unicode letters survive',()=>{
 const rtf=String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Tahoma;}}{\colortbl ;\red0\green0\blue0;}{\*\generator Riched20;}\pard\f0\fs24 Verse 1\par First line caf\'e9\par Second \u7865?line\par\par Chorus\par Chorus words\par}`;
 assert.equal(rtfToText(rtf),'Verse 1\nFirst line café\nSecond ẹline\n\nChorus\nChorus words');
 const song=fromEasyWorship({title:'EW Song',author:'Ann Writer / Ben Composer',copyright:'2020 Sample',ccli:'12 34',words:rtf});
 assert.deepEqual(sections(song),[['Verse 1',['First line café\nSecond ẹline']],['Chorus',['Chorus words']]]);
 assert.deepEqual([song.meta.author,song.meta.ccli],['Ann Writer, Ben Composer','1234']);
});
