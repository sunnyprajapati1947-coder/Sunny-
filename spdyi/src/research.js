export const REVIEWED = '25 Oct 2026';
export const sources = [
 {id:1,title:'Garena · April 2024 patch notes',url:'https://ff.garena.com/en/article/1332/',kind:'Official game information',note:'Confirms that the sensitivity cap was raised to 200. Does not recommend a perfect value.'},
 {id:2,title:'Garena · February 2025 patch notes',url:'https://ff.garena.com/en/article/1456',kind:'Official game information',note:'Explains the In-Match settings categories and one-unit sensitivity adjustments.'},
 {id:3,title:'Garena · OB50 patch notes',url:'https://ff.garena.com/en/article/1511/',kind:'Official game information',note:'Documents a shooting-sensitivity settings panel in the Training Grounds target range.'},
 {id:4,title:'Garena · OB52 patch notes',url:'https://ff.garena.com/en/article/1595/',kind:'Official game information',note:'Documents HUD recommendations under Settings > HUD and optional sensitivity sync for share codes.'},
 {id:5,title:'Cashify · Sensitivity guide',url:'https://www.cashify.in/best-free-fire-max-sensitivity-settings',kind:'Community starting ranges — not benchmarks',note:'We use only its 0–200 balanced and aggressive touch-sensitivity tables. Its other sections are not validated or used.'},
 {id:6,title:'The Click · Fire-button size guide',url:'https://www.theclick.gg/free-fire-max-fire-button-size-for-headshots/',kind:'Community HUD guidance — not an official standard',note:'Starting ranges: 44–50% for two fingers, 40–46% for three, 38–45% for four. Test size in small steps, without changing sensitivity at the same time.'},
 {id:7,title:'BlueStacks · Headshot settings guide',url:'https://www.bluestacks.com/blog/game-guides/free-fire-battlegrounds/ff-best-settings-for-headshots-en.html',kind:'Contrasting community advice',note:'Suggests a larger 50–70% fire button, unlike The Click. This disagreement is why our output is a test range, not a universal best setting.'},
 {id:8,title:'Device-models · Catalog source',url:'https://github.com/bsthen/device-models/tree/6712465438e3d9161b3b7a003accb688a1f8993f',kind:'Device names only · Apache-2.0',note:'Pinned community snapshot derived from the Google Play supported-device list. Filtered and deduplicated; includes some tablets and legacy devices. No RAM, refresh-rate or sensitivity benchmarks.'},
 {id:9,title:'Apple · Identify your iPhone model',url:'https://support.apple.com/en-us/108044',kind:'Manufacturer model-name reference',note:'Used for the manually curated iPhone-name list, not for sensitivity values or game compatibility.'},
 {id:10,title:'PixView · Display diagnostics reference',url:'https://github.com/Stefan-s-Android-Tools/PixView',kind:'MIT · design/API reference, no source copied',note:'Reviewed its read-only display reporting and separation of reported versus unavailable/estimated data. Not a sensitivity engine.'},
 {id:11,title:'abCheck · System diagnostics reference',url:'https://github.com/abanana84/abCheck',kind:'Apache-2.0 · design/API reference, no source copied',note:'Reviewed hardware/test module separation. Spdyi uses its own small permission-free diagnostics plugin; no Shizuku, hidden API tools or system writes.'},
 {id:12,title:'ANTAR · Dashboard reference',url:'https://github.com/ashokvarmamatta/ANTAR',kind:'Conceptual reference only · no source copied',note:'Reviewed the dashboard concept. License was not identified by GitHub metadata at review; no code/assets/dependencies from this project are bundled.'}
];
export const profiles = {
 balanced:{label:'Balanced',ranges:[[170,190],[165,185],[150,170],[140,160],[80,110],[120,150]]},
 fast:{label:'Fast / close-range',ranges:[[180,200],[175,195],[160,180],[150,170],[90,120],[140,170]]}
};
export const fireProfiles = {
 2:{min:44,max:50,start:47,placement:'Lower-right, under your right thumb. Leave clear space above the button for an upward drag.'},
 3:{min:40,max:46,start:43,placement:'Upper-left for a dedicated left index finger, or wherever your firing finger rests without stretching.'},
 4:{min:38,max:45,start:42,placement:'Near the upper corner reached by your dedicated firing finger. Keep scope and fire separated.'}
};
