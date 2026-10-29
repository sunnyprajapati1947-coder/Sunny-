# SunnyAI

Google AI model routing registry for SunnyAI.

## Provider

SunnyAI uses a configured `GEMINI_API_KEY` from the local environment. No API keys are stored in this repository.

## Capabilities

The registry separates text/coding, image, video, audio, embedding, research, computer-use, and music model targets so the application can route tasks by capability.

## Cartoon film pipeline (`movie/`)

A complete, GPU-free studio for Hindi cartoon story films. It produced:

```
output/Neelu_aur_Gyaan_ka_Chashma_1080p.mp4   10:00 · 1920x1080 · 24 fps · Hindi voice + subtitles
```

* **Story** — [`movie/STORY.md`](movie/STORY.md), 36 shots, three acts, moral ending.
* **How to build it** — [`movie/README.md`](movie/README.md)
  (`python3 movie/audio.py` then `python3 movie/make_film.py`).
* **What was installed and why** — [`docs/SETUP.md`](docs/SETUP.md): numpy, Pillow,
  imageio-ffmpeg, uharfbuzz + freetype-py (Pillow here has no Raqm, so Devanagari
  must be shaped by hand), espeakng-loader (offline Hindi TTS).
* **The 24 video-AI repos** — [`docs/REPOS.md`](docs/REPOS.md): all verified to exist,
  documented with VRAM needs, plus the recipe to run them on a rented GPU.
* **Tool bridge** — `python3 movie/film_tools.py` returns the film's status as JSON;
  `movie/film_tools.youtube_metadata()` feeds `core/youtube_tools.upload_video()`,
  and `movie/drive_upload.py` puts the file in Google Drive.

## Important

Model availability can depend on the Google account, API project, quota, region, preview status, and current Google API lifecycle. A model being listed in the registry does not guarantee access.
