# Desktop demo — run Jarvis on a real machine

This is the 10-minute script for proving that Jarvis really types, presses keys,
moves the mouse, focuses windows and reads the screen. It works on Linux, Windows
and macOS. Do it once on a machine with a screen — the sandbox has no display, so
headless sessions only exercise the gating and the honest fallbacks.

## 0 · Read this first

* Desktop input is **disarmed by default**. Nothing types or clicks until you say
  `arm desktop control` (or flip the switch in Settings).
* `desktop panic` (or the switch off) locks input immediately.
* Jarvis never runs user text as a shell command; typing goes through `xdotool`
  / `SendKeys` / AppleScript as plain text.
* Have a browser window ready — that is the safest target for a first `type`.

## 1 · Check the machine

```bash
python3 jarvis.py --desktop-check
```

You want:

```
display: attached
type text / press hotkeys: ok (xdotool)
list and focus windows: ok (wmctrl)
read the screen (OCR): ok (tesseract)
capture the screen: ok (scrot)
paste long text safely: ok (xclip)
```

Missing helpers? The same output prints the exact install command:

```bash
# Linux (X11)
sudo apt install xdotool wmctrl tesseract-ocr scrot xclip
# macOS
brew install tesseract cliclick
# Windows (PowerShell, run as your user)
winget install UB-Mannheim.TesseractOCR
```

Wayland note: `xdotool` needs X11. Use the X11 session, or keep Jarvis for
everything except typing/clicking.

## 2 · Start Jarvis

```bash
python3 jarvis.py            # HUD at http://localhost:7777
```

Open the HUD in Chrome (voice input needs Chrome/Edge).

## 3 · The demo, in order

Type each line into the HUD composer and press Enter.

| # | You say | What should happen |
| - | ------- | ------------------ |
| 1 | `desktop status` | a DESKTOP CONTROL card: platform, display, armed=no |
| 2 | `type hello` | refused politely — control is not armed |
| 3 | `arm desktop control` | “Desktop control armed, Sir…” |
| 4 | `type hello from jarvis` | text appears in the focused window (click the browser first) |
| 5 | `press ctrl+a` | the text you just typed gets selected |
| 6 | `click at 400 300` | pointer moves and clicks at those coordinates |
| 7 | `list windows` | window titles, one per line |
| 8 | `focus <part of a window title>` | that window comes to the front |
| 9 | `what's on my screen` | OCR text of the screen (or local Qwen-VL description) |
| 10 | `desktop panic` | “Input is locked.” Nothing moves after this |

Optional extras:

* `type <a 200-character paragraph>` — clipboard path, much faster than keystrokes.
* `double click at 600 400`
* `press alt+tab`
* `press ctrl+s` — save dialog in the focused app.

## 4 · What “good” looks like in the log

```bash
tail -f logs/jarvis.log
```

Every desktop action is audited with the tool name, arguments and result. A
refused action (disarmed, missing binary, destructive combo) is audited too.

## 5 · Safety drill

1. `arm desktop control`
2. `press ctrl+delete` → blocked (destructive combo)
3. `type $(rm -rf /)` → typed as literal text, never executed
4. `desktop panic`
5. `type still there?` → refused, because input is locked

## 6 · macOS and Windows specifics

**macOS** — the first AppleScript action triggers Automation/Accessibility
permission prompts. Approve them for Terminal/your Python host, then re-run the
demo. `cliclick` (optional) gives precise mouse moves.

**Windows** — `SendKeys` needs the target window focused. `focus chrome` uses
PowerShell `AppActivate`; if a window refuses to focus, click it once manually.
OCR needs Tesseract on PATH (`winget install UB-Mannheim.TesseractOCR`).

## 7 · Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `display: headless` | you are on SSH/wayland-without-X; open a real session |
| `missing (xdotool)` | install it — `--desktop-check` prints the command |
| Text lands nowhere | click the target window first, then `type …` |
| `press …` does nothing | check `focus` first; hotkeys go to the focused window |
| OCR empty | screenshot is dark/blank, or `tesseract` missing |
| Everything refused | control is disarmed — `arm desktop control` |

## 8 · Leave it clean

```bash
python3 jarvis.py --desktop-check    # armed: no after the demo
```

If `armed: yes` is still shown, either say `desktop panic` or flip the Settings
switch off.
