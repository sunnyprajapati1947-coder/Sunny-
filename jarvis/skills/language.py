"""Translation and multilingual help (Jarvis 1.0 · episode 35).

Three layers, best first: the phrasebook (instant, offline, with
pronunciation), the free MyMemory endpoint, then the neural brain when a
Gemini key or local Qwen lane is available.
"""
from __future__ import annotations

import re
from urllib.parse import quote_plus

from jarvis import net
from jarvis.util import reply, truncate

LANGUAGES = {
    "hindi": ("hi", "Hindi", "hi-IN"),
    "english": ("en", "English", "en-IN"),
    "bengali": ("bn", "Bengali", "bn-IN"),
    "marathi": ("mr", "Marathi", "mr-IN"),
    "tamil": ("ta", "Tamil", "ta-IN"),
    "telugu": ("te", "Telugu", "te-IN"),
    "gujarati": ("gu", "Gujarati", "gu-IN"),
    "kannada": ("kn", "Kannada", "kn-IN"),
    "malayalam": ("ml", "Malayalam", "ml-IN"),
    "punjabi": ("pa", "Punjabi", "pa-IN"),
    "urdu": ("ur", "Urdu", "ur-IN"),
    "spanish": ("es", "Spanish", "es-ES"),
    "french": ("fr", "French", "fr-FR"),
    "german": ("de", "German", "de-DE"),
    "italian": ("it", "Italian", "it-IT"),
    "portuguese": ("pt", "Portuguese", "pt-PT"),
    "russian": ("ru", "Russian", "ru-RU"),
    "arabic": ("ar", "Arabic", "ar-SA"),
    "japanese": ("ja", "Japanese", "ja-JP"),
    "korean": ("ko", "Korean", "ko-KR"),
    "chinese": ("zh", "Chinese", "zh-CN"),
    "hinglish": ("hi", "Hinglish", "hi-IN"),
}
ALIASES = {
    "hindi": "hindi",
    "हिंदी": "hindi",
    "हिन्दी": "hindi",
    "english": "english",
    "inglish": "english",
    "bangla": "bengali",
    "bengali": "bengali",
    "tamil": "tamil",
    "french": "french",
    "spanish": "spanish",
    "german": "german",
    "japanese": "japanese",
    "korean": "korean",
    "chinese": "chinese",
    "mandarin": "chinese",
    "arabic": "arabic",
    "russian": "russian",
    "portuguese": "portuguese",
    "italian": "italian",
    "urdu": "urdu",
    "marathi": "marathi",
    "telugu": "telugu",
    "gujarati": "gujarati",
    "kannada": "kannada",
    "malayalam": "malayalam",
    "punjabi": "punjabi",
}

# (lowercased English phrase, language) -> (translation, pronunciation hint)
PHRASEBOOK: dict[tuple[str, str], tuple[str, str]] = {
    ("hello", "hindi"): ("नमस्ते", "namaste"),
    ("hi", "hindi"): ("नमस्ते", "namaste"),
    ("thank you", "hindi"): ("धन्यवाद", "dhanyavaad"),
    ("thanks", "hindi"): ("धन्यवाद", "dhanyavaad"),
    ("good morning", "hindi"): ("सुप्रभात", "suprabhat"),
    ("good night", "hindi"): ("शुभ रात्रि", "shubh ratri"),
    ("how are you", "hindi"): ("आप कैसे हैं?", "aap kaise hain"),
    ("i am fine", "hindi"): ("मैं ठीक हूँ", "main theek hoon"),
    ("what is your name", "hindi"): ("आपका नाम क्या है?", "aapka naam kya hai"),
    ("my name is", "hindi"): ("मेरा नाम है", "mera naam hai"),
    ("see you later", "hindi"): ("फिर मिलेंगे", "phir milenge"),
    ("please", "hindi"): ("कृपया", "kripya"),
    ("sorry", "hindi"): ("क्षमा करें", "kshama karen"),
    ("yes", "hindi"): ("हाँ", "haan"),
    ("no", "hindi"): ("नहीं", "nahin"),
    ("good morning", "english"): ("Good morning", ""),
    ("namaste", "english"): ("Hello / greetings", ""),
    ("dhanyavaad", "english"): ("Thank you", ""),
    ("shukriya", "english"): ("Thank you", ""),
    ("hello", "english"): ("Hello", ""),
    ("thank you", " spanish".strip()): ("Thank you", ""),
    ("hello", "spanish"): ("Hola", "OH-lah"),
    ("thank you", "spanish"): ("Gracias", "GRAH-see-as"),
    ("good morning", "spanish"): ("Buenos días", "BWEH-nos DEE-as"),
    ("good night", "spanish"): ("Buenas noches", "BWEH-nas NO-ches"),
    ("how are you", "spanish"): ("¿Cómo estás?", "KOH-mo es-TAS"),
    ("please", "spanish"): ("Por favor", ""),
    ("sorry", "spanish"): ("Lo siento", ""),
    ("hello", "french"): ("Bonjour", "bon-ZHOOR"),
    ("thank you", "french"): ("Merci", "mair-SEE"),
    ("good night", "french"): ("Bonne nuit", "bon NWEE"),
    ("how are you", "french"): ("Comment ça va ?", "ko-mon sa va"),
    ("please", "french"): ("S'il vous plaît", ""),
    ("sorry", "french"): ("Désolé", ""),
    ("hello", "german"): ("Hallo", ""),
    ("thank you", "german"): ("Danke", "DAN-keh"),
    ("good morning", "german"): ("Guten Morgen", ""),
    ("good night", "german"): ("Gute Nacht", ""),
    ("hello", "japanese"): ("こんにちは", "konnichiwa"),
    ("thank you", "japanese"): ("ありがとう", "arigatou"),
    ("good morning", "japanese"): ("おはようございます", "ohayou gozaimasu"),
    ("hello", "korean"): ("안녕하세요", "annyeonghaseyo"),
    ("thank you", "korean"): ("감사합니다", "gamsahamnida"),
    ("hello", "chinese"): ("你好", "nǐ hǎo"),
    ("thank you", "chinese"): ("谢谢", "xièxie"),
    ("hello", "arabic"): ("مرحبا", "marhaban"),
    ("thank you", "arabic"): ("شكرا", "shukran"),
}

MYMEMORY = "https://api.mymemory.translated.net/get?q={text}&langpair={source}|{target}"


def normalise_language(name: str) -> tuple[str, str, str] | None:
    key = str(name or "").strip().lower().strip(".")
    key = ALIASES.get(key, key)
    return LANGUAGES.get(key)


def _lookup(text: str, target_key: str) -> tuple[str, str] | None:
    phrase = re.sub(r"[^\w\s']", "", text.lower()).strip()
    return PHRASEBOOK.get((phrase, target_key))


def _online(text: str, source: str, target: str) -> str:
    url = MYMEMORY.format(text=quote_plus(text[:400]), source=source, target=target)
    try:
        data = net.get_json(url, timeout=6.0)
    except Exception:
        return ""
    payload = data.get("responseData") if isinstance(data, dict) else None
    if not isinstance(payload, dict):
        return ""
    translated = str(payload.get("translatedText") or "").strip()
    if not translated:
        return ""
    lowered = translated.lower()
    if "mymemory warning" in lowered or "query length limit" in lowered:
        return ""
    if lowered == text.strip().lower() and source != target:
        return ""
    return translated


def _neural(text: str, label: str) -> tuple[str, str]:
    try:
        from jarvis.brain import get_brain

        brain = get_brain()
        if not (brain.gemini_available() or brain.qwen_available()):
            return "", ""
        result, provider = brain.complete(
            "You are a precise translator. Return only the translated text, "
            "no quotes, no notes, no transliteration.",
            f"Translate this into {label}: {text}",
            timeout=12.0,
        )
    except Exception:
        return "", ""
    return (str(result).strip(), provider) if result else ("", "")


def translate_text(text: str = "", target: str = "hindi", source: str = "auto") -> dict:
    original = str(text or "").strip()
    target_meta = normalise_language(target)
    if not original:
        return reply(
            "What should I translate, Sir? Try “translate good morning to Hindi”.",
            speech="What should I translate, Sir?",
        )
    if not target_meta:
        return reply(
            f"I do not have “{target}” in my language table yet, Sir. "
            "I can handle Hindi, English, Bengali, Tamil, Telugu, Marathi, Spanish, French, "
            "German, Japanese, Korean, Chinese, Arabic, Russian, Portuguese and more.",
            speech="I do not have that language yet, Sir.",
        )
    target_code, label, locale = target_meta

    source_meta = normalise_language(source) if source and source != "auto" else None
    if source_meta is None:
        source_meta = normalise_language("hindi") if re.search(r"[\u0900-\u097F]", original) else normalise_language("english")
    source_code, source_label, _ = source_meta
    if source_code == target_code:
        return reply(
            f"That is already {label}, Sir: “{original}”.",
            speech=f"That is already {label}, Sir.",
            data={"skipped": True},
        )

    phrase = _lookup(original, target)
    if phrase:
        translated, say_as = phrase
        spoken = f"“{original}” in {label} is {translated}."
        if say_as:
            spoken += f" Say it as {say_as}."
        return reply(
            f"**{translated}**" + (f"  ·  *{say_as}*" if say_as else ""),
            speech=spoken,
            cards=[
                {
                    "type": "text",
                    "title": f"TRANSLATION · {label.upper()}",
                    "body": f"{original}\n→ {translated}" + (f"\n({say_as})" if say_as else ""),
                }
            ],
            data={
                "text": original,
                "translation": translated,
                "pronunciation": say_as,
                "target": label,
                "source": "phrasebook",
            },
        )

    translated = _online(original, source_code, target_code)
    provider = "mymemory"
    if not translated:
        translated, provider = _neural(original, label)
    if not translated:
        return reply(
            f"I cannot reach a translation service for {label} right now, Sir, and "
            f"“{original}” is not in my offline phrasebook. Add a Gemini key for offline-quality "
            "translation, or try a common phrase like “thank you”.",
            speech=f"I cannot translate that offline, Sir.",
            cards=[
                {
                    "type": "link",
                    "title": f"Translate “{truncate(original, 40)}” on Google",
                    "subtitle": "opens in your browser",
                    "url": "https://translate.google.com/?sl=auto&tl="
                    + target_code
                    + "&text="
                    + quote_plus(original),
                }
            ],
            data={"offline": True, "target": label},
        )

    return reply(
        f"{original} → **{translated}** ({label})",
        speech=f"In {label}, that is {translated}.",
        cards=[
            {
                "type": "text",
                "title": f"TRANSLATION · {label.upper()}",
                "body": f"{source_label}: {original}\n{label}: {translated}",
            }
        ],
        data={
            "text": original,
            "translation": translated,
            "target": label,
            "locale": locale,
            "provider": provider,
        },
    )
