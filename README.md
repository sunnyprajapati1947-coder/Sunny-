# SunnyAI

Google AI model routing registry for SunnyAI.

## Provider

SunnyAI uses a configured `GEMINI_API_KEY` from the local environment. No API keys are stored in this repository.

## Capabilities

The registry separates text/coding, image, video, audio, embedding, research, computer-use, and music model targets so the application can route tasks by capability.

## Important

Model availability can depend on the Google account, API project, quota, region, preview status, and current Google API lifecycle. A model being listed in the registry does not guarantee access.

## Projects

- [`map-quiz/`](map-quiz/README.md) — **Bharat Map Quiz**, an offline-first India map quiz app
  (English UI, optional Hindi names): learn the map, timed blitz, survival, neighbours, daily
  challenge, achievements. Play it via `cd map-quiz && python3 -m http.server 8080`, or download the
  ready-to-run build from [`map-quiz/download/`](map-quiz/download/).
