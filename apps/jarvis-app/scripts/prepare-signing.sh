#!/usr/bin/env bash
# CI only. Resolves the release keystore and exports the JARVIS_SIGNING_*
# variables Gradle reads. Key material is never printed.
#
# Order of preference:
#   1. JARVIS_RELEASE_* secrets  (most durable)
#   2. SPDYI_RELEASE_* secrets   (same developer identity as the other apps here)
#   3. .signing/ carried between runs by the Actions cache key `jarvis-signing-v1`
#   4. generate a fresh key (only safe when no earlier release used another key)
set -euo pipefail
umask 077
: "${GITHUB_ENV:?}" "${GITHUB_WORKSPACE:?}" "${GITHUB_REPOSITORY:?}"
KEY_DIR="$GITHUB_WORKSPACE/.signing"
mkdir -p "$KEY_DIR"
STORE="$KEY_DIR/release.p12"
PASS_FILE="$KEY_DIR/password"
PASS_FILE_BAK="$KEY_DIR/password.bak"

if [ -n "${JARVIS_RELEASE_KEYSTORE_BASE64:-}" ]; then
  STORE_PASS="${JARVIS_RELEASE_STORE_PASSWORD:?JARVIS_RELEASE_STORE_PASSWORD missing}"
  KEY_ALIAS="${JARVIS_RELEASE_KEY_ALIAS:?JARVIS_RELEASE_KEY_ALIAS missing}"
  printf '%s' "$JARVIS_RELEASE_KEYSTORE_BASE64" | base64 --decode > "$STORE"
  ORIGIN="jarvis secrets"
elif [ -n "${SPDYI_RELEASE_KEYSTORE_BASE64:-}" ]; then
  STORE_PASS="${SPDYI_RELEASE_STORE_PASSWORD:?SPDYI_RELEASE_STORE_PASSWORD missing}"
  KEY_ALIAS="${SPDYI_RELEASE_KEY_ALIAS:?SPDYI_RELEASE_KEY_ALIAS missing}"
  printf '%s' "$SPDYI_RELEASE_KEYSTORE_BASE64" | base64 --decode > "$STORE"
  ORIGIN="existing developer key"
elif [ -s "$STORE" ] && [ -s "$PASS_FILE" ]; then
  STORE_PASS=$(cat "$PASS_FILE")
  KEY_ALIAS=$(cat "$KEY_DIR/alias" 2>/dev/null || echo jarvis-release)
  ORIGIN="cached signing key (same key as the previous release)"
else
  # A cached keystore without its password file is useless: rotate and say so.
  STORE_PASS=$(openssl rand -hex 32)
  KEY_ALIAS=jarvis-release
  echo "$STORE_PASS" > "$PASS_FILE"
  echo "$KEY_ALIAS" > "$KEY_DIR/alias"
  echo "::add-mask::$STORE_PASS"
  STORE_PASS="$STORE_PASS" keytool -genkeypair -noprompt -keystore "$STORE" \
    -storetype PKCS12 -storepass:env STORE_PASS -keypass:env STORE_PASS -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=JARVIS, O=SunnyAI' >/dev/null 2>&1
  ORIGIN="newly generated key — later builds reuse it from the Actions cache"
fi

echo "::add-mask::$STORE_PASS"
{
  echo "JARVIS_SIGNING_STORE_FILE=$STORE"
  echo "JARVIS_SIGNING_STORE_PASSWORD=$STORE_PASS"
  echo "JARVIS_SIGNING_KEY_PASSWORD=$STORE_PASS"
  echo "JARVIS_SIGNING_KEY_ALIAS=$KEY_ALIAS"
  echo "JARVIS_SIGNING_ORIGIN=$ORIGIN"
} >> "$GITHUB_ENV"
rm -f "$PASS_FILE_BAK"
echo "signing identity: $ORIGIN"
echo "keystore sha256: $(sha256sum "$STORE" | cut -d' ' -f1) (fingerprint of the file, not a secret)"
