"""Normalize a pinned bsthen/device-models JSON snapshot; never infer hardware specs.
Usage: python scripts/import-catalog.py INPUT.json
See CATALOG.md for download instructions and license.
"""
import json, re, sys
from pathlib import Path
BRANDS = 'Samsung|Redmi|Xiaomi|Vivo|OPPO|Realme|POCO|iQOO|OnePlus|Motorola|Google|Nokia|HMD|Nothing|CMF|Infinix|Tecno|Itel|Lava|Micromax|Honor|Huawei|ASUS|Sony|LG|Lenovo|HTC|ZTE|Nubia|Black Shark|BlackBerry|Meizu|Intex|Gionee|Coolpad|Panasonic|Sharp|TCL|Alcatel|Acer|BLU|Wiko|Oukitel|Ulefone|Doogee|Umidigi|Blackview|Fairphone|Vsmart|Walton|Symphony|QMobile|Karbonn|Spice|10.or|benco'.split('|')
ALIASES={b.lower():b for b in BRANDS}
ALIASES.update({'lge':'LG','tct (alcatel)':'Alcatel','blackshark':'Black Shark','blu':'BLU'})
EXCLUDE=re.compile(r'\b(tv|watch|chromebook|emulator|automotive|projector|smartbox|set.top|stick|smart display|google home|nest hub|shield|box)\b|电视|手表',re.I)
rows={}
def add(brand,model,code=''):
 model=re.sub(r'\s+',' ',model).strip()
 model=re.sub(r'^'+re.escape(brand)+r'[\s_]+','',model,flags=re.I).strip() or model
 if not model or EXCLUDE.search(model) or EXCLUDE.search(code):return
 key=(brand,model.casefold())
 if key not in rows:rows[key]={'brand':brand,'model':model,'codes':[]}
 if code and code.casefold()!=model.casefold() and code not in rows[key]['codes']:rows[key]['codes'].append(code)
for code,v in json.load(open(sys.argv[1])).items():
 brand=ALIASES.get(v['brand'].lower())
 if not brand:continue
 name=v['name'].strip() or code
 # Correct common historical manufacturer aliases using explicit marketing names only.
 for prefix,new in [('iQOO','iQOO'),('POCO','POCO'),('Redmi','Redmi'),('realme','Realme'),('CMF','CMF')]:
  if name.lower().startswith(prefix.lower()):brand=new;break
 add(brand,name,code)
# Names only, from Apple's model identification page; no invented RAM/Hz values.
apple=['iPhone','iPhone 3G','iPhone 3GS','iPhone 4','iPhone 4s','iPhone 5','iPhone 5c','iPhone 5s','iPhone 6','iPhone 6 Plus','iPhone 6s','iPhone 6s Plus','iPhone SE (1st generation)','iPhone 7','iPhone 7 Plus','iPhone 8','iPhone 8 Plus','iPhone X','iPhone XR','iPhone XS','iPhone XS Max','iPhone 11','iPhone 11 Pro','iPhone 11 Pro Max','iPhone SE (2nd generation)','iPhone 12 mini','iPhone 12','iPhone 12 Pro','iPhone 12 Pro Max','iPhone 13 mini','iPhone 13','iPhone 13 Pro','iPhone 13 Pro Max','iPhone SE (3rd generation)','iPhone 14','iPhone 14 Plus','iPhone 14 Pro','iPhone 14 Pro Max','iPhone 15','iPhone 15 Plus','iPhone 15 Pro','iPhone 15 Pro Max','iPhone 16','iPhone 16 Plus','iPhone 16 Pro','iPhone 16 Pro Max','iPhone 16e','iPhone 17','iPhone 17 Pro','iPhone 17 Pro Max','iPhone Air','iPhone 17e']
for model in apple:add('Apple',model)
data=sorted(rows.values(),key=lambda p:(p['brand'].casefold(),p['model'].casefold()))
out=Path(__file__).resolve().parents[1]/'src/data/phones.js'
grouped={}
for p in data:grouped.setdefault(p['brand'],[]).append([p['model'],p['codes']])
out.write_text('// Generated names/codes only. See CATALOG.md for provenance and limitations.\nconst grouped = '+json.dumps(grouped,ensure_ascii=False,separators=(',',':'))+';\nexport const phones = Object.entries(grouped).flatMap(([brand, entries]) => entries.map(([model, codes]) => ({brand, model, codes})));\n')
print(f'{len(data)} names across {len(set(p["brand"] for p in data))} brands')
