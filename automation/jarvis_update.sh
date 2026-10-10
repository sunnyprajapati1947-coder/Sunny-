#!/data/data/com.termux/files/usr/bin/bash
# jarvis-update — Jarvis khud GitHub se naya code leta hai.
# Safe update: fetch -> dikhao -> apply -> test -> fail ho to khud rollback.
set -u
ROOT="${NOVA_ROOT:-$HOME/Nova}"
BRANCH="arena/648528ed-sunny"

cd "$ROOT" 2>/dev/null || { echo "Repo nahi mila: $ROOT"; exit 1; }

echo "== JARVIS UPDATE =="

git fetch -q origin "$BRANCH" 2>/dev/null || { echo "Fetch fail - internet check karo Boss."; exit 1; }

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null) || { echo "Branch nahi mili."; exit 1; }

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "Already latest hai Boss. Kuch naya nahi hai."
  exit 0
fi

echo "Naya code mila ye hai:"
git log --oneline "$LOCAL..$REMOTE" | head -15
echo

# User ke local changes stash me safe.
STASHED=0
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  if git stash -q -u 2>/dev/null; then
    STASHED=1
    echo "(Tumhare local changes stash me safe hain)"
  fi
fi

echo "Update apply kar raha hu..."
chmod +x automation/*.sh 2>/dev/null || true
if ! git merge -q --ff-only "origin/$BRANCH" 2>/dev/null; then
  echo "Merge fail - rollback kar raha hu."
  [ "$STASHED" = "1" ] && git stash pop -q 2>/dev/null
  exit 1
fi

echo "Naye code ke tests chala raha hu (30-60 sec)..."
if python3 -m unittest discover -s tests -q >/dev/null 2>&1; then
  echo "UPDATE SAFE: sab tests pass ho gaye. Naya version active hai Boss!"
  [ "$STASHED" = "1" ] && git stash pop -q 2>/dev/null
  echo "Tip: bash automation/setup_termux.sh se commands refresh ho jayenge."
  exit 0
else
  echo "Tests FAIL hue - update wapas kar raha hu (rollback)..."
  git reset -q --hard "$LOCAL"
  [ "$STASHED" = "1" ] && git stash pop -q 2>/dev/null
  echo "Purana version wapas active hai. Ye issue report karo."
  exit 1
fi
