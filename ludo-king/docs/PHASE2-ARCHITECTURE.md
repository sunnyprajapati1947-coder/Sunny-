# Phase 2 — Architecture

## 2.1 Stack decision

| Option | Verdict |
| --- | --- |
| Native Kotlin + Jetpack Compose | Cannot be compiled, run or tested in this sandbox (no JDK, no Android SDK, no Gradle, no emulator). Delivering it would mean shipping code without a single executed test or playable screen. |
| Flutter | Same problem, plus a large toolchain download outside the allowed egress. |
| **Mobile-first web app + PWA + Capacitor Android shell** | ✅ Chosen. Runs and is testable here, installs offline as a PWA, and produces a **real APK** through the Capacitor project + CI workflow with no code changes. |

The web layer is framework-free TypeScript: the whole game is ~2 000 lines, so a framework would add
bundle weight and lifecycle complexity without benefit. Rendering is split between one static SVG
(board art) and CSS-animated DOM nodes (tokens), which keeps 60 fps on mid-range devices: nothing is
re-rendered per frame, only two CSS custom properties change per hop.

## 2.2 Layers

```
┌──────────────────────────────────────────────────────────────┐
│  ui/            screens, board renderer, 3D dice, audio, fx   │  DOM / Web Audio
├──────────────────────────────────────────────────────────────┤
│  core/          pure, deterministic, DOM-free TypeScript      │  unit-tested in Node
│    engine.ts    rules state machine                            │
│    geometry.ts  15×15 board maths (track, lanes, yards)        │
│    ai.ts        heuristic CPU evaluator                        │
│    dice.ts      roll queue + 3D face orientations              │
│    rng.ts       seeded mulberry32                              │
│    setup.ts     menu options → GameConfig                      │
│    persistence.ts localStorage: settings, stats, autosave      │
└──────────────────────────────────────────────────────────────┘
```

Dependency rule: `ui → core` only. `core` never imports from `ui`, never touches `window`, and is
therefore fully testable in plain Node.

## 2.3 Module responsibilities

| Module | Responsibility | Key exports |
| --- | --- | --- |
| `core/types.ts` | Domain vocabulary, rule config, events, log entries | `GameState`, `Move`, `RulesConfig`, constants |
| `core/geometry.ts` | Canonical 52-square track, four home lanes, yards, progress→coordinate mapping, animation paths | `TRACK`, `SEAT_GEOMETRY`, `progressCenter`, `movementPath` |
| `core/rng.ts` | Deterministic mulberry32 | `rollDie`, `nextRandom`, `randomSeed` |
| `core/engine.ts` | Turn machine: roll → legal moves → apply → captures → bonus turns → win; save/restore | `createGame`, `roll`, `rollValue`, `playMove`, `computeMoves`, `serialize` |
| `core/dice.ts` | Face pip layouts, cube rotations, tumble timing | `PIP_LAYOUT`, `FACE_ROTATION`, `rollQueue` |
| `core/ai.ts` | Scores legal moves (capture, finish, safety, risk, stacking, blockade) with difficulty-scaled noise | `chooseMove`, `scoreMoves`, `thinkingDelay` |
| `core/setup.ts` | Rule presets, colour metadata, mode→seat mapping | `RULE_PRESETS`, `buildConfig`, `COLOR_META` |
| `core/persistence.ts` | Versioned localStorage with defensive parsing | `loadSettings`, `saveMatch`, `recordMatch` |
| `ui/board.ts` | Board SVG construction + token positioning/animation | `BoardView` |
| `ui/dice.ts` | CSS 3D dice cube | `DiceView` |
| `ui/audio.ts` | Procedural SFX + generative music (Web Audio) | `audio`, `AudioEngine` |
| `ui/game.ts` | Turn loop, HUD, toasts, pause overlay, haptics | `GameScreen` |
| `ui/screens.ts` | Home, setup, settings, rules, result screens | `homeScreen`, … |
| `ui/app.ts` | Navigation, persistence wiring, match lifecycle | `App` |

## 2.4 State model

```ts
type PlayerColor = 'red' | 'green' | 'yellow' | 'blue';

GameState {
  version: 2
  config: { seats: SeatConfig[], rules: RulesConfig, safeTrackIndices: number[] }
  rng: number                       // seeded RNG state — makes the whole match replayable
  turn: number                      // index into config.seats
  tokens: number[][]                // progress: -1 yard | 0..50 track | 51..55 lane | 56 home
  phase: 'awaiting-roll' | 'awaiting-move' | 'game-over'
  dice: number | null
  legalMoves: Move[]
  sixStreak: number
  winner: number | null
  stats: { rolls, moves, captures, sixes, finishedTokens, turns }
  log: GameLogEntry[]
}
```

Progress values are **seat-relative**, which is the trick that keeps the rules engine small: a token's
absolute square is always `(startOffset[seat] + progress) % 52`, so capture detection is a single map
lookup across all seats instead of four hand-written code paths.

## 2.5 Rules encoded (Classic preset)

1. A token leaves the yard only on a 6, landing on the seat's start square.
2. A 6 grants another roll; **three consecutive sixes forfeit the turn**.
3. Landing exactly on an opponent's square captures it (unless safe/blockaded) and grants a bonus roll.
4. Safe squares: the four start squares plus four star squares (abs 8, 21, 34, 47) — `[0, 8, 13, 21, 26, 34, 39, 47]`.
5. Two tokens of one owner on a non-safe square form a blockade: opponents cannot land on it.
6. Own tokens may stack freely; own stacks never block the owner.
7. Home lane (5 squares) is private, cannot be entered by opponents, and never captures.
8. Classic: the final step must land exactly on 56. Quick preset: overshoot clamps to home.
9. No legal move → the turn passes automatically (no dead taps).
10. First seat with all four tokens at 56 wins; the game then refuses further actions.

Rule presets: **Classic** (above), **Quick Match** (no exact home entry), **Chaos** (blockades can be
captured).

## 2.6 Turn loop / animation choreography

```
human taps dice ──► DiceView.roll(peekedValue)           (engine value, seeded)
                     │  ~0.8 s tumble
                     ▼
              engine.roll() ──► events
                     │
      no moves ──────┴──► toast + turn passes instantly
      moves         ──► board highlights playable tokens
                     ▼
human taps token ──► board.animateMove()   hop by hop, 1 audio tick per hop
                     ▼
              engine.playMove() ──► events
                     ▼
capture ──► board.animateCaptures() + haptic + capture SFX + bonus roll
home    ──► home SFX
win     ──► celebrate + confetti + result screen
```

The animation never owns state: it renders `before → after` transitions produced by the engine, so a
slow device can never desync logic from visuals.

## 2.7 Responsiveness strategy

- One `--hop` CSS variable drives token transitions; speed setting rewrites it.
- The board is a `container` with `width: min(100%, 100cqh)`, so it always fits the available square
  area without JavaScript measurement.
- Portrait: rail → board → dock. ≥720 px: two-column layout with the rail on the right.
- `env(safe-area-inset-*)` padding for notches; `100dvh` for mobile browser chrome.
- `prefers-reduced-motion` disables all animation.

## 2.8 Testing strategy

| Layer | Tool | What is proven |
| --- | --- | --- |
| Rules | Vitest, seeded dice | captures, safes, blockades, home entry, turn order, three sixes, wins, save/restore |
| Geometry | Vitest | 52 unique squares, closed loop, start spacing, lane adjacency, containment |
| Dice/RNG | Vitest | determinism, uniformity over 60 000 rolls, pip/rotation validity |
| AI | Vitest | never emits an illegal move; full matches from 10 seeds terminate correctly |
| UI | Vitest + jsdom | real clicks: menus, setup, dice, pause/resume/restart, and a whole match to the result screen |
