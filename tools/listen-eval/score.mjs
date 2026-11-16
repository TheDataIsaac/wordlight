// Scores verse listening on a recorded sermon.
// Ground truth: references said in the Scribe transcript (careful, offline). Tested: the same detector on what the
// streaming model heard, plus verse search on the words it heard. A detection counts if it names the same verse
// within 30 s of the moment in the transcript.
//   node tools/listen-eval/score.mjs <transcript.json> <heard.json> <biblesDir>
// transcript.json: a careful transcript with timed segments ({segments:[{start, text}]}), for example from ElevenLabs
// Scribe. heard.json: the output of transcribe.mjs. biblesDir: an installed copy's <data>\bibles.
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const [scribePath,asrPath,biblesDir]=process.argv.slice(2);
const repo=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const load=file=>import(pathToFileURL(path.join(repo,file)).href);
const {findSpokenReferences}=await load('dist/spoken-reference.mjs');
const {createBibleSearch}=await load('bible-search.mjs');
const {QUOTE_SCORE,QUOTE_MARGIN}=await load('listen.mjs');

const scribe=JSON.parse(readFileSync(scribePath,'utf8')),asr=JSON.parse(readFileSync(asrPath,'utf8'));
function detect(segments){
 let context={};const out=[];
 for(const s of segments){const r=findSpokenReferences(s.text,context);context=r.context;for(const ref of r.references)out.push({...ref,at:s.start});}
 return out;
}
const truth=detect(scribe.segments),heard=detect(asr.phrases);
const same=(a,b)=>a.bookId===b.bookId&&a.chapter===b.chapter&&a.verse===b.verse;
const near=(a,b,s=30)=>Math.abs(a.at-b.at)<=s;
const mmss=t=>Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');

console.log('\n== Said in the sermon (Scribe) and whether listening caught it');
let caught=0;
for(const t of truth){
 const hit=heard.find(h=>same(h,t)&&near(h,t));
 if(hit)caught++;
 console.log((hit?'CAUGHT ':'missed ')+mmss(t.at).padStart(6)+'  '+t.reference.padEnd(22)+' said: "'+t.heard+'"'+(hit?'   heard: "'+hit.heard+'" ('+hit.confidence+')':''));
}
const extra=heard.filter(h=>!truth.some(t=>same(h,t)&&near(h,t,60)));
console.log('\n== Heard by listening but not in the transcript ('+extra.length+')');
for(const h of extra)console.log('  '+mmss(h.at).padStart(6)+'  '+h.reference.padEnd(22)+' heard: "'+h.heard+'" ('+h.confidence+')');

// Verse search on what was heard: each phrase with the one before it.
const listInstalled=()=>readdirSync(biblesDir).map(id=>{const m=JSON.parse(readFileSync(path.join(biblesDir,id,'manifest.json'),'utf8'));return {id,abbreviation:m.abbreviation,installed:true,installedAt:m.installedAt||1};}).filter(b=>b.abbreviation!=='OYCB');
const search=createBibleSearch({root:biblesDir,listInstalled});
await search.warm();
console.log('\n== Verses found from the words heard (score, lead over the runner-up). SUGGEST: what Wordlight would offer.');
const quotes=[];
for(let i=0;i<asr.phrases.length;i++){
 const words=(asr.phrases[i-1]?.text+' '+asr.phrases[i].text).split(/\s+/).slice(-24).join(' ');
 if(words.split(' ').length<6)continue;
 const r=await search.search(words);
 const [top,second]=r.results;if(!top)continue;
 quotes.push({at:asr.phrases[i].start,reference:top.reference,score:top.score,margin:top.score-(second?.score||0),words,bookId:top.bookId,chapter:top.chapter,verse:top.verse,text:top.text});
}
quotes.sort((a,b)=>b.score-a.score);
for(const q of quotes.slice(0,40)){
 const backed=truth.some(t=>t.bookId===q.bookId&&t.chapter===q.chapter&&Math.abs(t.at-q.at)<=180);
 console.log((q.score>=QUOTE_SCORE&&q.margin>=QUOTE_MARGIN?'SUGGEST ':'        ')+q.score.toFixed(2)+' +'+q.margin.toFixed(2)+'  '+mmss(q.at).padStart(6)+'  '+q.reference.padEnd(22)+(backed?' [chapter announced]':'              ')+'  heard: "'+q.words.slice(-90)+'"');
}
console.log('\nCaught '+caught+' of '+truth.length+' references said; '+extra.length+' extra. Model RTF '+asr.rtf+', cores busy while decoding '+asr.cpuCoresBusy+'.');
