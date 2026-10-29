#!/usr/bin/env python3
"""
asset_pack.py — fetch CGI background plates ("cg") + a local cartoon font.

Contract for downstream renderers:
    assets/cg/scene_01.jpg ... scene_36.jpg   (>=1568x882, landscape 16:9-ish)
    assets/fonts/<something>.ttf              (Devanagari-capable)

Pexels API + keys are read from config/pexels.json (never hard-coded).
Every image is licence-checked: only pexels.com / pixabay.com / wikimedia URLs
are accepted, and the per-image credit is written to assets/credits.json.
"""
import json, os, sys, hashlib, urllib.request, urllib.parse, base64

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = os.path.join(ROOT, "config", "pexels.json")
OUT_CG = os.path.join(ROOT, "assets", "cg")
OUT_FONT = os.path.join(ROOT, "assets", "fonts")
CREDITS = os.path.join(ROOT, "assets", "credits.json")

OK_HOSTS = ("images.pexels.com", "pexels.com", "cdn.pixabay.com", "pixabay.com",
            "upload.wikimedia.org", "commons.wikimedia.org")

# query -> which scenes use it. Keep queries generic + CGI-friendly.
QUERIES = {
    "village":    "indian village golden hour landscape",
    "boy":        "child boy silhouette sunset field",
    "home":       "village mud house interior lantern",
    "night":      "starry night sky milky way landscape",
    "jungle":     "dark forest night fog trees",
    "glow":       "glowing blue light smoke dark",
    "roof":       "rooftop silhouette night stars",
    "classroom":  "old classroom desks empty sunlight",
    "crowd":      "indian village people crowd",
    "dry":        "cracked dry earth drought",
    "water":      "water splash hand pump celebration",
    "festival":   "india village festival marigold",
    "hills":      "rocky hillside dry landscape india",
    "sunset":     "sunset orange sky clouds silhouette",
}

SCENE_QUERY = {
    1: "village", 2: "village", 3: "home", 4: "night", 5: "jungle", 6: "jungle",
    7: "glow", 8: "glow", 9: "home", 10: "home", 11: "glow", 12: "classroom",
    13: "classroom", 14: "classroom", 15: "festival", 16: "roof", 17: "roof",
    18: "dry", 19: "dry", 20: "hills", 21: "dry", 22: "crowd", 23: "sunset",
    24: "crowd", 25: "crowd", 26: "home", 27: "home", 28: "hills", 29: "hills",
    30: "water", 31: "festival", 32: "sunset", 33: "roof", 34: "classroom",
    35: "roof", 36: "village",
}


def load_cfg():
    if not os.path.exists(CFG):
        sys.exit(f"[asset_pack] missing {CFG}")
    cfg = json.load(open(CFG))
    keys = cfg.get("keys") or ([cfg["key"]] if cfg.get("key") else [])
    keys = [k.strip() for k in keys if k and k.strip()]
    if not keys:
        sys.exit("[asset_pack] no Pexels key configured")
    return keys


def api(keys, params, ki=0):
    """Pexels search with key rotation on 429."""
    last = None
    for attempt in range(len(keys) * 2):
        k = keys[(ki + attempt) % len(keys)]
        url = "https://api.pexels.com/v1/search?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"Authorization": k,
                                                  "User-Agent": "Mozilla/5.0"})
        try:
            return json.load(urllib.request.urlopen(req, timeout=30))
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 403, 401):
                continue
            raise
        except Exception as e:
            last = e
    raise last


def fetch(url, path):
    host = urllib.parse.urlparse(url).netloc.lower()
    if not any(host.endswith(h) for h in OK_HOSTS):
        raise RuntimeError(f"licence guard: refusing host {host}")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    data = urllib.request.urlopen(req, timeout=60).read()
    open(path, "wb").write(data)
    return len(data)


def get_font():
    """Devanagari-capable TTF taken from an npm font package (OFL licensed).

    raw.githubusercontent.com is not reachable from this sandbox, but
    registry.npmjs.org is, and the @expo-google-fonts/* packages ship real .ttf.
    """
    os.makedirs(OUT_FONT, exist_ok=True)
    dest = os.path.join(OUT_FONT, "NotoSansDevanagari-Regular.ttf")
    if os.path.exists(dest) and os.path.getsize(dest) > 100_000:
        return dest
    pkgs = ["@expo-google-fonts/noto-sans-devanagari", "@expo-google-fonts/hind"]
    import tarfile, io, tempfile
    for pkg in pkgs:
        try:
            name = urllib.parse.quote(pkg, safe="@")
            meta = json.load(urllib.request.urlopen(
                f"https://registry.npmjs.org/{name}/latest", timeout=30))
            tgz = urllib.request.urlopen(meta["dist"]["tarball"], timeout=120).read()
            with tarfile.open(fileobj=io.BytesIO(tgz)) as tf:
                ttfs = [m for m in tf.getmembers() if m.name.lower().endswith(".ttf")]
                ttfs.sort(key=lambda m: ("regular" not in m.name.lower(), "bold" in m.name.lower()))
                if not ttfs:
                    print(f"[asset_pack] {pkg}: no ttf inside")
                    continue
                data = tf.extractfile(ttfs[0]).read()
            if len(data) > 100_000:
                open(dest, "wb").write(data)
                print(f"[asset_pack] font ok {len(data)//1024}KB from {pkg} ({ttfs[0].name})")
                return dest
        except Exception as e:
            print(f"[asset_pack] font fail {pkg}: {e}")
    return None


def main():
    keys = load_cfg()
    os.makedirs(OUT_CG, exist_ok=True)
    credits = json.load(open(CREDITS)) if os.path.exists(CREDITS) else {}

    # one search per query group, orientation landscape, big
    pool = {}
    for name, q in QUERIES.items():
        try:
            d = api(keys, {"query": q, "per_page": 12, "orientation": "landscape",
                           "size": "large"}, ki=hash(name) % len(keys))
            pool[name] = d.get("photos", [])
            print(f"[asset_pack] {name:10} {len(pool[name])} photos")
        except Exception as e:
            pool[name] = []
            print(f"[asset_pack] {name:10} FAILED {e}")

    used = set()
    ok = 0
    for scene, qname in SCENE_QUERY.items():
        dest = os.path.join(OUT_CG, f"scene_{scene:02d}.jpg")
        if os.path.exists(dest) and os.path.getsize(dest) > 80_000:
            ok += 1
            continue
        photos = [p for p in pool.get(qname, []) if p["id"] not in used]
        if not photos:
            photos = pool.get(qname, [])
        if not photos:
            print(f"[asset_pack] scene {scene}: NO CANDIDATE")
            continue
        p = photos[0]
        used.add(p["id"])
        src = p["src"]["original"]
        try:
            n = fetch(src, dest)
            credits[dest] = {"scene": scene, "query": qname, "pexels_id": p["id"],
                             "photographer": p.get("photographer"),
                             "page": p.get("url"), "licence": "Pexels Licence",
                             "bytes": n}
            print(f"[asset_pack] scene {scene:02d} <- {qname} {n//1024}KB")
            ok += 1
        except Exception as e:
            print(f"[asset_pack] scene {scene:02d} download fail: {e}")

    json.dump(credits, open(CREDITS, "w"), indent=1, ensure_ascii=False)
    get_font()
    print(f"[asset_pack] DONE {ok}/36 plates")


if __name__ == "__main__":
    main()
