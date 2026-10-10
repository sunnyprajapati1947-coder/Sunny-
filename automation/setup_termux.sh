#!/data/data/com.termux/files/usr/bin/bash
# Nova one-command Termux setup.
#
# Usage (after cloning the repo to ~/Nova):
#   git clone -b arena/648528ed-sunny https://github.com/sunnyprajapati1947-coder/Sunny-.git Nova
#   bash ~/Nova/automation/setup_termux.sh
#
# Safe to re-run any time; every step is idempotent.
set -u
cd "$(dirname "$0")/.."
REPO="$(pwd)"

echo "== Nova Termux setup =="
echo "Repo: $REPO"
echo

echo "== [1/5] Termux packages (git, python, curl, termux-api for voice) =="
if command -v pkg >/dev/null 2>&1; then
  pkg update -y >/dev/null 2>&1 || true
  pkg install -y git python curl termux-api || true
  echo "NOTE: Voice ke liye 'Termux:API' app bhi install karna (F-Droid/Play Store se)"
  echo "      aur usse ek baar kholna hai. Tabhi bolna/sunna kaam karega."
else
  echo "pkg not found - assuming a non-Termux system, skipping."
fi

echo
echo "== [2/5] Python dependency: requests (needed by web tools) =="
if python3 -c "import requests" 2>/dev/null; then
  echo "requests: already installed"
else
  pip install -q requests 2>/dev/null \
    || pip install -q --break-system-packages requests 2>/dev/null \
    || echo "WARNING: could not install requests - web tools will not work."
fi

echo
echo "== [3/5] Tool registry check =="
python3 - <<'PY' || exit 1
from core.tool_bridge import build_registry
registry = build_registry()
print(f"Registry OK: {len(registry.names())} tools")
PY

echo
echo "== [4/5] Test suite =="
if python3 -m unittest discover -s tests -q; then
  echo "ALL TESTS PASS"
else
  echo "Some tests failed - scroll up for details."
fi

echo
echo "== [5/5] GitHub sources =="
python3 -m core.source_manifest

# Install `jarvis` / `jarvis-start` / `jarvis-doctor` commands into PATH.
PREFIX_BIN="/data/data/com.termux/files/usr/bin"
if [ -d "$PREFIX_BIN" ] && [ -w "$PREFIX_BIN" ]; then
  ln -sf "$REPO/automation/jarvis_start.sh" "$PREFIX_BIN/jarvis-start"
  ln -sf "$REPO/automation/jarvis_doctor.sh" "$PREFIX_BIN/jarvis-doctor"
  printf '#!/data/data/com.termux/files/usr/bin/bash\nexec python3 %s/jarvis.py "$@"\n' "$REPO" > "$PREFIX_BIN/jarvis"
  chmod +x "$PREFIX_BIN/jarvis"
  echo
  echo "Commands install ho gaye: jarvis-start, jarvis-doctor, jarvis (kahin se bhi chalao)"
fi

echo
echo "== Done. Next steps =="
echo "1) Jarvis voice assistant chalao (text mode me bhi chalega):"
echo "     python3 $REPO/jarvis.py --text"
echo "   Voice mode ke liye: Termux:API app install karo, phir:"
echo "     python3 $REPO/jarvis.py"
echo "2) Human-jaisi baat karne ke liye local model lane (one-time, see below):"
echo
echo "   Local model lane (one-time setup):"
echo "     pkg install -y git cmake clang"
echo "     git clone https://github.com/ggml-org/llama.cpp ~/llama.cpp"
echo "     cmake -S ~/llama.cpp -B ~/llama.cpp/build -DGGML_LLAMAFILE=OFF -DLLAMA_CURL=OFF"
echo "     cmake --build ~/llama.cpp/build --target llama-server -j 4"
echo "     mkdir -p ~/models"
echo "     curl -L -o ~/models/Qwen3-0.6B-Q4_K_M.gguf 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf'"
echo "     bash $REPO/automation/start_fast_lane.sh"
echo
echo "   (If the model link 404s, browse huggingface.co/Qwen for the GGUF repo.)"
