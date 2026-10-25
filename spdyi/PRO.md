# Spdyi Pro 2.0: diagnostics, calibration and Android app

This project is an independent Free Fire MAX companion. It never reads game memory/files, changes system display settings or automates input. All six sensitivity values are **0–200**; fire-button size is a separate percentage.

## Native Android app

The `android/` project is a Capacitor 7 app with locally bundled web assets and a custom Java `SpdyiDiagnostics` plugin. No production server is required for the APK to run. The manifest has only Capacitor's INTERNET permission; no account, installed-app, location, microphone, camera, accessibility, root or system-write access. Android backups are disabled. No telemetry SDK is installed.

Build requirements: Node 22, JDK 21, Android SDK platform/build-tools 35 and Gradle (wrapper included).

```sh
npm ci
npm test
npm run android:build
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

The `Spdyi Android APK` GitHub workflow builds and lints a **debug-signed testing APK**, then uploads `Spdyi-Pro-debug.apk` and `SHA256SUMS.txt`. This is not a Play Store release, not production-signed, and has not been certified on physical handsets. A distributable release requires the owner's controlled signing key and physical-device testing. Never commit a signing key. Separate CI debug builds can use different temporary debug keys; an update may require uninstalling the old build first. Export local profiles before uninstalling. The PWA preview cannot execute native Android plugins.

### Native snapshot (only after tapping Read device info)

- Manufacturer/model and Android release/API level through `Build`.
- OS-visible total/available RAM and low-memory flag through `ActivityManager`.
- Available/total space on the app-data volume through `StatFs` (not all removable drives).
- Current display pixel dimensions, logical density (`densityDpi`), display refresh rate and supported modes through Android display APIs. Mode dimensions may differ from the panel's advertised physical resolution. Logical density is not measured panel PPI. Display refresh is not game FPS.
- Logical processor count/ABIs, sensor inventory and advertised multitouch feature flags. Flags and inventory are not live capability/latency tests.
- Battery level/temperature **only if the broadcast supplies those values**. Temperature is not invented when absent.

### Browser / PWA fallback

CSS screen and viewport dimensions, devicePixelRatio, exposed logical-processor count, optional coarse privacy-bucket memory hint, and advertised maxTouchPoints. Browser storage quota is never labelled free phone storage. Android model/OS details, total available RAM, sensor inventory, battery temperature, physical DPI and hardware touch latency are explicitly unavailable rather than guessed from user agent strings. Site storage estimates in exported reports remain labelled site quotas.

## Frame pacing

A visible, cancellable ~2-second `requestAnimationFrame` trial reports median/P95 callback intervals, observed callback Hz and the fraction longer than 1.5× the median. It stops on navigation, backgrounding or timeout. It is **app callback pacing**, not exact hardware refresh, game FPS, touch response time or a phone performance benchmark.

## Touch lab

A local Pointer Events canvas supports simultaneous pointers and 9-zone coverage. It reports **observed** simultaneous pointers, not the device's maximum hardware capacity. Coverage is limited to this surface; unvisited zones are untested, not defective.

An upward single-pointer swipe must travel at least 40 CSS pixels in 60–5,000 ms and at least 30 CSS pixels upward. Canceled/multitouch gestures do not count toward swipe trials. Five to twelve qualifying swipes produce:

- Mean displacement speed in **test-area widths per second**, not cm/s.
- Coefficient of variation of displacement speed; this describes the particular trials, not an accuracy score.
- Displacement/path-length straightness.
- Zone coverage and observed pointer count.

Mouse trials are labelled UI-only and cannot be saved as phone touch calibration. Browser pointer timestamps, OS event coalescing and rendering affect measurements. No hardware sampling-rate or touch-latency estimate is claimed. Test input stops on navigation; no global touch capture continues in the background.

## Feedback-guided engine v3

1. Without previous settings, use the selected community-range midpoints documented in `RESEARCH.md`.
2. With all six valid current values, anchor to those values. The screenshot example `145, 140, 125, 105, 75, 100` is an optional convenience, explicitly not an official preset or the user's verified phone profile.
3. Change only the selected slider: overshoot/too-fast → −5; shortfall/too-slow → +5. Explicit aim issue takes priority over drag feel; corrections never stack.
4. If a saved qualifying swipe summary has CV > 0.45, use a smaller **3-point trial step** instead. This threshold is an editorial conservative heuristic, not a published physiological law or a conversion from touch latency to sensitivity. CV does not justify scaling all game values.
5. Clamp to 0–200. Range preference supplies scope-specific test advice without arbitrary numeric stacking.
6. Display source context, reasons, the old-versus-suggested chart, and an evidence-completeness label. `Limited`, `Feedback-guided`, and `Repeat-tested input` are **not accuracy percentages**. The last label requires all current values, a directional issue, at least 20 self-reported trial shots, and a saved swipe report. The app has not seen those shots.
7. Reported device dimensions/refresh and app callback pacing describe test context and low-memory cautions. They are not fabricated sensitivity multipliers. Equal starting values on different models are intentional when the available evidence cannot justify a difference.

## Local profile vault

Last setup, up to ten profile saves, and an explicitly saved touch summary use localStorage in the current app/browser. Save captures previous inputs, feedback, bounded final values, fire-button size and evidence context. Profiles can be loaded, exported as JSON and deleted through the vault. No cloud database/account is required. Diagnostics are session-only unless the user exports a report; a small context summary can accompany a saved sensitivity profile. Uninstalling/clearing app or site data removes local records. Raw touch paths and sensor readings are not uploaded or persisted.

## Referenced projects

Reviewed 2026-10-25, as design/API references only:

- [PixView](https://github.com/Stefan-s-Android-Tools/PixView), MIT: useful read-only display reporting principles.
- [abCheck](https://github.com/abanana84/abCheck), Apache-2.0: hardware diagnostics and touch/test module separation.
- [ANTAR](https://github.com/ashokvarmamatta/ANTAR): dashboard concept. GitHub metadata did not identify a license at review, so none of its code/assets is used.

No source code, artwork, packages or binaries from these three projects are incorporated. Spdyi's diagnostics plugin and touch engine are original implementations against Android/browser APIs. Dependencies that are actually bundled are declared in `package.json` and `package-lock.json` (including Capacitor); catalog attribution/license are separate in `CATALOG.md`.

## Verification

```sh
npm test
npm run build
# With preview server running and Playwright Chromium installed:
npm run test:browser
npm run test:browser:pro
```

The Pro browser test dispatches real Chromium touch events (including two simultaneous contacts), verifies five qualifying swipe trials, current screenshot inputs, feedback adjustments, evidence context, old/new charts, saved profiles and responsive layouts down to 320 CSS pixels. Headless/browser tests do not validate physical Android sensor values or touchscreen latency. Android compile/lint is a separate workflow; physical phone tests remain necessary before a production release.
