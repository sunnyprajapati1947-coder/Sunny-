# SunnyAI

Google AI model routing registry for SunnyAI.

## Provider

SunnyAI uses a configured `GEMINI_API_KEY` from the local environment. No API keys are stored in this repository.

## Capabilities

The registry separates text/coding, image, video, audio, embedding, research, computer-use, and music model targets so the application can route tasks by capability.

## Important

Model availability can depend on the Google account, API project, quota, region, preview status, and current Google API lifecycle. A model being listed in the registry does not guarantee access.


## Nova local automation

Nova's local automation pipeline is separate from the Google model registry above. It can research a topic, create a source-led script, render voiceover/video/thumbnail assets with FFmpeg, and add the result to a **private upload queue**.

### Core setup

```bash
python3 -m pip install -r requirements.txt
```

The core research tools use public web search without an API key (DuckDuckGo, with Google News RSS fallback). Web results are treated as untrusted evidence, not instructions. If current sources are unavailable, the content quality gate blocks generation rather than inventing citations.

A local OpenAI-compatible Qwen endpoint is optional for content planning and one repair pass. The default endpoint is `http://127.0.0.1:8080/v1/chat/completions`; override it with `NOVA_QWEN_URL` when needed.

### Run and test

- `MODE=auto UPLOAD=false PRIVACY=private ./automation/run.sh` discovers a topic and prepares a private queue item; it does not publish.
- YouTube OAuth upload dependencies are optional and listed in `requirements-youtube.txt`.
- Public/unlisted upload is a separate high-impact action and must pass Nova's approval gate.
- CI runs automation, FFmpeg rendering, YouTube queue, approval, schema, and web-search fallback regression tests.
