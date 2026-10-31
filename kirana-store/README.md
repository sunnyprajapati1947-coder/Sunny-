# 🏪 Rishu Kirana Store — Advanced Kirana Store Management App (POS + Inventory)

Mall-jaisa complete billing & inventory system: **React (Vite) + Node.js/Express + MongoDB (Mongoose)**.
Store: **Rishu Kirana Store, Gaya Road, Nawada • 9608087035**

> Zero-config chal jaata hai: agar `MONGODB_URI` set nahi hai to backend built-in embedded JSON database
> use karta hai (data `backend/data/` me persist hota hai). Production me MongoDB Atlas URI set karo —
> same code, same API.

---

## 🚀 Quick start (local)

```bash
# 1) Backend (port 5000)
cd kirana-store/backend
npm install
npm start            # first run auto-seeds store + demo data

# 2) Frontend (port 5173, proxies /api to backend)
cd ../frontend
npm install
npm run dev
```

Open http://localhost:5173

### Default logins
| Role | Username | Password | PIN |
|---|---|---|---|
| Owner/Admin | `owner` | `owner123` | `1111` |
| Manager | `manager` | `manager123` | `2222` |
| Cashier | `cashier` | `cashier123` | `4321` |

⚠️ Pehla kaam: Settings/Admin se password change karein.

---

## 📱 Mobile app (phone par chalao)
- **PWA install (30 sec):** hosted/preview URL phone ke Chrome/Safari me kholo → Android: `⋮ → Install app`, iPhone: `Share → Add to Home Screen`. Home-screen icon, full-screen UI, offline cache. App ke top-bar me 📲 install button bhi hai.
- **Asli APK (Capacitor):** see [`MOBILE_APP.md`](./MOBILE_APP.md) — `npm run build && npx cap add android && npx cap sync && cd android && ./gradlew assembleDebug` → `app-debug.apk`.
- Manifest me 192/512 PNG icons, shortcuts (Billing/Reports/Shop), standalone display; service worker offline shell deta hai.

## 🔌 MongoDB (online database) setup

1. https://www.mongodb.com/cloud/atlas par free cluster banao.
2. Database user + network access (0.0.0.0/0 ya apna IP) set karo.
3. Connection string copy karo aur `backend/.env` me daalo:

```env
PORT=5000
JWT_SECRET=koi-lamba-random-secret
MONGODB_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/rishu-kirana
```

4. `npm start` — ab saara data MongoDB me save hoga (mobile se bhi dekhega, multi-device sync).

Local/embedded mode me bhi sab kuch chalta hai (billing, reports, backup/restore) — data `backend/data/*.json` me rehta hai. Settings → Backup se JSON backup lo, kahin bhi restore karo.

---

## ✅ Feature map

| Module | Kahan |
|---|---|
| POS billing: barcode scan (USB hardware + camera), auto price, qty +/-, discounts, GST, round-off, split payment, cash/UPI/card/udhar, hold bills, returns, thermal 58/80mm print, WhatsApp receipt | `/pos` |
| Products: full CRUD, auto EAN-13 barcode, image upload, Excel/CSV bulk import, HSN/GST/expiry/rack | `/products` |
| Inventory: stock in/out log, low-stock & expiry alerts, stock valuation | `/inventory` |
| Price editor: **owner-only password lock**, selling ≤ MRP rule, bulk % update, offer price with validity, full price history | `/prices` |
| Customers: registration, VIP tag, per-customer discount, loyalty points, purchase history | `/customers` |
| Udhar/Credit: khata ledger, partial payments, WhatsApp reminders | `/credit` |
| Suppliers & purchases: PO create → receive (auto stock-in) → payments, supplier balance | `/suppliers` |
| Reports: sales/P&L, daily trend, category & payment split, top/slow products, stock, expiry, GST, staff performance, period comparison; export PDF/Excel/CSV | `/reports` |
| Offers: BOGO, % off, combo, happy-hour, festival, coupon codes | `/offers` |
| Barcode label printing (batch stickers: name+price+barcode+expiry) | `/labels` |
| Users/roles, PIN login, shifts (opening/closing cash), activity audit log | `/admin` |
| Multi-store branches + stock transfer; store switcher in topbar | `/stores` |
| Online orders (public customer page, home delivery, order tracking) | `/shop` |
| Notifications center (low stock, expiry 30/15/7, udhar) | `/notifications` |
| Settings: store profile, receipt width, GST default, loyalty, backup/restore, SMTP email | `/settings` |
| Hindi + English UI, dark mode, PWA install, sound beeps, keyboard shortcuts (F1 new, F2 hold, F3 pay, F4 search, F9 theme) | everywhere |

### Barcode scanning details
- **Hardware USB scanner**: kisi bhi POS screen par scan karo — keyboard-wedge input auto-pakda jaata hai (Enter = add to cart, beep sound).
- **Camera**: POS → "Scan" button (EAN-13, EAN-8, UPC-A, Code-128, QR).
- Unknown barcode = error buzz + product search me code pre-fill (manual add kar sakte ho).
- Loose items (dal/sabzi): weigh-mode — weight daalo, price auto-calc.

---

## 🐳 Docker / deploy

```bash
cd kirana-store
docker compose up --build      # frontend + backend + mongo
```

- **Railway/Render**: backend repo deploy karo, env me `MONGODB_URI`, `JWT_SECRET`; frontend build static serve hota hai backend se (`frontend/dist`), ya Vercel par frontend alag se + `VITE_API_URL`.
- **Vercel (frontend)**: build command `npm run build`, output `dist`, env `VITE_API_URL=https://api-yourapp.up.railway.app`.
- GitHub Actions CI (`/.github/workflows/kirana-ci.yml`) har push par build check karta hai.

## 📁 Repo structure

```
kirana-store/
├── backend/            # Express REST API + Socket.IO + Mongoose/embedded DB
│   └── src/{routes,services,db,middleware}
├── frontend/           # React + Redux Toolkit + Tailwind + Recharts + PWA
│   └── src/{pages,components,store.js,i18n.js}
├── docker-compose.yml
└── README.md
```

## 🔐 Security
JWT auth + role guards (admin/manager/cashier), bcrypt hashes, price-edit double lock (role + 10-min price token), rate-limited login, helmet/CORS, session idle timeout, audit log, JSON backup/restore.
