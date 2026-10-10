from pathlib import Path

ROOT = Path.home() / "Nova"
REPO = Path(__file__).resolve().parent.parent
SOURCES = {
    "hakim": ROOT / "github" / "local-ai-agent",
    "mimir": ROOT / "github" / "mimir",
    "android_agent": ROOT / "github" / "local-AI-Agent",
    "termux_assistant": ROOT / "github" / "termux-assistant",
    "llama_agent": ROOT / "github" / "llama-agent",
    "nova_voice": ROOT / "github" / "nova-ai-assistant",
}

# Second import wave: adapted (not vendored) sources. Each entry points at the
# import plan plus the curated data/modules derived from that source.
NEW_SOURCES = {
    "jev_ultrafast": REPO / "github" / "jev_ultrafast",
    "laya": REPO / "github" / "laya",
    "open_jarvis": REPO / "github" / "open_jarvis",
    "build_your_own_x": REPO / "github" / "build_your_own_x",
    "public_apis": REPO / "github" / "public_apis",
    "free_programming_books": REPO / "github" / "free_programming_books",
    "tradingagents": REPO / "github" / "tradingagents",
    "graft": REPO / "github" / "graft",
    "awesome_agent_skills": REPO / "github" / "awesome_agent_skills",
}

def check():
    all_sources = {**SOURCES, **NEW_SOURCES}
    return {
        name: path.exists()
        for name, path in all_sources.items()
    }

if __name__ == "__main__":
    for name, ok in check().items():
        print(f"{name}: {'OK' if ok else 'MISSING'}")
