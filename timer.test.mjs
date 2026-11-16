// The shared timer: countdown, stopwatch, counting down to a time of day, running past zero, and how it looks near zero.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanTimer,timerSigned,timerValue,timerState,formatTimer,changeTimer,nextOccurrence,timerSummary} from './dist/timer.mjs';
import {graphicsTimerShown} from './dist/graphics.mjs';
import {stageState} from './dist/stage.mjs';

const at=(h,m,s=0)=>{const d=new Date(2026,10,22,0,0,0,0);d.setHours(h,m,s,0);return d.getTime();};

test('A time of day is today, unless it was more than 6 hours ago, then tomorrow',()=>{
 assert.equal(nextOccurrence('10:00',at(9,15)),at(10,0));
 assert.equal(nextOccurrence('10:00',at(10,5)),at(10,0),'5 minutes late still means today');
 assert.equal(nextOccurrence('08:00',at(21,0)),at(8,0)+24*3600000,'set the evening before: the next morning');
});

test('Counting down to a time of day follows the clock, and Start or Reset find the time again',()=>{
 const t=cleanTimer({mode:'until',untilTime:'10:00',targetAt:at(10,0)});
 assert.equal(t.running,true,'it always runs');
 assert.equal(timerValue(t,at(9,58,30)),90000);
 assert.equal(formatTimer(timerSigned(t,at(9,58,30))),'01:30');
 assert.equal(timerValue(t,at(10,2)),0,'stops at zero without overrun');
 const paused=changeTimer(t,'pause',at(9,59));
 assert.equal(paused.targetAt,at(10,0),'Pause does not stop the clock');
 const reset=changeTimer({...t,targetAt:0},'reset',at(9,0));
 assert.equal(reset.targetAt,at(10,0));
});

test('With overrun on, a countdown carries on below zero and shows the time over',()=>{
 const start=1_000_000;
 const t=changeTimer(cleanTimer({mode:'countdown',durationMs:60000,overrun:true}),'start',start);
 assert.equal(timerSigned(t,start+90000),-30000);
 assert.equal(timerValue(t,start+90000),0,'timerValue never goes below zero');
 assert.equal(formatTimer(timerSigned(t,start+90000)),'−00:30');
 assert.equal(formatTimer(timerSigned(t,start+60400)),'00:00','the first second past zero still reads 00:00');
 const paused=changeTimer(t,'pause',start+90000);
 assert.equal(paused.valueMs,-30000,'pausing keeps the time over');
 assert.equal(timerSigned(changeTimer(paused,'start',start+100000),start+101000),-31000,'and Start carries on from it');
 const noOverrun=changeTimer(cleanTimer({mode:'countdown',durationMs:60000}),'start',start);
 assert.equal(timerSigned(noOverrun,start+90000),0);
 assert.equal(cleanTimer({mode:'stopwatch',overrun:true}).overrun,false,'a stopwatch has no overrun');
});

test('Near zero the timer warns, at zero it has finished, and past zero it is over',()=>{
 const start=1_000_000,t=changeTimer(cleanTimer({mode:'countdown',durationMs:120000,overrun:true,warnMs:30000}),'start',start);
 assert.equal(timerState(t,start+60000),'');
 assert.equal(timerState(t,start+100000),'warning');
 assert.equal(timerState(t,start+120000),'expired');
 assert.equal(timerState(t,start+125000),'over');
 assert.equal(timerState({...t,warnMs:0},start+100000),'','a warning time of 0 turns the warning off');
 assert.equal(timerState(cleanTimer({mode:'stopwatch'}),start),'');
 assert.equal(cleanTimer({}).warnMs,60000,'one minute by default');
});

test('Old saved timers still work: the new fields get their defaults',()=>{
 const old={mode:'countdown',durationMs:300000,valueMs:300000,running:false,startedAt:0,visible:true,position:'top-left'};
 const t=cleanTimer(old);
 assert.deepEqual([t.mode,t.overrun,t.targetAt,t.untilTime,t.visible,t.position],['countdown',false,0,'10:00',true,'top-left']);
 assert.equal(cleanTimer({mode:'nonsense'}).mode,'countdown');
 assert.equal(cleanTimer({mode:'until',untilTime:'25:00'}).untilTime,'10:00','an impossible time falls back');
});

test('The graphics timer hides at zero only when it is not set to run over',()=>{
 const g={timer:{visible:true,hideAtZero:true}};
 assert.equal(graphicsTimerShown(g,{mode:'countdown'},0),false);
 assert.equal(graphicsTimerShown(g,{mode:'countdown',overrun:true},0),true);
 assert.equal(graphicsTimerShown(g,{mode:'until'},0),false);
});

test('Stage screens and phones get every field they need to tick the timer themselves',()=>{
 const timer=cleanTimer({mode:'until',untilTime:'10:30',targetAt:at(10,30),overrun:true,warnMs:120000,visible:true});
 const stage=stageState({slides:[],index:0,timer});
 assert.deepEqual(stage.timer,timerSummary(timer));
 assert.deepEqual(Object.keys(stage.timer).sort(),['durationMs','mode','overrun','running','startedAt','targetAt','untilTime','valueMs','visible','warnMs']);
 assert.equal(timerState(stage.timer,at(10,29)),'warning');
});
