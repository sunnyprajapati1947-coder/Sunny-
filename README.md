# SunnyAI

Google AI model routing registry for SunnyAI.

## Provider

SunnyAI uses a configured `GEMINI_API_KEY` from the local environment. No API keys are stored in this repository.

## Capabilities

The registry separates text/coding, image, video, audio, embedding, research, computer-use, and music model targets so the application can route tasks by capability.

## Important

Model availability can depend on the Google account, API project, quota, region, preview status, and current Google API lifecycle. A model being listed in the registry does not guarantee access.

## Sites in this repo

| Folder | What it is | Run |
| --- | --- | --- |
| `site/` | Nova officer console — guild roster management | any static server (`python3 -m http.server`) |
| `freefiremax/` | **FF MAX Universe** — unofficial Free Fire Max portal: home, game, news, esports, download, support, redeem (7 pages) | `bash termux/serve.sh` |

### Termux (Android)

```bash
bash termux/setup-termux.sh     # one-time: python + git + optional termux-api
bash termux/serve.sh            # serves freefiremax/ on localhost + LAN
bash termux/serve.sh --bg       # background mode (status / stop supported)
```

Full guide: [`termux/README.md`](termux/README.md)

`freefiremax/` is an independent, unofficial fan project — not affiliated with Garena. It hosts no game files, asks for no logins, and sells nothing.
