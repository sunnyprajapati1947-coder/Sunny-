#!/data/data/com.termux/files/usr/bin/bash
# jarvis-gemini-key — Gemini API key safely add karo.
#
# Usage (dono chalega):
#   bash ~/Nova/automation/add_gemini_key.sh          # poochh kar lega
#   bash ~/Nova/automation/add_gemini_key.sh AIza...   # direct argument
#
# Key sirf ~/Nova/config/gemini.key me save hoti hai (chmod 600) —
# wo file .gitignore me hai, git me KABHI commit nahi hoti.
set -u
ROOT="${NOVA_ROOT:-$HOME/Nova}"
KEY_FILE="$ROOT/config/gemini.key"

if [ "${1:-}" != "" ]; then
  KEY="$1"
else
  echo "Gemini API key paste karo (screen pe dikhegi, koi upload nahi hota):"
  printf "> "
  read -r KEY
fi

# Whitespace hatao.
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"

if [ "${#KEY}" -lt 20 ]; then
  echo "ERROR: ye valid key nahi lagti (bahut chhoti). Google AI Studio se copy karo:"
  echo "  https://aistudio.google.com/apikey"
  exit 1
fi

mkdir -p "$ROOT/config"
umask 177
printf '%s\n' "$KEY" > "$KEY_FILE"
chmod 600 "$KEY_FILE"

echo
echo "SUCCESS: key save ho gayi -> $KEY_FILE"
echo "(File git me kabhi commit nahi hogi - .gitignore me protected hai)"
echo
echo "Ab test karo (internet chahiye):"
echo "  python3 -c \"from core.gemini_lane import key_status; print(key_status())\""
echo "  python3 -c \"from core.gemini_lane import ask_gemini; print(ask_gemini('ek line me hello bolo'))\""
echo
echo "Phir Jarvis chalao: jarvis-start  (ab smart lane Gemini se chalegi)"
