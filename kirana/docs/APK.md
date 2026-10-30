# Android APK — build, install, update

The web app is wrapped in a thin [Capacitor](https://capacitorjs.com) shell, so the
shop gets a normal Android app icon instead of a browser tab. It bundles the exact
`dist/` build that Vercel serves, so there is only one codebase.

## Download

Latest build: **<https://github.com/sunnyprajapati1947-coder/Sunny-/releases/download/dukaan-dost-v1.0.0/dukaan-dost-release.apk>**

- `dukaan-dost-release.apk` · ~3.8 MB · min Android 6.0 (API 23)
- Built and verified automatically by the *Dukaan Dost — test, build & package APK*
  workflow after typecheck + 147 tests + the web build pass.

### Install

1. Open the link on the phone and tap the download.
2. Open the file (files app or the browser's download list).
3. Android asks to allow **Install unknown apps** for that app → allow → **Install**.
4. Play Protect may warn about an app from outside the Play Store → *Install anyway*.

### Update

Install the newer APK **over** the existing app. The bills, products and khata live in
the app's local database, so:

> **Never uninstall the app to update it** — uninstalling erases the local database.
> Uninstalled by accident? Restore the JSON backup (More → Restore backup) if you took one.

Both the release and the debug variant are signed with the keystore in
`android/keystore/`, so successive builds share one signature and install over each
other. A build signed with a different key cannot be installed over an older one.

## What differs from the web version

| Feature | APK behaviour |
| --- | --- |
| Barcode scanning | same camera pipeline, `CAMERA` permission requested on first scan |
| UPI QR / "open UPI app" | `upi://` link handed to the Android intent system |
| WhatsApp receipt / khata reminder | `whatsapp://` intent, opens the WhatsApp app |
| SMS reminder | `sms:` intent |
| Receipt PDF | saved to `Documents/receipts/` and/or shared through the system share sheet |
| Thermal print window | hidden (a WebView has no print dialog) — use PDF/WhatsApp instead |
| Service worker | disabled (assets are already local; prevents a stale bundle after an update) |
| Offline | identical — everything works without network, syncs to Supabase when online |

## Building locally

```bash
cd kirana
npm run android:sync     # build web bundle + cap sync android
npm run android:apk      # gradle assembleDebug → android/app/build/outputs/apk/debug
npm run android:open     # open the project in Android Studio
```

Requires JDK 17 and the Android SDK (platform 34, build-tools). The committed Gradle
wrapper pins Gradle 8.2.1 / AGP 8.2.1, which do **not** run on JDK 21 — stay on 17.

## Signing

`android/keystore/dukaan-dost.p12` (alias `dukaan-dost`, store type `pkcs12`) is
committed on purpose: it keeps sideload builds updatable without a secret store.

It is **not** suitable as-is for the Play Store — anyone with this repository can sign
an APK claiming the same package. Before distributing publicly, replace it:

```bash
keytool -genkeypair -v -keystore my-release.jks -alias dukaan -keyalg RSA \
        -keysize 4096 -validity 10000 -storetype JKS
base64 -w0 my-release.jks        # → ANDROID_KEYSTORE_BASE64
```

Then set the repository secrets `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The
workflow prefers them over the committed key (store type is assumed `jks`).

Changing the key means the new APK cannot be installed over the old one — export a
backup from the old app, install the new build, and restore.

## Why there is no `.aab`

An `.aab` only matters for Play Store distribution. For handing a shop a file, an APK
that installs in two taps is the useful artefact.
