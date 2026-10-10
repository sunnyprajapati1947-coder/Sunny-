#!/data/data/com.termux/files/usr/bin/bash
# Download a local Qwen model for Nova/Jarvis, with size verification.
#
# Usage:  bash ~/Nova/automation/download_model.sh
#
# The old setup instructions pointed at a wrong HuggingFace path, which
# downloaded a 15-byte "Not Found" page instead of the model. This script
# downloads from verified mirrors, uses curl --fail so errors never look
# like success, and refuses to keep files smaller than 100 MB.
set -u

mkdir -p "$HOME/models"
DEST="$HOME/models/Qwen3-0.6B-Q4_K_M.gguf"
MIN_BYTES=$((100 * 1024 * 1024))   # 100 MB sanity floor (real file ~397 MB)

# Verified mirrors of the same Qwen3-0.6B Q4_K_M quant.
URLS=(
  "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf"
  "https://huggingface.co/bartowski/Qwen_Qwen3-0.6B-GGUF/resolve/main/Qwen_Qwen3-0.6B-Q4_K_M.gguf"
)

# A previously broken download leaves a tiny error page behind - remove it.
if [ -f "$DEST" ]; then
  size=$(stat -c %s "$DEST" 2>/dev/null || echo 0)
  if [ "$size" -lt "$MIN_BYTES" ]; then
    echo "Purana file kharab tha ($size bytes) — delete kar raha hu."
    rm -f "$DEST"
  else
    echo "Model already downloaded: $DEST ($(( size / 1024 / 1024 )) MB)"
    exit 0
  fi
fi

echo "Qwen3-0.6B (Q4_K_M, ~397 MB) download kar raha hu..."
echo "WiFi pe karo; 5-15 min lagenge. Interruption mat karo."
echo

for url in "${URLS[@]}"; do
  echo "Try: $url"
  # --fail: HTTP errors (404 etc.) ko fail mana jata hai, error page save nahi hoti.
  # --location: redirect follow. --continue-at - agar beech me ruka tha.
  if curl --fail --location --continue-at - --output "$DEST.part" --progress-bar "$url"; then
    size=$(stat -c %s "$DEST.part" 2>/dev/null || echo 0)
    if [ "$size" -ge "$MIN_BYTES" ]; then
      mv "$DEST.part" "$DEST"
      echo
      echo "SUCCESS: $DEST ($(( size / 1024 / 1024 )) MB)"
      echo "Next: bash ~/Nova/automation/start_fast_lane.sh"
      exit 0
    fi
    echo "Download incomplete ($size bytes) - next mirror try karta hu."
    rm -f "$DEST.part"
  else
    echo "Ye mirror fail hua - next try karta hu."
    rm -f "$DEST.part"
  fi
done

echo
echo "ERROR: dono mirrors fail hue. Checks:"
echo "  1) Internet on hai? curl https://huggingface.co -I"
echo "  2) Storage space hai? df -h ~"
echo "  3) Browser me ye kholo: https://huggingface.co/unsloth/Qwen3-0.6B-GGUF"
exit 1
