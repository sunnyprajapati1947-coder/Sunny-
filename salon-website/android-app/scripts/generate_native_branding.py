#!/usr/bin/env python3
"""Generate Android raster launcher and splash assets from the salon's icon."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

APP_DIR = Path(__file__).resolve().parents[1]
RES = APP_DIR / "android" / "app" / "src" / "main" / "res"
SOURCE = APP_DIR.parent / "icons" / "icon-512.png"
BACKGROUND = (23, 23, 21)


def write_launcher_icons() -> None:
    original = Image.open(SOURCE).convert("RGBA")
    densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for density, size in densities.items():
        folder = RES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        icon = original.resize((size, size), Image.Resampling.LANCZOS)
        icon.save(folder / "ic_launcher.png", optimize=True)

        round_icon = icon.copy()
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse((1, 1, size - 2, size - 2), fill=255)
        round_icon.putalpha(mask)
        round_icon.save(folder / "ic_launcher_round.png", optimize=True)


def write_splash_screens() -> None:
    icon = Image.open(SOURCE).convert("RGBA")
    for path in RES.rglob("splash.png"):
        width, height = Image.open(path).size
        canvas = Image.new("RGB", (width, height), BACKGROUND)
        target = max(1, round(min(width, height) * 0.42))
        mark = icon.resize((target, target), Image.Resampling.LANCZOS)
        canvas.paste(mark, ((width - target) // 2, (height - target) // 2), mark)
        canvas.save(path, optimize=True)


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Missing salon icon source: {SOURCE}")
    write_launcher_icons()
    write_splash_screens()
    print("Generated Android launcher and splash graphics from the gold M salon logo.")


if __name__ == "__main__":
    main()
