-- Achado do dia (automacao/) — rode no SQL Editor do Supabase uma vez.
-- Guarda os produtos que o robô já escolheu, para não repetir e para desfixar o anterior.

create table if not exists public.auto_picks (
  id              bigint generated always as identity primary key,
  item_id         bigint not null unique,
  shop_id         bigint not null,
  offer_id        bigint references public.offers(id) on delete set null,
  product_name    text,
  commission_rate numeric(6,4),
  price           numeric(10,2),
  sales           integer,
  rating          numeric(3,2),
  link            text,
  out_dir         text,
  picked_at       timestamptz not null default now()
);

-- Mesmo esquema da tabela offers: só o servidor (service_role) acessa
alter table public.auto_picks enable row level security;
