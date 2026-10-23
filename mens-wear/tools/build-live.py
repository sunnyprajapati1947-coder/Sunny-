# -*- coding: utf-8 -*-
"""Rebuild the CDN-served copy of the page (live/index.html) for a given tag."""
import re, sys, os
TAG = sys.argv[1] if len(sys.argv) > 1 else "live-v6"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cdn.jsdelivr.net/gh/sunnyprajapati1947-coder/Sunny-@%s/mens-wear/" % TAG
LIVE = "https://nawada-menswear-shop.vercel.app/"

s = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
s = re.sub(r'href="assets/css/([^"]+)"', lambda m: 'href="%sassets/css/%s"' % (BASE, m.group(1)), s)
s = re.sub(r'src="assets/js/([^"]+)"', lambda m: 'src="%sassets/js/%s"' % (BASE, m.group(1)), s)
s = re.sub(r'src="assets/img/([^"]+)"', lambda m: 'src="%sassets/img/%s"' % (BASE, m.group(1)), s)
s = s.replace('"image": "assets/img/store-interior.jpg"', '"image": "%sassets/img/store-interior.jpg"' % BASE)
s = re.sub(r'https://raw\.githubusercontent\.com/[^"]+/hero-model\.jpg', BASE + 'assets/img/hero-model.jpg', s)
s = re.sub(r'(<link rel="canonical" href=")[^"]*(")', r'\g<1>' + LIVE + r'\g<2>', s)

left = re.findall(r'"(assets/[^"]+)"', s)
assert not left, "relative asset left: %s" % left[:3]
out = os.path.join(ROOT, "live", "index.html")
open(out, "w", encoding="utf-8").write(s)
print("live/index.html ->", TAG, "|", len(s), "bytes | js:", len(re.findall(r'assets/js/', s)), "| imgs:", len(set(re.findall(r'assets/img/[^"]+', s))))
