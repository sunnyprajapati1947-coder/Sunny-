#!/usr/bin/env bash
# CI-only. No unencrypted signing key/password may be uploaded or printed.
set -euo pipefail
umask 077
: "${RUNNER_TEMP:?}" "${GITHUB_ENV:?}" "${GITHUB_REPOSITORY:?}"
KEY_DIR="$RUNNER_TEMP/spdyi-signing"
mkdir -p "$KEY_DIR"
if [ -n "${SPDYI_RELEASE_KEYSTORE_BASE64:-}" ]; then
  : "${SPDYI_RELEASE_STORE_PASSWORD:?Missing signing password}" "${SPDYI_RELEASE_KEY_ALIAS:?Missing signing alias}"
  printf '%s' "$SPDYI_RELEASE_KEYSTORE_BASE64" | base64 --decode > "$KEY_DIR/release.p12"
  STORE_PASS="$SPDYI_RELEASE_STORE_PASSWORD"
  KEY_ALIAS="$SPDYI_RELEASE_KEY_ALIAS"
else
  # Bootstrap once only. Never silently change the app's signing identity after a release.
  previous=$(gh release list --repo "$GITHUB_REPOSITORY" --limit 100 --json tagName --jq '[.[] | select(.tagName | startswith("spdyi-v"))] | length')
  if [ "$previous" -ne 0 ]; then
    echo '::error::A Spdyi release already exists. Restore its original signing key into the documented GitHub secrets; signing-key rotation is refused.'
    exit 1
  fi
  STORE_PASS=$(openssl rand -hex 32)
  KEY_ALIAS=spdyi-release
  echo "::add-mask::$STORE_PASS"
  export STORE_PASS
  keytool -genkeypair -noprompt -keystore "$KEY_DIR/release.p12" -storetype PKCS12 \
    -storepass:env STORE_PASS -keypass:env STORE_PASS -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Spdyi Pro, O=Spdyi' >/dev/null 2>&1
fi
printf '%s' "$STORE_PASS" > "$KEY_DIR/store-password.txt"
printf '%s' "$KEY_ALIAS" > "$KEY_DIR/key-alias.txt"
# Authenticated encryption to the workspace owner's public recovery certificate.
# Only this encrypted archive is publishable. Its private recovery key is never in Git/CI.
tar -C "$KEY_DIR" -cf "$KEY_DIR/private-backup.tar" release.p12 store-password.txt key-alias.txt
mkdir -p apk
openssl cms -encrypt -binary -aes-256-gcm -in "$KEY_DIR/private-backup.tar" \
  -outform DER -out apk/Spdyi-signing-backup.cms spdyi/signing/recovery-public.pem
rm "$KEY_DIR/private-backup.tar"
export STORE_PASS
keytool -exportcert -rfc -keystore "$KEY_DIR/release.p12" -storetype PKCS12 \
  -storepass:env STORE_PASS -alias "$KEY_ALIAS" -file apk/Spdyi-signing-certificate.pem >/dev/null 2>&1
# Mask all signing credentials before passing them to Gradle.
echo "::add-mask::$STORE_PASS"
{
  echo "SPDYI_SIGNING_STORE_FILE=$KEY_DIR/release.p12"
  echo "SPDYI_SIGNING_STORE_PASSWORD=$STORE_PASS"
  echo "SPDYI_SIGNING_KEY_PASSWORD=$STORE_PASS"
  echo "SPDYI_SIGNING_KEY_ALIAS=$KEY_ALIAS"
} >> "$GITHUB_ENV"
