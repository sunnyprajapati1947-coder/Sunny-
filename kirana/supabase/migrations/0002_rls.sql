-- ============================================================================
-- Dukaan Dost — 0002_rls.sql
-- Row Level Security. The client is untrusted: every policy below is written
-- assuming a cashier could call the REST API directly with their JWT.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER avoids recursive RLS on shop_members/profiles)
-- ---------------------------------------------------------------------------
create or replace function public.is_shop_member(target_shop uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shop_members m
    where m.shop_id = target_shop
      and m.user_id = auth.uid()
      and m.is_active
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = target_shop
      and p.is_active
  );
$$;

create or replace function public.shop_role(target_shop uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select m.role
      from public.shop_members m
      where m.shop_id = target_shop and m.user_id = auth.uid() and m.is_active
      limit 1
    ),
    (
      select p.role
      from public.profiles p
      where p.id = auth.uid() and p.shop_id = target_shop and p.is_active
      limit 1
    )
  );
$$;

create or replace function public.is_owner(target_shop uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.shop_role(target_shop) = 'owner';
$$;

create or replace function public.is_manager_or_owner(target_shop uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.shop_role(target_shop) in ('owner','manager');
$$;

grant execute on function public.is_shop_member(uuid) to authenticated;
grant execute on function public.shop_role(uuid) to authenticated;
grant execute on function public.is_owner(uuid) to authenticated;
grant execute on function public.is_manager_or_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.shops             enable row level security;
alter table public.profiles          enable row level security;
alter table public.shop_members      enable row level security;
alter table public.categories        enable row level security;
alter table public.products          enable row level security;
alter table public.customers         enable row level security;
alter table public.bills             enable row level security;
alter table public.bill_items        enable row level security;
alter table public.payments          enable row level security;
alter table public.stock_movements   enable row level security;
alter table public.stock_audits      enable row level security;
alter table public.stock_audit_items enable row level security;
alter table public.suppliers         enable row level security;
alter table public.purchases         enable row level security;
alter table public.purchase_items    enable row level security;
alter table public.ledger_entries    enable row level security;
alter table public.offers            enable row level security;
alter table public.audit_logs        enable row level security;

-- ---------------------------------------------------------------------------
-- shops
-- ---------------------------------------------------------------------------
drop policy if exists shops_select on public.shops;
create policy shops_select on public.shops
  for select to authenticated
  using (public.is_shop_member(id));

drop policy if exists shops_insert on public.shops;
create policy shops_insert on public.shops
  for insert to authenticated
  with check (true); -- any authenticated user may open their own shop

drop policy if exists shops_update on public.shops;
create policy shops_update on public.shops
  for update to authenticated
  using (public.is_owner(id))
  with check (public.is_owner(id));

drop policy if exists shops_delete on public.shops;
create policy shops_delete on public.shops
  for delete to authenticated
  using (public.is_owner(id));

-- ---------------------------------------------------------------------------
-- profiles & shop_members
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_owner(shop_id));

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_owner(shop_id))
  with check (id = auth.uid() or public.is_owner(shop_id));

drop policy if exists shop_members_select on public.shop_members;
create policy shop_members_select on public.shop_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_owner(shop_id));

drop policy if exists shop_members_insert on public.shop_members;
create policy shop_members_insert on public.shop_members
  for insert to authenticated
  with check (user_id = auth.uid() or public.is_owner(shop_id));

drop policy if exists shop_members_update on public.shop_members;
create policy shop_members_update on public.shop_members
  for update to authenticated
  using (public.is_owner(shop_id))
  with check (public.is_owner(shop_id));

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to authenticated using (public.is_shop_member(shop_id));

drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories
  for all to authenticated
  using (public.is_manager_or_owner(shop_id))
  with check (public.is_manager_or_owner(shop_id));

drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select to authenticated using (public.is_shop_member(shop_id));

-- Managers can add/edit products; price columns are protected by a trigger (0003).
drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert to authenticated
  with check (public.is_manager_or_owner(shop_id));

drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update to authenticated
  using (public.is_manager_or_owner(shop_id))
  with check (public.is_manager_or_owner(shop_id));

-- Hard delete only by owner; cashiers/managers should deactivate instead.
drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete to authenticated using (public.is_owner(shop_id));

-- ---------------------------------------------------------------------------
-- Customers & ledger
-- ---------------------------------------------------------------------------
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated using (public.is_shop_member(shop_id));

drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert to authenticated with check (public.is_shop_member(shop_id));

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update to authenticated
  using (public.is_shop_member(shop_id))
  with check (public.is_shop_member(shop_id));

drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers
  for delete to authenticated using (public.is_owner(shop_id));

drop policy if exists ledger_select on public.ledger_entries;
create policy ledger_select on public.ledger_entries
  for select to authenticated using (public.is_shop_member(shop_id));

drop policy if exists ledger_insert on public.ledger_entries;
create policy ledger_insert on public.ledger_entries
  for insert to authenticated with check (public.is_shop_member(shop_id));

-- Ledger rows are immutable; corrections are new entries.
drop policy if exists ledger_update on public.ledger_entries;
create policy ledger_update on public.ledger_entries
  for update to authenticated using (public.is_owner(shop_id));

-- ---------------------------------------------------------------------------
-- Bills
-- ---------------------------------------------------------------------------
drop policy if exists bills_select on public.bills;
create policy bills_select on public.bills
  for select to authenticated using (public.is_shop_member(shop_id));

drop policy if exists bills_insert on public.bills;
create policy bills_insert on public.bills
  for insert to authenticated with check (public.is_shop_member(shop_id));

-- Only the owner may update a bill row (void/refund); amounts are frozen by
-- trigger in 0003 for everyone except an owner void transition.
drop policy if exists bills_update on public.bills;
create policy bills_update on public.bills
  for update to authenticated
  using (public.is_owner(shop_id))
  with check (public.is_owner(shop_id));

-- Bills are never deleted; they are voided so the paper trail survives.
drop policy if exists bills_delete on public.bills;
create policy bills_delete on public.bills
  for delete to authenticated using (false);

drop policy if exists bill_items_select on public.bill_items;
create policy bill_items_select on public.bill_items
  for select to authenticated using (public.is_shop_member(shop_id));

drop policy if exists bill_items_insert on public.bill_items;
create policy bill_items_insert on public.bill_items
  for insert to authenticated with check (public.is_shop_member(shop_id));

drop policy if exists bill_items_update on public.bill_items;
create policy bill_items_update on public.bill_items
  for update to authenticated using (false);

drop policy if exists bill_items_delete on public.bill_items;
create policy bill_items_delete on public.bill_items
  for delete to authenticated using (false);

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated using (public.is_shop_member(shop_id));

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert to authenticated with check (public.is_shop_member(shop_id));

drop policy if exists payments_modify on public.payments;
create policy payments_modify on public.payments
  for update to authenticated using (false);

drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments
  for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------
drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements
  for select to authenticated using (public.is_shop_member(shop_id));

drop policy if exists stock_movements_insert on public.stock_movements;
create policy stock_movements_insert on public.stock_movements
  for insert to authenticated with check (public.is_shop_member(shop_id));

drop policy if exists stock_movements_modify on public.stock_movements;
create policy stock_movements_modify on public.stock_movements
  for update to authenticated using (false);

drop policy if exists stock_audits_select on public.stock_audits;
create policy stock_audits_select on public.stock_audits
  for select to authenticated using (public.is_shop_member(shop_id));

drop policy if exists stock_audits_write on public.stock_audits;
create policy stock_audits_write on public.stock_audits
  for all to authenticated
  using (public.is_owner(shop_id))
  with check (public.is_owner(shop_id));

drop policy if exists stock_audit_items_select on public.stock_audit_items;
create policy stock_audit_items_select on public.stock_audit_items
  for select to authenticated using (public.is_shop_member(shop_id));

drop policy if exists stock_audit_items_write on public.stock_audit_items;
create policy stock_audit_items_write on public.stock_audit_items
  for all to authenticated
  using (public.is_owner(shop_id))
  with check (public.is_owner(shop_id));

-- ---------------------------------------------------------------------------
-- Suppliers & purchases (owner/manager only — cashiers never see cost)
-- ---------------------------------------------------------------------------
drop policy if exists suppliers_rls on public.suppliers;
create policy suppliers_rls on public.suppliers
  for all to authenticated
  using (public.is_manager_or_owner(shop_id))
  with check (public.is_manager_or_owner(shop_id));

drop policy if exists purchases_rls on public.purchases;
create policy purchases_rls on public.purchases
  for all to authenticated
  using (public.is_manager_or_owner(shop_id))
  with check (public.is_manager_or_owner(shop_id));

drop policy if exists purchase_items_rls on public.purchase_items;
create policy purchase_items_rls on public.purchase_items
  for all to authenticated
  using (public.is_manager_or_owner(shop_id))
  with check (public.is_manager_or_owner(shop_id));

-- ---------------------------------------------------------------------------
-- Offers (read by everyone in the shop, written by the owner)
-- ---------------------------------------------------------------------------
drop policy if exists offers_select on public.offers;
create policy offers_select on public.offers
  for select to authenticated using (public.is_shop_member(shop_id));

drop policy if exists offers_write on public.offers;
create policy offers_write on public.offers
  for all to authenticated
  using (public.is_owner(shop_id))
  with check (public.is_owner(shop_id));

-- ---------------------------------------------------------------------------
-- Audit log: everyone may append their own actor row, only the owner reads
-- ---------------------------------------------------------------------------
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs
  for select to authenticated using (public.is_owner(shop_id));

drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs
  for insert to authenticated
  with check (public.is_shop_member(shop_id) and (actor_id is null or actor_id = auth.uid()));

drop policy if exists audit_no_update on public.audit_logs;
create policy audit_no_update on public.audit_logs
  for update to authenticated using (false);

drop policy if exists audit_no_delete on public.audit_logs;
create policy audit_no_delete on public.audit_logs
  for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- Storage: product photos
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists product_images_read on storage.objects;
create policy product_images_read on storage.objects
  for select to public
  using (bucket_id = 'product-images');

drop policy if exists product_images_write on storage.objects;
create policy product_images_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.is_manager_or_owner(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists product_images_update on storage.objects;
create policy product_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_manager_or_owner(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------------------
-- Realtime (two phones on the same shop see each other's changes)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.bills;
      alter publication supabase_realtime add table public.products;
      alter publication supabase_realtime add table public.customers;
      alter publication supabase_realtime add table public.ledger_entries;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
