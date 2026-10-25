import { personalize } from './personalization.js';
import { profiles, fireProfiles } from './research.js';
export { phones } from './catalog.js';
const labels = ['General','Red Dot','2× Scope','4× Scope','Sniper Scope','Free Camera Button'];
export const ENGINE_VERSION = 3;
// Editorial midpoints of cited community ranges. Not measured phone-specific calibration.
// RAM, display Hz and the model name do not establish an exact aim response.
export function recommend({fingers,dpi=false,brand,profile='balanced',ram='',hz='',previous=null,feedback={},calibration=null,deviceContext=null}) {
 const grip=Number(fingers);
 if(![2,3,4].includes(grip)||!Object.hasOwn(profiles,profile)||typeof dpi!=='boolean')throw new Error('Invalid setup');
 if(ram!==''&&![2,3,4,6,8,12,16,18,24].includes(Number(ram)))throw new Error('Invalid RAM');
 if(hz!==''&&![60,90,120,144,165,180,240].includes(Number(hz)))throw new Error('Invalid refresh rate');
 const selected=profiles[profile];
 return {
  version:ENGINE_VERSION,profile:selected.label,sourceIds:[1,5,6],
  ...personalize(labels.map((label,i)=>[label,Math.round((selected.ranges[i][0]+selected.ranges[i][1])/2)]),{previous,feedback,calibration,deviceContext}),
  ranges:selected.ranges.map(r=>[...r]),fireButton:fireProfiles[grip].start,fire:{...fireProfiles[grip]},
  dpi:dpi&&brand!=='Apple'?{mode:'keep-current',note:'Keep your original display density. We cannot verify a safe universal DPI number. Android “Smallest width” is measured in dp, not DPI; do not paste a DPI value there.'}:null
 };
}
export function tuneValue(result,index,direction) {
 if(!Number.isInteger(index)||index<0||index>5||![-1,1].includes(direction))throw new Error('Invalid adjustment');
 const next=structuredClone(result);
 next.values[index][1]=Math.max(0,Math.min(200,next.values[index][1]+5*direction));
 next.tuned=true;
 return next;
}
