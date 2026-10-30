"""
subs.py — burns-in subtitle / title / lower-third overlay generated as ASS.

libass (through ffmpeg) does the Devanagari shaping, so conjuncts and matras
are correct without needing raqm in Pillow.
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BUILD = os.path.join(ROOT, 'build')
FONT = 'Noto Sans Devanagari'

HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,{font},52,&H00F5F5F5,&H000000FF,&H00101010,&HA0000000,-1,0,0,0,100,100,0,0,1,3.2,1.6,2,150,150,54,1
Style: Name,{font},40,&H004FD8F0,&H000000FF,&H00101010,&H90000000,-1,0,0,0,100,100,0,0,1,2.4,1.2,7,90,90,150,1
Style: Chapter,{font},34,&H00C8C8C8,&H000000FF,&H00101010,&H70000000,0,0,0,0,100,100,0,0,1,2.0,1.0,7,90,90,150,1
Style: Title,{font},150,&H00E9C46A,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1
Style: Sub2,{font},40,&H00D8D8D8,&H000000FF,&H00101010,&H80000000,0,0,0,0,100,100,0,0,1,2.0,1.0,5,0,0,0,1
Style: Card,{font},44,&H00F0F0F0,&H000000FF,&H00101010,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def ts(t):
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h:d}:{m:02d}:{s:05.2f}"


def wrap(text, width=40, max_lines=2):
    words = text.split()
    lines, cur = [], ''
    for w in words:
        cand = (cur + ' ' + w).strip()
        if len(cand) <= width or not cur:
            cur = cand
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    if len(lines) <= max_lines:
        return lines
    # rebalance into max_lines
    total = len(text)
    per = total / max_lines
    out, cur, curlen = [], '', 0
    for w in words:
        if curlen + len(w) + 1 > per and len(out) < max_lines - 1 and cur:
            out.append(cur)
            cur, curlen = w, len(w)
        else:
            cur = (cur + ' ' + w).strip()
            curlen += len(w) + 1
    if cur:
        out.append(cur)
    return out


def split_cues(start, end, text, max_chars=96):
    """Split a long line into sequential cues by character proportion."""
    if len(text) <= max_chars:
        return [(start, end, text)]
    # split on sentence-ish boundaries first
    parts, cur = [], ''
    for ch in text:
        cur += ch
        if len(cur) >= max_chars * 0.65 and ch in '।,.?!— ':
            parts.append(cur.strip())
            cur = ''
    if cur.strip():
        parts.append(cur.strip())
    parts = [p for p in parts if p]
    if not parts:
        return [(start, end, text)]
    total = sum(len(p) for p in parts)
    raw, t = [], start
    for p in parts:
        d = (end - start) * len(p) / total
        raw.append([t, t + d, p])
        t += d
    # merge cues that are too short to read, then re-time
    out = []
    for a, b, p in raw:
        if out and (b - a) < 0.95:
            out[-1][1] = b
            out[-1][2] = (out[-1][2] + ' ' + p).strip()
        else:
            out.append([a, b, p])
    # if merging made a cue too long, split it back with a larger budget
    final = []
    for a, b, p in out:
        if len(p) > 120:
            half = p.rfind(' ', 0, len(p) // 2 + 20)
            if half > 0:
                mid = a + (b - a) * (half / len(p))
                final.append((a, mid, p[:half]))
                final.append((mid, b, p[half:].strip()))
                continue
        final.append((a, b, p))
    return final


def build(timeline_path=None, out_path=None, include_title=True):
    tl = json.load(open(timeline_path or os.path.join(BUILD, 'timeline.json')))
    lines = tl['lines']
    total = tl['total']
    ev = []
    SECTIONS = {
        'hook': 'कॉल्ड ओपन',
        'intro': 'परिचय',
        'talk1': 'शर्मा जी का बेटा',
        'roast': 'स्टार्टअप पिच',
        'surprise': 'जिम और मम्मी का कॉल',
        'punch': 'सबसे बड़ी पंचलाइन',
        'ending': 'आख़िरी बात',
    }
    # ---- title card -------------------------------------------------
    if include_title:
        ev.append(f"Dialogue: 1,{ts(0.35)},{ts(3.15)},Title,,0,0,0,,"
                  f"{{\\fad(340,420)\\fscx88\\fscy88\\t(0,420,\\fscx103\\fscy103)\\blur1}}चाय और बकवास")
        ev.append(f"Dialogue: 1,{ts(1.05)},{ts(3.15)},Sub2,,0,0,0,,"
                  f"{{\\fad(360,400)\\pos(960,700)\\c&H00B0E8F0&}}एपिसोड १४  ·  करियर, और उसूल")
        ev.append(f"Dialogue: 1,{ts(1.45)},{ts(3.15)},Sub2,,0,0,0,,"
                  f"{{\\fad(360,400)\\pos(960,770)\\fs30\\c&H00A0A0A0&}}आरव  और  रोहन  के  साथ")
    # ---- chapter lower thirds --------------------------------------
    seen = set()
    for ln in lines:
        sec = ln['section']
        if sec in seen:
            continue
        seen.add(sec)
        label = SECTIONS.get(sec)
        if not label:
            continue
        t0 = max(0.6, ln['start'] - 0.15)
        ev.append(f"Dialogue: 2,{ts(t0)},{ts(t0 + 2.6)},Chapter,,0,0,0,,"
                  f"{{\\fad(250,380)\\pos(108,150)\\c&H0060C8F0&}}▍ {label}")
    # ---- name tags on first appearance -----------------------------
    names = {'A': 'आरव', 'R': 'रोहन'}
    shown = set()
    for ln in lines:
        sp = ln['sp']
        if sp in shown:
            continue
        shown.add(sp)
        ev.append(f"Dialogue: 2,{ts(max(0.3, ln['start'] - 0.1))},{ts(ln['start'] + 2.4)},Name,,0,0,0,,"
                  f"{{\\fad(220,380)}}{names[sp]}")
    # ---- dialogue subtitles ----------------------------------------
    for ln in lines:
        text = (ln.get('text') or '').strip()
        if not text:
            continue
        for a, b, chunk in split_cues(ln['start'], ln['end'], text):
            ls = wrap(chunk, 40, 2)
            body = '\\N'.join(ls)
            ev.append(f"Dialogue: 3,{ts(a)},{ts(b)},Sub,,0,0,0,,"
                      f"{{\\fad(90,90)}}{body}")
    # ---- end card ---------------------------------------------------
    end_t = max(0.0, total - 2.4)
    ev.append(f"Dialogue: 4,{ts(end_t)},{ts(total)},Card,,0,0,0,,"
              f"{{\\fad(300,300)\\pos(960,540)\\fs46}}चाय और बकवास  ·  एपिसोड १४")
    ass = HEADER.format(font=FONT) + '\n'.join(ev) + '\n'
    out_path = out_path or os.path.join(BUILD, 'subs.ass')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(ass)
    # ---- also export a plain SRT ------------------------------------
    srt_path = out_path.replace('.ass', '.srt')
    with open(srt_path, 'w', encoding='utf-8') as f:
        n = 1
        for ln in lines:
            text = (ln.get('text') or '').strip()
            if not text:
                continue
            for a, b, chunk in split_cues(ln['start'], ln['end'], text):
                def st(x):
                    h = int(x // 3600); m = int((x % 3600) // 60); s = int(x % 60)
                    ms = int((x - int(x)) * 1000)
                    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
                f.write(f"{n}\n{st(a)} --> {st(b)}\n{chunk}\n\n")
                n += 1
    return out_path


if __name__ == '__main__':
    p = build()
    print('wrote', p, 'and', p.replace('.ass', '.srt'))
