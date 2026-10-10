# Nova — Graft Import Plan

Source:
trailhq/Graft (context layer for large codebases)

What Nova adopted:
- The repo-map idea: tree, language stats, import hubs, key-file skeletons.
- The context-file idea: NOVA_CONTEXT.md written into a repo on request.
- "Stop re-exploring from zero every session."

Where it lives:
- core/context_spec.py (repo_context_pack, render_markdown)
- skills/repo-context/SKILL.md

Rules:
1. The pack is read-only by default; writing NOVA_CONTEXT.md is opt-in.
2. Vendor, cache, and VCS directories are always skipped.
3. Repo content never leaves the device through this module.
