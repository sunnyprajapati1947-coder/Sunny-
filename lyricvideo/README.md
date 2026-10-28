# 🎬 Lyric Video Kit

Apna gaana + lyrics daalo → **watercolour animated lyric video** (1920×1080, 24 fps) nikal aayega.
Sab kuch code se paint hota hai (p5.js + p5.brush) — koi video editor nahi chahiye.

Engine [JohnHeibel/PDoomVideo](https://github.com/JohnHeibel/PDoomVideo) (ISC) se adapt kiya gaya hai aur
generalise kar diya gaya hai taaki koi bhi gaana lag sake. Hindi (Devanagari) text support hai.

---

## Jaldi se shuru

```bash
cd lyricvideo
npm install
python3 -m http.server 8080      # phir browser me http://localhost:8080 kholo
```

### 1. Gaana daalo
Apni mp3 ko yahan rakho: `assets/song.mp3`

### 2. Lyrics time karo
`timing.html` kholo:
- Lyrics paste karo (ek line per row) → **Lines load karo**
- Gaana play karo, aur **har line shuru hote hi `Space` dabao**
- `B` baar baar dabao → BPM mil jayega
- **Copy lyrics array** → `src/song.js` me paste

| Key | Kaam |
|---|---|
| `Space` | line ka start mark |
| `Enter` | line ka end mark (optional) |
| `Backspace` | undo |
| `B` | tap BPM |
| `P` | play / pause |
| `←` `→` | 2 second peeche / aage |

### 3. `src/song.js` edit karo
```js
const SONG = {
  title: 'Mera Gaana',
  audio: 'assets/song.mp3',
  bpm: 90,            // timing tool se
  duration: 60,       // seconds
  sceneEvery: 2,      // har 2 lines pe naya scene
  sceneOrder: ['sunburst', 'night', 'typo', 'city', 'waves', 'rain', 'confetti', 'spotlight'],
  lyrics: [
    [1.0, 4.5, 'Subah ki pehli kiran', 'sunburst'],   // [start, end, text, scene(optional)]
    [4.8, 8.5, 'Meri aankhon me utari'],
  ]
};
```

### 4. Studio me dekho
`studio.html` kholo:
- slider se **scrub** karo (ek frame ~1–4 sec me paint hota hai)
- **draft (fast)** ON rakho — flat colours, 3–4x fast
- **Bake 4 s preview** → chhota animation + gaana saath me chalega

### 5. MP4 banao
Chrome aur ffmpeg chahiye.
```bash
node render.mjs --sheet=2,8,14,20,26,32     # 6 frames ka contact sheet (fast check)
node render.mjs --stills=4.5,12.0           # full-res PNG stills
node render.mjs --clip=0:8                  # 8 second ka test MP4 + audio
node render.mjs --frames=0: --workers=4     # saare frames (resumable — beech me rok sakte ho)
node render.mjs --encode --out=out/video.mp4
```
Chrome na mile to: `--chrome="C:/Program Files/Google/Chrome/Application/chrome.exe"`

---

## Scenes

| Naam | Kya dikhta hai |
|---|---|
| `sunburst` | ghoomta hua watercolour sunburst, ghaas, beat pe uchhalta singer |
| `night` | raat, chamakte taare, chaand, pahadiyan |
| `city` | shehar ki skyline, beat pe jalti-bujhti khidkiyan |
| `rain` | baarish, chhata, paani ke ripples |
| `typo` | **kinetic typography** — lyric ke shabd bade-bade pop hote hain |
| `waves` | samundar, suraj, hilti hui naav |
| `confetti` | party confetti cannons har beat pe |
| `spotlight` | stage, parde, spotlight, mic stand |

Naya scene banana ho to `src/scenes.js` me:
```js
SCENES.mera = (t, lt, dur, line) => {
  bg(PAL.night);                       // poori frame ka base
  paint(ellPts(960, 500, 300, 300, 26, 8), { fill: PAL.rose, fillOp: 170, bleed: .3, ink: PAL.ink });
  singer(960, 900, 42, t, { mouth: mouthAt(t), eyes: 'happy' });
};
```
Rule: scene **pure function of `t`** hona chahiye (koi `Math.random()` nahi — `hash(i)` aur `jit(a)` use karo),
kyunki frames parallel aur out-of-order render hote hain.

## Files

| Path | Kya hai |
|---|---|
| `src/song.js` | **sirf yahi edit karna hai** — gaana, bpm, lyrics, scenes |
| `src/core.js` | engine: paper, paint(), geometry, timing, camera, lettering |
| `src/singer.js` | character jo gaata hai (mouth sync, eyes, arms, mic) |
| `src/scenes.js` | 8 ready scenes + tumhare apne |
| `src/timeline.js` | shot list, scene wipes, title card, karaoke bar |
| `studio.html` | scrub + bake preview |
| `timing.html` | lyrics timing tool |
| `render.mjs` | headless Chrome se frames + ffmpeg se MP4 |

## Tips

- Karaoke bar neeche `y 975–1070` cover karta hai — zaroori action us se upar rakho.
- Sab beat pe locked hai: `pulse(t)` har beat pe 1 hota hai, `beatN(t)` beat number deta hai.
- Rang badalne ho to `song.js` me `palette: { clay: '#xxxxxx', ... }` override kar do.
- Render time: ~1–3 sec per frame per worker. 60 sec video = 1440 frames ≈ 10–20 min (4 workers).
