# चिंकू और जादुई गाजर 🐰🥕

A 1-minute-21-second **cartoon film for kids**, rendered entirely from code.
Every one of the **2430 frames** is drawn procedurally on Canvas2D — no stock
video, no image assets, no animation library. Characters, environments,
effects, the Hindi narration sync, the music and the sound-effects are all
generated.

> **सीख:** मिलकर काम करने में ही असली ताक़त है।
> *(The real strength is in working together.)*

## ⬇ Download the film (permanent link)

The finished MP4 is committed to this repository and pinned to the tag
`cartoon-v1`, so these links never expire:

**Direct download (open it, or right-click → Save video as…):**

```
https://github.com/sunnyprajapati1947-coder/Sunny-/raw/cartoon-v1/cartoon/chinku-aur-jaadui-gaajar.mp4
```

Same file via the raw CDN:

```
https://raw.githubusercontent.com/sunnyprajapati1947-coder/Sunny-/cartoon-v1/cartoon/chinku-aur-jaadui-gaajar.mp4
```

Release page: <https://github.com/sunnyprajapati1947-coder/Sunny-/releases/tag/cartoon-v1>
Browse the source at this tag: <https://github.com/sunnyprajapati1947-coder/Sunny-/tree/cartoon-v1/cartoon>

| Spec | Value |
|---|---|
| Duration | 1:21 (81s), 9 scenes |
| Video | 1920×1080 · 30 fps · H.264 High · CRF 18 |
| Audio | AAC stereo 48 kHz · Hindi narration + score + SFX · −13.2 LUFS |
| Size | ~22.9 MB |

Release page: <https://github.com/sunnyprajapati1947-coder/Sunny-/releases/tag/cartoon-v1>

## The story (9 scenes)

1. **सुबह + टाइटल** — bouncing Devanagari title over a waking meadow
2. **चिंकू जागता है** — the rabbit pops out of his burrow, stretches, hops, waves
3. **खोज** — a glowing golden carrot; eyes pop, a red "!" appears
4. **कोशिश** — हईशा! he pulls alone, slips, falls, stars circle his head
5. **दोस्तों को बुलाना** — shout rings; Bholu the elephant, Mithu the parrot and
   Cheeku the mouse arrive
6. **मिलकर ज़ोर** — the four chain up and heave on "एक… दो… तीन!", screen shakes
7. **धड़ाम!** — anticipation freeze → POP! the carrot rockets skyward, everyone tumbles
8. **जादू** — it was magic: a rainbow arcs, flowers bloom in a wave, butterflies swarm
9. **बाँटना + अलविदा** — a picnic, the carrot shared equally, sunset, समाप्त card

## Characters

| Name | Species | Role |
|---|---|---|
| चिंकू (Chinku) | rabbit | hero; finds the carrot |
| भोलू (Bholu) | elephant | the muscle; pulls with his trunk |
| मीठू (Mithu) | parrot | flies in, holds the chain |
| चीकू (Cheeku) | mouse | smallest but never quits |
| जादुई गाजर | golden carrot | the McGuffin (and very cute) |

## How it is built

Nothing here is recorded — it is all **synthesised**:

- **Picture.** `cartoon.js` is a pure Canvas2D drawing engine: characters are
  layered vector shapes with squash-&-stretch, anticipation, follow-through
  and overlapping action (ears and trunks lag behind the body). Environments
  are parallax hills, swaying grass, drifting clouds, blooming flowers.
  All randomness is a pure function of time, so any frame is reproducible.
- **Render.** `render.js` drives `@napi-rs/canvas` (Skia) headlessly and pipes
  raw RGBA frames into `ffmpeg` (libx264, CRF 18) — ~34 fps of rendering on one core.
- **Voice.** Nine Hindi narration clips are placed on the timeline at each
  scene's start + lead-in; scene durations were derived from the measured
  clip lengths so every line lands inside its scene.
- **Score & SFX.** `audio.js` writes 16-bit WAVs by additive synthesis:
  glockenspiel melody over a pentatonic walk, plucky bass, shakers, plus
  boings, whooshes, a POP and magic glissandi. `mix.js` delays each narration
  clip to its scene, mixes the buses and muxes with the video.
- **Hindi type.** Noto Sans Devanagari (woff) is registered into Skia so the
  on-screen titles and read-along captions render as crisp Devanagari.

## Rebuild it yourself

```bash
cd cartoon
npm install                      # @napi-rs/canvas + @fontsource/noto-sans-devanagari
node audio.js                    # -> audio/music.wav, audio/sfx.wav
node render.js                   # -> build/video-silent.mp4  (~76 s)
node mix.js                      # -> chinku-aur-jaadui-gaajar.mp4 (muxed)
node serve.js                    # watch + download page on :8001
```

Quick QA without a full render:

```bash
node stills.js                   # -> contact-sheet.png (3x3, one tile per scene)
```

## Files

```
cartoon/
├── cartoon.js      drawing engine: characters, environment, 9 choreographed scenes
├── render.js       frames -> H.264 (raw RGBA piped to ffmpeg)
├── audio.js        procedural score + SFX -> WAV
├── mix.js          narration/music/SFX mix + mux -> final MP4
├── serve.js        static server with HTTP Range (video seeking)
├── stills.js       QA contact-sheet renderer
├── index.html      watch + download page
├── poster.png      poster frame (magic/rainbow scene)
├── contact-sheet.png  9-scene QA sheet
└── audio/n0*.mp3   the nine Hindi narration clips
```

Made with Arena.ai Agent Mode, inspired by the prompt-collection spirit of
[yihui-dev/awesome-opus5-5-videos](https://github.com/yihui-dev/awesome-opus5-5-videos).
