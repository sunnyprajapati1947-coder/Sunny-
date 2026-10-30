# 🛒 Dukaan Dost — Kirana Billing & Inventory PWA

A production-ready, **mobile-first** billing + inventory app for Indian kirana / general stores.

- **Hindi + English + Hinglish** UI toggle (Hinglish is the default, like shopkeepers talk)
- **Offline-first** — IndexedDB is the source of truth, Supabase syncs automatically when the internet returns
- **Camera barcode scanning** (native `BarcodeDetector` → ZXing fallback) + **USB/Bluetooth scanner** support
- **Price security** — prices come from the database, cashiers cannot change them, every discount/void/price edit needs the owner PIN and lands in an audit log
- **Thermal receipts** (58 mm / 80 mm), PDF, WhatsApp share, dynamic UPI QR
- **Khata / udhaar**, purchases, stock audit, order lists, GST + P&L + day-close reports

```
React 18 · Vite 5 · TypeScript · Tailwind 3 · Dexie (IndexedDB) · Supabase (Postgres + Auth + RLS) · vite-plugin-pwa · Vercel
```

---

## 1. Quick start (60 seconds, no backend needed)

```bash
cd kirana
npm install
npm run dev          # http://localhost:5173
```

With **no `.env` file** the app boots into a fully seeded demo shop
(“Sharma Kirana Store” — 33 products, 14 days of bills, customers with udhaar, offers).
Everything works offline: billing, scanning, receipts, khata, reports.

> Tip: the demo shop’s owner can be unlocked with any PIN you set on first use.
> Open **More → Demo data → Reset demo data** to start over.

### Add Supabase (cloud, auth, multi-device)

```bash
cp .env.example .env.local
# VITE_SUPABASE_URL=https://xxxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...
npm run dev
```

Then follow **[docs/SETUP.md](docs/SETUP.md)** (run the three SQL migrations, create the
storage bucket, enable email auth). Deploy with **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## 2. Feature map

### Billing / POS (`/billing`)
- Camera stays ready; a successful scan beeps + vibrates and auto-adds the item
- Scanning the same barcode again **increases the quantity**
- Unknown barcode → “naya product add karein?” → product form pre-filled with the barcode
- Hindi/English name search, **Hindi voice search** (“do kilo chawal”), quick-add chips of
  the 6 most-sold items
- Loose items (dal/chawal/sugar): enter **grams or kg** with a big keypad
- Live totals: subtotal, GST, discount, **grand total in 3xl type**, round-off
- Cash (**change calculator**, quick notes), UPI (**dynamic QR with the exact amount**),
  Card, Udhaar, and **split payments**
- **Hold/resume** any number of customer carts; **undo** the last scanned item
- Receipt: thermal print window (58/80 mm), PDF, share sheet, WhatsApp text (Hindi)

### Price security (the part that matters)
| Rule | Enforced in |
| --- | --- |
| Selling price always re-read from the DB at checkout | `finalizeBill()` re-reads products, ignores cart prices |
| Cashier/manager cannot change prices | `saveProduct()` role check + SQL trigger `guard_product_prices` |
| Only the owner edits prices, after **PIN / fingerprint** | `OwnerGate` + `requestApproval()` + trigger |
| Discount only with owner PIN, capped by `max_discount_percent` | `DiscountSheet`, `finalizeBill`, SQL trigger `guard_bill_amounts` |
| Every price change / discount / void / stock edit is audited | `audit_logs` (append-only, actor-stamped, RLS: owner reads) |
| Finalized bills are immutable; returns are new entries | client `voidBill`/`returnBillItems` + SQL `guard_bill_immutability` |
| Roles: Owner / Manager / Cashier | `lib/permissions.ts`, RLS policies, `shop_role()` |

### Product master (`/products`)
Barcode, Hindi + English names, category, brand, unit (`kg/g/pcs/litre/ml/packet/dozen/box`),
purchase price, selling price, MRP, GST %, stock, low-stock limit, expiry, photo
(compressed on-device before upload).
Bulk **Excel/CSV import + export** with a downloadable template, duplicate detection,
auto-created categories.

### Inventory (`/inventory`)
- Stock auto-reduces on sale, auto-increases on purchase (with a `stock_movements` ledger)
- Low-stock list, expiry alerts (**30 / 15 / 7 days**, expired), **dead stock** (30 days no sale)
- **Purchase entry** from suppliers with scan-to-add, cost per unit, part payment → supplier ledger
- **Stock audit mode**: scan → count → diff vs system → apply adjustments
- **Order list** of low-stock items, shareable on WhatsApp to the supplier

### Khata (`/khata`)
Customer ledger (name, phone, dues, payment history, loyalty points), credit limit per
customer, udhaar on a bill, repayments, WhatsApp/SMS reminders in Hindi.

### Reports (`/reports`)
Today’s sales, profit, bills, cash vs UPI split, top sellers, category split, hourly bars,
daily/weekly/monthly/custom ranges, **GST rate-wise summary (GSTR-ready)**, **P&L**,
**day-end cash closing with mismatch**, **Excel + PDF export**.

### Extras
Dark mode, large-text mode, Hindi voice search, loyalty points, owner-created offers
(BOGO / combo / % / flat, auto-applied), cloud backup, multi-device sync, multi-shop-ready
schema, installable PWA, confirmations before deletes, undo, beep + vibration on scan.

---

## 3. Folder structure

```
kirana/
├── public/                     icons + favicon (PWA)
├── supabase/migrations/
│   ├── 0001_init.sql           tables, indexes, views
│   ├── 0002_rls.sql            row-level security + storage policies + realtime
│   └── 0003_guards.sql         triggers: price lock, discount cap, bill immutability…
├── docs/
│   ├── SETUP.md                Supabase project walkthrough
│   ├── DEPLOYMENT.md           Vercel + custom domain + release checklist
│   └── ARCHITECTURE.md         offline sync, money model, security layers
├── src/
│   ├── components/
│   │   ├── billing/            ScanPanel, ProductSearch, CartList, CheckoutSheet,
│   │   │                       BillSuccessSheet, DiscountSheet
│   │   ├── customers/          CustomerPicker
│   │   ├── layout/             AppShell (header, bottom nav, sync pill)
│   │   ├── security/           OwnerGate (PIN / biometric re-auth)
│   │   └── ui/                 Button, Card, Sheet, Form, Toast, Confirm…
│   ├── context/                AppContext (session/prefs/PIN), CartContext (POS state)
│   ├── data/                   repositories: audit, billing, khata, products,
│   │                           purchases, reports  (+ tests)
│   ├── hooks/                  useBarcodeScanner, useKeyboardScanner, useOnline, useLive
│   ├── i18n/                   translations (hinglish/hi/en) + useT()
│   ├── lib/                    db (Dexie), sync engine, money, offers, receipt, pdf,
│   │                           spreadsheet, upi, barcode, voice, permissions, seed…
│   ├── pages/                  Home, Billing, Products, ProductForm, Khata,
│   │                           CustomerDetail, Reports, GST, P&L, DayClose, Inventory,
│   │                           StockAudit, OrderList, Purchases, PurchaseForm, Bills,
│   │                           BillDetail, ShopSettings, AuditLog, More, Login
│   ├── test/                   fixtures + fake-indexeddb setup
│   ├── App.tsx                 routes + providers
│   └── main.tsx                PWA registration
├── vercel.json                 SPA rewrites + cache headers
└── vite.config.ts              PWA manifest, workbox, chunking
```

---

## 4. Phases

| Phase | Scope | Status |
| --- | --- | --- |
| **1** | Products + scan billing (POS, cart, receipts, offline) | ✅ delivered |
| **2** | Security/roles (PIN, biometric, audit, immutable bills, RLS) | ✅ delivered |
| **3** | Inventory + purchases (stock ledger, suppliers, audit, order list) | ✅ delivered |
| **4** | Khata (credit limit, ledger, reminders) | ✅ delivered |
| **5** | Reports (dashboard, GST, P&L, day close, exports) | ✅ delivered |

Everything above is implemented and covered by tests. The build can be reviewed phase by
phase — see `docs/ARCHITECTURE.md` for where each concern lives.

---

## 5. Scripts

```bash
npm run dev         # dev server on 0.0.0.0:5173
npm run build       # tsc -b && vite build → dist/ (+ service worker)
npm run preview     # serve the production build
npm test            # vitest: money, offers, billing, products, khata, reports, sync
npm run typecheck   # strict TypeScript, zero errors
```

**Test coverage highlights** (`npm test`, 107 tests):

- money math: inclusive/exclusive GST, proportional discounts, round-off, negative formats
- offers: BOGO, flat, %, combo, date windows, inactive
- billing: **tampered cart price is ignored**, cashier discount rejected, owner discount
  cap, payment shortfall, change, split payments, udhaar credit limit, loyalty points
- products: barcode uniqueness, opening stock movement, price-change approvals, audit diffs
- khata: repayments, over-collection guard, credit limits, reminders
- purchases: stock increase, landed cost, supplier credit balance, payments, audit trail
- stock audit: counted vs system diff, applied vs dry-run, no duplicate counts
- order list: reorder quantity maths and WhatsApp text
- reports: dashboard, ranges, GST split, P&L/COGS, day close, dead stock, shop isolation
- sync: outbox ordering, offline no-op, and **every** write queued for upload
  (bills, lines, payments, stock, khata, purchases, supplier payments)
- security: role matrix, PBKDF2 PIN hashing (salted, legacy upgrade), PIN reset

---

## 6. Known limits (honest list)

- **GST filing** — the GST report gives rate-wise B2C numbers for your CA; filing itself
  needs a GSP/CA (no direct GSTN API integration).
- **SMS reminders** open the phone’s SMS composer (`sms:` link) — no paid SMS gateway.
- **Biometric unlock** uses WebAuthn platform authenticators (Android Chrome / iOS 16+);
  it is an *additional* gate on top of the PIN, and falls back to the PIN everywhere.
- **Devanagari on thermal paper** depends on the printer’s code page; the 58/80 mm print
  window uses Devanagari, the ESC/POS text fallback uses English item names.
- **Stock value** is computed from the app’s `stock_qty`; `stock_movements` is a ledger for
  audit/reconciliation (`product_stock_view` shows any drift).
- **Profit** = bill value − cost price recorded at sale time. GST is pass-through, not profit.

---

## 7. Licence / credits

Built for this repository as a standalone app. Fonts: Mukta, Baloo 2, Noto Sans Devanagari
(Google Fonts). Icons: [Lucide](https://lucide.dev). Made for the shop around the corner. 🏪
