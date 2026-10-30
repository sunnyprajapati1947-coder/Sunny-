# SunnyAI

Google AI model routing registry for SunnyAI.

## Provider

SunnyAI uses a configured `GEMINI_API_KEY` from the local environment. No API keys are stored in this repository.

## Capabilities

The registry separates text/coding, image, video, audio, embedding, research, computer-use, and music model targets so the application can route tasks by capability.

## Important

Model availability can depend on the Google account, API project, quota, region, preview status, and current Google API lifecycle. A model being listed in the registry does not guarantee access.

---

## Ludo Royale (`ludo-king/`)

A separate, self-contained project in this repository: an original, offline-first Ludo game
(mobile-first PWA + Android/Capacitor shell) with a clean-room rules engine, CPU opponents,
procedural audio and 54 automated tests. It does not affect the SunnyAI registry above.

- Quick start: `cd ludo-king && npm install && npm run dev`
- Docs: [`ludo-king/README.md`](ludo-king/README.md) · research, architecture and test evidence in
  [`ludo-king/docs/`](ludo-king/docs/)
- Android APK: run the *Ludo Royale — test, build & package* GitHub workflow, or
  `cd ludo-king && npm run android:sync && cd android && ./gradlew assembleDebug`
