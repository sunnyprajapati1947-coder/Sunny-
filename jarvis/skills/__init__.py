"""Skill library: the 1,889 GitHub skills already curated in `apps/jarvis-pocket`.

Two kinds of skills live side by side:

    builtin  — written for this app; they have concrete steps that call real
               tools, so they run on the phone with no model at all.
    imported — SKILL.md / agent / command text from the 23 curated GitHub
               packs. JARVIS searches them and, when you run one, loads the
               instructions into the model so it can follow them with tools.

Nothing here downloads anything at runtime: the pack data is already in the
repository, so the phone stays offline-capable.
"""

from .library import SkillLibrary, SkillRunner, render_template, skill_risk

__all__ = ["SkillLibrary", "SkillRunner", "render_template", "skill_risk"]
