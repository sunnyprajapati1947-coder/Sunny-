import os
from pathlib import Path

ROOT = Path.home() / "Nova"
SOURCES = {
    "hakim": ROOT / "github" / "local-ai-agent",
    "mimir": ROOT / "github" / "mimir",
    "android_agent": ROOT / "github" / "local-AI-Agent",
    "termux_assistant": ROOT / "github" / "termux-assistant",
    "llama_agent": ROOT / "github" / "llama-agent",
    "nova_voice": ROOT / "github" / "nova-ai-assistant",
}

# Linked sources are external repositories Nova reads as reference material but
# deliberately does NOT vendor into the tracked repository tree: their size
# would dominate the checkout. Each entry records where the local mirror lives
# so check() can report truthfully instead of assuming.
#
# Override the mirror root with NOVA_LINKED_SOURCES when the clone lives
# somewhere else (for example on Termux/Android).
LINKED_ROOT = Path(os.environ.get("NOVA_LINKED_SOURCES", Path.home() / ".arena"))

LINKED_SOURCES = {
    "rea": {
        "url": "https://github.com/morluto/rea.git",
        "path": LINKED_ROOT / "rea",
        "upstream": "morluto/rea",
        "package": "rea-agents",
        "purpose": (
            "Reverse engineering CLI + MCP server: binaries, applications, "
            "and runtime behaviour."
        ),
        # Reference-only by design. REA is a reverse-engineering toolkit
        # (decompiler, Ghidra/IDA/Hopper bridges, runtime tracing). It stays
        # out of NovaToolRegistry until it passes the security and
        # compatibility review described in GITHUB_SOURCES.md.
        "access": "reference-only",
        "runtime": "node",
    },
}


def check():
    status = {
        name: path.exists()
        for name, path in SOURCES.items()
    }
    status.update(
        {
            f"linked:{name}": meta["path"].exists()
            for name, meta in LINKED_SOURCES.items()
        }
    )
    return status


def linked_source(name):
    """Return the manifest entry for a linked source, or None."""
    return LINKED_SOURCES.get(name)


if __name__ == "__main__":
    for name, ok in check().items():
        print(f"{name}: {'OK' if ok else 'MISSING'}")
