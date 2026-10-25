import { recommend } from './engine.js';
import {validPrevious,cleanFeedback,cleanCalibration,cleanDeviceContext} from './personalization.js';
const safeString = v => typeof v === 'string' && v.length <= 100;
export function restoreSetup(raw) {
 if(!raw||!safeString(raw.brand)||!safeString(raw.model)||!raw.brand||!raw.model)return null;
 const setup={step:3,brand:raw.brand,model:raw.model,customBrand:safeString(raw.customBrand)?raw.customBrand:'',customModel:safeString(raw.customModel)?raw.customModel:'',ram:String(raw.ram??''),hz:String(raw.hz??''),dpi:raw.dpi===true&&raw.brand!=='Apple',fingers:Number(raw.fingers),profile:raw.profile??'balanced',query:'',previous:validPrevious(raw.previous)?[...raw.previous]:null,feedback:cleanFeedback(raw.feedback),calibration:cleanCalibration(raw.calibration),deviceContext:cleanDeviceContext(raw.deviceContext)};
 try{setup.result=recommend(setup);}catch{return null;}
 // Recalculate legacy outputs; only restore bounded user adjustments from this engine version.
 if(raw.result?.version===setup.result.version){
  if(Array.isArray(raw.result.values)&&raw.result.values.length===6&&raw.result.values.every(p=>Array.isArray(p)&&Number.isInteger(p[1])&&p[1]>=0&&p[1]<=200)){
   setup.result.values=setup.result.values.map(([label],i)=>[label,raw.result.values[i][1]]);
   setup.result.tuned=raw.result.tuned===true;
  }
  if(Number.isInteger(raw.result.fireButton)&&raw.result.fireButton>=10&&raw.result.fireButton<=100)setup.result.fireButton=raw.result.fireButton;
 }
 return setup;
}
