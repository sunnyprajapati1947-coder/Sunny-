# Phase 4 — Test results

Run locally with:

```bash
npm test              # all suites
npm run test:coverage # + coverage table
npm run typecheck     # strict TypeScript, zero errors
```

Latest run: **55 tests, 5 files, 0 failures** (~6 s), plus `tsc --noEmit` clean under
`strict` + `noUnusedLocals` + `noImplicitOverride`.

## Coverage (core rules/AI/geometry — the parts that must be correct)

| File | Statements | Branches | Functions |
| --- | --- | --- | --- |
| `core/engine.ts` | 97.9 % | 93.4 % | 92.9 % |
| `core/ai.ts` | 98.6 % | 94.8 % | 100 % |
| `core/dice.ts` | 100 % | 100 % | 100 % |
| `core/rng.ts` | 100 % | 100 % | 100 % |
| `core/types.ts` | 100 % | 100 % | 100 % |
| `core/setup.ts` | 95.1 % | 78.6 % | 75.0 % |
| `core/geometry.ts` | 89.2 % | 93.1 % | 80.0 % |
| `core/persistence.ts` | 87.3 % | 57.1 % | 91.7 % |
| **All core** | **94.4 %** | **88.9 %** | **90.9 %** |

Uncovered lines are defensive branches (storage unavailable, impossible engine states) and the
developer-only preview scripts.

## Suite by suite

### `tests/engine.test.ts` — 25 tests (rules)

| Area | Cases proven |
| --- | --- |
| Creation | starts in the yard, seat 0 to roll; rejects duplicate colours; rejects a 1-seat config |
| Dice & turns | only a 6 releases a token; auto-pass when no move exists; 6 keeps the turn; three sixes forfeits; out-of-phase actions rejected; invalid dice values (0, 7, 2.5) rejected |
| Movement | exact step count; exact home entry required (overshoot illegal); clamp when the rule is off; last track square → lane; finished tokens never move |
| Captures | opponent sent to the yard; capture grants a bonus roll; no capture on a star; no capture of a blockade (and capture when the rule is disabled); own-token stacking allowed; no capture on a start square |
| Winning | all four home → `game-over` + `win` event; no actions after the match ends |
| Save/restore | full round-trip equality; old `version` rejected; corrupt JSON rejected |
| Scoring | seat progress ignores the yard |

### `tests/geometry.test.ts` — 8 tests (board)

52 unique in-range squares; closed loop of adjacent cells with exactly four diagonal inner elbows;
start squares 13 steps apart and all safe; yards in the correct corners; exit square adjacent to the
lane entrance; 20 private lane squares disjoint from the track; monotonic movement paths; every
progress value maps inside its yard / centre region.

### `tests/ai.test.ts` — 7 tests (CPU + invariants)

- Chooses only moves present in `legalMoves`.
- Prefers a capture when one is available; prefers finishing a token.
- **Simulated full matches at Easy/Medium/Hard**: no illegal move ever chosen, every match terminates
  with a winner holding four finished tokens.
- Invariants checked on every single step of 10 seeded matches (40 000-step cap each): valid turn
  index, 4 tokens per seat, progress always `-1 | 0..56`.
- Captures never occur on a safe square.
- Thinking delay ordering Easy < Medium < Hard.

### `tests/dice.test.ts` — 6 tests

Valid pip layout per face, six unique cube rotations, deterministic queue per RNG state, uniform
distribution over 60 000 rolls (every face within ±8 % of 10 000), RNG state never repeats in 500
steps, shake offsets decay.

### `tests/ui.test.ts` — 9 tests (real DOM via jsdom)

| Test | Evidence |
| --- | --- |
| Home renders | title, Play / Rules / Settings, 4 stat tiles, no "Continue" without a save |
| Navigation | Home → Rules → Home → Settings → Home |
| Settings | toggling sound writes `sound:false` to storage; tapping **Fast** writes `speed:'fast'` |
| 2-player setup | mode switch → start ⇒ exactly 2 player cards and 8 tokens, autosave exists |
| 4-player setup | 4 player cards and 16 tokens |
| Roll on tap | tapping Roll sets a die face `1..6` and increments `stats.rolls` |
| Token tap | rolling until a 6 gives four legal moves ⇒ tapping a glowing token moves it out of the yard |
| **Full match** | Watch mode (CPU vs CPU) played to completion ⇒ victory overlay with winner name + 4 result stats |
| Pause / resume / restart | pause overlay opens, resumes, restart yields a fresh state (0 moves, all tokens in the yard) |

These tests also prove the audio layer degrades safely where Web Audio is absent (jsdom).

## What is *not* covered by automated tests

- Real-browser rendering, CSS 3D dice, Web Audio output, vibration — no browser/device in this
  sandbox. Visual QA was done by rasterising the actual board component
  (`scripts/render-preview.ts` → `docs/board-preview.svg`) and inspecting the rendered PNG, which
  is how three art defects (centre triangle orientation, chevron direction, token stacking) were
  found and fixed.
- Native Android runtime (WebView) — needs the CI-built APK on a device.
- Frame pacing on low-end hardware.
