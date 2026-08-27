"""SunnyAI Google AI model registry.

API keys are never stored here. Model IDs are centralized so the router can
select a suitable Google model for each capability.
"""

TEXT_MODELS = {
    "brain": "gemini-3.7-flash",
    "coding": "gemini-3.7-flash",
    "agent": "gemini-3.7-flash",
    "fast": "gemini-3.6-flash",
    "standard": "gemini-3.5-flash",
    "lite": "gemini-3.5-flash-lite",
    "reasoning": "gemini-3.1-pro-preview",
    "flash_lite": "gemini-3.1-flash-lite",
}

IMAGE_MODELS = {
    "image": "gemini-3.1-flash-image",
    "image_lite": "gemini-3.1-flash-lite-image",
    "image_pro": "gemini-3-pro-image",
}

VIDEO_MODELS = {
    "video": "veo-3.1-generate-preview",
    "video_fast": "veo-3.1-fast-generate-preview",
}

AUDIO_MODELS = {
    "live": "gemini-3.1-flash-live-preview",
    "tts": "gemini-3.1-flash-tts-preview",
    "transcribe": "gemini-3.5-transcribe",
    "transcribe_live": "gemini-3.5-transcribe-live",
    "live_translate": "gemini-3.5-live-translate-preview",
}

SPECIAL_MODELS = {
    "embedding": "gemini-embedding-2-preview",
    "embedding_text": "gemini-embedding-001",
    "computer_use": "gemini-2.5-computer-use-preview-10-2025",
    "deep_research": "deep-research-preview-04-2026",
    "deep_research_max": "deep-research-max-preview-04-2026",
    "antigravity": "antigravity-preview-05-2026",
    "omni": "gemini-omni-flash",
}

MUSIC_MODELS = {
    "music_pro": "lyria-3-pro-preview",
    "music_clip": "lyria-3-clip-preview",
}


def all_models():
    result = {}
    for group in (
        TEXT_MODELS,
        IMAGE_MODELS,
        VIDEO_MODELS,
        AUDIO_MODELS,
        SPECIAL_MODELS,
        MUSIC_MODELS,
    ):
        result.update(group)
    return result


def model_for(task):
    task = str(task).lower().strip()
    aliases = {
        "chat": "brain",
        "general": "brain",
        "research": "deep_research",
        "deep research": "deep_research",
        "deep_research": "deep_research",
        "code": "coding",
        "coding": "coding",
        "programming": "coding",
        "web": "coding",
        "website": "coding",
        "app": "coding",
        "android": "coding",
        "image": "image",
        "photo": "image",
        "video": "video",
        "veo": "video",
        "voice": "live",
        "tts": "tts",
        "speech": "tts",
        "stt": "transcribe",
        "transcribe": "transcribe",
        "memory": "embedding",
        "rag": "embedding",
        "computer": "computer_use",
        "computer_use": "computer_use",
        "music": "music_pro",
    }
    key = aliases.get(task, task)
    return all_models().get(key, TEXT_MODELS["brain"])
