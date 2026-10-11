# Nova — awesome-agent-skills Import Plan

Source:
VoltAgent/awesome-agent-skills (curated collection of agent skills)

What Nova adopted:
- The SKILL.md manifest format (frontmatter + steps) for Nova skill packs.
- A validated loader: every pack must pass required-field, name, and size
  checks before Nova can use it.
- A curated offline copy of the community skill catalog index.

Where it lives:
- core/skill_loader.py (skills_list / skills_get / skills_validate /
  skills_catalog_search)
- skills/ (five seed packs: market-analysis, daily-briefing, learn-topic,
  repo-context, web-research)
- core/data/skill_catalog.json (curated by github/curate_source_data.py)

Rules:
1. A skill is instructions for Nova; it never executes automatically.
2. Tools named by a skill still go through the registry boundary.
3. Skill bodies are bounded and validated on load.
