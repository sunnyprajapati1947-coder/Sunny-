# 👑 Ludo Royal — Free Open-Source Ludo King-Style Clone

Ek **bilkul free, open-source (MIT)** Ludo game jo dikhne aur khelne mein
Ludo King jaisa feel deta hai — lekin ye ek **clean-room implementation** hai:
koi Ludo King code, logo ya asset copy nahi kiya gaya. Sirf Ludo ke
public-domain rules istemal hue hain. Naam bhi apna hai: **Ludo Royal**.

![Modes](https://img.shields.io/badge/Modes-Computer%20vs%20AI%20%7C%20Pass%20N%20Play-blue)
![Players](https://img.shields.io/badge/Players-2--4-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## 🎮 Features (Ludo King style)

- 🏠 Ludo King jaisa home screen — Computer / Pass N Play mode, player names
- 🎲 Animated dice (shake + pips), dice dabane par roll
- 🔴🟢🟡🔵 15×15 original Ludo board — 4 rang, 4-4 gotiyan (tokens)
- ⭐ Safe star squares — wahan goti nahi kategi
- ⚔️ Kata (capture) — dushman ki goti katne par **extra baari**
- 6️⃣ 6 aane par goti bahar + extra baari, teen 6 = baari khatam
- 🏁 Home column + beech wala HOME, saari 4 gotiyan = jeet 🏆
- 🤖 Smart Computer AI (bahar nikalo, kata karo, safe par jao, khatre se bacho)
- 👥 Pass N Play — 2–4 dost ek hi phone/computer par
- 🔊 Bina file ke WebAudio sounds (dice, kata, jeet)
- 📱 Mobile + desktop dono par chalta hai

## 🚀 Chalao (Run)

```bash
cd ludo-king-clone
npm install
npm run dev     # http://localhost:5173
```

Build: `npm run build`

## 🔌 REA MCP (morluto/rea) — plugged

Is project mein [REA MCP](https://github.com/morluto/rea) plug kiya gaya hai
(repo root par `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json` dekho).
Puri detail: [`REA-MCP.md`](./REA-MCP.md) / [`../docs/REA-MCP-LUDO.md`](../docs/REA-MCP-LUDO.md)

```json
{ "mcpServers": { "rea": { "command": "npx", "args": ["-y", "rea-agents", "mcp"] } } }
```

REA se humne apni hi app ko analyze karke verify kiya:

```bash
npx -y rea-agents doctor
npx -y rea-agents analyze-javascript-application ./ludo-king-clone --json
```

> Note: Ludo King khud ek copyrighted commercial app hai — use reverse
> engineer karke uska code/asset copy karna theek nahi hoga. Isliye humne
> wohi *gameplay feel* saaf tareeke se dobara banaya hai.

## 📂 Structure

```
ludo-king-clone/
├── .mcp.json            # REA MCP registration (is folder ke liye)
├── index.html
├── src/
│   ├── App.jsx          # Menu + board + dice UI
│   ├── styles.css       # Ludo King style theme
│   └── game/engine.js   # Board path, rules, capture, AI (pure JS, testable)
└── REA-MCP.md
```

## 📜 License

MIT — free mein use, badlo, baanto. Ludo ke rules public domain hain;
"Ludo King" naam/logo uski company ka trademark hai, isliye is project ka
naam **Ludo Royal** rakha hai.
