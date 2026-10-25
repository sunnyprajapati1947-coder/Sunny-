import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recommend} from '../src/engine.js';
import {summarizeFrames,summarizeSwipes,validTouchReport} from '../src/diagnostics.js';
import {validPrevious,cleanCalibration} from '../src/personalization.js';
import {restoreSetup} from '../src/storage.js';
const previous=[145,140,125,105,75,100],base={brand:'Redmi',model:'Note 12',fingers:3,previous};
test('uses 0–200 screenshot values as user inputs, not an official preset',()=>{
 const r=recommend({...base,feedback:{issue:'overshoot',scope:0,attempts:20}});
 assert.deepEqual(r.before,previous);assert.equal(r.values[0][1],140);assert.deepEqual(r.values.slice(1).map(p=>p[1]),previous.slice(1));assert.match(r.personalization.confidence,/Feedback-guided/);
});
test('high variation reduces trial step, not a fake touch-latency conversion',()=>{
 const r=recommend({...base,feedback:{issue:'shortfall',scope:2,attempts:20},calibration:{version:1,count:5,variation:.6}});
 assert.equal(r.values[2][1],128);assert.equal(r.personalization.step,3);assert.equal(r.personalization.confidence,'Repeat-tested input');
});
test('stable swipe calibration preserves 5-point step and input-completeness confidence',()=>{
 const r=recommend({...base,feedback:{issue:'shortfall',scope:0,attempts:20},calibration:{version:1,count:5,variation:.2}});assert.equal(r.values[0][1],150);assert.equal(r.personalization.step,5);
});
test('no automatic model, DPI or resolution multiplier',()=>{const a=recommend(base),b=recommend({...base,hz:120,ram:12,model:'Flagship',dpi:true});assert.deepEqual(a.values,b.values);});
test('prevents invalid / partial current values and clamp trials',()=>{
 assert.equal(validPrevious([1,2,3]),false);assert.equal(validPrevious([0,0,0,0,0,201]),false);
 assert.equal(recommend({...base,previous:[200,200,200,200,200,200],feedback:{issue:'shortfall',scope:0}}).values[0][1],200);
 assert.equal(recommend({...base,previous:[0,0,0,0,0,0],feedback:{issue:'overshoot',scope:0}}).values[0][1],0);
 assert.equal(cleanCalibration({version:1,count:50,variation:.3}),null);
});
test('frame report describes callback intervals',()=>{
 const frames=summarizeFrames(Array.from({length:121},(_,i)=>i*1000/60));assert.equal(frames.samples,120);assert.ok(Math.abs(frames.observedHz-60)<.001);assert.equal(frames.longFramePercent,0);assert.equal(summarizeFrames([0,16]),null);
});
test('swipe report requires 5 qualifying trials and computes normalized speed',()=>{
 const trial={distance:100,pathLength:110,width:400,duration:200};
 const r=summarizeSwipes(Array.from({length:5},()=>trial),3,[0,1,1,8,99]);
 assert.equal(r.ready,true);assert.equal(r.meanWidthsPerSecond,1.25);assert.equal(r.variation,0);assert.deepEqual(r.cells,[0,1,8]);assert.equal(r.maxPointers,3);assert.equal(validTouchReport(r),true);
 assert.equal(summarizeSwipes([{...trial,duration:0}]).ready,false);
});
test('advanced profile restores feedback, old/new comparison, and bounded tuning',()=>{
 const input={...base,feedback:{issue:'overshoot',scope:1,attempts:20},calibration:{version:1,count:5,variation:.3}};
 const r=recommend(input);r.values[0][1]=150;r.tuned=true;
 const s=restoreSetup({...input,result:r});assert.deepEqual(s.previous,previous);assert.equal(s.result.values[0][1],150);assert.equal(s.result.values[1][1],135);assert.equal(s.result.before[1],140);assert.equal(s.calibration.count,5);
});
