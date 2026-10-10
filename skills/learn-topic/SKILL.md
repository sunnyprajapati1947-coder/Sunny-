---
name: learn-topic
description: Recommend free books and build-your-own-X tutorials for a technology the owner wants to learn
tools: learning_find_build_guide, learning_find_books, learning_available_topics
---

# Learn a Topic

Curated from build-your-own-x and free-programming-books: the fastest path
from "I want to learn X" to concrete, free material.

## Steps

1. Ask (or infer) the technology, e.g. "database", "python", "neural network".
2. Call `learning_find_build_guide` for hands-on build-it-yourself guides.
3. Call `learning_find_books` for free books on the subject.
4. Present 1 build guide + 1 book first, with links.
5. If nothing matched, call `learning_available_topics` and show what the
   hub covers.

## Guardrails

- All links point to free resources; never invent links not returned by tools.
