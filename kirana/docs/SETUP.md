# Setup — Supabase + local development

The app runs fully offline with the demo shop and **no backend**. Follow this guide to turn
on cloud sync, real auth and multi-device login.

Estimated time: 10–15 minutes.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Pick the region closest to your shop (for India: `ap-south-1` Mumbai or `ap-southeast-1`).
3. Save the database password somewhere safe (you rarely need it, but keep it).

## 2. Run the SQL migrations (in order)

Open **SQL Editor → New query** and run these files from `supabase/migrations/`:

| # | File | What it creates |
| --- | --- | --- |
| 1 | `0001_init.sql` | 18 tables, indexes, `product_stock_view`, `daily_sales_view` |
| 2 | `0002_rls.sql` | helper functions, RLS policies, storage bucket + policies, realtime |
| 3 | `0003_guards.sql` | triggers (price lock, discount cap, immutability, role guard…), `create_shop_for_current_user()` |

Or with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push          # applies supabase/migrations/*.sql
```

Verify quickly:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;      -- every row should have rowsecurity = true
```

## 3. Auth settings

**Authentication → Providers → Email**

- Keep **Email provider** enabled.
- For a fast shop setup you can disable “Confirm email” (an OTP-less flow means the
  owner can log in on both phones immediately). For a public deployment keep it on.
- **URL configuration**
  - Site URL: `https://your-app.vercel.app`
  - Additional redirect URLs: `http://localhost:5173/**`, `https://your-app.vercel.app/**`

The first sign-up creates the shop + owner profile via
`public.create_shop_for_current_user()` (or the two inserts the app performs).

### Adding a cashier or manager

```sql
-- 1. Create the user in Authentication → Users → Add user (email + password)
-- 2. Attach them to your shop:
insert into public.shop_members (shop_id, user_id, role)
values ('<shop-id>', '<user-id>', 'cashier');   -- or 'manager'

update public.profiles
set shop_id = '<shop-id>', role = 'cashier', full_name = 'Ramesh (counter)'
where id = '<user-id>';
```

Cashiers can bill and collect khata. Managers can also add/edit products, do purchases,
stock adjustments and see reports — but **cannot** change prices, give discounts, void
bills, see profit or read the audit log.

## 4. Storage bucket

Migration `0002` creates the public bucket `product-images` with policies that only allow
owner/manager writes inside their own `shop_id/` folder. Nothing else to configure.

## 5. Environment variables

```bash
cd kirana
cp .env.example .env.local
```

```ini
VITE_SUPABASE_URL=https://abcdefghijkl.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Both values are under **Project Settings → API**. The `anon` key is safe in the browser —
RLS is what protects the data. **Never** put the `service_role` key in the frontend.

Restart `npm run dev`. The login screen now appears instead of the demo shop.

## 6. Verify cloud sync

1. Sign up (email + password) → the app asks for your shop name → dashboard appears.
2. Add a product (Products → +).
3. Open **More → Sync now**: it should report `1 pushed`.
4. In Supabase → **Table editor → products**, the row is there with your `shop_id`.
5. Log in on a second phone/browser with the same account: the product appears.
6. Turn on airplane mode, create a bill — it saves locally, shows `offline · 1 pending`.
   Turn the network back on: it syncs by itself (also every 30 s and on tab focus).

## 7. Optional: seed a demo shop in the cloud

The demo data lives in the client (`src/lib/seed.ts`) so it works offline. To give a
salesperson a cloud sandbox, create a separate Supabase project and simply use the app’s
“Try the demo shop” button there — nothing is written to the cloud in demo mode.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| “Cloud not configured” on the login screen | `.env.local` missing or dev server not restarted |
| `permission denied for table bills` | migration 0002 not applied (RLS helpers missing) |
| `Manual discount requires the shop owner` | expected — the logged-in profile is not `owner` in `shop_members`/`profiles` |
| Sync stuck at “1 pending” | open More → Sync now; a permanent error is shown in red. Check RLS role |
| Camera does not open on iPhone | iOS requires HTTPS (works on Vercel) and a user gesture; tap **Start camera** |
| Barcode not detected | use good light, hold 15–20 cm away, or type the number in the manual field |
