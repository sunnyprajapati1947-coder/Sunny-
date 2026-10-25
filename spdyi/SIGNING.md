# Android release signing and recovery

Spdyi 2.0.1 is built with `assembleRelease`, signed using a dedicated RSA release certificate, and checked by Android `apksigner`. The pipeline rejects a manifest marked debuggable. Neither renaming a debug APK nor hiding a debug label is used.

## Key protection

- Public APK, signing certificate, checksum and verification report are GitHub Release assets.
- No private signing key, keystore password or recovery private key is committed, logged or published as plaintext.
- A first release can bootstrap a release keystore in the private CI runner. Its keystore and password are archived and **authenticated-encrypted (CMS / AES-256-GCM)** to the owner's public recovery certificate. Only the `.cms` encrypted backup is publishable. Plaintext material is removed in an always-run cleanup step.
- The matching recovery private key is held in the workspace at `.spdyi-signing/recovery-private.pem` with restrictive file permissions and a Git ignore rule. **The owner must back this up securely outside the disposable workspace.** Losing it before configuring the release key in a trusted secret store can prevent updates under the same app identity. Do not share the key through chat or put it in Git.
- The recovery public certificate in `signing/recovery-public.pem` is safe to commit. It is not the app's private signing key.
- After any `spdyi-v…` release exists, the pipeline **refuses to generate a new signing identity**. Future builds must reuse the original key through the documented GitHub secrets. This avoids silently breaking app upgrades.
- The connected GitHub integration currently cannot manage repository Actions secrets (HTTP 403). This is why first-release signing uses a public-key encrypted recovery backup, not plaintext credentials or a publicly accessible debug keystore. The owner can configure secrets in GitHub's repository settings using their existing account; no passwords/tokens need to be supplied in chat.

## Recover into a private local folder

Only on a trusted computer/workspace with the owner's recovery private key:

```sh
# From the repository root; download the .cms release asset first.
mkdir -p .spdyi-signing/restored
chmod 700 .spdyi-signing .spdyi-signing/restored
umask 077
openssl cms -decrypt -binary -inform DER \
  -in /path/to/Spdyi-signing-backup.cms \
  -recip spdyi/signing/recovery-public.pem \
  -inkey .spdyi-signing/recovery-private.pem \
  -out .spdyi-signing/restored/private-backup.tar
# The backup contains release.p12, store-password.txt and key-alias.txt.
tar -xf .spdyi-signing/restored/private-backup.tar -C .spdyi-signing/restored
rm .spdyi-signing/restored/private-backup.tar
```

Do not display/copy these private files into logs, issues, source control or chat. The public certificate fingerprint can be compared with the APK verification report without revealing the private key.

## Configure future CI releases

In repository Settings → Secrets and variables → Actions, the owner should create:

- `SPDYI_RELEASE_KEYSTORE_BASE64`: base64 of the recovered `release.p12`.
- `SPDYI_RELEASE_STORE_PASSWORD`: contents of the recovered `store-password.txt`.
- `SPDYI_RELEASE_KEY_ALIAS`: contents of the recovered `key-alias.txt`.

The existing integration is not authorized to set these secrets. Use the owner's authorized settings page or an appropriately authorized local GitHub CLI; never send their contents through chat. Next releases must increment Android `versionCode`, package `version`, workflow APK filename/notes and the in-app release link. Keep the same package ID and signing certificate. Publishing a new key with the same app ID does not create a seamless update.

## Local release build

For a local JDK 21 / Android SDK 35 environment:

```sh
export SPDYI_SIGNING_STORE_FILE="$PWD/.spdyi-signing/restored/release.p12"
export SPDYI_SIGNING_STORE_PASSWORD="$(cat .spdyi-signing/restored/store-password.txt)"
export SPDYI_SIGNING_KEY_PASSWORD="$SPDYI_SIGNING_STORE_PASSWORD"
export SPDYI_SIGNING_KEY_ALIAS="$(cat .spdyi-signing/restored/key-alias.txt)"
npm --prefix spdyi run android:build
# android/app/build/outputs/apk/release/app-release.apk
```

Release assembly fails when signing is missing rather than silently publishing an unsigned or debug-signed APK. Google Play publication, store account setup, physical device QA and any Play App Signing enrollment are separate from producing this installable signed release.
