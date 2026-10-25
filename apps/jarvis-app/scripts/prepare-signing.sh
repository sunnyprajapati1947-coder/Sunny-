#!/usr/bin/env bash
# CI only. Decodes the release keystore into $RUNNER_TEMP and exports the
# JARVIS_SIGNING_* variables Gradle reads. Never prints key material.
set -euo pipefail
umask 077
: "${RUNNER_TEMP:?}" "${GITHUB_ENV:?}" "${GITHUB_REPOSITORY:?}"
KEY_DIR="$RUNNER_TEMP/jarvis-signing"
mkdir -p "$KEY_DIR"

if [ -n "${JARVIS_RELEASE_KEYSTORE_BASE64:-}" ]; then
  STORE_PASS="${JARVIS_RELEASE_STORE_PASSWORD:?JARVIS_RELEASE_STORE_PASSWORD missing}"
  KEY_ALIAS="${JARVIS_RELEASE_KEY_ALIAS:?JARVIS_RELEASE_KEY_ALIAS missing}"
  printf '%s' "$JARVIS_RELEASE_KEYSTORE_BASE64" | base64 --decode > "$KEY_DIR/release.p12"
  ORIGIN="jarvis secrets"
elif [ -n "${SPDYI_RELEASE_KEYSTORE_BASE64:-}" ]; then
  # Same developer identity as the other apps in this repo, so future JARVIS
  # builds keep the same signing key and can update in place.
  STORE_PASS="${SPDYI_RELEASE_STORE_PASSWORD:?SPDYI_RELEASE_STORE_PASSWORD missing}"
  KEY_ALIAS="${SPDYI_RELEASE_KEY_ALIAS:?SPDYI_RELEASE_KEY_ALIAS missing}"
  printf '%s' "$SPDYI_RELEASE_KEYSTORE_BASE64" | base64 --decode > "$KEY_DIR/release.p12"
  ORIGIN="existing developer key"
else
  previous=$(gh release list --repo "$GITHUB_REPOSITORY" --limit 100 --json tagName \
    --jq '[.[] | select(.tagName | startswith("jarvis-v"))] | length')
  if [ "$previous" -ne 0 ]; then
    echo '::error::A JARVIS release already exists. Restore its signing key into JARVIS_RELEASE_* secrets instead of rotating it.'
    exit 1
  fi
  STORE_PASS=$(openssl rand -hex 32)
  KEY_ALIAS=jarvis-release
  echo "::add-mask::$STORE_PASS"
  STORE_PASS="$STORE_PASS" keytool -genkeypair -noprompt -keystore "$KEY_DIR/release.p12" \
    -storetype PKCS12 -storepass:env STORE_PASS -keypass:env STORE_PASS -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=JARVIS, O=SunnyAI' >/dev/null 2>&1
  ORIGIN="newly generated (add it to JARVIS_RELEASE_* secrets for future updates)"
fi

echo "::add-mask::$STORE_PASS"
{
  echo "JARVIS_SIGNING_STORE_FILE=$KEY_DIR/release.p12"
  echo "JARVIS_SIGNING_STORE_PASSWORD=$STORE_PASS"
  echo "JARVIS_SIGNING_KEY_PASSWORD=$STORE_PASS"
  echo "JARVIS_SIGNING_KEY_ALIAS=$KEY_ALIAS"
} >> "$GITHUB_ENV"
echo "signing identity: $ORIGIN"
