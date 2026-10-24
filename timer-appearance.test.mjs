import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanTimer,changeTimer,timerValue,cleanTimerAppearance,timerAppearanceStyle} from './dist/timer.mjs';
test('Legacy timers keep their timing and get readable appearance defaults',()=>{
 const t=cleanTimer({mode:'countdown',durationMs:60000,valueMs:60000,running:true,startedAt:1000});
 assert.equal(t.fontSize,64);assert.equal(t.backgroundColor,'#08120d');assert.equal(t.backgroundOpacity,93);
 assert.equal(timerValue(t,11000),50000);
});
test('Custom timer appearance survives serialization and timer controls without restarting time',()=>{
 const t=cleanTimer({mode:'stopwatch',valueMs:5000,running:true,startedAt:1000,fontSize:120,textColor:'#123456',backgroundColor:'#ffeedd',backgroundOpacity:25,padding:30,radius:40,offsetX:80,offsetY:120});
 const restored=cleanTimer(JSON.parse(JSON.stringify(t)));
 assert.deepEqual(restored,t);assert.equal(timerValue(restored,6000),10000);
 const recolored=cleanTimer({...restored,backgroundColor:'#ff0000',fontSize:80});
 assert.equal(timerValue(recolored,6000),10000);assert.equal(recolored.startedAt,t.startedAt);
 for(const action of ['pause','reset','show','hide','start']){
  assert.deepEqual(cleanTimerAppearance(changeTimer(t,action,6000)),cleanTimerAppearance(t));
 }
});
test('Timer style honors transparent backgrounds and proportionate preview sizing',()=>{
 const style=timerAppearanceStyle({fontSize:100,textColor:'#123456',backgroundColor:'#102030',backgroundOpacity:0,padding:0,radius:0,offsetX:0,offsetY:0});
 assert.equal(style.backgroundColor,'rgba(16,32,48,0)');assert.equal(style.color,'#123456');assert.equal(style.padding,'0px 0px');
 assert.equal(style.borderRadius,'0px');assert.equal(style['--timer-offset-x'],'0px');
 assert.equal(timerAppearanceStyle({fontSize:100},0.6).fontSize,'60px');
});
test('Imported timer settings cannot inject CSS or use unbounded sizes',()=>{
 const t=cleanTimerAppearance({fontSize:99999,padding:-50,radius:Infinity,textColor:'red;position:fixed',backgroundColor:'url(https://evil.example)',backgroundOpacity:-1,offsetX:9999});
 assert.equal(t.fontSize,160);assert.equal(t.padding,0);assert.equal(t.radius,12);assert.equal(t.textColor,'#ffffff');assert.equal(t.backgroundColor,'#08120d');assert.equal(t.backgroundOpacity,0);assert.equal(t.offsetX,300);
});
