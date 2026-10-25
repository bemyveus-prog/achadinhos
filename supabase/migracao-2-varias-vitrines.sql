-- ============================================================
-- Migração 2: várias vitrines (um afiliado por loja)
-- Rode UMA vez no SQL Editor do Supabase, depois do schema.sql.
-- Não apaga nada: suas ofertas atuais passam para a loja principal.
-- ============================================================

create table if not exists public.stores (
  id               bigint generated always as identity primary key,
  slug             text not null unique,            -- endereço: site.com/slug  (também é o usuário do login)
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
  password_hash    text,                             -- null = só entra pelo admin geral
  is_owner         boolean not null default false,   -- loja que aparece no endereço principal
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
alter table public.stores enable row level security;

alter table public.offers add column if not exists store_id bigint references public.stores(id) on delete cascade;
alter table public.offers add column if not exists num integer;

-- Loja principal (a sua), com o endereço /silvachei — dá para trocar depois no painel
insert into public.stores (slug, name, handle, is_owner)
values ('silvachei', 'Achadinhos da Silva', '@silvachei', true)
on conflict (slug) do nothing;

-- Ofertas que já existem passam para a loja principal, mantendo o mesmo número
update public.offers
   set store_id = (select id from public.stores where is_owner order by id limit 1)
 where store_id is null;
update public.offers set num = id where num is null;

alter table public.offers alter column store_id set not null;
alter table public.offers alter column num set not null;

create unique index if not exists offers_store_num_idx on public.offers (store_id, num);
create index if not exists offers_store_active_idx on public.offers (store_id, active, pinned desc, created_at desc);
