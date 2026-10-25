-- ============================================================
--  MEN'S SALOON — cloud database schema (Supabase / Postgres)
--  Project: mens-saloon-bookings (ap-south-1)
--
--  Data yahan store hota hai:
--    public.bookings        -> har website form-booking
--    public.admin_settings  -> Shop Panel PIN (bcrypt hash)
--
--  Security:
--    * RLS ON. Public (anon key) sirf INSERT kar sakta hai.
--    * Table direct koi NAHI padh sakta.
--    * my_bookings(phone)      -> sirf usi number ki history
--    * admin_bookings(pin)     -> sahi PIN par hi pura record
--    * admin_set_status(...)   -> sahi PIN par hi status change
--    * admin_change_pin(...)   -> purane PIN se naya PIN
--
--  Dobara setup karna ho to Supabase SQL editor me ye file
--  chalao — sirf neeche wali PIN value apni rakh lena.
--  (Asli PIN sirf database me hash bankar rehta hai,
--   is repo/code me kahin NAHI likha gaya.)
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 80),
  phone text not null check (char_length(regexp_replace(phone,'\D','','g')) between 10 and 15),
  service text not null check (char_length(service) between 2 and 120),
  price int,
  appt_date date,
  appt_time text check (char_length(coalesce(appt_time,'')) <= 20),
  notes text check (char_length(coalesce(notes,'')) <= 500),
  status text not null default 'pending' check (status in ('pending','confirmed','done','cancelled'))
);
create index if not exists bookings_phone_idx on public.bookings (phone);
create index if not exists bookings_date_idx on public.bookings (appt_date);
alter table public.bookings enable row level security;
drop policy if exists "public can book" on public.bookings;
create policy "public can book" on public.bookings
  for insert to anon, authenticated with check (status = 'pending');

create table if not exists public.admin_settings (
  id int primary key,
  pin_hash text not null
);
alter table public.admin_settings enable row level security;
insert into public.admin_settings (id, pin_hash)
values (1, extensions.crypt('CHANGE_ME_ADMIN_PIN', extensions.gen_salt('bf')))
on conflict (id) do nothing;

create or replace function public.norm_phone(p text) returns text language sql immutable as $$
  select case when regexp_replace(coalesce(p,''),'\D','','g') ~ '^91\d{10}$'
    then substr(regexp_replace(coalesce(p,''),'\D','','g'),3)
    else regexp_replace(coalesce(p,''),'\D','','g') end
$$;

create or replace function public.my_bookings(p_phone text)
returns setof public.bookings language sql security definer set search_path = public as $$
  select * from public.bookings
  where length(public.norm_phone(p_phone)) = 10
    and public.norm_phone(phone) = public.norm_phone(p_phone)
  order by appt_date desc nulls last, created_at desc
  limit 100;
$$;

create or replace function public.admin_bookings(p_pin text)
returns setof public.bookings language sql security definer set search_path = public, extensions as $$
  select * from public.bookings
  where exists (select 1 from public.admin_settings where id = 1 and pin_hash = crypt(coalesce(p_pin,''), pin_hash))
  order by appt_date asc nulls last, created_at desc
  limit 500;
$$;

create or replace function public.admin_set_status(p_pin text, p_id uuid, p_status text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public.admin_settings where id = 1 and pin_hash = crypt(coalesce(p_pin,''), pin_hash)) then return false; end if;
  if p_status not in ('pending','confirmed','done','cancelled') then return false; end if;
  update public.bookings set status = p_status where id = p_id;
  return found;
end $$;

create or replace function public.admin_change_pin(p_old text, p_new text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public.admin_settings where id = 1 and pin_hash = crypt(coalesce(p_old,''), pin_hash)) then return false; end if;
  if char_length(coalesce(p_new,'')) < 4 or char_length(p_new) > 32 then return false; end if;
  update public.admin_settings set pin_hash = crypt(p_new, gen_salt('bf')) where id = 1;
  return true;
end $$;

grant execute on function public.my_bookings(text) to anon, authenticated;
grant execute on function public.admin_bookings(text) to anon, authenticated;
grant execute on function public.admin_set_status(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_change_pin(text, text) to anon, authenticated;

-- ============================================================
--  LIVE SITE CONFIG (auto-update system)
--  site_services : price-list jo website/app par dikhti hai.
--                  Public sirf padh sakta hai; badlav sirf
--                  admin_save_services(pin, items) se.
--  site_settings : {announcement, closed_today,
--                   closed_message, season_auto} — owner
--                  Shop Panel se badalta hai, site turant
--                  update ho jati hai (bina redeploy).
--  Poori SQL ke liye git history / Supabase dashboard dekho —
--  tables: public.site_services, public.site_settings
--  RPCs:   public.admin_save_services(text, jsonb),
--          public.admin_save_settings(text, jsonb)
-- ============================================================

-- ============================================================
--  PRO LIVE SYSTEM
--  slot_rush(date)        -> har slot ki booking ginti (sirf
--                            count — bheed-meter ke liye, koi
--                            personal data public nahi hota)
--  admin_customers(pin)   -> customers ka pura online record:
--                            phone, naam, kitni baar aaye,
--                            last visit, done par kul kamai
-- ============================================================
create or replace function public.slot_rush(p_date date)
returns table(appt_time text, bookings int)
language sql security definer set search_path = public as $$
  select appt_time, count(*)::int from public.bookings
  where appt_date = p_date and status <> 'cancelled' and appt_time is not null
  group by appt_time;
$$;
grant execute on function public.slot_rush(date) to anon, authenticated;

create or replace function public.admin_customers(p_pin text)
returns table(phone text, name text, visits int, last_date date, total_spent int)
language sql security definer set search_path = public, extensions as $$
  select public.norm_phone(b.phone),
         (array_agg(b.name order by b.created_at desc))[1],
         count(*)::int, max(b.appt_date),
         coalesce(sum(case when b.status = 'done' then coalesce(b.price,0) else 0 end), 0)::int
  from public.bookings b
  where exists (select 1 from public.admin_settings where id = 1 and pin_hash = crypt(coalesce(p_pin,''), pin_hash))
    and b.status <> 'cancelled'
  group by public.norm_phone(b.phone)
  order by visits desc, last_date desc nulls last limit 200;
$$;
grant execute on function public.admin_customers(text) to anon, authenticated;
