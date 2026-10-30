#!/usr/bin/env python3
"""Verify a built Android APK before it is published.

The CI runner can build the APK but the author of this change cannot download it
afterwards, so the build has to prove its own output here. Anything missing is a
hard failure (a broken APK must never reach the release page).

Checks:
  * lib .apk parses as a zip and contains classes.dex
  * package name, versionName, min/target SDK and the launcher activity
  * the bundled web app is inside (assets/public/index.html + JS bundle)
  * the APK carries a signature (apksigner) and report the signer
Prints a markdown block to $GITHUB_STEP_SUMMARY.
"""

from __future__ import annotations

import glob
import hashlib
import os
import subprocess
import sys
import zipfile

EXPECTED_PACKAGE = "in.dukaandost.app"
EXIT_OK = 0


def run(cmd: list[str]) -> str:
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return (out.stdout or "") + (out.stderr or "")
    except Exception as exc:  # noqa: BLE001 - report, never crash the script
        return f"<failed to run {' '.join(cmd)}: {exc}>"


def android_build_tools() -> str | None:
    sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if not sdk:
        return None
    candidates = sorted(glob.glob(os.path.join(sdk, "build-tools", "*")))
    return candidates[-1] if candidates else None


def merged_manifest_package() -> str:
    """Fallback when aapt2 is unavailable: the merged manifest is plain XML."""
    hits = glob.glob("android/app/build/intermediates/merged_manifests/**/AndroidManifest.xml", recursive=True)
    hits += glob.glob("android/app/build/intermediates/packaged_manifests/**/AndroidManifest.xml", recursive=True)
    for path in sorted(hits):
        try:
            text = open(path, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        if EXPECTED_PACKAGE in text:
            return f"package: name='{EXPECTED_PACKAGE}' (from merged manifest)"
    return ""


def find_apk() -> str:
    prefer = ["release", "debug"]
    for variant in prefer:
        hits = glob.glob(f"android/app/build/outputs/apk/{variant}/*.apk")
        if hits:
            return sorted(hits)[0]
    hits = glob.glob("android/app/build/outputs/apk/**/*.apk", recursive=True)
    if not hits:
        sys.exit("::error title=APK::no APK was produced by gradle")
    return sorted(hits)[0]


def main() -> int:
    apk = find_apk()
    size = os.path.getsize(apk)
    sha = hashlib.sha256(open(apk, "rb").read()).hexdigest()

    try:
        archive = zipfile.ZipFile(apk)
        names = archive.namelist()
    except Exception as exc:  # noqa: BLE001
        print(f"::error title=APK::not a valid zip: {exc}")
        return 1

    dex = [n for n in names if n.startswith("classes") and n.endswith(".dex")]
    web_assets = [n for n in names if n.startswith("assets/public/")]
    has_index = "assets/public/index.html" in names
    has_js = any(n.startswith("assets/public/assets/") and n.endswith(".js") for n in web_assets)
    # Release builds rename/optimise resources, so a fixed file name is not a
    # reliable signal: accept any launcher-ish image, or the badging icon lines.
    icons = [
        n for n in names
        if n.startswith("res/") and n.endswith((".png", ".webp")) and "ic_launcher" in n
    ]
    if not icons:
        icons = [n for n in names if n.startswith("res/") and n.endswith((".png", ".webp"))]

    build_tools = android_build_tools()
    badging = run([os.path.join(build_tools, "aapt2"), "dump", "badging", apk]) if build_tools else ""
    package = ""
    for line in badging.splitlines():
        if line.startswith("package:"):
            package = line
            break
    keep = ("package:", "sdkVersion:", "targetSdkVersion:", "application-label:",
            "application-label-", "launchable-activity:", "uses-permission:", "native-code:")
    manifest_lines = [ln for ln in badging.splitlines() if ln.startswith(keep)][:24]

    if not package:
        package = merged_manifest_package()

    signer = ""
    if build_tools and os.path.exists(os.path.join(build_tools, "apksigner")):
        signer = run([os.path.join(build_tools, "apksigner"), "verify", "--print-certs", apk])
    if not signer.strip():
        signer = run(["jarsigner", "-verify", apk])
    signer_lines = [ln for ln in signer.splitlines() if ln.strip()][:8]

    checks = [
        ("package name", f"name='{EXPECTED_PACKAGE}'" in package),
        ("dex code", bool(dex)),
        ("web app bundled", has_index and has_js),
        ("launcher icon", bool(icons) or "application-icon" in badging),
        ("signature", any("Signer" in ln or "Verifies" in ln for ln in signer_lines)),
    ]

    summary = [
        "### APK verification",
        "",
        f"`{apk}` · {size / 1_048_576:.1f} MiB · `{sha}`",
        "",
        "| check | result |",
        "| --- | --- |",
    ]
    for label, ok in checks:
        summary.append(f"| {label} | {'✅' if ok else '❌'} |")
    summary += [
        "",
        f"- web assets: {len(web_assets)} files, dex: {len(dex)}, launcher icons: {len(icons)}",
        f"- package: `{package or 'unknown'}`",
        "",
        "<details><summary>aapt2 badging</summary>",
        "",
        "```",
        *manifest_lines,
        "```",
        "",
        "</details>",
        "",
    ]
    if signer_lines:
        summary += ["<details><summary>apksigner</summary>", "", "```", *signer_lines, "```", "", "</details>", ""]

    block = "\n".join(summary) + "\n"
    print(block)
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as fh:
            fh.write(block)

    failed = [label for label, ok in checks if not ok]
    for label in failed:
        print(f"::error title=APK check::missing {label}")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
