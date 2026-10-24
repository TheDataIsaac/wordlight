
export function cleanTimer(raw={}){
 const bounded=(v,fallback,max=359999000)=>Number.isFinite(Number(v))?Math.max(0,Math.min(max,Number(v))):fallback;
 const mode=raw?.mode==='stopwatch'?'stopwatch':'countdown',durationMs=bounded(raw?.durationMs,300000,86400000)||300000;
 return {...cleanTimerAppearance(raw),mode,durationMs,valueMs:bounded(raw?.valueMs,mode==='stopwatch'?0:durationMs),running:raw?.running===true&&Number(raw.startedAt)>0,startedAt:bounded(raw?.startedAt,0,1e15),visible:raw?.visible===true,position:['top-left','top-right','bottom-left','bottom-right'].includes(raw?.position)?raw.position:'top-right'};
}
export function timerValue(raw,now=Date.now()){
 const t=cleanTimer(raw),elapsed=t.running?Math.max(0,now-t.startedAt):0;
 return Math.max(0,Math.min(359999000,t.mode==='stopwatch'?t.valueMs+elapsed:t.valueMs-elapsed));
}
export function formatTimer(ms){
 const seconds=Math.ceil(Math.max(0,ms)/1000),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;
 return (h?h+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
export function changeTimer(raw,action,now=Date.now()){
 const t=cleanTimer(raw),value=timerValue(t,now);
 if(action==='start'){t.valueMs=t.mode==='countdown'&&value===0?t.durationMs:value;t.startedAt=now;t.running=true;}
 if(action==='pause'){t.valueMs=value;t.startedAt=0;t.running=false;}
 if(action==='reset'){t.valueMs=t.mode==='stopwatch'?0:t.durationMs;t.startedAt=0;t.running=false;}
 if(action==='show')t.visible=true;
 if(action==='hide')t.visible=false;
 return t;
}

export function cleanTimerAppearance(raw={}){
 const number=(key,fallback,min,max)=>raw?.[key]!==''&&raw?.[key]!=null&&Number.isFinite(Number(raw[key]))?Math.min(max,Math.max(min,Number(raw[key]))):fallback;
 const color=(key,fallback)=>/^#[0-9a-f]{6}$/i.test(raw?.[key]||'')?raw[key]:fallback;
 return {fontSize:number('fontSize',64,24,160),textColor:color('textColor','#ffffff'),backgroundColor:color('backgroundColor','#08120d'),backgroundOpacity:number('backgroundOpacity',93,0,100),padding:number('padding',14,0,60),radius:number('radius',12,0,80),offsetX:number('offsetX',50,0,300),offsetY:number('offsetY',44,0,300)};
}
export function timerAppearanceStyle(raw,scale=1){
 const t=cleanTimerAppearance(raw),hex=t.backgroundColor.slice(1);
 return {fontSize:t.fontSize*scale+'px',color:t.textColor,backgroundColor:'rgba('+[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)).join(',')+','+t.backgroundOpacity/100+')',padding:t.padding*scale+'px '+Math.round(t.padding*12/7)*scale+'px',borderRadius:t.radius*scale+'px','--timer-offset-x':t.offsetX*scale+'px','--timer-offset-y':t.offsetY*scale+'px'};
}
