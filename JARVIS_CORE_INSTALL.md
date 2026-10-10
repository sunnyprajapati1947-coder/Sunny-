# Step 3 — Python 3.12 ready: OpenJarvis CLI install

Tumhare output se Ubuntu ka **Python 3.12.3** aur **`/opt/jarvis-venv`** active confirm hua hai. Ab base framework install karenge—chat model, voice, phone actions, skills aur ten-source integration abhi nahi.

## Same Ubuntu shell mein

Prompt `(jarvis-venv) root@localhost:~#` hona chahiye. Agar naya session hai to pehle Ubuntu mein login karke:

```bash
. /opt/jarvis-venv/bin/activate
```

Commands ek-ek karke chalao. Kisi command par error ho to aage mat badho; last 20–30 error lines bhejo. Password/API key/private `.env` file ka content nahi.

### 1. Isolated venv ka pip update

```bash
python -m pip install --upgrade pip
```

Ye Ubuntu venv ke pip ko update karta hai, **native Termux Python/pip ko nahi**.

### 2. Reviewed source snapshot ka base package

Niche wali poori command ek command hai—screen par wrap hona normal hai:

```bash
python -m pip install --only-binary=numpy,pandas,pyarrow,pydantic-core,jiter,primp "git+https://github.com/open-jarvis/OpenJarvis.git@764cfc17a23cd6e7ea5fd90bc51e5eef465c8464"
```

- Fixed commit wahi hai jo source catalog mein review kiya tha; moving `main` install nahi kar rahe.
- Git aur package dependencies download hongi. PyArrow/NumPy/pandas ki wajah se total download/storage chhota script jitna nahi hoga; internet/time/free space chahiye. Model weights download nahi honge.
- `--only-binary` listed key native dependencies ke liye prebuilt wheels maangta hai. Agar available wheel nahi mila, install error aayega instead of unplanned long native builds for those packages. **Flag hata kar ya `sudo pip`/global pip use karke retry mat karna**; error bhejo.
- Sirf base package hai. `desktop`, `voice`, `memory-faiss`, `inference-vllm` ya dusre heavy extras install nahi kar rahe.
- `nvidia-ml-py` base metadata mein hai, lekin isse NVIDIA driver/GPU install nahi hota aur GPU mandatory nahi ban jata.
- Build/package installation reviewed third-party code install karti hai; repo instructions ko arbitrary commands ya access permission nahi maana jayega.

### 3. Dependency and CLI verification

```bash
python -m pip check
```

Expected: `No broken requirements found.`

```bash
jarvis --version
```

```bash
jarvis --help
```

**`pip check`, version aur help ka output bhejo.** Help mein commands listed hona un features ki readiness ya phone compatibility ka proof nahi hai.

## Abhi ye commands mat chalana

Bare `jarvis`, `jarvis init`, `jarvis host`, guided installers, skill install, mining/wallet commands, ya kisi upstream `setup.sh` ko abhi run nahi karna. First-run routines config/bootstrap/model downloads start kar sakti hain. Pehle chat backend choose/test karenge.

Kisi API key ki is installation step mein zaroorat nahi. Local inference ke liye alag small GGUF model + engine chahiye; cloud mode ke liye explicitly chosen provider aur locally configured key. Cloud mode mein prompts provider ko jayenge aur costs ho sakte hain.

## Installation ka actual status

- Python environment: user ne ARM64 Ubuntu/Python 3.12.3 par confirm kiya.
- Key packages ke latest Linux ARM64/CPython 3.12 wheel metadata PyPI par check kiye gaye (2026-10-10).
- Same pinned OpenJarvis source ko sandbox ke **Linux x86_64 / Python 3.11** environment mein install karke `pip check`, `jarvis --version`, `jarvis --help` successful check kiye gaye.
- User ke **actual ARM64 phone / Ubuntu proot / Python 3.12.3** output mein `pip check` → `No broken requirements found.`, `jarvis --version` → `1.0.5.dev75+g764cfc1`, aur `jarvis --help` successful aaye. Base CLI verification complete hai; displayed version reviewed source snapshot se match karti hai.
- **Inference/model/backend abhi tested ya configured nahi hai.** CLI help mein feature listed hona uski readiness ka proof nahi hai.
- Personal assistant/phone permissions aur baaki source integrations **abhi planned/deferred hain**. Latest correction: user **bina API key local/offline chat** chahta hai. Next instructions [JARVIS_OFFLINE_SETUP.md](JARVIS_OFFLINE_SETUP.md) mein hain. Earlier Gemini path skip karo. Native engine/model/inference verification abhi pending hai.

## Optional automation file

`automation/install_jarvis_core.sh` wahi steps print karta hai:

```bash
bash automation/install_jarvis_core.sh --commands
```

Default mode read-only hai. `--apply` explicit install hai: sirf Linux/Python 3.12 ke prepared `/opt/jarvis-venv` mein run hota hai; wrong interpreter/global env par installation se pehle refuse karta hai. Source commit ko installed package provenance se verify karta hai. No chat, model, browser, GPU service, skill, cloud key, or financial action is configured by it.

Phone par helper file download karna zaroori nahi—manual commands upar available hain. Repo ki unpublished working-file changes ko GitHub par already available assume mat karo; no remote push was needed for these manual commands.
