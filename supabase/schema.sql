-- Vitrine Bio — rode isto no SQL Editor do Supabase (uma vez só)

create table if not exists public.offers (
  id            bigint generated always as identity primary key,
  kind          text not null default 'produto' check (kind in ('produto','cupom')),
  title         text not null,
  description   text,
  image_url     text,
  price         numeric(10,2),
  original_price numeric(10,2),
  link          text not null,
  platform      text not null default 'shopee',   -- shopee | tiktok | outro
  category      text,
  coupon_code   text,
  badge         text,                              -- ex: "Mais vendido", "Frete grátis"
  pinned        boolean not null default false,    -- aparece em destaque no topo
  active        boolean not null default true,
  clicks        integer not null default 0,
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists offers_active_idx on public.offers (active, pinned desc, created_at desc);

-- Segurança: sem policies = ninguém acessa pela chave pública.
-- O site acessa só pelo servidor, com a service_role key.
alter table public.offers enable row level security;

-- Contador de cliques atômico
create or replace function public.increment_clicks(offer_id bigint)
returns void
language sql
security definer
as $$
  update public.offers set clicks = clicks + 1 where id = offer_id;
$$;
