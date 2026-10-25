#!/usr/bin/env python3
"""Build the ECC Pocket content pack from a checkout of affaan-m/ECC.

Usage:
    python3 tools/build_data.py --source /path/to/ECC [--out data]

The script is deterministic: running it against the same upstream commit
produces byte-identical output (apart from the `generated` timestamp which
can be pinned with --stamp).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = Path(os.environ.get("ECC_SOURCE", "/tmp/ECC"))
UPSTREAM_URL = "https://github.com/affaan-m/ECC"
CHUNK_TARGET = 220_000  # bytes of markdown per lazy-loaded chunk

ACRONYMS = {
    "ai", "api", "apis", "aws", "bgp", "cdss", "cli", "cpp", "csharp", "css",
    "csv", "defi", "dns", "docker", "dotnet", "e2e", "ecc", "emr", "evm",
    "fsharp", "gcp", "git", "github", "gpu", "html", "http", "https", "i18n",
    "ios", "jpa", "json", "jwt", "k8s", "keccak", "kotlin", "kubernetes",
    "llm", "llms", "mcp", "ml", "mle", "mysql", "nestjs", "nextjs", "nlp",
    "npm", "nuxt", "orm", "osint", "pdf", "php", "phi", "postgres", "pr",
    "prd", "prp", "qa", "rag", "react", "redis", "sdk", "seo", "sla", "sql",
    "ssh", "tdd", "termux", "ui", "ux", "vite", "vlan", "vpn", "vue", "wcag",
    "x402", "yaml", "ios", "jwt", "json", "aml", "hipaa", "pm2", "tts", "asr",
}
SMALL_WORDS = {"a", "an", "and", "as", "at", "by", "for", "from", "in", "of",
               "on", "or", "the", "to", "vs", "with"}
# Words that look like acronyms but should stay in normal casing.
KEEP_LOWER = {"npm", "npx", "i18n"}


def titleize(raw: str) -> str:
    raw = raw.replace("_", "-").replace("/", "-")
    parts = [p for p in re.split(r"-+", raw) if p]
    out = []
    for idx, part in enumerate(parts):
        low = part.lower()
        if low in ACRONYMS:
            out.append(part.upper() if low not in KEEP_LOWER else low)
        elif idx > 0 and low in SMALL_WORDS:
            out.append(low)
        elif part.isupper() and len(part) <= 6:
            out.append(part)
        else:
            out.append(part[:1].upper() + part[1:])
    return " ".join(out)


def strip_markdown(text: str) -> str:
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"(?m)^#{1,6}\s*", "", text)
    text = re.sub(r"[*_>|~]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def parse_frontmatter(text: str) -> tuple[dict, str]:
    m = re.match(r"^---\s*\n(.*?)\n---\s*(?:\n|$)", text, re.S)
    if not m:
        return {}, text
    raw = m.group(1)
    body = text[m.end():]
    data: dict = {}
    current_key = None
    block_mode = None
    block_lines: list[str] = []

    def flush():
        nonlocal current_key, block_mode, block_lines
        if current_key and block_mode:
            joiner = "\n" if block_mode == "|" else " "
            data[current_key] = joiner.join(block_lines).strip()
        current_key, block_mode, block_lines = None, None, []

    for line in raw.splitlines():
        if block_mode:
            if line.startswith(("  ", "\t")):
                block_lines.append(line.strip())
                continue
            flush()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line.startswith((" ", "\t")):  # nested map such as metadata:
            continue
        km = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if not km:
            continue
        key, value = km.group(1), km.group(2).strip()
        if value in ("|", ">", "|-", ">-", "|+", ">+"):
            current_key = key
            block_mode = value[0]
            block_lines = []
            continue
        if value.startswith("[") and value.endswith("]"):
            data[key] = [v.strip().strip("'\"") for v in value[1:-1].split(",") if v.strip()]
            continue
        data[key] = value.strip("'\"")
    flush()
    return data, body


def first_h1(body: str) -> str | None:
    in_fence = False
    for line in body.splitlines()[:40]:
        if line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        m = re.match(r"^#\s+(.+?)\s*#*\s*$", line)
        if m:
            title = strip_markdown(m.group(1))
            if 0 < len(title) <= 90:
                return title
    return None


def strip_first_h1(body: str) -> str:
    lines = body.splitlines()
    in_fence = False
    for idx, line in enumerate(lines[:40]):
        if line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence and re.match(r"^#\s+", line):
            del lines[idx]
            break
    return "\n".join(lines).lstrip("\n")


def first_paragraph(body: str) -> str:
    in_fence = False
    buf: list[str] = []
    for line in body.splitlines():
        s = line.strip()
        if s.startswith("```"):
            in_fence = not in_fence
            buf = []
            continue
        if in_fence:
            continue
        if not s:
            if buf:
                break
            continue
        if (s.startswith(("#", "|", "<", ">", "- ", "* ", "1.", "![", "[!["))
                or re.match(r"^\d+\.\s", s)):
            if buf:
                break
            continue
        buf.append(s)
    text = strip_markdown(" ".join(buf))
    if len(text) > 220:
        text = text[:217].rsplit(" ", 1)[0] + "…"
    return text


def read_time(body: str) -> int:
    words = len(re.findall(r"\S+", strip_markdown(body)))
    return max(1, math.ceil(words / 220))


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

CATEGORIES = [
    ("security", "Security & Compliance"),
    ("agents", "Agents & Orchestration"),
    ("testing", "Testing & Quality"),
    ("frontend", "Web & Frontend"),
    ("mobile", "Mobile & Apps"),
    ("backend", "Backend & APIs"),
    ("data", "Data & Storage"),
    ("ai", "AI & ML"),
    ("devops", "DevOps & Infra"),
    ("business", "Business & Ops"),
    ("content", "Content & Docs"),
    ("languages", "Languages & Runtimes"),
    ("workflow", "Workflow & Git"),
    ("guides", "Guides"),
    ("Overview", "Overview"),
    ("Reference", "Reference"),
    ("Deep Dives", "Deep Dives"),
    ("For AI agents", "For AI Agents"),
    ("Harness Guides", "Harness Guides"),
    ("Install & Setup", "Install & Setup"),
    ("Architecture & Policy", "Architecture & Policy"),
    ("Troubleshooting", "Troubleshooting"),
    ("Rules", "Rules"),
]

CATEGORY_RULES = [
    # security
    ("security", r"security|secure|hipaa|phi-|compliance|gateguard|safety|osint|bounty|"
                 r"threat|exploit|vulnerab|privacy|dependency-review|sanitiz"),
    # mobile
    ("mobile", r"android|kotlin|flutter|dart|swift|ios-|iphone|ipad|react-native|"
               r"compose-multiplatform|harmony|mobile|app-store|arkts|swiftui"),
    # AI / ML (before agents so llm/pytorch land here)
    ("ai", r"\bai\b|\bllm|machine-learning|\bml\b|ml-|mle-|pytorch|\bmodel|inference|training|"
           r"rag-|embedding|deep-research|foundation|scientific|recsys|autonomous-agent|"
           r"prompt|context-budget|token-budget|token-card|unified-memory|latency|"
           r"cost-aware|exa-search|search-first"),
    # agents & orchestration
    ("agents", r"agent|harness|orchestrat|loop|council|team-|dev-team|skill-|"
               r"dynamic-workflow|parallel|gan-|santa|ralphinho|dmux|nanoclaw|nasiko|"
               r"chief|operator-approval|intent-driven|story-lifecycle|module-regression|"
               r"skill-comply|skill-host-compat|skill-scout|skill-stocktake|"
               r"agent-architecture|loop-design|delivery-gate"),
    # testing & quality
    ("testing", r"\btests?\b|\btesting\b|tdd|\bevals?\b|benchmark|\bqa\b|regression|verif|quality|e2e|a11y-test|"
                r"click-path|code-tour|codehealth|plankton|canary|audit|\breview\b|"
                r"self-evaluation|brownfield|skill-comply|compliance"),
    # frontend
    ("frontend", r"react|vue|angular|nextjs|nuxt|frontend|design-system|accessibility|"
                 r"ui-|motion|liquid-glass|make-interfaces|seo\b|i18n|css|tailwind|"
                 r"vite|web-|browser|web\b|web3|design|glass"),
    # data & storage
    ("data", r"postgres|mysql|clickhouse|redis|database|prisma|jpa|mybatis|migration|"
             r"data-|recsys|\bsql\b|\borm\b|warehouse|analytics|dashboard|scraper|\bsearch\b|"
             r"unified-memory|throughput|cache|index"),
    # backend & APIs
    ("backend", r"backend|api-|api\b|django|fastapi|laravel|nestjs|nodejs|node\.js|"
                r"rails|springboot|php|jwt|graphql|websocket|microservice|server|"
                r"error-handling|hexagonal|contract-first|quarkus|dotnet|\bjpa\b|http"),
    # devops & infra
    ("devops", r"docker|kubernetes|deploy|flox|homelab|network|uncloud|terminal|"
               r"automation-audit|production|monitoring|pm2|infra|ci-|devops|cloud|"
               r"latency-critical|energy-procurement|osint"),
    # business & ops
    ("business", r"billing|finance|healthcare|marketing|investor|market|sales|customer|"
                 r"logistics|inventory|supply|procurement|carrier|contract|esign|"
                 r"visa|growth|lead-|email-ops|messages-ops|workspace|jira|returns|"
                 r"customs|production-scheduling|nonconformance|enterprise|payment|"
                 r"x402|defi|evm|amm|token-decimals|prediction-market|trading|"
                 r"ito-|scientific-db|pubmed|uspto|business|commerce"),
    # content & docs
    ("content", r"article|writing|docs|documentation|content|brand|copy|video|"
                r"slide|manim|blender|remotion|social|crosspost|publisher|"
                r"knowledge|research|study|publication|story|i18n-sync|seo-specialist|"
                r"visual|image|media|voice|crosspost"),
    # languages & runtimes
    ("languages", r"golang|rust|cpp|csharp|fsharp|java-|perl|ruby|python-patterns|"
                  r"python-|bun|deno|elixir|scala|php-patterns|typescript|lang|"
                  r"coding-standards|clean-architecture|patterns$|concurrency"),
    # workflow & git
    ("workflow", r"\bgit\b|github|commit|\breview\b|\bpr\b|pull|opensource|onboarding|repo|"
                 r"blueprint|architecture|project|plan|spec|workflow|configure|"
                 r"ecc-|install|setup|runbook|handoff|template|governance|"
                 r"decision|impact|inventory|delivery|session|checkpoint|resume"),
]

# Explicit overrides win over the regex rules above.
CATEGORY_OVERRIDES = {
    "accessibility": "frontend",
    "frontend-a11y": "frontend",
    "a11y-architect": "frontend",
    "click-path-audit": "testing",
    "code-tour": "workflow",
    "browser-qa": "testing",
    "gan-style-harness": "agents",
    "gan-build": "agents",
    "gan-design": "agents",
    "continuous-learning": "agents",
    "continuous-learning-v2": "agents",
    "continuous-agent-loop": "agents",
    "taste": "content",
    "taste-application": "content",
    "taste-distillation": "content",
    "tasteforge-video": "content",
    "videodb": "content",
    "video-editing": "content",
    "remotion-video-creation": "content",
    "manim-video": "content",
    "frontend-slides": "content",
    "ui-demo": "frontend",
    "ui-to-vue": "frontend",
    "design-system": "frontend",
    "make-interfaces-feel-better": "frontend",
    "liquid-glass-design": "frontend",
    "seo": "content",
    "seo-specialist": "content",
    "i18n-sync": "workflow",
    "x-api": "content",
    "crosspost": "content",
    "social-publisher": "content",
    "social-graph-ranker": "business",
    "content-engine": "content",
    "brand-discovery": "content",
    "brand-voice": "content",
    "article-writing": "content",
    "docs-governance": "content",
    "living-docs-governance": "content",
    "documentation-lookup": "content",
    "deep-research": "content",
    "research-ops": "content",
    "knowledge-ops": "content",
    "scientific-thinking-literature-review": "content",
    "scientific-thinking-scholar-evaluation": "content",
    "scientific-db-pubmed-database": "data",
    "scientific-db-uspto-database": "data",
    "scientific-pkg-gget": "content",
    "ck": "content",
    "token-optimization": "ai",
    "prompt-caching-strategy": "ai",
    "prompt-optimizer": "ai",
    "cost-aware-llm-pipeline": "ai",
    "cost-tracking": "business",
    "llm-trading-agent-security": "security",
    "prediction-market-oracle-research": "business",
    "prediction-market-risk-review": "business",
    "evm-token-decimals": "business",
    "nodejs-keccak256": "business",
    "defi-amm-security": "security",
    "x402": "business",
    "agent-payment-x402": "business",
    "ito-baskets": "business",
    "ito-compute": "business",
    "ito-inference": "business",
    "ito-training": "business",
    "energy-procurement": "business",
    "delivery-gate": "workflow",
    "module-regression": "testing",
    "unified-memory": "ai",
    "unified-notifications-ops": "business",
    "google-workspace-ops": "business",
    "email-ops": "business",
    "messages-ops": "business",
    "jira-integration": "business",
    "mailtrap-email-integration": "backend",
    "visa-doc-translate": "business",
    "healthcare-cdss-patterns": "business",
    "healthcare-emr-patterns": "business",
    "healthcare-eval-harness": "testing",
    "healthcare-phi-compliance": "security",
    "hipaa-compliance": "security",
    "quality-nonconformance": "business",
    "production-scheduling": "business",
    "returns-reverse-logistics": "business",
    "logistics-exception-management": "business",
    "inventory-demand-planning": "business",
    "carrier-relationship-management": "business",
    "counterparty-channel-discipline": "business",
    "customs-trade-compliance": "business",
    "master-agreement-generator": "business",
    "esign-field-placement": "business",
    "enterprise-agent-ops": "agents",
    "customer-billing-ops": "business",
    "finance-billing-ops": "business",
    "growth-log": "business",
    "investor-materials": "business",
    "investor-outreach": "business",
    "market-research": "business",
    "marketing-campaign": "business",
    "lead-intelligence": "business",
    "strategic-compact": "agents",
    "plan-orchestrate": "agents",
    "plan-canvas": "workflow",
    "parallel-execution-optimizer": "agents",
    "team-builder": "agents",
    "team-agent-orchestration": "agents",
    "dev-team": "agents",
    "council": "agents",
    "council-multi-model": "agents",
    "agent-sort": "agents",
    "agent-eval": "testing",
    "agent-architecture-audit": "agents",
    "agent-introspection-debugging": "agents",
    "agent-runtime-gateway-smoke-test": "testing",
    "agent-self-evaluation": "testing",
    "agent-harness-construction": "agents",
    "agent-security-hardening": "security",
    "agentic-engineering": "agents",
    "agentic-os": "agents",
    "ai-first-engineering": "agents",
    "ai-regression-testing": "testing",
    "autonomous-agent-harness": "agents",
    "autonomous-loops": "agents",
    "loop-design-check": "agents",
    "recursive-decision-ledger": "agents",
    "orch-add-feature": "agents",
    "orch-build-mvp": "agents",
    "orch-change-feature": "agents",
    "orch-fix-defect": "agents",
    "orch-pipeline": "agents",
    "orch-refine-code": "agents",
    "opensource-pipeline": "workflow",
    "opensource-forker": "workflow",
    "opensource-packager": "workflow",
    "opensource-sanitizer": "workflow",
    "codebase-onboarding": "workflow",
    "repo-scan": "workflow",
    "code-tour": "workflow",
    "change-impact": "workflow",
    "project-flow-ops": "workflow",
    "story-lifecycle": "workflow",
    "architecture-decision-records": "workflow",
    "hexagonal-architecture": "backend",
    "blueprint": "workflow",
    "plan-orchestrate": "agents",
    "intent-driven-development": "workflow",
    "search-first": "workflow",
    "context-and-decisions": "workflow",
    "context-budget": "agents",
    "token-budget-advisor": "ai",
    "token-card": "agents",
    "cost-tracking": "business",
    "cost-aware-llm-pipeline": "ai",
    "benchmark": "testing",
    "benchmark-methodology": "testing",
    "benchmark-optimization-loop": "testing",
    "eval-harness": "testing",
    "gan-style-harness": "agents",
    "deployment-patterns": "devops",
    "docker-patterns": "devops",
    "kubernetes-patterns": "devops",
    "uncloud": "devops",
    "flox-environments": "devops",
    "homelab-network-readiness": "devops",
    "homelab-network-setup": "devops",
    "homelab-pihole-dns": "devops",
    "homelab-vlan-segmentation": "devops",
    "homelab-wireguard-vpn": "devops",
    "network-bgp-diagnostics": "devops",
    "network-config-validation": "devops",
    "network-interface-health": "devops",
    "automation-audit-ops": "devops",
    "canary-watch": "devops",
    "terminal-ops": "devops",
    "terminal-opener": "devops",
    "nanoclaw-repl": "agents",
    "nasiko-control-plane": "agents",
    "product-capability": "workflow",
    "product-lens": "workflow",
    "opensource-pipeline": "workflow",
    "skill-stocktake": "agents",
    "skill-scout": "agents",
    "skill-host-compat": "agents",
    "skill-comply": "agents",
    "rules-distill": "workflow",
    "config-gc": "devops",
    "configure-ecc": "workflow",
    "ecc-guide": "workflow",
    "ecc-recipes": "workflow",
    "ecc-tools-cost-audit": "business",
    "generating-python-installer": "devops",
    "enterprise-agent-ops": "agents",
    "api-design": "backend",
    "api-connector-builder": "backend",
    "mcp-server-patterns": "agents",
    "connections-optimizer": "business",
    "competitive-platform-analysis": "business",
    "iterative-retrieval": "ai",
    "cisco-ios-patterns": "devops",
    "coding-standards": "workflow",
    "production-audit": "devops",
    "brownfield-retrospective": "workflow",
    "conventional-commit-review": "workflow",
    "workspace-surface-audit": "workflow",
    "latency-critical-systems": "devops",
    "motion-foundations": "frontend",
    "motion-advanced": "frontend",
    "motion-patterns": "frontend",
    "blender-motion-state-inspection": "content",
    "nutrient-document-processing": "content",
    "openclaw-persona-forge": "agents",
    "hookify-rules": "workflow",
    "hermes-imports": "workflow",
    "inherit-legacy-style": "workflow",
    "ck": "agents",
    "tinystruct-patterns": "backend",
    "verification-loop": "testing",
    "delivery-gate": "workflow",
    "product-capability": "workflow",
    "product-lens": "workflow",
    "unified-memory": "ai",
    "research-ops": "content",
    "knowledge-ops": "content",
    "deep-research": "content",
    "search-first": "workflow",
    "seo": "content",
    "seo-specialist": "content",
    "skill-create": "agents",
    "skill-health": "agents",
    "skill-host-compat": "agents",
    "mcp-dependency-review": "security",
}


def classify(key: str, text: str, kind: str) -> str:
    if key in CATEGORY_OVERRIDES:
        return CATEGORY_OVERRIDES[key]
    blob = f"{key} {text}".lower()
    for cat, pattern in CATEGORY_RULES:
        if re.search(pattern, key.lower()):
            return cat
    for cat, pattern in CATEGORY_RULES:
        if re.search(pattern, blob):
            return cat
    return "workflow" if kind == "skill" else "workflow"


DOC_CATEGORY = [
    ("Troubleshooting", r"troubleshoot|bug|support|fix"),
    ("Install & setup", r"install|setup|selective|migration|statusline|configure|lane-rules"),
    ("Harness guides", r"guide|hermes|antigravity|qwen|joycode|codex|atlas|deepseek|astra|ito-desk"),
    ("Architecture & policy", r"architecture|roadmap|policy|pattern|spec|governance|adaptation|inventory|ledger|token-optimization|capability|selection"),
]


def doc_category(path: Path, title: str, desc: str) -> str:
    blob = f"{path.name} {title} {desc}".lower()
    for label, pattern in DOC_CATEGORY:
        if re.search(pattern, blob):
            return label
    return "Reference"


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def git_meta(source: Path) -> dict:
    def run(*args):
        try:
            return subprocess.check_output(["git", "-C", str(source), *args],
                                           stderr=subprocess.DEVNULL, text=True).strip()
        except Exception:
            return ""
    commit = run("rev-parse", "HEAD")
    version = ""
    vf = source / "VERSION"
    if vf.is_file():
        version = vf.read_text(encoding="utf-8").strip()
    return {
        "repo": "affaan-m/ECC",
        "url": UPSTREAM_URL,
        "commit": commit,
        "commitShort": commit[:7],
        "version": version,
        "license": "MIT",
        "commitDate": run("show", "-s", "--format=%cs", "HEAD"),
    }


def collect(source: Path) -> list[dict]:
    items: list[dict] = []
    file_map: dict[str, list[str]] = {}

    def add(kind: str, ident: str, path: str, meta: dict, body: str, group: str = "",
            extra: list[dict] | None = None):
        body = strip_first_h1(body)
        h1 = first_h1(body)  # no longer used after stripping; kept for clarity
        raw_title = meta.get("title") or first_h1(meta.get("_body", "")) or ""
        desc = meta.get("description", "") or first_paragraph(body)
        desc = strip_markdown(desc)
        if len(desc) > 200:
            desc = desc[:197].rsplit(" ", 1)[0] + "…"
        title = meta.get("title") or (first_h1(meta.get("_body", "")) or titleize(meta.get("name") or ident))
        title = re.sub(r"\s+", " ", title).strip()
        item = {
            "id": ident,
            "type": kind,
            "name": meta.get("name") or ident,
            "title": title,
            "desc": desc,
            "category": meta["category"],
            "group": group,
            "summary": first_paragraph(body),
            "readMin": read_time(body),
            "bytes": len(body.encode("utf-8")),
            "path": path,
            "tags": meta.get("tags", []),
            "md": body,
            "files": extra or [],
        }
        items.append(item)
        file_map[path] = [kind, ident, ""]
        for f in item["files"]:
            file_map[f"{os.path.dirname(path)}/{f['p']}"] = [kind, ident, f["p"]]

    # Skills ---------------------------------------------------------------
    skills_root = source / "skills"
    if skills_root.is_dir():
        for d in sorted(os.listdir(skills_root)):
            skill_md = skills_root / d / "SKILL.md"
            if not skill_md.is_file():
                continue
            text = skill_md.read_text(encoding="utf-8", errors="replace")
            fm, body = parse_frontmatter(text)
            kind = "skill"
            cat = classify(d, fm.get("description", ""), kind)
            extra = []
            for dirpath, _, files in os.walk(skills_root / d):
                for fname in sorted(files):
                    if not fname.endswith(".md") or fname == "SKILL.md":
                        continue
                    fp = Path(dirpath) / fname
                    rel = fp.relative_to(skills_root / d).as_posix()
                    if len(extra) >= 40:
                        break
                    try:
                        sub_text = fp.read_text(encoding="utf-8", errors="replace")
                    except OSError:
                        continue
                    sub_fm, sub_body = parse_frontmatter(sub_text)
                    sub_title = sub_fm.get("title") or first_h1(sub_body) or titleize(Path(rel).stem)
                    extra.append({
                        "p": rel,
                        "t": strip_markdown(sub_title),
                        "md": strip_first_h1(sub_body) if first_h1(sub_body) else sub_body,
                    })
            add(kind, d, f"skills/{d}/SKILL.md", {
                **fm, "name": fm.get("name", d), "category": cat,
                "tags": fm.get("tags", []) if isinstance(fm.get("tags"), list) else [],
                "_body": body, "title": fm.get("title", ""),
            }, body, extra=extra)

    # Agents ---------------------------------------------------------------
    agents_root = source / "agents"
    if agents_root.is_dir():
        for fname in sorted(os.listdir(agents_root)):
            if not fname.endswith(".md"):
                continue
            fp = agents_root / fname
            text = fp.read_text(encoding="utf-8", errors="replace")
            fm, body = parse_frontmatter(text)
            ident = fname[:-3]
            cat = classify(ident, fm.get("description", ""), "agent")
            add("agent", ident, f"agents/{fname}", {**fm, "category": cat, "_body": body,
                "title": ""}, body)

    # Commands -------------------------------------------------------------
    commands_root = source / "commands"
    if commands_root.is_dir():
        for fname in sorted(os.listdir(commands_root)):
            if not fname.endswith(".md"):
                continue
            fp = commands_root / fname
            text = fp.read_text(encoding="utf-8", errors="replace")
            fm, body = parse_frontmatter(text)
            ident = fname[:-3]
            cat = classify(ident, fm.get("description", ""), "command")
            add("command", ident, f"commands/{fname}", {
                **fm, "name": fm.get("name", ident), "category": cat,
                "_body": body, "title": titleize(ident),
            }, body)

    # Rules ----------------------------------------------------------------
    rules_root = source / "rules"
    if rules_root.is_dir():
        for lang in sorted(os.listdir(rules_root)):
            ldir = rules_root / lang
            if not ldir.is_dir():
                continue
            for fname in sorted(os.listdir(ldir)):
                if not fname.endswith(".md"):
                    continue
                fp = ldir / fname
                text = fp.read_text(encoding="utf-8", errors="replace")
                fm, body = parse_frontmatter(text)
                ident = f"{lang}/{fname[:-3]}"
                label = "Shared" if lang == "common" else titleize(lang.replace("-", " "))
                rule_name = titleize(fname[:-3])
                add("rule", ident, f"rules/{lang}/{fname}", {
                    **fm, "name": ident, "category": "rules",
                    "_body": body, "title": f"{label} · {rule_name}",
                    "description": fm.get("description", "") or f"{label} {rule_name.lower()} rules.",
                }, body, group=label)

    # Docs -----------------------------------------------------------------
    docs_root = source / "docs"
    if docs_root.is_dir():
        for fname in sorted(os.listdir(docs_root)):
            if not fname.endswith(".md"):
                continue
            fp = docs_root / fname
            text = fp.read_text(encoding="utf-8", errors="replace")
            fm, body = parse_frontmatter(text)
            ident = fname[:-3]
            title = fm.get("title") or first_h1(body) or titleize(ident)
            desc = fm.get("description", "") or first_paragraph(body)
            add("doc", ident, f"docs/{fname}", {
                **fm, "name": ident, "category": doc_category(fp, title, desc),
                "_body": body, "title": title, "description": desc,
            }, body, group="Guides")

    # Root-level guides -----------------------------------------------------
    root_docs = [
        ("README.md", "ECC README", "Overview"),
        ("COMMANDS-QUICK-REF.md", "Command quick reference", "Reference"),
        ("AGENTS.md", "AGENTS.md", "For AI agents"),
        ("CLAUDE.md", "CLAUDE.md", "For AI agents"),
        ("SOUL.md", "SOUL.md", "For AI agents"),
        ("TROUBLESHOOTING.md", "Troubleshooting (repo root)", "Troubleshooting"),
        ("the-longform-guide.md", "The longform guide", "Deep dives"),
        ("the-shortform-guide.md", "The shortform guide", "Deep dives"),
        ("the-security-guide.md", "The security guide", "Deep dives"),
        ("CONTRIBUTING.md", "Contributing to ECC", "Reference"),
        ("SECURITY.md", "Security policy", "Security & Compliance"),
    ]
    for fname, title, cat in root_docs:
        fp = source / fname
        if not fp.is_file():
            continue
        text = fp.read_text(encoding="utf-8", errors="replace")
        fm, body = parse_frontmatter(text)
        ident = f"repo-{fname[:-3].lower().replace('.', '-')}"
        add("doc", ident, fname, {
            **fm, "name": ident, "category": cat,
            "_body": body, "title": title,
            "description": fm.get("description", "") or first_paragraph(body),
        }, body, group="Repo")

    hooks_readme = source / "hooks" / "README.md"
    if hooks_readme.is_file():
        text = hooks_readme.read_text(encoding="utf-8", errors="replace")
        fm, body = parse_frontmatter(text)
        add("doc", "repo-hooks-overview", "hooks/README.md", {
            **fm, "name": "repo-hooks-overview", "category": "Harness Guides",
            "_body": body, "title": "Hooks overview",
            "description": fm.get("description", "") or first_paragraph(body),
        }, body, group="Repo")

    rules_readme = source / "rules" / "README.md"
    if rules_readme.is_file():
        text = rules_readme.read_text(encoding="utf-8", errors="replace")
        fm, body = parse_frontmatter(text)
        add("doc", "repo-rules-overview", "rules/README.md", {
            **fm, "name": "repo-rules-overview", "category": "Reference",
            "_body": body, "title": "Rules overview",
            "description": fm.get("description", "") or first_paragraph(body),
        }, body, group="Repo")

    return items, file_map


def build_collections(items: list[dict]) -> list[dict]:
    by_id = {i["id"]: i for i in items}

    def pick(*ids):
        return [f"{by_id[i]['type']}:{i}" for i in ids if i in by_id]

    collections = [
        {
            "id": "start",
            "title": "Start here",
            "desc": "The fastest tour of ECC: what it is, how to install it, and how to work with it.",
            "icon": "spark",
            "items": pick("ecc-guide", "configure-ecc", "ecc-recipes", "coding-standards",
                          "search-first", "git-workflow", "context-and-decisions",
                          "codebase-onboarding"),
        },
        {
            "id": "mobile",
            "title": "Ship mobile apps",
            "desc": "Architecture, UI patterns, and reviews for Android, iOS, Flutter, and React Native.",
            "icon": "phone",
            "items": pick("android-clean-architecture", "react-native-patterns",
                          "dart-flutter-patterns", "kotlin-patterns", "swiftui-patterns",
                          "compose-multiplatform-patterns", "ios-icon-gen",
                          "flutter-dart-code-review", "accessibility"),
        },
        {
            "id": "security",
            "title": "Write secure code",
            "desc": "Reviews, hardening, compliance, and threat-aware engineering.",
            "icon": "shield",
            "items": pick("security-review", "security-scan", "security-bounty-hunter",
                          "agent-security-hardening", "gateguard", "safety-guard",
                          "mcp-dependency-review", "owasp", "hipaa-compliance"),
        },
        {
            "id": "testing",
            "title": "Test like a pro",
            "desc": "TDD loops, end-to-end coverage, evals, and benchmark discipline.",
            "icon": "check",
            "items": pick("tdd-workflow", "e2e-testing", "python-testing", "react-testing",
                          "agent-eval", "eval-harness", "benchmark",
                          "verification-loop", "browser-qa"),
        },
        {
            "id": "agents",
            "title": "Build agents",
            "desc": "Harnesses, loops, orchestration, MCP servers, and context budgets.",
            "icon": "bot",
            "items": pick("agent-harness-construction", "autonomous-agent-harness",
                          "agentic-engineering", "mcp-server-patterns", "loop-design-check",
                          "team-agent-orchestration", "prompt-optimizer",
                          "context-budget", "cost-aware-llm-pipeline"),
        },
        {
            "id": "frontend",
            "title": "Polish the interface",
            "desc": "Design systems, motion, accessibility, and the details that feel good.",
            "icon": "layout",
            "items": pick("frontend-design-direction", "design-system", "motion-foundations",
                          "make-interfaces-feel-better", "liquid-glass-design",
                          "accessibility", "ui-demo", "react-performance", "seo"),
        },
        {
            "id": "backend",
            "title": "Backend & data",
            "desc": "APIs, databases, caching, queues, containers, and failure handling.",
            "icon": "server",
            "items": pick("api-design", "backend-patterns", "postgres-patterns",
                          "redis-patterns", "database-migrations", "docker-patterns",
                          "kubernetes-patterns", "error-handling", "fastapi-patterns"),
        },
        {
            "id": "docs",
            "title": "Docs & content",
            "desc": "Research, writing, slides, publishing, and documentation that stays alive.",
            "icon": "file",
            "items": pick("article-writing", "documentation-lookup", "deep-research",
                          "content-engine", "frontend-slides", "crosspost",
                          "living-docs-governance", "docs-governance", "brand-voice"),
        },
    ]
    for c in collections:
        c["count"] = len(c["items"])
    return [c for c in collections if c["items"]]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default=str(DEFAULT_SOURCE))
    ap.add_argument("--out", default=str(ROOT / "data"))
    ap.add_argument("--stamp", default="")
    args = ap.parse_args()

    source = Path(args.source)
    if not (source / "skills").is_dir():
        print(f"error: no ECC checkout at {source}", file=sys.stderr)
        return 2

    out = Path(args.out)
    chunks_dir = out / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)
    for old in chunks_dir.glob("*.json"):
        old.unlink()

    items, file_map = collect(source)
    print(f"collected {len(items)} items "
          f"(skills/agents/commands/rules/docs)")

    # sort for stable output
    order = {"skill": 0, "agent": 1, "command": 2, "rule": 3, "doc": 4}
    items.sort(key=lambda i: (order[i["type"]], i["title"].lower()))

    # chunk per type (first chunk of each type is index 0)
    chunk_no: dict[str, int] = {}
    chunk_bytes: dict[str, int] = {}
    chunk_items: dict[str, dict] = {}
    for item in items:
        t = item["type"]
        if t not in chunk_no or chunk_bytes[t] > CHUNK_TARGET:
            idx = sum(1 for k in chunk_items if k.startswith(f"{t}-"))
            chunk_no[t] = idx
            chunk_items[f"{t}-{idx}"] = {}
            chunk_bytes[t] = 0
        item["chunk"] = chunk_no[t]
        payload = {"m": item["md"]}
        if item["files"]:
            payload["f"] = [[f["p"], f["t"], f["md"]] for f in item["files"]]
        chunk_items[f"{t}-{item['chunk']}"][item["id"]] = payload
        chunk_bytes[t] += len(item["md"].encode("utf-8")) + sum(
            len(f["md"].encode("utf-8")) for f in item["files"])

    for key, payload in chunk_items.items():
        (chunks_dir / f"{key}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")

    counts: dict[str, int] = {}
    category_counts: dict[str, int] = {}
    for item in items:
        counts[item["type"]] = counts.get(item["type"], 0) + 1
        category_counts[item["category"]] = category_counts.get(item["category"], 0) + 1

    cats = [{"id": cid, "label": label, "count": category_counts.get(cid, 0)}
            for cid, label in CATEGORIES if category_counts.get(cid)]
    unknown = sorted(set(category_counts) - {c[0] for c in CATEGORIES})
    if unknown:
        cats += [{"id": u, "label": u.title(), "count": category_counts[u]} for u in unknown]

    manifest_items = []
    for item in items:
        manifest_items.append({
            "i": f'{item["type"]}:{item["id"]}',
            "t": item["type"],
            "n": item["name"],
            "ti": item["title"],
            "d": item["desc"],
            "c": item["category"],
            "g": item["group"],
            "r": item["readMin"],
            "b": item["bytes"],
            "ch": item["chunk"],
            "p": item["path"],
            "k": item["tags"][:6],
            "f": len(item["files"]),
        })

    meta = git_meta(source)
    gen = args.stamp or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = {
        "version": 1,
        "generated": gen,
        "source": meta,
        "counts": counts,
        "categories": cats,
        "collections": build_collections(items),
        "fileMap": file_map,
        "chunks": {t: sum(1 for k in chunk_items if k.startswith(f"{t}-")) for t in counts},
        "items": manifest_items,
    }
    total_chunk = sum(p.stat().st_size for p in chunks_dir.glob("*.json"))
    manifest["packBytes"] = len(json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))) + total_chunk
    (out / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"manifest: {(out / 'manifest.json').stat().st_size / 1024:.0f} KB")
    print(f"chunks:   {len(chunk_items)} files, {total_chunk / 1024 / 1024:.2f} MB")
    for t in ("skill", "agent", "command", "rule", "doc"):
        print(f"  {t:<8} {counts.get(t, 0):>4} items")
    print("categories:")
    for c in cats:
        print(f"  {c['label']:<28} {c['count']:>4}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
