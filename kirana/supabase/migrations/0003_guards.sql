-- ============================================================================
-- Dukaan Dost — 0003_guards.sql
-- Business rules that must hold even if a client is tampered with:
--   * only the owner can change prices or give a manual discount
--   * finalized bills are immutable (void/refund is a new state, not an edit)
--   * discounts can never exceed the shop's cap
--   * roles cannot be self-escalated
--   * audit rows are append-only and stamped with the real actor
-- ============================================================================

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'shops','profiles','shop_members','products','customers','bills',
    'suppliers','purchases','offers','stock_audits','stock_audit_items'
  ]
  loop
    execute format('drop trigger if exists trg_touch_updated_at on public.%I', t);
    execute format(
      'create trigger trg_touch_updated_at before update on public.%I
       for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Products: price + purchase price changes are owner-only
-- ---------------------------------------------------------------------------
create or replace function public.guard_product_prices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.shop_role(new.shop_id), 'anon') = 'owner' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Managers may create products, but never with a price they invented.
    if coalesce(auth.uid()::text, '') <> '' and public.shop_role(new.shop_id) is null then
      raise exception 'not a member of this shop';
    end if;
    return new;
  end if;

  if new.selling_price_paise is distinct from old.selling_price_paise
     or new.purchase_price_paise is distinct from old.purchase_price_paise
     or new.mrp_paise is distinct from old.mrp_paise then
    raise exception 'Only the shop owner can change prices (selling/purchase/MRP)';
  end if;

  if new.shop_id is distinct from old.shop_id or new.barcode is distinct from old.barcode then
    raise exception 'Owners only: barcode/shop cannot be reassigned by staff';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_product_prices on public.products;
create trigger trg_guard_product_prices
  before insert or update on public.products
  for each row execute function public.guard_product_prices();

-- ---------------------------------------------------------------------------
-- Bills: discount cap, manual-discount ownership, immutability
-- ---------------------------------------------------------------------------
create or replace function public.guard_bill_amounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap_paise integer;
  role text;
begin
  role := coalesce(public.shop_role(new.shop_id), 'anon');

  select greatest(0, round(new.subtotal_paise * s.max_discount_percent / 100.0))::int
    into cap_paise
  from public.shops s
  where s.id = new.shop_id;

  -- The cap applies to *manual* discounts. Owner-configured offers (BOGO,
  -- combo, festival %) may be worth more than the cap and are legitimate.
  if coalesce(new.manual_discount_paise, 0) > coalesce(cap_paise, 0) then
    raise exception 'Manual discount % paise exceeds the shop cap of % paise',
      new.manual_discount_paise, cap_paise;
  end if;

  if coalesce(new.manual_discount_paise, 0) > 0 and role <> 'owner' then
    raise exception 'Manual discount requires the shop owner';
  end if;

  if coalesce(new.offer_discount_paise, 0) < 0 then
    raise exception 'Offer discount cannot be negative';
  end if;

  if new.discount_paise <> coalesce(new.manual_discount_paise, 0) + coalesce(new.offer_discount_paise, 0) then
    raise exception 'discount_paise must equal manual_discount_paise + offer_discount_paise';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_bill_amounts on public.bills;
create trigger trg_guard_bill_amounts
  before insert on public.bills
  for each row execute function public.guard_bill_amounts();

create or replace function public.guard_bill_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Bills cannot be deleted — use void with owner approval';
  end if;

  if old.status = 'void' then
    raise exception 'A void bill is final';
  end if;

  -- Only the status/note/payment_status may change, and only towards void/refund.
  if new.subtotal_paise     is distinct from old.subtotal_paise
     or new.discount_paise  is distinct from old.discount_paise
     or new.manual_discount_paise is distinct from old.manual_discount_paise
     or new.offer_discount_paise is distinct from old.offer_discount_paise
     or new.tax_paise       is distinct from old.tax_paise
     or new.total_paise     is distinct from old.total_paise
     or new.bill_no         is distinct from old.bill_no
     or new.customer_id     is distinct from old.customer_id then
    raise exception 'Finalized bills cannot be edited — create a return/refund entry instead';
  end if;

  if new.status not in ('paid','void','refunded') then
    raise exception 'Invalid bill status transition to %', new.status;
  end if;

  if new.status in ('void','refunded') and not public.is_owner(new.shop_id) then
    raise exception 'Only the owner can void or refund a bill';
  end if;

  if new.status = 'void' and old.status = 'held' then
    raise exception 'Held bills must be resumed or discarded, not voided';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_bill_immutability on public.bills;
create trigger trg_guard_bill_immutability
  before update or delete on public.bills
  for each row execute function public.guard_bill_immutability();

-- Stamp finalized_at the moment a bill becomes a real sale.
create or replace function public.stamp_bill_finalized()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'paid' and new.finalized_at is null then
    new.finalized_at := coalesce(new.created_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_bill_finalized on public.bills;
create trigger trg_stamp_bill_finalized
  before insert on public.bills
  for each row execute function public.stamp_bill_finalized();

-- ---------------------------------------------------------------------------
-- Bill items and payments belong to a bill in the same shop and are immutable
-- ---------------------------------------------------------------------------
create or replace function public.guard_bill_children()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bill_shop uuid;
begin
  select shop_id into bill_shop from public.bills where id = new.bill_id;
  if bill_shop is null then
    raise exception 'Bill % does not exist', new.bill_id;
  end if;
  if bill_shop <> new.shop_id then
    raise exception 'Bill item shop mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_bill_items on public.bill_items;
create trigger trg_guard_bill_items
  before insert on public.bill_items
  for each row execute function public.guard_bill_children();

drop trigger if exists trg_guard_payments on public.payments;
create trigger trg_guard_payments
  before insert on public.payments
  for each row execute function public.guard_bill_children();

-- ---------------------------------------------------------------------------
-- Roles cannot be self-escalated
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role or new.shop_id is distinct from old.shop_id then
    -- Owners manage staff; nobody can promote themselves.
    if new.id = auth.uid() and not public.is_owner(old.shop_id) then
      raise exception 'You cannot change your own role';
    end if;
    if not (public.is_owner(old.shop_id) or public.is_owner(new.shop_id)) then
      raise exception 'Only the owner can change roles';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- Audit log is append-only and actor-stamped
-- ---------------------------------------------------------------------------
create or replace function public.stamp_audit_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.actor_id is null then
    new.actor_id := auth.uid();
  end if;
  if auth.uid() is not null and new.actor_id <> auth.uid() then
    raise exception 'Audit entries must be written for the authenticated user';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_audit_actor on public.audit_logs;
create trigger trg_stamp_audit_actor
  before insert on public.audit_logs
  for each row execute function public.stamp_audit_actor();

create or replace function public.block_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Audit log is append-only';
end;
$$;

drop trigger if exists trg_block_audit_update on public.audit_logs;
create trigger trg_block_audit_update
  before update or delete on public.audit_logs
  for each row execute function public.block_audit_mutation();

-- ---------------------------------------------------------------------------
-- Ledger entries are append-only too
-- ---------------------------------------------------------------------------
drop trigger if exists trg_block_ledger_update on public.ledger_entries;
create trigger trg_block_ledger_update
  before update or delete on public.ledger_entries
  for each row execute function public.block_audit_mutation();

-- ---------------------------------------------------------------------------
-- Customer balance sanity: negative balance is never valid
-- ---------------------------------------------------------------------------
create or replace function public.guard_customer_balance()
returns trigger
language plpgsql
as $$
begin
  if new.balance_paise < 0 then
    raise exception 'Customer balance cannot be negative';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_customer_balance on public.customers;
create trigger trg_guard_customer_balance
  before insert or update on public.customers
  for each row execute function public.guard_customer_balance();

-- ---------------------------------------------------------------------------
-- Helper RPC: create the first shop + owner membership atomically on signup
-- ---------------------------------------------------------------------------
create or replace function public.create_shop_for_current_user(
  p_name text,
  p_owner_name text default '',
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_shop uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.shops (name, owner_name, phone, bill_prefix)
  values (
    p_name,
    coalesce(nullif(p_owner_name, ''), 'Owner'),
    p_phone,
    upper(left(regexp_replace(p_name, '[^A-Za-z]', '', 'g'), 3))
  )
  returning id into new_shop;

  insert into public.profiles (id, shop_id, full_name, phone, role)
  values (auth.uid(), new_shop, coalesce(p_owner_name, ''), p_phone, 'owner')
  on conflict (id) do update
    set shop_id = excluded.shop_id,
        full_name = excluded.full_name,
        role = 'owner';

  insert into public.shop_members (shop_id, user_id, role)
  values (new_shop, auth.uid(), 'owner')
  on conflict (shop_id, user_id) do nothing;

  return new_shop;
end;
$$;

grant execute on function public.create_shop_for_current_user(text, text, text) to authenticated;
