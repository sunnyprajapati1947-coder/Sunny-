import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recommend} from '../src/engine.js';
import {restoreSetup} from '../src/storage.js';
const base={brand:'Redmi',model:'Note 12',fingers:3,dpi:false,ram:'6',hz:'120',profile:'balanced'};
test('restores bounded tuned values and custom model names',()=>{
 const setup={...base,model:'Other',customModel:'My regional model',result:recommend(base)};setup.result.values[0][1]=170;setup.result.tuned=true;setup.result.fireButton=49;
 const restored=restoreSetup(setup);assert.equal(restored.customModel,setup.customModel);assert.equal(restored.result.values[0][1],170);assert.equal(restored.result.fireButton,49);
});
test('legacy results are recalculated with current research',()=>{
 const s=restoreSetup({...base,result:{values:[['General',200]],fireButton:52,dpi:{min:400,max:440}}});assert.deepEqual(s.result,recommend(base));
});
test('corrupted storage cannot inject result markup or out-of-range numbers',()=>{
 assert.equal(restoreSetup(null),null);assert.equal(restoreSetup({...base,fingers:9}),null);assert.equal(restoreSetup({...base,brand:{}}),null);
 const r=recommend(base);r.values[0]=['<script>',999];r.fireButton=-100;const s=restoreSetup({...base,result:r});assert.deepEqual(s.result.values,recommend(base).values);assert.equal(s.result.fireButton,43);
});
