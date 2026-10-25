import './style.css';
import {recommend,tuneValue} from './engine.js';
import {phones,brands,searchPhones} from './catalog.js';
import {sources,REVIEWED,profiles} from './research.js';
import {restoreSetup} from './storage.js';
import {mountDiagnostics,mountTouch,downloadJson} from './workbench.js';
import {validPrevious,cleanFeedback,cleanCalibration} from './personalization.js';
import {Capacitor} from '@capacitor/core';
const icon=(name,cls='')=>{const paths={bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-3 14h2"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',check:'<path d="m5 12 4 4L19 6"/>',shield:'<path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5l8-3Z"/><path d="m8 11 3 3 5-5"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',tune:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3v2m-1 3h.01"/>',copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>'};return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.target}</svg>`};
const spider=`<svg viewBox="0 0 80 90" fill="none" aria-hidden="true"><path d="M40 22v43m-6-38-12-9-6-15m29 24 13-9 6-15M32 35 15 29 3 14m45 21 17-6 12-15M32 44l-20 7L3 72m45-28 20 7 9 21M34 54 23 70l-3 18m26-34 11 16 3 18" stroke="currentColor" stroke-width="4"/><path d="m40 18 8 15-1 22-7 16-7-16-1-22Z" fill="currentColor"/></svg>`;
let state={step:1,brand:'',model:'',customBrand:'',customModel:'',query:'',ram:'',hz:'',dpi:false,fingers:2,profile:'balanced',result:null};
let scanToken=0;
let toolController=null;
let archive=[];try{archive=JSON.parse(localStorage.getItem('spdyi-profiles')||'[]').slice(0,10).map(restoreSetup).filter(Boolean);state.calibration=cleanCalibration(JSON.parse(localStorage.getItem('spdyi-touch-v1')||'null'));}catch{}
let saved=null;try{saved=restoreSetup(JSON.parse(localStorage.getItem('spdyi-setup')));}catch{}
let installPrompt;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
document.querySelector('#app').innerHTML=`
<aside class="sidebar"><a href="/" class="logo" aria-label="Spdyi home"><span class="logo-symbol">${spider}</span>spdyi<span class="logo-dot">.</span></a><div class="side-label">YOUR PLAY. YOUR RULES.</div><nav><button class="nav-item active" id="nav-generator" aria-label="Sensitivity lab">${icon('target')}<span>Sensitivity lab</span><i></i></button><button class="nav-item" id="nav-saved" aria-label="My saved setup">${icon('tune')}<span>My setup</span><span class="mini-tag">LOCAL</span></button><button class="nav-item" id="nav-diagnostics" aria-label="Device diagnostics">${icon('phone')}<span>Device scanner</span></button><button class="nav-item" id="nav-touch" aria-label="Touch calibration">${icon('bolt')}<span>Touch lab</span></button><button class="nav-item" id="nav-guide" aria-label="Aim guide">${icon('help')}<span>Aim guide</span></button><button class="nav-item mobile-install" aria-label="Install Spdyi app">${icon('download')}</button></nav><div class="sidebar-bottom"><div class="app-promo"><span class="promo-icon">${icon('download')}</span><h3>Your aim. On the go.</h3><p>Keep the lab in your pocket.</p><button class="install-button">Install app ${icon('arrow')}</button></div><div class="secure-label">${icon('shield')} No login. No game access.</div></div></aside>
<div class="page"><header><div class="breadcrumb">PLAY BETTER <span>/</span> SENSITIVITY LAB</div><div class="header-right"><span class="live-dot"></span> FREE FIRE MAX <span class="version">V.2.0</span></div></header>
<main><section class="intro"><div class="eyebrow"><span></span> BUILT FOR YOUR NEXT BOOYAH</div><h1>Good aim isn’t luck.<br>It’s <span>your setup.</span></h1><p>Your phone. Your playstyle. Your sensitivity.<br class="desktop-break"> Find a starting point that feels like you.</p><div class="hero-mark">${spider}</div><div class="web-art"></div></section>
<div class="workspace"><section class="lab-card" aria-label="Sensitivity setup"><div class="card-top"><div><span class="section-kicker">THE SENSITIVITY LAB · PRO</span><h2>Build your edge<span>.</span></h2></div><span class="step-counter">01 <span>/ 03</span></span></div><div class="steps"><div data-step="1" class="selected"><b>01</b><span>Your device</span></div><i></i><div data-step="2"><b>02</b><span>Your style</span></div><i></i><div data-step="3"><b>03</b><span>Your setup</span></div></div><div id="stage"></div></section>
<aside class="preview-column"><div class="device-preview"><div class="preview-top"><span class="live-dot"></span> DEVICE PROFILE <span class="preview-code">SP / 001</span></div><div class="phone-visual"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="crosshair c1">+</span><span class="crosshair c2">+</span><div class="phone-body"><div class="phone-notch"></div><div class="phone-screen">${spider}<span>MADE FOR<br><strong>YOUR AIM.</strong></span></div><div class="phone-home"></div></div><span class="device-chip">${icon('bolt')} PERSONALIZED</span></div><div class="preview-description"><h3 id="preview-name">Your device. Dialed in.</h3><p id="preview-detail">Select your phone to build your profile.</p></div><div class="preview-stats"><div><span>GAME</span><b>FF MAX</b></div><div><span>RANGE</span><b>0–200</b></div><div><span>MODE</span><b>Manual</b></div></div></div><div class="note">${icon('shield')}<p><b>Better settings. Zero shortcuts.</b><br>No mods, no scripts, no game access.<br>Just recommendations you control.</p></div></aside></div>
<section class="benefits"><div>${icon('phone')}<p><b>Device-aware</b><span>Find your model. Test your settings.</span></p></div><div>${icon('target')}<p><b>Your grip, your rules</b><span>2, 3 or 4 fingers. We adapt.</span></p></div><div>${icon('shield')}<p><b>No account required</b><span>No login or game integration</span></p></div></section>
<footer><span>© ${new Date().getFullYear()} Spdyi. Find your edge.</span><span>Independent fan tool. Not affiliated with Garena.</span><button id="about-button">How it works ${icon('arrow')}</button></footer></main></div><dialog id="info-dialog"><button class="close-dialog" aria-label="Close dialog">×</button><div id="dialog-content"></div></dialog><div id="toast" role="status"></div>`;
const stage=document.querySelector('#stage');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const option=(value,label,current)=>`<option value="${escape(value)}" ${String(current)===String(value)?'selected':''}>${escape(label)}</option>`;
function deviceName(){
 const brand=state.brand==='Other'?state.customBrand:state.brand;
 const model=state.model==='Other'?state.customModel:state.model;
 return `${brand} ${model}`.trim();
}
function updatePreview(){
 document.querySelector('#preview-name').textContent=deviceName()||'Your device. Dialed in.';
 document.querySelector('#preview-detail').textContent=state.model?`${state.ram?state.ram+' GB':'RAM not specified'} · ${state.hz?state.hz+' Hz':'Hz not specified'}`:'Select your phone to build your profile.';
}
function render(){
 scanToken++;toolController?.abort();
 document.querySelector('.card-top h2').innerHTML='Build your edge<span>.</span>';document.querySelector('.steps').hidden=false;document.querySelector('.step-counter').hidden=false;
 document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.id==='nav-generator'));
 document.querySelector('.step-counter').innerHTML=`0${state.step} <span>/ 03</span>`;
 document.querySelectorAll('[data-step]').forEach(e=>{e.classList.toggle('selected',Number(e.dataset.step)===state.step);e.classList.toggle('completed',Number(e.dataset.step)<state.step);});
 updatePreview();
 if(state.step===1)renderDevice();else if(state.step===2)renderStyle();else renderResult();
}
function renderDevice(){
 stage.innerHTML=`<div class="stage-heading"><span class="small-icon">${icon('phone')}</span><div><h3>First, what’s your device?</h3><p>Find your model, or add any phone manually.</p></div></div>
 <div class="catalog-banner"><span>${phones.length.toLocaleString('en-IN')} device names · ${brands.length} brands</span><button type="button" id="catalog-info">Catalog info ↗</button></div>
 <div class="lab-shortcuts"><button type="button" id="open-scanner">Read device info ↗</button><button type="button" id="open-touch">${state.calibration?'✓ Touch report attached':'Run touch calibration'} ↗</button></div>
 <form id="device-form">
 <div class="field-grid"><label>PHONE BRAND <select id="brand" required>${option('','Select brand',state.brand)}${brands.map(b=>option(b,b,state.brand)).join('')}${option('Other','Other brand / enter manually',state.brand)}</select></label>
 <label>FIND MODEL OR MODEL CODE <input type="search" id="model-search" placeholder="e.g. Note 13 or SM-A145F" value="${escape(state.query)}" ${!state.brand||state.brand==='Other'?'disabled':''} autocomplete="off" aria-describedby="model-count"></label></div>
 <label class="field-label model-label">PHONE MODEL <select id="model" required ${!state.brand?'disabled':''}></select></label><p class="model-count" id="model-count" role="status"></p>
 ${state.brand==='Other'?`<label class="field-label custom-label">YOUR PHONE BRAND <input id="custom-brand" required maxlength="80" placeholder="Enter brand" value="${escape(state.customBrand)}"></label>`:''}
 ${state.model==='Other'?`<label class="field-label custom-label">YOUR PHONE MODEL <input id="custom-model" required maxlength="80" placeholder="Enter your exact model" value="${escape(state.customModel)}"></label>`:''}
 <div class="field-grid specs"><label>RAM · OPTIONAL <select id="ram">${option('','Not sure',state.ram)}${[2,3,4,6,8,12,16,18,24].map(n=>option(n,`${n} GB`,state.ram)).join('')}</select></label><label>DISPLAY HZ · OPTIONAL <select id="hz">${option('','Not sure',state.hz)}${[60,90,120,144,165,180,240].map(n=>option(n,`${n} Hz`,state.hz)).join('')}</select></label></div>
 <div class="field-hint">${icon('help')} Names only, not a compatibility list. No hardware specs are guessed. RAM/Hz are saved for your reference, not used to claim exact sensitivity.</div>
 <div class="card-actions"><span>${icon('shield')} Your info stays on your device.</span><button class="primary" type="submit">Next: your playstyle ${icon('arrow')}</button></div></form>`;
 updateModelOptions();
 document.querySelector('#catalog-info').onclick=()=>showResearch(true);
 document.querySelector('#open-scanner').onclick=()=>openTool('diagnostics');document.querySelector('#open-touch').onclick=()=>openTool('touch');
 document.querySelector('#brand').onchange=e=>{state.brand=e.target.value;state.model='';state.customBrand='';state.customModel='';state.query='';state.dpi=false;render();};
 document.querySelector('#model-search').oninput=e=>{state.query=e.target.value;updateModelOptions();};
 document.querySelector('#model').onchange=e=>{state.model=e.target.value;state.query='';render();};
 for(const [id,key]of [['ram','ram'],['hz','hz'],['custom-brand','customBrand'],['custom-model','customModel']]){
  const el=document.querySelector('#'+id);if(el)el.oninput=e=>{state[key]=e.target.value;updatePreview();};
 }
 document.querySelector('#device-form').onsubmit=e=>{e.preventDefault();if(!state.brand||!state.model)return;if(state.brand==='Other'&&!state.customBrand.trim())return;if(state.model==='Other'&&!state.customModel.trim())return;state.step=2;render();};
}
function updateModelOptions(){
 const list=!state.brand||state.brand==='Other'?[]:searchPhones(state.brand,state.query);
 const selected=phones.find(p=>p.brand===state.brand&&p.model===state.model);
 const shown=[...list];if(selected&&!shown.some(p=>p.model===selected.model))shown.unshift(selected);
 document.querySelector('#model').innerHTML=option('','Select your model',state.model)+shown.map(p=>option(p.model,p.model,state.model)).join('')+option('Other','My model is missing / enter manually',state.model);
 document.querySelector('#model-count').textContent=!state.brand?'Choose a brand to search its models.':state.brand==='Other'?'Every phone can use manual entry. Game compatibility must be checked separately.':`${list.length.toLocaleString('en-IN')} matching names${state.query&&selected&&!list.includes(selected)?' · previously selected model kept':''}. Missing yours? Use manual entry below.`;
}
function renderStyle(){
 stage.innerHTML=`<div class="stage-heading"><span class="small-icon">${icon('tune')}</span><div><h3>Make it your playstyle.</h3><p>Your grip shapes the HUD. Your practice shapes your aim.</p></div></div><div class="field-label">HOW MANY FINGERS DO YOU PLAY WITH?</div><div class="grip-options">${[2,3,4].map(n=>`<button class="grip ${state.fingers===n?'chosen':''}" data-fingers="${n}" aria-pressed="${state.fingers===n}"><span>${n===2?'✌':n===3?'♧':'✥'}</span><b>${n} fingers</b><small>${n===2?'Classic':n===3?'Hybrid':'Claw'}</small>${state.fingers===n?icon('check'):''}</button>`).join('')}</div>
 <div class="field-label">CHOOSE A STARTING PROFILE</div><div class="profile-options">${Object.entries(profiles).map(([key,p])=>`<button class="profile-option ${state.profile===key?'chosen':''}" data-profile="${key}" aria-pressed="${state.profile===key}"><b>${p.label}</b><small>${key==='balanced'?'Start here for all-round play':'Faster turns; more control needed'}</small></button>`).join('')}</div>
 <div class="dpi-row"><div><h4>Include DPI guidance?</h4><p>${state.brand==='Apple'?'No Android-style DPI guidance on iPhone.':'Optional Android display-setting safety tips.'}</p></div><div class="segmented"><button data-dpi="false" class="${!state.dpi?'chosen':''}" aria-pressed="${!state.dpi}">No DPI</button><button data-dpi="true" class="${state.dpi?'chosen':''}" aria-pressed="${state.dpi}" ${state.brand==='Apple'?'disabled':''}>With DPI</button></div></div><p class="fine-print">${state.dpi?'There is no verified universal DPI for every phone. We recommend keeping your original setting; no automatic changes or made-up DPI number.':'Your current phone display settings stay unchanged.'}</p><div class="card-actions"><button class="text-button" id="back">← Back</button><button class="primary" id="generate">Build my sensitivity ${icon('bolt')}</button></div>`;
 document.querySelectorAll('[data-fingers]').forEach(b=>b.onclick=()=>{state.fingers=Number(b.dataset.fingers);render();});
 document.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>{state.profile=b.dataset.profile;render();});
 document.querySelectorAll('[data-dpi]').forEach(b=>b.onclick=()=>{state.dpi=b.dataset.dpi==='true';render();});
 document.querySelector('#back').onclick=()=>{state.step=1;render();};
 attachFeedbackForm();
 document.querySelector('#generate').onclick=()=>{if(state.previous?.some(v=>v!==null)&&!validPrevious(state.previous)){toast('Enter all six current values (0–200), or clear them to use a baseline.');return;}scan();};
}
function scan(){
 const token=++scanToken;
 stage.innerHTML=`<div class="scanning" role="status" aria-live="polite"><div class="scan-ring">${icon('target')}</div><span class="section-kicker">BUILDING YOUR BASELINE</span><h3>Preparing your starting setup…</h3><p>Combining your settings, feedback and available test evidence.</p><div class="scan-progress"><i></i></div><small>Setup animation only. No hardware scan or device benchmark.</small></div>`;
 setTimeout(()=>{if(token!==scanToken)return;state.result=recommend(state);state.step=3;render();},1800);
}
function renderResult(){
 const r=state.result;
 stage.innerHTML=`<div class="result-title"><span class="small-icon">${icon('check')}</span><div><h3>Your starting setup is ready.</h3><p>${escape(deviceName())} · ${state.fingers}-finger grip · ${r.profile}</p></div><span class="baseline-tag">${r.tuned?'SELF-TUNED':'BASELINE'}</span></div>
 <div class="evidence-banner">${icon('help')}<div><b>Research-informed, not device-tested</b><span>Community ranges, not official presets. Your phone name identifies the setup; it does not prove these values are perfect.</span></div></div>
 <div class="sensitivity-list">${r.values.map(([label,value],i)=>`<div class="sensitivity-row"><span>${label}<small class="range-caption">Start range ${r.ranges[i][0]}–${r.ranges[i][1]}</small></span><div class="value-track"><i style="width:${value/2}%"></i></div><strong>${value}</strong><small>/ 200</small></div>`).join('')}</div>
 <section class="fire-card" aria-label="Fire button recommendation"><div class="fire-card-top"><span class="fire-badge">${icon('target')}</span><div><span class="section-kicker">FIRE BUTTON · CUSTOM HUD</span><h3><span id="fire-value">${r.fireButton}</span><small>%</small> <em>starting range ${r.fire.min}–${r.fire.max}%</em></h3></div></div><p>${r.fire.placement}</p><div class="hud-sketch" aria-label="Illustrative button placement, not a HUD import code"><span class="hud-stick"></span><span class="hud-cross">+</span><span class="hud-fire ${state.fingers===2?'thumb':'index'}">FIRE</span><small>PLACEMENT SKETCH · NOT TO SCALE</small></div><div class="fire-adjust"><span>Missing taps? Try +2. Cramped drag? Try −2.</span><button id="fire-minus" aria-label="Reduce fire button size by 2">−2</button><button id="fire-plus" aria-label="Increase fire button size by 2">+2</button></div><small>In-game: Settings → HUD / Custom HUD → select fire → Size. Keep sensitivity fixed while testing size. Community guides disagree; this range is not a universal rule.</small></section>
 ${r.dpi?`<div class="dpi-note"><b>DPI: keep your original setting</b><p>${r.dpi.note}</p></div>`:''}
 <section class="tune-panel"><span class="field-label">TRAINING MODE · ONE SLIDER AT A TIME</span><div class="tune-controls"><label class="sr-only" for="tune-slider">Sensitivity to adjust</label><select id="tune-slider">${r.values.map(([label],i)=>option(i,label,0)).join('')}</select><button class="secondary" id="aim-high">Aim too high −5</button><button class="secondary" id="aim-low">Aim too low +5</button></div><p>Repeat the same weapon, distance and drag. These buttons edit your saved/copyable setup, never the game.</p><button class="text-button" id="reset-values">Reset sensitivity to starting values</button></section>
 <button class="sources-link" id="result-sources">${icon('help')} Sources & methodology · reviewed ${REVIEWED} ↗</button>
 <p class="result-disclaimer">No headshot guarantee. Apply manually on the 0–200 scale. Stabilize frame rate before tuning; more RAM or display Hz does not establish a universal sensitivity formula.</p><div class="card-actions result-actions"><button class="text-button" id="restart">← Edit setup</button><div><button class="secondary" id="copy">${icon('copy')} Copy</button><button class="primary" id="save">Save setup ${icon('check')}</button></div></div><button class="tuning-link" id="tuning">Read the training & HUD guide →</button>`;
 attachAdvancedResult();
 document.querySelector('#restart').onclick=()=>{state.step=1;render();};
 document.querySelector('#save').onclick=()=>{try{localStorage.setItem('spdyi-setup',JSON.stringify(state));saved=restoreSetup(state);archive=[saved,...archive].slice(0,10);localStorage.setItem('spdyi-profiles',JSON.stringify(archive));toast('Profile saved locally with comparison & feedback.');}catch{toast('Storage unavailable. Copy your setup instead.');}};
 document.querySelector('#copy').onclick=copySetup;
 for(const [id,delta] of [['fire-minus',-2],['fire-plus',2]])document.querySelector('#'+id).onclick=()=>{r.fireButton=Math.max(10,Math.min(100,r.fireButton+delta));document.querySelector('#fire-value').textContent=r.fireButton;toast(`Fire button: ${r.fireButton}%. Test in Custom HUD; save when ready.`);};
 for(const [id,direction]of [['aim-high',-1],['aim-low',1]])document.querySelector('#'+id).onclick=()=>{
  const index=Number(document.querySelector('#tune-slider').value);state.result=tuneValue(r,index,direction);renderResult();document.querySelector('#tune-slider').value=String(index);document.querySelector('#'+id).focus();toast(`${state.result.values[index][0]}: ${state.result.values[index][1]}. Apply in-game, then test.`);
 };
 document.querySelector('#reset-values').onclick=()=>{const fireButton=r.fireButton;state.result=recommend(state);state.result.fireButton=fireButton;renderResult();toast('Sensitivity reset. Fire-button size kept.');};
 document.querySelector('#result-sources').onclick=()=>showResearch();document.querySelector('#tuning').onclick=guide;
}
async function copySetup(){
 const r=state.result;
 const text=`Spdyi · ${deviceName()} · ${state.fingers} fingers · ${r.profile}\n${r.values.map(([k,v])=>`${k}: ${v} / 200`).join('\n')}\nFire button: ${r.fireButton}% (starting range ${r.fire.min}–${r.fire.max}%)\nPlacement: ${r.fire.placement}\nDPI: keep original\n${r.tuned?'Self-tuned values.':'Community baseline, not device-tested.'} No headshot guarantee. Apply manually and test in Training Grounds.\nEvidence: ${r.personalization.confidence} (not measured accuracy)\nSources reviewed: ${REVIEWED}\nSensitivity ranges: ${sources[4].url}\nFire button ranges: ${sources[5].url}`;
 try{await navigator.clipboard.writeText(text);toast('Setup and source links copied.');}catch{showDialog(`<h2>Copy your setup</h2><textarea readonly rows="14">${escape(text)}</textarea>`);}
}
function showResearch(catalogOnly=false){
 const selected=catalogOnly?sources.filter(s=>[8,9].includes(s.id)):sources;
 showDialog(`<span class="section-kicker">REVIEWED ${REVIEWED}</span><h2>${catalogOnly?'A bigger catalog. Honest limits.':'Research, not magic.'}</h2><p>${catalogOnly?`${phones.length.toLocaleString('en-IN')} unique names across ${brands.length} brands. Search by marketing name or model code. This is a filtered, pinned reference snapshot, not every phone ever made. Some tablets, duplicates across brands, regional naming differences or old devices may remain. Missing names can be entered manually. A listed name does not verify game compatibility.`:'Official sources verify game features, not the numbers generated here. Sensitivity values are rounded midpoints of the selected community touch-sensitivity range. Finger count selects a fire-button starting range. No measured per-phone testing has been performed.'}</p>
 ${!catalogOnly?`<div class="dialog-note">RAM, screen Hz and DPI are not used as an unverified conversion formula. We do not guess hardware specifications. Different phones can receive the same baseline; player-led training is what personalizes it. DPI guidance means safety information, not a made-up universal number.</div>`:''}
 <div class="source-list">${selected.map(s=>`<article><span>${s.kind}</span><a href="${s.url}" target="_blank" rel="noopener noreferrer">[${s.id}] ${s.title} ↗</a><p>${s.note}</p></article>`).join('')}</div><p>Sources are human-reviewed references, not a live lookup on each generation. Source pages need internet; the generator and bundled guidance work offline after a full visit. <a href="/licenses/device-models-Apache-2.0.txt" target="_blank" rel="noopener">Catalog license ↗</a></p>`);
}
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3500);}
function showDialog(html){document.querySelector('#dialog-content').innerHTML=html;document.querySelector('#info-dialog').showModal();}
function guide(){showDialog(`<span class="section-kicker">SMALL CHANGES. BETTER CONTROL.</span><h2>Find your sweet spot.</h2><ol class="guide-list"><li><b>Stabilize performance first.</b><p>Use a graphics/frame-rate setting your phone can sustain without overheating. Display refresh rate is not measured game FPS.</p></li><li><b>Record your original settings.</b><p>Apply a baseline in Settings → In-Match → Sensitivity. Use the same weapon, attachments, distance and drag in Training Grounds.</p></li><li><b>Tune one scope at a time.</b><p>Overshooting? Reduce only that slider by 5. Stopping short? Increase by 5. Repeat several attempts before judging. Don’t change DPI at the same time.</p></li><li><b>Test fire-button size separately.</b><p>Use the size and placement on your result card. Keep sensitivity fixed. Try 20 shots: if presses miss, increase size by 2; if space feels cramped, reduce by 2 or adjust placement. Favor comfortable reach over a copied percentage.</p></li><li><b>Try Garena’s in-game alternatives.</b><p>Official OB52 notes document Settings → HUD recommendations and optional sensitivity sync with share codes. Spdyi does not invent HUD import codes.</p></li></ol><div class="dialog-note">Android “Smallest width” uses dp, not DPI. Keep your original display setting; there is no verified universal number here. No scripts, game access or automatic headshots.</div><button class="sources-link" id="guide-sources">View research & source links ↗</button>`);document.querySelector('#guide-sources').onclick=()=>showResearch();}
document.querySelector('#nav-guide').onclick=guide;
document.querySelector('#nav-diagnostics').onclick=()=>openTool('diagnostics');
document.querySelector('#nav-touch').onclick=()=>openTool('touch');
document.querySelector('#nav-generator').onclick=()=>{state.step=1;render();};
document.querySelector('#nav-saved').onclick=()=>{if(saved){state=structuredClone(saved);render();toast('Saved setup loaded.');}else toast('No saved setup yet. Build one and tap Save setup.');};
document.querySelector('.close-dialog').onclick=()=>document.querySelector('#info-dialog').close();
document.querySelector('#info-dialog').onclick=e=>{if(e.target===e.currentTarget)e.currentTarget.close();};
document.querySelector('#about-button').textContent='Research & sources ↗';document.querySelector('#about-button').onclick=()=>showResearch();
async function installApp(){if(installPrompt){await installPrompt.prompt();installPrompt=null;}else showDialog(`<span class="section-kicker">TAKE YOUR SETUP WITH YOU</span><h2>Install Spdyi.</h2><p><b>Android / Chrome:</b> Open the browser menu → Install app / Add to Home screen.</p><p><b>iPhone / Safari:</b> Share → Add to Home Screen.</p><p>Requires HTTPS and browser support. Open the published site directly if the embedded preview cannot install. This is a PWA, not a native APK. Full first load is required for offline use.</p>`);}

function openTool(kind){
 scanToken++;toolController?.abort();toolController=new AbortController();
 document.querySelector('.card-top h2').innerHTML=kind==='touch'?'Touch lab<span>.</span>':'Device intelligence<span>.</span>';
 document.querySelector('.steps').hidden=true;document.querySelector('.step-counter').hidden=true;
 document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.id===`nav-${kind}`));
 const common={signal:toolController.signal,toast};
 if(kind==='diagnostics')mountDiagnostics(stage,{...common,onApply:n=>{
  const match=brands.find(b=>b.toLowerCase()===String(n.manufacturer).toLowerCase());
  state.brand=match||'Other';state.customBrand=match?'':String(n.manufacturer).slice(0,80);state.model='Other';state.customModel=String(n.model).slice(0,80);state.query='';state.step=1;state.dpi=false;render();toast('System model copied. Verify the model / variant before continuing.');
 }});
 else mountTouch(stage,{...common,onSave:report=>{
  state.calibration=cleanCalibration(report);try{localStorage.setItem('spdyi-touch-v1',JSON.stringify(state.calibration));}catch{}state.step=state.brand&&state.model?2:1;render();toast('Touch consistency report attached. No hardware latency claim.');
 }});
}
function attachFeedbackForm(){
 state.feedback=cleanFeedback(state.feedback);const f=state.feedback;
 const html=`<section class="feedback-form"><div class="field-label">GAMEPLAY PROFILE · YOUR REAL EXPERIENCE</div><div class="feedback-grid"><label>FIGHT PREFERENCE<select id="fight-range">${[['mixed','Mixed / all-round'],['close','Close range'],['long','Long range']].map(([v,l])=>option(v,l,f.range)).join('')}</select></label><label>AIM BEHAVIOUR<select id="aim-issue">${[['none','No repeated issue'],['overshoot','Aim goes above target'],['shortfall','Aim stops below target']].map(([v,l])=>option(v,l,f.issue)).join('')}</select></label><label>WHICH SLIDER?<select id="feedback-scope">${['General','Red Dot','2× Scope','4× Scope','Sniper Scope','Free Camera Button'].map((l,i)=>option(i,l,f.scope)).join('')}</select></label><label>DRAG FEEL<select id="drag-feel">${[['normal','Comfortable / not sure'],['fast','Too fast'],['slow','Too slow']].map(([v,l])=>option(v,l,f.drag)).join('')}</select></label><label>REPEATED SHOTS TESTED<input id="shot-count" type="number" inputmode="numeric" min="0" max="100" value="${f.attempts}"></label></div><p class="tool-footnote">Feedback proposes one small change to one slider. Shot count is self-reported; the app cannot see your game.</p><div class="calibration-attached">${state.calibration?`✓ ${state.calibration.count} swipe trials attached · ${(state.calibration.variation*100).toFixed(1)}% speed CV`:'No touch test yet — recommendations will show limited evidence.'}<button id="calibrate-now" type="button">${state.calibration?'Retest':'Open Touch lab'} ↗</button></div>
 <details class="previous-details" ${state.previous?'open':''}><summary>Your current sensitivity · optional</summary><p>Enter all six values from your game (0–200). Your screenshot example can be loaded below; it is an example, not an official preset.</p><div class="previous-grid">${['General','Red Dot','2×','4×','Sniper','Free Camera'].map((l,i)=>`<label>${l}<input data-previous="${i}" type="number" min="0" max="200" inputmode="numeric" placeholder="0–200" value="${state.previous?.[i]??''}"></label>`).join('')}</div><div class="example-actions"><button id="load-screenshot" type="button">Use your screenshot example</button><button id="clear-previous" type="button">Clear current values</button></div></details></section>`;
 document.querySelector('.dpi-row').insertAdjacentHTML('beforebegin',html);
 for(const [id,key]of [['fight-range','range'],['aim-issue','issue'],['feedback-scope','scope'],['drag-feel','drag'],['shot-count','attempts']])document.querySelector('#'+id).onchange=e=>{const n=Number(e.target.value);state.feedback[key]=['scope','attempts'].includes(key)?(Number.isInteger(n)?Math.max(0,Math.min(key==='scope'?5:100,n)):0):e.target.value;};
 document.querySelectorAll('[data-previous]').forEach(el=>el.oninput=()=>{state.previous??=Array(6).fill(null);const n=Number(el.value);state.previous[Number(el.dataset.previous)]=el.value!==''&&Number.isInteger(n)&&n>=0&&n<=200?n:null;});
 document.querySelector('#calibrate-now').onclick=()=>openTool('touch');
 document.querySelector('#load-screenshot').onclick=()=>{state.previous=[145,140,125,105,75,100];render();};
 document.querySelector('#clear-previous').onclick=()=>{state.previous=null;render();};
}
function attachAdvancedResult(){
 const r=state.result,p=r.personalization;
 document.querySelector('.sensitivity-list').insertAdjacentHTML('beforebegin',`<section class="confidence-card"><span>EVIDENCE LEVEL · NOT AIM ACCURACY</span><h4>${escape(p.confidence)}</h4><p>${escape(p.evidence)}</p><details><summary>Why these settings?</summary><ul>${p.reasons.map(t=>`<li>${escape(t)}</li>`).join('')}</ul></details></section>`);
 document.querySelector('.fire-card').insertAdjacentHTML('beforebegin',`<section class="comparison-card"><div class="field-label">${p.hasPrevious?'YOUR CURRENT → SUGGESTED':'BASELINE → SUGGESTED'} · 0–200</div><div class="chart-key"><span>Before</span><span>Suggested</span></div>${r.values.map(([label,value],i)=>`<div class="compare-row"><span>${label}</span><div><i style="width:${r.before[i]/2}%"></i><b style="width:${value/2}%"></b></div><small>${r.before[i]} → <strong>${value}</strong></small></div>`).join('')}<p>Only self-reported feedback changes a trial value. Diagnostics explain limits; model, resolution and Hz are not an unverified sensitivity multiplier.</p></section>`);
 document.querySelector('.result-actions').insertAdjacentHTML('beforebegin',`<div class="profile-tools"><button id="profile-history">Saved profiles (${archive.length}) ↗</button><button id="export-profile">Export profile JSON ↗</button></div>`);
 document.querySelector('#profile-history').onclick=showProfiles;
 document.querySelector('#export-profile').onclick=()=>downloadJson({...state,app:'Spdyi',exportedAt:new Date().toISOString()},'spdyi-profile.json');
}
function showProfiles(){
 showDialog(`<span class="section-kicker">LOCAL PROFILE VAULT</span><h2>Keep what works.</h2><p>Up to 10 recent saves on this device. Profiles include starting/current values, feedback and your touch-consistency summary. Nothing is uploaded.</p><div class="profile-list">${archive.length?archive.map((p,i)=>`<article><div><b>${escape(p.brand==='Other'?p.customBrand:p.brand)} ${escape(p.model==='Other'?p.customModel:p.model)}</b><span>${p.fingers} fingers · ${p.result.profile} · fire ${p.result.fireButton}%</span></div><button data-load-profile="${i}">Load</button></article>`).join(''):'<p>No archived profiles yet. Save one after testing.</p>'}</div><button class="secondary" id="erase-local">Delete my local profiles & calibration</button>`);
 document.querySelectorAll('[data-load-profile]').forEach(b=>b.onclick=()=>{state=structuredClone(archive[Number(b.dataset.loadProfile)]);document.querySelector('#info-dialog').close();render();});
 document.querySelector('#erase-local').onclick=()=>{if(!confirm('Delete saved profiles and touch calibration from this device?'))return;try{for(const key of ['spdyi-profiles','spdyi-setup','spdyi-touch-v1'])localStorage.removeItem(key);}catch{toast('Browser storage could not be cleared. Use browser site settings.');return;}archive=[];saved=null;state.calibration=null;document.querySelector('#info-dialog').close();render();toast('Local profiles and calibration deleted. Current unsaved values remain.');};
}
document.querySelectorAll('.install-button, .mobile-install').forEach(button=>button.onclick=installApp);
render();
if('serviceWorker' in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform()){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}
