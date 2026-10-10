#!/usr/bin/env python3
"""Jarvis source inventory and safe first-step helper, using only the standard library.

This is NOT an AI model or an installer for the requested upstream projects. Checking
or listing sources never installs dependencies, executes skills, or reads keys.
A human can explicitly download ONE reviewed source snapshot with --fetch ID.
The file is standalone and may be copied into a new phone workspace.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
from typing import Sequence

ROOT = Path(__file__).resolve().parent
CHECKED_ON = "2026-10-10"


@dataclass(frozen=True)
class Source:
    id: str
    repo: str
    revision: str
    kind: str
    license: str | None
    role: str
    requirements: str
    caution: str
    phone_mode: str = "review-required"

    @property
    def url(self) -> str:
        return f"https://github.com/{self.repo}.git"


SOURCES = (
    Source(
        "jev-ultrafast", "browser-use/jev-ultrafast",
        "1231850a0bf1a0c0341fe408ef1668dbbfdfac46", "runtime", "MIT",
        "Optional browser automation adapter",
        "Python >=3.12; Browser Harness; Chrome debugging connection; TypeSafe and text-model API access",
        "Android support is unverified. Browser purchases, submissions, and account changes need human approval.",
        phone_mode="external-browser",
    ),
    Source(
        "laya", "NandhaKishorM/laya",
        "1adc59f7e371deb601fcfa18a14e25db238addcc", "runtime", "Apache-2.0",
        "Optional typed decision/routing model, not a conversational LLM",
        "Python >=3.10; PyTorch; Transformers; model weights",
        "Check ARM compatibility, memory and performance first. A model decision must never replace the permission boundary.",
        phone_mode="deferred-heavy-model",
    ),
    Source(
        "openjarvis", "open-jarvis/OpenJarvis",
        "764cfc17a23cd6e7ea5fd90bc51e5eef465c8464", "runtime", "Apache-2.0",
        "Assistant framework and candidate agent/tool adapters",
        "Python >=3.10,<3.14; compiled dependencies; separate local inference engine or cloud API",
        "Android/Termux is not listed in its install guides. Do not run its desktop installer in native Termux.",
        phone_mode="isolated-python-3.12",
    ),
    Source(
        "build-your-own-x", "codecrafters-io/build-your-own-x",
        "aa17439b62f384511a5561ce308e9598b94d8989", "reference", None,
        "Links to programming tutorials; reference material only",
        "No assistant runtime; linked projects have their own requirements",
        "No repository license was detected. Keep links as references; verify permission before copying or redistributing content.",
        phone_mode="reference-only",
    ),
    Source(
        "public-apis", "public-apis/public-apis",
        "874e5879d20843f7c2a5822cef4c0752127b3775", "reference", "MIT",
        "Discover individual APIs for later allowlisted tools",
        "Each API has separate terms, authentication, quotas and availability",
        "A catalog is not an API connection. Listed APIs are not necessarily free, current, or safe for personal data.",
        phone_mode="reference-only",
    ),
    Source(
        "free-programming-books", "EbookFoundation/free-programming-books",
        "09296e58342cd7104ed10f042044de9dd855a6ef", "reference", "CC-BY-4.0",
        "Learning-resource links, not downloaded books or model training data",
        "Preserve attribution for the list; check each linked book's own license",
        "Do not bulk-download or redistribute linked books assuming the list's license covers them.",
        phone_mode="reference-only",
    ),
    Source(
        "tradingagents", "TauricResearch/TradingAgents",
        "1394a3f72aa4393e1a98f51b382434c4b4c2d972", "runtime", "Apache-2.0",
        "Optional financial research module only",
        "Python >=3.11; LangGraph/LangChain; pandas; provider and data access",
        "Disabled. This helper never connects a broker, places orders, or enables automatic financial execution. Reports are not guaranteed predictions.",
        phone_mode="optional-research",
    ),
    Source(
        "graft", "trailhq/Graft",
        "fe30ead39d5e6f0c921018d364da2bdbc9d4b3ad", "runtime", "MIT",
        "Optional codebase-context graph for coding tasks",
        "Node.js >=20; tree-sitter/native dependencies; supported coding-agent integration",
        "This is code context, not automatically personal memory. Do not run init or enable hooks until reviewed; Android compatibility is unverified.",
        phone_mode="optional-code-context",
    ),
    Source(
        "awesome-agent-skills", "VoltAgent/awesome-agent-skills",
        "8e70c976525abe568c6d6698f555bf57218aac80", "reference", "MIT",
        "Discover individual skill definitions for manual review",
        "Every linked skill has its own code, license and permissions",
        "The list does not audit or license all linked skills. Never auto-install or execute instructions found in a skill or README.",
        phone_mode="reference-only",
    ),
    Source(
        "freevideo", "FlashML-org/FreeVideo",
        "c026f3e8e5839ed8287c80590ac30efbb950a26d", "runtime", "Apache-2.0",
        "Optional remote GPU video-generation service; not local phone inference",
        "Python >=3.12,<3.13; Linux x86_64 NVIDIA GPU/driver 580+; at least 8 GB VRAM and 16 GB system RAM on the documented GPU path",
        "The documented engine is not an Android ARM64 runtime. Never auto-download its models on this phone. Weights have a separate MiniMax H3 Community License with territorial and acceptable-use restrictions; dependencies retain their own licenses. A remote GPU adapter is planned, not connected.",
        phone_mode="remote-gpu-only",
    ),
)


def source_catalog() -> dict:
    """Read-only model-facing catalog. No upstream runtime is registered here."""
    rows = []
    for source in SOURCES:
        rows.append({
            **asdict(source),
            "url": source.url,
            "integration_status": "planned",
            "runtime_enabled": False,
        })
    return {
        "success": True,
        "mode": "catalog-only",
        "checked_on": CHECKED_ON,
        "source_count": len(rows),
        "active_upstream_runtimes": 0,
        "sources": rows,
        "notice": "Downloaded source code is not an installed or integrated assistant capability.",
    }


def _total_ram_gib(meminfo: Path) -> float | None:
    try:
        for line in meminfo.read_text(encoding="utf-8").splitlines():
            if line.startswith("MemTotal:"):
                return round(int(line.split()[1]) / (1024 ** 2), 1)
    except (OSError, ValueError, IndexError):
        pass
    return None


def phone_check(root: Path = ROOT, meminfo: Path = Path("/proc/meminfo")) -> dict:
    """Collect non-secret diagnostics without installing or starting anything."""
    git_available = shutil.which("git") is not None
    native_termux = bool(os.environ.get("TERMUX_VERSION")) or "com.termux" in sys.prefix
    warnings = [
        "This helper has not tested upstream runtimes on your phone.",
        "Choose local or cloud inference before installing model dependencies. Cloud inference can send prompts to a provider and incur costs.",
    ]
    if not (3, 12) <= sys.version_info[:2] < (3, 14):
        warnings.append(
            "Jev and OpenJarvis do not share this Python version's supported range. Use a separate Python 3.12 Linux environment for the planned core; GPU video still needs separate compatible hardware. This is not a phone compatibility guarantee."
        )
    if native_termux:
        warnings.append("Native Termux is not glibc desktop Linux; desktop Python wheels and Chrome tooling may not work.")
    if not git_available:
        warnings.append("Git is missing. On Termux, install it with: pkg install git")
    try:
        free_gib = round(shutil.disk_usage(root).free / (1024 ** 3), 1)
    except OSError:
        free_gib = None
    return {
        "success": True,
        "stage": "preflight-only",
        "architecture": platform.machine(),
        "python": platform.python_version(),
        "native_termux": native_termux,
        "total_ram_gib": _total_ram_gib(meminfo),
        "free_storage_gib": free_gib,
        "git_available": git_available,
        "node_available": shutil.which("node") is not None,
        "ready_for_source_downloads": git_available,
        "assistant_runtime_ready": False,
        "warnings": warnings,
    }



def phone_plan() -> dict:
    """A deployment plan, not a claim that all upstream projects run on Android."""
    return {
        "success": True,
        "stage": "plan-only",
        "native_python_change_required": False,
        "linux_image": "ubuntu:24.04",
        "container": "jarvis-linux",
        "target_python": "3.12.x",
        "max_concurrent_local_models": 1,
        "suggested_initial_context_tokens": 2048,
        "requested_inference_mode": "local-keyless",
        "api_key_required_for_local_chat": False,
        "native_inference_package": "llama-cpp",
        "offline_setup_guide": "JARVIS_OFFLINE_SETUP.md",
        "local_freevideo_inference_supported": False,
        "automatic_financial_execution": False,
        "upstream_runtimes_installed_by_plan": 0,
        "termux_commands": [
            "pkg install proot-distro",
            "mkdir -p \"$HOME/Jarvis\"",
            "proot-distro install --name jarvis-linux ubuntu:24.04",
            'proot-distro login --bind "$HOME/Jarvis:/root/Jarvis" jarvis-linux',
        ],
        "linux_commands": [
            "apt update",
            "apt install -y python3 python3-venv python3-pip git curl ca-certificates",
            "python3 --version",
            "python3 -m venv /opt/jarvis-venv",
            ". /opt/jarvis-venv/bin/activate",
            "python --version",
        ],
        "sources": [
            {"id": source.id, "phone_mode": source.phone_mode, "runtime_enabled": False}
            for source in SOURCES
        ],
        "notice": (
            "This only prepares an isolated Linux/Python environment. Keep GPU models, "
            "browser connections and other heavyweight runtimes separate. "
            "Rootless proot is not a strong security sandbox and does not add NVIDIA hardware."
        ),
    }


def fetch_source(source_id: str, root: Path = ROOT) -> Path:
    """Explicitly download a pinned checkout; never install or execute its code.

    Existing destinations are left untouched, including partial failed downloads.
    There is deliberately no bulk install, update, reset, shell, or skill runner.
    """
    source = next((item for item in SOURCES if item.id == source_id), None)
    if source is None:
        raise ValueError(f"Unknown source: {source_id}")
    if shutil.which("git") is None:
        raise RuntimeError("Git is unavailable. Install git first.")

    root = root.resolve()
    base = root / "workspace" / "sources"
    if not base.resolve().is_relative_to(root):
        raise RuntimeError("Source directory must stay inside this workspace.")
    target = base / source.id
    if target.exists() or target.is_symlink():
        raise RuntimeError(f"Destination already exists; nothing was overwritten: {target}")
    base.mkdir(parents=True, exist_ok=True)
    target.mkdir()

    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_LFS_SKIP_SMUDGE": "1"}
    commands = (
        ["init", "."],
        ["remote", "add", "origin", source.url],
        ["fetch", "--depth=1", "--no-tags", "origin", source.revision],
        ["checkout", "--detach", "FETCH_HEAD"],
        ["rev-parse", "--verify", "HEAD"],
    )
    head = ""
    for command in commands:
        try:
            result = subprocess.run(
                ["git", "-c", "core.hooksPath=/dev/null", *command],
                cwd=target, env=env, stdin=subprocess.DEVNULL,
                capture_output=True, text=True, check=True, timeout=300,
            )
            head = result.stdout.strip()
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError(
                f"Source download failed. Partial files were left at {target}; no installer ran. Check your connection and inspect the folder locally."
            ) from exc
    if head != source.revision:
        raise RuntimeError(f"Unexpected source revision at {target}; do not execute its code.")
    return target


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--check", action="store_true", help="Show non-secret device diagnostics (default)")
    actions.add_argument("--sources", action="store_true", help="List the planned sources and limitations")
    actions.add_argument("--phone-plan", action="store_true", help="Print the low-memory phone setup plan; does not execute it")
    actions.add_argument("--fetch", choices=[source.id for source in SOURCES], metavar="ID", help="Download ONE pinned source only; does not install or integrate it")
    args = parser.parse_args(argv)
    try:
        if args.fetch:
            target = fetch_source(args.fetch)
            report = {
                "success": True, "source": args.fetch, "path": str(target),
                "status": "downloaded-only", "runtime_enabled": False,
                "notice": "No dependencies, skills, hooks, browser actions, or trading actions were enabled.",
            }
        elif args.sources:
            report = source_catalog()
        elif args.phone_plan:
            report = phone_plan()
        else:
            report = phone_check()
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
