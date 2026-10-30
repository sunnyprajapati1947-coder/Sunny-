"""
hindi_g2p.py — Devanagari + Hinglish grapheme-to-phoneme front end.

Converts a mixed Hindi/Hinglish line written in Devanagari into a flat phone
sequence with syllable, stress and word-timing metadata that the formant
synthesiser in voice.py consumes.

Phone inventory (ASCII, ARPAbet-flavoured with Hindi extensions):
  vowels : a (आ) A (अ/ə) i (इ) I (ई) u (उ) U (ऊ) e (ए) E (ऐ) o (ओ) O (औ) rI (ऋ)
  nasals : m n N (ङ/ण/न velar) J (ञ) q (anunasik murmur)
  stops  : k kh g gh | c ch j jh | T Th D Dh | t th d dh | p ph b bh
  flaps  : R (ड़) Rh (ढ़)
  frics   : s S (ष/श) h | f z x (ख़) G (ग़) qf (क़)
  approx  : l r (तालव्य र/tap) v y
  affr    : C (च) Ch (छ) J (ज) Jh (झ)
"""
import re
import unicodedata

# ---------------------------------------------------------------- inventory --

DEV_VOWELS = {
    'अ': 'A', 'आ': 'a', 'इ': 'i', 'ई': 'I', 'उ': 'u', 'ऊ': 'U', 'ऋ': 'rI',
    'ए': 'e', 'ऐ': 'E', 'ओ': 'o', 'औ': 'O', 'ऍ': 'E', 'ऑ': 'O',
}
DEV_MATRAS = {
    'ा': 'a', 'ि': 'i', 'ी': 'I', 'ु': 'u', 'ू': 'U', 'ृ': 'rI',
    'े': 'e', 'ै': 'E', 'ो': 'o', 'ौ': 'O', 'ॅ': 'E', 'ॉ': 'O',
}
DEV_CONS = {
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'N',
    'च': 'C', 'छ': 'Ch', 'ज': 'J', 'झ': 'Jh', 'ञ': 'J',
    'ट': 'T', 'ठ': 'Th', 'ड': 'D', 'ढ': 'Dh', 'ण': 'n',
    'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
    'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'S', 'ष': 'S',
    'स': 's', 'ह': 'h', 'ळ': 'l',
    # nukta forms (pre-composed)
    'क़': 'qf', 'ख़': 'x', 'ग़': 'G', 'ज़': 'z', 'ड़': 'R', 'ढ़': 'Rh', 'फ़': 'f', 'य़': 'y',
}
NUKTA_COMBOS = {('क', '़'): 'qf', ('ख', '़'): 'x', ('ग', '़'): 'G', ('ज', '़'): 'z',
                ('ड', '़'): 'R', ('ढ', '़'): 'Rh', ('फ', '़'): 'f', ('य', '़'): 'y'}
HALANT = '्'
ANUSVARA = 'ं'
CANDRABINDU = 'ँ'
VISARGA = 'ः'
NUKTA = '़'

# Word-level pronunciation overrides: Devanagari spelling -> phone string.
# Used for Hinglish loan words and for places where the schwa rules misfire.
OVERRIDES = {
    'है': 'h E', 'हैं': 'h E q', 'और': 'O r', 'हुआ': 'h u a', 'हुई': 'h u I',
    'हुए': 'h u e', 'कहा': 'k A h a', 'रहा': 'r A h a', 'रही': 'r A h i',
    'रहे': 'r A h e', 'हो': 'h o', 'होता': 'h o t a', 'होती': 'h o t i',
    'करना': 'k A r n a', 'करनी': 'k A r n i', 'करते': 'k A r t e',
    'करता': 'k A r t a', 'करती': 'k A r t i', 'किया': 'k i y a',
    'किए': 'k i y e', 'करके': 'k A r k e', 'कर': 'k A r',
    'पॉडकास्ट': 'p O D k a s T', 'पॉडकास्टिंग': 'p O D k a s T i ng',
    'इंटरव्यू': 'i n T A r v y u', 'बिज़नेस': 'b i z n e s',
    'फ्रेंड': 'f r e n D', 'फ्रेंड्स': 'f r e n D s',
    'स्टूडियो': 's T u D i y o', 'कैमरा': 'k E m A r a',
    'माइक': 'm a i k', 'ऑडियंस': 'O D i y A n s',
    'प्रॉब्लम': 'p r O b l A m', 'प्रॉब्लम्स': 'p r O b l A m s',
    'सब्सक्राइब': 's A b s k r a i b',
    'इंस्टाग्राम': 'i n s T a g r a m', 'वॉट्सऐप': 'v O T s E p',
    'यूट्यूब': 'y u T y u b', 'लाइफ': 'l a i f', 'टाइम': 'T a i m',
    'नाइस': 'n a i s', 'ओके': 'o k e', 'सॉरी': 's O r i',
    'थैंक्यू': 'th E ng k y u', 'वेलकम': 'v e l k A m',
    'गाइज़': 'g a i z', 'प्लीज़': 'p l i z', 'एक्सक्यूज़': 'e k s k y u z',
    'मीटिंग': 'm i T i ng', 'टीम': 'T i m', 'बॉस': 'b O s',
    'जॉब': 'J O b', 'सैलरी': 's E l A r i', 'इंटरव्यू': 'i n T A r v y u',
    'रिज़्यूमे': 'r i z y u m e', 'एचआर': 'e C a r',
    'ओवरटाइम': 'o v A r T a i m', 'वर्क': 'v A r k',
    'फोन': 'f o n', 'फोटो': 'f o T o', 'वीडियो': 'v i D i y o',
    'मेम': 'm e m', 'जोक': 'J o k', 'कॉमेडी': 'k O m e D i',
    'ड्रामा': 'D r a m a', 'एडिट': 'e D i T', 'एपिसोड': 'e p i s o D',
    'लाइव': 'l a i v', 'ट्रेंडिंग': 'T r e n D i ng',
    'रिश्ता': 'r i S t a', 'रिश्ते': 'r i S t e',
    'शादी': 'S a d i', 'ब्याह': 'b y a h',
    'मम्मी': 'm A m m i', 'पापा': 'p a p a', 'डैडी': 'D E D i',
    'थोड़ा': 'th o R a', 'थोड़ी': 'th o R i', 'बड़ा': 'b A R a',
    'बड़ी': 'b A R i', 'पड़ा': 'p A R a', 'होड़': 'h o R',
    'क्या': 'k y a', 'क्यों': 'k y o q', 'क्योंकि': 'k y o q k i',
    'क्यू': 'k y u', 'दोनों': 'd o n o q', 'दोनो': 'd o n o',
    'बहुत': 'b A h u t', 'सकता': 's A k t a', 'सकती': 's A k t i',
    'चाहिए': 'C a h i y e', 'चाहिये': 'C a h i y e',
    'मिलिए': 'm i l i y e', 'करिए': 'k A r i y e',
    'बोलिए': 'b o l i y e', 'दीजिए': 'd i J i y e',
    'अच्छा': 'A Ch a', 'अच्छी': 'A Ch i', 'अच्छे': 'A Ch e',
    'समझ': 's A m A Jh', 'समझा': 's A m Jh a', 'समझी': 's A m Jh i',
    'ज़िंदगी': 'z i n d A g i', 'दोस्त': 'd o s t', 'दोस्तों': 'd o s t o q',
    'सेटअप': 's e T A p', 'यार': 'y a r', 'यारों': 'y a r o q', 'भाई': 'b h a i', 'भाईयों': 'b h a i y o q',
    'साला': 's a l a', 'साले': 's a l e', 'कमीना': 'k A m i n a',
    'कमीने': 'k A m i n e', 'हरामी': 'h A r a m i', 'हरामखोर': 'h A r a m kh o r',
    'बकवास': 'b A k v a s', 'फालतू': 'ph a l t u', 'बेवकूफ': 'b e v A k u ph',
    'बेवकूफ़': 'b e v A k u f', 'पागल': 'p a g A l', 'नटखट': 'n A T kh A T',
    'ज़बरदस्त': 'z A b A r d A s t', 'शानदार': 'S a n d a r',
    'गजब': 'g A J A b', 'कमाल': 'k A m a l', 'धमाका': 'dh A m a k a',
    'बिल्कुल': 'b i l k u l', 'एकदम': 'e k d A m', 'सही': 's A h i',
    'गलत': 'g A l A t', 'सच': 's A C', 'सच्च': 's A C',
    'झूठ': 'Jh u Th', 'सच्चाई': 's A C a i',
    'तो': 't o', 'भी': 'b h i', 'ही': 'h i', 'ना': 'n a', 'नहीं': 'n A h i q',
    'नही': 'n A h i', 'हाँ': 'h a q', 'हां': 'h a q', 'अरे': 'A r e',
    'अर': 'A r', 'ओय': 'o y', 'ये': 'y e', 'यह': 'y A h', 'वो': 'v o',
    'वह': 'v A h', 'येह': 'y e', 'इस': 'i s', 'उस': 'u s', 'इन': 'i n',
    'उन': 'u n', 'मैं': 'm E q', 'मैंने': 'm E q n e', 'तू': 't u',
    'तुम': 't u m', 'तुमने': 't u m n e', 'मेरा': 'm e r a',
    'मेरी': 'm e r i', 'मेरे': 'm e r e', 'तेरा': 't e r a',
    'तेरी': 't e r i', 'तेरे': 't e r e', 'हमारा': 'h A m a r a',
    'हमारी': 'h A m a r i', 'आपका': 'a p k a', 'आपकी': 'a p k i',
    'उसका': 'u s k a', 'इसका': 'i s k a',
    'कुछ': 'k u Ch', 'कुछनहीं': 'k u Ch n A h i q',
    'बात': 'b a t', 'बातें': 'b a t e q', 'बातों': 'b a t o q',
    'काम': 'k a m', 'कामों': 'k a m o q', 'दिन': 'd i n', 'रात': 'r a t',
    'घर': 'gh A r', 'घरवाले': 'gh A r v a l e', 'माँ': 'm a q',
    'मां': 'm a q', 'पापा': 'p a p a', 'दादी': 'd a d i',
    'शर्मा': 'S A r m a', 'गुप्ता': 'g u p t a', 'वर्मा': 'v A r m a',
    'चाय': 'C a y', 'समोसा': 's A m o s a', 'समोसे': 's A m o s e',
    'पकोड़े': 'p A k o R e', 'मैगी': 'm E g i', 'बिरयानी': 'b i r y a n i',
    'ऑटो': 'O T o', 'रिक्शा': 'r i k S a', 'ट्रैफिक': 'T r E f i k',
    'सिग्नल': 's i g n A l', 'मीटर': 'm i T A r',
    'पैसा': 'p E s a', 'पैसे': 'p E s e', 'दो': 'd o',
}

# words that should always lose their inherent final schwa
_COMMON_FINAL_SCHWA_KEEP = {'क्या', 'है', 'नहीं', 'हैं', 'हाँ', 'हूँ', 'हूं'}


def _normalise(text: str) -> str:
    text = unicodedata.normalize('NFC', text)
    # strip ZWNJ/ZWJ artefacts, danda, punctuation handled by caller
    return text.replace('\u200c', '').replace('\u200d', '')


# --------------------------------------------------------------- converter --

def _decompose_word(word: str):
    """Split a Devanagari word into (consonant_cluster, vowel/final) tokens."""
    chars = list(word)
    i = 0
    units = []          # list of dicts: base phone, matra, halant, nasal, visarga
    while i < len(chars):
        ch = chars[i]
        # nukta combining
        if i + 1 < len(chars) and chars[i + 1] == NUKTA and (ch, NUKTA) in NUKTA_COMBOS:
            ph = NUKTA_COMBOS[(ch, NUKTA)]
            units.append({'phone': ph, 'kind': 'C'})
            i += 2
            continue
        if ch in DEV_CONS:
            units.append({'phone': DEV_CONS[ch], 'kind': 'C'})
            i += 1
            continue
        if ch in DEV_VOWELS:
            units.append({'phone': DEV_VOWELS[ch], 'kind': 'V'})
            i += 1
            continue
        if ch in DEV_MATRAS:
            units.append({'phone': DEV_MATRAS[ch], 'kind': 'M'})
            i += 1
            continue
        if ch == HALANT:
            units.append({'phone': '', 'kind': 'H'})
            i += 1
            continue
        if ch in (ANUSVARA, CANDRABINDU):
            units.append({'phone': 'q', 'kind': 'N'})     # nasalisation
            i += 1
            continue
        if ch == VISARGA:
            units.append({'phone': 'h', 'kind': 'X'})
            i += 1
            continue
        i += 1
    return units


def word_to_phones(word: str):
    """Return list of phones for one Devanagari word (no spaces)."""
    if word in OVERRIDES:
        return OVERRIDES[word].split()
    units = _decompose_word(word)
    if not units:
        return []
    phones = []
    i = 0
    n = len(units)
    while i < n:
        u = units[i]
        if u['kind'] == 'C':
            phones.append(('C', u['phone']))
            # look ahead for matra / halant / nasal
            j = i + 1
            if j < n and units[j]['kind'] == 'M':
                phones.append(('V', units[j]['phone']))
                i = j + 1
            elif j < n and units[j]['kind'] == 'H':
                i = j + 1          # consonant cluster continues, no vowel
            else:
                phones.append(('V', 'A'))   # inherent schwa
                i = j
            continue
        elif u['kind'] == 'V':
            phones.append(('V', u['phone']))
            i += 1
        elif u['kind'] == 'M':
            phones.append(('V', u['phone']))
            i += 1
        elif u['kind'] == 'N':
            if phones:
                phones.append(('NAS', 'q'))
            i += 1
        elif u['kind'] == 'X':
            phones.append(('H', 'h'))
            i += 1
        elif u['kind'] == 'H':
            i += 1
        else:
            i += 1
    # ---- schwa deletion ---------------------------------------------------
    out = [p for p in phones]
    # drop word-final inherent schwa (Hindi rule) unless single-syllable word
    n_v = sum(1 for k, _ in out if k == 'V')
    if out and n_v > 1:
        # find last vowel
        for k in range(len(out) - 1, -1, -1):
            if out[k][0] == 'V':
                if out[k][1] == 'A' and word not in _COMMON_FINAL_SCHWA_KEEP:
                    del out[k]
                break
    # medial schwa deletion: C ə C V  ->  C C V   (e.g. क र न ा -> karnaa)
    res = []
    for idx, p in enumerate(out):
        first_vowel = next((i for i, q in enumerate(out) if q[0] == 'V'), -1)
        if p[0] == 'V' and p[1] == 'A' and 0 < idx < len(out) - 2 and idx != first_vowel:
            prev_c = out[idx - 1][0] == 'C'
            nxt_c = out[idx + 1][0] == 'C'
            after_v = idx + 2 < len(out) and out[idx + 2][0] == 'V'
            # never delete the schwa that carries the word's only stress anchor
            if prev_c and nxt_c and after_v and word not in _COMMON_FINAL_SCHWA_KEEP:
                # keep if the following vowel is schwa too (avoids over-reduction)
                if not (out[idx + 2][1] == 'A'):
                    continue
        res.append(p)
    # collapse adjacent identical vowels produced by inherent schwa + independent vowel
    fin = []
    for ph in [x for _, x in res]:
        if fin and len(fin[-1]) == 1 and len(ph) == 1 and fin[-1] == ph and ph == 'A':
            continue
        fin.append(ph)
    return fin


WORD_RE = re.compile(r'[^\s\u0900-\u097F]+')


def text_to_phones(text: str):
    """Return (phones, word_spans) for a full line.

    word_spans: list of dicts {word, start_idx, end_idx} in phone-index space.
    """
    text = _normalise(text)
    phones = []
    spans = []
    for raw in text.split():
        tok = re.sub(r'[^\u0900-\u097F]', '', raw)
        punct = ''.join(c for c in raw if not ('\u0900' <= c <= '\u097F'))
        if not tok:
            # punctuation-only token: attach to previous span as boundary info
            if spans:
                spans[-1]['punct'] += punct
            continue
        start = len(phones)
        phones.extend(word_to_phones(tok))
        spans.append({'word': tok, 'punct': punct, 'start': start, 'end': len(phones)})
    return phones, spans


if __name__ == '__main__':
    tests = [
        'यार, ये पॉडकास्ट का सेटअप देख के लग रहा है कि हम दोनों ने करियर गलत चुन लिया।',
        'नहीं, मेरा तो बहुत अच्छा चल रहा है, तू अपनी बात कर।',
        'शर्मा जी का बेटा अमेरिका में है, और मैं यहाँ चाय पी रहा हूँ।',
    ]
    for t in tests:
        ph, sp = text_to_phones(t)
        print(t)
        print('  ', ' '.join(ph))
        print('  ', [(s['word'], s['start'], s['end']) for s in sp])
