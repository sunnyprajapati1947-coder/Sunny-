# चाय और बकवास · EP14 — "करियर, और उसूल"
## Production dossier

A Hindi/Hinglish comedy podcast, produced end-to-end in this repository.

| | |
|---|---|
| **Show** | चाय और बकवास (*Chai aur Bakwaas*) — EP 14 |
| **Episode** | करियर, और उसूल (*Career, and Principles*) |
| **Hosts** | आरव / Aarav (24, deadpan, sarcastic) · रोहन / Rohan (23, loud, argumentative) |
| **Format** | 1920×1080 · 16:9 · 30 fps · H.264 High · AAC 192 kbps 48 kHz |
| **Runtime target** | 8:00 (structure below) |
| **Language** | Hindi with natural Hinglish code-mixing |
| **Subtitles** | Burned-in Devanagari (libass, correct conjunct shaping) + sidecar `.srt` |

---

## 1. What was actually produced vs. asked for

The brief asks for a photorealistic 3-D animated podcast with human-grade voice
acting. This sandbox has **2 CPU cores, 3.8 GB RAM, no GPU, no 3-D renderer,
no cloud TTS/video API and no network access to model hubs**. So the honest
scorecard is:

| Requirement | Status | How |
|---|---|---|
| Photoreal characters, identical identity throughout | **Done** | Fixed photoreal character plates generated once; the same plate (plus an aligned mouth-open twin) is used for every frame of every shot, so identity cannot drift |
| Luxury dark cinematic studio | **Done** | Generated plates: wide two-shot, over-the-shoulder ×2, desk detail, studio detail |
| Photorealistic 3-D animation of face/body | **Partial — documented** | No 3-D rig exists here. Faces are animated 2-D→cinematic: mouth-plate morphing driven by the speech envelope, blink, eye saccades, jaw/lip warp, head sway, breathing. Body-level motion is camera + subtle sway. This is *animated photography*, not a 3-D character pipeline |
| Natural Indian Hindi voices, two distinct hosts | **Done** | Two separately registered neural voices, one per host, never reused across hosts. Distinct registers (A: ~104 Hz median, narrow, deadpan; R: ~88 Hz median with a much wider expressive range) |
| Not robotic / scripted | **Best available** | The neural voices are expressive and clearly human-sounding; they are still TTS. They cannot improvise or genuinely overlap. Overlap is faked in the edit with tight cut-in gaps |
| Multi-camera podcast coverage | **Done** | A shot planner picks close-up / over-the-shoulder / wide / detail B-roll per line, with reaction cuts and section B-roll |
| Cinematic grade, DOF, grain, motion | **Done** | Filmic S-curve + teal/amber split tone, bloom, vignette, per-frame grain, slow push-ins, organic handheld drift |
| Lip-sync | **Done (2-D)** | Amplitude-driven mouth-plate blend + jaw warp, frame-accurate to the mixed dialogue |
| 8-minute final MP4 | **Segment delivered (see §7)** | 0:57 cold open is finished and rendered; the remaining 52 of 60 turns are queued behind the 10-clips-per-turn speech cap |

Full details and limitations are in `REPORT.md`.

---

## 2. Repository inspection (22 repos)

Short version: **none of them can run here.** Every one either needs CUDA-class
GPUs and multi-GB diffusion weights, or is a desktop app / front-end that calls
paid APIs with your own keys. The two things that genuinely improve the output
were taken as *techniques*, not as installs.

| Repo | What it is | Verdict here |
|---|---|---|
| Anil-matcha/Open-Generative-AI | Web front-end for hosted image/video models | ✗ needs API keys, no local inference |
| PKU-YuanGroup/Helios | Real-time long video diffusion | ✗ GPU + weights |
| sergeytulyakov/mocogan | GAN video generation (2018) | ✗ GPU, low resolution by modern standards |
| lcy362/agnes-video-generator | Self-hosted multi-scene generator | ✗ GPU diffusion backends |
| ziplab/ATAS | Agentic video generation framework | ✗ GPU |
| PangzeCheung/OmniTransfer | Spatio-temporal video transfer | ✗ GPU, 580 MB repo of weights/scripts |
| HBAI-Ltd/Toonflow-app | Short-drama production app (TS) | ✗ desktop app, paid image/video APIs |
| zai-org/CogVideo | CogVideoX text/image→video | ✗ GPU |
| Lightricks/LTX-Video | LTX-Video diffusion | ✗ GPU |
| dramaclaw/dramaclaw | Script→film pipeline | ✗ GPU + API keys |
| ArcReel/ArcReel | Self-hosted video workbench | ✗ GPU + provider keys |
| AILab-CVC/VideoCrafter | VideoCrafter2 | ✗ GPU |
| Tencent-Hunyuan/HunyuanVideo-1.5 | 8.3B video model | ✗ GPU |
| Robbyant/lingbot-world | World model (repo deprecated upstream) | ✗ GPU |
| Lightricks/ComfyUI-LTXVideo | ComfyUI nodes for LTX | ✗ needs ComfyUI + GPU |
| ai-boost/awesome-image-video-prompts | Prompt library | ✓ **used as reference** for plate prompting style |
| Doubiiu/DynamiCrafter | Image animation diffusion | ✗ GPU |
| 869413421/ai-moive-studio | Canvas workflow agent | ✗ GPU + keys |
| MiniMax-AI/MiniMax-MCP | MCP server for MiniMax APIs | ✗ needs MiniMax API key |
| BrokenSource/DepthFlow | Images → 3-D parallax video | ✓ **technique adopted** — parallax-style camera moves over stills (re-implemented in OpenCV, `warpAffine`) |
| timoncool/videosos | Desktop AI video studio (Tauri/Rust) | ✗ desktop app, OpenRouter/fal/Runware keys |

**Adopted:** DepthFlow's stills→parallax camera language; the prompt-library
repo's structure for plate prompts.

---

## 3. Pipeline

```
script/dialogue.py, script/dialogue_blocks.py      the 8-minute script (60 turns)
        │
        ├─ voice  (registered neural voices, one per host)   assets/vo/*.mp3
        │
scripts/assemble.py
        │   decode → studio chain → timeline → room tone
        │   → music bed (synthesised Rhodes/upright/brushes)
        │   → ducking → bus comp → limiter            build/audio/master.wav
        │                                              build/timeline.json
scripts/render_engine.py + render_shots.py
        │   shot planner → per-shot camera + face animation + grade
        │   → one H.264 segment per shot (cached)      build/shots/*.mp4
scripts/subs.py → build/subs.ass (+ .srt)
scripts/build_video.py → concat → burn subs → mux → out/*.mp4
```

Every stage is deterministic and incremental: change one line of dialogue,
re-render only the shots that contain it.

### Audio chain (per take)
80 Hz high-pass → de-esser → host-specific EQ (A: body at 190 Hz, presence at
3.2 kHz; R: presence lifted at 3.4 kHz, 1.2 kHz scoop) → 14 kHz low-pass →
3:1 compressor → RMS normalisation.

### Mix
Dialogue bus comp (2.2:1) → synthesised stereo room tone → lo-fi music bed
(74 BPM, Cmaj7–Am7–Dm7–G7, Rhodes + upright bass + brushes + soft kick) with
sidechain-style ducking (−9 dB under speech) → master EQ, 2:1 glue comp, RMS
target ≈ −16 LUFS, soft limiter.

### Music
The bed is **synthesised**, not sampled: FM electric piano, physical-ish upright
bass, filtered-noise brushes, sine kick — so there are no licensing issues.

---

## 4. The script

60 speaking turns, ~5.2 k characters of dialogue → ~6:50 of speech plus beats
and section transitions ≈ **8:00**.

| Time | Section | Content |
|---|---|---|
| 0:00–0:30 | Cold open | "मैं अपने दम पर बिज़नेस खड़ा कर सकता हूँ" / "तू अपनी चप्पल भी नहीं ढूँढ सकता" |
| 0:30–1:30 | Intro | LinkedIn profile, résumé jokes, "उसूल क्या है? कोई नया ऐप है?" |
| 1:30–3:00 | Talk | शर्मा जी का बेटा, the "जर्नी" car photo, scrolling-as-research |
| 3:00–4:30 | Roast | the "do-nothing app" pitch, premium chai cart, "इंसानियत से EMI नहीं भरती" |
| 4:30–6:00 | Surprise | the gym that he never entered, the mother's call about the fridge |
| 6:00–7:15 | Punchlines | "गूगल मैप्स को रास्ता सिखाता है", "मैंने सिलेबस को घोस्ट कर दिया" |
| 7:15–8:00 | Ending | the chai-cart plan, "फ्रिज तेरी मम्मी का है, आरव" |

Comedy stays desi and friendly-roast; no hateful content, gaaliyan are censored
by implication ("हरामी/कमीना" level only, mostly avoided).

---

## 5. Character bibles

**Aarav** — 24 · oval face, deep-set dark eyes, thick straight brows, light
stubble, short black side-parted hair · fitted black tee, thin gold chain,
headphones round the neck · deadpan delivery, one raised eyebrow, slow blinks,
leans back when he lands a punchline.

**Rohan** — 23 · rounder face, large expressive eyes, curly black hair, short
boxed beard, silver hoop, mole on the right cheek · oversized olive hoodie over
a white tee · talks with his hands, laughs at his own jokes, leans into the mic.

Both are locked to a fixed plate set, so identity is pixel-stable for the whole
episode (a real advantage over per-shot diffusion).

---

## 6. Verification

`scripts/verify.py` checks the delivered file and prints a PASS/FAIL table:

* resolution 1920×1080, 16:9, 30 fps, H.264 High, yuv420p
* audio 48 kHz stereo AAC, integrated loudness, true peak
* duration and section timing against the brief
* two distinct voice identities (median F0 separation) — measured on the takes
* lip-sync correlation between the dialogue envelope and the mouth-opening track
* no duplicate identity drift: every shot's plate hash is from the approved set

---

## 7. Status & how to finish

**Delivered right now:** `out/chai_aur_bakwaas_ep14.mp4` — 57.3 s, the complete
cold open (turns h01–i02), fully graded, lip-synced, subtitled and mixed.
14 of 16 automated quality checks pass; the two that do not are purely
"the rest of the dialogue is not voiced yet".

**Why the episode is not 8:00 yet:** the speech tool is capped at **10 clips per
assistant turn**, and 8 of the 60 turns are voiced. Once the quota resets, each
new turn adds 10 takes; six more turns finish the voice track. The pipeline
handles the rest automatically:

The episode fills in as batches land:

```
python3 scripts/assemble.py      # audio + timeline + camera plan
python3 scripts/render_shots.py  # renders only new/changed shots
python3 scripts/subs.py
python3 scripts/build_video.py   # concat + burn subs + mux
```

`out/chai_aur_bakwaas_ep14.mp4` always contains everything voiced so far, fully
graded, subtitled and mixed — currently the complete cold open.
