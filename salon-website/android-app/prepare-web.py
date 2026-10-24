#!/usr/bin/env python3
"""Copy the salon's offline-ready website into Capacitor's generated webDir."""

from __future__ import annotations

import shutil
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
SITE_DIR = APP_DIR.parent
WEB_DIR = APP_DIR / "www"
MARKER = ".generated-by-salon-web-prepare"

FILES = (
    "index.html",
    "styles.css",
    "script.js",
    "manifest.webmanifest",
    "sw.js",
    "app-icon.svg",
)


def main() -> None:
    if WEB_DIR.exists():
        if not (WEB_DIR / MARKER).is_file():
            raise SystemExit(f"Refusing to replace unmarked web directory: {WEB_DIR}")
        shutil.rmtree(WEB_DIR)
    WEB_DIR.mkdir(parents=True)
    (WEB_DIR / MARKER).write_text("generated\n", encoding="utf-8")

    for name in FILES:
        shutil.copy2(SITE_DIR / name, WEB_DIR / name)
    for directory in ("assets", "icons"):
        shutil.copytree(SITE_DIR / directory, WEB_DIR / directory)

    index_path = WEB_DIR / "index.html"
    index = index_path.read_text(encoding="utf-8")
    native_marker = "  <script>window.SALON_NATIVE_APP = true;</script>\n"
    if index.count("</head>") != 1:
        raise SystemExit("Expected one </head> tag in the salon page.")
    index = index.replace("</head>", native_marker + "</head>", 1)
    index_path.write_text(index, encoding="utf-8")

    print(f"Prepared offline salon web assets at {WEB_DIR}.")
    for path in sorted(WEB_DIR.rglob("*")):
        if path.is_file() and path.name != MARKER:
            print(f"  {path.relative_to(WEB_DIR)}: {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
