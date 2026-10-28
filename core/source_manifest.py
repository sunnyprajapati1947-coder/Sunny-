from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "hakim": ROOT / "github" / "local-ai-agent",
    "mimir": ROOT / "github" / "mimir",
    "android_agent": ROOT / "github" / "local-AI-Agent",
    "termux_assistant": ROOT / "github" / "termux-assistant",
    "llama_agent": ROOT / "github" / "llama-agent",
    "nova_voice": ROOT / "github" / "nova-ai-assistant",
    "omnivoice": ROOT / "github" / "OmniVoice",
    "duix_avatar": ROOT / "github" / "Duix-Avatar",
    "openmontage": ROOT / "github" / "OpenMontage",
    "freevideo": ROOT / "github" / "FreeVideo",
}

def check():
    return {
        name: path.exists()
        for name, path in SOURCES.items()
    }

if __name__ == "__main__":
    for name, ok in check().items():
        print(f"{name}: {'OK' if ok else 'MISSING'}")
