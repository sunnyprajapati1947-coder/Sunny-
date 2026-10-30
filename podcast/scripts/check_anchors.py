"""check_anchors.py — draw the anchor geometry back onto each plate."""
import sys
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, '.')
from plates import PLATES

def draw(name, out):
    p = PLATES[name]
    im = Image.open(f'../assets/plates/{p["file"]}').convert('RGB')
    d = ImageDraw.Draw(im)
    if 'face' in p:
        x, y, w, h = p['face']
        if w:
            d.rectangle([x, y, x + w, y + h], outline=(0, 255, 0), width=2)
    for (ex, ey) in p.get('eyes', []):
        r = p.get('eye_r', 12)
        d.ellipse([ex - r, ey - r, ex + r, ey + r], outline=(0, 220, 255), width=2)
        d.line([ex - 20, ey, ex + 20, ey], fill=(0, 220, 255))
        d.line([ex, ey - 20, ex, ey + 20], fill=(0, 220, 255))
    m = p.get('mouth')
    if m and m['cx']:
        cx, cy, hw = m['cx'], m['cy'], m['half_w']
        d.ellipse([cx - hw, cy - 14, cx + hw, cy + 14], outline=(255, 0, 200), width=2)
        d.ellipse([cx - hw * 0.55, cy - 4, cx + hw * 0.55, cy + m['open_max']],
                  outline=(255, 140, 0), width=2)
        d.line([cx, cy - 40, cx, cy + 40], fill=(255, 0, 200))
    if p.get('chin_y'):
        d.line([m['cx'] - 90, p['chin_y'], m['cx'] + 90, p['chin_y']], fill=(255, 255, 0), width=2)
    if p.get('nose_y'):
        d.line([m['cx'] - 60, p['nose_y'], m['cx'] + 60, p['nose_y']], fill=(160, 160, 255), width=2)
    hc = p.get('head_center')
    if hc and hc[0]:
        r = p['head_r']
        d.ellipse([hc[0] - r, hc[1] - r, hc[0] + r, hc[1] + r], outline=(120, 255, 120), width=1)
    # zoomed crop around the face for inspection
    if m and m['cx']:
        cx, cy = m['cx'], m['cy'] - 40
        box = (max(0, cx - 240), max(0, cy - 200), cx + 240, cy + 220)
        im.crop(box).resize((box[2] - box[0]) * 2 and ((box[2] - box[0]) * 2, (box[3] - box[1]) * 2)).save(out)
    return im

if __name__ == '__main__':
    names = sys.argv[1:] or ['aarav_ref', 'rohan_ref']
    for n in names:
        draw(n, f'/tmp/anchor_{n}.png')
        print('wrote', f'/tmp/anchor_{n}.png')
