// One timer is shared by the outputs, the graphics source, the stage display and the phone.
// Modes: countdown (from a duration), stopwatch, and until (counts down to a time of day, for "the service starts at
// 10:00"). With overrun on, a countdown carries on past zero and shows how far over it is (−01:20) instead of stopping
// at 00:00. In the last warnMs before zero the timer shows its warning colour (0 turns that off).
export const TIMER_MODES=['countdown','stopwatch','until'];
const LIMIT=359999000,HOURS_6=6*3600000;
export function cleanTimer(raw={}){
 const bounded=(v,fallback,max=LIMIT,min=0)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):fallback;
 const mode=TIMER_MODES.includes(raw?.mode)?raw.mode:'countdown',durationMs=bounded(raw?.durationMs,300000,86400000)||300000;
 const overrun=mode!=='stopwatch'&&raw?.overrun===true,targetAt=mode==='until'?bounded(raw?.targetAt,0,1e15):0;
 return {...cleanTimerAppearance(raw),mode,durationMs,valueMs:bounded(raw?.valueMs,mode==='stopwatch'?0:durationMs,LIMIT,overrun?-LIMIT:0),
  // A time-of-day timer always runs: it follows the clock.
  running:mode==='until'?targetAt>0:raw?.running===true&&Number(raw.startedAt)>0,startedAt:bounded(raw?.startedAt,0,1e15),
  targetAt,untilTime:/^([01]\d|2[0-3]):[0-5]\d$/.test(raw?.untilTime||'')?raw.untilTime:'10:00',overrun,warnMs:bounded(raw?.warnMs,60000,3600000),
  visible:raw?.visible===true,
  // Where the overlay shows: onScreen for the projector or TV (and the Present window), onObs for OBS pages (obs=1),
  // so a church can give the preacher a timer on the TV without putting it on the livestream. Both on unless turned off.
  onScreen:raw?.onScreen!==false,onObs:raw?.onObs!==false,position:['top-left','top-right','bottom-left','bottom-right'].includes(raw?.position)?raw.position:'top-right'};
}
// When "10:00" is, as a moment: today, unless that was more than 6 hours ago, then tomorrow. So 10:00 set at 10:05
// shows the service is 5 minutes late, and 08:00 set the evening before counts down to the next morning.
export function nextOccurrence(hhmm,now=Date.now()){
 const [h,m]=String(hhmm).split(':').map(Number),d=new Date(now);d.setHours(h||0,m||0,0,0);
 if(d.getTime()<now-HOURS_6)d.setDate(d.getDate()+1);
 return d.getTime();
}
// Milliseconds left (or counted, for a stopwatch). Below zero only when overrun is on.
export function timerSigned(raw,now=Date.now()){
 const t=cleanTimer(raw);let ms;
 if(t.mode==='until')ms=t.targetAt?t.targetAt-now:0;
 else{const elapsed=t.running?Math.max(0,now-t.startedAt):0;ms=t.mode==='stopwatch'?t.valueMs+elapsed:t.valueMs-elapsed;}
 return Math.max(t.overrun?-LIMIT:0,Math.min(LIMIT,ms));
}
export function timerValue(raw,now=Date.now()){return Math.max(0,timerSigned(raw,now));}
// How the timer should look now: '' counting, 'warning' near zero, 'expired' at zero, 'over' once past zero.
export function timerState(raw,now=Date.now()){
 const t=cleanTimer(raw);if(t.mode==='stopwatch')return '';
 const ms=timerSigned(t,now);
 return ms<=-1000?'over':ms<=0?'expired':t.warnMs&&ms<=t.warnMs?'warning':'';
}
export function formatTimer(ms){
 const over=ms<=-1000,seconds=over?Math.floor(-ms/1000):Math.ceil(Math.max(0,ms)/1000),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;
 return (over?'−':'')+(h?h+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
export function changeTimer(raw,action,now=Date.now()){
 const t=cleanTimer(raw),value=timerSigned(t,now);
 if(t.mode==='until'){
  // Start and Pause do not apply to the clock; Reset finds the next time of day again.
  if(action==='reset'||action==='start')t.targetAt=nextOccurrence(t.untilTime,now);
 }else{
  if(action==='start'){t.valueMs=t.mode==='countdown'&&value===0?t.durationMs:value;t.startedAt=now;t.running=true;}
  if(action==='pause'){t.valueMs=value;t.startedAt=0;t.running=false;}
  if(action==='reset'){t.valueMs=t.mode==='stopwatch'?0:t.durationMs;t.startedAt=0;t.running=false;}
 }
 if(action==='show')t.visible=true;
 if(action==='hide')t.visible=false;
 return cleanTimer(t);
}
// The timer fields a stage screen or phone needs to show and tick the timer by itself.
export function timerSummary(raw){
 const t=cleanTimer(raw);
 return {mode:t.mode,durationMs:t.durationMs,valueMs:t.valueMs,running:t.running,startedAt:t.startedAt,targetAt:t.targetAt,untilTime:t.untilTime,overrun:t.overrun,warnMs:t.warnMs,visible:t.visible};
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
