# Jarvis Pocket smoke test (dev only)

Runs the real `apps/jarvis-pocket` UI in jsdom with a stubbed LLM, YouTube API and
MediaRecorder, and checks the flows that matter: tabs, task queue (success, retry,
persistence), chat tools, Connections, Video studio (plan → record → gallery save)
and JS errors.

```bash
cd tools/pocket-smoke
npm install          # jsdom, not needed at runtime
npm test             # 22/22 checks, ~7s
```

Not shipped inside the APK: `apps/jarvis-app/scripts/stage-web.mjs` only copies
`apps/jarvis-pocket` (no `node_modules`, no test harness).
