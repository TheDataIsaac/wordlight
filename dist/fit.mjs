// Sizes slide text for the 1920 x 1080 canvas. Every run starts again from the design sizes, so refitting
// after a font loads can make text larger as well as smaller, and the autofit flag always matches the result.
//
// Manual mode (the default) only shrinks text that would overflow.
// Fit to screen mode picks the largest size that fits inside the padded content box: short text grows and
// long text shrinks. It uses a binary search (about 12 measurements) instead of stepping a few pixels at a time.
export const FIT_LIMITS={verseMin:28,verseMax:160,scaleMin:.22,largestText:200,lowerMin:16};

// Largest value in [low, high] for which fits(value) is true, assuming smaller values fit more easily.
// Returns low when even low does not fit, so text never vanishes.
export function largestFitting(low,high,fits,steps=12){
 if(fits(high))return high;
 if(!fits(low))return low;
 for(let i=0;i<steps;i++){const mid=(low+high)/2;if(fits(mid))low=mid;else high=mid;}
 return low;
}
const pad=el=>Math.max(0,Number(el?.dataset?.fitPad)||0);
export function fitStage(frame){
 let reduced=false,fitted=false;
 const content=frame.querySelector('.text-slide-layout');
 if(content){
  const parts=[...content.querySelectorAll('[data-base-size]')],setScale=scale=>parts.forEach(el=>el.style.fontSize=(Number(el.dataset.baseSize)*scale)+'px');
  const fits=scale=>{setScale(scale);return content.scrollHeight<=content.clientHeight+2&&content.scrollWidth<=content.clientWidth+2;};
  let scale=1;
  if(content.dataset.fit==='true'&&parts.length){
   // Keep heading, subheading and body in proportion; cap the largest part at a readable maximum.
   const largest=Math.max(...parts.map(el=>Number(el.dataset.baseSize)||1));
   scale=Math.floor(largestFitting(FIT_LIMITS.scaleMin,Math.max(1,FIT_LIMITS.largestText/largest),fits)*100)/100;fitted=true;
  }else{
   setScale(1);
   while(!fits(scale)&&scale>FIT_LIMITS.scaleMin)scale-=.02;
   reduced=scale<1;
  }
  setScale(scale);
 }
 const verse=frame.querySelector('.verse-text');
 if(verse){
  const area=frame.querySelector('.slide-content');
  if(area?.dataset.fit==='true'){
   // The space inside the padding of the content box is the safe area; kicker, footer and credit sit outside it.
   const inset=pad(area),available=()=>area.clientHeight-2*inset;
   const fits=size=>{verse.style.fontSize=size+'px';return verse.scrollHeight<=available()&&verse.scrollWidth<=verse.clientWidth+1;};
   verse.style.fontSize=Math.floor(largestFitting(FIT_LIMITS.verseMin,FIT_LIMITS.verseMax,fits))+'px';fitted=true;
  }else{
   let size=Number(verse.dataset.baseSize)||parseFloat(verse.style.fontSize);verse.style.fontSize=size+'px';
   while((verse.scrollHeight>620||verse.scrollWidth>verse.clientWidth+1)&&size>FIT_LIMITS.verseMin){size-=2;verse.style.fontSize=size+'px';}
  }
 }
 const study=frame.querySelector('.study-area');
 if(study){
  const sizes=[['.study-label',20],['.study-word',90],['.study-original',37],['.study-meta',23],['.study-meaning',33]];
  // Clearing the inline size returns each part to its stylesheet size, which is the base size.
  for(const [selector] of sizes){const item=study.querySelector(selector);if(item)item.style.fontSize='';}
  let factor=1;
  while((study.scrollHeight>620||study.scrollWidth>study.clientWidth+1)&&factor>.25){factor-=.025;for(const [selector,base] of sizes){const item=study.querySelector(selector);if(item)item.style.fontSize=(base*factor)+'px';}}
 }
 const band=frame.querySelector('.lower-band');
 if(band){
  // Lower third: with Fit on, the largest size up to Text size that fits the set band height. Text that still
  // does not fit makes the band grow upward (to its safe maximum) rather than being cut off.
  const base=Number(band.dataset.baseSize)||48,height=Number(band.dataset.bandHeight)||band.clientHeight;
  const within=limit=>size=>{band.style.fontSize=size+'px';return band.scrollHeight<=limit()+1&&band.scrollWidth<=band.clientWidth+1;};
  let size=base;
  if(band.dataset.fit==='true')size=Math.floor(largestFitting(FIT_LIMITS.lowerMin,base,within(()=>height)));
  // In both modes, never let text run past the band's safe maximum height.
  if(!within(()=>band.clientHeight)(size))size=Math.floor(largestFitting(FIT_LIMITS.lowerMin,size,within(()=>band.clientHeight)));
  band.style.fontSize=size+'px';
 }
 if(content)frame.dataset.autofit=reduced?'true':'false';
 frame.dataset.fitmode=fitted?'true':'false';
}
