-- ============================================================================
-- Dukaan Dost — 0001_init.sql
-- Core schema for the Kirana billing & inventory PWA.
--
-- Conventions
--   * money is stored as integer paise (never floats)
--   * quantities are numeric(12,3) so kg/litre items keep gram precision
--   * every business row carries shop_id → multi-shop is native, not bolted on
--   * created_at / updated_at are timestamptz, written by the client (IST-aware)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shops & membership
-- ---------------------------------------------------------------------------
create table if not exists public.shops (
  id                    uuid primary key default gen_random_uuid(),
  name                  text        not null check (char_length(trim(name)) between 2 and 80),
  owner_name            text        not null default '',
  phone                 text,
  address               text,
  gstin                 text,
  upi_id                text,
  bill_prefix           text        not null default 'BILL',
  receipt_footer        text,
  prices_include_gst    boolean     not null default true,
  receipt_width         smallint    not null default 58 check (receipt_width in (58, 80)),
  max_discount_percent  numeric(5,2) not null default 10 check (max_discount_percent between 0 and 100),
  loyalty_enabled       boolean     not null default true,
  language              text        not null default 'hinglish' check (language in ('hinglish','hi','en')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- One row per auth user: the shop they are "in" right now + their role there.
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  shop_id       uuid references public.shops (id) on delete set null,
  full_name     text not null default '',
  phone         text,
  role          text not null default 'owner' check (role in ('owner','manager','cashier')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Future-ready: a user can be a member of many shops (2 phones, 2 branches).
create table if not exists public.shop_members (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'cashier' check (role in ('owner','manager','cashier')),
  invited_by  uuid references auth.users (id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (shop_id, user_id)
);

create index if not exists shop_members_user_idx on public.shop_members (user_id);

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops (id) on delete cascade,
  name_en     text not null,
  name_hi     text not null default '',
  icon        text,
  color       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists categories_shop_idx on public.categories (shop_id);

create table if not exists public.products (
  id                    uuid primary key default gen_random_uuid(),
  shop_id               uuid not null references public.shops (id) on delete cascade,
  barcode               text,
  name_en               text not null,
  name_hi               text not null default '',
  category_id           uuid references public.categories (id) on delete set null,
  brand                 text,
  unit                  text not null default 'pcs'
                        check (unit in ('pcs','kg','g','litre','ml','packet','dozen','box')),
  is_loose              boolean not null default false,
  purchase_price_paise  integer not null default 0 check (purchase_price_paise >= 0),
  selling_price_paise   integer not null check (selling_price_paise > 0),
  mrp_paise             integer not null default 0 check (mrp_paise >= 0),
  gst_rate              numeric(5,2) not null default 0 check (gst_rate between 0 and 28),
  stock_qty             numeric(12,3) not null default 0,
  low_stock_limit       numeric(12,3) not null default 0,
  expiry_date           date,
  image_url             text,
  hsn_code              text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists products_shop_idx on public.products (shop_id);
create index if not exists products_name_idx on public.products (shop_id, lower(name_en));
create unique index if not exists products_barcode_unique
  on public.products (shop_id, barcode) where barcode is not null;

-- ---------------------------------------------------------------------------
-- Customers / khata
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null references public.shops (id) on delete cascade,
  name                text not null,
  phone               text,
  address             text,
  credit_limit_paise  integer not null default 0 check (credit_limit_paise >= 0),
  balance_paise       integer not null default 0,
  loyalty_points      integer not null default 0 check (loyalty_points >= 0),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists customers_shop_idx on public.customers (shop_id);
create unique index if not exists customers_phone_unique
  on public.customers (shop_id, phone) where phone is not null and phone <> '';

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------
create table if not exists public.bills (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references public.shops (id) on delete cascade,
  bill_no           text not null,
  customer_id       uuid references public.customers (id) on delete set null,
  customer_name     text,
  customer_phone    text,
  cashier_id        uuid references auth.users (id) on delete set null,
  cashier_name      text,
  subtotal_paise    integer not null default 0 check (subtotal_paise >= 0),
  discount_paise    integer not null default 0 check (discount_paise >= 0),
  -- Split so the server can tell a PIN-authorised manual discount (capped,) from an
  -- automatic offer/loyalty discount (not capped). discount = manual + offer.
  manual_discount_paise integer not null default 0 check (manual_discount_paise >= 0),
  offer_discount_paise  integer not null default 0 check (offer_discount_paise >= 0),
  taxable_paise     integer not null default 0 check (taxable_paise >= 0),
  tax_paise         integer not null default 0 check (tax_paise >= 0),
  round_off_paise   integer not null default 0,
  total_paise       integer not null default 0 check (total_paise >= 0),
  status            text not null default 'paid' check (status in ('held','paid','void','refunded')),
  payment_status    text not null default 'paid' check (payment_status in ('paid','pending','partial')),
  note              text,
  created_at        timestamptz not null default now(),
  finalized_at      timestamptz,
  updated_at        timestamptz not null default now(),
  unique (shop_id, bill_no),
  constraint bills_discount_split_chk
    check (discount_paise = manual_discount_paise + offer_discount_paise)
);

create index if not exists bills_shop_created_idx on public.bills (shop_id, created_at desc);
create index if not exists bills_customer_idx on public.bills (customer_id);

create table if not exists public.bill_items (
  id                uuid primary key default gen_random_uuid(),
  bill_id           uuid not null references public.bills (id) on delete cascade,
  shop_id           uuid not null references public.shops (id) on delete cascade,
  product_id        uuid references public.products (id) on delete set null,
  name_en           text not null,
  name_hi           text not null default '',
  barcode           text,
  qty               numeric(12,3) not null check (qty > 0),
  unit              text not null,
  unit_price_paise  integer not null check (unit_price_paise > 0),
  mrp_paise         integer not null default 0,
  gst_rate          numeric(5,2) not null default 0,
  line_total_paise  integer not null check (line_total_paise >= 0),
  taxable_paise     integer not null default 0,
  tax_paise         integer not null default 0,
  cost_paise        integer not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists bill_items_bill_idx on public.bill_items (bill_id);
create index if not exists bill_items_shop_idx on public.bill_items (shop_id);

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  bill_id       uuid not null references public.bills (id) on delete cascade,
  shop_id       uuid not null references public.shops (id) on delete cascade,
  mode          text not null check (mode in ('cash','upi','card','udhaar')),
  amount_paise  integer not null check (amount_paise > 0),
  reference     text,
  created_at    timestamptz not null default now()
);

create index if not exists payments_bill_idx on public.payments (bill_id);
create index if not exists payments_shop_created_idx on public.payments (shop_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references public.shops (id) on delete cascade,
  product_id      uuid references public.products (id) on delete cascade,
  movement_type   text not null check (movement_type in
                  ('opening','sale','purchase','return','adjustment','audit','wastage')),
  qty_change      numeric(12,3) not null,
  qty_after       numeric(12,3) not null,
  reference_type  text,
  reference_id    uuid,
  note            text,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists stock_movements_product_idx
  on public.stock_movements (shop_id, product_id, created_at desc);

create table if not exists public.stock_audits (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops (id) on delete cascade,
  name        text not null,
  status      text not null default 'open' check (status in ('open','closed')),
  counted_by  uuid references auth.users (id) on delete set null,
  note        text,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  updated_at  timestamptz not null default now()
);

create table if not exists public.stock_audit_items (
  id            uuid primary key default gen_random_uuid(),
  audit_id      uuid not null references public.stock_audits (id) on delete cascade,
  shop_id       uuid not null references public.shops (id) on delete cascade,
  product_id    uuid not null references public.products (id) on delete cascade,
  product_name  text not null,
  system_qty    numeric(12,3) not null,
  counted_qty   numeric(12,3) not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (audit_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Suppliers & purchases
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops (id) on delete cascade,
  name          text not null,
  phone         text,
  company       text,
  gstin         text,
  address       text,
  notes         text,
  balance_paise integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists suppliers_shop_idx on public.suppliers (shop_id);

create table if not exists public.purchases (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops (id) on delete cascade,
  purchase_no   text not null,
  supplier_id   uuid references public.suppliers (id) on delete set null,
  supplier_name text,
  invoice_no    text,
  total_paise   integer not null default 0 check (total_paise >= 0),
  paid_paise    integer not null default 0 check (paid_paise >= 0),
  status        text not null default 'paid' check (status in ('paid','credit','partial')),
  note          text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (shop_id, purchase_no)
);

create table if not exists public.purchase_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_id       uuid not null references public.purchases (id) on delete cascade,
  shop_id           uuid not null references public.shops (id) on delete cascade,
  product_id        uuid references public.products (id) on delete set null,
  name_en           text not null,
  name_hi           text not null default '',
  qty               numeric(12,3) not null check (qty > 0),
  unit              text not null,
  cost_paise        integer not null check (cost_paise >= 0),
  line_total_paise  integer not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists purchase_items_purchase_idx on public.purchase_items (purchase_id);

-- ---------------------------------------------------------------------------
-- Ledger (customer udhaar + supplier dues)
-- ---------------------------------------------------------------------------
create table if not exists public.ledger_entries (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null references public.shops (id) on delete cascade,
  customer_id         uuid references public.customers (id) on delete cascade,
  supplier_id         uuid references public.suppliers (id) on delete cascade,
  entry_type          text not null check (entry_type in
                      ('udhaar','payment','purchase','purchase_payment','adjustment','opening')),
  amount_paise        integer not null,
  balance_after_paise integer not null default 0,
  reference_type      text,
  reference_id        uuid,
  note                text,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint ledger_party_check check (customer_id is not null or supplier_id is not null)
);

create index if not exists ledger_customer_idx
  on public.ledger_entries (shop_id, customer_id, created_at desc);
create index if not exists ledger_supplier_idx
  on public.ledger_entries (shop_id, supplier_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Offers (owner-created, auto-applied)
-- ---------------------------------------------------------------------------
create table if not exists public.offers (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references public.shops (id) on delete cascade,
  name              text not null,
  name_hi           text not null default '',
  type              text not null check (type in ('bogo','combo','percent','flat')),
  is_active         boolean not null default true,
  product_id        uuid references public.products (id) on delete cascade,
  combo_product_id  uuid references public.products (id) on delete cascade,
  category_id       uuid references public.categories (id) on delete cascade,
  buy_qty           integer not null default 1 check (buy_qty >= 0),
  get_qty           integer not null default 1 check (get_qty >= 0),
  discount_percent  numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  discount_paise    integer not null default 0 check (discount_paise >= 0),
  min_qty           integer not null default 0 check (min_qty >= 0),
  start_date        date,
  end_date          date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists offers_shop_idx on public.offers (shop_id, is_active);

-- ---------------------------------------------------------------------------
-- Audit trail (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  actor_name  text,
  entity      text not null,
  entity_id   text not null,
  action      text not null,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_shop_created_idx on public.audit_logs (shop_id, created_at desc);
create index if not exists audit_entity_idx on public.audit_logs (shop_id, entity, entity_id);

-- ---------------------------------------------------------------------------
-- Derived views
-- ---------------------------------------------------------------------------
-- Stock computed purely from movements — used to reconcile devices that drifted.
create or replace view public.product_stock_view as
select
  p.id                as product_id,
  p.shop_id,
  p.name_en,
  p.stock_qty         as book_qty,
  coalesce(sum(m.qty_change), 0)::numeric(12,3) as movement_qty,
  p.stock_qty - coalesce(sum(m.qty_change), 0)::numeric(12,3) as drift
from public.products p
left join public.stock_movements m on m.product_id = p.id
group by p.id, p.shop_id, p.name_en, p.stock_qty;

-- Daily sales rollup (handy for dashboards without scanning bill_items).
create or replace view public.daily_sales_view as
select
  b.shop_id,
  (b.created_at at time zone 'Asia/Kolkata')::date as sale_date,
  count(*)                        as bills,
  sum(b.total_paise)              as sales_paise,
  sum(b.tax_paise)                as tax_paise,
  sum(b.discount_paise)           as discount_paise
from public.bills b
where b.status = 'paid'
group by b.shop_id, (b.created_at at time zone 'Asia/Kolkata')::date;
