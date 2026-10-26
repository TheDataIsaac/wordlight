import {freshPresentationFiles,refreshedOutputURL} from './refresh.mjs';
import {fitStage} from './fit.mjs';
import {readLibrary,saveLibrary,chooseLocalLibrary,libraryTime} from './storage.mjs';
import {lookupYoruba,YORUBA_CREDIT} from './yoruba.mjs';
import {cleanTimer,timerValue,formatTimer,changeTimer,cleanTimerAppearance,timerAppearanceStyle} from './timer.mjs';
import {applyPastedNKJV,applyBiblePassage,cleanLibrary,createShow,activeShow,mergeShows,slideGroups,moveGroups,removeGroups,copyGroups,groupKey,MAX_SHOWS,MAIN_SCENE,activeScene,sceneDraft,switchScene,addScene,renameScene,removeScene,restoreScene,copyShow,moveSlides,removeSlides,copySlides,itemSummary,isEmptyDraft,addItem,moveScene,applyDesignToAll,undoDesignToAll,backgroundAssetIds,wordsToAll,undoWordsToAll,planSplit,splitItem,undoSplit,addContent} from './library.mjs';
import {parseReference,suggestBooks,withBook} from './reference.mjs';
import {lowerThirdFlow,cleanLowerThird,lowerThirdBandStyle,lowerThirdContent} from './lowerthird.mjs';
import {cleanGraphics,graphicsMarkup,graphicsTimerShown,GRAPHICS_POSITIONS,CARD_POSITIONS,GRAPHICS_LIMITS} from './graphics.mjs';
import {bollsPassage,bollsChapter} from './bolls.mjs';
import {readPairing,savePairing,forgetPairing,companionStatus,sendToCompanion,needsResend,nextPending,isOlderSend,companionLive,describeViewers,COMPANION_URL} from './bridge.mjs';
import {SECTIONS,pickerBooks,pickVerse,selectionReference,chapterReference,versesIn,readRecent,rememberRecent} from './picker.mjs';
import {matchingBooks,completeBook} from './reference.mjs';
import {newSong,editSong,songToText,arrangementText,readSongFile,songFile} from './songs.mjs';
import {adjacentVerse,adjacentByChapter,rangeFromResponse,TRANSLATIONS,isLookupKey} from './scripture.mjs';
import {readLimitedJSON} from './readlimit.mjs';
import {AO_CATALOG_URL,catalogRows,filterRows,coverage,aoCredit,aoChapter,lookupAO,readPinned,savePinned} from './versions.mjs';
import {openPhoneRemote} from './remote-setup.mjs';
import {FONTS,THEMES,DEFAULT,cleanDraft,deckFor,snapshot,validLive,occurrences,matchRegex,safeColor,getHighlights,nextHighlightColor,highlightPalette,highlightSegments,safeEmphasis,contrastInk,cleanTextSlide,fitPadding,FIT_PADDING,assetId} from './core.mjs';
const $=s=>document.querySelector(s);
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=v=>JSON.parse(JSON.stringify(v));
const icons={book:'M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2zM12 6v15',screen:'M3 4h18v13H3zM8 21h8M12 17v4',arrow:'M5 12h14M14 7l5 5-5 5',plus:'M12 5v14M5 12h14',download:'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',upload:'M12 16V3M7 8l5-5 5 5M4 16v5h16v-5',chevron:'M9 5l7 7-7 7',left:'M15 5l-7 7 7 7',check:'M5 12l4 4L19 6',spark:'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z',search:'M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',copy:'M8 8h13v13H8zM16 8V3H3v13h5',expand:'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',moon:'M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12'};
const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+(icons[name]||icons.book)+'"/></svg>';
function load(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
let draft;try{draft=cleanDraft(load('wordlight-draft')||clone(DEFAULT));}catch{draft=clone(DEFAULT);}
let library,libraryError='',recoveredLibrary=false;try{const saved=readLibrary(localStorage,draft);library=saved.library;recoveredLibrary=saved.recovered;draft=activeShow(library).draft;}catch(err){libraryError=err.message;library=cleanLibrary(null,draft);}
let saveStatusText=libraryError?'Saved data needs recovery':recoveredLibrary?'Recovered previous save':'Saved in this browser';
const cachedLive=load('wordlight-live');let live=validLive(cachedLive)?cachedLive:{...snapshot(draft),blank:true};
// Deck selection mode, the last thumbnail click (for double-click) and the last removed scene.
let deckSelecting=false,deckSelection=new Set(),lastCardClick=null,removedScene=null;
// Web studio pairing with the local companion, and its last known state (also shown in the live bar).
let pairing=null;try{pairing=readPairing(localStorage);}catch{}
let companion={state:pairing?'checking':'unpaired'},shownCompanionState='';
// A Send from this web studio that has not reached the companion yet (see nextPending). Kept in memory only.
let pendingLive=null,latestSend=null;
// Images in the companion's store (graphics and slide backgrounds), and the graphics dialog state.
let graphicsAssets=[],graphicsUpload='logo',graphicsDraft=null,previewBackground=false,designAssets=false;
// Previous/Next verse clicks waiting to be applied, and whether a step is running.
let verseSteps=0,verseStepping=false,verseIntent=0;
const songState={source:'all',native:0,query:'',category:'',items:[],total:0,library:0,categories:null,selected:null,arrangementId:'',error:'',request:0,timer:0};
// Rundown state: the last item action that can be undone, whether Item actions is open, and item summaries.
let itemUndo=null,itemMenuOpen=false,summaryCache=new WeakMap();
// The app's name, and the companion's version and build (from /api/health); a review copy is labelled in every render.
const APP_NAME='Wordlight · Church Media';let appInfo=null;
// Slide strip scroll per item (keyed by show and item, since the first item's id repeats between shows): kept while
// working in one item, restored when coming back to it.
let deckScrollItem='';const deckScrolls=new Map();
const deckKey=()=>{const show=activeShow(library);return show.id+':'+show.activeSceneId;};
const autoName=name=>/^(Scene|Item) \d+$/.test(name);
// Which copy of the live output the studio shows: full screen or lower third. Studio only.
let liveView='full';try{const saved=localStorage.getItem('wordlight-live-view');if(saved==='lower'||saved==='graphics')liveView=saved;}catch{}
let tab='slides',isLocal=false,localReachable=false,saveTimer,toastTimer,dictionary=[],lookupId=0,wordLookupId=0;
// view=output is the full-screen output, view=lower the transparent lower third. Both follow the same live state.
const outputView=new URLSearchParams(location.search).get('view'),isLower=outputView==='lower',isGraphics=outputView==='graphics',isOutput=outputView==='output'||isLower||isGraphics;
let channel;try{channel=new BroadcastChannel('wordlight-screen-v1');channel.onmessage=ev=>receive(ev.data);}catch{}
function toast(text){if(!text)return;const dialog=document.querySelector('dialog[open]');if(dialog){let feedback=dialog.querySelector('.dialog-feedback');if(!feedback){feedback=document.createElement('p');feedback.className='dialog-feedback';feedback.setAttribute('role','status');dialog.append(feedback);}feedback.textContent=text;}$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function remember(){
 const show=activeShow(library);show.draft=draft;show.updated=Date.now();library.savedAt=Math.max(Date.now(),(library.savedAt||0)+1);
 if(libraryError){setSaveStatus('Library needs recovery');toast('Saved library could not be opened. Export this show before continuing: '+libraryError);return;}
 try{saveLibrary(localStorage,library);setSaveStatus(isLocal?'Saving…':'Saved in this browser');}catch{setSaveStatus('Storage full · export library');toast('Browser storage is full. Export your library to keep every show.');}
 if(isLocal)saveRevision++;clearTimeout(saveTimer);saveTimer=setTimeout(flushLocalSave,450);
 const option=$('#showSwitcher option:checked');if(option)option.textContent=draft.title||'Untitled show';
}
function setSaveStatus(text){saveStatusText=text;const el=$('#saveStatus');if(el)el.textContent=text;}
async function apiWrite(data){const r=await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)});if(!r.ok)throw Object.assign(new Error('Could not save to the local app.'),{status:r.status});return r.json();}
function cacheLive(){try{localStorage.setItem('wordlight-live',JSON.stringify(live));}catch{}}
function receive(data){if(data?.type==='live'&&validLive(data.live)){live=data.live;cacheLive();if(isOutput)renderOutput();else renderLive();}}
window.addEventListener('storage',ev=>{if(ev.key==='wordlight-live'&&ev.newValue){try{receive({type:'live',live:JSON.parse(ev.newValue)});}catch{}}});
async function publish(next){
 next.timer=cleanTimer(next.timer||live.timer);next.lowerThird=cleanLowerThird(next.lowerThird||live.lowerThird);next.graphics=cleanGraphics(next.graphics||live.graphics);next.updated=Date.now();
 const size=JSON.stringify(next).length,mb=n=>(n/1e6).toFixed(1)+' MB';
 if(isLocal&&size>24e6){toast('This deck is too large to send ('+mb(size)+'; the companion accepts 24 MB). Split it into scenes. The screen is unchanged.');return false;}
 if(!isLocal&&pairing&&size>9.5e6)toast('This deck ('+mb(size)+') is over the 10 MB bridge limit, so the OBS companion will not get it. Split it into scenes.');
 if(isLocal){try{await apiWrite({live:next});localReachable=true;}catch{localReachable=false;toast('The local app is disconnected. The screen has kept its last slide.');return false;}}
 live=next;cacheLive();channel?.postMessage({type:'live',live});
 if(isOutput)renderOutput();else {renderLive();renderDeck();}paintTimers();
 // The web studio's presentation window always has the new screen. OBS counts only when the paired companion
 // accepted it; the answer decides what the studio says.
 if(!isLocal&&!isOutput){
  if(!pairing)return {obs:'none'};
  // The Send is owed from the moment it starts, so a status poll meanwhile cannot replace it with the old screen,
  // and a late answer to an older Send cannot clear a newer one.
  const sent=live;pendingLive=sent;latestSend=sent;const result=await sendToCompanion(pairing,sent);
  // A newer Send has started meanwhile: its answer decides the status and the message, not this one.
  if(isOlderSend(sent,latestSend))return {obs:'superseded'};
  pendingLive=nextPending(pendingLive,sent,result.state,latestSend);showCompanion(result);
  return {obs:result.state==='connected'?'sent':'failed'};
 }
 return {obs:isLocal?'sent':'none'};
}
// What a Send reached, in words. The local studio drives the outputs directly.
function sentMessage(what,sent){
 if(isLocal)return what+' is now on screen.';
 if(sent?.obs==='sent')return 'Sent to OBS and presentation.';
 if(sent?.obs==='none')return 'Presentation updated. OBS is not connected.';
 if(sent?.obs==='superseded')return '';
 return 'Presentation updated. OBS send failed: '+companionText().split(' · ')[0]+'.';
}
const button=(text,action,ic='',cls='')=>'<button class="button '+cls+'" data-action="'+action+'">'+(ic?icon(ic):'')+text+'</button>';
// Short help that stays folded until asked for.
function tip(text){return '<details class="tip"><summary aria-label="Help" title="Help">?</summary><p>'+text+'</p></details>';}
function label(text,id){return '<label class="label" for="'+id+'">'+text+'</label>';}
function input(id,value,extra=''){return '<input class="input" id="'+id+'" value="'+e(value)+'" '+extra+'>';}
function getNote(){const scope=activeTextSlide()?.id||'';return draft.notes.find(n=>n.id===draft.selectedNoteId&&(n.slideId||'')===scope);}
function render(){
 if(isOutput){renderOutput();return;}
 // Rebuilding the studio would reset every scroll position; put them back afterwards. The side panel keeps
 // its position unless the tab changed.
 // The strip's position is stored for the item it shows; renderDeck restores the right item's position afterwards.
 const deck=$('#deck');if(deck&&deckScrollItem)deckScrolls.set(deckScrollItem,deck.scrollLeft);
 const sameTab=renderedTab===tab,spots=[['.main','scrollTop'],...(sameTab?[['.sidebar','scrollTop'],['#panel','scrollTop']]:[])].map(([sel,prop])=>[sel,prop,$(sel)?.[prop]||0]),pageX=window.scrollX,pageY=window.scrollY;
 renderStudio();renderedTab=tab;
 for(const [sel,prop,value] of spots){const el=$(sel);if(el&&value)el[prop]=value;}
 if(pageX||pageY)window.scrollTo(pageX,pageY);
}
let renderedTab=null;
function renderStudio(){
 document.title=APP_NAME+(appInfo?.preview?' (preview)':'');
 $('#app').innerHTML='<header class="topbar"><a class="logo" href="./" aria-label="Wordlight home"><div class="logo-mark">'+icon('book')+'</div>wordlight<span>CHURCH MEDIA'+(appInfo?.preview?' · PREVIEW':'')+'</span></a><div class="top-divider"></div><input id="sessionTitle" class="session-name" value="'+e(draft.title)+'" aria-label="Show title" maxlength="100"><div class="top-actions"><span class="save-status" id="saveStatus">'+e(saveStatusText)+'</span>'+button('Shows','shows','book')+button('Save show','export','download')+button('Present','present','screen','primary')+'<button class="button" data-action="refresh-presentation" title="Fetch fresh app files and reload the audience window. Saved shows stay intact. The screen may briefly flash.">Refresh presentation</button>'+'</div></header>'+
 '<div class="show-switch-bar"><label for="showSwitcher">CURRENT SHOW</label><select id="showSwitcher" aria-label="Current show">'+library.shows.map(s=>'<option value="'+e(s.id)+'" '+(s.id===library.activeShowId?'selected':'')+'>'+e(s.draft.title)+'</option>').join('')+'</select><span>'+library.shows.length+' saved show'+(library.shows.length===1?'':'s')+'</span></div><div class="workspace"><aside class="sidebar"><section id="rundown" class="rundown" aria-label="Items in this show"></section><nav class="steps" aria-label="Study steps">'+[['slides','Slides'],['passage','Bible'],['songs','Songs'],['words','Words'],['design','Design']].map(([id,t],i)=>'<button class="step '+(tab===id?'active':'')+'" data-tab="'+id+'"><span class="num">'+(i+1)+'</span>'+t+'</button>').join('')+'</nav><div id="panel"></div></aside>'+
 '<main class="main"><div class="main-heading">'+button('Timer','timer')+button('Graphics','graphics-open')+button('OBS & screens','help','screen')+(isLocal?button('Phone remote','phone-remote'):'')+'</div><div class="stage-pair"><section class="stage-column"><div class="preview-header"><span class="preview-label"><span class="dot"></span> PREVIEW</span><span class="aspect-badge">16:9 &nbsp; / &nbsp; 1920 × 1080</span></div><div id="verseNav"></div><div id="preview" class="stage-frame" aria-label="Slide preview"></div></section>'+
 '<section class="stage-column live-column" aria-label="Live output"><div class="preview-header"><span class="preview-label live-label"><span class="dot live-dot-small"></span> LIVE</span><span id="liveCaption" class="aspect-badge"></span></div><div class="live-mode" role="group" aria-label="Live view"><button class="button" data-action="live-view-full" id="liveViewFull">Full screen</button><button class="button" data-action="live-view-lower" id="liveViewLower">Lower third</button><button class="button" data-action="live-view-graphics" id="liveViewGraphics">Graphics</button><button class="button" data-action="lower-open-settings">Lower third settings</button></div><div id="liveStage" class="stage-frame live-frame" aria-label="Copy of the live output" title="Copy of what Wordlight sends. It cannot confirm what a TV or OBS shows."></div><p class="small-note live-note" id="companionStatus" aria-live="polite"></p><button class="button" id="connectObs" data-action="help" hidden>Connect OBS</button><div id="liveSongBar" class="live-song-bar" role="group" aria-label="Sections of the song on screen"></div></section></div><div class="preview-toolbar"><span class="preview-caption" title="Edits stay in the preview until you send them.">'+icon('eye')+'Preview only</span><div class="toolbar-actions"><button id="screenToggle" class="button screen-toggle" data-action="blank" title="Hide or restore the presentation on the TV">Hide screen</button>'+button('Send to screen','send','arrow','gold')+'</div></div><div class="deck-heading"><h2>Slides in this item</h2><span id="deckCount"></span></div><div class="deck-actions"><button class="button" data-action="deck-select" id="deckSelectToggle" aria-pressed="false">Select slides</button>'+button('Organize slides','organize','copy')+'<button class="button" data-action="duplicate-preview" id="duplicatePreview">Duplicate slide</button><button class="button danger" data-action="delete-preview" id="deletePreview">Delete slide</button><button class="button" data-action="undo-preview" id="undoPreview" hidden>Undo deletion</button><span class="deck-hint">Click to preview. Double-click to send to screen.</span></div><div id="bulkBar"></div><div id="deck" class="deck" aria-label="Study slides"></div><div id="liveBar"></div><div class="footer-tip"><span></span><span><button data-action="import">Import shows</button> &nbsp; · &nbsp; <button data-action="help">Projection guide</button></span></div></main></div>';
 renderPanel();renderPreview();renderSceneBar();renderDeck();renderLive();
 $('#showSwitcher').addEventListener('change',ev=>switchShow(ev.target.value));
 $('#sessionTitle').addEventListener('input',ev=>{draft.title=ev.target.value;remember();});
}
function renderPanel(){
 if(tab==='slides')renderSlides();else if(tab==='passage')renderPassage();else if(tab==='songs')renderSongs();else if(tab==='words')renderWords();else renderDesign();
}
function renderPassage(){
 $('#panel').innerHTML='<h3 class="section-title">Bible</h3>'+label('Find a passage','referenceLookup')+'<div class="lookup-row">'+input('referenceLookup',draft.reference,'placeholder="e.g. Romans 12:1-2" maxlength="100" role="combobox" aria-autocomplete="list" aria-controls="bookSuggestions" aria-expanded="false" autocomplete="off" spellcheck="false"')+'<button class="button primary" id="lookupButton" data-action="lookup" aria-label="Look up passage">'+icon('search')+'</button><button class="button" data-action="picker-open" title="Choose book, chapter and verses" aria-label="Browse books, chapters and verses">Browse</button></div>'+label('Lookup translation','lookupTranslation')+'<div class="lookup-row"><select id="lookupTranslation">'+translationOptions(currentKey())+'</select>'+button('Versions…','versions-open')+'</div><p id="lookupStatus" class="small-note">Online lookup. Your own pasted text works offline.</p>'+label('Passage or text','passageText')+'<textarea id="passageText" rows="7" maxlength="500000" placeholder="Paste your Bible passage here...">'+e(draft.passage)+'</textarea>'+tip('Pasted text: leave a blank line to start a new slide. Long sections still split to fit.')+'<div class="field-row"><div>'+label('Reference / title on screen','referenceLabel')+input('referenceLabel',draft.reference,'maxlength="100"')+'</div><div>'+label('Version on screen','versionLabel')+input('versionLabel',draft.translation,'placeholder="e.g. KJV" maxlength="30"')+'</div></div><p class="small-note" id="passageStats"></p>'+button('Choose a word to study','words','arrow','primary')+'<details class="source-note"><summary>Sources and licences</summary>Installed copies come from <a href="https://ebible.org/" target="_blank" rel="noopener">eBible.org</a>. Online lookups: English from <a href="https://bible-api.com/" target="_blank" rel="noopener">bible-api.com</a>, NKJV from <a href="https://bolls.life/" target="_blank" rel="noopener">bolls.life</a> (© Thomas Nelson), Yorùbá OYCB from <a href="https://bible.helloao.org/" target="_blank" rel="noopener">AO Lab</a>. OYCB: <a href="https://ebible.org/Scriptures/details.php?id=yor" target="_blank" rel="noopener">Biblica copyright and CC BY-SA 4.0 licence</a>. Yorùbá and English book names both work, for example Luku 10:18-20 or Luke 10:18-20.</details>';
 $('#lookupStatus').insertAdjacentHTML('beforebegin',label('Passage layout','passageLayout')+'<select id="passageLayout"><option value="verses" '+(draft.passageLayout!=='flow'?'selected':'')+'>One verse per slide</option><option value="flow" '+(draft.passageLayout==='flow'?'selected':'')+'>Flowing text (split by length)</option></select>'+tip('Choose how this show displays a range. You can switch after lookup without downloading it again.')+'');
 $('#passageLayout').addEventListener('change',ev=>{draft.passageLayout=ev.target.value;draft.previewId='';remember();renderPreview();renderDeck();renderVerseNavigation();updateStats();});
 $('#lookupStatus').insertAdjacentHTML('afterend','<div id="panelVerseNav"></div>'+button('Add passage as new item','keep-passage','plus')+''+tip('Looks up the reference above as a separate Scripture item, for example a second reading. Look up changes the current Scripture item.')+'');renderVerseNavigation();
 updateStats();
 $('#lookupStatus').insertAdjacentHTML('afterend','<div id="bibleInstall"></div><div id="nkjvPastePanel" class="subtle-card" hidden></div>');paintNKJV();
 const updateTranslationMode=()=>{const nkjv=$('#lookupTranslation').value==='nkjv',nkjvLocal=installedBible('nkjv');$('#nkjvPastePanel').hidden=!nkjv;$('#lookupButton').disabled=lookupBusy;$('#lookupStatus').textContent=nkjv?(nkjvLocal?'NKJV is installed on this computer from your file. Lookups work offline.':nkjvReady()?'NKJV through your API.Bible key.':'NKJV online from bolls.life, one chapter at a time.'):bibleStatusText($('#lookupTranslation').value);paintBibleInstall($('#lookupTranslation').value);};
 $('#lookupTranslation').addEventListener('change',()=>{++lookupId;lookupBusy=false;updateTranslationMode();});$('#lookupTranslation').addEventListener('nkjv-state',updateTranslationMode);updateTranslationMode();
 if(companionReady()&&!nkjvState)refreshNKJV();
 if(companionReady()&&!installedBibles)refreshInstalledBibles();
 setupBookAutocomplete($('#referenceLookup'));
 for(const [id,key] of [['passageText','passage'],['referenceLabel','reference'],['versionLabel','translation']]){
  $('#'+id).addEventListener('input',ev=>{
   if(key==='passage'&&ev.target.value.trim()&&['Song','Presentation'].includes(itemSummary(draft,deckFor(draft)).kind)){
    try{draft=addContent(activeShow(library),'Scripture',d=>{d.passage=ev.target.value;d.includePassage=true;},{reuseEmpty:false});}catch(err){return toast(err.message);}
    summaryCache=new WeakMap();renderSceneBar();
   }
   draft[key]=ev.target.value;if(key==='passage'&&draft.scriptureAttribution)draft.scriptureAttribution=adaptedCredit(draft.scriptureAttribution);draft.verseRange=null;draft.bibleVerses=[];++lookupId;lookupBusy=false;renderVerseNavigation();if(key==='passage'){draft.previewId='passage-0';forgetPages('passage-');}remember();renderPreview();renderDeck();updateStats();});
 }
}
function updateStats(){const el=$('#passageStats');if(el)el.textContent=(draft.passage.trim().match(/\S+/g)||[]).length+' words · '+deckFor(draft).filter(s=>s.type==='passage').length+' passage slides';}
function renderWords(){
 const n=getNote();
 $('#panel').innerHTML='<h3 class="section-title">Words</h3><div class="word-picker" id="wordPicker"></div><div class="lookup-row">'+input('wordInput','','placeholder="A word or phrase..." maxlength="200" aria-label="Word or phrase to study"')+'<button class="button" data-action="add-word" aria-label="Add word study">'+icon('plus')+'</button></div><div class="note-chips" id="noteChips">'+wordChips()+'</div>'+
 (n?'<div class="field-row"><div>'+label('Selected word / phrase','noteWord')+input('noteWord',n.word,'maxlength="200"')+'</div><div>'+label('Occurrences in passage','occurrenceCount')+'<div class="input" id="occurrenceCount">'+occurrences(getStudyText(),n.word)+'</div></div></div>'+wordColorControls(n)+label('Your explanation in this passage','noteMeaning')+'<textarea id="noteMeaning" rows="4" maxlength="30000" placeholder="What does this word mean here?">'+e(n.meaning)+'</textarea><div class="field-row"><div>'+label('Greek / Hebrew (optional)','noteOriginal')+input('noteOriginal',n.original,'maxlength="200" dir="auto"')+'</div><div>'+label('Transliteration (optional)','noteTransliteration')+input('noteTransliteration',n.transliteration,'maxlength="200"')+'</div></div>'+label('Strong’s number (optional)','noteStrong')+input('noteStrong',n.strong,'placeholder="e.g. G3056 or H2617" maxlength="20"')+label('Study source / link (optional)','noteSource')+input('noteSource',n.source,'maxlength="1000"')+''+tip('Your explanation appears beside the passage. Study sources stay in your notes.')+'<button class="inline-link" data-action="delete-note">Remove this word study</button>':'<div class="subtle-card"><p class="hint">Pick your first word to add an explanation and make a word-study slide.</p></div>')+
 '<div class="setup-panel"><h3>Greek & Hebrew dictionary</h3><p>Search a Strong’s number, original word, or English term. Results are possible matches, not a verse-specific analysis.</p><div class="lookup-row">'+input('dictionaryQuery',n?.strong||n?.word||'','placeholder="e.g. G3056, λόγος, love" maxlength="100" aria-label="Dictionary search"')+'<button class="button" id="dictionaryButton" data-action="dictionary" aria-label="Search dictionary">'+icon('search')+'</button></div><div id="dictionaryResults" class="results-area"></div><p class="small-note">BDB / Thayer via <a href="https://bolls.life/" target="_blank" rel="noopener">Bolls Bible</a>. Check the original word against your verse before using an entry.</p></div>';
 const studyText=getStudyText();const picker=$('#wordPicker');let cursor=0;const tokens=/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;
 const scopedHighlights=scopeHighlights(),selectedWord=n?.word.toLowerCase(),words=document.createDocumentFragment();
 for(const m of studyText.matchAll(tokens)){
  words.append(document.createTextNode(studyText.slice(cursor,m.index)));
  const lower=m[0].toLowerCase(),b=document.createElement('button');b.className='word-token'+(selectedWord===lower?' selected':'');b.textContent=m[0];b.dataset.word=m[0];const hl=scopedHighlights.get(lower);if(hl){b.classList.add('highlighted');applyTokenStyle(b,hl);}words.append(b);cursor=m.index+m[0].length;
  if(cursor>18000){words.append(document.createTextNode(' … More text is available in the Passage tab. Type any word above to study it.'));break;}
 }if(cursor<=18000)words.append(document.createTextNode(studyText.slice(cursor)));picker.append(words);
 $('#wordInput').addEventListener('keydown',ev=>{if(ev.key==='Enter')addWord($('#wordInput').value);});
 $('#dictionaryQuery').addEventListener('keydown',ev=>{if(ev.key==='Enter')searchDictionary();});
 if(n){for(const [id,key] of [['wordBold','bold'],['wordItalic','italic']])$('#'+id).addEventListener('change',ev=>{n[key]=ev.target.checked;remember();renderPreview();renderDeck();refreshWordChips();});$('#wordEmphasis').addEventListener('change',ev=>{n.emphasis=safeEmphasis(ev.target.value);remember();renderPreview();renderDeck();refreshWordChips();});$('#wordColor').addEventListener('input',ev=>setWordColor(ev.target.value));$('#wordColorHex').addEventListener('input',ev=>{const color=safeColor(ev.target.value);if(color)setWordColor(color);else $('#wordColorStatus').textContent='Use a 6-digit color, like #8fcde8.';});$('#wordColorHex').addEventListener('change',ev=>{if(!safeColor(ev.target.value))ev.target.value=getHighlights(draft).find(h=>h.word===n.word.trim()&&(h.slideId||'')===(n.slideId||''))?.color||THEMES[draft.theme].accent;});}
 if(n)for(const [id,key] of [['noteWord','word'],['noteMeaning','meaning'],['noteOriginal','original'],['noteTransliteration','transliteration'],['noteStrong','strong'],['noteSource','source']]){
  $('#'+id).addEventListener('input',ev=>{n[key]=ev.target.value;if(key==='meaning')forgetPages('study-'+n.id+'-');if(key!=='word'&&!activeTextSlide())draft.previewId='study-'+n.id+'-0';remember();renderPreview();renderDeck();$('#occurrenceCount').textContent=occurrences(getStudyText(),n.word);if(key==='word')refreshWordChips();});
 }
 if(activeTextSlide()){$('.section-title').textContent='Style the words.';for(const id of ['noteMeaning','noteStrong','noteSource']){const el=$('#'+id);if(el)el.hidden=true;const lab=$('label[for='+id+']');if(lab)lab.hidden=true;}$('#noteOriginal')?.closest('.field-row')?.setAttribute('hidden','');$('#panel .setup-panel')?.setAttribute('hidden','');const remove=$('[data-action=delete-note]');if(remove)remove.textContent='Remove this formatting';const explanation=$('#noteSource')?.nextElementSibling;if(explanation)explanation.textContent='Formatting applies only to this slide.';}
}
function addWord(word){
 word=word.trim();if(!word)return toast('Type a word or phrase first.');
 const scope=activeTextSlide()?.id||'';let n=draft.notes.find(n=>n.word.toLowerCase()===word.toLowerCase()&&(n.slideId||'')===scope);
 if(!n){n={id:crypto.randomUUID(),word,original:'',transliteration:'',strong:'',meaning:'',source:'',color:nextHighlightColor(draft),emphasis:'highlight',slideId:scope};draft.notes.push(n);}
 draft.selectedNoteId=n.id;const passageSlide=deckFor(draft).find(s=>s.type==='passage'&&occurrences(s.text,n.word));if(!activeTextSlide())draft.previewId=passageSlide?.id||'passage-0';tab='words';remember();render();
}
// Highlights for the words in the current scope (the selected text slide, or the passage), by lowercase word.
// The first matching entry wins, as the old per-word find() did.
function scopeHighlights(){
 const scope=activeTextSlide()?.id||'',map=new Map();
 for(const h of getHighlights(draft))if((h.slideId||'')===scope&&!map.has(h.word.toLowerCase()))map.set(h.word.toLowerCase(),h);
 return map;
}
function wordChips(){
 const scope=activeTextSlide()?.id||'',highlights=getHighlights(draft).filter(h=>(h.slideId||'')===scope);
 return draft.notes.filter(note=>(note.slideId||'')===scope).map(note=>'<button class="note-chip '+(draft.selectedNoteId===note.id?'active':'')+'" data-note="'+e(note.id)+'"><i class="word-swatch" aria-hidden="true" style="background:'+(highlights.find(h=>h.word===note.word.trim())?.color||THEMES[draft.theme].accent)+'"></i>'+e(note.word)+'</button>').join('');
}
function refreshWordChips(){
 if($('#noteChips'))$('#noteChips').innerHTML=wordChips();
 const highlights=scopeHighlights();
 document.querySelectorAll('.word-token').forEach(b=>{
  const h=highlights.get(b.dataset.word.toLowerCase());
  b.classList.toggle('highlighted',!!h);if(h)applyTokenStyle(b,h);else {b.removeAttribute('data-emphasis');b.style.removeProperty('--word-color');}
 });
}
function wordColorControls(n){
 const color=getHighlights(draft).find(h=>h.word===n.word.trim()&&(h.slideId||'')===(n.slideId||''))?.color||THEMES[draft.theme].accent;
 return label('Style for this word','wordEmphasis')+'<select id="wordEmphasis">'+[['highlight','Highlighter'],['underline','Underline'],['text','Text color'],['outline','Outline box'],['none','No color effect']].map(([value,name])=>'<option value="'+value+'" '+(safeEmphasis(n.emphasis)===value?'selected':'')+'>'+name+'</option>').join('')+'</select><div class="body-tools"><label><input id="wordBold" type="checkbox" '+(n.bold?'checked':'')+'> <b>Bold word</b></label><label><input id="wordItalic" type="checkbox" '+(n.italic?'checked':'')+'> <i>Italic word</i></label></div>'+label('Color for this word','wordColor')+'<div class="word-color-controls"><input id="wordColor" type="color" value="'+color+'" aria-label="Word highlight color"><input id="wordColorHex" class="input" value="'+color+'" maxlength="7" aria-label="Highlight hex color" spellcheck="false">'+button('Use theme','reset-word-color')+'</div><div class="word-color-swatches" role="group" aria-label="Word highlight colors">'+highlightPalette(draft).map(h=>'<button class="color-swatch '+(color===h.color?'active':'')+'" style="--swatch:'+h.color+'" data-word-color="'+h.color+'" aria-label="Use '+h.name.toLowerCase()+' highlight" title="'+h.name+'"></button>').join('')+'</div><p id="wordColorStatus" class="small-note word-color-status" aria-live="polite">Each word keeps its own style and color. Changes stay private until sent.</p>';
}
function setWordColor(color){
 const n=getNote();if(!n)return;
 n.color=safeColor(color);remember();renderPreview();renderDeck();refreshWordChips();
 const effective=getHighlights(draft).find(h=>h.word===n.word.trim()&&(h.slideId||'')===(n.slideId||''))?.color||THEMES[draft.theme].accent;
 if($('#wordColor'))$('#wordColor').value=effective;
 if($('#wordColorHex')&&document.activeElement!==$('#wordColorHex'))$('#wordColorHex').value=effective;
 document.querySelectorAll('[data-word-color]').forEach(b=>b.classList.toggle('active',b.dataset.wordColor===effective));
 if($('#wordColorStatus'))$('#wordColorStatus').textContent=n.color?'Color saved for '+n.word+'.':'This word follows the theme highlight color.';
}
function renderDesign(){
 $('#panel').innerHTML='<h3 class="section-title">Design</h3><div class="theme-grid">'+Object.entries(THEMES).map(([id,t])=>'<button class="theme-button '+(draft.theme===id?'active':'')+'" data-theme="'+id+'"><div class="theme-sample theme-'+id+'">The Word</div><span>'+t.name+'</span></button>').join('')+'</div>'+label('Typeface','fontSelect')+'<select id="fontSelect">'+fontOptions(draft.font)+'</select><div class="body-tools"><label><input id="passageBold" type="checkbox" '+(draft.bold?'checked':'')+'> <b>Bold</b></label><label><input id="passageItalic" type="checkbox" '+(draft.italic?'checked':'')+'> <i>Italic</i></label></div>'+label('Text size · '+draft.fontSize+' px','fontSize')+'<input id="fontSize" type="range" min="52" max="112" value="'+draft.fontSize+'">'+'<label class="toggle-row"><input id="passageFit" type="checkbox" '+(draft.fit?'checked':'')+'>Fit Bible and pasted slides to screen</label>'+label('Fit padding · '+fitPadding(draft.fitPadding)+' px','fitPaddingRange')+'<input id="fitPaddingRange" type="range" min="'+FIT_PADDING.min+'" max="'+FIT_PADDING.max+'" step="4" value="'+fitPadding(draft.fitPadding)+'">'+tip('Fit picks the largest text that fits inside the padding: short verses grow, long ones shrink. With Fit off, Text size is used.')+''+label('Words per passage slide · '+draft.wordsPerSlide,'slideWords')+'<input id="slideWords" type="range" min="20" max="80" value="'+draft.wordsPerSlide+'">'+tip('Text also shrinks to fit. Fewer words per slide are easier to read across a room.')+''+label('Small heading on screen','brandLabel')+input('brandLabel',draft.brand,'placeholder="e.g. SUNDAY BIBLE STUDY" maxlength="80"')+label('Default highlight color','accentColor')+'<div class="lookup-row"><input type="color" id="accentColor" value="'+(draft.accent||THEMES[draft.theme].accent)+'" aria-label="Highlight color">'+button('Use theme color','reset-accent')+'</div>'+backgroundSection();
 bindBackgroundSection();
 for(const [id,key] of [['passageBold','bold'],['passageItalic','italic'],['passageFit','fit']])$('#'+id).addEventListener('change',ev=>{draft[key]=ev.target.checked;remember();renderPreview();renderDeck();});
 $('#fitPaddingRange').addEventListener('input',ev=>{draft.fitPadding=fitPadding(ev.target.value);$('label[for=fitPaddingRange]').textContent='Fit padding · '+draft.fitPadding+' px';remember();renderPreview();renderDeck();});
 for(const [id,key] of [['fontSelect','font'],['fontSize','fontSize'],['slideWords','wordsPerSlide'],['brandLabel','brand'],['accentColor','accent']]){
  $('#'+id).addEventListener('input',ev=>{draft[key]=['fontSize','wordsPerSlide'].includes(key)?Number(ev.target.value):ev.target.value;remember();renderPreview();renderDeck();if(id==='fontSize')$('label[for=fontSize]').textContent='Text size · '+draft.fontSize+' px';if(id==='slideWords')$('label[for=slideWords]').textContent='Words per passage slide · '+draft.wordsPerSlide;});
 }
}
// Background image for every full-screen slide of this item. Images live in the companion's store; the web studio
// reaches it through the bridge once paired.
function backgroundSection(){
 if(!companionReady())return label('Background image','connectObsDesign')+'<p class="small-note">Background images are stored by the companion on this computer. Connect OBS to choose one.</p>'+button('Connect OBS','help','screen');
 if(!designAssets){designAssets=true;loadGraphicsAssets().then(()=>{if(tab==='design')renderDesign();});}
 const current=draft.backgroundAssetId;
 return label('Background image','bgAsset')+'<div class="lookup-row"><select id="bgAsset"><option value="">None (theme color)</option>'+(current&&!graphicsAssets.some(a=>a.id===current)?'<option value="'+current+'" selected>Current image</option>':'')+graphicsAssets.map(a=>'<option value="'+a.id+'" '+(a.id===current?'selected':'')+'>'+e(a.name)+' ('+a.width+'×'+a.height+')</option>').join('')+'</select>'+button('Upload','background-upload','upload')+'</div>'+
  (graphicsAssetError?'<p class="small-note status-error">Images: '+e(graphicsAssetError)+'</p>':'')+
  (current?label('Image overlay · '+draft.backgroundDim+' %','bgDim')+'<input id="bgDim" type="range" min="0" max="80" step="5" value="'+draft.backgroundDim+'">':'')+
  tip('Used behind every full-screen slide of this item. A slide with its own background color keeps it, and the lower third stays transparent.');
}
function bindBackgroundSection(){
 $('#bgAsset')?.addEventListener('change',ev=>{draft.backgroundAssetId=ev.target.value;remember();renderDesign();renderPreview();});
 $('#bgDim')?.addEventListener('input',ev=>{draft.backgroundDim=Number(ev.target.value);$('label[for=bgDim]').textContent='Image overlay · '+draft.backgroundDim+' %';remember();renderPreview();});
}
document.addEventListener('click',ev=>{if(ev.target.closest('[data-action="background-upload"]')){graphicsUpload='slide-background';chooseFile($('#graphicsFile'));}});
function highlight(text,words,fallback){return highlightSegments(text,words,fallback).map(s=>s.color?'<mark data-emphasis="'+safeEmphasis(s.emphasis)+'" style="--word-color:'+s.color+';--mark-ink:'+contrastInk(s.color)+';font-weight:'+(s.bold?'700':'inherit')+';font-style:'+(s.italic?'italic':'inherit')+'">'+e(s.text)+'</mark>':e(s.text)).join('');}
function applyTokenStyle(b,h){b.dataset.emphasis=safeEmphasis(h.emphasis);b.style.setProperty('--word-color',h.color);b.style.setProperty('--mark-ink',contrastInk(h.color));b.style.fontWeight=h.bold?'700':'';b.style.fontStyle=h.italic?'italic':'';}
function activeTextSlide(){const slide=deckFor(draft).find(s=>s.id===draft.previewId);return (draft.textSlides||[]).find(s=>s.id===slide?.sourceId);}
function getStudyText(){const s=activeTextSlide();return s?[s.heading,s.subtitle,s.body].filter(Boolean).join('\n'):draft.passage;}
let observer;const observed=new WeakSet(),drawnStages=new WeakMap();
function drawStage(frame,slide,style,blank=false,words=[]){
 if(!frame)return;
 words=words.filter(h=>typeof h==='string'||(h.slideId||'')===(slide?.sourceId||''));
 if(slide?.type==='text')style={...style,...Object.fromEntries(Object.entries(cleanTextSlide(slide.format)).filter(([k,v])=>['theme','font'].includes(k)&&v))};
 const t=THEMES[style.theme]||THEMES.midnight;
 const colors={...t,accent:safeColor(style.accent)||t.accent};const font=(FONTS[style.font]||FONTS.serif).css;
 if(slide?.type==='text'&&safeColor(slide.format?.background))colors.bg=safeColor(slide.format.background);
 const custom=Object.entries(colors).filter(([k])=>k!=='name').map(([k,v])=>'--'+k+':'+v).join(';');
 const note=slide?.note;const highlights=words.length?words:(note?[{word:note.word,color:safeColor(note.color)||colors.accent}]:[]);const noteColor=safeColor(note?.color)||highlights.find(h=>h?.word?.toLowerCase()===note?.word?.toLowerCase())?.color||colors.accent;
 const credit=slide?.type==='text'?slide.format?.attribution:style.scriptureAttribution;
 const image=!blank&&slide&&/^[a-f0-9]{16}$/.test(style.backgroundAssetId||'')&&!(slide.type==='text'&&safeColor(slide.format?.background))?style.backgroundAssetId:'',dim=Math.max(0,Math.min(80,Number(style.backgroundDim)||0));
 const html='<div class="stage-canvas '+(blank?'blank':'')+(image?' has-background':'')+'" style="'+custom+';--slide-font:'+font.replaceAll('"','')+'">'+(image?'<img class="stage-background" alt="" src="'+e(assetUrl(image))+'"><div class="stage-dim" style="opacity:'+dim/100+'"></div>':'')+'<div class="stage-inner">'+
 (slide?.type==='text'?textSlideMarkup(slide,colors,words):(slide?'<div class="slide-kicker">'+e(style.brand||'SCRIPTURE')+'</div><div class="slide-rule"></div><div class="slide-content'+(style.fit?' fit-mode':'')+'" data-fit="'+!!style.fit+'" data-fit-pad="'+fitPadding(style.fitPadding)+'" style="--fit-pad:'+fitPadding(style.fitPadding)+'px"><div class="verse-area"><div class="verse-text" data-base-size="'+Math.max(52,Math.min(112,Number(style.fontSize)||88))+'" style="font-size:'+Math.max(52,Math.min(112,Number(style.fontSize)||88))+'px;font-weight:'+(style.bold?'700':'400')+';font-style:'+(style.italic?'italic':'normal')+'">'+highlight(slide.text,highlights,colors.accent)+'</div></div>'+
 (note?'<div class="study-area" style="--accent:'+safeColor(noteColor)+'"><div class="study-label">WORD STUDY</div><h2 class="study-word">'+highlight(note.word,[{word:note.word,color:noteColor,emphasis:note.emphasis,bold:note.bold,italic:note.italic}],colors.accent)+'</h2>'+(note.original?'<div class="study-original" dir="auto">'+e(note.original)+'</div>':'')+'<div class="study-meta">'+e([note.transliteration,note.strong].filter(Boolean).join(' · '))+'</div>'+(note.meaning?'<p class="study-meaning">'+e(note.meaning)+'</p>':'')+'</div>':'')+'</div><div class="slide-footer scripture-footer"><span>'+e(slide.reference)+' &nbsp; <span class="scripture-version">'+e(slide.translation)+'</span></span><span>'+e(slide.pages>1?slide.page+' / '+slide.pages:'')+'</span></div>':'<div class="empty-stage">Add text or a Bible passage to begin.</div>'))+'</div></div>';
 // Same slide, style and credit: keep the fitted DOM (and timer overlay) instead of rebuilding and refitting.
 // Edits that don't show on the slide, and repeated live messages, used to redraw the screen each time.
 const key=html+'|'+(credit||'');
 if(drawnStages.get(frame)===key&&frame.firstElementChild){if(frame.id==='preview')showFitNotice(frame);return;}
 drawnStages.set(frame,key);frame.innerHTML=html;
 // A missing image (removed, or the companion is not running) leaves the theme color.
 frame.querySelector('.stage-background')?.addEventListener('error',ev=>{ev.target.hidden=true;ev.target.nextElementSibling.hidden=true;},{once:true});
 if(credit){const note=document.createElement('div');note.className='scripture-credit';note.textContent=credit+(credit.includes('CC BY-SA')?' · open.bible · creativecommons.org/licenses/by-sa/4.0':'');frame.firstElementChild.append(note);}
 if(!observer)observer=new ResizeObserver(entries=>{for(const entry of entries)scaleFrame(entry.target);});
 if(!observed.has(frame)){observer.observe(frame);observed.add(frame);}
 requestAnimationFrame(()=>{scaleFrame(frame);fitText(frame);});
}
function scaleFrame(frame){const canvas=frame.firstElementChild;if(canvas){const scale=Math.min(frame.clientWidth/1920,frame.clientHeight/1080);canvas.style.transform='scale('+scale+')';canvas.style.left=((frame.clientWidth-1920*scale)/2)+'px';canvas.style.top=((frame.clientHeight-1080*scale)/2)+'px';}}
function showFitNotice(frame){const el=$('#fitNotice');if(el)el.textContent=frame.dataset.fitmode==='true'?'Fit to screen: text is sized to fill the space inside the padding.':frame.dataset.autofit==='true'?'Text was reduced to fit. Split this slide for larger type.':'Sizes are in pixels on the 1920 × 1080 canvas.';}
function fitText(frame){fitStage(frame);if(frame.querySelector('.text-slide-layout')&&frame.id==='preview')showFitNotice(frame);}
// The optional web fonts load after startup, so a slow or offline connection never delays the studio or the screen.
// Refit when any font arrives, because fonts used by a slide can load after it is drawn.
const refitStages=()=>document.querySelectorAll('.stage-frame').forEach(f=>{scaleFrame(f);fitText(f);});
document.fonts?.ready.then(refitStages);document.fonts?.addEventListener?.('loadingdone',refitStages);
{const fonts=document.createElement('link');fonts.rel='stylesheet';fonts.href='https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap';document.head.append(fonts);}
function renderPreview(){
 const deck=deckFor(draft);const slide=deck.find(s=>s.id===draft.previewId)||deck[0];if(slide)draft.previewId=slide.id;
 drawStage($('#preview'),slide,draft,false,getHighlights(draft));renderVerseNavigation();paintTimers();
}
function renderDeck(){
 const el=$('#deck');if(!el)return;const deck=deckFor(draft);
 const duplicate=$('#duplicatePreview');if(duplicate)duplicate.disabled=!deck.length;
 const send=$('[data-action=send]');if(send)send.disabled=!deck.length;
 const del=$('#deletePreview');if(del){del.disabled=!deck.length;const selected=deck.find(s=>s.id===draft.previewId);del.textContent='Delete slide';del.title=selected?.versePoint?'Delete this verse slide':activeTextSlide()?'Delete this text slide and its continuation pages':'Delete the selected passage or study and its continuation pages';}
 const undo=$('#undoPreview');if(undo)undo.hidden=!(lastRemovedSlide||lastRemovedBible);const liveSlide=live.slides[live.index];
 $('#deckCount').textContent=deck.length+' slides · '+draft.notes.length+' highlights';
 const cards=deck.map((s,i)=>'<button class="slide-card '+(draft.previewId===s.id?'active':'')+(deckSelecting?' selecting':'')+(deckSelecting&&deckSelection.has(s.id)?' selected':'')+'" data-slide="'+e(s.id)+'" '+(deckSelecting?'aria-pressed="'+deckSelection.has(s.id)+'" aria-label="Select '+e(s.title)+'"':'aria-label="Preview '+e(s.title)+'. Double-click to send to screen."')+'>'+(deckSelecting?'<span class="card-check" aria-hidden="true"></span>':'')+'<div class="slide-card-art theme-'+draft.theme+'"><div class="mini-ref">'+e(s.reference)+'</div><div class="'+(s.note?'mini-word':'mini-text')+'">'+e(s.note?s.note.word:(s.type==='text'?[s.heading,s.subtitle,s.text].filter(Boolean).join(' · '):s.text))+'</div></div><div class="slide-card-bottom"><span class="index">'+String(i+1).padStart(2,'0')+'</span>'+e(s.title.slice(0,36))+(liveInCurrentScene()&&liveSlide?.id===s.id&&!live.blank?'<span class="live-pin">'+(JSON.stringify(s)===JSON.stringify(liveSlide)&&['theme','font','fontSize','brand','accent','bold','italic'].every(k=>draft[k]===live.style[k])&&JSON.stringify(getHighlights(draft))===JSON.stringify(live.style.highlights||[])?'ON SCREEN':'SENT COPY')+'</span>':'')+'</div></button>').join('')+ '<button class="add-study-card" data-action="new-text">'+icon('plus')+'Add text slide</button>'+'<button class="add-study-card" data-action="words">'+icon('plus')+'Add word study</button>';
 if(drawnDecks.get(el)!==cards){
  const left=el.scrollLeft,focused=document.activeElement?.closest?.('.slide-card')?.dataset.slide;
  drawnDecks.set(el,cards);el.innerHTML=cards;
  if(!el.dataset.scrollMemory){el.dataset.scrollMemory='1';el.addEventListener('scroll',()=>{if(deckScrollItem)deckScrolls.set(deckScrollItem,el.scrollLeft);},{passive:true});}
  // Same item, same strip: keep where it was. Otherwise use this item's saved position.
  const key=deckKey(),saved=key===deckScrollItem&&left?left:deckScrolls.get(key);deckScrollItem=key;
  el.scrollLeft=saved??0;
  // Show the selected slide if it is out of view (or on a first visit), scrolling only the strip.
  const card=el.querySelector('.slide-card.active');
  if(card&&(saved===undefined||card.offsetLeft<el.scrollLeft||card.offsetLeft+card.offsetWidth>el.scrollLeft+el.clientWidth))el.scrollLeft=Math.max(0,card.offsetLeft-24);
  if(focused)el.querySelector('[data-slide="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});
 }
 renderBulkBar();refreshActiveRow();
}
// After an edit, the current item's row shows its new type, count and (for an automatically named Presentation) its
// first heading, without redrawing the list or the editor. A change to or from Mixed redraws the list, because the
// Split option depends on it, unless a field in the list has focus.
const autoTitles=new Map();
function refreshActiveRow(){
 const row=$('#rundown .item-row.selected');if(!row)return;
 const show=activeShow(library),scene=activeScene(show),{kind,count}=summaryOf(show,scene);
 if(kind==='Presentation'){
  const heading=(draft.textSlides||[]).map(s=>String(s.heading||'').trim()).find(Boolean)?.slice(0,80);
  if(heading&&heading!==scene.name&&(scene.name==='Presentation'||autoName(scene.name)||scene.name===autoTitles.get(scene.id))){renameScene(show,scene.id,heading);autoTitles.set(scene.id,heading);}
 }
 const before=row.querySelector('.item-kind').textContent;
 if((before==='Mixed')!==(kind==='Mixed')){const f=document.activeElement;if(!($('#rundown')?.contains(f)&&f.matches('input,textarea,select'))){renderSceneBar();return;}}
 row.querySelector('.item-kind').textContent=kind;row.querySelector('.item-count').textContent=count;row.querySelector('.item-name').textContent=scene.name;
 const name=$('#itemName');if(name&&document.activeElement!==name)name.value=scene.name;
}
const drawnDecks=new WeakMap();
function renderLive(){
 const liveFrame=$('#liveStage');
 if(liveFrame){
  const slide=live.slides[live.index],words=live.style.highlights||live.style.highlightWords||[];
  liveFrame.classList.toggle('lower-preview',liveView==='lower');
  liveFrame.classList.toggle('lower-preview',liveView!=='full');
  if(liveView==='graphics')mountStage(liveFrame,graphicsMarkup(live.graphics));
  else if(liveView==='lower')drawLowerThird(liveFrame,slide,live.style,live.blank||!slide,words,live.lowerThird);
  else drawStage(liveFrame,slide,live.style,live.blank||!slide,words);
  $('#liveViewFull')?.classList.toggle('active',liveView==='full');$('#liveViewLower')?.classList.toggle('active',liveView==='lower');$('#liveViewGraphics')?.classList.toggle('active',liveView==='graphics');
  $('#liveViewFull')?.setAttribute('aria-pressed',String(liveView==='full'));$('#liveViewLower')?.setAttribute('aria-pressed',String(liveView==='lower'));
  paintLiveSongBar();
  const caption=$('#liveCaption');if(caption)caption.textContent=(live.blank?'HIDDEN · ':'')+(slide?[live.showTitle,live.sceneName].filter(Boolean).join(' · ')+' · '+(live.index+1)+' / '+live.slides.length:'Nothing sent yet');
 }
 const toggle=$('#screenToggle');
 if(toggle){toggle.innerHTML=icon(live.blank?'eye':'moon')+(live.blank?'Show screen':'Hide screen');toggle.title=live.blank?'Restore the last slide sent to the TV':'Clear the TV to a black screen; keep your study open';toggle.dataset.hidden=String(live.blank);}
 const el=$('#liveBar');if(!el)return;
 paintTimers();{const f=document.activeElement;if(!($('#rundown')?.contains(f)&&f.matches('input,textarea,select')))renderSceneBar();}const text=live.blank?'Screen is blank':(live.slides[live.index]?.title||'Ready to present');
 el.innerHTML='<div class="live-bar"><div class="live-dot"></div><div class="live-copy"><strong>'+e([live.showTitle,live.sceneName,text].filter(Boolean).join(' · '))+'</strong><br>'+(isLocal?'OBS & presentation output':companion.state==='connected'?'Presentation window and OBS companion':'Presentation window only · OBS not connected')+' · '+(live.blank?'Send a slide when you’re ready':(live.index+1)+' of '+live.slides.length)+'</div><div class="live-controls"><button class="icon-button" data-action="live-prev" aria-label="Previous live slide" '+(live.index<=0?'disabled':'')+'>'+icon('left')+'</button><button class="icon-button" data-action="live-next" aria-label="Next live slide" '+(live.index>=live.slides.length-1?'disabled':'')+'>'+icon('chevron')+'</button>'+'</div></div>';
}
function renderOutput(){
 document.body.classList.add('output-body');if(new URLSearchParams(location.search).has('obs'))document.body.classList.add('obs');
 // The lower third keeps the page, wrapper and canvas transparent so the video underneath stays visible.
 if(isLower||isGraphics){document.documentElement.classList.add('lower-page');document.body.classList.add('lower-body');}
 document.title=isGraphics?'Wordlight | Graphics':isLower?'Wordlight | Lower third':'Wordlight | Presentation';
 if(!$('#outputStage'))$('#app').innerHTML='<div class="output-wrap"><div class="stage-frame" id="outputStage"></div></div><div class="output-tools">'+button('Full screen','fullscreen','expand')+'</div>';
 const words=live.style.highlights||live.style.highlightWords||[];
 if(isGraphics)mountStage($('#outputStage'),graphicsMarkup(live.graphics));
 else if(isLower)drawLowerThird($('#outputStage'),live.slides[live.index],live.style,live.blank,words,live.lowerThird);
 else drawStage($('#outputStage'),live.slides[live.index],live.style,live.blank,words);
 paintTimers();
}
// The live slide in a band over a transparent canvas. Blank, or nothing sent, leaves the canvas fully transparent.
function drawLowerThird(frame,slide,style,blank,words,settings){
 if(!frame)return;
 const lt=cleanLowerThird(settings),content=blank?null:lowerThirdContent(slide,style);
 words=words.filter(h=>typeof h==='string'||(h.slideId||'')===(slide?.sourceId||''));
 const t=THEMES[style.theme]||THEMES.midnight,accent=safeColor(style.accent)||t.accent,font=(FONTS[(slide?.type==='text'&&slide.format?.font)||style.font]||FONTS.serif).css;
 const h=text=>highlight(text,words.length?words:(slide?.note?[{word:slide.note.word,color:safeColor(slide.note.color)||accent}]:[]),accent);
 const reference=lt.showReference?[content?.reference,content?.translation].filter(Boolean).join(' · '):'';
 // Keep the live slide's bold and italic: the text slide's own settings, or the Design settings for Bible slides.
 const f=slide?.type==='text'?cleanTextSlide(slide.format):null,weight=b=>b?'700':'400',slant=i=>i?'italic':'normal';
 const bodyStyle='font-weight:'+weight(f?f.bold:style.bold)+';font-style:'+slant(f?f.italic:style.italic);
 const headingStyle=f?'font-weight:'+weight(f.headingBold)+';font-style:'+slant(f.headingItalic):'',subtitleStyle=f?'font-weight:'+weight(f.subtitleBold)+';font-style:'+slant(f.subtitleItalic):'';
 const band=content&&(content.heading||content.subtitle||content.text||reference||content.credit)?'<div class="lower-band" data-fit="'+lt.fit+'" data-base-size="'+lt.fontSize+'" data-band-height="'+lt.height+'" style="'+lowerThirdBandStyle(lt)+';font-size:'+lt.fontSize+'px;text-align:'+(lt.align==='right'?'right':lt.align==='left'?'left':'center')+'">'+
  (content.heading?'<div class="lower-heading" style="'+headingStyle+'">'+h(content.heading)+'</div>':'')+(content.subtitle?'<div class="lower-subtitle" style="'+subtitleStyle+'">'+h(content.subtitle)+'</div>':'')+(content.text?'<div class="lower-text'+(slide?.song?' lower-lines':'')+'" style="'+bodyStyle+'">'+h(lowerThirdFlow(content.text,slide))+'</div>':'')+(content.detail?'<div class="lower-detail">'+e(lowerThirdFlow(content.detail))+'</div>':'')+
  (reference?'<div class="lower-ref">'+e(reference)+'</div>':'')+(content.credit?'<div class="lower-credit">'+e(content.credit)+(content.credit.includes('CC BY-SA')?' · open.bible · creativecommons.org/licenses/by-sa/4.0':'')+'</div>':'')+'</div>':'';
 mountStage(frame,'<div class="stage-canvas lower-canvas'+(blank?' blank':'')+'" style="--accent:'+accent+';--slide-font:'+font.replaceAll('"','')+'">'+band+'</div>');
}
// Puts stage markup in a frame unless the same markup is already there, then scales and fits it.
function mountStage(frame,html){
 if(drawnStages.get(frame)===html&&frame.firstElementChild)return;
 drawnStages.set(frame,html);frame.innerHTML=html;
 if(!observer)observer=new ResizeObserver(entries=>{for(const entry of entries)scaleFrame(entry.target);});
 if(!observed.has(frame)){observer.observe(frame);observed.add(frame);}
 requestAnimationFrame(()=>{scaleFrame(frame);fitText(frame);});
}
// NKJV: the local companion holds the API.Bible key and returns whole chapters or the requested verses.
// Nothing from it is kept in browser storage.
let nkjvState=null;
const nkjvReady=()=>companionReady()&&!!nkjvState?.ready;
// The local studio calls its own companion. The paired web studio calls the same routes through the companion's bridge
// (only song and installed-Bible reads, song saves and image uploads pass). An unreachable companion gives an error
// marked offline, so lookups can fall back to the online copy of the same version.
const companionReady=()=>isLocal||!!pairing;
const assetUrl=id=>(location.protocol==='https:'?COMPANION_URL:'')+'/api/assets/'+id;
async function localFetch(path,options={}){
 if(isLocal)return fetch(path,options);
 if(!pairing)throw new Error('Connect OBS to use the library on this computer.');
 try{return await fetch(COMPANION_URL+'/api/bridge'+path.slice(4),{...options,mode:'cors',credentials:'omit',headers:{...(options.headers||{}),Authorization:'Bearer '+pairing.code}});}
 catch{const error=new Error('The Wordlight companion on this computer is not reachable.');error.offline=true;throw error;}
}
async function nkjvRequest(pathname,options={}){
 const response=await localFetch(pathname,{cache:'no-store',signal:AbortSignal.timeout(30000),...options});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'The NKJV lookup failed.');return data;
}
async function refreshNKJV(){if(!companionReady())return;try{nkjvState=await nkjvRequest('/api/bible/status');}catch{nkjvState=null;}paintNKJV();}
// NKJV without your own file: your API.Bible key when it is connected, otherwise (or when the companion holding the
// key is away) the public online NKJV. A failed lookup is reported; another version is never used instead.
async function lookupNKJV(query){
 const p=parseReference(query);let data=null;
 if(nkjvReady()){
  const params=new URLSearchParams({book:p.book.id,chapter:p.chapter,verse:p.verse??'',endChapter:p.endChapter,endVerse:p.endVerse??''});
  try{data=await nkjvRequest('/api/bible/nkjv?'+params);}catch(err){if(!err.offline)throw err;}
 }
 data||=await bollsPassage(p);
 return {...data,reference:p.reference,text:data.verses.map(v=>v.text).join('\n'),translation_id:'nkjv'};
}
function nkjvChapter(bookId,chapter){
 const online=()=>bollsChapter(bookId,Number(chapter));
 return nkjvReady()?nkjvRequest('/api/bible/nkjv?'+new URLSearchParams({book:bookId,chapter})).catch(err=>{if(!err.offline)throw err;return online();}):online();
}
function bibleStatusText(tr){
 if(String(tr).startsWith('ao:'))return 'Online lookup from bible.helloao.org, one chapter at a time.';
 const b=installedBibles?.find(x=>x.id===tr);
 if(!b||(!isLocal&&!b.installed))return 'Online lookup. Your own pasted text works offline.';
 if(!isLocal)return companion.state==='connected'?b.abbreviation+' is installed on this computer. Lookups use the companion.':b.abbreviation+' is installed on this computer, but the companion is not reachable'+(ONLINE_VERSIONS.has(tr)?', so lookups go online.':'.');
 if(b.installed)return b.abbreviation+' is installed on this computer. Lookups work offline.';
 if(b.job?.state==='running')return b.job.message;
 if(b.job?.state==='failed')return b.job.message;
 return 'Online lookup ('+b.abbreviation+' is not installed).';
}
function paintBibleInstall(tr){
 const el=$('#bibleInstall');if(!el)return;
 const b=isLocal&&installedBibles?.find(x=>x.id===tr);
 el.innerHTML=!b||b.job?.state==='running'||(b.importOnly&&!b.installed)?'':b.installed?'<details class="bible-installed"><summary>Installed copy</summary><p class="small-note">From <a href="'+e(b.details)+'" target="_blank" rel="noopener">eBible.org</a>.</p>'+button('Remove '+e(b.abbreviation)+' from this computer','bible-remove')+'</details>':button('Install '+e(b.abbreviation)+' for offline use','bible-install');
 el.querySelectorAll('button').forEach(x=>x.dataset.bible=b?.id||'');
}
function paintNKJV(){
 const panel=$('#nkjvPastePanel');if(!panel)return;
 const paste='<details class="nkjv-paste"><summary>Use pasted NKJV text instead</summary>'+label('NKJV passage to load','nkjvPasteText')+'<textarea id="nkjvPasteText" rows="6" maxlength="500000" placeholder="Paste NKJV text here..."></textarea><p class="small-note">Uses the reference above. Leave a blank line to start a new slide.</p><button class="button" id="loadNKJV">Load pasted NKJV</button></details>';
 // Your own NKJV file (FreeShow .fsb or VPL) makes NKJV work offline; it is never downloaded or shared.
 const importNote=isLocal&&!installedBible('nkjv')?'<p class="small-note">Have your own NKJV Bible file (FreeShow .fsb or VPL)? Import it to look up NKJV offline. Import only a file you are licensed to use; it stays on this computer.</p>'+button('Import NKJV file','nkjv-import'):'';
 const key=nkjvReady()?'<p class="small-note">API.Bible key connected'+(nkjvState.key==='environment'?' (from WORDLIGHT_API_BIBLE_KEY)':'')+'.</p>'+button('Disconnect NKJV','nkjv-disconnect')
  :'<p class="hint">Or paste the API key from your API.Bible account. Wordlight checks that it can read NKJV, then keeps the key in the companion on this computer only.</p>'+label('API.Bible key','nkjvKey')+'<input id="nkjvKey" type="password" autocomplete="off" spellcheck="false" maxlength="200">'+button('Connect NKJV','nkjv-connect')+'<p id="nkjvSetupStatus" class="small-note" aria-live="polite"></p>';
 panel.innerHTML=(isLocal&&!installedBible('nkjv')?'<details class="nkjv-own"><summary>Use your own NKJV (optional)</summary>'+importNote+key+'</details>':'')+paste;
 $('#loadNKJV').addEventListener('click',()=>{try{const text=$('#nkjvPasteText').value,ref=$('#referenceLookup').value;if(['Song','Presentation'].includes(itemSummary(draft,deckFor(draft)).kind)){draft=addContent(activeShow(library),ref||'NKJV',d=>applyPastedNKJV(d,text,ref),{reuseEmpty:false});summaryCache=new WeakMap();}else applyPastedNKJV(draft,text,ref);++lookupId;lookupBusy=false;lastRemovedBible=null;remember();render();toast('Pasted NKJV loaded in preview.');}catch(err){toast(err.message);}});
 $('#lookupTranslation')?.dispatchEvent(new Event('nkjv-state'));
}
document.addEventListener('click',ev=>{if(ev.target.closest('[data-action="nkjv-import"]'))chooseFile($('#bibleImportFile'));});
$('#bibleImportFile')?.addEventListener('change',async ev=>{
 const file=ev.target.files[0];ev.target.value='';if(!file)return;
 try{
  if(file.size>50e6)throw new Error('Choose a Bible file up to 50 MB.');
  toast('Importing '+file.name+'…');
  installedBibles=(await nkjvRequest('/api/bibles/import?'+new URLSearchParams({id:'nkjv',name:file.name}),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:await file.arrayBuffer()})).bibles;
  const b=installedBibles.find(x=>x.id==='nkjv');paintNKJV();$('#lookupTranslation')?.dispatchEvent(new Event('nkjv-state'));
  toast('NKJV imported: '+(b?.verses||0).toLocaleString()+' verses. Lookups now work offline.');
 }catch(err){toast(err.message||'That file could not be imported.');}
});
document.addEventListener('click',async ev=>{
 const t=ev.target.closest('[data-action="nkjv-connect"],[data-action="nkjv-disconnect"]');if(!t)return;
 const status=$('#nkjvSetupStatus'),connect=t.dataset.action==='nkjv-connect';
 try{
  if(connect&&status)status.textContent='Checking the key with API.Bible…';
  const key=connect?$('#nkjvKey')?.value||'':'';if(connect&&$('#nkjvKey'))$('#nkjvKey').value='';
  nkjvState=await nkjvRequest(connect?'/api/bible/connect':'/api/bible/disconnect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(connect?{key}:{})});
  paintNKJV();toast(connect?'NKJV connected. Look up any reference as usual.':'NKJV disconnected. The key was removed from this computer.');
 }catch(err){if(status){status.textContent=err.message;status.className='small-note status-error';}else toast(err.message);}
});
// Installed Bibles: read from the companion's data folder, so lookups need no internet. The list is read once when
// the Bible panel opens and polled only while an install is running.
let installedBibles=null,bibleInstallTimer=0;
const installedBible=tr=>companionReady()&&!!installedBibles?.find(b=>b.id===tr&&b.installed);
// Versions that can also be looked up online when the paired companion is not reachable.
const ONLINE_VERSIONS=new Set(['kjv','web','asv','bbe','darby','oeb-us','oycb','nkjv']);
async function refreshInstalledBibles(){
 if(!companionReady())return;
 try{installedBibles=(await nkjvRequest('/api/bibles')).bibles;}catch{installedBibles=null;}
 paintNKJV();
 clearTimeout(bibleInstallTimer);if(installedBibles?.some(b=>b.job?.state==='running'))bibleInstallTimer=setTimeout(refreshInstalledBibles,1000);
 $('#lookupTranslation')?.dispatchEvent(new Event('nkjv-state'));
}
async function lookupInstalled(tr,query){
 const p=parseReference(query),params=new URLSearchParams({translation:tr,book:p.book.id,chapter:p.chapter,verse:p.verse??'',endChapter:p.endChapter,endVerse:p.endVerse??''});
 const data=await nkjvRequest('/api/bibles/passage?'+params);
 return {...data,reference:p.reference,text:data.verses.map(v=>v.text).join('\n'),translation_id:tr};
}
document.addEventListener('click',async ev=>{
 const t=ev.target.closest('[data-action="bible-install"],[data-action="bible-remove"]');if(!t)return;
 try{const install=t.dataset.action==='bible-install';installedBibles=(await nkjvRequest('/api/bibles/'+(install?'install':'remove'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:t.dataset.bible})})).bibles;refreshInstalledBibles();}
 catch(err){toast(err.message);}
});
// Version and build of the local companion, shown in OBS & screens. A review copy (WORDLIGHT_PREVIEW=1) also says so
// in the header and window title.
async function showAppInfo(){
 try{appInfo=await (await fetch('/api/health',{cache:'no-store'})).json();}catch{return;}
 const build=$('#appBuild');if(build)build.textContent='Wordlight '+appInfo.version+' · build '+appInfo.build+(appInfo.preview?' · preview copy':'');
 if(appInfo.preview){document.title=APP_NAME+' (preview)';const label=$('.logo span');if(label&&!/PREVIEW/.test(label.textContent))label.textContent+=' · PREVIEW';}
}
// Version selector: pinned versions first, then the other built-in ones; the current version if it is neither.
const BUILT_IN=[['kjv','King James Version (KJV)'],['web','World English Bible (WEB)'],['asv','American Standard Version (ASV)'],['bbe','Bible in Basic English (BBE)'],['darby','Darby Bible'],['oeb-us','Open English Bible (US)'],['oycb','Yorùbá · Open Yoruba Contemporary Bible (OYCB)'],['nkjv','New King James Version (NKJV)']];
let catalogCache=null,catalogShown=50,catalogQuery='';const usedVersions=new Map();
// The version being looked up: the key saved with the passage, or (older shows) the on-screen version label.
const currentKey=()=>draft.verseRange?.translation||draft.translation.toLowerCase();
function versionInfo(key){
 const pinned=readPinned(localStorage).find(p=>p.key===key),row=usedVersions.get(key)||catalogCache?.find(r=>r.key===key);
 if(row)return {label:row.label,name:row.name,credit:aoCredit(row)};
 if(pinned)return {label:pinned.label,name:pinned.name,credit:pinned.credit};
 // An AO version from a saved show: its label and credit are already in the show.
 return {label:draft.translation||key.slice(3),name:draft.translation||key.slice(3),credit:draft.scriptureAttribution||''};
}
function translationOptions(current){
 const pinned=readPinned(localStorage),pinnedKeys=new Set(pinned.map(p=>p.key));
 const opt=(key,text)=>'<option value="'+e(key)+'" '+(key===current?'selected':'')+'>'+e(text)+'</option>';
 const known=BUILT_IN.some(([k])=>k===current)||pinnedKeys.has(current);
 return '<optgroup label="Pinned">'+pinned.map(p=>opt(p.key,p.name+' ('+p.label+')')).join('')+'</optgroup>'+
  (current&&!known&&isLookupKey(current)?'<optgroup label="This passage">'+opt(current,versionInfo(current).name)+'</optgroup>':'')+
  '<optgroup label="Other versions">'+BUILT_IN.filter(([k])=>!pinnedKeys.has(k)).map(([k,t])=>opt(k,t)).join('')+'</optgroup>';
}
function setTranslationSelect(key){const s=$('#lookupTranslation');if(!s)return;s.innerHTML=translationOptions(key);s.value=key;s.dispatchEvent(new Event('change'));}
// Versions dialog: the AO catalogue (metadata only) is fetched when the dialog first opens and kept for a day.
async function loadCatalog(){
 if(catalogCache)return catalogCache;
 try{const saved=JSON.parse(localStorage.getItem('wordlight-version-catalog')||'null');if(saved&&Date.now()-saved.at<864e5&&Array.isArray(saved.rows)){catalogCache=saved.rows;return catalogCache;}}catch{}
 const response=await fetch(AO_CATALOG_URL,{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('The version list could not be loaded ('+response.status+').');
 catalogCache=catalogRows(await readLimitedJSON(response,5e6,'The version list'));
 try{localStorage.setItem('wordlight-version-catalog',JSON.stringify({at:Date.now(),rows:catalogCache}));}catch{}
 return catalogCache;
}
function paintVersions(){
 const list=$('#versionsList');if(!list)return;
 const rows=filterRows(catalogCache||[],catalogQuery),pinned=new Set(readPinned(localStorage).map(p=>p.key));
 list.innerHTML=rows.slice(0,catalogShown).map(r=>'<div class="version-row"><div><strong>'+e(r.name)+'</strong><span class="small-note">'+e(r.label)+' · '+e(r.language)+' · '+e(coverage(r))+' · '+(r.publicDomain?'public domain':r.licenseUrl?'<a href="'+e(r.licenseUrl)+'" target="_blank" rel="noopener">licence</a>':'licence not stated')+'</span></div><button class="button" data-action="version-use" data-key="'+e(r.key)+'">Use</button><button class="button" data-action="version-pin" data-key="'+e(r.key)+'">'+(pinned.has(r.key)?'Unpin':'Pin')+'</button></div>').join('')+
  (rows.length>catalogShown?button('Show more ('+(rows.length-catalogShown)+' more)','versions-more'):'');
 $('#versionsCount').textContent=rows.length+' of '+(catalogCache||[]).length+' versions';
}
async function openVersions(){
 const d=$('#versionsDialog');catalogShown=50;
 d.innerHTML='<div class="dialog-top"><span class="eyebrow">BIBLE VERSIONS</span><button class="icon-button" data-action="versions-close" aria-label="Close">×</button></div><h2 id="versionsTitle">More Bible versions</h2><p class="small-note">Open translations listed by bible.helloao.org, looked up online one chapter at a time. Pin the ones you use to keep them at the top of the Bible panel.</p>'+input('versionsSearch',catalogQuery,'placeholder="Search by name, language or abbreviation" autocomplete="off" aria-label="Search versions"')+'<p id="versionsCount" class="small-note" aria-live="polite">Loading the version list…</p><div id="versionsList" class="versions-list"></div>';
 if(!d.open)d.showModal();
 $('#versionsSearch').addEventListener('input',ev=>{catalogQuery=ev.target.value;catalogShown=50;paintVersions();});
 try{await loadCatalog();paintVersions();}catch(err){$('#versionsCount').textContent=(err.message||'The version list could not be loaded.')+' Check the internet connection.';}
}
document.addEventListener('click',ev=>{
 const t=ev.target.closest('[data-action="versions-open"],[data-action="versions-close"],[data-action="versions-more"],[data-action="version-use"],[data-action="version-pin"]');if(!t)return;
 const action=t.dataset.action;
 if(action==='versions-open'){openVersions();return;}
 if(action==='versions-close'){$('#versionsDialog').close();return;}
 if(action==='versions-more'){catalogShown+=50;paintVersions();return;}
 const row=(catalogCache||[]).find(r=>r.key===t.dataset.key);if(!row)return;
 usedVersions.set(row.key,row);
 if(action==='version-pin'){
  const list=readPinned(localStorage),i=list.findIndex(p=>p.key===row.key);
  if(i>=0)list.splice(i,1);else list.push({key:row.key,label:row.label,name:row.name,credit:aoCredit(row)});
  savePinned(localStorage,list);paintVersions();const s=$('#lookupTranslation');if(s)setTranslationSelect(s.value);return;
 }
 $('#versionsDialog').close();setTranslationSelect(row.key);toast(row.name+' selected. Look up a reference.');
});
async function getBibleData(path){
 const ao=path.match(/^\/ao\/([A-Za-z0-9_-]{2,40})\/([A-Z0-9]{3})\/(\d+)$/);
 if(ao){
  const key='wordlight-bible-v2-'+path;let raw=load(key);
  if(!raw){
   const response=await fetch('https://bible.helloao.org/api/'+ao[1]+'/'+ao[2]+'/'+ao[3]+'.simple.json',{signal:AbortSignal.timeout(12000)});
   if(response.status===404)return {verses:aoChapter(null,ao[2],Number(ao[3]))};
   if(!response.ok)throw new Error(response.status===429?'Bible lookup is busy. Wait a moment and try again.':'Could not load the passage. Check your connection.');
   raw=await readLimitedJSON(response,2e6,'The chapter');try{localStorage.setItem(key,JSON.stringify(raw));}catch{}
  }
  return {verses:aoChapter(raw,ao[2],Number(ao[3]))};
 }
 const local=path.match(/^\/local\/([a-z-]+)\/([A-Z0-9]{3})\/(\d+)$/);
 if(local)return nkjvRequest('/api/bibles/passage?'+new URLSearchParams({translation:local[1],book:local[2],chapter:local[3]}));
 const nkjv=path.match(/^\/nkjv\/([A-Z0-9]{3})\/(\d+)$/);
 if(nkjv)return nkjvChapter(nkjv[1],nkjv[2]);
 const key='wordlight-bible-v2-'+path;const cached=load(key);if(cached)return cached;
 const yor=path.match(/^\/yoruba\/([A-Z0-9]{3})\/(\d+)$/);
 const url=yor?'https://bible.helloao.org/api/yor_bib/'+yor[1]+'/'+yor[2]+'.simple.json':'https://bible-api.com'+path;
 const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error(response.status===429?'Bible lookup is busy. Wait a moment and try again.':'Could not load the passage. Check your reference and connection.');
 const data=await readLimitedJSON(response,2e6,'The passage');if(data.error)throw new Error(data.error);
 try{localStorage.setItem(key,JSON.stringify(data));}catch{}return data;
}
// Previous/Next verse: each click moves one verse and the verse goes to the screen once it has loaded. Clicks made
// while a verse is loading add up and only the final verse is sent (the latest intent wins). If a step fails, or the
// show or item changes meanwhile, nothing is sent and the screen keeps its slide. Choosing another slide, editing the
// passage or starting a manual lookup also cancels the steps: each step checks that the preview is still the one it set.
async function stepVerse(delta){
 verseSteps+=delta;if(verseStepping)return;
 verseStepping=true;renderVerseNavigation();
 const start=activeShow(library),showId=start.id,sceneId=start.activeSceneId,intent=verseIntent;
 let ok=true,moved=false,expected=null;
 const same=()=>{const s=activeShow(library);return s.id===showId&&s.activeSceneId===sceneId&&intent===verseIntent&&(!expected||(draft.previewId===expected.preview&&draft.reference===expected.reference));};
 try{
  while(verseSteps){
   const step=Math.sign(verseSteps);verseSteps-=step;
   if(!same()||!await lookupPassage(step,{quiet:true})){ok=false;break;}
   moved=true;expected={preview:draft.previewId,reference:draft.reference};
  }
 }finally{verseSteps=0;verseStepping=false;renderVerseNavigation();}
 if(!ok||!moved||!same())return;
 const slide=deckFor(draft).find(s=>s.id===draft.previewId);
 const sent=await publish(currentSnapshot());if(sent)toast(sentMessage(slide?.reference||'Verse',sent));
}
async function lookupPassage(delta=0,options={}){
 // A manual lookup replaces any verse steps still loading.
 if(!options.quiet){verseIntent++;if(verseStepping){++lookupId;lookupBusy=false;}}
 if(lookupBusy)return false;
 const selected=deckFor(draft).find(s=>s.id===draft.previewId);
 const verseOrder=new Map((draft.bibleVerses||[]).map((v,i)=>['passage-'+v.bookId+'-'+v.chapter+'-'+v.verse,i]));
 const verseSlides=deckFor(draft).filter(s=>s.type==='passage'&&s.versePoint).sort((a,b)=>verseOrder.get(a.id)-verseOrder.get(b.id));
 if(delta&&selected?.versePoint){const index=verseSlides.findIndex(s=>s.id===selected.id),next=verseSlides[index+delta];if(next){draft.previewId=next.id;remember();render();if(!options.quiet)toast(next.reference+' selected in preview.');return true;}}
 const query=$('#referenceLookup')?.value.trim()||draft.reference;
 const tr=delta?(draft.verseRange?.translation||draft.translation.toLowerCase()):($('#lookupTranslation')?.value||currentKey());
 if(!query&&!delta)return toast('Enter a reference first.');
 if(!isLookupKey(tr))return toast('Choose a lookup translation in the Bible tab.');
 let normalized=query;
 if(!delta){
  try{normalized=parseReference(query).reference;}
  catch(err){const el=$('#lookupStatus');if(el){el.textContent=err.message;el.className='small-note status-error';}return toast(err.message);}
  const field=$('#referenceLookup');if(field)field.value=normalized;
 }
 const request=++lookupId,showId=library.activeShowId,sceneId=activeShow(library).activeSceneId,oldText=draft.passage,oldReference=draft.reference,oldPreview=draft.previewId;
 lookupBusy=true;renderVerseNavigation();const status=$('#lookupStatus');if(status)status.textContent='Finding your passage…';
 try{
  const path='/'+encodeURIComponent(delta?draft.reference:normalized)+'?translation='+tr+'&single_chapter_book_matching=indifferent';
  const online=ONLINE_VERSIONS.has(tr),offline=installedBible(tr)&&(isLocal||companion.state==='connected'||!online);
  let fellBack=false;const orOnline=(local,remote)=>local().catch(err=>{if(isLocal||!err.offline||!online)throw err;fellBack=true;return remote();});
  const lookupOnline=()=>tr==='oycb'?lookupYoruba(delta?draft.reference:normalized,getBibleData):tr==='nkjv'?lookupNKJV(delta?draft.reference:normalized):tr.startsWith('ao:')?lookupAO(tr,delta?draft.reference:normalized,getBibleData):getBibleData(path);
  const lookup=()=>offline?orOnline(()=>lookupInstalled(tr,delta?draft.reference:normalized),lookupOnline):lookupOnline();
  const adjacentOnline=()=>tr.startsWith('ao:')?adjacentByChapter(range,delta,getBibleData,'/ao/'+tr.slice(3)):adjacentVerse(range,delta,getBibleData);
  const range=delta?(selected?.versePoint?{translation:tr,start:selected.versePoint,end:selected.versePoint}:(draft.verseRange||rangeFromResponse(await lookup(),tr))):null;
  const data=delta?await (offline?orOnline(()=>adjacentByChapter(range,delta,getBibleData,'/local/'+tr),adjacentOnline):adjacentOnline()):await lookup();
  if(request!==lookupId||showId!==library.activeShowId||sceneId!==activeShow(library).activeSceneId)return false;
  if(options.quiet&&draft.previewId!==oldPreview)return false;
  if(draft.passage!==oldText||draft.reference!==oldReference){toast('Your passage changed during lookup. Try again when ready.');return;}
  if(!data){toast(delta<0?'You are at the first verse in this translation.':'You are at the last verse in this translation.');return;}
  if(typeof data.text!=='string'||!data.text.trim())throw new Error('No passage found.');
  lastRemovedBible=null;const reference=data.reference||normalized;
  // AO versions: the short label goes on screen with the version's licence line; the key stays in the verse range.
  if(data&&tr.startsWith('ao:')){const v=versionInfo(tr);Object.assign(data,{label:v.label,attribution:v.credit,source:{provider:'AO Bible API',bibleId:tr.slice(3),fetchedAt:Date.now()}});}
  // Scripture goes into the current Scripture item (or an empty or older mixed one). From a Song or Presentation item,
  // or with Add passage as new item, it becomes a new Scripture item, checked complete before it is added. The screen
  // is unchanged either way.
  {const show=activeShow(library),kind=itemSummary(draft,deckFor(draft)).kind,scene=activeScene(show);
   if((options.newItem&&!isEmptyDraft(draft))||kind==='Song'||kind==='Presentation'){
    draft=addContent(show,reference,d=>applyBiblePassage(d,{...data,reference},tr),{reuseEmpty:false});summaryCache=new WeakMap();
   }else{
    if(autoName(scene.name)||scene.name===oldReference)renameScene(show,scene.id,reference);
    applyBiblePassage(draft,{...data,reference},tr);
   }}
  rememberRecent(localStorage,reference,tr);
  remember();render();if(fellBack)toast('The companion is not reachable, so '+tr.toUpperCase()+' was looked up online.');else if(!options.quiet)toast(reference+' loaded in preview. Send to screen when ready.');
  return true;
 }catch(err){if(request===lookupId&&showId===library.activeShowId){const el=$('#lookupStatus');if(el){el.textContent=err.message;el.className='small-note status-error';}toast(err.message);}}
 finally{if(request===lookupId){lookupBusy=false;renderVerseNavigation();}}
}
function adaptedCredit(credit){return !credit.includes('CC BY-SA')||credit.startsWith('Adapted')?credit:'Adapted Yoruba text. Original work © 2009, 2017 Biblica, Inc., available at open.bible. Changes by the presenter · CC BY-SA 4.0';}
function stripHTML(html){return new DOMParser().parseFromString(String(html), 'text/html').body.textContent.trim();}
async function searchDictionary(){
 const query=$('#dictionaryQuery')?.value.trim();if(!query)return;
 const request=++wordLookupId;$('#dictionaryButton').disabled=true;$('#dictionaryResults').innerHTML='<p class="result-status">Searching the dictionary…</p>';
 try{
  const ck='wordlight-dictionary-'+query.toLowerCase();let results=load(ck);
  if(!results){const r=await fetch('https://bolls.life/dictionary-definition/BDBT/'+encodeURIComponent(query)+'/',{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error();results=await readLimitedJSON(r,2e6,'The dictionary entry');if(!Array.isArray(results))throw new Error();try{localStorage.setItem(ck,JSON.stringify(results.slice(0,25)));}catch{}}
  if(request!==wordLookupId||!$('#dictionaryResults'))return;dictionary=results.slice(0,25);
  $('#dictionaryResults').innerHTML=dictionary.length?'<p class="small-note">Choose an entry after checking it against your passage. Definitions can include several different senses.</p>'+dictionary.map((r,i)=>'<div class="dictionary-result"><strong>'+e(r.lexeme||r.topic)+'</strong> <span>'+e(r.topic)+'</span><div>'+e(r.transliteration||'')+'</div><p>'+e(stripHTML(r.definition||''))+'</p>'+button('Use original word','use-entry-'+i,'plus')+'</div>').join(''):'<p class="result-status">No entries found. Try a Strong’s number such as G3056, or write your own study notes.</p>';
 }catch{if($('#dictionaryResults'))$('#dictionaryResults').innerHTML='<p class="result-status status-error">The dictionary couldn’t be reached. You can still enter the original word and your notes above.</p><a class="inline-link" target="_blank" rel="noopener" href="https://www.blueletterbible.org/search/search.cfm?Criteria='+encodeURIComponent(query)+'&t=KJV">Check Blue Letter Bible ↗</a>';}
 finally{if($('#dictionaryButton'))$('#dictionaryButton').disabled=false;}
}
function useEntry(index){
 const r=dictionary[index];if(!r)return;let n=getNote();if(!n){addWord($('#wordInput')?.value||$('#dictionaryQuery')?.value||r.lexeme);n=getNote();}
 n.original=stripHTML(r.lexeme||'');n.transliteration=stripHTML(r.transliteration||'');n.strong=String(r.topic||'');n.source='https://bolls.life/dictionary-definition/BDBT/'+encodeURIComponent(n.strong||n.original)+'/';remember();renderWords();renderPreview();renderDeck();toast('Original word added. Write the meaning you want to teach in your explanation.');
}
let presentationRefreshing=false;
async function refreshPresentation(){
 if(presentationRefreshing)return;
 // Obtain the existing named window during the click so popup blockers can be reported.
 const w=window.open('','wordlight-presentation','popup,width=1280,height=720');
 if(!w)return toast('Allow pop-ups for Wordlight, then click Refresh presentation again.');
 let created=false;try{created=w.location.href==='about:blank';}catch{}
 presentationRefreshing=true;
 const control=$('[data-action="refresh-presentation"]');
 if(control){control.disabled=true;control.textContent='Refreshing...';}
 toast('Fetching fresh presentation files...');
 try{
  await freshPresentationFiles(location.href);
  if(w.closed)throw new Error('The presentation window was closed.');
  w.location.replace(refreshedOutputURL(location.href,crypto.randomUUID()));
  toast('Presentation refresh requested. Your saved shows and current slide are kept.');
 }catch(err){
  if(created&&!w.closed)w.close();
  toast('Refresh failed. '+err.message+' Your current presentation was not replaced.');
 }finally{
  presentationRefreshing=false;
  const current=$('[data-action="refresh-presentation"]');
  if(current){current.disabled=false;current.textContent='Refresh presentation';}
 }
}
function present(){const w=window.open('./?view=output','wordlight-presentation','popup,width=1280,height=720');if(!w)toast('Allow pop-ups for this site to open the presentation window.');else toast('Presentation window opened. Use Send to screen when you’re ready.');}
function showHelp(){
 const full=(isLocal?location.origin:COMPANION_URL)+'/?view=output&obs=1',lower=(isLocal?location.origin:COMPANION_URL)+'/?view=lower&obs=1';
 const urls='<div class="setup-panel"><h3>OBS Browser sources (1920 × 1080)</h3><p>Full screen</p><code class="code-line">'+e(full)+'</code><p>Lower third (transparent)</p><code class="code-line">'+e(lower)+'</code><p>Graphics: logo, timer, card (transparent)</p><code class="code-line">'+e(lower.replace('view=lower','view=graphics'))+'</code><p class="small-note">Leave Local file off and Shutdown source when not visible off. Both follow the same live screen, so one Send updates both.</p></div>';
 const ndi='<details class="setup-panel"><summary><h3>NDI</h3></summary><p>Wordlight does not send NDI itself; OBS does, with DistroAV. Put both Browser sources in one scene that stays rendered (for example a projector of a “Wordlight NDI Engine” scene) and give each source its own Dedicated NDI output filter, such as “Wordlight Full Screen” and “Wordlight Lower Third”. Keep that projector open and OBS not minimised: a source that is not being rendered can send stale frames. The lower third keeps its transparency. Check each feed on the receiving computer.</p></details>';
 const keys='<details class="setup-panel"><summary><h3>Keys</h3></summary><p>Alt + Enter sends the preview. When not typing: → or Page Down next live slide, ← or Page Up previous, B hides or restores the screen. While a song is on screen: 1–9 verse, C chorus, P pre-chorus, G bridge, T tag, E ending.</p></details>';
 $('#helpContent').innerHTML=isLocal?
  urls+'<div class="setup-panel" id="bridgePanel" hidden><h3>Web studio connection</h3><p>To control these outputs from the web version, enter this code there under OBS &amp; screens. Only that site can use it.</p><code class="code-line" id="pairingCode">…</code><p id="pairingViewers" class="small-note"></p>'+button('New code','companion-rotate')+'</div>'+ndi+keys+'<div class="setup-panel"><h3>TV</h3>'+button('Open presentation window','present','screen')+' '+button('Open lower third window','lower-window')+'</div><p class="small-note" id="appBuild">'+e(appInfo?'Wordlight '+appInfo.version+' · build '+appInfo.build+(appInfo.preview?' · preview copy':''):'')+'</p>':
  '<div class="setup-panel"><h3>Local companion</h3><p>OBS reads the outputs from the Wordlight companion on this computer. Start it (Start Wordlight.cmd), open its studio at '+e(COMPANION_URL)+', copy the code from OBS &amp; screens there, and enter it here. The browser may ask to allow access to devices on your local network; allow it.</p><div class="lookup-row">'+input('pairingInput',pairing?.code||'','placeholder="ABCD-EFGH-JKLM" maxlength="14" spellcheck="false" aria-label="Pairing code"')+button(pairing?'Reconnect':'Connect','companion-pair','','primary')+'</div><p id="pairingState" class="small-note"></p>'+(pairing?button('Disconnect','companion-forget'):'')+' <a class="button" href="wordlight-obs-companion.zip" download>'+icon('download')+'Download companion</a></div>'+urls+ndi+keys+'<div class="setup-panel"><h3>TV</h3>'+button('Open presentation window','present','screen')+'</div>';
 $('#helpDialog').showModal();refreshCompanion();
}
async function copyURL(){try{await navigator.clipboard.writeText(location.origin+'/?view=output&obs=1');toast('OBS output URL copied.');}catch{toast('Copy the URL shown in the setup guide.');}}
function downloadJSON(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(name.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'wordlight')+'.wordlight.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}
// Exports carry the background images their shows use (once each), so the file works on another computer. The images
// never enter the saved library: import puts them back into the companion's store, where the same bytes get the same id.
// An export is complete or not made: if any background image cannot be included, nothing is downloaded.
async function withImages(file,shows){
 const ids=[...backgroundAssetIds({shows})];if(!ids.length)return file;
 if(ids.length>40)throw new Error('These shows use '+ids.length+' background images; an export holds up to 40. Nothing was exported.');
 if(!companionReady())throw new Error('These shows use background images stored by the companion. Connect OBS, then export again. Nothing was exported.');
 const images=[];
 for(const id of ids){
  let r;try{r=await localFetch('/api/assets/'+id);}catch{throw new Error('The companion is not reachable, so the background images cannot be included. Nothing was exported.');}
  if(!r.ok)throw new Error('A background image used by these shows is missing from the image store. Choose another background for that item, then export again. Nothing was exported.');
  const blob=await r.blob();images.push({id,type:blob.type,name:graphicsAssets.find(a=>a.id===id)?.name||'background',data:await blobBase64(blob)});
 }
 const result={...file,images};
 if(JSON.stringify(result,null,2).length>60e6)throw new Error('This export would be larger than 60 MB, the most an import accepts. Export fewer shows. Nothing was exported.');
 return result;
}
const blobBase64=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
// Every image in the file is checked before anything is stored or imported: a damaged, oversized or mismatched image
// stops the whole import, so the library stays as it was. Returns the bytes to store.
function checkImages(images){
 if(images==null)return [];
 const refuse=why=>{throw new Error(why+' Nothing was imported.');};
 if(!Array.isArray(images)||images.length>40)refuse('The images in this file are not valid.');
 return images.map(image=>{
  if(!/^[a-f0-9]{16}$/.test(image?.id)||!['image/png','image/jpeg','image/webp'].includes(image.type)||typeof image.data!=='string')refuse('An image in this file is not valid.');
  if(image.data.length>4.2e6)refuse('An image in this file is larger than 3 MB.');
  let bytes;try{bytes=Uint8Array.from(atob(image.data),c=>c.charCodeAt(0));}catch{refuse('An image in this file is damaged.');}
  return {...image,bytes};
 });
}
// A file whose shows use background images imports only with the companion: each image must be in the file or already
// in this computer's store (removed-from-library images count; they are still kept). Text-only files import anywhere.
async function checkImported(used,images){
 if(!used.length&&!images.length)return;
 if(!companionReady())throw new Error('This file uses background images, which are kept by the companion. Connect OBS, then import again. Nothing was imported.');
 const inFile=new Set(images.map(i=>i.id));let absent=0;
 for(const id of used.filter(id=>!inFile.has(id))){
  let r;try{r=await localFetch('/api/assets/'+id);}catch{throw new Error('The companion is not reachable, so the background images cannot be checked. Nothing was imported.');}
  if(!r.ok)absent++;
 }
 if(absent)throw new Error(absent+' background image'+(absent===1?' used in this file is':'s used in this file are')+' neither in the file nor on this computer. Export again from the computer that has '+(absent===1?'it':'them')+'. Nothing was imported.');
}
// Puts the images back in the companion's store before the shows are added; the same bytes get the same id. Any
// failure stops the import, so the library is unchanged.
async function restoreImages(images){
 for(const image of images){
  let r;
  try{r=await localFetch('/api/assets?name='+encodeURIComponent(String(image.name||'background').slice(0,80)),{method:'POST',headers:{'Content-Type':image.type},body:image.bytes});}
  catch{throw new Error('The companion is not reachable, so the background images cannot be stored. Nothing was imported.');}
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error('An image in this file was refused: '+(data.error||'error '+r.status)+' Nothing was imported.');
  if(data.asset?.id!==image.id)throw new Error('An image in this file does not match its id. Nothing was imported.');
 }
 designAssets=false;
}
async function exportSession(){remember();const show=activeShow(library),name=draft.title;try{downloadJSON(await withImages({format:'wordlight-library',version:1,savedAt:Date.now(),activeShowId:show.id,shows:[show]},[show]),name);}catch(err){toast(err.message);}}
function currentSnapshot(id=draft.previewId){const show=activeShow(library);return {...snapshot(draft,id),timer:cleanTimer(live.timer),lowerThird:cleanLowerThird(live.lowerThird),graphics:cleanGraphics(live.graphics),showId:show.id,showTitle:draft.title,sceneId:show.activeSceneId,sceneName:activeScene(show).name};}
// Live slides sent before scenes existed belong to the first scene.
function liveInCurrentScene(){const show=activeShow(library);return live.showId===show.id&&(live.sceneId||MAIN_SCENE)===show.activeSceneId;}
document.addEventListener('click',async ev=>{
 const t=ev.target.closest('button,a');if(!t)return;
 if(t.dataset.tab){tab=t.dataset.tab;render();return;}
 if(t.dataset.word){addWord(t.dataset.word);return;}
 if(t.dataset.note){draft.selectedNoteId=t.dataset.note;if(!draft.previewId.startsWith('passage-')&&!activeTextSlide())draft.previewId='study-'+t.dataset.note+'-0';remember();render();return;}
 if(t.dataset.wordColor){setWordColor(t.dataset.wordColor);renderWords();return;}
 if(t.dataset.theme){draft.theme=t.dataset.theme;draft.accent='';remember();render();return;}
 if(t.dataset.slide){
  // Selecting never sends: select mode and Ctrl/Shift/Cmd-click only toggle the slide's item.
  if(deckSelecting||ev.shiftKey||ev.ctrlKey||ev.metaKey){toggleDeckSelection(t.dataset.slide);return;}
  // Our own double-click detection: the first click can redraw the deck, which would lose a native dblclick.
  // Keyboard activation (detail 0) never counts. timeStamp is input time, so a slow redraw does not matter.
  const double=ev.detail>0&&lastCardClick?.id===t.dataset.slide&&ev.timeStamp-lastCardClick.time<450&&Math.abs(ev.clientX-lastCardClick.x)<8&&Math.abs(ev.clientY-lastCardClick.y)<8;
  lastCardClick=double||!ev.detail?null:{id:t.dataset.slide,time:ev.timeStamp,x:ev.clientX,y:ev.clientY};
  if(double){sendSlideToScreen(t.dataset.slide);return;}
  draft.previewId=t.dataset.slide;const s=deckFor(draft).find(s=>s.id===draft.previewId);if(s?.note)draft.selectedNoteId=s.note.id;remember();renderPreview();renderDeck();if(s?.type==='text'&&!s.song){tab='slides';render();}else if(tab==='words')renderWords();else if(tab==='slides')renderSlides();return;}
 const a=t.dataset.action;if(!a)return;
 if(a==='timer'||a.startsWith('timer-')){await handleTimerAction(a);return;}
 if(a==='duplicate-preview'){duplicatePreviewSlide();return;}
 if(a==='delete-preview'){if(activeTextSlide())deleteTextSlide();else{const selected=deckFor(draft).find(s=>s.id===draft.previewId);if(!selected)return;lastRemovedBible={previewId:draft.previewId,excludedSlides:[...(draft.excludedSlides||[])],songs:[...(draft.songs||[])]};lastRemovedSlide=null;removeGroups(draft,[groupKey(selected)]);remember();render();toast('Slide deleted from this show. Undo deletion is available.');}return;}
 if(a==='undo-preview'){if(lastRemovedSlide)restoreTextSlide();else if(lastRemovedBible){draft.excludedSlides=lastRemovedBible.excludedSlides;if(lastRemovedBible.songs)draft.songs=lastRemovedBible.songs;draft.previewId=lastRemovedBible.previewId;lastRemovedBible=null;remember();render();}return;}
 if(handleShowAction(a,t))return;
 if(handleDeckAction(a,t))return;
 if(a.startsWith('lower-')||a.startsWith('live-view-')){handleLowerAction(a);return;}
 if(a.startsWith('picker-')){handlePickerAction(a,t,ev);return;}
 if(a.startsWith('song-')){handleSongAction(a,t);return;}
 if(a.startsWith('graphics-')){handleGraphicsAction(a,t);return;}
 if(a.startsWith('companion-')){handleCompanionAction(a);return;}
 if(a==='verse-prev'||a==='verse-next'){stepVerse(a==='verse-prev'?-1:1);return;}
 if(a==='keep-passage'){lookupPassage(0,{newItem:true});return;}
 if(a.startsWith('item-')){handleItemAction(a,t);return;}
 if(a==='phone-remote'){openPhoneRemote();return;}
 if(a==='new-text'){addTextSlide('content');return;}
 if(a.startsWith('template-')){addTextSlide(a.slice(9));return;}
 if(a==='reset-text-colors'){const s=activeTextSlide();if(s){s.headingColor='';s.bodyColor='';s.background='';remember();render();}return;}
 if(a==='duplicate-text'){duplicateTextSlide();return;}
 if(a==='delete-text'){deleteTextSlide();return;}
 if(a==='undo-slide'){restoreTextSlide();return;}
 if(a==='slide-earlier'||a==='slide-later'){movePreparedSlide(a==='slide-earlier'?-1:1);return;}
 if(a==='mark-selection'){markSelectedText();return;}
 if(a==='words'){tab='words';render();}
 else if(a==='send'){const next=currentSnapshot(),sent=await publish(next);if(sent)toast(sentMessage('Your preview',sent));}
 else if(a==='present')present();
 else if(a==='refresh-presentation')refreshPresentation();
 else if(a==='help')showHelp();
 else if(a==='close-help')$('#helpDialog').close();
 else if(a==='copy-url')copyURL();
 else if(a==='export')exportSession();
 else if(a==='import')chooseFile($('#importFile'));
 else if(a==='lookup')lookupPassage();
 else if(a==='dictionary')searchDictionary();
 else if(a==='add-word')addWord($('#wordInput').value);
 else if(a==='reset-word-color'){setWordColor('');renderWords();}
 else if(a==='delete-note'){const id=draft.selectedNoteId;draft.notes=draft.notes.filter(n=>n.id!==id);draft.selectedNoteId=draft.notes[0]?.id||'';if(!activeTextSlide())draft.previewId='passage-0';remember();render();}
 else if(a==='reset-accent'){draft.accent='';remember();render();}
 else if(a.startsWith('use-entry-'))useEntry(Number(a.slice(10)));
 else if(a==='blank')publish({...clone(live),blank:!live.blank});
 else if(a==='live-prev'||a==='live-next')moveLive(a==='live-prev'?-1:1);
 else if(a==='fullscreen'){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Use your browser’s full-screen shortcut instead.');}}
});
function moveLive(delta,reveal=false){if(!live.slides.length)return;publish({...clone(live),index:Math.max(0,Math.min(live.slides.length-1,live.index+delta)),blank:false}).then(ok=>{if(ok&&reveal)$('.slide-card .live-pin')?.closest('.slide-card')?.scrollIntoView({block:'nearest',inline:'nearest'});});}
$('#importFile').addEventListener('change',async ev=>{
 const file=ev.target.files[0];if(!file)return;
 try{if(file.size>60e6)throw new Error('That file is too large (maximum 60 MB).');const raw=JSON.parse(await file.text());
  // Check the shows first, then restore their images, so a bad file stores nothing.
  const shows=raw?.format==='wordlight-library'?cleanLibrary(raw).shows:[],images=checkImages(raw?.images);
  const used=raw?.format==='wordlight-library'?[...backgroundAssetIds({shows})]:[assetId((raw?.draft||raw)?.backgroundAssetId)].filter(Boolean);
  await checkImported(used,images);
  await restoreImages(images);
  const count=mergeShows(library,raw);switchShow(library.activeShowId);
  toast(count+' show'+(count===1?'':'s')+' imported'+(images.length?' with '+images.length+' background image'+(images.length===1?'':'s'):'')+'. Existing shows and the audience screen were kept.');if($('#showsDialog').open)renderShows();}
 catch(err){toast(err.message||'That session could not be opened.');}ev.target.value='';
});
document.addEventListener('keydown',ev=>{
 if(document.querySelector('dialog[open]'))return;
 if(ev.altKey&&ev.key==='Enter'&&!isOutput){ev.preventDefault();if(deckFor(draft).length)publish(currentSnapshot());return;}
 if(ev.target.closest('input,textarea,select,[contenteditable=true]')||$('#helpDialog').open)return;
 if(ev.ctrlKey||ev.metaKey||ev.altKey)return;
 if(jumpToSongSection(ev.key)){ev.preventDefault();return;}
 if(ev.key==='ArrowRight'||ev.key==='PageDown'){ev.preventDefault();moveLive(1,true);}else if(ev.key==='ArrowLeft'||ev.key==='PageUp'){ev.preventDefault();moveLive(-1,true);}else if(ev.key.toLowerCase()==='b'){ev.preventDefault();publish({...clone(live),blank:!live.blank});}
});

function fontOptions(value,follow=false){return (follow?'<option value="">Follow slide font</option>':'')+Object.entries(FONTS).map(([id,f])=>'<option value="'+id+'" '+(value===id?'selected':'')+'>'+f.name+'</option>').join('');}
function typeControls(prefix,s){return '<div class="field-row"><div>'+label(prefix==='heading'?'Heading font':'Subheading font',prefix+'Font')+'<select id="'+prefix+'Font">'+fontOptions(s[prefix+'Font'],true)+'</select></div><div class="body-tools"><label><input id="'+prefix+'Bold" type="checkbox" '+(s[prefix+'Bold']?'checked':'')+'> <b>Bold</b></label><label><input id="'+prefix+'Italic" type="checkbox" '+(s[prefix+'Italic']?'checked':'')+'> <i>Italic</i></label></div></div>';}
let lastRemovedSlide=null,lastRemovedBible=null,selectedTextPhrase='';
function slideField(labelText,id,value,extra=''){return label(labelText,id)+input(id,value,extra);}
function renderSlides(){
 const s=activeTextSlide();
 $('#panel').innerHTML='<h3 class="section-title">Slides</h3><div class="template-buttons">'+[['title','Title'],['content','Heading + text'],['quote','Quote'],['split','Split layout']].map(([id,name])=>button(name,'template-'+id)).join('')+'</div><label class="toggle-row"><input id="includePassage" type="checkbox" '+(draft.includePassage!==false?'checked':'')+'>Include Bible / pasted passage</label>'+
 (lastRemovedSlide?button('Undo removed slide','undo-slide'):'')+
 (s?'<div class="slide-edit-toolbar">'+button('Duplicate','duplicate-text')+button('Earlier','slide-earlier')+button('Later','slide-later')+button('Delete slide','delete-text','','danger')+'</div>'+
 slideField('Heading','textHeading',s.heading,'maxlength="400" placeholder="Add a heading"')+
 typeControls('heading',s)+slideField('Subheading','textSubtitle',s.subtitle,'maxlength="600" placeholder="Add a subheading (optional)"')+
 typeControls('subtitle',s)+label('Body text','textBody')+'<textarea id="textBody" rows="8" maxlength="30000" placeholder="Type or paste any text. Use a new line for each bullet.">'+e(s.body)+'</textarea><p class="small-note">Leave a blank line to start a new slide.</p>'+
 '<div class="body-tools"><label><input id="textBold" type="checkbox" '+(s.bold?'checked':'')+'> <b>Bold</b></label><label><input id="textItalic" type="checkbox" '+(s.italic?'checked':'')+'> <i>Italic</i></label><label><input id="textBullets" type="checkbox" '+(s.bullets?'checked':'')+'> Bullets</label></div>'+
 button('Format selected word or phrase','mark-selection')+''+tip('Select text in any field above, then click this button to highlight, underline, recolor, or outline it.')+''+
 '<div class="field-row"><div>'+label('Layout','textLayout')+'<select id="textLayout">'+[['title','Title'],['content','Heading + text'],['quote','Quote'],['split','Split layout']].map(([id,name])=>'<option value="'+id+'" '+(s.layout===id?'selected':'')+'>'+name+'</option>').join('')+'</select></div><div>'+label('Alignment','textAlign')+'<select id="textAlign">'+['left','center','right'].map(id=>'<option value="'+id+'" '+(s.align===id?'selected':'')+'>'+id[0].toUpperCase()+id.slice(1)+'</option>').join('')+'</select></div></div>'+
 '<div class="size-fields">'+[['Heading size','textHeadingSize',s.headingSize,36,160],['Subheading size','textSubtitleSize',s.subtitleSize,24,90],['Body size','textBodySize',s.bodySize,28,112]].map(([name,id,value,min,max])=>'<div>'+slideField(name,id,value,'type="number" min="'+min+'" max="'+max+'" step="2"')+'</div>').join('')+'</div><div class="field-row"><label class="toggle-row"><input id="textFit" type="checkbox" '+(s.fit?'checked':'')+'>Fit to screen</label><div>'+slideField('Fit padding (px)','textFitPadding',s.fitPadding,'type="number" min="'+FIT_PADDING.min+'" max="'+FIT_PADDING.max+'" step="4"')+'</div></div><p class="small-note" id="fitNotice">Sizes are in pixels on the 1920 × 1080 canvas.</p>'+tip('Fit scales heading, subheading and body together to fill the slide inside the padding. Turn it off to use the sizes above.')+''+
 '<div class="field-row"><div>'+label('Slide theme','textTheme')+'<select id="textTheme"><option value="">Follow Design</option>'+Object.entries(THEMES).map(([id,t])=>'<option value="'+id+'" '+(s.theme===id?'selected':'')+'>'+t.name+'</option>').join('')+'</select></div><div>'+label('Slide font','textFont')+'<select id="textFont">'+'<option value="">Follow Design</option>'+fontOptions(s.font)+'</select></div></div>'+
 '<div class="slide-colors">'+[['Heading color','textHeadingColor',s.headingColor||THEMES[s.theme||draft.theme].fg],['Text color','textBodyColor',s.bodyColor||THEMES[s.theme||draft.theme].fg],['Background','textBackground',s.background||THEMES[s.theme||draft.theme].bg]].map(([name,id,value])=>'<div>'+label(name,id)+'<input id="'+id+'" type="color" value="'+value+'"></div>').join('')+'</div>'+button('Reset slide colors','reset-text-colors')+
 slideField('Footer / credit','textFooter',s.footer,'maxlength="150" placeholder="Optional source, name, or reference"')+
 ''+tip('Long body text continues on additional slides. Your wording is kept.')+'':
 '<div class="subtle-card"><strong>Start with a layout above.</strong><p class="hint">Bible passages stay in the deck. Turn off “Include Bible / pasted passage” for a text-only presentation.</p></div>');
 $('#includePassage').addEventListener('change',ev=>{draft.includePassage=ev.target.checked;remember();renderPreview();renderDeck();});
 if(!s)return;
 for(const [id,key] of [['headingFont','headingFont'],['headingBold','headingBold'],['headingItalic','headingItalic'],['subtitleFont','subtitleFont'],['subtitleBold','subtitleBold'],['subtitleItalic','subtitleItalic'],['textHeading','heading'],['textSubtitle','subtitle'],['textBody','body'],['textFooter','footer'],['textLayout','layout'],['textAlign','align'],['textHeadingSize','headingSize'],['textSubtitleSize','subtitleSize'],['textBodySize','bodySize'],['textTheme','theme'],['textFont','font'],['textHeadingColor','headingColor'],['textBodyColor','bodyColor'],['textBackground','background'],['textBold','bold'],['textItalic','italic'],['textBullets','bullets'],['textFit','fit'],['textFitPadding','fitPadding']]){
  const el=$('#'+id);el.addEventListener('input',()=>{s[key]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;if(key==='fitPadding')s.fitPadding=fitPadding(el.value);if(key==='body')forgetPages('text-'+s.id+'-page-');if(s.attribution&&['heading','subtitle','body'].includes(key))s.attribution=adaptedCredit(s.attribution);remember();renderPreview();renderDeck();});
  if(['textHeading','textSubtitle','textBody'].includes(id))el.addEventListener('select',()=>{selectedTextPhrase=el.value.slice(el.selectionStart,el.selectionEnd).trim();});
 }
}
function addTextSlide(layout){
 const s=cleanTextSlide({id:crypto.randomUUID(),layout,align:layout==='title'||layout==='quote'?'center':'left'});
 // Text slides belong to a Presentation item: from a Song or Scripture item a new one is made, checked complete
 // before it is added. The screen is unchanged.
 const show=activeShow(library),kind=itemSummary(draft,deckFor(draft)).kind,scene=activeScene(show);
 if(kind==='Song'||kind==='Scripture'){
  try{draft=addContent(show,'Presentation',d=>{d.textSlides=[s];},{reuseEmpty:false});}catch(err){return toast(err.message);}
  summaryCache=new WeakMap();
 }else{
  draft.textSlides||=[];if(draft.textSlides.length>=200)return toast('This deck has reached 200 text slides.');
  if(kind==='Empty'&&autoName(scene.name))renameScene(show,scene.id,'Presentation');
  draft.textSlides.push(s);
 }
 draft.previewId='text-'+s.id;tab='slides';selectedTextPhrase='';remember();render();
}
function duplicateTextSlide(){duplicatePreviewSlide();}

function duplicatePreviewSlide(){
 const selected=deckFor(draft).find(s=>s.id===draft.previewId);if(!selected)return;
 try{
  const key=groupKey(selected),ids=copyGroups(draft,draft,[key]);
  const order=slideGroups(draft).map(g=>g.id).filter(id=>!ids.includes(id));order.splice(order.indexOf(key)+1,0,...ids);draft.slideOrder=order;
  draft.previewId=ids[0];tab='slides';remember();render();toast('Slide duplicated. You can edit the copy independently.');
 }catch(err){toast(err.message);}
}

function deleteTextSlide(){const s=activeTextSlide();if(!s)return;lastRemovedBible=null;lastRemovedSlide={slide:clone(s),index:draft.textSlides.indexOf(s),order:[...(draft.slideOrder||[])],notes:draft.notes.filter(n=>n.slideId===s.id).map(clone)};draft.notes=draft.notes.filter(n=>n.slideId!==s.id);draft.textSlides=draft.textSlides.filter(x=>x.id!==s.id);draft.slideOrder=(draft.slideOrder||[]).filter(id=>id!=='text-'+s.id);draft.previewId=deckFor(draft)[0]?.id||'';remember();render();toast('Slide deleted. Undo deletion is available beside Organize slides.');}
function restoreTextSlide(){if(!lastRemovedSlide)return;if(draft.textSlides.length>=200)return toast('Remove a slide before restoring this one.');draft.textSlides.splice(lastRemovedSlide.index,0,lastRemovedSlide.slide);draft.slideOrder=lastRemovedSlide.order;draft.notes.push(...lastRemovedSlide.notes);draft.previewId='text-'+lastRemovedSlide.slide.id;lastRemovedSlide=null;remember();render();}
function movePreparedSlide(delta){const s=deckFor(draft).find(x=>x.id===draft.previewId);if(!s)return;moveGroups(draft,[groupKey(s)],delta);remember();renderDeck();}
function markSelectedText(){if(!selectedTextPhrase)return toast('Select a word or phrase in the heading, subheading, or body first.');if(selectedTextPhrase.length>200)return toast('Select up to 200 characters for one phrase.');addWord(selectedTextPhrase);}
function textSlideMarkup(slide,colors,words){
 const f=cleanTextSlide(slide.format),h=(text)=>highlight(text,words,colors.accent);
 const heading=f.heading?'<h1 class="text-heading" data-base-size="'+f.headingSize+'" style="font-size:'+f.headingSize+'px;color:'+(f.headingColor||colors.fg)+';font-family:'+((FONTS[f.headingFont]||{}).css||'inherit')+';font-weight:'+(f.headingBold?'700':'400')+';font-style:'+(f.headingItalic?'italic':'normal')+'">'+h(f.heading)+'</h1>':'';
 const subtitle=f.subtitle?'<div class="text-subtitle" data-base-size="'+f.subtitleSize+'" style="font-size:'+f.subtitleSize+'px;font-family:'+((FONTS[f.subtitleFont]||{}).css||'inherit')+';font-weight:'+(f.subtitleBold?'700':'400')+';font-style:'+(f.subtitleItalic?'italic':'normal')+'">'+h(f.subtitle)+'</div>':'';
 const bodyStyle='font-size:'+f.bodySize+'px;font-weight:'+(f.bold?'700':'400')+';font-style:'+(f.italic?'italic':'normal')+';color:'+(f.bodyColor||colors.fg);
 const body=slide.text?(f.bullets?'<ul class="text-body text-bullets" data-base-size="'+f.bodySize+'" style="'+bodyStyle+'">'+slide.text.split(/\n/).filter(t=>t.trim()).map(t=>'<li>'+h(t)+'</li>').join('')+'</ul>':'<div class="text-body" data-base-size="'+f.bodySize+'" style="'+bodyStyle+'">'+h(slide.text)+'</div>'):'';
 return '<div class="text-slide-layout layout-'+f.layout+(f.fit?' fit-mode':'')+'" data-fit="'+f.fit+'" data-fit-pad="'+f.fitPadding+'" style="text-align:'+f.align+';--fit-pad:'+f.fitPadding+'px"><div class="text-heading-group">'+heading+subtitle+'</div>'+body+'</div><div class="slide-footer"><span>'+e(f.footer)+'</span><span>'+(slide.pages>1?slide.page+' / '+slide.pages:'')+'</span></div>';
}

let lookupBusy=false;
let removedShow=null,organizerUndo=null,organizerSelection=new Set(),showSearch='';
function switchShow(id){
 const show=library.shows.find(s=>s.id===id);if(!show)return;
 ++lookupId;++wordLookupId;lookupBusy=false;library.activeShowId=id;draft=show.draft;
 lastRemovedSlide=null;lastRemovedBible=null;selectedTextPhrase='';dictionary=[];organizerSelection.clear();deckSelection.clear();organizerUndo=null;deckSelecting=false;lastCardClick=null;tab='slides';
 remember();render();
}
function renderVerseNavigation(){
 const ready=!!(draft.verseRange||(draft.reference.trim()&&TRANSLATIONS.includes(draft.translation.toLowerCase())))&&(!lookupBusy||verseStepping);
 const nav='<div class="verse-navigation"><button class="button" data-action="verse-prev" title="Show the previous verse on screen" '+(!ready?'disabled':'')+'>'+icon('left')+'Previous verse</button><button class="button" data-action="verse-next" title="Show the next verse on screen" '+(!ready?'disabled':'')+'>Next verse'+icon('chevron')+'</button></div>';
 const message=lookupBusy?'Loading verse…':draft.verseRange?(draft.passageLayout==='flow'?'Previous and Next verse put the verse on screen. Flowing text is split by length.':'Previous and Next verse put the verse on screen, starting from the selected verse.'):ready?'Navigation follows the reference and version labels. Pasted text will be replaced.':'Look up a Bible reference to enable verse navigation.';
 const panel=$('#panelVerseNav');if(panel)panel.innerHTML=nav+'<p class="small-note">'+message+'</p>';
 const bar=$('#verseNav'),slide=deckFor(draft).find(s=>s.id===draft.previewId);
 if(bar)bar.innerHTML=slide&&slide.type!=='text'?'<div class="preview-verse-row"><span>'+e(slide.reference||draft.reference||'Bible passage')+'</span>'+nav+'</div>':'';
 const lookup=$('#lookupButton');if(lookup)lookup.disabled=lookupBusy||($('#lookupTranslation')?.value==='nkjv'&&!nkjvReady());
}
function keepPassage(){
 if(!draft.passage.trim())return toast('Look up or paste a passage first.');
 const source=cleanDraft(clone(draft));source.includePassage=true;
 try{const ids=copyGroups(source,draft,slideGroups(source).filter(g=>g.slides[0].type!=='text').map(g=>g.id));draft.previewId=ids[0]||draft.previewId;tab='slides';remember();render();toast('Passage kept as editable slides. You can now look up another passage.');}catch(err){toast(err.message);}
}
function renderShows(){
 const dialog=$('#showsDialog');
 dialog.innerHTML='<div class="dialog-top"><span class="eyebrow">LIBRARY</span><button class="icon-button" data-action="close-shows" aria-label="Close shows">×</button></div><h2 id="showsTitle">Shows</h2><div class="show-library-tools">'+input('newShowName','','placeholder="e.g. Sunday service" maxlength="100" aria-label="New show name"')+button('Create show','new-show','plus','primary')+'</div><div class="show-library-tools">'+input('showSearch',showSearch,'placeholder="Search shows…" aria-label="Search shows"')+button('Import shows','import','upload')+button('Export library','export-library','download')+'</div><p class="small-note">Saved '+(isLocal?'on this computer':'in this browser/profile')+'. Export the library for a backup or to move all shows to another computer.</p>'+(removedShow?button('Undo removed show','undo-show'):'')+'<div id="showList" class="show-list"></div>';
 $('#showSearch').addEventListener('input',ev=>{showSearch=ev.target.value;renderShowList();});
 $('#newShowName').addEventListener('keydown',ev=>{if(ev.key==='Enter')handleShowAction('new-show');});
 renderShowList();
}
function renderShowList(){
 const shows=library.shows.filter(s=>s.draft.title.toLowerCase().includes(showSearch.toLowerCase()));
 $('#showList').innerHTML=shows.length?shows.map(s=>'<article class="show-row '+(s.id===library.activeShowId?'active':'')+'"><div class="show-symbol">'+icon('screen')+'</div><div class="show-details"><input class="input show-name" data-show-name="'+e(s.id)+'" value="'+e(s.draft.title)+'" maxlength="100" aria-label="Rename '+e(s.draft.title)+'"><p class="small-note">'+deckFor(s.draft).length+' slides in this item · '+s.scenes.length+' item'+(s.scenes.length===1?'':'s')+(s.id===library.activeShowId?' · CURRENT SHOW':'')+(live.showId===s.id&&!live.blank?' · ON SCREEN':'')+'</p></div><div class="show-row-actions"><button class="button primary" data-action="open-show" data-show-id="'+e(s.id)+'">Open</button><button class="button" data-action="duplicate-show" data-show-id="'+e(s.id)+'">Duplicate</button><button class="button" data-action="remove-show" data-show-id="'+e(s.id)+'" '+(library.shows.length===1?'disabled':'')+'>Remove</button></div></article>').join(''):'<p class="empty-list">No shows match your search.</p>';
 document.querySelectorAll('[data-show-name]').forEach(el=>el.addEventListener('change',()=>{const s=library.shows.find(s=>s.id===el.dataset.showName);s.draft.title=el.value.trim()||'Untitled show';s.updated=Date.now();remember();render();renderShowList();}));
}
function openOrganizer(){
 organizerSelection.clear();organizerUndo=null;renderOrganizer();$('#organizeDialog').showModal();
}
function renderOrganizer(){
 const groups=slideGroups(draft);
 organizerSelection=new Set([...organizerSelection].filter(id=>groups.some(g=>g.id===id)));
 $('#organizeDialog').innerHTML='<div class="dialog-top"><span class="eyebrow">SLIDE ORGANIZER</span><button class="icon-button" data-action="close-organizer" aria-label="Close slide organizer">×</button></div><h2 id="organizeTitle">'+e(draft.title)+'</h2><p class="hint">Select slides to move or copy together. Continuation pages stay with their slide. Every verse in a range can be selected and organized separately.</p><div class="organizer-toolbar"><label><input type="checkbox" id="selectAllSlides" '+(groups.length&&organizerSelection.size===groups.length?'checked':'')+'> Select all</label><span id="selectedCount"></span>'+button('Earlier','bulk-earlier')+button('Later','bulk-later')+button('Duplicate','bulk-duplicate')+button('Delete selected slides','bulk-remove','','danger')+(organizerUndo?button('Undo deletion','bulk-undo'):'')+'</div><div class="organizer-transfer"><label for="copyDestination">Copy or move selected to</label><select id="copyDestination">'+destinationOptions()+'</select>'+button('Copy slides','bulk-copy')+button('Move slides','bulk-move')+'</div><div class="organizer-list">'+(groups.length?groups.map((g,i)=>'<div class="organizer-row"><label class="organizer-check"><input type="checkbox" data-group="'+e(g.id)+'" '+(organizerSelection.has(g.id)?'checked':'')+' aria-label="Select '+e(g.title)+'"><span class="index">'+String(i+1).padStart(2,'0')+'</span></label><div class="organizer-description"><strong>'+e(g.title)+'</strong><p>'+e(g.slides.map(s=>s.text).join(' ').slice(0,130))+'</p><span class="small-note">'+g.kind+' · '+g.slides.length+' screen'+(g.slides.length===1?'':'s')+'</span></div><button class="button" data-action="edit-group" data-group-id="'+e(g.id)+'">Edit</button></div>').join(''):'<p class="empty-list">This show is empty. Add a text slide or a Bible passage to get started.</p>')+'</div><p class="small-note">Copying a Bible block creates editable text slides, so a show can contain several passages.</p>';
 $('#selectAllSlides').addEventListener('change',ev=>{organizerSelection=new Set(ev.target.checked?groups.map(g=>g.id):[]);renderOrganizer();});
 document.querySelectorAll('[data-group]').forEach(el=>el.addEventListener('change',()=>{if(el.checked)organizerSelection.add(el.dataset.group);else organizerSelection.delete(el.dataset.group);updateOrganizerControls();}));
 updateOrganizerControls();
}
function updateOrganizerControls(){
 $('#selectedCount').textContent=organizerSelection.size+' selected';
 for(const action of ['bulk-earlier','bulk-later','bulk-duplicate','bulk-remove','bulk-copy','bulk-move'])for(const el of document.querySelectorAll('#organizeDialog [data-action="'+action+'"]'))el.disabled=!organizerSelection.size;
 const all=$('#selectAllSlides'),count=slideGroups(draft).length;all.checked=count>0&&organizerSelection.size===count;all.indeterminate=organizerSelection.size>0&&organizerSelection.size<count;
}
function handleShowAction(action,t){
 if(!['shows','close-shows','new-show','open-show','duplicate-show','remove-show','undo-show','export-library','organize','close-organizer','bulk-earlier','bulk-later','bulk-duplicate','bulk-remove','bulk-undo','bulk-copy','bulk-move','edit-group'].includes(action))return false;
 try{
 if(action==='shows'){renderShows();$('#showsDialog').showModal();}
 else if(action==='close-shows')$('#showsDialog').close();
 else if(action==='export-library'){remember();withImages(library,library.shows).then(file=>downloadJSON(file,'Wordlight-show-library'),err=>toast(err.message));}
 else if(action==='new-show'||action==='duplicate-show'){
  if(library.shows.length>=MAX_SHOWS)throw new Error('Your library has reached 100 shows. Export and remove unused shows first.');
  const source=action==='duplicate-show'?library.shows.find(s=>s.id===t.dataset.showId):null;
  const name=source?source.draft.title+' (copy)':$('#newShowName').value.trim()||'Untitled show';
  const show=source?copyShow(source,name):createShow(name);library.shows.push(show);switchShow(show.id);$('#showsDialog').close();toast('Show created. Add slides when ready.');
 }else if(action==='open-show'){switchShow(t.dataset.showId);$('#showsDialog').close();}
 else if(action==='remove-show'){
  if(library.shows.length<=1)throw new Error('Keep at least one show in your library.');
  const index=library.shows.findIndex(s=>s.id===t.dataset.showId);removedShow={show:library.shows[index],index};library.shows.splice(index,1);
  if(library.activeShowId===removedShow.show.id)switchShow(library.shows[Math.min(index,library.shows.length-1)].id);else{remember();render();}
  renderShows();toast('Show removed from library. Undo is available here. The audience screen is unchanged.');
 }else if(action==='undo-show'){
  if(removedShow){if(library.shows.length>=MAX_SHOWS)throw new Error('Remove a show before restoring this one.');library.shows.splice(removedShow.index,0,removedShow.show);removedShow=null;remember();render();renderShows();}
 }else if(action==='organize')openOrganizer();
 else if(action==='close-organizer')$('#organizeDialog').close();
 else if(action==='edit-group'){
  const g=slideGroups(draft).find(g=>g.id===t.dataset.groupId);draft.previewId=g.slides[0].id;tab=g.slides[0].song?'songs':g.slides[0].type==='text'?'slides':g.slides[0].note?'words':'passage';$('#organizeDialog').close();remember();render();
 }else if(action==='bulk-undo'){
  if(organizerUndo){
   draft=cleanDraft(organizerUndo.source);activeShow(library).draft=draft;
   // A move also put copies in another scene or show; put that destination back as it was.
   if(organizerUndo.target){const before=cleanDraft(organizerUndo.targetBefore);for(const key of Object.keys(organizerUndo.target))delete organizerUndo.target[key];Object.assign(organizerUndo.target,before);organizerUndo.targetShow.updated=Date.now();}
   organizerUndo=null;remember();render();if($('#organizeDialog').open)renderOrganizer();
  }
 }else{
  let notice='';const selected=[...organizerSelection];if(!selected.length)throw new Error('Select one or more slides first.');
  if(action==='bulk-earlier'||action==='bulk-later'){organizerUndo=null;moveGroups(draft,selected,action==='bulk-earlier'?-1:1);}
  if(action==='bulk-remove'){organizerUndo={source:clone(draft)};removeGroups(draft,selected);organizerSelection.clear();notice=selected.length+' item'+(selected.length===1?'':'s')+' deleted. Undo deletion is available.';}
  if(action==='bulk-duplicate'){organizerUndo=null;organizerSelection=new Set(copyGroups(draft,draft,selected));}
  if(action==='bulk-copy'||action==='bulk-move'){
   const target=bulkDestination(t?.closest('.bulk-bar,.organizer-transfer')?.querySelector('select')?.value);
   if(!target)throw new Error('Choose a destination item or show first.');
   const before=action==='bulk-move'?{source:clone(draft),target:target.draft,targetBefore:clone(target.draft),targetShow:target.show}:null;
   const ids=copyGroups(draft,target.draft,selected);target.show.updated=Date.now();
   if(before){removeGroups(draft,selected);organizerSelection.clear();organizerUndo=before;notice=selected.length+' item'+(selected.length===1?'':'s')+' moved to '+target.label+'. Undo deletion puts them back.';}
   else{organizerUndo=null;notice=ids.length+' slide'+(ids.length===1?'':'s')+' copied to '+target.label+'.';}
  }
  lastCardClick=null;remember();render();if($('#organizeDialog').open)renderOrganizer();if(notice)toast(notice);
 }
 }catch(err){toast(err.message);}
 return true;
}

const timerAppearanceFields={fontSize:'timerFontSize',textColor:'timerTextColor',backgroundColor:'timerBackgroundColor',backgroundOpacity:'timerBackgroundOpacity',padding:'timerPadding',radius:'timerRadius',offsetX:'timerOffsetX',offsetY:'timerOffsetY'};
function timerFormAppearance(){
 const next={...cleanTimer(live.timer)};
 for(const [key,id] of Object.entries(timerAppearanceFields)){const el=$('#'+id);if(el)next[key]=el.value;}
 return cleanTimerAppearance(next);
}
function applyTimerAppearance(element,timer,scale=1){
 for(const [key,value] of Object.entries(timerAppearanceStyle(timer,scale))){
  if(key.startsWith('--'))element.style.setProperty(key,value);else element.style[key]=value;
 }
}
function timerAppearanceControls(timer){
 const number=(title,key,min,max)=>'<div>'+label(title,timerAppearanceFields[key])+input(timerAppearanceFields[key],timer[key],'type="number" min="'+min+'" max="'+max+'" step="1"')+'</div>';
 const color=(title,key)=>'<div>'+label(title,timerAppearanceFields[key])+input(timerAppearanceFields[key],timer[key],'type="color"')+'</div>';
 return '<h3>Appearance</h3><p class="small-note">Preview changes above. Apply timer settings sends them to the audience without restarting the timer. Sizes use the 1920 x 1080 screen.</p>'+
 '<div class="field-row">'+number('Text size (px)','fontSize',24,160)+number('Background opacity (%)','backgroundOpacity',0,100)+'</div>'+
 '<div class="field-row">'+color('Text color','textColor')+color('Background color','backgroundColor')+'</div>'+
 '<div class="field-row">'+number('Padding (px)','padding',0,60)+number('Corner rounding (px)','radius',0,80)+'</div>'+
 '<div class="field-row">'+number('Distance from side (px)','offsetX',0,300)+number('Distance from top / bottom (px)','offsetY',0,300)+'</div>';
}
function paintTimers(){
 const timer=cleanTimer(live.timer),value=timerValue(timer),formatted=formatTimer(value);
 for(const canvas of document.querySelectorAll('.stage-canvas')){
  if(canvas.classList.contains('graphics-canvas'))continue;
  let overlay=canvas.querySelector('.timer-overlay');const visible=timer.visible&&!canvas.classList.contains('blank');
  if(!visible){overlay?.remove();continue;}
  if(!overlay){overlay=document.createElement('div');overlay.className='timer-overlay';canvas.append(overlay);}
  const look=JSON.stringify(cleanTimerAppearance(timer))+timer.position;
  if(overlay.dataset.look!==look){applyTimerAppearance(overlay,timer);overlay.dataset.position=timer.position;overlay.dataset.look=look;}
  overlay.classList.toggle('expired',timer.mode==='countdown'&&value===0);if(overlay.textContent!==formatted)overlay.textContent=formatted;
 }
 // Graphics timers: same clock and look; shown per the graphics settings of their canvas, never hidden by blanking.
 for(const el of document.querySelectorAll('[data-graphics-timer]')){
  const settings=el.closest('[data-graphics-source]')?.dataset.graphicsSource==='form'?graphicsForm():live.graphics,shown=graphicsTimerShown(settings,timer,value);
  if(el.hidden!==!shown)el.hidden=!shown;
  const appearance=cleanTimerAppearance(timer),scale=cleanGraphics(settings).timer.size/appearance.fontSize,look=JSON.stringify(appearance)+scale;
  if(el.dataset.look!==look){applyTimerAppearance(el,timer,scale);el.dataset.look=look;}
  el.classList.toggle('expired',timer.mode==='countdown'&&value===0);if(el.textContent!==formatted)el.textContent=formatted;
 }
 const readout=$('#timerReadout');if(readout){applyTimerAppearance(readout,timerFormAppearance(),0.6);if(readout.textContent!==formatted)readout.textContent=formatted;readout.classList.toggle('expired',timer.mode==='countdown'&&value===0);}
 const gState=$('#gTimerState');if(gState){const t=timer.running&&!(timer.mode==='countdown'&&value===0)?'Running':timer.mode==='countdown'&&value===0?'Finished':'Paused';if(gState.textContent!==t+' · '+formatted)gState.textContent=t+' · '+formatted;}
 const status=$('#timerStatus');if(status)status.textContent=(timer.running&&!(timer.mode==='countdown'&&value===0)?'Running':value===0&&timer.mode==='countdown'?'Finished':'Paused')+' · '+(timer.visible?'Overlay enabled':'Overlay hidden')+(live.blank?' · audience screen blank':'');
}
function showTimer(){
 const timer=cleanTimer(live.timer);
 $('#timerDialog').innerHTML='<div class="dialog-top"><span class="eyebrow">TIMER</span><button class="icon-button" data-action="timer-close" aria-label="Close timer">×</button></div><h2 id="timerTitle">Timer</h2><div class="timer-appearance-preview"><div id="timerReadout" class="timer-readout"></div></div><p class="small-note">Appearance preview at 60% size</p><p id="timerStatus" class="small-note"></p><div class="timer-actions">'+button('Start / resume','timer-start','','primary')+button('Pause','timer-pause')+button('Reset','timer-reset')+button(timer.visible?'Hide overlay':'Show overlay',timer.visible?'timer-hide':'timer-show')+'</div><p class="small-note">These controls update the live timer immediately. Hiding the audience screen also hides the overlay. Switching shows keeps the timer running.</p><div class="field-row"><div>'+label('Mode','timerMode')+'<select id="timerMode"><option value="countdown" '+(timer.mode==='countdown'?'selected':'')+'>Countdown</option><option value="stopwatch" '+(timer.mode==='stopwatch'?'selected':'')+'>Stopwatch</option></select></div><div>'+label('Duration (minutes)','timerMinutes')+input('timerMinutes',timer.durationMs/60000,'type="number" min="0.016667" max="1440" step="any"')+'</div></div>'+label('Overlay position','timerPosition')+'<select id="timerPosition">'+[['top-right','Top right'],['top-left','Top left'],['bottom-right','Bottom right'],['bottom-left','Bottom left']].map(([id,name])=>'<option value="'+id+'" '+(timer.position===id?'selected':'')+'>'+name+'</option>').join('')+'</select><div class="timer-actions">'+button('Apply timer settings','timer-apply')+'</div><p class="small-note">Applying a new mode or duration resets the timer to paused. Changing only its appearance or position keeps it running. Use Show overlay when you want the audience to see it.</p>';
 $('#timerPosition').insertAdjacentHTML('afterend',timerAppearanceControls(timer));
 for(const id of Object.values(timerAppearanceFields))$('#'+id).addEventListener('input',paintTimers);
 if(!$('#timerDialog').open)$('#timerDialog').showModal();paintTimers();
}
async function handleTimerAction(action){
 if(action==='timer'){showTimer();return;}if(action==='timer-close'){$('#timerDialog').close();return;}
 let timer=cleanTimer(live.timer);
 if(action==='timer-apply'){
  const duration=Number($('#timerMinutes').value),mode=$('#timerMode').value;
  if(!Number.isFinite(duration)||duration<1/60||duration>1440){toast('Enter a duration from 1 second to 1,440 minutes.');return;}
  const durationMs=Math.round(duration*60000);
  if(mode!==timer.mode||durationMs!==timer.durationMs)timer=changeTimer({...timer,mode,durationMs},'reset');
  timer={...timer,...timerFormAppearance(),position:$('#timerPosition').value};
 }else timer=changeTimer(timer,action.slice(6));
 if(await publish({...clone(live),timer})){showTimer();}
}
setInterval(paintTimers,250);

render();if(recoveredLibrary)toast('Recovered your previous saved library. Export a backup from Shows.');
// Companion connection. Edits are always kept in this browser first; saveRevision counts edits and savedRevision the
// last edit the companion confirmed, so the companion copy is behind whenever they differ. One save runs at a time.
// (Older wording follows.) The companion copy is
// behind. A failed save is retried when the event stream reconnects (no polling), and on reconnect the newer of the
// browser and companion libraries wins, by the same rule as at startup.
let saveRevision=0,savedRevision=0,saveInFlight=false,events=null,connectTry=0;
const unsaved=()=>saveRevision!==savedRevision;
async function flushLocalSave(){
 if(!isLocal||!unsaved()||saveInFlight)return;
 const revision=saveRevision;saveInFlight=true;let retryLater=true;
 try{await apiWrite({library});savedRevision=Math.max(savedRevision,revision);localReachable=true;setSaveStatus(unsaved()?'Saving…':'Saved on this computer');}
 catch(err){localReachable=false;retryLater=err.status!==413;setSaveStatus('Not saved to this computer yet · kept in this browser');}
 // A failed save is tried again every 5 s while changes are still unsaved, even if the live stream stays connected,
 // but not when the companion refused the library as too large (sending it again would only be refused again).
 finally{saveInFlight=false;if(unsaved()&&(localReachable||retryLater)){clearTimeout(saveTimer);saveTimer=setTimeout(flushLocalSave,localReachable?450:5000);}}
}
async function reconcileWithCompanion(){
 try{
  const r=await fetch('/api/state',{cache:'no-store',signal:AbortSignal.timeout(4000)});if(!r.ok)throw new Error();const s=await r.json();
  if(!isOutput&&(s.library||s.draft)){
   const serverLibrary=cleanLibrary(s.library,s.draft),chosen=chooseLocalLibrary(library,serverLibrary);
   if(chosen===library){if(unsaved())await flushLocalSave();else setSaveStatus('Saved on this computer');}
   else{library=serverLibrary;draft=activeShow(library).draft;savedRevision=saveRevision;try{saveLibrary(localStorage,library);}catch{}setSaveStatus('Saved on this computer · loaded newer changes');render();}
  }
  if(validLive(s.live)){live=s.live;cacheLive();if(isOutput)renderOutput();else{renderLive();renderDeck();}}
 }catch{setSaveStatus(unsaved()?'Not saved to this computer yet · kept in this browser':'Reconnecting to local app…');}
}
async function connectLocal(){
 if(!['localhost','127.0.0.1'].includes(location.hostname))return;
 try{
  const r=await fetch('/api/state',{signal:AbortSignal.timeout(2500)});if(!r.ok)throw new Error('not ready');const s=await r.json();if(s.app!=='wordlight')return;
  connectTry=0;isLocal=true;localReachable=true;showAppInfo();
  if(!isOutput&&(s.library||s.draft)){const serverLibrary=cleanLibrary(s.library,s.draft);const chosen=chooseLocalLibrary(library,serverLibrary);const browserWasNewer=chosen===library;library=chosen;draft=activeShow(library).draft;libraryError='';try{saveLibrary(localStorage,library);}catch{}if(browserWasNewer){saveRevision++;setSaveStatus('Saving…');flushLocalSave();}else setSaveStatus('Saved on this computer');}
  if(validLive(s.live)){live=s.live;cacheLive();}render();
  if(events)events.close();
  events=new EventSource('/api/events'+(isOutput?'?view='+(isGraphics?'graphics':isLower?'lower':'output'):''));events.onmessage=ev=>{try{const data=JSON.parse(ev.data);if(validLive(data.live)){live=data.live;cacheLive();if(isOutput)renderOutput();else {renderLive();renderDeck();}}}catch{}};events.onerror=()=>{localReachable=false;setSaveStatus(unsaved()?'Not saved to this computer yet · kept in this browser':'Reconnecting to local app…');if(events.readyState===EventSource.CLOSED)setTimeout(connectLocal,1000);};
  // The first open follows the startup load; later opens are reconnects, which reconcile and retry saves.
  let opened=false;events.onopen=()=>{localReachable=true;if(opened)reconcileWithCompanion();opened=true;};
 }catch{
  // The companion may still be starting: retry with backoff (1 s, 2 s, 4 s … up to 30 s), and stop once connected.
  // A connected page keeps its stream, which the browser reconnects by itself, unless the browser gave the stream up
  // (CLOSED: the companion answered with an error while restarting). Then the page retries here. Output pages keep
  // showing their last screen meanwhile.
  if(isLocal&&events?.readyState!==EventSource.CLOSED)return;connectTry++;setTimeout(connectLocal,Math.min(30000,1000*2**Math.min(5,connectTry-1)));
 }
}
connectLocal();

// Deck selection, bulk bar, double-click send and scenes.
function toggleDeckSelection(slideId){
 if(!deckFor(draft).some(s=>s.id===slideId))return;
 deckSelecting=true;lastCardClick=null;
 if(deckSelection.has(slideId))deckSelection.delete(slideId);else deckSelection.add(slideId);
 renderDeck();
}
// Removes page-level deletions and positions for pages whose text was just edited, since the pages change.
function forgetPages(prefix){
 const stale=id=>id.startsWith(prefix)&&/\d$/.test(id);
 draft.excludedSlides=(draft.excludedSlides||[]).filter(id=>!stale(id));draft.slideOrder=(draft.slideOrder||[]).filter(id=>!stale(id));
}
function sendSlideToScreen(id){
 const slide=deckFor(draft).find(s=>s.id===id);if(!slide)return;
 draft.previewId=id;remember();renderPreview();renderDeck();
 publish(currentSnapshot(id)).then(sent=>{if(sent)toast(sentMessage(slide.title||'Slide',sent));});
}
function destinationOptions(){
 const show=activeShow(library);
 return '<option value="">Choose an item or show…</option>'+
  show.scenes.filter(s=>s.id!==show.activeSceneId).map(s=>'<option value="scene:'+e(s.id)+'">Item: '+e(s.name)+'</option>').join('')+
  library.shows.filter(s=>s.id!==show.id).map(s=>'<option value="show:'+e(s.id)+'">Show: '+e(s.draft.title)+' ('+e(activeScene(s).name)+')</option>').join('');
}
function bulkDestination(value){
 const [kind,id]=String(value||'').split(/:(.*)/),show=activeShow(library);
 if(kind==='scene'&&id!==show.activeSceneId){const scene=show.scenes.find(s=>s.id===id),target=scene&&sceneDraft(show,id);return target?{draft:target,show,label:'item '+scene.name}:null;}
 if(kind==='show'&&id!==show.id){const other=library.shows.find(s=>s.id===id);return other?{draft:other.draft,show:other,label:other.draft.title+' ('+activeScene(other).name+')'}:null;}
 return null;
}
function renderBulkBar(){
 const el=$('#bulkBar');if(!el)return;
 const toggle=$('#deckSelectToggle');if(toggle){toggle.textContent=deckSelecting?'Done selecting':'Select slides';toggle.setAttribute('aria-pressed',String(deckSelecting));}
 if(!deckSelecting){el.innerHTML='';return;}
 const deck=deckFor(draft),ids=new Set(deck.map(s=>s.id));for(const id of [...deckSelection])if(!ids.has(id))deckSelection.delete(id);
 const none=deckSelection.size?'':' disabled',value=el.querySelector('select')?.value||'';
 el.innerHTML='<div class="bulk-bar" role="toolbar" aria-label="Selected slides"><strong>'+deckSelection.size+' of '+deck.length+' slide'+(deck.length===1?'':'s')+' selected</strong>'+
  '<button class="button" data-action="deck-all">Select all</button><button class="button" data-action="deck-clear"'+(deckSelection.size?'':' disabled')+'>Clear</button>'+
  '<button class="button" data-action="page-earlier"'+none+'>Earlier</button><button class="button" data-action="page-later"'+none+'>Later</button><button class="button" data-action="page-duplicate"'+none+'>Duplicate</button><button class="button danger" data-action="page-remove"'+none+'>Delete</button>'+
  (organizerUndo?'<button class="button" data-action="bulk-undo">Undo deletion</button>':'')+
  '<label class="bulk-destination"><span>To</span><select aria-label="Copy or move selected slides to">'+destinationOptions()+'</select></label><button class="button" data-action="page-copy"'+none+'>Copy</button><button class="button" data-action="page-move"'+none+'>Move</button>'+
  '<button class="button primary" data-action="deck-select">Done</button></div><p class="small-note bulk-note">Click slides to select them. Each slide is selected on its own, including each verse, each blank-line section and each continuation page. Copies become editable text slides. Organize slides works with whole items instead.</p>';
 const select=el.querySelector('select');if(select&&[...select.options].some(o=>o.value===value))select.value=value;
}
// Rundown: the show's items (stored as scenes) in order, in the left column. Choosing one changes the preview only;
// LIVE marks the item whose slide is on screen. Item actions are folded away under the list.
function liveItemId(show){return live.showId===show.id&&!live.blank?(live.sceneId||MAIN_SCENE):'';}
// The live slide's id only when the live screen came from this item; ids such as passage-0 repeat between items.
function liveSlideIdFor(){return liveInCurrentScene()?live.slides[live.index]?.id||'':'';}
// The current item uses the studio's cached deck; other items keep their summary until an action changes them.
function summaryOf(show,scene){
 if(scene.id===show.activeSceneId)return itemSummary(draft,deckFor(draft));
 let s=summaryCache.get(scene.draft);if(!s){s=itemSummary(scene.draft);summaryCache.set(scene.draft,s);}return s;
}
function renderSceneBar(){
 const el=$('#rundown');if(!el)return;
 // A live change can redraw the list while a row has focus; focus returns to the same row.
 const had=document.activeElement?.closest?.('#rundown [data-action]'),focusKey=had?had.dataset.action+'|'+(had.dataset.item||''):'';
 const show=activeShow(library),liveId=liveItemId(show),scene=activeScene(show),current=summaryOf(show,scene);
 const rows=show.scenes.map(s=>{const {kind,count}=summaryOf(show,s),selected=s.id===show.activeSceneId;
  return '<li><button class="item-row'+(selected?' selected':'')+'" data-action="item-open" data-item="'+e(s.id)+'"'+(selected?' aria-current="true"':'')+'><span class="item-kind">'+kind+'</span><span class="item-name">'+e(s.name)+'</span><span class="item-count">'+count+'</span>'+(s.id===liveId?'<span class="item-live">LIVE</span>':'')+'</button></li>';}).join('');
 const plan=current.kind==='Mixed'?planSplit(draft,liveSlideIdFor(show)):null;
 const split=!plan?'':plan.error?'<p class="small-note">'+e(plan.error)+'</p>':'<p class="small-note">Split into '+plan.pieces.length+' items: '+e(plan.pieces.map(p=>(p.kind==='Song'?p.name:p.kind)+' ('+p.count+')').join(', '))+'.</p>'+button('Split into items','item-split');
 const listTop=el.querySelector('.item-list')?.scrollTop||0;
 el.innerHTML='<div class="rundown-head"><h3 class="section-title">Items</h3><div class="rundown-head-actions">'+(liveId&&liveId!==show.activeSceneId&&show.scenes.some(s=>s.id===liveId)?button('Go to live item','item-live'):'')+button('New item','item-new','plus')+'</div></div>'+
  '<ol class="item-list">'+rows+'</ol>'+(itemUndo?.showId===show.id?button(itemUndo.label,'item-undo'):'')+
  '<details class="item-actions"'+(itemMenuOpen?' open':'')+'><summary>Item actions</summary>'+label('Item name','itemName')+input('itemName',scene.name,'maxlength="80"')+
  '<div class="item-buttons">'+button('Earlier','item-earlier')+button('Later','item-later')+button('Duplicate','item-duplicate')+'<button class="button danger" data-action="item-remove"'+(show.scenes.length<2?' disabled':'')+'>Remove</button></div>'+split+
  '<div class="item-buttons">'+button('Use this design in all items','item-design-all')+button('Use these word styles in all items','item-words-all')+'</div><p class="small-note">Items change the preview only. The screen keeps what you last sent.</p></details>';
 // The list keeps its scroll when redrawn and moves only enough to show the current item.
 el.querySelector('.item-list').scrollTop=listTop;revealCurrentItem();
 el.querySelector('.item-actions').addEventListener('toggle',ev=>{itemMenuOpen=ev.target.open;});
 $('#itemName').addEventListener('change',ev=>{renameScene(show,show.activeSceneId,ev.target.value);remember();renderSceneBar();});
 if(focusKey){const [action,item]=focusKey.split('|');[...el.querySelectorAll('[data-action]')].find(b=>b.dataset.action===action&&(b.dataset.item||'')===item)?.focus({preventScroll:true});}
}
// After an action that changes items: the current draft may be another one, and other items' summaries may change.
// Scrolls only the Items list, and only as far as needed to show the current item (also after the window is resized).
function revealCurrentItem(){
 const list=$('#rundown .item-list'),row=list?.querySelector('.item-row.selected')?.parentElement;if(!row)return;
 if(row.offsetTop<list.scrollTop)list.scrollTop=row.offsetTop;else if(row.offsetTop+row.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=row.offsetTop+row.offsetHeight-list.clientHeight;
}
window.addEventListener('resize',revealCurrentItem);
function afterItemChange(message){
 const show=activeShow(library);draft=show.draft;summaryCache=new WeakMap();
 ++lookupId;++wordLookupId;lookupBusy=false;organizerSelection.clear();deckSelection.clear();organizerUndo=null;deckSelecting=false;lastCardClick=null;
 remember();render();if(message)toast(message);
}
function handleItemAction(action,t){
 const show=activeShow(library),keep=(label,undo)=>{itemUndo={showId:show.id,label,undo};};
 try{
  if(action==='item-open'){changeScene(t.dataset.item);return;}
  if(action==='item-live'){const id=liveItemId(show);if(show.scenes.some(s=>s.id===id))changeScene(id);return;}
  if(action==='item-new'){addItem(show,'');afterItemChange('New empty item. The screen is unchanged.');return;}
  if(action==='item-duplicate'){const scene=addScene(show,activeScene(show).name+' copy',draft);switchScene(show,scene.id);afterItemChange('Item duplicated. The screen is unchanged.');return;}
  if(action==='item-earlier'||action==='item-later'){moveScene(show,show.activeSceneId,action==='item-earlier'?-1:1);remember();renderSceneBar();return;}
  if(action==='item-remove'){const name=activeScene(show).name,removed=removeScene(show,show.activeSceneId);keep('Undo remove',()=>restoreScene(show,removed));afterItemChange(name+' removed. Undo is under Items.');return;}
  if(action==='item-split'){const undo=splitItem(show,liveSlideIdFor(show));keep('Undo split',()=>undoSplit(show,undo));afterItemChange('Split into '+undo.pieceIds.length+' items. The screen is unchanged.');return;}
  if(action==='item-design-all'){const before=applyDesignToAll(show);keep('Undo design for all items',()=>undoDesignToAll(show,before));afterItemChange('This design is now used in every item.');return;}
  if(action==='item-words-all'){const before=wordsToAll(show);keep('Undo word styles for all items',()=>undoWordsToAll(show,before));afterItemChange('These word styles are now in every item.');return;}
  if(action==='item-undo'&&itemUndo?.showId===show.id){const undo=itemUndo.undo;itemUndo=null;undo();afterItemChange('Undone.');}
 }catch(err){toast(err.message);}
}
function changeScene(id){
 const show=activeShow(library);if(id===show.activeSceneId)return;
 ++lookupId;++wordLookupId;lookupBusy=false;switchScene(show,id);draft=show.draft;
 lastRemovedSlide=null;lastRemovedBible=null;selectedTextPhrase='';dictionary=[];organizerSelection.clear();deckSelection.clear();organizerUndo=null;deckSelecting=false;lastCardClick=null;
 remember();render();toast(activeScene(show).name+' is in the preview. The screen is unchanged.');
}
function handleDeckAction(action,t){
 if(!['deck-select','deck-all','deck-clear','page-earlier','page-later','page-duplicate','page-remove','page-copy','page-move','scene-new','scene-duplicate','scene-remove','scene-undo'].includes(action))return false;
 lastCardClick=null;
 try{
  const show=activeShow(library),selected=[...deckSelection];
  if(action==='deck-select'){deckSelecting=!deckSelecting;if(!deckSelecting)deckSelection.clear();renderDeck();}
  else if(action==='deck-all'){deckSelection=new Set(deckFor(draft).map(s=>s.id));renderDeck();}
  else if(action==='deck-clear'){deckSelection.clear();renderDeck();}
  else if(action.startsWith('page-')){
   if(!selected.length)throw new Error('Select one or more slides first.');
   let notice='';const many=n=>n+' slide'+(n===1?'':'s');
   if(action==='page-earlier'||action==='page-later'){organizerUndo=null;moveSlides(draft,selected,action==='page-earlier'?-1:1);}
   if(action==='page-duplicate'){organizerUndo=null;deckSelection=new Set(copySlides(draft,draft,selected));notice=many(selected.length)+' duplicated as editable text slides.';}
   if(action==='page-remove'){organizerUndo={source:clone(draft)};removeSlides(draft,selected);deckSelection.clear();notice=many(selected.length)+' deleted. Undo deletion is available.';}
   if(action==='page-copy'||action==='page-move'){
    const target=bulkDestination(t?.closest('.bulk-bar')?.querySelector('select')?.value);if(!target)throw new Error('Choose a destination item or show first.');
    const before=action==='page-move'?{source:clone(draft),target:target.draft,targetBefore:clone(target.draft),targetShow:target.show}:null;
    copySlides(draft,target.draft,selected);target.show.updated=Date.now();summaryCache=new WeakMap();
    if(before){removeSlides(draft,selected);deckSelection.clear();organizerUndo=before;notice=many(selected.length)+' moved to '+target.label+'. Undo deletion puts them back.';}
    else{organizerUndo=null;notice=many(selected.length)+' copied to '+target.label+'.';}
   }
   remember();render();if(notice)toast(notice);
  }
  else if(action==='scene-new'||action==='scene-duplicate'){
   const scene=addScene(show,action==='scene-duplicate'?activeScene(show).name+' copy':'',action==='scene-duplicate'?draft:null);
   changeScene(scene.id);toast(action==='scene-duplicate'?'Saved as a new scene. The previous scene is kept as it was.':'New scene created. The screen is unchanged.');
  }else if(action==='scene-remove'){
   const name=activeScene(show).name;removedScene={showId:show.id,removed:removeScene(show,show.activeSceneId)};
   draft=show.draft;organizerSelection.clear();deckSelection.clear();organizerUndo=null;deckSelecting=false;remember();render();toast(name+' removed. Undo is available beside the scene list.');
  }else if(action==='scene-undo'){
   if(removedScene?.showId===show.id){restoreScene(show,removedScene.removed);removedScene=null;remember();renderSceneBar();toast('Scene restored.');}
  }
 }catch(err){toast(err.message);}
 return true;
}
// Book suggestions for the reference field. Local only; the chapter and verse typed so far are kept.
function setupBookAutocomplete(field){
 if(!field)return;
 field.insertAdjacentHTML('afterend','<ul id="bookSuggestions" class="book-suggestions" role="listbox" aria-label="Book suggestions" hidden></ul>');
 const list=$('#bookSuggestions');let books=[],active=-1;
 const close=()=>{list.hidden=true;books=[];active=-1;field.setAttribute('aria-expanded','false');field.removeAttribute('aria-activedescendant');};
 const paint=()=>{
  list.innerHTML=books.map((b,i)=>'<li role="option" id="bookOption'+i+'" data-book-index="'+i+'" aria-selected="'+(i===active)+'"'+(i===active?' class="active"':'')+'>'+e(b.english)+(b.name!==b.english?' <span>'+e(b.name)+'</span>':'')+'</li>').join('');
  list.hidden=!books.length;field.setAttribute('aria-expanded',String(!!books.length));
  if(active>=0)field.setAttribute('aria-activedescendant','bookOption'+active);else field.removeAttribute('aria-activedescendant');
 };
 const update=()=>{books=suggestBooks(field.value).books;active=-1;paint();};
 const choose=i=>{const book=books[i];if(!book)return;field.value=withBook(field.value,book);close();field.focus();field.setSelectionRange(field.value.length,field.value.length);};
 field.addEventListener('input',update);
 field.addEventListener('blur',()=>setTimeout(close,120));
 field.addEventListener('keydown',ev=>{
  // Keys typed while an input method is composing belong to the IME.
  if(ev.isComposing||ev.keyCode===229)return;
  const open=!list.hidden&&books.length>0;
  // Tab completes the highlighted book (or the first one) and keeps the chapter and verse; Shift+Tab moves focus as usual.
  if(ev.key==='Tab'&&!ev.shiftKey&&!ev.altKey&&!ev.ctrlKey&&!ev.metaKey){
   if(open){ev.preventDefault();choose(active>=0?active:0);return;}
   const full=completeBook(field.value);if(full){ev.preventDefault();field.value=full;close();field.setSelectionRange(full.length,full.length);return;}
  }
  if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){if(!open){update();if(!books.length)return;}ev.preventDefault();active=(active+(ev.key==='ArrowDown'?1:-1)+books.length)%books.length;paint();}
  else if(ev.key==='Enter'){if(open&&active>=0){ev.preventDefault();choose(active);}else{close();lookupPassage();}}
  else if(ev.key==='Escape'&&open){ev.preventDefault();close();}
 });
 // mousedown keeps focus in the field, so the blur handler does not close the list first.
 list.addEventListener('mousedown',ev=>{const item=ev.target.closest('[data-book-index]');if(item){ev.preventDefault();choose(Number(item.dataset.bookIndex));}});
}

// Lower third: settings dialog, windows and the studio's live view choice.
const lowerFields=[['height','Band height (px)','number',120,700],['width','Band width (%)','number',30,100],['bottom','Distance from bottom (px)','number',0,400],['side','Side margin (px)','number',0,400],['background','Background color','color'],['opacity','Background opacity (%)','number',0,100],['textColor','Text color','color'],['fontSize','Text size (px)','number',20,110]];
function lowerThirdURL(){return (isLocal?location.origin:'http://127.0.0.1:18765')+'/?view=lower&obs=1';}
function showLowerThirdDialog(){
 const lt=cleanLowerThird(live.lowerThird),field=([key,name,type,min,max])=>'<div>'+label(name,'lower-'+key)+input('lower-'+key,lt[key],'type="'+type+'"'+(type==='number'?' min="'+min+'" max="'+max+'" step="1"':''))+'</div>';
 const rows=[];for(let i=0;i<lowerFields.length;i+=2)rows.push('<div class="field-row">'+field(lowerFields[i])+field(lowerFields[i+1])+'</div>');
 $('#lowerDialog').innerHTML='<div class="dialog-top"><span class="eyebrow">LOWER THIRD</span><button class="icon-button" data-action="lower-close" aria-label="Close lower third settings">×</button></div><h2 id="lowerTitle">Lower third</h2>'+
  '<p class="hint">The lower third shows the live slide in a band on a transparent background. One Send updates the full-screen output and the lower third together. Hide screen leaves the lower third fully transparent.</p>'+
  rows.join('')+label('Alignment','lower-align')+'<select id="lower-align">'+[['center','Centered'],['left','Left'],['right','Right']].map(([v,n])=>'<option value="'+v+'" '+(lt.align===v?'selected':'')+'>'+n+'</option>').join('')+'</select>'+
  '<div class="body-tools"><label><input id="lower-fit" type="checkbox" '+(lt.fit?'checked':'')+'> Fit text to the band</label><label><input id="lower-showReference" type="checkbox" '+(lt.showReference?'checked':'')+'> Show reference and version</label></div>'+
  '<p class="small-note">With Fit on, Text size is the largest size used and long text gets smaller; if it still does not fit, the band grows upward instead of cutting text off.</p>'+
  '<div class="timer-actions"><button class="button primary" data-action="lower-apply">Apply lower third settings</button><button class="button" data-action="lower-window">Open lower third window</button><button class="button" data-action="lower-copy">Copy OBS lower third URL</button></div>'+
  '<div class="setup-panel"><h3>OBS setup</h3><p>Run the local companion, then add a Browser source: <code>'+e(lowerThirdURL())+'</code>, 1920 × 1080, placed above your video. Leave Local file off. Window Capture does not keep transparency, and OBS cannot sign in to the private web version.</p></div>';
 if(!$('#lowerDialog').open)$('#lowerDialog').showModal();
}
function lowerThirdFromForm(){
 const raw={...cleanLowerThird(live.lowerThird)};
 for(const [key] of lowerFields){const el=$('#lower-'+key);if(el)raw[key]=el.value;}
 raw.align=$('#lower-align')?.value;raw.fit=!!$('#lower-fit')?.checked;raw.showReference=!!$('#lower-showReference')?.checked;
 return cleanLowerThird(raw);
}
async function handleLowerAction(action){
 if(action==='live-view-full'||action==='live-view-lower'||action==='live-view-graphics'){liveView=action.slice(10);try{localStorage.setItem('wordlight-live-view',liveView);}catch{}renderLive();return;}
 if(action==='lower-open-settings'){showLowerThirdDialog();return;}
 if(action==='lower-close'){$('#lowerDialog').close();return;}
 if(action==='lower-window'){const w=window.open('./?view=lower','wordlight-lower-third','popup,width=1280,height=720');if(!w)toast('Allow pop-ups for this site to open the lower third window.');return;}
 if(action==='lower-copy'){try{await navigator.clipboard.writeText(lowerThirdURL());toast('Lower third URL copied. Use it in an OBS Browser source.');}catch{toast('Copy the lower third URL shown in the dialog.');}return;}
 if(action==='lower-apply'){if(await publish({...clone(live),lowerThird:lowerThirdFromForm()})){liveView='lower';try{localStorage.setItem('wordlight-live-view',liveView);}catch{}renderLive();toast('Lower third settings applied. The full-screen output is unchanged.');}}
}

// Companion connection: the web studio sends live screens to the paired local companion; the local studio
// shows the pairing code. Status describes what the companion reports, not what OBS displays.
function companionText(){
 if(isLocal)return companion.state==='connected'?'Companion · '+describeViewers(companion.viewers):'';
 if(!pairing)return 'OBS not connected';
 return {connected:'Companion connected · '+describeViewers(companion.viewers),checking:'Checking companion…',offline:'Companion not reachable · outputs keep their last screen',unpaired:'Pairing code not accepted · enter the current code',stale:'Companion has a newer screen from another studio',error:companion.message||'Companion error'}[companion.state]||'';
}
function showCompanion(result){
 if(result)companion=result;
 const el=$('#companionStatus');if(el){el.textContent=companionText();el.dataset.state=companion.state;}
 const connect=$('#connectObs');if(connect)connect.hidden=isLocal||isOutput||companion.state==='connected'||companion.state==='checking';
 // The live bar says whether OBS is in the loop; redraw it when that changes.
 if(!isLocal&&!isOutput&&companion.state!==shownCompanionState){
  shownCompanionState=companion.state;renderLive();
  // Back online: reload what failed while the companion was away; the Bible panel says where lookups go.
  if(companion.state==='connected'){if(songState.error){forgetCompanionSongs();if(tab==='songs')renderSongs();}if(!installedBibles)refreshInstalledBibles();if(!nkjvState)refreshNKJV();}
  $('#lookupTranslation')?.dispatchEvent(new Event('nkjv-state'));
 }
 const state=$('#pairingState');if(state)state.textContent=companionText()||'Not connected.';
 const viewers=$('#pairingViewers');if(viewers&&isLocal)viewers.textContent=companion.state==='connected'?describeViewers(companion.viewers):'';
}
function forgetCompanionSongs(){Object.assign(songState,{categories:null,items:[],total:0,error:'',selected:null,freeshow:undefined});}
function forgetCompanionData(){installedBibles=null;nkjvState=null;designAssets=false;graphicsAssets=[];forgetCompanionSongs();if(tab==='songs')renderSongs();}
async function mirrorCompanionLive(){
 const before=live,remote=await companionLive(pairing);
 // A Send made meanwhile wins over the copy.
 if(live!==before||pendingLive||!validLive(remote))return;
 live=remote;cacheLive();channel?.postMessage({type:'live',live});renderLive();paintTimers();
}
async function refreshCompanion(){
 if(isOutput)return;
 if(isLocal){
  try{const r=await fetch('/api/bridge/code',{cache:'no-store',signal:AbortSignal.timeout(3000)});const data=await r.json();companion={state:'connected',viewers:data.viewers};const bridgePanel=$('#bridgePanel');if(bridgePanel)bridgePanel.hidden=!(data.origins||[]).length;const code=$('#pairingCode');if(code)code.textContent=data.code;}catch{companion={state:'offline'};}
  showCompanion();return;
 }
 if(!pairing){showCompanion({state:'unpaired'});return;}
 const was=companion.state,result=await companionStatus(pairing);
 if(result.state!=='connected'){showCompanion(result);return;}
 // Back online: resend only a Send the user made while the companion was away, and only if it is still newer.
 if(was!=='connected'&&pendingLive&&needsResend(pendingLive,result.liveUpdated)){const sent=pendingLive,answer=await sendToCompanion(pairing,sent);if(isOlderSend(sent,latestSend))return;pendingLive=nextPending(pendingLive,sent,answer.state,latestSend);showCompanion(answer);return;}
 // A pending Send the companion has caught up with, or passed, is settled.
 if(pendingLive&&!needsResend(pendingLive,result.liveUpdated))pendingLive=null;
 showCompanion(result);
 // With nothing pending, the companion's screen is the real one. When its revision differs from the one shown here
 // (pairing, a reload, or a Send from the local studio, the phone or another web studio), fetch it once. This rides
 // on the regular status check, so the copy here can lag the screen by up to one check.
 if(!pendingLive&&Number(result.liveUpdated)!==Number(live.updated))await mirrorCompanionLive();
}
async function handleCompanionAction(action){
 try{
  if(action==='companion-pair'){pairing=savePairing(localStorage,$('#pairingInput')?.value);pendingLive=null;forgetCompanionData();companion={state:'checking'};showCompanion();await refreshCompanion();if(companion.state==='connected')toast('Connected to the companion.');}
  else if(action==='companion-forget'){forgetPairing(localStorage);pairing=null;pendingLive=null;forgetCompanionData();showCompanion({state:'unpaired'});showHelp();}
  else if(action==='companion-rotate'){const r=await fetch('/api/bridge/code',{method:'POST'});if(!r.ok)throw new Error((await r.json()).error);await refreshCompanion();toast('New code made. The web studio needs the new code.');}
 }catch(err){toast(err.message);}
}
if(!isOutput){setInterval(refreshCompanion,5000);setTimeout(refreshCompanion,800);}

// Passage picker: book grid by section, then chapter and verse grids side by side. Uses the local verse table only.
const picker={book:'',chapter:0,selection:null,filter:''};
function pickerTranslation(){return $('#lookupTranslation')?.value||currentKey()||'kjv';}
function openPicker(){
 if(!picker.book){const current=draft.bibleVerses?.[0];if(current){picker.book=current.bookId;picker.chapter=current.chapter;}}
 renderPicker();if(!$('#pickerDialog').open)$('#pickerDialog').showModal();$('#pickerFilter')?.focus();
}
function renderPicker(){
 const dialog=$('#pickerDialog');if(!dialog)return;
 const focusKey=document.activeElement?.closest?.('#pickerDialog')?(['pickerBook','pickerChapter','pickerVerse'].map(k=>document.activeElement.dataset?.[k]&&k+':'+document.activeElement.dataset[k]).find(Boolean)||(document.activeElement.id==='pickerFilter'?'filter':'')):'';
 const books=pickerBooks(),matches=new Set(picker.filter?matchingBooks(picker.filter,66).map(b=>b.id):books.map(b=>b.id)),tr=pickerTranslation();
 const book=books.find(b=>b.id===picker.book),sel=picker.selection,inRange=(c,v)=>{if(!sel?.start)return false;const s=sel.start,e=sel.end||sel.start,n=c*1000+v;return n>=s.chapter*1000+s.verse&&n<=e.chapter*1000+e.verse;};
 const reference=book?(sel?selectionReference(book.id,sel):picker.chapter?chapterReference(book.id,picker.chapter):''):'';
 const recent=readRecent(localStorage);
 dialog.innerHTML='<div class="dialog-top"><input id="pickerFilter" class="input picker-filter" value="'+e(picker.filter)+'" placeholder="Type a book: jn, 1 cor, luku…" aria-label="Filter books" autocomplete="off"><span class="small-note">'+e(tr.toUpperCase())+'</span><button class="icon-button" data-action="picker-close" aria-label="Close passage picker">×</button></div>'+
  '<div class="picker-books" role="group" aria-label="Books">'+SECTIONS.map(([id,name])=>'<div class="picker-section sec-'+id+'" title="'+e(name)+'">'+books.filter(b=>b.section===id).map(b=>'<button type="button" class="book-chip'+(b.id===picker.book?' active':'')+(matches.has(b.id)?'':' dim')+'" data-action="picker-book" data-picker-book="'+b.id+'" title="'+e(b.english+(b.name!==b.english?' · '+b.name:''))+'" aria-pressed="'+(b.id===picker.book)+'">'+e(b.short)+'</button>').join('')+'</div>').join('')+'</div>'+
  '<div class="picker-body"><div><h3>'+(book?e(book.english)+' · chapter':'Chapter')+'</h3><div class="picker-grid" role="group" aria-label="Chapters">'+(book?Array.from({length:book.chapters},(_,i)=>'<button type="button" class="'+(picker.chapter===i+1?'active':'')+'" data-action="picker-chapter" data-picker-chapter="'+(i+1)+'" aria-pressed="'+(picker.chapter===i+1)+'">'+(i+1)+'</button>').join(''):'<p class="small-note">Choose a book.</p>')+'</div></div>'+
  '<div><h3>Verse</h3><div class="picker-grid" role="group" aria-label="Verses">'+(book&&picker.chapter?Array.from({length:versesIn(book.id,picker.chapter,tr)},(_,i)=>{const v=i+1,edge=sel?.start&&((sel.start.chapter===picker.chapter&&sel.start.verse===v)||(sel.end&&sel.end.chapter===picker.chapter&&sel.end.verse===v));return '<button type="button" class="'+(edge?'edge':inRange(picker.chapter,v)?'range':'')+'" data-action="picker-verse" data-picker-verse="'+v+'" aria-pressed="'+inRange(picker.chapter,v)+'">'+v+'</button>';}).join(''):'<p class="small-note">Choose a chapter.</p>')+'</div></div></div>'+
  '<div class="picker-footer"><strong id="pickerReference">'+e(reference||'No passage chosen')+'</strong><span class="small-note">Click the first and last verse (Shift extends). Select only a chapter to load it all.</span>'+button('Clear','picker-clear')+'<button class="button primary" data-action="picker-load"'+(reference?'':' disabled')+'>Load preview</button></div>'+
  (recent.length?'<div class="picker-recent"><span class="small-note">Recent</span>'+recent.map((r,i)=>'<button type="button" class="note-chip" data-action="picker-recent" data-picker-recent="'+i+'">'+e(r.reference)+' <small>'+e(r.translation.toUpperCase())+'</small></button>').join('')+'</div>':'');
 const filter=$('#pickerFilter');
 filter.addEventListener('input',()=>{picker.filter=filter.value;renderPicker();});
 filter.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();const first=matchingBooks(filter.value,1)[0];if(first){picker.book=first.id;picker.chapter=0;picker.selection=null;picker.filter='';renderPicker();dialog.querySelector('[data-picker-chapter]')?.focus();}}});
 if(focusKey==='filter'){filter.focus();filter.setSelectionRange(filter.value.length,filter.value.length);}
 else if(focusKey){const [k,v]=focusKey.split(':');dialog.querySelector('[data-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+'="'+v+'"]')?.focus();}
}
// Arrow keys move between buttons of the same grid, row by row.
document.addEventListener('keydown',ev=>{
 const button=ev.target.closest?.('#pickerDialog .picker-grid button,#pickerDialog .picker-books button');if(!button||!ev.key.startsWith('Arrow'))return;
 const grid=button.closest('.picker-grid,.picker-books'),items=[...grid.querySelectorAll('button')],i=items.indexOf(button);
 const columns=Math.max(1,items.filter(b=>b.offsetTop===items[0].offsetTop).length);
 const next=items[{ArrowRight:i+1,ArrowLeft:i-1,ArrowDown:i+columns,ArrowUp:i-columns}[ev.key]];
 if(next){ev.preventDefault();next.focus();}
});
async function loadPickedReference(reference,translation){
 $('#pickerDialog').close();
 if(tab!=='passage'){tab='passage';render();}
 const select=$('#lookupTranslation');if(select&&translation&&[...select.options].some(o=>o.value===translation)&&select.value!==translation){select.value=translation;select.dispatchEvent(new Event('change'));}
 const field=$('#referenceLookup');if(field)field.value=reference;
 await lookupPassage();
}
function handlePickerAction(action,t,ev){
 if(action==='picker-open'){openPicker();return;}
 if(action==='picker-close'){$('#pickerDialog').close();return;}
 if(action==='picker-book'){if(picker.book!==t.dataset.pickerBook){picker.book=t.dataset.pickerBook;picker.chapter=0;picker.selection=null;}renderPicker();return;}
 if(action==='picker-chapter'){picker.chapter=Number(t.dataset.pickerChapter);renderPicker();return;}
 if(action==='picker-verse'){picker.selection=pickVerse(picker.selection,{chapter:picker.chapter,verse:Number(t.dataset.pickerVerse)},ev.shiftKey);renderPicker();return;}
 if(action==='picker-clear'){picker.selection=null;renderPicker();return;}
 if(action==='picker-load'){const ref=picker.selection?selectionReference(picker.book,picker.selection):chapterReference(picker.book,picker.chapter);if(ref)loadPickedReference(ref);return;}
 if(action==='picker-recent'){const r=readRecent(localStorage)[Number(t.dataset.pickerRecent)];if(r)loadPickedReference(r.reference,r.translation);}
}

// Songs: search the FreeShow library through the local companion (read-only), copy a song into the show.
let removedSong=null,replacedSong=null;
async function songApi(path){const r=await localFetch(path,{cache:'no-store',signal:AbortSignal.timeout(8000)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'The song library could not be read.');return data;}
function songCreditLine(song){return [song.meta.author||song.meta.artist,song.meta.copyright,song.meta.ccli?'CCLI '+song.meta.ccli:''].filter(Boolean).join(' · ');}
function songsInShow(){
 const entries=draft.songs||[];
 return '<h3 class="section-title song-subtitle">In this item</h3>'+(entries.length?entries.map(({entryId,song})=>'<div class="song-entry"><strong>'+e(song.title)+'</strong>'+(song.arrangements.length>1?'<select data-song-arrangement="'+e(entryId)+'" aria-label="Arrangement for '+e(song.title)+'">'+song.arrangements.map(a=>'<option value="'+e(a.id)+'" '+(a.id===song.arrangementId?'selected':'')+'>'+e(a.name)+' ('+a.order.length+')</option>').join('')+'</select>':'')+'<button class="button" data-action="song-preview" data-song-entry="'+e(entryId)+'">Preview</button><button class="button" data-action="song-edit" data-song-entry="'+e(entryId)+'">Edit</button><button class="button" data-action="song-export" data-song-entry="'+e(entryId)+'">Export</button><button class="button danger" data-action="song-remove" data-song-entry="'+e(entryId)+'">Remove</button></div>').join(''):'<p class="small-note">No songs yet.</p>')+((removedSong?button('Undo removed song','song-undo'):'')+(replacedSong&&replacedSong.sceneId===activeShow(library).activeSceneId?button('Undo replace song','song-replace-undo'):''))+'<div class="song-tools">'+button('New song','song-new','plus')+button('Import song file','song-import','upload')+(isLocal?button('Export library','song-library-export','download')+button('Import library','song-library-import','upload'):'')+'</div>';
}
function renderSongs(){
 const panel=$('#panel');
 if(!companionReady()){panel.innerHTML='<h3 class="section-title">Songs</h3><p class="hint">Connect OBS to search the song library on this computer. Songs already in this item still play here.</p>'+button('Connect OBS','help','screen')+songsInShow();bindSongEntries();return;}
 panel.innerHTML='<h3 class="section-title">Songs</h3><div class="lookup-row">'+input('songQuery',songState.query,'placeholder="Search songs" maxlength="100" autocomplete="off" aria-label="Search songs"')+'</div>'+
  '<select id="songSource" aria-label="Song source">'+[['all','All songs'],['wordlight','My library'],['freeshow','FreeShow']].map(([v,n])=>'<option value="'+v+'" '+(songState.source===v?'selected':'')+'>'+n+'</option>').join('')+'</select><select id="songCategory" aria-label="Song category"><option value="">All categories</option>'+(songState.categories||[]).map(c=>'<option value="'+e(c.name)+'" '+(c.name===songState.category?'selected':'')+'>'+e(c.name)+' ('+c.count+')</option>').join('')+'</select>'+
  '<p id="songStatus" class="small-note" aria-live="polite"></p><div id="songResults" class="song-results"></div><div id="songDetail"></div>'+songsInShow();
 $('#songQuery').addEventListener('input',ev=>{songState.query=ev.target.value;clearTimeout(songState.timer);songState.timer=setTimeout(()=>searchSongLibrary(false),200);});
 $('#songCategory').addEventListener('change',ev=>{songState.category=ev.target.value;searchSongLibrary(false);});
 $('#songSource').addEventListener('change',ev=>{songState.source=ev.target.value;songState.category='';searchSongLibrary(false);});
 bindSongEntries();paintSongResults();paintSongDetail();
 if(!songState.categories)songApi('/api/songs/categories').then(d=>{songState.categories=d.categories;songState.library=d.library;if(tab==='songs')renderSongs();}).catch(err=>{songState.error=err.message;paintSongResults();});
 if(!songState.items.length&&!songState.error)searchSongLibrary(false);
}
function bindSongEntries(){
 document.querySelectorAll('[data-song-arrangement]').forEach(el=>el.addEventListener('change',()=>{const entry=(draft.songs||[]).find(s=>s.entryId===el.dataset.songArrangement);if(!entry)return;entry.song.arrangementId=el.value;draft.previewId=deckFor(draft).find(x=>x.song?.entryId===entry.entryId)?.id||draft.previewId;remember();renderPreview();renderDeck();}));
}
async function searchSongLibrary(append){
 const request=++songState.request,offset=append?songState.items.length:0;
 try{
  const d=await songApi('/api/songs?q='+encodeURIComponent(songState.query)+'&source='+songState.source+'&category='+encodeURIComponent(songState.category)+'&offset='+offset+'&limit=50');songState.native=d.native;if('freeshow' in d){songState.freeshow=d.freeshow;songState.freeshowError=d.freeshowError;}
  if(request!==songState.request)return;
  songState.items=append?[...songState.items,...d.items]:d.items;songState.total=d.total;songState.library=d.library;songState.error='';
 }catch(err){if(request===songState.request){songState.error=err.message;songState.items=[];}}
 paintSongResults();
}
function paintSongResults(){
 const list=$('#songResults'),status=$('#songStatus');if(!list)return;
 if(status)status.textContent=songState.error||(songState.freeshow===undefined?'Loading the song library…':songState.total+' found · '+songState.native+' in your library · '+(songState.freeshow===null?songState.freeshowError||'FreeShow library not found':songState.freeshow+' in FreeShow'));
 if(songState.error){list.innerHTML=button('Retry','song-retry');return;}
 list.innerHTML=songState.items.map(s=>'<button class="song-row'+(songState.selected?.source.id===s.id?' active':'')+'" data-action="song-open" data-song-id="'+e(s.id)+'"><span>'+e(s.name)+'</span><small>'+(s.source==='wordlight'?'<b class="song-badge">Library</b> ':'')+e(s.category)+'</small></button>').join('')+(songState.items.length<songState.total?button('Show more','song-more'):'');
}
function paintSongDetail(){
 const el=$('#songDetail'),song=songState.selected;if(!el)return;
 if(!song){el.innerHTML='';return;}
 const arrangement=song.arrangements.find(a=>a.id===songState.arrangementId)||song.arrangements[0],byId=new Map(song.sections.map(x=>[x.id,x]));
 el.innerHTML='<div class="song-detail"><strong>'+e(song.title)+'</strong><p class="small-note">'+e(songCreditLine(song)||'No author or copyright stored')+'</p>'+
  (song.arrangements.length>1?'<select id="songArrangement" aria-label="Arrangement">'+song.arrangements.map(a=>'<option value="'+e(a.id)+'" '+(a.id===arrangement.id?'selected':'')+'>'+e(a.name)+'</option>').join('')+'</select>':'')+
  '<div class="song-order">'+arrangement.order.map(id=>{const x=byId.get(id);return x?'<span class="note-chip">'+e(x.label)+(x.slides.length>1?' ×'+x.slides.length:'')+'</span>':'';}).join('')+'</div>'+
  button('Add to show','song-add','plus','primary')+(itemSummary(draft,deckFor(draft)).kind==='Song'&&draft.songs.length===1?button('Replace song in this item','song-replace'):'')+(isLocal&&song.source.app==='wordlight'?'<button class="button danger" data-action="song-library-remove" title="Remove from your song library (kept in songs/removed)">Remove from library</button>':'')+(song.skipped.length?tip('Not carried over from FreeShow: '+e(song.skipped.join('; '))+'.'):'')+'</div>';
 $('#songArrangement')?.addEventListener('change',ev=>{songState.arrangementId=ev.target.value;paintSongDetail();});
}
async function handleSongAction(action,t){
 try{
  if(action==='song-live-jump'){const i=Number(t.dataset.liveIndex);if(live.slides[i]?.song)await publish({...clone(live),index:i,blank:false});return;}
  if(action==='song-more'){await searchSongLibrary(true);return;}
  if(action==='song-retry'){forgetCompanionSongs();renderSongs();return;}
  if(action==='song-open'){const d=await songApi('/api/songs/item?id='+encodeURIComponent(t.dataset.songId));songState.selected=d.song;songState.arrangementId=d.song.arrangementId;paintSongResults();paintSongDetail();return;}
  // Replace song: the current Song item gets the chosen song instead; Undo puts the previous one back.
  if(action==='song-replace'){
   const song=songState.selected,show=activeShow(library);if(!song||draft.songs.length!==1)return;
   const previous=draft.songs[0],entry={entryId:crypto.randomUUID(),song:{...clone(song),arrangementId:songState.arrangementId||song.arrangementId}};
   cleanDraft({...draft,songs:[entry]});
   replacedSong={sceneId:show.activeSceneId,previous,entryId:entry.entryId,name:activeScene(show).name};
   draft.songs=[entry];if(activeScene(show).name===previous.song.title)renameScene(show,show.activeSceneId,song.title);
   draft.previewId=deckFor(draft).find(x=>x.song?.entryId===entry.entryId)?.id||draft.previewId;
   remember();render();toast(song.title+' replaced '+previous.song.title+'. Undo is under Songs.');return;
  }
  if(action==='song-replace-undo'){
   const show=activeShow(library);if(replacedSong?.sceneId!==show.activeSceneId||draft.songs[0]?.entryId!==replacedSong.entryId)return toast('The song has changed since, so the replace cannot be undone.');
   draft.songs=[replacedSong.previous];renameScene(show,show.activeSceneId,replacedSong.name);
   draft.previewId=deckFor(draft).find(x=>x.song?.entryId===replacedSong.previous.entryId)?.id||draft.previewId;
   replacedSong=null;remember();render();toast('Previous song restored.');return;
  }
  if(action==='song-add'){
   const song=songState.selected;if(!song)return;
   if((draft.songs||[]).length>=60)throw new Error('A show can hold up to 60 songs.');
   cleanDraft({...draft,songs:[...(draft.songs||[]),{entryId:'check',song}]});
   addSongEntry({...clone(song),arrangementId:songState.arrangementId||song.arrangementId});return;
  }
  const entryId=t?.dataset.songEntry,index=(draft.songs||[]).findIndex(x=>x.entryId===entryId);
  if(action==='song-preview'&&index>=0){draft.previewId=deckFor(draft).find(x=>x.song?.entryId===entryId)?.id||draft.previewId;remember();renderPreview();renderDeck();return;}
  if(action==='song-remove'&&index>=0){removedSong={entry:draft.songs[index],index};draft.songs=draft.songs.filter(x=>x.entryId!==entryId);remember();render();toast('Song removed from this show. Undo is available in Songs.');return;}
  if(action==='song-new'){addSongEntry(newSong('New song'),true);return;}
  if(action==='song-library-export'){downloadJSON(await songApi('/api/songs/library/export'),'Wordlight-song-library');return;}
  if(action==='song-library-import'){chooseFile($('#songLibraryFile'));return;}
  if(action==='song-library-remove'){const id=songState.selected?.source.app==='wordlight'?songState.selected.id:'';if(!id)return;const r=await fetch('/api/songs/library/'+encodeURIComponent(id),{method:'DELETE'});if(!r.ok)throw new Error((await r.json()).error);songState.selected=null;await searchSongLibrary(false);paintSongDetail();toast('Removed from your library. Shows that use it keep their copy.');return;}
  if(action==='song-import'){chooseFile($('#songFile'));return;}
  if(action==='song-edit'&&index>=0){openSongEditor(entryId);return;}
  if(action==='song-export'&&index>=0){const song=draft.songs[index].song;downloadJSON(songFile(song),song.title+'.wordlight-song');return;}
  if(action==='song-undo'&&removedSong){const list=[...(draft.songs||[])];list.splice(Math.min(removedSong.index,list.length),0,removedSong.entry);draft.songs=list;removedSong=null;remember();render();}
 }catch(err){toast(err.message);}
}
// While a song is on screen: number keys jump to that verse, C chorus, P pre-chorus, G bridge, T tag, E ending.
// The next matching section after the current slide is used, so repeated choruses advance in order.
function jumpToSongSection(key){
 const current=live.slides[live.index]?.song;if(!current||live.blank)return false;
 const k=key.toLowerCase(),want=/^[1-9]$/.test(k)?{kind:'verse',number:Number(k)}:{c:{kind:'chorus'},p:{kind:'pre-chorus'},g:{kind:'bridge'},t:{kind:'tag'},e:{kind:'ending'}}[k];
 if(!want)return false;
 const matches=live.slides.map((s,i)=>({s,i})).filter(({s})=>s.song?.entryId===current.entryId&&(s.song.kind===want.kind||(want.kind==='ending'&&s.song.kind==='outro'))&&(want.number===undefined||s.song.number===want.number)&&(s.page??1)===1);
 if(!matches.length){toast('This song has no '+(want.number?'verse '+want.number:want.kind)+'.');return true;}
 const next=matches.find(m=>m.i>live.index)||matches[0];
 publish({...clone(live),index:next.i,blank:false}).then(ok=>{if(ok)$('.slide-card .live-pin')?.closest('.slide-card')?.scrollIntoView({block:'nearest',inline:'nearest'});});
 return true;
}

// Section buttons for the song that is live (from the sent snapshot, not the preview).
function paintLiveSongBar(){
 const bar=$('#liveSongBar');if(!bar)return;
 const current=live.slides[live.index]?.song;
 if(!current){bar.innerHTML='';return;}
 const seen=new Set(),buttons=[];
 live.slides.forEach((s,i)=>{if(s.song?.entryId!==current.entryId||(s.page??1)!==1||seen.has(s.song.section))return;seen.add(s.song.section);buttons.push('<button class="button'+(s.song.section===current.section?' active':'')+'" data-action="song-live-jump" data-live-index="'+i+'">'+e(s.song.section)+'</button>');});
 bar.innerHTML='<span class="small-note">'+e(current.title)+'</span>'+buttons.join('');
}

// Adds a song snapshot to the show (checked against the show's limits first) and previews it.
function addSongEntry(song,edit=false){
 // Each song gets its own item (an empty current item is reused). The complete item is checked before anything
 // changes, so a song that cannot be added leaves the show as it was. The screen is unchanged.
 const show=activeShow(library),entry={entryId:crypto.randomUUID(),song};
 draft=addContent(show,song.title,d=>{d.songs=[...(d.songs||[]),entry];});summaryCache=new WeakMap();
 draft.previewId=deckFor(draft).find(x=>x.song?.entryId===entry.entryId)?.id||draft.previewId;
 remember();render();
 if(edit)openSongEditor(entry.entryId);else toast(song.title+' added as its own item. Send to screen when ready.');
}
$('#songFile')?.addEventListener('change',async ev=>{
 const file=ev.target.files[0];ev.target.value='';if(!file)return;
 try{if(file.size>5e6)throw new Error('That file is too large for one song.');addSongEntry(readSongFile(JSON.parse(await file.text())));}
 catch(err){toast(err.message||'That song file could not be read.');}
});
// Song editor: changes this show's copy of the song only. FreeShow files are never written.
function openSongEditor(entryId){
 const entry=(draft.songs||[]).find(x=>x.entryId===entryId);if(!entry)return;const song=entry.song;
 const arrangement=song.arrangements.find(a=>a.id===song.arrangementId)||song.arrangements[0],hiddenPages=Object.keys(arrangement.hidden||{}).length;
 $('#songDialog').innerHTML='<div class="dialog-top"><span class="eyebrow">SONG</span><button class="icon-button" data-action="song-editor-close" aria-label="Close song editor">×</button></div><h2 id="songDialogTitle">Edit song</h2>'+
  '<p class="small-note">'+(song.source.app==='freeshow'?'The FreeShow file is never changed. ':'')+(companionReady()?'Save to song library also updates your library copy.':'Changes apply to this show’s copy.')+'</p>'+
  '<div class="field-row"><div>'+label('Title','songTitle')+input('songTitle',song.title,'maxlength="200"')+'</div><div>'+label('Author','songAuthor')+input('songAuthor',song.meta.author||song.meta.artist||'','maxlength="300"')+'</div></div>'+
  '<div class="field-row"><div>'+label('Copyright','songCopyright')+input('songCopyright',song.meta.copyright||'','maxlength="300"')+'</div><div>'+label('CCLI song number','songCcli')+input('songCcli',song.meta.ccli||'','maxlength="30"')+'</div></div>'+
  label('Lyrics','songLyrics')+'<textarea id="songLyrics" rows="16" spellcheck="false">'+e(songToText(song))+'</textarea>'+
  tip('Start each section with a label line such as [Verse 1] or [Chorus]. A blank line starts a new slide; a slide with only (blank) is a blank cue.')+
  label('Arrangement'+(song.arrangements.length>1?' · '+e(arrangement.name):''),'songArrangementText')+input('songArrangementText',arrangementText(song),'maxlength="4000"')+
  tip('Section labels in the order they are sung, separated by commas. Repeats are fine: Verse 1, Chorus, Verse 2, Chorus.')+
  (hiddenPages?'<p class="small-note">This arrangement hides some slides for single repeats (from FreeShow). Changing the order shows all slides of each section.</p>':'')+
  '<p id="songEditError" class="small-note status-error" aria-live="polite"></p><div class="timer-actions"><button class="button primary" data-action="song-editor-save" data-song-entry="'+e(entryId)+'">Save in this show</button>'+(companionReady()?'<button class="button" data-action="song-editor-library" data-song-entry="'+e(entryId)+'" title="Save in this show and in your song library">Save to song library</button><button class="button" data-action="song-editor-library-new" data-song-entry="'+e(entryId)+'" hidden>Save as new song</button>':'')+button('Cancel','song-editor-close')+'</div>';
 if(!$('#songDialog').open)$('#songDialog').showModal();
}
document.addEventListener('click',async ev=>{
 const t=ev.target.closest('[data-action^="song-editor-"]');if(!t)return;
 if(t.dataset.action==='song-editor-close'){$('#songDialog').close();return;}
 const entry=(draft.songs||[]).find(x=>x.entryId===t.dataset.songEntry);if(!entry)return;
 try{
  let song=editSong(entry.song,{title:$('#songTitle').value,meta:{author:$('#songAuthor').value,copyright:$('#songCopyright').value,ccli:$('#songCcli').value},lyrics:$('#songLyrics').value,arrangement:$('#songArrangementText').value});
  cleanDraft({...draft,songs:draft.songs.map(x=>x===entry?{entryId:entry.entryId,song}:x)});
  let note='saved in this show';
  if(t.dataset.action!=='song-editor-save'){
   // A library song is updated only if the library still has the version this copy came from.
   const asNew=t.dataset.action==='song-editor-library-new',fromLibrary=song.source.app==='wordlight'&&!asNew;
   const r=await localFetch('/api/songs/library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({song:{...song,id:fromLibrary?song.id:undefined},expectedModified:fromLibrary?song.source.modified:null})});
   const data=await r.json();
   if(r.status===409&&data.modified){$('#songEditError').textContent=data.error;$('[data-action=song-editor-library-new]').hidden=false;return;}
   if(!r.ok)throw new Error(data.error);
   song=data.song;note=asNew?'saved as a new library song and in this show':'saved to your song library and in this show';
  }
  draft.songs=draft.songs.map(x=>x===entry?{entryId:entry.entryId,song}:x);
  // An item named after the song follows a new title; a name the operator chose is kept.
  {const show=activeShow(library),scene=activeScene(show);if(scene.name===entry.song.title&&song.title!==entry.song.title)renameScene(show,scene.id,song.title);}
  draft.previewId=deckFor(draft).find(x=>x.song?.entryId===entry.entryId)?.id||draft.previewId;
  $('#songDialog').close();remember();render();toast(song.title+' '+note+'. The screen is unchanged until you send.');
 }catch(err){$('#songEditError').textContent=err.message;}
});
$('#songLibraryFile')?.addEventListener('change',async ev=>{
 const file=ev.target.files[0];ev.target.value='';if(!file)return;
 try{
  if(file.size>50e6)throw new Error('That file is too large.');
  const r=await fetch('/api/songs/library/import',{method:'POST',headers:{'Content-Type':'application/json'},body:await file.text()}),data=await r.json();if(!r.ok)throw new Error(data.error);
  await searchSongLibrary(false);toast(data.added+' song'+(data.added===1?'':'s')+' added to your library'+(data.skipped?', '+data.skipped+' already there':'')+(data.failed?'. '+data.failed+' not imported: '+data.errors.join('; '):'.'));
 }catch(err){toast(err.message||'That library file could not be imported.');}
});

// Graphics panel. The dialog keeps its own draft of the settings. The preview shows the draft over a checkerboard
// (the holding background only when "Preview background" is ticked). Apply sends the draft's settings; each Show/Hide
// changes only that element on air and keeps every other unsent edit. Images live in the companion's store.
const graphicsEls=['logo','timer','background','card'];
// Reads the form into the draft without validating, so a half-typed field never blocks another action.
function readGraphicsForm(){
 if(!$('#gLogoAsset'))return;
 const v=id=>$('#'+id)?.value,on=id=>$('#'+id)?.checked;
 graphicsDraft={
  logo:{assetId:v('gLogoAsset'),position:v('gLogoPosition'),size:v('gLogoSize'),margin:v('gLogoMargin'),opacity:v('gLogoOpacity')},
  timer:{position:v('gTimerPosition'),hideAtZero:on('gTimerHide'),margin:v('gTimerMargin'),size:v('gTimerSize')},
  background:{kind:v('gBgKind'),color:v('gBgColor'),assetId:v('gBgAsset')},
  card:{title:v('gCardTitle'),subtitle:v('gCardSubtitle'),position:v('gCardPosition'),margin:v('gCardMargin')}};
 previewBackground=!!on('gBgPreview');
}
// The draft's settings with on-air visibility taken from live; throws for invalid input (shown in the dialog).
function graphicsForm(){
 const air=cleanGraphics(live.graphics),d=graphicsDraft||air;
 return cleanGraphics(Object.fromEntries(graphicsEls.map(el=>[el,{...d[el],visible:air[el].visible}])));
}
function previewGraphics(){
 const frame=$('#graphicsPreview');if(!frame)return;readGraphicsForm();let g;
 try{g=graphicsForm();$('#graphicsError').textContent='';}catch(err){$('#graphicsError').textContent=err.message;return;}
 const shown=cleanGraphics({...g,logo:{...g.logo,visible:true},timer:{...g.timer,visible:true},card:{...g.card,visible:true},background:{...g.background,visible:previewBackground}});
 mountStage(frame,graphicsMarkup(shown).replace('<div class="stage-canvas graphics-canvas"','<div class="stage-canvas graphics-canvas" data-graphics-source="form"'));paintTimers();
}
let graphicsAssetError='';
async function loadGraphicsAssets(){
 try{const r=await localFetch('/api/assets',{cache:'no-store'}),data=await r.json();if(!r.ok)throw new Error(data.error);graphicsAssets=data.assets||[];graphicsAssetError='';}
 catch(err){graphicsAssetError=err.message||'The image list could not be loaded.';}
}
async function openGraphics(){
 if(!isLocal){$('#graphicsDialog').innerHTML='<div class="dialog-top"><span class="eyebrow">GRAPHICS</span><button class="icon-button" data-action="graphics-close" aria-label="Close">×</button></div><p class="hint">Graphics use images stored by the local companion. Open the local studio to set them up.</p>';$('#graphicsDialog').showModal();return;}
 graphicsDraft=cleanGraphics(live.graphics);previewBackground=false;
 await loadGraphicsAssets();renderGraphicsPanel();if(!$('#graphicsDialog').open)$('#graphicsDialog').showModal();
}
function renderGraphicsPanel(){
 const air=cleanGraphics(live.graphics),g=graphicsDraft||air,opts=(list,value,names)=>list.map(x=>'<option value="'+x+'" '+(x===value?'selected':'')+'>'+(names?.[x]||x.replace('-',' '))+'</option>').join('');
 const assetOpts=value=>'<option value="">None</option>'+(value&&!graphicsAssets.some(a=>a.id===value)?'<option value="'+value+'" selected>Current image</option>':'')+graphicsAssets.map(a=>'<option value="'+a.id+'" '+(a.id===value?'selected':'')+'>'+e(a.name)+' ('+a.width+'×'+a.height+')</option>').join('');
 const num=(id,label,value,[min,max])=>'<label class="graphics-num">'+label+' <input class="input" id="'+id+'" type="number" min="'+min+'" max="'+max+'" value="'+e(value)+'"></label>';
 const toggle=(el,name)=>{const shown=air[el].visible;return '<button class="button'+(shown?' active':'')+'" data-action="graphics-'+(shown?'hide':'show')+'" data-graphics-el="'+el+'" aria-label="'+(shown?'Hide ':'Show ')+name+' on the graphics output">'+(shown?'Hide':'Show')+'</button>';};
 const row=(title,el,body)=>'<fieldset class="graphics-row"><legend>'+title+' '+toggle(el,title.toLowerCase())+(air[el].visible?' <span class="graphics-on">on air</span>':'')+'</legend>'+body+'</fieldset>';
 $('#graphicsDialog').innerHTML='<div class="dialog-top"><span class="eyebrow">GRAPHICS</span><button class="icon-button" data-action="graphics-close" aria-label="Close">×</button></div>'+
  '<div id="graphicsPreview" class="stage-frame lower-preview graphics-preview" aria-label="Preview of these settings; the checkerboard is transparent"></div><p id="graphicsError" class="small-note status-error" aria-live="polite"></p>'+(graphicsAssetError?'<p class="small-note status-error">Images: '+e(graphicsAssetError)+'</p>':'')+
  row('Logo','logo','<div class="field-row"><select id="gLogoAsset" aria-label="Logo image">'+assetOpts(g.logo.assetId)+'</select>'+button('Upload','graphics-upload-logo','upload')+'</div><div class="field-row"><select id="gLogoPosition" aria-label="Logo position">'+opts(GRAPHICS_POSITIONS,g.logo.position)+'</select>'+num('gLogoSize','Size',g.logo.size,GRAPHICS_LIMITS.logoSize)+num('gLogoMargin','Margin',g.logo.margin,GRAPHICS_LIMITS.margin)+num('gLogoOpacity','Opacity %',g.logo.opacity,GRAPHICS_LIMITS.opacity)+'</div>')+
  row('Timer','timer','<div class="field-row"><select id="gTimerPosition" aria-label="Timer position">'+opts(GRAPHICS_POSITIONS,g.timer.position)+'</select>'+num('gTimerSize','Size',g.timer.size,GRAPHICS_LIMITS.timerSize)+num('gTimerMargin','Margin',g.timer.margin,GRAPHICS_LIMITS.margin)+'<label><input id="gTimerHide" type="checkbox" '+(g.timer.hideAtZero?'checked':'')+'> Hide at 0:00</label></div><div class="field-row">'+button('Start','graphics-timer-start')+button('Pause','graphics-timer-pause')+button('Reset','graphics-timer-reset')+'<span class="small-note" id="gTimerState"></span></div>'+tip('The same clock as the slide timer; set its duration and look in Timer. Turn off the slide timer overlay so OBS does not show it twice.'))+
  row('Background','background','<div class="field-row"><select id="gBgKind" aria-label="Background type">'+opts(['color','image'],g.background.kind,{color:'Color',image:'Image'})+'</select><input id="gBgColor" type="color" value="'+g.background.color+'" aria-label="Background color"><select id="gBgAsset" aria-label="Background image">'+assetOpts(g.background.assetId)+'</select>'+button('Upload','graphics-upload-background','upload')+'<label><input id="gBgPreview" type="checkbox" '+(previewBackground?'checked':'')+'> Preview background</label></div>'+tip('A holding screen that covers everything under it. It stays off until you press Show.'))+
  row('Title card','card','<div class="field-row"><label class="graphics-text">Title <input class="input" id="gCardTitle" maxlength="'+GRAPHICS_LIMITS.titleLength+'" value="'+e(g.card.title)+'"></label><label class="graphics-text">Subtitle <input class="input" id="gCardSubtitle" maxlength="'+GRAPHICS_LIMITS.subtitleLength+'" value="'+e(g.card.subtitle)+'"></label></div><div class="field-row"><select id="gCardPosition" aria-label="Card position">'+opts(CARD_POSITIONS,g.card.position)+'</select>'+num('gCardMargin','Margin',g.card.margin,GRAPHICS_LIMITS.margin)+'</div>')+
  '<div class="timer-actions"><button class="button primary" data-action="graphics-apply" title="Send these settings; elements that are on air update, nothing is shown or hidden">Apply settings</button>'+button('Open graphics window','graphics-window')+'<button class="button" data-action="graphics-clean" title="Take images that the graphics and the shows in this studio do not use out of the image library. Their files are kept, so shows saved elsewhere still show them.">Remove unused from image library</button></div>';
 for(const el of $('#graphicsDialog').querySelectorAll('input,select'))el.addEventListener('input',previewGraphics);
 previewGraphics();
}
$('#graphicsFile')?.addEventListener('change',async ev=>{
 const file=ev.target.files[0];ev.target.value='';if(!file)return;
 let bitmap,canvas;
 try{
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Use a PNG, JPEG or WebP image. SVG is not accepted.');
  if(file.size>20e6)throw new Error('That image file is larger than 20 MB.');
  // Normalize in the browser: logos up to 512 px wide (PNG keeps transparency), backgrounds up to 1920 × 1080 (JPEG).
  bitmap=await createImageBitmap(file);
  if(bitmap.width>8192||bitmap.height>8192)throw new Error('That image is larger than 8192 pixels.');
  const logo=graphicsUpload==='logo',scale=Math.min(1,logo?512/bitmap.width:Math.min(1920/bitmap.width,1080/bitmap.height));
  canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise(r=>canvas.toBlob(r,logo?'image/png':'image/jpeg',.9));
  const r=await localFetch('/api/assets?name='+encodeURIComponent(file.name.replace(/\.[^.]+$/,'')),{method:'POST',headers:{'Content-Type':blob.type},body:blob});
  const data=await r.json();if(!r.ok)throw new Error(data.error);
  if(graphicsUpload==='slide-background'){await loadGraphicsAssets();draft.backgroundAssetId=data.asset.id;remember();if(tab==='design')renderDesign();renderPreview();toast('Background image stored and used for this item.');return;}
  readGraphicsForm();await loadGraphicsAssets();
  if(logo)graphicsDraft.logo.assetId=data.asset.id;else{graphicsDraft.background.assetId=data.asset.id;graphicsDraft.background.kind='image';}
  renderGraphicsPanel();toast('Image stored. Apply settings or Show to use it.');
 }catch(err){toast(err.message||'That image could not be stored.');}
 finally{bitmap?.close();if(canvas){canvas.width=0;canvas.height=0;}}
});
async function handleGraphicsAction(action,t){
 try{
  if(action==='graphics-open'){await openGraphics();return;}
  if(action==='graphics-close'){$('#graphicsDialog').close();return;}
  if(action==='graphics-window'){if(!window.open('./?view=graphics','wordlight-graphics','popup,width=1280,height=720'))toast('Allow pop-ups for this site to open the graphics window.');return;}
  if(action==='graphics-upload-logo'||action==='graphics-upload-background'){readGraphicsForm();graphicsUpload=action.endsWith('logo')?'logo':'background';chooseFile($('#graphicsFile'));return;}
  readGraphicsForm();
  if(action==='graphics-timer-start'||action==='graphics-timer-pause'||action==='graphics-timer-reset'){if(await publish({...clone(live),timer:changeTimer(cleanTimer(live.timer),action.slice(15))}))renderGraphicsPanel();return;}
  if(action==='graphics-clean'){
   const g=graphicsForm(),used=new Set([g.logo.assetId,g.background.assetId,cleanGraphics(live.graphics).logo.assetId,cleanGraphics(live.graphics).background.assetId,live.style?.backgroundAssetId,...backgroundAssetIds(library)].filter(Boolean));
   if(graphicsAssetError)throw new Error('The image list could not be loaded, so nothing was removed.');
   let removed=0;for(const a of graphicsAssets)if(!used.has(a.id)){const r=await fetch('/api/assets/'+a.id,{method:'DELETE'});if(r.ok)removed++;}
   await loadGraphicsAssets();renderGraphicsPanel();toast(removed+' unused image'+(removed===1?'':'s')+' removed from the image library.');return;
  }
  if(action==='graphics-apply'){if(await publish({...clone(live),graphics:graphicsForm()})){renderGraphicsPanel();toast('Graphics settings applied.');}return;}
  if(action==='graphics-show'||action==='graphics-hide'){
   const el=t.dataset.graphicsEl;if(!graphicsEls.includes(el))return;
   const air=cleanGraphics(live.graphics);
   // Hide changes only visibility, so unsent or invalid edits elsewhere never block it.
   if(action==='graphics-hide'){if(await publish({...clone(live),graphics:{...air,[el]:{...air[el],visible:false}}}))renderGraphicsPanel();return;}
   const one=cleanGraphics({...air,[el]:{...(graphicsDraft?.[el]||air[el]),visible:true}});
   if(!one[el].visible)throw new Error(el==='logo'?'Choose a logo image first.':el==='card'?'Type a title or subtitle first.':el==='background'&&one.background.kind==='image'?'Choose a background image first.':'This cannot be shown yet.');
   if(await publish({...clone(live),graphics:one}))renderGraphicsPanel();
  }
 }catch(err){toast(err.message);}
}

// A file input outside an open modal dialog is inert, so its chooser would not open. Move the input into the open
// dialog just before opening the chooser, and back to the page once a file is chosen or the chooser is cancelled,
// so a dialog that redraws itself cannot remove it. The existing change handlers stay on the element.
function chooseFile(input){
 if(!input)return;
 const dialog=document.querySelector('dialog[open]');if(dialog&&!dialog.contains(input))dialog.append(input);
 input.click();
}
for(const input of document.querySelectorAll('input[type=file]')){
 const home=()=>{if(input.parentElement!==document.body)document.body.append(input);};
 // Registered once per input, in the capture phase so it runs before any handler that redraws a dialog.
 input.addEventListener('change',home,{capture:true});input.addEventListener('cancel',home,{capture:true});
}
