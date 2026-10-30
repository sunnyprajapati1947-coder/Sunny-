# Production report — चाय और बकवास · EP14

**Deliverable:** `out/chai_aur_bakwaas_ep14.mp4`
**Format:** 1920×1080 · 16:9 · 30 fps · H.264 High · AAC 192 kbps 48 kHz stereo
**Loudness:** ≈ −17 LUFS integrated, true peak −0.4 dBFS
**Subtitles:** burned-in Devanagari (libass) + `build/subs.srt` sidecar

---

## 1. What the brief asked for, and what is actually in the file

The brief asks for a *photorealistic 3-D animated* podcast with *human-grade*
voice acting, 8 minutes long. Every deliverable is a trade-off against the
machine it was made on:

| Constraint | Value |
|---|---|
| CPU | 2 cores |
| RAM | 3.8 GB |
| GPU | none (`nvidia-smi` absent) |
| 3-D renderer | none installed (no Blender/Maya/Unreal) |
| Cloud TTS / video API | none reachable (allow-list: GitHub, npm, PyPI only) |
| Speech tool quota | 10 clips per assistant turn |
| Repo size cap for pushed artefacts | ~128 MB |

### What that means, honestly

**Voices — genuinely good.** Two separately registered neural voices, one per
host, never swapped. They speak natural Hindi/Hinglish with human intonation,
breaths and timing. They are *not* improvised: the hosts do not truly overlap,
interrupt or corpse — the spontaneity is written into the script and shaped by
tight cut-in gaps in the edit. Anyone claiming two LLM TTS voices are
indistinguishable from two humans in a room would be overstating it. These are
good enough for a released episode, and that is the honest ceiling here.

**Visuals — photoreal images, 2.5-D animation.** There is no 3-D character
pipeline available, so the characters are photoreal plates animated in 2.5-D:
mouth-plate morphing driven by the dialogue envelope, jaw and lip warp, blinks,
eye saccades, head sway, plus a moving camera with push-ins, drift and a filmic
grade. The one thing this approach does *better* than a diffusion pipeline is
identity: every frame of every shot comes from one approved plate per
expression, so faces cannot drift between shots — the usual failure mode of
AI video. It does *not* produce full-body performance, true 3-D parallax of the
body, or hand articulation.

**Lip-sync — approximate by design.** The animation follows the amplitude
envelope of the actual mixed dialogue, so mouths move exactly while words are
spoken and rest in silence. It is not phoneme-accurate viseme animation
(that needs a talking-head model). At podcast framing it reads correctly; in an
extreme close-up it would not survive frame-by-frame inspection.

---

## 2. The 22 repositories

None could be installed and used for real output. They fall into three groups:

1. **GPU diffusion models** (CogVideo, LTX-Video, HunyuanVideo-1.5, VideoCrafter,
   DynamiCrafter, Helios, MoCoGAN, OmniTransfer, ATAS, lingbot-world,
   ComfyUI-LTXVideo): need CUDA-class GPUs and many GB of weights.
2. **Desktop apps / front-ends that call paid APIs with your own keys**
   (Toonflow, VideoSOS, MiniMax-MCP, ArcReel, dramaclaw, ai-moive-studio,
   Open-Generative-AI, agnes-video-generator): no local inference, and no API
   keys are available or appropriate to request.
3. **Genuinely useful as technique** — two of them:
   * **DepthFlow** — the stills→parallax camera language. Re-implemented in
     OpenCV (`warpAffine` with animated rotation/scale/focus) for every shot.
   * **awesome-image-video-prompts** — prompt structure for the character and
     studio plates (subject → wardrobe → light → lens → grade → grain).

Installing the rest would have added hundreds of MB and zero frames.

---

## 3. Pipeline

```
script/dialogue*.py      60 turns of script (5.2k characters, ~8:00 with beats)
assets/vo/*.mp3          neural voice takes, one voice per host
scripts/voicelab.py      pitch + formant character shift (duration preserved)
scripts/assemble.py      studio chain → timeline → room IR → music bed →
                         ducking → master → look-ahead limiter
scripts/render_engine.py camera rig, face animation, grade
scripts/render_shots.py  one cached H.264 segment per shot
scripts/subs.py          ASS/SRT, Devanagari via libass
scripts/build_video.py   concat → burn subs → mux → delivery encode
scripts/verify.py        16-point objective quality gate
```

### Audio
Per take: trim → pitch/formant shift → 75 Hz HPF → de-esser → host EQ → 14 kHz
LPF → 3:1 comp → RMS normalisation. Voice bus → 0.55 s synthetic room IR (8.5 %
wet) → comp. Music bed is **synthesised** (FM Rhodes, upright bass, filtered
noise brushes, sine kick, 74 BPM, Cmaj7–Am7–Dm7–G7), ducked 9 dB under speech.
Master: EQ → glue comp → RMS target → look-ahead limiter at −0.45 dBFS.

### Video
Shot planner assigns close-up / over-the-shoulder / wide / detail B-roll per
line, with reaction cuts and section B-roll; each shot gets a slow push-in and
organic handheld drift; then S-curve + teal/amber split-tone LUT, bloom,
vignette and per-frame grain.

---

## 4. Bugs found and fixed (worth recording)

| Bug | Symptom | Fix |
|---|---|---|
| Shared filter state across the formant cascade | audio decayed to silence after 1 s (the prototype synthesiser) | one state vector per resonator |
| ASS `Spacing` ≠ 0 | every Devanagari conjunct collapsed into dotted circles | Spacing = 0 in all styles (libass falls back to per-glyph shaping) |
| Phase-vocoder increment missing the stretch factor | pitch shift silently cancelled itself (proved with a sine: 150 Hz → 150 Hz) | multiply phase advance by `out_hop/hop` |
| `-ss` before `-i` with `ass` filter | subtitles vanished/half-rendered in frame tests | seek after `-i` |
| Limiter built with 288 shifted copies | 7.3 GiB allocation, OOM | `scipy.ndimage.maximum_filter1d` |
| Mouth warp over a closed mouth | a smeared "pancake" instead of an opening | aligned mouth-open twin plate + envelope-weighted blend |
| Autocorrelation F0 on reverberant speech | octave errors made the hosts look 0.3 st apart | YIN with CMND + parabolic interpolation |

---

## 5. Quality gate (`scripts/verify.py`)

Latest run against the delivered file passes the format, loudness, peak,
dialogue-presence, voice-separation, expressive-range and identity-lock checks.
It fails only on:

* **8:00 target** — the file is shorter while voice batches are still landing.
* **dialogue complete (n/60)** — same reason.

Those two flip automatically once every turn has audio; nothing else in the
pipeline needs to change.
