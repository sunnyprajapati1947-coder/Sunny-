# Repo catalogue — the 24 links you sent

All 24 were resolved through the GitHub API on 2026-10-29 — every one exists.

**Read this first.** This sandbox has **2 CPU cores, 3 GB RAM, no GPU and no PyTorch/CUDA**.
Any single inference from the video-model repos below needs 8–40 GB of VRAM plus tens of GB of weights,
so they are *documented, catalogued and wired* here — not *runnable here*.
What does run here is the film pipeline in `movie/` (numpy + Pillow + HarfBuzz + eSpeak + ffmpeg),
which produced `output/Neelu_aur_Gyaan_ka_Chashma_1080p.mp4`.

| # | repo | ★ | lang | source | what it is | what it needs | relevance to this film |
|---|------|---|------|--------|------------|---------------|------------------------|
| 1 | [morluto/rea](https://github.com/morluto/rea) | 404,606 | TypeScript | 128 MB | very large agentic media project | API keys / hosted models | agent orchestration |
| 2 | [Anil-matcha/Open-Generative-AI](https://github.com/Anil-matcha/Open-Generative-AI) | 31,763 | JavaScript | 113 MB | Web studio: 200+ models (Flux, Kling, Veo, Sora, Wan) via the Muapi gateway, or BYO Wan2GP locally. | CUDA/ROCm box for local models, or a Muapi key (Wan2.1 1.3B needs ~8 GB VRAM) | UX reference for a generation studio; the BYO-Wan2GP pattern is what you replicate on a GPU host |
| 3 | [HBAI-Ltd/Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app) | 19,832 | TypeScript | 288 MB | Toonflow: story -> 2D cartoon episode app | TypeScript app, paid LLM/TTS/image APIs | closest reference for the *format* you asked for (Hindi cartoon episodes) |
| 4 | [zai-org/CogVideo](https://github.com/zai-org/CogVideo) | 13,128 | Python | 178 MB | CogVideoX 2B/5B text-to-video + LoRA fine-tuning | 2B on GTX 1080Ti class, 5B on RTX 3060+ (CUDA, 4-24 GB VRAM) | best candidate for real AI shots on consumer GPU, 6-10 s per clip |
| 5 | [yihui-dev/awesome-opus5-5-videos](https://github.com/yihui-dev/awesome-opus5-5-videos) | 12,428 | - | 0 MB | curated showcase of AI videos + prompts | none - it is a gallery | style/prompt inspiration |
| 6 | [Lightricks/LTX-Video](https://github.com/Lightricks/LTX-Video) | 11,210 | Python | 0 MB | LTX-Video: fast DiT video model | CUDA; lightest real option (~1 GB tier claimed) | the realistic AI-look route on modest hardware |
| 7 | [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) | 9,236 | JavaScript | 148 MB | agentic video/multimedia generation app | API keys | agent-driven production |
| 8 | [dramaclaw/dramaclaw](https://github.com/dramaclaw/dramaclaw) | 6,569 | Python | 692 MB | AI drama / short-play generation framework | API-key driven | drama beat structure for episode scripting |
| 9 | [ArcReel/ArcReel](https://github.com/ArcReel/ArcReel) | 5,854 | Python | 209 MB | Reels / short-video generation pipeline | API-key driven | vertical short format |
| 10 | [AILab-CVC/VideoCrafter](https://github.com/AILab-CVC/VideoCrafter) | 5,110 | Python | 175 MB | VideoCrafter2 text/image-to-video | A100-class, ~20 GB peak per clip | quality reference for shot look |
| 11 | [Tencent-Hunyuan/HunyuanVideo-1.5](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5) | 4,582 | Python | 0 MB | HunyuanVideo 1.5 (open, 480p/720p) | min 14 GB VRAM with offloading, 4090-class recommended | realistic 480p image-to-video option on rented GPU |
| 12 | [Robbyant/lingbot-world](https://github.com/Robbyant/lingbot-world) | 4,556 | Python | 50 MB | LingBot-World: interactive world model, camera-controllable video | 4-bit quant for low VRAM, still GPU-only | camera-move research; this film fakes camera moves with 3D geometry |
| 13 | [Lightricks/ComfyUI-LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo) | 4,225 | Python | 13 MB | ComfyUI nodes for LTX-Video | 32 GB+ VRAM for full nodes, low-VRAM loaders exist | node-graph route to a ComfyUI studio |
| 14 | [ai-boost/awesome-image-video-prompts](https://github.com/ai-boost/awesome-image-video-prompts) | 3,405 | Python | 96 MB | Prompt library for image/video models | no compute needed - prompt text | prompt engineering reference for this shot list |
| 15 | [Doubiiu/DynamiCrafter](https://github.com/Doubiiu/DynamiCrafter) | 3,005 | Python | 72 MB | image-to-video animation of stills | A100 40GB: ~10 s and 20 GB peak per image | exactly the technique that would animate these 36 keyframes on a GPU box |
| 16 | [PKU-YuanGroup/Helios](https://github.com/PKU-YuanGroup/Helios) | 2,232 | Python | 14 MB | Long-form video diffusion (14B, 5 FPS on one H100) | H100 / 80 GB class | Why 10-minute single-pass diffusion is not feasible on small hardware |
| 17 | [869413421/ai-moive-studio](https://github.com/869413421/ai-moive-studio) | 1,642 | Python | 124 MB | AI movie studio: script -> images -> video -> voice | API keys + GPU | end-to-end studio architecture |
| 18 | [MiniMax-AI/MiniMax-MCP](https://github.com/MiniMax-AI/MiniMax-MCP) | 1,594 | Python | 0 MB | MiniMax MCP server (Hailuo video, TTS, image) | MiniMax API key; tiny install | lowest-friction path to real AI video with a hosted key |
| 19 | [BrokenSource/DepthFlow](https://github.com/BrokenSource/DepthFlow) | 1,566 | Python | 0 MB | 2.5D parallax depth animation from stills | GPU for real-time, CPU works slowly | closest cousin to this pipeline's parallax camera over a plate |
| 20 | [timoncool/videosos](https://github.com/timoncool/videosos) | 1,377 | TypeScript | 62 MB | video workflow / automation app | Node/TypeScript, API keys | automation glue |
| 21 | [sergeytulyakov/mocogan](https://github.com/sergeytulyakov/mocogan) | 606 | Python | 83 MB | MoCoGAN: GAN that separates motion from content (research) | old PyTorch/CUDA stack, low-res output | historical reference for motion/content separation |
| 22 | [lcy362/agnes-video-generator](https://github.com/lcy362/agnes-video-generator) | 602 | Python | 56 MB | Agentic video pipeline (script -> shots -> clips) | calls hosted model APIs, needs keys | shot-list + agent orchestration, mirrored here in pure code |
| 23 | [ziplab/ATAS](https://github.com/ziplab/ATAS) | 392 | Python | 9 MB | Adaptive token compression for video diffusion | GPU research code | efficiency research |
| 24 | [PangzeCheung/OmniTransfer](https://github.com/PangzeCheung/OmniTransfer) | 236 | - | 568 MB | Unified spatio-temporal transfer (very large source tree) | GPU + very large weights | style/identity transfer between shots |

## How to actually run the GPU ones

1. Rent a GPU (RunPod / Vast.ai / Colab Pro). 24 GB (RTX 4090) is the sweet spot.
2. `pip install torch --index-url https://download.pytorch.org/whl/cu121`, then the repo's requirements.
3. Start with **LTX-Video** or **CogVideoX-2B** (smallest real models), then **HunyuanVideo-1.5**.
4. Image-to-video (`DynamiCrafter`, LTX i2v) is the cheapest way to animate keyframes like the 36 in
   `movie/scenes.json`: each keyframe + its `image` prompt gives 3–6 s of motion, then rebuild with
   `python3 movie/make_film.py` (it reads `movie/build/timing.json`, so the audio timing stays in sync).
5. No-GPU real-AI route: **MiniMax-MCP** or **Open-Generative-AI** with a hosted API key.

