"""Query normalisation shared by skill search and memory search.

The skill library is English; the user is not. These helpers turn a
Hinglish/Hindi question into English terms, and can expand an English term
back into Hindi spellings so Hindi memories stay findable.
"""

from __future__ import annotations

import re

# The library is English; Hinglish speakers ask in Hindi/Hinglish. A small,
# explicit map beats pretending unicode FTS understands synonyms.
HINDI_WORDS = {
    "फोन": "phone", "फ़ोन": "phone", "मोबाइल": "phone", "बैटरी": "battery",
    "मेमोरी": "memory", "याद": "memory", "यादें": "memory", "दिमाग": "memory",
    "बैकअप": "backup", "बचा": "backup", "सेव": "save", "सुरक्षित": "save",
    "फाइल": "file", "फ़ाइल": "file", "फोल्डर": "folder", "दस्तावेज": "document",
    "दस्तावेज़": "document", "तस्वीर": "image", "तस्वीरें": "image", "फोटो": "photo",
    "वीडियो": "video", "गाना": "music", "संगीत": "music", "आवाज": "voice",
    "बोल": "speak", "सुन": "listen", "ईमेल": "email", "मेल": "email",
    "संदेश": "message", "नोट": "note", "नोट्स": "notes", "रिपोर्ट": "report",
    "सुरक्षा": "security", "जांच": "check", "जाँच": "check", "जाँचो": "check",
    "डाउनलोड": "download", "अपलोड": "upload", "वेबसाइट": "website",
    "इंटरनेट": "internet", "स्क्रीन": "screen", "स्क्रीनशॉट": "screenshot",
    "कैमरा": "camera", "कैलेंडर": "calendar", "समय": "time", "तारीख": "date",
    "योजना": "plan", "प्लान": "plan", "काम": "task", "कार्य": "task",
    "कोड": "code", "प्रोजेक्ट": "project", "गिट": "git", "डेटा": "data",
    "पीडीएफ": "pdf", "एक्सेल": "excel", "सीएसवी": "csv", "जेसन": "json",
    "सर्च": "search", "खोज": "search", "ढूंढ": "find", "ढूँढ": "find",
    "लिख": "write", "पढ़": "read", "पढ": "read", "हटा": "delete", "मिटा": "delete",
}
STOPWORDS = {
    "ka", "ki", "ke", "ko", "karo", "kar", "karna", "kro", "kardo", "banao", "bana",
    "banado", "do", "de", "dena", "hai", "hain", "ho", "hoga", "me", "mein", "se",
    "par", "aur", "ya", "bhi", "koi", "kuch", "the", "a", "an", "for", "to", "of",
    "in", "on", "with", "and", "or", "is", "it", "my", "mera", "meri", "mujhe",
    "please", "plz", "jarvis", "skill", "skills", "how", "what", "using", "use",
    "mere", "apna", "apni", "chahiye", "bata", "batao", "bataao", "dikhao", "kholo",
    "chalao", "chal", "kr", "kri", "kriya", "wala", "wali", "liye", "karne", "karna",
}


def query_terms(text: str, limit: int = 6) -> list[str]:
    """Normalise a Hinglish/Hindi query into English FTS terms."""
    raw = str(text or "").lower()
    # longest first, so स्क्रीनशॉट wins over स्क्रीन
    for hindi in sorted(HINDI_WORDS, key=len, reverse=True):
        raw = raw.replace(hindi, f" {HINDI_WORDS[hindi]} ")
    raw = re.sub(r"[^\w\s\u0900-\u097F]", " ", raw)
    terms: list[str] = []
    for word in raw.split():
        if len(word) <= 1 or word in STOPWORDS or word in terms:
            continue
        terms.append(word)
    return terms[:limit]


class SkillError(ValueError):
    pass


def hindi_variants(term: str) -> list[str]:
    """Every Hindi spelling that maps to this English term."""
    return [hindi for hindi, english in HINDI_WORDS.items() if english == term]


def match_terms(text: str, expand_hindi: bool = False, limit: int = 6) -> list[str]:
    """FTS terms for a query, optionally with Hindi spellings added."""
    terms = query_terms(text, limit=limit)
    if not expand_hindi:
        return terms
    out = list(terms)
    for term in terms:
        for variant in hindi_variants(term):
            if variant not in out:
                out.append(variant)
    return out[: limit * 3]
