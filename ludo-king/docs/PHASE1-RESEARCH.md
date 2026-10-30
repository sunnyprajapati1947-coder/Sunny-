# Phase 1 — REA toolkit report & reference research

## 1.1 REA (Reverse Engineer Anything) — installation and readiness

**Repository inspected:** <https://github.com/morluto/rea> (cloned at `main`, package `rea-agents` v6.8.0, MIT).

What the project provides, per its README and `docs/`:

| Capability family | Commands / MCP operations | Relevant to this task |
| --- | --- | --- |
| Static Android APK analysis | `inspect_android_package`, `decode-android-resources` (wraps headless JADX + apktool) | Yes — would map Ludo King's screens/manifest |
| Flutter build identification | `identify-flutter-build` | Only if the target were Flutter (it is not) |
| Device interaction | `inspect-adb-device`, `capture-adb-screen`, `collect-adb-bugreport` | Yes — needs a physical device/emulator |
| Runtime instrumentation | Frida, GDB/Rizin debuggers, Ghidra/Hopper/IDA/Kuna providers | Out of scope here (no target binary) |
| Browser/JS observation | `capture-browser-scenario`, `analyze-web-bundle` (Playwright-based) | Only for web targets |

### Installation performed in this environment

```bash
npm install rea-agents@latest   # 150 packages, 0 vulnerabilities reported at install time
npx rea --version               # -> 6.8.0  (CLI works)
npx rea doctor                  # readiness matrix, see below
```

`rea doctor` result (verbatim summary):

```
healthy: false
  node               ok: false  missing_dependency  (22.22.3; REA wants >=22.23.4)
  host               ok: true   debian 12
  hopper             ok: false  missing_analysis_engine
  ghidra             ok: false  missing_analysis_engine (GHIDRA_INSTALL_DIR unset)
  ida-registration   ok: false  missing_analysis_engine
  jadx               ok: false  missing_analysis_engine (REA_JADX_MCP_JAR unset)
  kuna-installation  ok: false  missing_analysis_engine
  skill:identity     ok: false  config_drift
```

`rea doctor` classes the failures as `missing_dependency` / `missing_analysis_engine` / `config_drift` — i.e. **environment gaps, not a broken install**. The CLI itself is functional (`rea capabilities`, `rea --help` and every subcommand respond).

### What is usable here, and what is not

Usable now (no extra tooling):

- `rea capabilities` / `rea doctor` — capability and readiness discovery, **used for this report**.
- Native artifact inventory (`inspect_artifact`, `extract_artifact`) for archives and containers.
- JavaScript/Electron static analysis (`analyze-javascript-application`) — not applicable to a native Android target.

Blocked in this sandbox:

| Missing dependency | Blocked REA features | What it needs |
| --- | --- | --- |
| Java runtime (JRE/JDK) | `inspect_android_package`, `decode-android-resources` (JADX, apktool) | `apt install openjdk-21-jre-headless`, or a JDK tarball |
| `jadx-headless-mcp-0.7.1.jar` | Android static analysis (REA does not ship or download it) | **You must provide the JAR**, then `export REA_JADX_MCP_JAR=/abs/path/jadx-headless-mcp-0.7.1.jar` |
| apktool | Resource/manifest decoding | `apt install apktool` or the official wrapper JAR |
| Ghidra / Hopper / IDA / Kuna | Native code decompilation | Not applicable to a DEX-only Android app |
| `adb` + a device/emulator | Screen capture, prop inspection, bugreports | A real device or emulator reachable from the sandbox |
| Playwright browser | `capture-browser-scenario` | Chromium download (not reachable from this sandbox's egress allow-list) |
| Node `>= 22.23.4` | (works anyway, unsupported version) | Local Node upgrade — cosmetic only |

**Also missing: the target.** No Ludo King APK, screenshots, or recordings were supplied, and this
sandbox is not permitted to download copyrighted app packages.

**Conclusion:** REA is installed and its capability discovery is functional, but every REA path that
could actually analyse Ludo King (APK, device, browser) requires user-provided artifacts plus a Java
toolchain that this sandbox does not have. Per the brief — *"If a reference APK, device, screenshot or
recording is required, ask me for it instead of inventing reverse-engineering findings"* — no
reverse-engineering claims are made below about Ludo King internals. Phase 1 therefore documents
**publicly observable behaviour and published rules only**, and everything the implementation does not
verify is labelled *unverified*.

## 1.2 How to enable the APK-analysis path (if you want it later)

```bash
# 1. Java
sudo apt-get update && sudo apt-get install -y openjdk-21-jre-headless apktool procps
# 2. Caller-supplied JADX MCP jar (REA refuses to download it for you)
export REA_JADX_MCP_JAR=/opt/jadx-headless-mcp-0.7.1.jar
# 3. Verify
npx rea doctor --provider jadx --target /path/to/ludo-king.apk
# 4. Analyse
npx rea inspect-android-package /path/to/ludo-king.apk --detail summary --format json
npx rea decode-android-resources /path/to/ludo-king.apk --format json
```

Note the legal boundary in the brief: static inspection of a legally obtained APK for
interoperability research is one thing; **extracting or redistributing artwork, audio, branding or
server data is not**. This project contains no extracted assets.

## 1.3 Observable feature inventory (public sources)

Documented, publicly observable behaviour of Ludo King (Gametion) relevant to this build:

| Observed feature | Public evidence | Implemented here |
| --- | --- | --- |
| 2-player and 4-player matches | "Matches are available for **2 or 4 players**" [5](https://www.crazygames.cv/game/ludo-king) | ✅ 2P duel (Red vs Yellow) + 4P classic |
| Offline vs computer opponents | Bot/local modes playable entirely offline [1](https://minigame.com/en/game/ludo-king) | ✅ 3 CPU difficulties, no network permission at all |
| Local pass-and-play | "offline modes let you play against the computer or share a device" [2](https://apkpure.net/ludo-king%C2%AE/com.ludo.king) | ✅ 1–2 humans on one device, mixed with CPUs |
| Match saving | "Quick Mode, Save/Load" [2](https://apkpure.net/ludo-king%C2%AE/com.ludo.king) | ✅ auto-save after every action, resume from menu |
| Roll a 6 to leave the base; a 6 grants another roll | [5](https://www.crazygames.cv/game/ludo-king), [2](https://blog.joinjumbo.com/2025/10/28/rules-of-ludo-explained/) | ✅ |
| Three consecutive sixes forfeits the turn | [5](https://www.crazygames.cv/game/ludo-king) | ✅ |
| Landing on an opponent sends it home and grants a bonus roll | [2](https://blog.joinjumbo.com/2025/10/28/rules-of-ludo-explained/) | ✅ |
| Star squares are safe; start squares are safe | [5](https://www.crazygames.cv/game/ludo-king), [3](https://rarepike.com/how-to-play-ludo/) | ✅ eight stars (incl. the four start squares) |
| Two tokens on one square form a blockade | [5](https://www.crazygames.cv/game/ludo-king) | ✅ blockade cannot be captured or landed on |
| Exact roll required to enter the home triangle | [5](https://www.crazygames.cv/game/ludo-king), [2](https://blog.joinjumbo.com/2025/10/28/rules-of-ludo-explained/) | ✅ Classic preset (Quick preset relaxes it) |
| First to bring all four tokens home wins | [1](https://minigame.com/en/game/ludo-king) | ✅ |
| Animated dice, token movement, sound/music | UI traits visible in the published builds [3](https://pazoff.itch.io/ludo) | ✅ re-implemented from scratch (CSS 3D die, hop animation, Web Audio synthesis) |
| Quick / faster match variant | "Quick Mode trims down a full match" [2](https://apkpure.net/ludo-king%C2%AE/com.ludo.king) | ✅ "Quick Match" rule preset |
| Board themes / 2–6 player online, seasons, coins, chat, Snakes & Ladders | [2](https://apkpure.net/ludo-king%C2%AE/com.ludo.king) | ❌ deliberately out of scope (online, monetisation, extra games) |

### Explicitly not claimed

- No screen-by-screen reproduction of Ludo King's UI: no screenshots or recordings were provided and
  none were obtained. The interface here is an **original design** built to the brief's visual
  requirements, not a clone of a specific layout.
- No proprietary rules constants were extracted: the 52-square track, 8 star squares and 4 lanes are
  the standard public Ludo/Pachisi geometry, encoded from the published rules above.
- Ludo King's exact AI heuristics, animation timings, audio and typography are unknown from public
  information and were **not** reverse-engineered.

## 1.4 Design conclusions drawn from the research

1. The rules surface is small and fully specified by public sources → a deterministic, pure rules
   engine is the right core, with the UI as a projection.
2. Offline-first matters more than anything else for this genre → no network code, no permissions.
3. The "feel" (dice tumble, hop-by-hop movement, capture feedback) is what separates a polished game
   from a prototype → animation is a first-class module, not an afterthought.
4. Saving must be automatic and invisible; a phone call should never cost a match.
