# -*- coding: utf-8 -*-
"""Minifies live/entry.src.html into live/vercel-entry.html (what gets deployed)."""
import re, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "live", "entry.src.html"), encoding="utf-8").read()
out = re.sub(r'<!--(?!\[if).*?-->', '', src, flags=re.S)
out = re.sub(r'>\s+<', '><', out)
out = re.sub(r'\n\s*', ' ', out).strip()
path = os.path.join(ROOT, "live", "vercel-entry.html")
open(path, "w", encoding="utf-8").write(out)
print("entry:", len(src), "->", len(out), "bytes")
