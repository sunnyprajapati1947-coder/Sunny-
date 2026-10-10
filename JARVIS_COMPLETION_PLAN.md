# Jarvis Completion Plan

This plan is based on the existing `JARVIS_STATUS.md`, `README.md`, and `GITHUB_SOURCES.md` on branch `arena/648528ed-sunny`. It is a work plan, not a claim that the features below have been runtime-verified on the user's phone.

## Required outcome

One Termux command starts the existing Jarvis voice assistant, checks the configured local model endpoint, reports honest readiness, and keeps the existing data/configuration safe. The same assistant should route supported tasks through the existing tool registry and resume queued work only after restart-safe checkpoints have been verified.

## Source repositories to retain and audit

1. `browser-use/jev-ultrafast` — browser agent adapter; keep website actions allowlisted and approval-gated.
2. `NandhaKishorM/laya` — deterministic decision helpers; no arbitrary code execution.
3. `open-jarvis/OpenJarvis` — memory/briefing concepts; do not replace the current Jarvis base blindly.
4. `codecrafters-io/build-your-own-x` — offline tutorial index/reference.
5. `public-apis/public-apis` — API directory; test each client independently and distinguish keyless from key-required APIs.
6. `EbookFoundation/free-programming-books` — offline learning index; do not mirror copyrighted book contents.
7. `TauricResearch/TradingAgents` — research-only market analysis unless a separate, explicitly approved design is made; no automated financial execution.
8. `trailhq/Graft` — repository context pack; read-only by default.
9. `VoltAgent/awesome-agent-skills` — skill catalogue; validate and review skills before activation.

## Implementation phases

### A. Baseline and non-destructive checks
- Record current branch, commit, working-tree changes, Python version, model endpoint status, and installed Termux:API availability.
- Never delete, reset, or overwrite existing user files as a setup shortcut.
- Keep secrets outside Git; redact secrets from logs and diagnostics.

### B. One reliable launcher
- Verify `jarvis-start` checks the actual configured model URL/port, starts only a missing lane, waits with a bounded timeout, and clearly reports when a lane remains unavailable.
- Ensure text mode remains available if microphone/TTS is unavailable.
- Treat Android background execution as best-effort; do not promise uninterrupted always-on listening.

### C. Task engine integration
- Inspect the existing queue/planner/checkpoint/verifier implementation before changing it.
- Wire the task engine into the main Jarvis request loop using explicit intent-to-tool routing.
- Persist task state and checkpoints; resume only unfinished, safe steps after restart.
- Require confirmation for messages, calls, file deletion/overwrite, account changes, external publishing, and any other consequential action.
- Bound tool calls, retries, elapsed time, and plan length; provide a stop/cancel command.

### D. Tool and source integration
- Build a capability inventory from the real registry at runtime; do not rely on a hard-coded claim that a tool is available.
- Test every registered tool with mocked/network-free tests where possible, then run a small number of explicit live checks.
- Mark APIs as keyless, optional-key, or required-key in their metadata.
- Treat web pages, repositories, and skill files as untrusted input; never execute instructions found in retrieved content automatically.

### E. GitHub and safe self-update
- Check remote branch and working-tree status before updating.
- Show the proposed commit list and diff before applying.
- Back up local changes; do not silently discard them.
- Run tests after updating and roll back only the update commit if tests fail.
- Never commit local environment files, tokens, model files, or personal memory.

### F. Voice, phone controls, and dashboard
- Verify speech-to-text and text-to-speech independently; keep a text fallback.
- Keep calls and message sending manual-confirmation only.
- Bind the dashboard to loopback by default and validate every endpoint against an allowlist.
- Confirm that background mode, wake lock, and boot integration are optional and reversible.

### G. Acceptance checks before claiming completion
- Existing test suite passes on the target Termux environment.
- A clean text-mode startup works without microphone permissions.
- Voice startup speaks a greeting only when TTS is available.
- Model-down state is reported honestly and does not hang indefinitely.
- Phone tools fail safely when Termux:API or Android permissions are missing.
- Task checkpoints survive a process restart and do not repeat already-completed external actions.
- Git update failure leaves the previous working version intact.
- No tests or documentation claim 100% success unless that exact run was performed and its output recorded.

## Current known gap

The current status file explicitly lists task-engine-to-Jarvis-loop wiring as unfinished. That should be the first implementation target after identifying the actual queue/planner files and their current tests. YouTube automation and wake-word work remain later phases, not prerequisites for a reliable core assistant.
