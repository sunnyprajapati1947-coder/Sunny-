# Architecture notes

## 1. Offline-first data flow

```
UI  ──►  repository (src/data/*)  ──►  Dexie write  ──►  outbox row
               │                          │                 │
               │  business rules          │ source of       │ replay when online
               │  (roles, audit, stock)   │ truth on device │
               ▼                          ▼                 ▼
          audit_logs / movements     IndexedDB          Supabase (RLS)
                                                            │
                                      pull (cursor + LWW) ◄─┘
```

- **Every read** comes from IndexedDB (`useLiveQuery`), so screens never wait for the network.
- **Every write** happens in a Dexie transaction and appends to `outbox` (`++seq`).
- `SyncManager` (src/lib/sync.ts) pushes the outbox in order, then pulls rows changed since a
  per-table cursor. Conflicts are last-write-wins on the record timestamp.
- Rejected rows never block the queue: they retry twice, then are dropped with an error state
  surfaced in the header (“Sync failed”).
- Triggers on the server (`syncNow` every 30 s, `online`, tab focus, after each write).

### Held bills are device-local
A half-finished cart is meaningless on another phone, and the server forbids deleting bills.
`holdBill()` writes only to IndexedDB and its cart snapshot lives in `meta` (`hold:<id>`).

### Table timestamps
`updated_at` exists on shops, products, customers, bills, suppliers, purchases, offers,
stock audits. Child tables (bill_items, payments, stock_movements, ledger_entries,
audit_logs, purchase_items, stock_audit_items, categories) use `created_at`; the sync
engine maps this per table (`TIMESTAMP_COLUMN`).

## 2. Money model

- All amounts are **integer paise** (`toPaise` / `formatPaise` in `lib/money.ts`).
- Quantities are `numeric(12,3)` — a loose item can be `0.25 kg`.
- `shop.prices_include_gst` selects inclusive (MRP-style) or exclusive tax maths.
- Discounts are spread **proportionally across lines** before tax, so a ₹20 discount on a
  mixed 5% / 18% bill produces the correct GST (see `computeTotals` tests).
- Totals are rounded to the rupee at the end (`round_off_paise` keeps the books honest).
- Loyalty: 1 point per ₹100 spent, 1 point = ₹1, redeem up to 10% of the bill.

## 3. Security layers

| Layer | File | Purpose |
| --- | --- | --- |
| UI gating | `lib/permissions.ts` | hides actions a role cannot perform |
| Approval gate | `components/security/OwnerGate.tsx`, `requestApproval()` | PIN (PBKDF2-SHA256, 120k iterations, per-device salt) or WebAuthn fingerprint before money-sensitive actions |
| Repository checks | `data/billing.ts`, `data/products.ts`, `data/khata.ts` | reject cashier price/discount edits even if the UI is bypassed |
| Server RLS | `supabase/migrations/0002_rls.sql` | membership/role via `shop_role()`, per-table policies |
| Server triggers | `0003_guards.sql` | price lock, manual-discount ownership, discount cap, immutability, role escalation guard, append-only audit/ledger |
| Audit trail | `data/audit.ts` | who / when / old value / new value for every price, discount, void, stock edit |

The client can be inspected and modified; the server checks are the real boundary.

### Why a PIN *and* RLS?
RLS answers “may this account do it at all?”. A manager is allowed to edit a product row,
but not its price. The PIN answers “is the owner standing at the counter right now?” — a
one-off, human confirmation for a specific action (e.g. a ₹40 discount). The approval is
timestamped and written to the audit log.

## 4. Barcode input paths

1. **Native `BarcodeDetector`** — Chrome/Edge/Android, decodes from the `<video>` element
   every animation frame. Cheapest on battery.
2. **ZXing** (`@zxing/browser`) — iOS Safari and Firefox. Same `<video>`, different decoder.
3. **Keyboard-wedge scanner** — `listenKeyboardScanner()` buffers fast keystrokes and fires
   on `Enter`; works with USB and Bluetooth scanners, and never steals typing in inputs
   unless `data-scan-listener="true"`.

Successful scans beep (WebAudio) and vibrate. Unknown barcodes open “add product” with the
code pre-filled; known ones open the product for editing (Products screen) or add to the
cart (Billing screen).

## 5. Receipts

- `receiptText()` → plain text for WhatsApp/SMS and ESC/POS printers (width-aware, 32/48 cols).
- `printReceipt()` → an isolated print window with `@page size: 58mm/80mm` and Devanagari fonts.
- `receiptPdf()` → jsPDF roll-format PDF (English labels: PDF core fonts cannot embed
  Devanagari; the on-screen receipt and print window keep Hindi).
- UPI QR = NPCI deep link `upi://pay?pa=…&am=<exact amount>&cu=INR` rendered with `qrcode`.
  The amount is embedded, so the customer cannot key in a different value.

## 6. Reports

- `getDashboard()` — today/yesterday/month totals, payment split, top items, category split,
  low stock, 30-day expiry, pending udhaar, hourly bars.
- `getRangeSnapshot()` — daily series, top items, categories for any range.
- `getGstReport()` — rate-wise taxable value + CGST/SGST split + B2C invoice rows.
- `getPnl()` — revenue, COGS from `bill_items.cost_paise` (cost at sale time), gross margin.
- `getDayClose()` — cash sales + cash repayments − cash purchases = expected drawer cash.
- `getDeadStock()` — stock with no sale in N days, valued at cost.

## 7. Testing

`npm test` (Vitest) covers the risky parts rather than the pixels. Repository tests run in
Node against fake-indexeddb; `src/test/*.smoke.test.tsx` run the whole app in jsdom
(real providers, router, lazy pages, test-only fixtures) to prove every screen paints and that
quick-add → cart → payment sheet works:

```bash
npm test          # everything (147 tests)
npm run test:ui   # jsdom screens only
```

- money rounding/GST/discount maths
- role matrix and PIN hashing (no plain PIN on disk, legacy hashes upgraded)
- offer engine (BOGO/flat/%/combo/date window)
- **tampered cart price is ignored at checkout**
- cashier discount rejected; owner discount needs approval and respects the cap
- stock decrement + movement ledger; void restores stock; partial returns
- credit limit enforcement and khata ledger
- reports: dashboard, GST split, P&L, day close, dead stock, shop isolation
- outbox ordering and graceful no-op without Supabase
- print receipts: no line wider than 58 mm, HTML escaping, 80 mm table variant
- bill numbering continues from the highest number already stored for today (a
  device-local counter collided after a reinstall or on a second phone)

Note: completing a bill inside jsdom deadlocks fake-indexeddb when React flushes effects
mid-transaction, so the checkout test stops at the payment sheet; the money path is covered
by `src/data/billing.test.ts`.

## 8. Extending

- **New role or permission** → add to `PERMISSIONS` in `lib/permissions.ts`, then mirror the
  rule in the RLS policy (and a trigger if it touches money).
- **New sync table** → add it to `src/types.ts` (`SyncTable`), `db.ts` schema (version bump),
  `sync.ts` table lists + stamp column, and a migration with RLS.
- **New report** → add a function in `data/reports.ts` returning plain numbers, then a page
  that renders and exports it (Excel via `xlsx`, PDF via `lib/reportPdf.ts`).
- **Another language** → extend `i18n/translations.ts`; every UI string is a typed key.
