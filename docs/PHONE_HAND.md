# The phone hand — Jarvis that actually does things on Android

Jarvis par PC bas baat karta hai. Phone par woh **haath** lagata hai: call, SMS,
notification, torch, volume, clipboard, camera, contacts, location.

Yeh guide do cheezein cover karti hai: **setup** (5 minute) aur **demo** (5 minute).

---

## 0 · How it works (one paragraph)

Two halves, both required:

| Half | What it is | Install |
| --- | --- | --- |
| **Termux:API app** | Android app that gives Termux permission to touch the phone | F-Droid / Play Store → “Termux:API” |
| **`termux-api` package** | Command-line wrappers (`termux-sms-send`, `termux-torch`, …) | `pkg install termux-api` |

Jarvis only ever calls those `termux-*` commands with an explicit argument list —
no shell, no `eval`, no string concatenation into a command. Text you write (an
SMS, a spoken line) goes through as a single argv entry, so `;`, `|`, `>` inside a
message are just characters.

---

## 1 · Setup on the phone

```bash
# inside Termux
cd ~/Sunny-                     # or wherever you cloned the repo
bash automation/termux_jarvis.sh install
bash automation/termux_jarvis.sh hand
```

`hand` prints a capability table:

```
PHONE HAND · Termux:API
  17/17 commands present
Live probe (needs the Termux:API app installed):
{"health": "GOOD", "percentage": 74, "plugged": "PLUGGED_USB", ...}
```

If it says `missing: termux-sms-send` → `pkg install termux-api`.
If the live probe prints an error instead of JSON → open the **Termux:API** app
once and grant the permissions Android asks for (Phone, SMS, Camera, Location,
Notifications — whichever you want Jarvis to use).

---

## 2 · Start Jarvis

```bash
bash automation/termux_jarvis.sh start     # wake-lock + HUD + open browser
```

The HUD footer now shows **PHONE 17/17**. Green means every action is live.

---

## 3 · The demo, in order

Say or type these in the HUD:

| # | Say | What happens |
| - | --- | ------------ |
| 1 | `phone check` | capability table, 17/17 expected |
| 2 | `phone status` | battery %, charging, Wi-Fi SSID, hands-on list |
| 3 | `phone battery` | charge, temperature, health |
| 4 | `torch on` / `torch off` | flashlight (camera permission asked once) |
| 5 | `vibrate` | a short buzz |
| 6 | `phone notifications` | notification shade summary |
| 7 | `phone contacts ravi` | real phone contacts matching “ravi” |
| 8 | `save ravi's number as 9876543210` | remember it once, works forever |
| 9 | `call ravi` | **real call** (approval sheet first) |
| 10 | `sms ravi saying running late` | **real SMS** (approval sheet first) |
| 11 | `notify me on the phone that tea is ready` | notification in the shade |
| 12 | `phone volume 60` | music stream to 60% |
| 13 | `phone clipboard` | reads the phone clipboard |
| 14 | `say good morning on the phone` | phone's own TTS speaks |
| 15 | `take a photo with the phone` | camera photo saved, file card in chat |
| 16 | `where is my phone` | GPS/network location |
| 17 | `open youtube on the phone` | opens on the phone |

Hinglish bhi chalta hai: `ravi ko call karo`, `ravi ko sms bhejo main late hoon`,
`torch on kar do`, `phone check karo`.

---

## 4 · Approval and safety

* **Call and SMS need approval** every time — the HUD shows the number and text
  before anything is sent. `phone_photo` also asks (a camera is a camera).
* Everything else (torch, volume, notify, clipboard, contacts, location) is
  read-only or harmless and runs directly.
* Every action is audited in `logs/jarvis.log`, and the hand appends a short
  trail to `data/jarvis/phone/hand.log`.
* There is no shell: a message is an argv string, never a command.

**What Jarvis will not do:** silent background SMS, reading OTPs out of the
notification shade and acting on them, or bypassing the approval sheet. If you
want that, it is a deliberate setting we have not added, and I would push back on
it anyway.

---

## 5 · On a PC (the honest fallback)

Run the same commands on your laptop and Jarvis says what it can:

* `call ravi` → opens `tel:` link (one tap on the phone does the rest)
* `sms ravi saying hi` → opens `sms:` link with the text filled
* `torch on`, `vibrate`, `phone notifications` → “I cannot do that from here”
  plus the exact Termux:API setup steps

Nothing pretends to have worked. `phone check` on a PC shows
`android bridge: not this machine`.

---

## 6 · HUD ↔ phone, both directions

| Direction | How |
| --- | --- |
| PC → phone (actions) | the phone hand above, running **on** the phone |
| PC → phone (as a screen) | open `http://<pc-ip>:7777` on the phone, or install the PWA |
| Phone → PC | the PWA is a remote control; wake word + barge-in work while the tab is open |

A phone cannot be driven from the PC over the network without adb or a
device-owner app — that is an Android platform rule, not a Jarvis limitation. The
honest path is Jarvis *on* the phone, which is what this module is.

---

## 7 · Troubleshooting

| Symptom | Fix |
| --- | --- |
| `0/17 commands present` | `pkg install termux-api` |
| commands exist, live probe errors | open the **Termux:API** app once, grant permissions |
| `termux-sms-send` fails | SMS permission for Termux:API; some carriers block non-default SMS apps |
| torch does nothing | camera permission; some OEMs (Xiaomi/Oppo) restrict torch to system apps |
| notifications empty | notification access for Termux:API (Settings → Notifications → Device & app notifications) |
| location empty | Android location permission + GPS on; indoor network fix is slow |
| camera fails | camera permission, and close other camera apps first |
| battery shows `?` | open Termux:API once; the app must be allowed to run in background |
| wake word stops on lock screen | browser limitation — keep the PWA open or use the PC |

---

## 8 · Uninstall / stop

```bash
bash automation/termux_jarvis.sh stop      # stops Jarvis, releases the wake-lock
pkg uninstall termux-api                   # optional: remove the CLI wrappers
```

Uninstalling the **Termux:API app** removes every Android permission at once —
that is the cleanest kill switch.
