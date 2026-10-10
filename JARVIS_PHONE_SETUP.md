# Jarvis phone setup — tumhare output ke baad next step

Tumhara update successful hua. `No mirror ... selected` warning ke bawajood package download/upgrade complete hua; mirror change karna is step ke liye zaroori nahi. OpenSSH ka service suggestion bhi optional hai—Jarvis ke liye `sshd` start karna ya phone ka SSH access kholna zaroori nahi.

## Tumhare phone ki reported capacity

- CPU architecture: **aarch64 / ARM64**.
- RAM: **7,803,440 KiB ≈ 7.44 GiB** total reported memory; saari RAM assistant ke liye free nahi hai.
- Native Termux Python: **3.14.6**.
- Free storage: `df` ne lagbhag **26 GB** available dikhaya.

## Kya banayenge — aur kya promise nahi kar sakte

Apna lightweight assistant core, personal memory, voice/phone tools, selected resource catalogs aur reviewed adapters bana sakte hain. **Sab ten repos ka full runtime tumhare phone par local/smooth chalega—aisa promise nahi hai.** Abhi ten-source catalog aur deployment plan tayyar hai, complete integration ya Android APK nahi.

Ek waqt par ek chhota local chat model se shuru karenge, agar offline mode choose karte ho. GPU video models, heavyweight routing models aur desktop-browser connections ko default se install nahi karenge. Ordinary Android apps ko Ubuntu install karne se unlimited phone control nahi milta.

## FreeVideo ka sahi role

[FreeVideo](https://github.com/FlashML-org/FreeVideo) ko ten-source catalog mein add kiya gaya hai, lekin is device ke liye mode **remote GPU only / planned** hai.

- [Linux guide](https://github.com/FlashML-org/FreeVideo/blob/main/docs/Linux.md): Linux engine **x86_64 + NVIDIA GPU/driver 580+** ke liye hai.
- [README](https://github.com/FlashML-org/FreeVideo/blob/main/README.md): documented GPU path mein **8 GB VRAM + 16 GB system RAM** se shuru hota hai.
- [pyproject](https://github.com/FlashML-org/FreeVideo/blob/main/pyproject.toml): **Python 3.12** (`>=3.12,<3.13`).
- Code Apache-2.0 hai; model weights ki **MiniMax H3 Community License** alag hai, territorial/acceptable-use restrictions ke saath. ComfyUI aur other dependencies ki licenses bhi alag hain.

Tumhara ARM64 Android phone documented hardware target nahi hai aur RAM target se neeche hai. **Code customize karne ya proot install karne se NVIDIA GPU/VRAM nahi milti.** Phone par iska `setup.sh`, runtime/ComfyUI installer, ya model-weight downloads abhi mat chalao. Future mein compatible GPU PC/server se an explicitly configured, secured adapter evaluate kar sakte hain; abhi aisa server connected nahi hai.

Local video editing/FFmpeg slideshow banana alag capability hai—use FreeVideo ki generative inference bolkar represent nahi karenge.

## Step 2A — normal Termux shell mein

Existing Python ko downgrade/uninstall nahi karna. OpenJarvis ka supported Python range 3.10–3.13 hai; Jev ko 3.12+ aur FreeVideo ko specifically 3.12 chahiye. Isliye Python 3.12 ka **alag** Linux environment rakhenge. Alag environment se hardware compatibility guaranteed nahi hoti.

Commands **ek-ek karke** chalao. Ye current PRoot-Distro 5.x syntax hai; normal official repository package ko use karo.

```bash
pkg install proot-distro
```

```bash
mkdir -p "$HOME/Jarvis"
```

```bash
proot-distro install --name jarvis-linux ubuntu:24.04
```

```bash
proot-distro login --bind "$HOME/Jarvis:/root/Jarvis" jarvis-linux
```

- Android replace nahi hota, root ki zaroorat nahi hai.
- Installer download/storage/time use karega; Wi-Fi convenient hai.
- Ubuntu folder mein fake `root` prompt milna Android root access nahi hai.
- Binding sirf tumhara Jarvis working folder share karta hai. Native `$HOME/Jarvis` Ubuntu mein `/root/Jarvis` dikhega.
- Agar `jarvis-linux already exists` aaye, install repeat/reset/remove mat karna. Login command try karo; distro/version verify karo. Error aaye to uska output bhejo.
- Agar `ubuntu:24.04` unsupported alias aaye, proot version/help output bhejo. Kisi unrelated distro ko delete mat karna.

PRoot-Distro convenience userland hai, strong security sandbox nahi. Unknown repo/skill code ko blindly execute mat karo.

## Step 2B — ab Ubuntu shell ke andar

```bash
apt update
```

```bash
apt install -y python3 python3-venv python3-pip git curl ca-certificates
```

```bash
python3 --version
```

**Expected: Python 3.12.x.** Agar version alag aaye to neeche ka step rok do aur output bhejo.

Ek naya Linux virtual environment banao. Android shared storage/bound folder ke andar venv nahi bana rahe, taaki symlink/permission issues avoid hon:

```bash
python3 -m venv /opt/jarvis-venv
```

```bash
. /opt/jarvis-venv/bin/activate
```

```bash
python --version
```

Agar `/opt/jarvis-venv` pehle se tumhara koi environment hai, usko overwrite/recreate mat karna; pehle version aur contents inspect karo.

**Python 3.12.3 aur venv user output mein confirm ho gaye hain.** Ab [Step 3: OpenJarvis CLI installation](JARVIS_CORE_INSTALL.md) ke commands use karo. Model/backend aur baaki runtimes abhi individually configure/test karne baaki hain.

Ye commands **sirf Linux/Python environment taiyar karte hain**, full Jarvis, source integration, AI models, video inference ya cloud accounts nahi.

## Baad mein wapas kaise enter karein

Ubuntu se normal Termux mein wapas jaane ke liye:

```bash
exit
```

Next session, native Termux mein:

```bash
proot-distro login --bind "$HOME/Jarvis:/root/Jarvis" jarvis-linux
```

Phir Ubuntu mein:

```bash
. /opt/jarvis-venv/bin/activate
```

## Optional helper files

`jarvis_start.py` standalone hai; native Python 3.14 par catalog/check/plan commands chal sakti hain:

```bash
python jarvis_start.py --sources
python jarvis_start.py --phone-plan
```

`--phone-plan` sirf plan print karta hai, execute nahi karta. `--fetch freevideo` sirf pinned **source code** download karta hai; engine/model installation aur integration nahi.

`automation/prepare_jarvis_linux.sh` mein wahi base-environment commands hain. Default/dry run:

```bash
bash automation/prepare_jarvis_linux.sh --commands
```

Explicit `--apply` ko normal Termux mein chalane par ye Ubuntu/base Python packages prepare karta hai, existing valid container/venv reuse karta hai, mismatching containers/venvs overwrite nahi karta. **Kisi upstream repo ka installer, GPU model ya runtime nahi chalata.** Manual commands upar diye hain; helper file download karna zaroori nahi.

## Ten sources: deployment strategy, not completed integrations

| Source | Phone strategy |
|---|---|
| OpenJarvis | Isolated Linux/Python 3.12 candidate; CLI install/ARM tests next |
| jev-ultrafast | External/compatible browser connection; Android Chrome ko desktop harness assume nahi karenge |
| laya | Heavy model deferred; PyTorch/ARM/memory tests ke baad optional |
| Graft | Optional coding-context service; Node/native dependency tests required |
| TradingAgents | Optional research only; not brokerage/order execution |
| FreeVideo | Remote compatible GPU only; not connected, no local model download |
| build-your-own-x | Tutorial links; no detected repository license, no unreviewed content copying |
| public-apis | API discovery; individual connectors/auth/terms alag |
| free-programming-books | Reference links; linked books ki licenses alag |
| awesome-agent-skills | Discovery only; skills ko alag security/license review chahiye |

Cloud/GPU server use karne par prompts/media server/provider ko jayenge aur charges ho sakte hain. Keys/passwords/private `.env` contents chat ya public Git mein nahi bhejne.
