-- Vitrine — instalação NOVA (do zero). Rode no SQL Editor do Supabase.
-- Já tinha rodado a versão antiga? Rode só o migracao-2-varias-vitrines.sql.

create table if not exists public.stores (
  id               bigint generated always as identity primary key,
  slug             text not null unique,
  name             text not null,
  handle           text,
  tagline          text,
  avatar_url       text,
  tiktok_url       text,
  instagram_url    text,
  youtube_url      text,
  whatsapp_url     text,
  shopee_app_id    text,
  shopee_app_secret text,
  shopee_sub_id    text,
  password_hash    text,
  is_owner         boolean not null default false,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists public.offers (
  id             bigint generated always as identity primary key,
  store_id       bigint not null references public.stores(id) on delete cascade,
  num            integer not null,                  -- número do produto dentro da vitrine (#1, #2…)
  kind           text not null default 'produto' check (kind in ('produto','cupom')),
  title          text not null,
  description    text,
  image_url      text,
  price          numeric(10,2),
  original_price numeric(10,2),
  link           text not null,
  platform       text not null default 'shopee',
  category       text,
  coupon_code    text,
  badge          text,
  pinned         boolean not null default false,
  active         boolean not null default true,
  clicks         integer not null default 0,
  expires_at     timestamptz,
  created_at     timestamptz not null default now()
);

create unique index if not exists offers_store_num_idx on public.offers (store_id, num);
create index if not exists offers_store_active_idx on public.offers (store_id, active, pinned desc, created_at desc);

-- Sem policies: só o servidor (service_role) acessa.
alter table public.stores enable row level security;
alter table public.offers enable row level security;

create or replace function public.increment_clicks(offer_id bigint)
returns void language sql security definer as $$
  update public.offers set clicks = clicks + 1 where id = offer_id;
$$;

insert into public.stores (slug, name, is_owner) values ('minhaloja', 'Minha vitrine', true)
on conflict (slug) do nothing;
