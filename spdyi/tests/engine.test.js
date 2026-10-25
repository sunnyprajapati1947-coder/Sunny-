import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recommend,tuneValue} from '../src/engine.js';
import {profiles,fireProfiles} from '../src/research.js';
const base={fingers:2,dpi:false,brand:'Samsung',profile:'balanced'};
test('midpoints stay in the cited 0–200 community ranges',()=>{
 for(const profile of Object.keys(profiles))for(const fingers of [2,3,4])for(const dpi of [false,true]){
  const r=recommend({...base,profile,fingers,dpi});assert.equal(r.values.length,6);
  r.values.forEach(([,v],i)=>{const [min,max]=profiles[profile].ranges[i];assert.equal(v,Math.round((min+max)/2));assert.ok(v>=0&&v<=200);});
  assert.deepEqual(r.fire,fireProfiles[fingers]);assert.ok(r.fireButton>=r.fire.min&&r.fireButton<=r.fire.max);
 }
});
test('model, RAM and screen Hz do not pretend to establish a calibrated aim response',()=>{
 assert.deepEqual(recommend({...base,model:'Galaxy A14',ram:4,hz:60}),recommend({...base,model:'Galaxy S25',ram:12,hz:120}));
 assert.deepEqual(recommend({...base,dpi:true}).values,recommend(base).values);
 assert.deepEqual(recommend({...base,fingers:4}).values,recommend(base).values);
});
test('DPI guidance contains no invented universal numeric DPI',()=>{const r=recommend({...base,dpi:true});assert.equal(r.dpi.mode,'keep-current');assert.equal(r.dpi.min,undefined);assert.match(r.dpi.note,/dp, not DPI/);});
test('Apple does not get Android DPI guidance',()=>assert.equal(recommend({...base,brand:'Apple',dpi:true}).dpi,null));
test('all grips have a fire-button percentage, range and placement',()=>{for(const fingers of [2,3,4]){const r=recommend({...base,fingers});assert.ok(r.fire.placement.length>20);assert.ok(r.fireButton>=r.fire.min&&r.fireButton<=r.fire.max);}});
test('invalid inputs rejected',()=>{
 for(const patch of [{fingers:5},{ram:0},{hz:NaN},{profile:'__proto__'},{profile:'made-up'},{dpi:'yes'}])assert.throws(()=>recommend({...base,...patch}));
});
test('tuning moves only the selected slider and does not mutate the source',()=>{
 const r=recommend(base),before=structuredClone(r),next=tuneValue(r,2,-1);
 assert.deepEqual(r,before);assert.equal(next.values[2][1],r.values[2][1]-5);assert.equal(next.tuned,true);
 for(const i of [0,1,3,4,5])assert.deepEqual(next.values[i],r.values[i]);
});
test('tuning clamps to game range and rejects invalid adjustments',()=>{
 const r=recommend(base);r.values[0][1]=199;assert.equal(tuneValue(r,0,1).values[0][1],200);r.values[0][1]=1;assert.equal(tuneValue(r,0,-1).values[0][1],0);
 assert.throws(()=>tuneValue(r,6,1));assert.throws(()=>tuneValue(r,0,3));
});
