# -*- coding: utf-8 -*-
"""
DROP 01 — Gen-Z capsule.

Single source of truth for the 9→8 new pieces. Running this script:
  1. writes assets/js/drop-data.js  (product data for the detail sheet)
  2. injects the product cards into index.html between the DROP markers
Run from the mens-wear folder:  python3 tools/gen-drop.py
"""
import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WA = "919608087035"

DROP = [
    dict(
        id="distressed-tank", name="Distressed Painted Tank", price=899, tag="New in",
        imgs=["tank-charcoal.jpg", "tank-charcoal-back.jpg"],
        cols=[("Charcoal", "#3b3d3c"), ("Bone", "#ded7c4")],
        sizes=["S", "M", "L", "XL"],
        short="Boxy sleeveless tank, faded wash with a paint-splatter finish.",
        fabric="240 GSM combed cotton · garment washed",
        fit="Boxy oversized · drop shoulder",
        occasion="College · Gig · Daily flex",
        care="Machine wash cold, inside out",
        box="1 tank top",
        desc="This is the piece that stops the scroll — no big logo, just the cut. "
             "The paint-splatter finish is applied by hand, so every piece comes out slightly different; "
             "the raw hem frays on its own over time. Works after the gym and on the days you skip it.",
    ),
    dict(
        id="oversized-tee", name="Heavyweight Oversized Tee", price=999, tag="Drop 01",
        imgs=["oversized-tee-black.jpg"],
        cols=[("Washed Black", "#2a2a28"), ("Bone", "#ded7c4"), ("Acid Lime", "#c8f24d")],
        sizes=["S", "M", "L", "XL", "XXL"],
        short="260 GSM boxy tee, vintage wash — a collar that still stands after a wash.",
        fabric="260 GSM cotton · vintage wash",
        fit="Oversized boxy · thick ribbed collar",
        occasion="Daily · Street · Travel",
        care="Machine wash cold, do not bleach",
        box="1 t-shirt",
        desc="A cheap tee gives up after three washes — this one does not. 260 GSM cotton, double-stitched "
             "collar and a boxy drop-shoulder cut, so it sits right on the shoulder. It is plain, so it works "
             "with jeans, cargo and shorts alike.",
    ),
    dict(
        id="cargo-olive", name="Baggy Utility Cargo", price=1799, tag="Best seller",
        imgs=["cargo-olive.jpg"],
        cols=[("Olive", "#5d5f3a"), ("Stone", "#b8ae95"), ("Black", "#232322")],
        sizes=["28", "30", "32", "34", "36"],
        short="Six-pocket baggy cargo with a drawcord hem — puddle fit.",
        fabric="Cotton ripstop · washed",
        fit="Baggy · mid-rise · adjustable hem",
        occasion="Street · College · Travel",
        care="Machine wash cold",
        box="1 cargo pant",
        desc="Baggy only makes sense when the pockets actually work. Two large side cargo pockets, two at "
             "the back, two hand pockets; a knee panel means daily wear will not tear them. The drawcord hem "
             "goes straight or cuffed — your call.",
    ),
    dict(
        id="baggy-jeans", name="Vintage Wash Baggy Jeans", price=1899, tag="Trending",
        imgs=["baggy-jeans.jpg"],
        cols=[("Light Vintage", "#8fa4b8"), ("Mid Blue", "#4a6a8a"), ("Jet Black", "#232322")],
        sizes=["28", "30", "32", "34", "36"],
        short="Wide-leg rigid denim, faded thighs, puddle-length hem.",
        fabric="12 oz rigid denim · stone washed",
        fit="Wide leg · high-rise · relaxed seat",
        occasion="Street · Party · Daily",
        care="Machine wash cold, inside out",
        box="1 pair jeans",
        desc="Y2K wide-leg jeans — loose, but not so loose that they walk on their own. High-rise, so a "
             "tucked tee still sits right. The fade is natural, so the look gets better after six months; "
             "if they feel tight on day one, take one size up.",
    ),
    dict(
        id="varsity-cream", name="Cream Varsity Jacket", price=2799, tag="Winter drop",
        imgs=["varsity-jacket.jpg"],
        cols=[("Cream / Black", "#e9e2cf"), ("Black / Cream", "#26262a")],
        sizes=["S", "M", "L", "XL"],
        short="Wool-body varsity with leather sleeves and striped ribbing.",
        fabric="Wool blend body · PU leather sleeves",
        fit="Relaxed · true to size",
        occasion="Winter · Party · Campus",
        care="Dry clean / spot clean only",
        box="1 varsity jacket",
        desc="That classic campus jacket energy, in a clean colourway — cream body, black sleeves. "
             "Quilted lining inside, so it holds up in a Nawada winter. Layer it over a hoodie; the sleeves "
             "are PU, so keep it out of the rain.",
    ),
    dict(
        id="hoodie-bone", name="Heavyweight Boxy Hoodie", price=1599, tag="Core",
        imgs=["hoodie-bone.jpg"],
        cols=[("Bone", "#ded7c4"), ("Washed Black", "#2a2a28"), ("Wine", "#5a1a2a")],
        sizes=["S", "M", "L", "XL", "XXL"],
        short="450 GSM brushed fleece, boxy body, thick drawcords.",
        fabric="450 GSM brushed fleece",
        fit="Boxy oversized · ribbed cuffs",
        occasion="Winter · Travel · College",
        care="Machine wash cold, inside out",
        box="1 hoodie",
        desc="You feel the difference of a heavy hoodie the moment you wear it — it holds its own shape "
             "instead of hanging thin. 450 GSM fleece is brushed inside, so it is soft even on bare skin. "
             "Matching drawcords, and a kangaroo pocket that is actually deep.",
    ),
    dict(
        id="cord-overshirt", name="Corduroy Overshirt", price=1699, tag="New in",
        imgs=["cord-overshirt.jpg"],
        cols=[("Tobacco", "#6b4a2f"), ("Olive", "#5d5f3a"), ("Black", "#232322")],
        sizes=["S", "M", "L", "XL"],
        short="Wide-wale corduroy overshirt — halfway between a shirt and a jacket.",
        fabric="8-wale cotton corduroy",
        fit="Relaxed · wear open or buttoned",
        occasion="Winter · College · Date",
        care="Machine wash cold, inside out",
        box="1 overshirt",
        desc="One layer that goes over a tee on top and works as a shirt underneath. Wide-wale corduroy "
             "adds texture, so it is never boring next to a plain tee. The chest pockets are usable; wear it "
             "open and it reads oversized.",
    ),
    dict(
        id="bowling-shirt", name="Camp Collar Bowling Shirt", price=1299, tag="Summer",
        imgs=["bowling-shirt.jpg"],
        cols=[("Lime Olive", "#a8b52a"), ("Off White", "#efe9dc"), ("Rust", "#9b4b2a")],
        sizes=["S", "M", "L", "XL"],
        short="Boxy short-sleeve shirt with a contrast camp collar.",
        fabric="Viscose blend · soft drape",
        fit="Boxy · camp collar · straight hem",
        occasion="Summer · Party · Vacation",
        care="Gentle machine wash",
        box="1 shirt",
        desc="A camp collar shirt is styled without trying — half open, over a tee, or buttoned and "
             "tucked. Viscose keeps it cool in the heat and keeps creases away. The colour pops on camera.",
    ),
]

# "complete the look" pairs
PAIRS = {
    "distressed-tank": ["cargo-olive", "baggy-jeans"],
    "oversized-tee": ["baggy-jeans", "varsity-cream"],
    "cargo-olive": ["oversized-tee", "varsity-cream"],
    "baggy-jeans": ["oversized-tee", "bowling-shirt"],
    "varsity-cream": ["oversized-tee", "cargo-olive"],
    "hoodie-bone": ["baggy-jeans", "cargo-olive"],
    "cord-overshirt": ["oversized-tee", "baggy-jeans"],
    "bowling-shirt": ["baggy-jeans", "cargo-olive"],
}


def e(s):
    return html.escape(s, quote=True)


def card(p):
    wa = "Hi Men's Wear! I would like the %s — please share price and sizes." % p["name"]
    href = "https://wa.me/%s?text=%s" % (WA, __import__("urllib.parse", fromlist=["quote"]).quote(wa))
    return f'''      <article class="pcard pcard--drop" data-cat="drop" data-id="{p["id"]}" data-price="{p["price"]}" data-name="{e(p["name"])}">
        <div class="pcard__media">
          <span class="pcard__badge">{e(p["tag"])}</span>
          <button class="pcard__wish" type="button" data-wish="{p["id"]}" aria-label="Save {e(p["name"])} to wishlist" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z"/></svg></button>
          <img src="assets/img/genz/{p["imgs"][0]}" alt="{e(p["name"])} — {e(p["short"])}" width="800" height="1000" loading="lazy" decoding="async">
          <span class="pcard__hint">Tap for details</span>
        </div>
        <div class="pcard__body">
          <p class="pcard__brand">Men&#39;s Wear <span>· Drop 01</span></p>
          <h3 class="pcard__title">{e(p["name"])}</h3>
          <div class="pcard__price"><span class="price">₹{p["price"]:,}</span></div>
          <p class="pcard__meta">Street · Free alteration</p>
          <div class="pcard__cta">
            <button class="btn btn--gold btn--xs" type="button" data-open="{p["id"]}">View details</button>
            <a class="pcard__wa" href="{href}" data-wa="{e(wa)}" target="_blank" rel="noopener" aria-label="Order {e(p["name"])} on WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.53.15-.17.2-.3.3-.5.1-.2.05-.37-.05-.52-.1-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.42-.08-.12-.28-.2-.57-.34M12.05 21.8h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26 9.89 9.89 0 0 1 16.88-6.99 9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88M20.46 3.49A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.69 1.45h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.16-3.48-8.41Z"/></svg></a>
          </div>
        </div>
      </article>
'''


def data_js():
    out = [
        "/* DROP 01 — generated by tools/gen-drop.py. Edit the python file, not this. */",
        "(function () {",
        '  var s = document.currentScript && document.currentScript.src ? document.currentScript.src : "";',
        '  var BASE = s.indexOf("assets/js/drop-data.js") > -1 ? s.slice(0, s.indexOf("assets/js/drop-data.js")) : "";',
        "  var IMG = BASE + \"assets/img/genz/\";",
        "  window.__MW_DROP = [",
    ]
    rows = []
    for p in DROP:
        rows.append(json.dumps({
            "id": p["id"], "name": p["name"], "cat": "drop", "price": p["price"],
            "imgs": ["@@" + i for i in p["imgs"]],
            "cols": [{"name": n, "hex": h} for n, h in p["cols"]],
            "sizes": p["sizes"], "sold": "", "tag": p["tag"],
            "short": p["short"], "desc": p["desc"], "fabric": p["fabric"],
            "fit": p["fit"], "occasion": p["occasion"], "care": p["care"], "box": p["box"],
        }, ensure_ascii=False, indent=2))
    body = ",\n".join(rows)
    body = re.sub(r'"@@([^"]+)"', r'IMG + "\1"', body)
    body = body.replace("\n", "\n    ")
    out.append("    " + body)
    out.append("  ];")
    out.append('  try { window.dispatchEvent(new Event("mw:drop-ready")); } catch (e) {}')
    out.append("  window.__MW_DROP_PAIRS = " + json.dumps(PAIRS, indent=2).replace("\n", "\n  ") + ";")
    out.append("})();")
    return "\n".join(out) + "\n"


def main():
    js = data_js()
    with open(os.path.join(ROOT, "assets", "js", "drop-data.js"), "w", encoding="utf-8") as f:
        f.write(js)

    idx = os.path.join(ROOT, "index.html")
    s = open(idx, encoding="utf-8").read()
    start = s.index("<!-- DROP:START -->")
    end = s.index("<!-- DROP:END -->")
    block = "<!-- DROP:START -->\n" + "".join(card(p) for p in DROP) + "      <!-- DROP:END -->"
    s = s[:start] + block + s[end + len("<!-- DROP:END -->"):]
    open(idx, "w", encoding="utf-8").write(s)
    print("drop-data.js:", len(js), "bytes ·", len(DROP), "pieces · cards injected")


if __name__ == "__main__":
    main()
