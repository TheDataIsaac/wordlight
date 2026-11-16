// Finding a verse by its words: the rules shared by the companion's search, the studio and the phone.
import {foldWords} from './songs.mjs';

// Words match on their first five letters, after a plural "s" is dropped, so "strengthens" finds "strengtheneth".
export function wordKey(word){
 const singular=word.length>3&&word.endsWith('s')?word.slice(0,-1):word;
 return singular.slice(0,5);
}

// Common words that alone say little about which verse is meant (English, and Yoruba after folding).
export const SMALL_WORDS=new Set(['a','an','and','the','of','to','in','that','for','is','be','it','he','his','him','i','me','my','you','ye','your','thou','thee','thy','they','them','we','us','our','with','unto','shall','will','not','but','all','are','was','as','by','on','so','who','which','this','from','at','or',
 'ati','ni','si','ti','fun','o','ko','yi','na','awon','mo','a','e','won','je','pe','li']);

// Text with no digits and at least two words is a quote to search for, not a reference ("for God so loved").
// References always have a chapter number, except whole one-chapter books, which are a single word.
export function looksLikeWords(text){
 const value=String(text||'').trim();
 return !/\d/.test(value)&&foldWords(value).split(' ').filter(Boolean).length>=2;
}

const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Verse text as HTML with the typed words in bold, so the operator can see at a glance why a verse matched.
export function markMatches(text,query){
 const typed=new Set(foldWords(query).split(' ').filter(w=>w&&!SMALL_WORDS.has(w)).map(wordKey));
 return String(text).split(/([\p{L}\p{M}\p{N}'’]+)/u).map(part=>{
  const word=foldWords(part);
  return word&&!word.includes(' ')&&typed.has(wordKey(word))?'<b>'+escape(part)+'</b>':escape(part);
 }).join('');
}

// The result list under the Bible box. state: {query, results, searched, busy, error}; current: the reference in the preview.
export function verseResultsMarkup(state,current=''){
 if(!state)return '';
 const head='<div class="verse-results-head"><span>'+(state.busy?'Finding verses with these words…':state.results.length?'Verses with these words':'No verse found')+'</span><button class="icon-button" data-action="verse-results-close" aria-label="Close the verse list" title="Close">×</button></div>';
 if(state.error)return head+'<p class="small-note status-error">'+escape(state.error)+'</p>';
 if(state.busy)return head;
 if(!state.results.length)return head+'<p class="small-note">Nothing in '+escape(state.searched.join(', ')||'the installed Bibles')+' has these words. Try fewer or different words.</p>';
 const rows=state.results.map((r,i)=>'<li><button class="verse-result'+(r.reference===current?' active':'')+'" data-action="verse-result" data-result-index="'+i+'" title="Click to preview. Double-click to send to screen.">'+
  '<span class="verse-result-ref">'+escape(r.reference)+' <span class="verse-result-version">'+escape(r.translation)+(r.exact?' · exact words':'')+'</span></span>'+
  '<span class="verse-result-text">'+markMatches(r.text,state.query)+'</span></button></li>').join('');
 return head+'<ol class="verse-results-list">'+rows+'</ol><p class="small-note">Searched '+escape(state.searched.join(', '))+'. A verse loads in the version chosen below. Click to preview, double-click to send.</p>';
}
