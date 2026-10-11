"""Jarvis CBSE Class 10 study coach (Board 2027 target: 75+ in every subject).

Fully offline: rationalized CBSE Class 10 syllabus index + a real MCQ bank +
Hinglish exam tips. Board 2027 ke liye final syllabus CBSE se aayega, isliye
har plan me 'cbseacademic.nic.in se confirm karo' note hai - Jarvis guess
nahi karta.
"""
from __future__ import annotations

import random
import re
from typing import Any

# Subject aliases (Hindi/Hinglish names included).
SUBJECT_ALIASES = {
    "science": "Science",
    "vigyan": "Science",
    "physics": "Science",
    "chemistry": "Science",
    "biology": "Science",
    "maths": "Mathematics",
    "math": "Mathematics",
    "ganit": "Mathematics",
    "mathematics": "Mathematics",
    "sst": "Social Science",
    "social": "Social Science",
    "samajik": "Social Science",
    "history": "Social Science",
    "geography": "Social Science",
    "economics": "Social Science",
    "civics": "Social Science",
    "hindi": "Hindi",
    "english": "English",
}

SYLLABUS: dict[str, dict[str, Any]] = {
    "Science": {
        "books": ["NCERT Science (Physics + Chemistry + Biology)"],
        "chapters": [
            "1. Chemical Reactions and Equations",
            "2. Acids, Bases and Salts",
            "3. Metals and Non-metals",
            "4. Carbon and its Compounds",
            "5. Life Processes",
            "6. Control and Coordination",
            "7. How do Organisms Reproduce?",
            "8. Heredity",
            "9. Light - Reflection and Refraction",
            "10. The Human Eye and the Colourful World",
            "11. Electricity",
            "12. Magnetic Effects of Electric Current",
        ],
        "weightage": "Theory 80 (Physics ~25, Chemistry ~25, Biology ~30) + Practical 20",
        "tips": [
            "Numericals (Electricity, Light) roz solve karo - ye sure marks hain.",
            "Diagram practice karo: human eye, reflex arc, electric circuit, budding in yeast.",
            "NCERT ke 'intext questions' + chapter-end questions board me repeat hote hain.",
            "Chemical equations balanced likhna kabhi mat bhoolna.",
        ],
    },
    "Mathematics": {
        "books": ["NCERT Mathematics (Standard ya Basic)"],
        "chapters": [
            "1. Real Numbers",
            "2. Polynomials",
            "3. Pair of Linear Equations in Two Variables",
            "4. Quadratic Equations",
            "5. Arithmetic Progressions",
            "6. Triangles",
            "7. Coordinate Geometry",
            "8. Introduction to Trigonometry",
            "9. Some Applications of Trigonometry",
            "10. Circles",
            "11. Areas Related to Circles",
            "12. Surface Areas and Volumes",
            "13. Statistics",
            "14. Probability",
        ],
        "weightage": "Theory 80 + Internal 20",
        "tips": [
            "Roz 1 paper-style set (13-15 questions) time se solve karo.",
            "Trigonometry ke identities + standard values ratt lo (sin, cos, tan of 0/30/45/60/90).",
            "Geometry me theorem ke statements + NCERT figures yaad karo.",
            "Answer sheet me steps likho - CBSE me step marking hoti hai.",
        ],
    },
    "Social Science": {
        "books": [
            "History: India and the Contemporary World - II",
            "Geography: Contemporary India - II",
            "Civics: Democratic Politics - II",
            "Economics: Understanding Economic Development",
        ],
        "chapters": [
            "History: Nationalism in Europe; Nationalism in India; Making of a Global World; Print Culture",
            "Geography: Resources and Development; Water Resources; Agriculture; Minerals and Energy; Manufacturing; Lifelines of National Economy",
            "Civics: Power Sharing; Federalism; Gender, Religion and Caste; Political Parties; Outcomes of Democracy",
            "Economics: Development; Sectors of Indian Economy; Money and Credit; Globalisation",
        ],
        "weightage": "Theory 80 + Internal 20",
        "tips": [
            "Dates aur names ki chhoti revision sheet banao (Map work ke saath).",
            "Map pointing practice karo - History aur Geography dono me aata hai.",
            "Answers me 'point + example' format rakho, lamba bhashan nahi.",
        ],
    },
    "Hindi": {
        "books": ["Kshitij-2 / Sparsh-2 (Course A/B ke hisaab se)", "Kritika-2 / Sanchayan-2 (supplementary)"],
        "chapters": [
            "Course book ke saare prose + poetry paath (syllabus list se confirm karo)",
            "Vyakaran: sandhi, samas, alankar, ras, muhavare",
            "Lekhan: patra, anuchhed, nibandh, suchna ya vigyapan",
        ],
        "weightage": "Theory 80 + Internal 20",
        "tips": [
            "Har paath ka central idea (kavya) + lekhak ka naam yaad rakho.",
            "Vyakaran ke rules examples ke saath practice karo - ye scoring hai.",
            "Nibandh ka intro-body-conclusion format likho, 120-150 shabd target.",
        ],
    },
    "English": {
        "books": ["First Flight (prose + poetry)", "Footprints without Feet (supplementary)"],
        "chapters": [
            "First Flight: saare prose chapters + poems (syllabus list se confirm karo)",
            "Footprints without Feet: supplementary chapters",
            "Grammar: tenses, reported speech, determiners, gap filling",
            "Writing: formal letters, analytical paragraphs",
        ],
        "weightage": "Theory 80 + Internal 20",
        "tips": [
            "Chapter ke title, author aur theme ek line me yaad karo.",
            "Letter writing ka format exact rakho - format ke marks easy hain.",
            "Reading section roz 1 passage se practice karo.",
        ],
    },
}

# Real MCQ bank (NCERT Class 10 level) for self-testing.
QUIZ_BANK: list[dict[str, Any]] = [
    {"subject": "Science", "q": "Lemon juice ka pH approximately kitna hota hai?", "options": ["2 (acidic)", "7 (neutral)", "10 (basic)", "14 (strong base)"], "answer": "2 (acidic)"},
    {"subject": "Science", "q": "Quicklime ka chemical formula kya hai?", "options": ["CaCO3", "CaO", "Ca(OH)2", "CaSO4"], "answer": "CaO"},
    {"subject": "Science", "q": "Dilute acid + metal reaction me kaunsi gas nikalti hai?", "options": ["Oxygen", "Carbon dioxide", "Hydrogen", "Nitrogen"], "answer": "Hydrogen"},
    {"subject": "Science", "q": "Lens ki power ka SI unit kya hai?", "options": ["Watt", "Dioptre", "Metre", "Lumen"], "answer": "Dioptre"},
    {"subject": "Science", "q": "Ohm's law ke according V kya hota hai?", "options": ["I/R", "I x R", "R/I", "I^2 R"], "answer": "I x R"},
    {"subject": "Science", "q": "Aankh me light ka entry kaun control karta hai?", "options": ["Cornea", "Iris", "Retina", "Optic nerve"], "answer": "Iris"},
    {"subject": "Science", "q": "Mendel ne apne genetics experiment kis plant par kiye?", "options": ["Pea plant", "Maize", "Wheat", "Rice"], "answer": "Pea plant"},
    {"subject": "Science", "q": "Induced current ki direction kaunse rule se pata chalti hai?", "options": ["Fleming's left-hand rule", "Fleming's right-hand rule", "Right-hand thumb rule", "Lenz ka koi rule nahi"], "answer": "Fleming's right-hand rule"},
    {"subject": "Science", "q": "Normal human eye ka least distance of distinct vision?", "options": ["2.5 cm", "25 cm", "2.5 m", "infinity"], "answer": "25 cm"},
    {"subject": "Science", "q": "Iron ka rusting kis tarah ki reaction hai?", "options": ["Reduction", "Oxidation", "Neutralisation", "Displacement"], "answer": "Oxidation"},
    {"subject": "Mathematics", "q": "Euclid's division se 6 aur 20 ka HCF?", "options": ["1", "2", "3", "4"], "answer": "2"},
    {"subject": "Mathematics", "q": "Quadratic 2x^2 - 4x + 1 ka discriminant?", "options": ["0", "4", "8", "16"], "answer": "8"},
    {"subject": "Mathematics", "q": "AP 2, 7, 12, ... ka 10th term?", "options": ["42", "47", "52", "57"], "answer": "47"},
    {"subject": "Mathematics", "q": "Point (3, 4) ka origin se distance?", "options": ["3", "4", "5", "7"], "answer": "5"},
    {"subject": "Mathematics", "q": "sin 30 degree ka value?", "options": ["0", "1/2", "1", "sqrt(3)/2"], "answer": "1/2"},
    {"subject": "Mathematics", "q": "Circle par ek point se kitne tangent ban sakte hain?", "options": ["1", "2", "0", "infinite"], "answer": "1"},
    {"subject": "Mathematics", "q": "Ek die roll karne par prime number aane ki probability?", "options": ["1/6", "1/3", "1/2", "2/3"], "answer": "1/2"},
    {"subject": "Mathematics", "q": "Pehle n natural numbers ka sum?", "options": ["n^2", "n(n+1)/2", "n(n-1)/2", "2n"], "answer": "n(n+1)/2"},
    {"subject": "Social Science", "q": "Jallianwala Bagh hatyaakand kis saal hua?", "options": ["1917", "1919", "1921", "1922"], "answer": "1919"},
    {"subject": "Social Science", "q": "'Hind Swaraj' kisne likhi?", "options": ["Nehru", "Gandhi", "Tilak", "Tagore"], "answer": "Gandhi"},
    {"subject": "Social Science", "q": "IT industry kis sector me aati hai?", "options": ["Primary", "Secondary", "Tertiary", "None"], "answer": "Tertiary"},
    {"subject": "Social Science", "q": "Earth Summit (Rio de Janeiro) kis saal hua tha?", "options": ["1987", "1992", "1997", "2002"], "answer": "1992"},
    {"subject": "English", "q": "'A Letter to God' ke lekhak kaun hain?", "options": ["G.L. Fuentes", "Ruskin Bond", "Nelson Mandela", "Leslie Norris"], "answer": "G.L. Fuentes"},
    {"subject": "English", "q": "'The Thief's Story' ke lekhak kaun hain?", "options": ["R.K. Narayan", "Ruskin Bond", "Oscar Wilde", "H.G. Wells"], "answer": "Ruskin Bond"},
]

STUDY_NOTE = (
    "Note: ye rationalized CBSE Class 10 syllabus hai. Board 2027 ka final "
    "syllabus cbseacademic.nic.in se confirm karo - changes ho sakte hain."
)


def _resolve_subject(text: str) -> str:
    text = str(text or "").lower()
    for alias, subject in SUBJECT_ALIASES.items():
        if re.search(rf"\b{re.escape(alias)}\b", text):
            return subject
    return ""


def study_plan(subject: str) -> dict[str, Any]:
    """CBSE Class 10 ka chapter list + weightage + Hinglish tips."""
    name = SUBJECT_ALIASES.get(str(subject or "").strip().lower(), "")
    if not name:
        return {
            "success": False,
            "error": "Subject samajh nahi aaya.",
            "subjects": sorted(set(SUBJECT_ALIASES.values())),
        }
    data = SYLLABUS[name]
    return {
        "success": True,
        "subject": name,
        "books": data["books"],
        "chapters": data["chapters"],
        "weightage": data["weightage"],
        "tips": data["tips"],
        "note": STUDY_NOTE,
    }


def study_quiz(subject: str, count: int = 5) -> dict[str, Any]:
    """Subject ke MCQs self-test ke liye (answers ke saath)."""
    name = SUBJECT_ALIASES.get(str(subject or "").strip().lower(), "")
    if not name:
        return {"success": False, "error": "Subject samajh nahi aaya.",
                "subjects": sorted(set(SUBJECT_ALIASES.values()))}
    pool = [q for q in QUIZ_BANK if q["subject"] == name]
    if not pool:
        return {"success": False, "error": f"{name} ke liye quiz bank me questions nahi hain (abhi Science/Maths/SST/English hain)."}
    count = max(1, min(int(count), 10, len(pool)))
    questions = random.sample(pool, count)
    return {
        "success": True,
        "subject": name,
        "count": count,
        "questions": [
            {"q": q["q"], "options": q["options"], "answer": q["answer"]}
            for q in questions
        ],
    }


def study_tips(subject: str) -> dict[str, Any]:
    """75+ target ke liye subject-wise Hinglish exam strategy."""
    name = SUBJECT_ALIASES.get(str(subject or "").strip().lower(), "")
    if not name:
        return {
            "success": True,
            "general_tips": [
                "Har din 2 subject touch karo (1 theory + 1 numerical).",
                "Har Sunday ek full mock paper (3 hours) do.",
                "Galtiyon ki 'error notebook' banao - exam se pehle wahi revise karo.",
                "NCERT line-by-line board ka base hai - bahar ki book se pehle NCERT pura karo.",
            ],
            "subjects": sorted(set(SUBJECT_ALIASES.values())),
        }
    data = SYLLABUS[name]
    return {"success": True, "subject": name, "tips": data["tips"], "note": STUDY_NOTE}
