# Deployment — Vercel + Supabase

## 1. One-time Vercel setup

Because this repository also contains other projects, deploy **`kirana/` as the project
root** (Vercel cannot guess the subfolder).

### Option A — Vercel dashboard (easiest)

1. **Add New → Project → Import** `sunnyprajapati1947-coder/Sunny-`.
2. **Root Directory**: `kirana` → *Edit* → select `kirana`.
3. Framework preset: **Vite** (auto-detected). Build `npm run build`, output `dist`.
4. **Environment Variables** (Production + Preview):

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `eyJ...` (anon public key) |

5. **Deploy**. First build ≈ 60 s.

### Option B — CLI

```bash
npm i -g vercel
cd kirana
vercel link                 # create/link the project
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel --prod
```

`kirana/vercel.json` already contains:

- SPA rewrite to `index.html` (React Router deep links like `/bills/xyz` work on refresh)
- `sw.js` served with `max-age=0` so updates roll out immediately
- `/assets/*` immutable caching
- camera/microphone permissions policy for the current origin

## 2. Post-deploy checklist

- [ ] `https://<app>.vercel.app` loads the shop setup screen (empty app) without env vars
- [ ] Camera scanning works (HTTPS is required by the browser)
- [ ] Add `https://<app>.vercel.app/**` to Supabase **Auth → URL configuration**
- [ ] Sign up → shop created → product saved → visible in Supabase table editor
- [ ] Install on Android: Chrome → ⋮ → **Add to home screen**; iOS: Share → **Add to Home Screen**
- [ ] Airplane mode test: bill saves, badge shows *offline*, syncs when back online
- [ ] Receipt print: pair the Bluetooth thermal printer in Android settings first
- [ ] Owner PIN set (Settings → Owner PIN), then try a discount to confirm the gate
- [ ] UPI QR scans correctly from GPay/PhonePe with the exact amount

## 3. Custom domain

Vercel → Project → **Settings → Domains** → add `billing.yourshop.in` → add the shown
CNAME at your registrar. Then update the Supabase Site URL / redirect list.

## 4. Updates & rollbacks

Every push to the branch triggers a preview deploy; merging to `main` deploys production.
The service worker is `autoUpdate`, so shop phones pick up the new build on next launch.

To roll back: Vercel → **Deployments** → previous deployment → **Promote to Production**.

## 5. Backups

- **Cloud**: Supabase → Database → Backups (daily on paid plans; use `pg_dump` on free).
- **Per device**: More → **Download backup file** exports the entire local IndexedDB as JSON.
- **Excel**: Products page → Export, Reports → Excel for books.

## 6. Cost notes (small shop)

| Item | Plan |
| --- | --- |
| Vercel Hobby | free (static PWA) |
| Supabase Free | 500 MB DB, 1 GB storage, 50k MAU — plenty for a kirana |
| Domain | optional, ~₹800/year |

A single shop writes a few MB per year (a bill with 4 items ≈ 2 KB), so the free tier lasts
a long time. Product photos are the main storage user; they are compressed to ~40 KB.

## 7. Security checklist for going live

- [ ] `service_role` key never appears in the frontend or the repo (only `anon`)
- [ ] All three migrations applied (RLS is what stops a cashier from editing prices)
- [ ] Owner PIN set on every device that bills
- [ ] Supabase → Auth → **Leaked password protection** enabled
- [ ] Staff accounts use individual emails (so audit logs name the right person)
- [ ] `.env.local` is git-ignored (it is) and never committed
