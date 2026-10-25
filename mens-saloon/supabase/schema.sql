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
