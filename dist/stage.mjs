// What the stage display shows: the slide on screen, the next slide, the timer and the operator's message.
// It is built on the laptop from the live screen, so the local stage page and every tablet show the same thing,
// and a stage screen never receives more than it needs.
import {cleanTimer} from './timer.mjs';

const clip=(value,length)=>String(value??'').slice(0,length);

// A short name for a slide: the song section ("Chorus 1"), the Bible reference and version, or the slide's heading.
function slideLabel(slide){
 if(slide.song)return slide.song.section||slide.song.title||'';
 if(slide.type==='passage'||slide.type==='study')return [slide.reference,slide.translation].filter(Boolean).join(' · ');
 return slide.heading||slide.title||'';
}
// The words a singer or preacher needs to read. A word study shows its word and explanation.
function slideText(slide){
 if(slide.type==='study')return [slide.note?.word,slide.note?.meaning].filter(Boolean).join(': ')||slide.text;
 if(slide.type==='text'&&!slide.song)return [slide.heading,slide.subtitle,slide.text].filter(Boolean).join('\n');
 return slide.text;
}
function stageSlide(slide){
 if(!slide)return null;
 return {label:clip(slideLabel(slide),120),text:clip(slideText(slide),3000),second:clip(slide.second?.text,3000)};
}

// message: {text, at} set from the studio, or null. serverNow lets each screen correct its own clock for the timer.
export function stageState(live,message=null){
 const slides=Array.isArray(live?.slides)?live.slides:[];
 const index=Number.isInteger(live?.index)?live.index:0;
 const timer=cleanTimer(live?.timer);
 return {
  updated:Number(live?.updated)||0,
  blank:!!live?.blank,
  title:clip(live?.showTitle,100),
  position:slides.length?(index+1)+' / '+slides.length:'',
  current:stageSlide(slides[index]),
  next:stageSlide(slides[index+1]),
  timer:{mode:timer.mode,durationMs:timer.durationMs,valueMs:timer.valueMs,running:timer.running,startedAt:timer.startedAt,visible:timer.visible},
  message:message?.text?{text:clip(message.text,200),at:Number(message.at)||0}:null,
  serverNow:Date.now()
 };
}

// The operator's message: plain text, one or two short lines. An empty message clears it.
export function cleanStageMessage(text){
 return String(text??'').replace(/\s+/g,' ').trim().slice(0,200);
}
