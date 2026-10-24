# 👑 Ludo Royal 3D — Futuristic Ludo (Ludo King Style)

A **free, open-source (MIT)** Ludo game in **real 3D** — glossy 3D pawns that
hop across a floating neon board, a tumbling 3D dice that settles on the rolled
face, futuristic glass HUD, all in **English**. Clean-room original: no
Ludo King code, logo or assets were copied — only the public-domain Ludo
rules, rebuilt bigger and better. (That's also why ours is called *Ludo Royal*.)

![3D](https://img.shields.io/badge/Engine-Three.js%203D-black)
![Players](https://img.shields.io/badge/Players-2--4%20•%20AI%20•%20Pass%20%26%20Play-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## 🎮 What's inside

- 🌐 **PLAY ONLINE (new!)** — create a 6-digit room code, friends join from their own
  phones anywhere in the world and play live on the same 3D board (free peer-to-peer
  via PeerJS, no sign-up). Includes a Ludo-King-style lobby, share/copy code and
  in-game quick emotes. Only the player whose turn it is can roll — everyone else
  watches the pawns move live.

- 🎲 **Real 3D dice** (Three.js) — tap ROLL, it tumbles in the air and lands on the exact face
- ♟️ **Real 3D board & pawns** — lathe-turned glossy pawns, neon-glow floating board,
  star particles, dynamic lights & shadows, gentle camera drift
- 🇬🇧 **100% English** interface
- 🤖 **VS Computer** — smart AI (launches pawns, captures, races home, avoids danger)
- 👨‍👩‍👧‍👦 **Pass & Play** — 2–4 friends on one phone
- ⭐ Safe stars, ⚔️ capture = bonus turn, 6 = launch + bonus turn, three 6s = skip
- 🏠 Animated pawn hops, capture/victory effects, 🔊 sounds + 📳 vibration
- 📴 Works **fully offline** after install

## 📲 Install on any phone

### Option 1 — APK (Android, direct)
1. Open this repo's **Releases** → `Ludo Royal 3D ONLINE APK v3.0…` → download **LudoRoyal.apk** (~7 MB)
2. Tap the file → **Install** → allow "Install unknown apps" if asked (debug-signed free build)
3. Done — the 👑 icon appears on your home screen!

Every push rebuilds the APK automatically via GitHub Actions
(`../.github/workflows/build-ludo-apk.yml`) and publishes a fresh Release.

### Option 2 — PWA (Android + iPhone)
Open the game in the browser → **INSTALL THE APP**:
Android/Chrome ⋮ → *Install app* · iPhone/Safari Share → *Add to Home Screen*.

### Option 3 — Build it yourself
```bash
cd ludo-king-clone && npm install
npm run dev          # web version at http://localhost:5173
npm run sync         # build + sync into the Android (Capacitor) project
npm run apk:local    # needs Android SDK -> android/app/build/outputs/apk/debug/
```

## 🛠 Tech

React 18 • Three.js (@react-three/fiber) • Capacitor 8 (Android) •
PWA (manifest + service worker) • REA MCP (`../.mcp.json`, see `REA-MCP.md`)

## 📂 Structure

```
src/
├── App.jsx            # English futuristic HUD, menu, game flow
├── styles.css         # neon/futuristic theme
├── game/engine.js     # board path, rules, captures, AI (pure, tested)
└── three/
    ├── Board3D.jsx    # 3D board, glossy pawns, lights, particles
    ├── Dice3D.jsx     # tumbling 3D dice (verified face math)
    └── boardTexture.js# canvas-drawn board artwork + dice faces
android/               # Capacitor native project (com.Sunny.ludoroyal)
```

## 📜 License

MIT — free to use, modify and share. "Ludo King" is a trademark of its owner;
this independent project is named **Ludo Royal**.
