-- Banners da vitrine (imagem larga clicável entre a frase e a busca).
-- Rode uma vez no SQL Editor do Supabase.

create table if not exists public.banners (
  id          bigint generated always as identity primary key,
  image_url   text not null,
  link        text not null,
  title       text,                          -- texto alternativo da imagem (acessibilidade)
  sort        integer not null default 0,    -- ordem de exibição (menor primeiro)
  active      boolean not null default true,
  starts_at   timestamptz,                   -- opcional: começa a aparecer em
  ends_at     timestamptz,                   -- opcional: some sozinho depois desta data
  clicks      integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists banners_active_idx on public.banners (active, sort, created_at desc);

-- Mesmo esquema das ofertas: só o servidor (service_role) acessa
alter table public.banners enable row level security;

create or replace function public.increment_banner_clicks(banner_id bigint)
returns void language sql security definer set search_path = public as $$
  update public.banners set clicks = clicks + 1 where id = banner_id;
$$;

-- Pasta pública para as imagens dos banners (envio só pelo servidor)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banners', 'banners', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Contadores de clique: só o servidor (service_role) pode chamar
alter function public.increment_clicks(bigint) set search_path = public;
revoke execute on function public.increment_clicks(bigint) from public, anon, authenticated;
revoke execute on function public.increment_banner_clicks(bigint) from public, anon, authenticated;
grant execute on function public.increment_clicks(bigint) to service_role;
grant execute on function public.increment_banner_clicks(bigint) to service_role;
