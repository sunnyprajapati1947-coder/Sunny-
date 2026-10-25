# Sensitivity and HUD research review

Reviewed **2026-10-25**. This is a desk review, not hardware testing, a controlled experiment or an official Garena endorsement. No phone has been physically benchmarked by this project. Sources are linked inside the app on every result.

## Official information

1. [Garena, April 2024 patch notes](https://ff.garena.com/en/article/1332/): raised sensitivity cap to 200. This confirms the scale, not a universal recommendation or a linear conversion from old guides.
2. [Garena, February 2025 patch notes](https://ff.garena.com/en/article/1456): In-Match settings categories and one-unit sensitivity adjustment buttons.
3. [Garena, OB50 notes](https://ff.garena.com/en/article/1511/): shooting-sensitivity panel in the Training Grounds target range.
4. [Garena, OB52 notes](https://ff.garena.com/en/article/1595/): Settings > HUD recommendations, with optional sensitivity sync when applying shared HUDs. Spdyi neither imports nor generates fake HUD codes.

None of these official sources validates Spdyi's exact outputs or a RAM-to-sensitivity formula.

## Community sensitivity ranges used

[Cashify guide](https://www.cashify.in/best-free-fire-max-sensitivity-settings), showing an update of 21 October 2026 when reviewed. Only the balanced and aggressive **touch** sensitivity tables are used, not the gyro section or claims of universal performance benefits.

| Slider | Balanced range | Fast / close-range range |
| --- | --- | --- |
| General | 170–190 | 180–200 |
| Red Dot | 165–185 | 175–195 |
| 2× | 150–170 | 160–180 |
| 4× | 140–160 | 150–170 |
| Sniper | 80–110 | 90–120 |
| Free Look | 120–150 | 140–170 |

These are third-party suggestions, not experimental distributions, confidence intervals, phone-specific measurements or official presets. The engine selects the **rounded arithmetic midpoint** of the chosen range. A range is displayed beside each starting number. Finger count does not arbitrarily alter sensitivity. RAM and display Hz are optional reference information only; neither reports real game FPS or establishes a calibrated aim response. A chosen model labels the setup, rather than manufacturing an unverified per-model result.

## Fire-button size

[The Click fire-button guide](https://www.theclick.gg/free-fire-max-fire-button-size-for-headshots/) proposes:

| Grip | Starting test range | Spdyi starting point |
| --- | --- | --- |
| 2 fingers | 44–50% | 47% |
| 3 fingers | 40–46% | 43% |
| 4 fingers | 38–45% | 42% (rounded midpoint) |

Its article emphasizes reach, placement and testing about 20 shots while holding sensitivity constant. Small 2-point HUD adjustments are exposed in the app. The diagram is illustrative, not a pixel-accurate layout or an import code.

**Conflicting advice:** [BlueStacks' headshot-settings guide](https://www.bluestacks.com/blog/game-guides/free-fire-battlegrounds/ff-best-settings-for-headshots-en.html) suggests 50–70% for drag shooting. Other reviewed pages disagree even more. We do not average contradictory guides into a falsely authoritative answer or label smaller/larger as objectively better. Spdyi exposes the selected range and encourages testing; hand size, grip, comfortable reach and layout matter. All size changes are manual in the game.

## DPI and tuning decisions

We found no basis for asserting a universally safe/perfect DPI for every phone. The earlier unverified 400–440 output and arbitrary DPI sensitivity deduction have been removed. “With DPI” now shows safety guidance and recommends keeping the original value. Android's “Smallest width” is in **dp**, not a density DPI field. No automatic OS changes are made, and Apple profiles do not receive Android DPI instructions.

Train with a stable frame rate, consistent weapon/attachments/distance and repeatable drag. Record original settings. If repeatedly overshooting, test only that slider 5 lower; if stopping short, test 5 higher. Spdyi's tuning controls edit only the displayed/local saved result and clamp values to 0–200. Fire size is tuned separately. These are user-led trials, not measurements performed by the website.

## What we explicitly do not claim

- No hardware scan, live research per click, player-specific accuracy measurement or automatic game integration.
- No guaranteed headshots, “perfect sensitivity”, ban-proof promises, FPS improvements, recoil scripts or auto-aim.
- No exhaustive verified settings for every model. Device names come from a separate catalog with its own provenance in `CATALOG.md`.
- Sources are reviewed references, not proof that every section of a community article is correct. Re-review after game changes and use the actual in-game scale and menu labels.
