export function cleanDeviceContext(d) {
 if(!d||!['Android system API','Browser CSS / rAF'].includes(d.source))return null;
 const bounded=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max?n:null;
 return {source:d.source,width:bounded(d.width,1,20000),height:bounded(d.height,1,20000),displayHz:bounded(d.displayHz,1,1000),dpr:bounded(d.dpr,.1,20),frameHz:bounded(d.frameHz,1,1000),lowMemory:d.lowMemory===true};
}
export function validPrevious(values) {return Array.isArray(values)&&values.length===6&&values.every(n=>Number.isInteger(n)&&n>=0&&n<=200);}
export function cleanFeedback(f={}) {
 const issue=['none','overshoot','shortfall'].includes(f.issue)?f.issue:'none';
 const drag=['normal','fast','slow'].includes(f.drag)?f.drag:'normal';
 return {issue,drag,scope:Number.isInteger(f.scope)&&f.scope>=0&&f.scope<6?f.scope:0,attempts:Number.isInteger(f.attempts)?Math.max(0,Math.min(100,f.attempts)):0,range:['mixed','close','long'].includes(f.range)?f.range:'mixed'};
}
export function cleanCalibration(r) {
 if(!r||r.version!==1||!Number.isInteger(r.count)||r.count<5||r.count>12||!Number.isFinite(r.variation)||r.variation<0||r.variation>10)return null;
 return {version:1,count:r.count,variation:r.variation,meanWidthsPerSecond:Number.isFinite(r.meanWidthsPerSecond)&&r.meanWidthsPerSecond>0?r.meanWidthsPerSecond:null,cells:Array.isArray(r.cells)?r.cells.filter(n=>Number.isInteger(n)&&n>=0&&n<9):[],maxPointers:Number.isInteger(r.maxPointers)?Math.max(0,Math.min(20,r.maxPointers)):0};
}
export function personalize(values,{previous,feedback,calibration,deviceContext}={}) {
 const f=cleanFeedback(feedback),touch=cleanCalibration(calibration),hasPrevious=validPrevious(previous);
 const device=cleanDeviceContext(deviceContext);
 const before=hasPrevious?[...previous]:values.map(([,n])=>n);
 const output=values.map(([label],i)=>[label,before[i]]),reasons=[];
 if(hasPrevious)reasons.push('Anchored to the six current settings you entered, not a guessed model preset.');
 else reasons.push('Starting from the selected community-range midpoints. No per-model game benchmark exists here.');
 if(device){reasons.push(`Device context: ${device.width??'unknown'}×${device.height??'unknown'} ${device.source==='Android system API'?'system px':'CSS px'}${device.displayHz?', '+device.displayHz.toFixed(1)+' Hz reported':''}${device.frameHz?', '+device.frameHz.toFixed(1)+' Hz app callback estimate':''}. Used to describe your test context, not as a fabricated sensitivity multiplier.`);if(device.lowMemory)reasons.push('Android reported low memory. Stabilize performance and repeat the same in-game trial before trusting a change.');}
 let step=touch&&touch.variation>.45?3:5;
 if(touch){reasons.push(`${touch.count} swipe trials recorded. ${touch.variation>.45?'Uneven swipe speeds: using a smaller 3-point trial step.':'Normal 5-point trial step retained.'} Touch statistics do not measure game aim or hardware latency.`);}
 const direction=f.issue==='overshoot'?-1:f.issue==='shortfall'?1:f.drag==='fast'?-1:f.drag==='slow'?1:0;
 if(direction){output[f.scope][1]+=direction*step;reasons.push(`${output[f.scope][0]} ${direction>0?'+':'−'}${step}: ${f.issue!=='none'?f.issue==='overshoot'?'you reported overshooting':'you reported stopping short':`you reported ${f.drag} drag`}. Apply and repeat in-game; this is a trial, not a measured conversion.`);}
 // Range preference is guidance, not an unvalidated additive correction to all scopes.
 if(f.range==='long')reasons.push('Long-range focus: test 4× and Sniper separately at a fixed distance. No automatic across-the-board boost.');
 if(f.range==='close')reasons.push('Close-range focus: test General / Red Dot with your usual short drag.');
 output.forEach(pair=>pair[1]=Math.max(0,Math.min(200,pair[1])));
 const confidence=direction&&hasPrevious&&f.attempts>=20&&touch?'Repeat-tested input':direction&&hasPrevious?'Feedback-guided':'Limited · starting point';
 return {values:output,before,personalization:{confidence,step,hasPrevious,deviceContext:device,feedback:f,calibration:touch,reasons,evidence:'Input completeness, not an accuracy percentage. Spdyi has not observed your in-game shots.'}};
}
