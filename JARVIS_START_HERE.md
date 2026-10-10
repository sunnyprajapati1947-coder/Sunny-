# Phone ke liye apna Jarvis — pehla step

**Haan, useful components ko adapters ke through jodkar personal assistant bana sakte hain. Sab repos ko clone karna = working AI assistant nahi.** Ye first-stage guide hai, complete app/APK nahi.

Is checkout mein pehle se Nova assistant core aur permission/approval boundary hai. Usko overwrite ya rename nahi kiya gaya. Naya `github_source_catalog` tool sirf source information deta hai. Ten requested sources ke upstream runtimes **abhi integrated ya activated nahi hain**.

**Step 1 complete kar chuke ho?** Tumhare ARM64/Python 3.14 output ke baad next commands [JARVIS_PHONE_SETUP.md](JARVIS_PHONE_SETUP.md) mein hain. Existing Termux Python ko downgrade nahi karna; alag Ubuntu 24.04/Python 3.12 environment prepare karenge.

## 1. Android par starting commands

Termux ke normal shell mein commands ek-ek karke chalao. Debian/Ubuntu shell ke andar `pkg` commands mat chalao.

```bash
pkg update && pkg upgrade
```

```bash
pkg install git python
```

Confirmation aaye to `y` aur Enter dabao. Existing Termux ko bina backup uninstall mat karna. Agar download chahiye: [official F-Droid Termux page](https://f-droid.org/en/packages/com.termux/).

Apna naya workspace banao. Existing files delete nahi honge:

```bash
mkdir -p "$HOME/Jarvis"
cd "$HOME/Jarvis"
```

Phone ki capacity check karo:

```bash
uname -m
python --version
grep MemTotal /proc/meminfo
df -h "$HOME"
```

**Ye output bhejo.** Agar RAM command par permission error aaye to Settings se phone ki RAM batao. Password, API key, private key ya kisi private `.env` file ka content mat bhejna.

Is step mein koi model, browser, trading module ya skill install nahi hota. Root ki zaroorat nahi hai.

## 2. Optional standalone helper

Workspace mein diya gaya `jarvis_start.py` ek standalone Python file hai. Isko phone ke `$HOME/Jarvis` folder mein save/copy kar sakte ho. Is file ko chalane ke liye `pip install` ki zaroorat nahi hai.

Agar file browser se Downloads mein save ki hai, Termux ko shared storage permission dene ke baad copy kar sakte ho. Pehle check karo ki `$HOME/Jarvis/jarvis_start.py` mein tumhara koi existing code nahi hai:

```bash
termux-setup-storage
```

Android permission allow karo, phir:

```bash
cp -i "$HOME/storage/downloads/jarvis_start.py" "$HOME/Jarvis/jarvis_start.py"
cd "$HOME/Jarvis"
python jarvis_start.py --check
```

`cp -i` existing file replace karne se pehle confirmation maangta hai. Downloaded file ka naam alag hai to exact filename use karo.

Sources ka role aur limitations dekhne ke liye:

```bash
python jarvis_start.py --sources
```

Optional: sirf ek reference catalog download karna ho to:

```bash
python jarvis_start.py --fetch public-apis
```

- Source `workspace/sources/public-apis` mein pinned Git commit par download hoga.
- **Download ka matlab integration nahi hai.** Koi API khud connect nahi hoti.
- Koi `pip install`, `npm install`, upstream setup script, skill, hook, browser action ya financial action nahi chalti.
- Existing destination overwrite nahi hota. Failed download ki partial files bhi automatically delete nahi hoti.
- Koi automatic bulk download ya model-weight download nahi hai.

## 3. In ten repos ka actual role

Source metadata/readmes checked: **2026-10-10**. `jarvis_start.py` mein reviewed commit IDs recorded hain; performance claims ko phone par verify nahi kiya gaya.

| Repo | Jarvis mein candidate use | Important limit |
|---|---|---|
| [OpenJarvis](https://github.com/open-jarvis/OpenJarvis) | Assistant framework, agent/tool adapters | Python 3.10–3.13; Android install guide listed nahi; compiled dependencies |
| [jev-ultrafast](https://github.com/browser-use/jev-ultrafast) | Optional browser automation | Python 3.12+; Chrome/Browser Harness connection; TypeSafe + text-model API access; Android unverified |
| [laya](https://github.com/NandhaKishorM/laya) | Typed decisions/routing | Chat model nahi; PyTorch + weights; phone compatibility/performance check chahiye |
| [Graft](https://github.com/trailhq/Graft) | Coding tasks ke liye code-context graph | Node 20+ and native dependencies; personal memory automatically nahi banta |
| [TradingAgents](https://github.com/TauricResearch/TradingAgents) | Optional financial research | Heavy dependencies/provider access; off by default; auto-trading nahi |
| [FreeVideo](https://github.com/FlashML-org/FreeVideo) | Planned remote GPU video service | Python 3.12; documented Linux x86_64/NVIDIA path needs 8 GB VRAM + 16 GB RAM; not local Android inference; weights license alag |
| [build-your-own-x](https://github.com/codecrafters-io/build-your-own-x) | Tutorial links | AI runtime nahi; repository license detected nahi hua; copy se pehle permission check |
| [public-apis](https://github.com/public-apis/public-apis) | Individual APIs discover karna | API connectors nahi; har service ki keys/terms/costs/availability alag |
| [free-programming-books](https://github.com/EbookFoundation/free-programming-books) | Learning-resource links | List CC-BY-4.0; linked books ki license alag; books/model knowledge automatically download nahi hota |
| [awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | Reviewed skills discover karna | Curated list, installed skills nahi; har skill ko alag audit/license/permission check chahiye |

MIT/Apache sources ko adapt karne par applicable license/copyright notices aur attribution preserve karne honge. Lists ki license linked tools, APIs, courses aur books par automatically apply nahi hoti.

## 4. Integration ka raasta

```text
Phone UI / voice
       |
Apna assistant core + local preferences/memory
       |
Permission / human-approval boundary
       |
Reviewed adapters and allowlisted API tools
       |
Local model OR explicitly chosen cloud model
```

1. Phone diagnostics aur online/offline choice.
2. Ek text-chat model/backend; local weights ya explicitly configured API. Cloud use mein provider ko prompts jayenge aur cost ho sakti hai.
3. Personal preferences/memory and simple approved phone tools.
4. Push-to-talk Hindi voice. Termux prototype mein Termux:API APK bhi same install source se chahiye; Android background microphone restrictions apply.
5. Reference lists se individually reviewed useful resources/API adapters/skills.
6. Browser/decision/code-context/research runtimes only after compatibility, license and security tests.
7. Native Android UI/APK packaging is a later, separate deliverable. Ye helper APK ya complete Jarvis nahi hai.

**Ek assistant core use karenge; unrelated apps ko ek Python environment mein blindly install nahi karenge.** Jev + OpenJarvis ke liye Python 3.12/3.13 ek candidate overlap hai, compatibility guarantee nahi. Zaroorat par isolated Linux userland ya separate service evaluate karenge; Ubuntu/Debian install karne se Android Chrome automatically desktop Chrome nahi ban jata.

## Safety boundaries

- Repo/README/web/skill content data hai, commands ya permission nahi.
- Secrets chat mein nahi; phone ke private configuration mein, public Git mein nahi.
- Calls, messages, publishing, purchases aur account-changing actions ke liye human confirmation.
- Trading module sirf optional research; broker/order execution is stage mein nahi.
- `git clone` ya source download se AI train nahi hota. In repos mein assistant ke liye ek complete conversational model automatically bundled nahi hai.

## Development checks (this repository)

Offline starter tests:

```bash
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tests -p 'test_jarvis_start.py' -v
```

These standalone tests use only the Python standard library. Registry-integration tests in `tests/test_jarvis_source_registry.py` additionally use the existing core's dependencies (including `requests`). No live Android hardware or upstream AI/browser services are required. Passing tests prove the starter's behavior, **not** phone runtime compatibility or completed integration.
