// Lower-third output: the live slide in a band over a transparent 1920 x 1080 canvas, for keying over video.
// Settings travel with the live state (like the timer), so Send, live arrows, scene/show changes and refresh keep them.
const number=(raw,key,fallback,min,max)=>raw?.[key]!==''&&raw?.[key]!=null&&Number.isFinite(Number(raw[key]))?Math.round(Math.min(max,Math.max(min,Number(raw[key])))):fallback;
const color=(raw,key,fallback)=>/^#[0-9a-f]{6}$/i.test(raw?.[key]||'')?raw[key].toLowerCase():fallback;
export const LOWER_THIRD_LIMITS={height:[120,700],width:[30,100],bottom:[0,400],side:[0,400],opacity:[0,100],fontSize:[20,110]};
function lowerThirdValues(raw={}){
 const L=LOWER_THIRD_LIMITS;
 return {
  height:number(raw,'height',300,...L.height),width:number(raw,'width',90,...L.width),bottom:number(raw,'bottom',60,...L.bottom),side:number(raw,'side',80,...L.side),
  align:['left','center','right'].includes(raw?.align)?raw.align:'center',
  background:color(raw,'background','#0b1520'),opacity:number(raw,'opacity',85,...L.opacity),textColor:color(raw,'textColor','#ffffff'),
  fontSize:number(raw,'fontSize',48,...L.fontSize),fit:raw?.fit!==false,showReference:raw?.showReference!==false
 };
}
// The band and its distance from the bottom must leave TOP_SAFE pixels free at the top of the 1080 canvas.
export const TOP_SAFE=40;
export function cleanLowerThird(raw={}){
 const t=lowerThirdValues(raw);
 t.bottom=Math.min(t.bottom,1080-TOP_SAFE-t.height);
 return t;
}
// Inline style for the band, in canvas pixels.
export function lowerThirdBandStyle(raw){
 const t=cleanLowerThird(raw),hex=t.background.slice(1),rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)).join(',');
 const horizontal=t.align==='center'?'left:'+(100-t.width)/2+'%':t.align==='left'?'left:'+t.side+'px':'right:'+t.side+'px';
 return 'position:absolute;'+horizontal+';bottom:'+t.bottom+'px;width:'+(t.align==='center'?t.width+'%':'calc('+t.width+'% - '+t.side+'px)')+';min-height:'+t.height+'px;max-height:'+(1080-TOP_SAFE-t.bottom)+'px;background:rgba('+rgb+','+t.opacity/100+');color:'+t.textColor;
}
// The band is wider and shorter than a slide, so its text rewraps: line breaks made for the full screen (poetry
// lines, pasted lines) become spaces. Song lyrics keep their lines, which are part of how they are sung.
export function lowerThirdFlow(text,slide){
 const value=String(text??'');
 return slide?.song?value.trim():value.replace(/\s*\n\s*/g,' ').replace(/[ \t\u00a0]+/g,' ').trim();
}
// What a live slide shows in the band: heading, subheading, the slide text, a word study's explanation,
// reference and version, and the credit. The decorative small heading and page numbers are left out.
export function lowerThirdContent(slide,style={}){
 if(!slide)return null;
 const f=slide.format||{},credit=slide.type==='text'?f.attribution||'':style.scriptureAttribution||'';
 if(slide.type==='text')return {heading:slide.heading||f.heading||'',subtitle:slide.subtitle||f.subtitle||'',text:slide.text||'',reference:f.footer||slide.reference||'',translation:'',credit};
 if(slide.type==='study'&&slide.note){
  const n=slide.note;
  return {heading:n.word||'',subtitle:[n.original,n.transliteration,n.strong].filter(Boolean).join(' · '),text:slide.text||'',detail:n.meaning||'',reference:slide.reference||'',translation:slide.translation||'',credit};
 }
 return {heading:'',subtitle:'',text:slide.text||'',reference:slide.reference||'',translation:slide.translation||'',credit};
}
