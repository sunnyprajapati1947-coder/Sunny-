import sys, os, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib import cgilib as G
from lib import scenes as S

t0=time.time()
pal = S.PAL["dawn"]
# --- background layer
bg = G.Canvas(S.W, S.H)
S.sky(bg, pal, sun_xy=(0.70, 0.70), sun_r=0.05, clouds=0.6)
S.hills(bg, pal, S.HZ*1.02, 150, pal["far"], seed=2, layers=2)
# --- mid layer
mid = G.Canvas(S.W, S.H)
S.ground(mid, pal)
S.path(mid, pal, x_top=0.52, w_top=0.02, x_bot=0.46, w_bot=0.30)
S.field_rows(mid, pal, S.HZ+50, 0.02, 0.30, n=7)
S.tree(mid, pal, 300, S.HZ*1.34, 520, seed=1)
S.tree(mid, pal, 2050, S.HZ*1.20, 380, seed=5)
S.house(mid, pal, 1490, S.HZ*1.12, 330, 250, lit=(1.0,0.8,0.45))
S.house(mid, pal, 300, S.HZ*1.05, 260, 190)
for i in range(3):
    S.bush(mid, pal, 1200+i*260, S.HZ*1.5+i*60, 120+i*20)
# --- subject layer
subj = G.Canvas(S.W, S.H)
S.boy(subj, 980, 1150, 620, pose="point", pal=pal)
S.neelu(subj, 1420, 1180, 560, pal=pal, arm="wave", eyes="happy")
# --- fg layer
fg = G.Canvas(S.W, S.H)
S.bush(fg, pal, 60, S.H*1.35, 340, col=S.PAL["dawn"]["grass"]*0.6)
S.dust_motes(fg, 60, 3)

out = os.path.join(os.path.dirname(__file__), "probe1.png")
comp = bg
for layer in (mid, subj, fg):
    a = layer.px
    comp.px[..., :3] = a[..., :3]*a[..., 3:4] + comp.px[..., :3]*(1-a[..., 3:4])
img = comp.to_image().convert("RGB").resize((1152, 648))
img.save(out)
print("saved", out, round(time.time()-t0,2), "s")
