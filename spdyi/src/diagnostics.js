import {Capacitor, registerPlugin} from '@capacitor/core';
const NativeDiagnostics=registerPlugin('SpdyiDiagnostics');
export const nativeAndroid=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';
export async function collectDiagnostics() {
 const s=globalThis.screen,n=globalThis.navigator;
 const report={version:1,at:new Date().toISOString(),environment:nativeAndroid()?'Android app':'Browser / PWA',
  browser:{screenCss:[s.width,s.height],viewportCss:[innerWidth,innerHeight],dpr:devicePixelRatio||1,logicalCores:n.hardwareConcurrency??null,memoryBucketGB:n.deviceMemory??null,maxTouchPoints:n.maxTouchPoints??null},native:null};
 if(nativeAndroid()){
  try{report.native=await NativeDiagnostics.snapshot();}catch{report.nativeError='Android snapshot unavailable. Browser-level details are shown instead.';}
 }
 if(n.storage?.estimate){try{const e=await n.storage.estimate();report.siteStorage={quota:e.quota??null,usage:e.usage??null};}catch{}}
 return report;
}
export function summarizeFrames(times) {
 const intervals=times.slice(1).map((t,i)=>t-times[i]).filter(v=>Number.isFinite(v)&&v>0&&v<1000);
 if(intervals.length<30)return null;
 const sorted=[...intervals].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
 return {samples:intervals.length,medianMs:median,p95Ms:sorted[Math.floor(sorted.length*.95)],observedHz:1000/median,longFramePercent:100*intervals.filter(v=>v>median*1.5).length/intervals.length};
}
export function measureFrames(signal,duration=2200) {
 return new Promise((resolve,reject)=>{
  const times=[];let raf;
  const cleanup=()=>{cancelAnimationFrame(raf);clearTimeout(timer);signal?.removeEventListener('abort',abort);document.removeEventListener('visibilitychange',hidden);};
  const abort=()=>{cleanup();reject(new Error('Measurement canceled. Keep the app visible and try again.'));};
  const hidden=()=>{if(document.hidden)abort();};
  const frame=t=>{times.push(t);if(times.length>1&&t-times[0]>=duration){const report=summarizeFrames(times);cleanup();resolve(report);}else raf=requestAnimationFrame(frame);};
  const timer=setTimeout(abort,duration+4000);
  signal?.addEventListener('abort',abort,{once:true});document.addEventListener('visibilitychange',hidden);
  if(signal?.aborted)return abort();raf=requestAnimationFrame(frame);
 });
}
export function summarizeSwipes(swipes,maxPointers=0,cells=[]) {
 const valid=swipes.filter(s=>Number.isFinite(s.duration)&&s.duration>=60&&s.duration<=5000&&Number.isFinite(s.distance)&&s.distance>=40&&Number.isFinite(s.pathLength)&&s.pathLength>=s.distance&&Number.isFinite(s.width)&&s.width>0);
 const speeds=valid.map(s=>s.distance/s.width/(s.duration/1000));
 const mean=speeds.reduce((a,b)=>a+b,0)/(speeds.length||1);
 const cv=mean?Math.sqrt(speeds.reduce((sum,v)=>sum+(v-mean)**2,0)/(speeds.length||1))/mean:null;
 return {version:1,at:new Date().toISOString(),count:valid.length,maxPointers,cells:[...new Set(cells)].filter(n=>Number.isInteger(n)&&n>=0&&n<9),meanWidthsPerSecond:mean||null,variation:cv,straightness:valid.length?valid.reduce((a,s)=>a+s.distance/s.pathLength,0)/valid.length:null,ready:valid.length>=5};
}
export function validTouchReport(r) {
 return !!r&&r.version===1&&Number.isInteger(r.count)&&r.count>=5&&r.count<=12&&Number.isFinite(r.variation)&&r.variation>=0&&r.variation<=10&&Number.isFinite(r.meanWidthsPerSecond)&&r.meanWidthsPerSecond>0&&Array.isArray(r.cells)&&r.cells.every(n=>Number.isInteger(n)&&n>=0&&n<9);
}
