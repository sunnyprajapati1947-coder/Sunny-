#!/usr/bin/env python3
"""Build a compact, quiz-ready SVG map of India from a state boundary GeoJSON.

Input : tools/india_states_raw.geojson   (source: datta07/INDIAN-SHAPEFILES, INDIA_STATES.geojson)
Output: src/map-data.js                  (window.INDIA_MAP = {...})

The output contains, for every state / union territory:
  id, name, path (SVG path in a 1000-unit wide viewBox), label point,
  bbox, whether the shape is small enough to need a tap hotspot.

Run with:  python3 tools/build_map.py
"""

from __future__ import annotations

import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "india_states_raw.geojson")
OUT_JS = os.path.join(ROOT, "src", "map-data.js")

VIEW_W = 1000.0

# GeoJSON STNAME -> app id
IDS = {
    "ANDHRA PRADESH": "andhra-pradesh",
    "ARUNACHAL PRADESH": "arunachal-pradesh",
    "ASSAM": "assam",
    "BIHAR": "bihar",
    "CHHATTISGARH": "chhattisgarh",
    "GOA": "goa",
    "GUJARAT": "gujarat",
    "HARYANA": "haryana",
    "HIMACHAL PRADESH": "himachal-pradesh",
    "JHARKHAND": "jharkhand",
    "KARNATAKA": "karnataka",
    "KERALA": "kerala",
    "MADHYA PRADESH": "madhya-pradesh",
    "MAHARASHTRA": "maharashtra",
    "MANIPUR": "manipur",
    "MEGHALAYA": "meghalaya",
    "MIZORAM": "mizoram",
    "NAGALAND": "nagaland",
    "ODISHA": "odisha",
    "PUNJAB": "punjab",
    "RAJASTHAN": "rajasthan",
    "SIKKIM": "sikkim",
    "TAMIL NADU": "tamil-nadu",
    "TELANGANA": "telangana",
    "TRIPURA": "tripura",
    "UTTAR PRADESH": "uttar-pradesh",
    "UTTARAKHAND": "uttarakhand",
    "WEST BENGAL": "west-bengal",
    # union territories
    "ANDAMAN & NICOBAR": "andaman-nicobar",
    "CHANDIGARH": "chandigarh",
    "DELHI": "delhi",
    "JAMMU & KASHMIR": "jammu-kashmir",
    "LADAKH": "ladakh",
    "LAKSHADWEEP": "lakshadweep",
    "PUDUCHERRY": "puducherry",
    # these two were merged into one UT in 2020
    "DADRA & NAGAR HAVELI": "dadra-nagar-haveli-daman-diu",
    "DAMAN & DIU": "dadra-nagar-haveli-daman-diu",
}

NAMES = {
    "andhra-pradesh": "Andhra Pradesh",
    "arunachal-pradesh": "Arunachal Pradesh",
    "assam": "Assam",
    "bihar": "Bihar",
    "chhattisgarh": "Chhattisgarh",
    "goa": "Goa",
    "gujarat": "Gujarat",
    "haryana": "Haryana",
    "himachal-pradesh": "Himachal Pradesh",
    "jharkhand": "Jharkhand",
    "karnataka": "Karnataka",
    "kerala": "Kerala",
    "madhya-pradesh": "Madhya Pradesh",
    "maharashtra": "Maharashtra",
    "manipur": "Manipur",
    "meghalaya": "Meghalaya",
    "mizoram": "Mizoram",
    "nagaland": "Nagaland",
    "odisha": "Odisha",
    "punjab": "Punjab",
    "rajasthan": "Rajasthan",
    "sikkim": "Sikkim",
    "tamil-nadu": "Tamil Nadu",
    "telangana": "Telangana",
    "tripura": "Tripura",
    "uttar-pradesh": "Uttar Pradesh",
    "uttarakhand": "Uttarakhand",
    "west-bengal": "West Bengal",
    "andaman-nicobar": "Andaman & Nicobar Islands",
    "chandigarh": "Chandigarh",
    "delhi": "Delhi (NCT)",
    "jammu-kashmir": "Jammu & Kashmir",
    "ladakh": "Ladakh",
    "lakshadweep": "Lakshadweep",
    "puducherry": "Puducherry",
    "dadra-nagar-haveli-daman-diu": "Dadra & Nagar Haveli\nand Daman & Diu",
}


def mercator(lon: float, lat: float) -> tuple[float, float]:
    lat = max(-85.0, min(85.0, lat))
    x = math.radians(lon)
    y = math.log(math.tan(math.pi / 4.0 + math.radians(lat) / 2.0))
    return x, y


def ring_area(pts) -> float:
    a = 0.0
    for i in range(len(pts) - 1):
        a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
    return abs(a) / 2.0


def dp_simplify(pts, tol: float):
    """Douglas-Peucker on an open list of points."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        first, last = stack.pop()
        if last <= first + 1:
            continue
        ax, ay = pts[first]
        bx, by = pts[last]
        dx, dy = bx - ax, by - ay
        seg = math.hypot(dx, dy)
        best_i, best_d = -1, -1.0
        for i in range(first + 1, last):
            px, py = pts[i]
            if seg == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                d = abs(dy * (px - ax) - dx * (py - ay)) / seg
            if d > best_d:
                best_i, best_d = i, d
        if best_d > tol:
            keep[best_i] = True
            stack.append((first, best_i))
            stack.append((best_i, last))
    return [p for p, k in zip(pts, keep) if k]


def point_in_poly(x, y, ring) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y):
            xint = (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi
            if x < xint:
                inside = not inside
        j = i
    return inside


def seg_dist(px, py, ax, ay, bx, by) -> float:
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def label_point(rings):
    """Pole-of-inaccessibility style label anchor for the biggest ring."""
    ring = max(rings, key=ring_area)
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    best, best_d = (sum(xs) / len(xs), sum(ys) / len(ys)), -1.0

    def score(x, y):
        if not point_in_poly(x, y, ring):
            return -1.0
        return min(seg_dist(x, y, *ring[i], *ring[i + 1]) for i in range(len(ring) - 1))

    steps = 24
    for i in range(steps + 1):
        for j in range(steps + 1):
            x = minx + (maxx - minx) * i / steps
            y = miny + (maxy - miny) * j / steps
            d = score(x, y)
            if d > best_d:
                best, best_d = (x, y), d
    # refine around the best grid cell
    span = max((maxx - minx) / steps, (maxy - miny) / steps)
    cx, cy = best
    for _ in range(4):
        span *= 0.5
        for i in range(-2, 3):
            for j in range(-2, 3):
                x, y = cx + i * span, cy + j * span
                d = score(x, y)
                if d > best_d:
                    best, best_d = (x, y), d
        cx, cy = best
    return best



# ---------------------------------------------------------------- labels

FONT_UNITS = 20.0  # matches the largest .state-label size in styles.css
CHAR_W = 0.56  # rough advance width of a character, in em
SHORT_LABEL_LEN = {  # ids that get a shortened map label (kept in sync with data.js)
    "andaman-nicobar": 15,
    "dadra-nagar-haveli-daman-diu": 14,
    "jammu-kashmir": 7,
    "arunachal-pradesh": 9,
    "himachal-pradesh": 8,
    "west-bengal": 11,
}


def label_length(shape_id: str) -> int:
    if shape_id in SHORT_LABEL_LEN:
        return SHORT_LABEL_LEN[shape_id]
    return len(shape_id.replace("-", " "))


def font_size_for(area: float) -> float:
    if area > 9000:
        return FONT_UNITS
    if area > 3500:
        return FONT_UNITS - 2
    return FONT_UNITS - 4


def boxes_overlap(a, b) -> bool:
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])


def shape_contains(rings, x, y) -> bool:
    inside = False
    for ring in rings:
        if point_in_poly(x, y, ring):
            inside = not inside  # even-odd, so holes punch out
    return inside


def nearest_boundary_point(rings, x, y):
    best, best_d = (x, y), float("inf")
    for ring in rings:
        for i in range(len(ring) - 1):
            ax, ay = ring[i]
            bx, by = ring[i + 1]
            dx, dy = bx - ax, by - ay
            denom = dx * dx + dy * dy
            t = 0.0 if denom == 0 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / denom))
            px, py = ax + t * dx, ay + t * dy
            d = math.hypot(x - px, y - py)
            if d < best_d:
                best, best_d = (px, py), d
    return best


def label_fits(shape) -> bool:
    """Same rule as the renderer: no text on shapes that are too small/thin."""
    w, h = shape["bbox"][2], shape["bbox"][3]
    return (w >= 58 and h >= 34) or (w >= 46 and h >= 150)


def place_labels(shapes) -> None:
    """Choose a readable label anchor per shape.

    Priority order: biggest shapes first. A label prefers the shape's own interior;
    if the text does not fit, it may sit outside with a leader line, as long as it
    does not land on another state or on an already-placed label.
    """
    ordered = sorted(shapes, key=lambda s: -s["area"])
    placed = []
    for shape in ordered:
        rings = shape["rings"]
        if not label_fits(shape):
            # marker-dot shapes keep their centroid label; nothing is drawn on top
            shape["fs"] = 0
            shape["leader"] = None
            continue
        fs = font_size_for(shape["area"])
        width = label_length(shape["id"]) * fs * CHAR_W + 6
        height = fs * 1.15
        ideal_x, ideal_y = shape["label"]

        def score(x, y):
            box = (x - width / 2, y - height / 2, x + width / 2, y + height / 2)
            inside_self = shape_contains(rings, x, y)
            if not inside_self:
                for other in shapes:
                    if other is shape:
                        continue
                    if shape_contains(other["rings"], x, y):
                        return None
            for other_box in placed:
                if boxes_overlap(box, other_box):
                    return None
            dist = math.hypot(x - ideal_x, y - ideal_y)
            penalty = 0.0 if inside_self else 45.0
            # nudge towards staying inside the viewbox
            if box[0] < 4 or box[2] > VIEW_W - 4:
                penalty += 90.0
            if box[1] < 4 or box[3] > (VIEW_W * 2):
                penalty += 60.0
            return dist + penalty

        best, best_score = (ideal_x, ideal_y), None
        radius_steps = [0, 14, 28, 44, 62, 84, 108, 134]
        for radius in radius_steps:
            candidates = [(ideal_x, ideal_y)] if radius == 0 else []
            if radius:
                for step in range(16):
                    angle = (step / 16) * 2 * math.pi
                    candidates.append(
                        (ideal_x + radius * math.cos(angle), ideal_y + radius * math.sin(angle))
                    )
            for cx, cy in candidates:
                s = score(cx, cy)
                if s is None:
                    continue
                if best_score is None or s < best_score:
                    best, best_score = (cx, cy), s
            if best_score is not None and best_score < 45:
                break

        x, y = best
        inside = shape_contains(rings, x, y)
        leader = None
        if not inside:
            ex, ey = nearest_boundary_point(rings, x, y)
            # start the leader a little outside the border, stop short of the text
            length = max(1.0, math.hypot(x - ex, y - ey))
            t = max(0.0, (length - 10) / length)
            leader = [
                [round(ex, 1), round(ey, 1)],
                [round(ex + (x - ex) * t, 1), round(ey + (y - ey) * t, 1)],
            ]
            # labels that sit outside are pushed a bit further for legibility
            y = y + (0 if y < ideal_y else 0)

        shape["label"] = [round(x, 1), round(y, 1)]
        shape["fs"] = fs
        shape["leader"] = leader
        placed.append([x - width / 2, y - height / 2, x + width / 2, y + height / 2])



# ---------------------------------------------------------------- neighbours

NEIGHBOUR_TOLERANCE = 2.5  # svg units, roughly 15 km at this scale


def compute_neighbours(shapes) -> None:
    """Two states are neighbours when their outlines come within ~15 km.

    Border vertices are shared or nearly duplicated, so a spatial hash over all
    vertices is enough and keeps this linear instead of 630 polygon tests.
    """
    cell = NEIGHBOUR_TOLERANCE
    grid = {}
    for shape in shapes:
        for ring in shape["rings"]:
            for x, y in ring:
                grid.setdefault((int(x // cell), int(y // cell)), []).append((x, y, shape["id"]))

    neighbours = {shape["id"]: set() for shape in shapes}
    tol_sq = NEIGHBOUR_TOLERANCE * NEIGHBOUR_TOLERANCE
    for (cx, cy), points in grid.items():
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                other = grid.get((cx + dx, cy + dy))
                if not other:
                    continue
                for x1, y1, id1 in points:
                    for x2, y2, id2 in other:
                        if id1 == id2:
                            continue
                        if (x1 - x2) ** 2 + (y1 - y2) ** 2 <= tol_sq:
                            neighbours[id1].add(id2)
                            neighbours[id2].add(id1)

    for shape in shapes:
        shape["neighbours"] = sorted(neighbours[shape["id"]])


def fmt(v: float) -> str:
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return s if s else "0"


def main() -> None:
    data = json.load(open(SRC, encoding="utf-8"))
    feats: dict[str, dict] = {}
    for f in data["features"]:
        stname = f["properties"]["STNAME"].strip().upper()
        sid = IDS[stname]
        geom = f["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        entry = feats.setdefault(sid, {"rings": [], "sources": []})
        entry["sources"].append(stname)
        for poly in polys:
            for ring in poly:  # outer ring + holes (holes are handled by even-odd)
                if len(ring) < 4:
                    continue
                entry["rings"].append([mercator(float(x), float(y)) for x, y in ring])

    # ---- global bounds ----
    xs = [p[0] for e in feats.values() for r in e["rings"] for p in r]
    ys = [p[1] for e in feats.values() for r in e["rings"] for p in r]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    scale = VIEW_W / (maxx - minx)
    view_h = round((maxy - miny) * scale, 2)

    shapes = []
    for sid, entry in sorted(feats.items()):
        rings_px = []
        for r in entry["rings"]:
            pts = [(round((x - minx) * scale, 2), round((maxy - y) * scale, 2)) for x, y in r]
            if pts[0] != pts[-1]:
                pts.append(pts[0])
            rings_px.append(pts)

        tol = 0.45  # pixels
        simplified = []
        for r in rings_px:
            s_ring = dp_simplify(r, tol)
            if len(s_ring) >= 4 and ring_area(s_ring) >= 0.6:
                simplified.append(s_ring)
        if not simplified:  # keep at least the biggest original ring
            simplified = [max(rings_px, key=ring_area)]

        # tiny far-flung islands make the bbox useless -> cap rings per shape
        simplified.sort(key=ring_area, reverse=True)
        simplified = simplified[:12]

        d = []
        for r in simplified:
            d.append("M" + "L".join(f"{fmt(x)},{fmt(y)}" for x, y in r[:-1]) + "Z")
        path = "".join(d)

        all_pts = [p for r in simplified for p in r]
        bx = [p[0] for p in all_pts]
        by = [p[1] for p in all_pts]
        bbox = [round(min(bx), 1), round(min(by), 1), round(max(bx) - min(bx), 1), round(max(by) - min(by), 1)]
        lx, ly = label_point(simplified)
        area_px = sum(ring_area(r) for r in simplified)

        shapes.append(
            {
                "id": sid,
                "name": NAMES[sid],
                "path": path,
                "label": [round(lx, 1), round(ly, 1)],
                "bbox": bbox,
                "area": round(area_px, 1),
                "rings": simplified,
            }
        )

    place_labels(shapes)
    compute_neighbours(shapes)
    for shape in shapes:
        shape.pop("rings", None)

    meta = json.dumps(
        {"width": VIEW_W, "height": view_h, "shapes": shapes}, ensure_ascii=False, separators=(",", ":")
    )
    with open(OUT_JS, "w", encoding="utf-8") as fh:
        fh.write("/* Generated by tools/build_map.py — do not edit by hand. */\n")
        fh.write("window.INDIA_MAP=")
        fh.write(meta)
        fh.write(";\n")

    print(f"shapes: {len(shapes)}  viewBox: 0 0 {VIEW_W:.0f} {view_h}")
    print(f"output: {OUT_JS}  ({os.path.getsize(OUT_JS) / 1024:.0f} KB)")
    missing = set(IDS.values()) - {s["id"] for s in shapes}
    if missing:
        print("MISSING:", missing)


if __name__ == "__main__":
    main()
