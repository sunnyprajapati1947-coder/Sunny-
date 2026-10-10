---
name: repo-context
description: Build a compact context pack of a repository before answering coding questions about it
tools: repo_context_pack
---

# Repo Context

Adapted from Graft: stop re-exploring a codebase from zero. Build a context
pack once, then answer with the whole repo in mind.

## Steps

1. Take the repo/folder path from the request.
2. Call `repo_context_pack` with the path and an optional focus term.
3. Read the pack: languages, tree, import hubs, key files, skeletons.
4. Answer the coding question grounded in the pack — name real files.
5. For long projects, offer to write `NOVA_CONTEXT.md` into the repo.

## Guardrails

- Read-only by default; only write NOVA_CONTEXT.md when the owner agrees.
- Never read outside the given path. Never send repo content to any network
  tool.
