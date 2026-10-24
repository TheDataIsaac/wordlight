// Graphics output (?view=graphics): logo, timer, holding background and a title card on a transparent 1920 x 1080
// canvas, for an OBS Browser source above cameras and video. Settings travel with the live state like the timer, but
// slide blanking does not hide them. Images are stored once by the companion and referenced by id (never copied into
// shows or slides). Only the timer text changes each second; the markup is rebuilt only when settings change.
export const GRAPHICS_POSITIONS=['top-left','top-right','bottom-left','bottom-right','center'];
export const CARD_POSITIONS=['bottom-left','bottom-center','bottom-right','top-left','top-center','top-right'];
const ASSET_ID=/^[a-f0-9]{16}$/;
const num=(v,fallback,min,max)=>v!==''&&v!=null&&Number.isFinite(Number(v))?Math.round(Math.min(max,Math.max(min,Number(v)))):fallback;
const pick=(v,list,fallback)=>list.includes(v)?v:fallback;
const color=(v,fallback)=>/^#[0-9a-f]{6}$/i.test(v||'')?v.toLowerCase():fallback;
const asset=v=>typeof v==='string'&&ASSET_ID.test(v)?v:'';
export const GRAPHICS_LIMITS={logoSize:[40,900],timerSize:[24,400],margin:[0,300],opacity:[0,100],titleLength:120,subtitleLength:160};
export function cleanGraphics(raw={}){
 const L=GRAPHICS_LIMITS,logo=raw?.logo||{},timer=raw?.timer||{},bg=raw?.background||{},card=raw?.card||{};
 const title=typeof card.title==='string'?card.title:'',subtitle=typeof card.subtitle==='string'?card.subtitle:'';
 if(title.length>L.titleLength||subtitle.length>L.subtitleLength)throw new Error('The title card allows '+L.titleLength+' characters for the title and '+L.subtitleLength+' for the subtitle.');
 return {
  logo:{visible:logo.visible===true&&!!asset(logo.assetId),assetId:asset(logo.assetId),position:pick(logo.position,GRAPHICS_POSITIONS,'top-right'),size:num(logo.size,220,...L.logoSize),margin:num(logo.margin,48,...L.margin),opacity:num(logo.opacity,100,...L.opacity)},
  // size is the graphics timer's text size; it scales the shared timer look for this output only.
  timer:{visible:timer.visible===true,position:pick(timer.position,GRAPHICS_POSITIONS,'top-left'),hideAtZero:timer.hideAtZero===true,margin:num(timer.margin,48,...L.margin),size:num(timer.size,64,...L.timerSize)},
  // The holding background is off unless chosen, so a camera underneath is never covered by default.
  background:{visible:bg.visible===true,kind:bg.kind==='image'&&asset(bg.assetId)?'image':'color',color:color(bg.color,'#000000'),assetId:asset(bg.assetId)},
  card:{visible:card.visible===true&&!!(title.trim()||subtitle.trim()),title,subtitle,position:pick(card.position,CARD_POSITIONS,'bottom-left'),margin:num(card.margin,80,...L.margin)}
 };
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Inline placement for an element at one of the positions, with a margin from the canvas edges.
export function placement(position,margin){
 const m=margin+'px';
 return {'top-left':'top:'+m+';left:'+m,'top-right':'top:'+m+';right:'+m,'bottom-left':'bottom:'+m+';left:'+m,'bottom-right':'bottom:'+m+';right:'+m,
  center:'top:50%;left:50%;transform:translate(-50%,-50%)','bottom-center':'bottom:'+m+';left:50%;transform:translateX(-50%)','top-center':'top:'+m+';left:50%;transform:translateX(-50%)'}[position];
}
// Markup for the graphics canvas. The timer element is a placeholder whose text and visibility the shared timer loop
// updates; assetUrl maps an image id to its URL.
export function graphicsMarkup(raw,assetUrl=id=>'/api/assets/'+id){
 const g=cleanGraphics(raw),parts=[];
 if(g.background.visible)parts.push(g.background.kind==='image'?'<img class="graphics-background" alt="" src="'+esc(assetUrl(g.background.assetId))+'">':'<div class="graphics-background" style="background:'+g.background.color+'"></div>');
 if(g.card.visible)parts.push('<div class="graphics-card" style="'+placement(g.card.position,g.card.margin)+'">'+(g.card.title.trim()?'<div class="graphics-card-title">'+esc(g.card.title)+'</div>':'')+(g.card.subtitle.trim()?'<div class="graphics-card-subtitle">'+esc(g.card.subtitle)+'</div>':'')+'</div>');
 if(g.logo.visible)parts.push('<img class="graphics-logo" alt="" src="'+esc(assetUrl(g.logo.assetId))+'" style="'+placement(g.logo.position,g.logo.margin)+';width:'+g.logo.size+'px;opacity:'+g.logo.opacity/100+'">');
 if(g.timer.visible)parts.push('<div class="graphics-timer timer-overlay" data-graphics-timer="true" style="'+placement(g.timer.position,g.timer.margin)+'"></div>');
 return '<div class="stage-canvas graphics-canvas">'+parts.join('')+'</div>';
}
// Whether the graphics timer shows right now: on, and not hidden because a countdown reached zero.
export function graphicsTimerShown(raw,timer,value){
 const g=cleanGraphics(raw);
 return g.timer.visible&&!(g.timer.hideAtZero&&timer?.mode!=='stopwatch'&&value===0);
}
