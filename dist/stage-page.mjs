// Stage display page, for a monitor or tablet facing the singers or the preacher. It only reads: nothing here can
// change the screen. The laptop sends the stage state over one event stream, which reconnects by itself.
// On the laptop it is /stage; on the phone remote's address it is /remote/stage and needs the remote's sign-in.
import {timerValue,formatTimer} from './timer.mjs';
import {largestFitting} from './fit.mjs';

const $=id=>document.getElementById(id);
const onRemote=location.pathname.startsWith('/remote/');
let stage=null,clockOffset=0;

// The words on screen now are sized as large as fits their box (between 24 and 140 px).
function fitNow(){
 const box=$('nowBox'),text=$('nowText');
 const fits=size=>{text.style.fontSize=size+'px';return text.scrollHeight<=box.clientHeight&&text.scrollWidth<=box.clientWidth;};
 text.style.fontSize=Math.floor(largestFitting(24,140,fits))+'px';
}

function paintSlide(slide){
 const text=$('nowText');
 text.replaceChildren();
 if(!slide){text.textContent='Nothing on screen yet.';return;}
 text.append(document.createTextNode(slide.text));
 if(slide.second){const second=document.createElement('div');second.className='stage-second';second.textContent=slide.second;text.append(second);}
}

function paint(){
 if(!stage)return;
 $('title').textContent=stage.title;
 $('position').textContent=stage.position;
 $('hidden').hidden=!stage.blank;
 document.body.classList.toggle('is-hidden',stage.blank);
 $('nowLabel').textContent=stage.current?.label||'';
 paintSlide(stage.current);
 $('nextLabel').textContent=stage.next?.label?'· '+stage.next.label:'';
 $('nextText').textContent=stage.next?stage.next.text:'Last slide';
 $('nextText').classList.toggle('dim',!stage.next);
 const message=stage.message?.text||'';
 // A new message flashes once so it is noticed from the pulpit.
 if(message&&$('message').textContent!==message){$('message').classList.remove('flash');void $('message').offsetWidth;$('message').classList.add('flash');}
 $('message').textContent=message;$('message').hidden=!message;
 fitNow();paintTimer();
}

// The timer shows while it runs or while it is shown on the outputs. It turns amber in the last minute and red at 0.
function paintTimer(){
 const timer=stage?.timer,el=$('timer');
 if(!timer||!(timer.running||timer.visible)){el.hidden=true;return;}
 const value=timerValue(timer,Date.now()+clockOffset);
 el.hidden=false;el.textContent=formatTimer(value);
 el.classList.toggle('warn',timer.mode==='countdown'&&value>0&&value<=60000);
 el.classList.toggle('over',timer.mode==='countdown'&&value<=0);
}
function paintClock(){$('clock').textContent=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}

function connect(){
 const events=new EventSource(onRemote?'/remote/api/stage':'/stage/events');
 events.onmessage=ev=>{
  try{const next=JSON.parse(ev.data);clockOffset=next.serverNow-Date.now();stage=next;}catch{return;}
  $('connection').hidden=true;$('signin').hidden=true;paint();
 };
 events.onerror=async()=>{
  $('connection').hidden=false;
  // On the remote address a closed stream may mean this device is not signed in; the browser would retry forever.
  if(onRemote&&events.readyState===EventSource.CLOSED){
   const r=await fetch('/remote/api/stage',{method:'HEAD'}).catch(()=>null);
   if(r?.status===401){$('signin').hidden=false;return;}
   setTimeout(connect,3000);
  }else if(events.readyState===EventSource.CLOSED)setTimeout(connect,3000);
 };
}

setInterval(()=>{paintClock();paintTimer();},1000);
addEventListener('resize',fitNow);
paintClock();connect();
