# Nova — laya Import Plan

Source:
NandhaKishorM/laya (non-autoregressive System 1 decision engine)

What Nova adopted:
- The typed decision API shape: choice / score / noul (yes-no probability).
- The single-pass predict(state, questions) contract.
- The idea of cheap System-1 guardrails before expensive model calls.

Where it lives:
- core/decision_engine.py (deterministic lexical engine; no checkpoints, no network)

Rules:
1. Nova's engine is deliberately lexical, not a model download.
2. Decisions are advisory; they never bypass security policy.
3. Output shape mirrors laya so skills stay portable.
