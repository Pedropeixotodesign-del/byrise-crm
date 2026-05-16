-- CRM de Clientes | Supabase
-- Rode este arquivo no Supabase em: SQL Editor > New Query > Run

create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  instagram text,
  company text,
  responsible text,
  cargo text,
  email text,
  phone text,
  city text,
  state text,
  country text default 'BR',
  type text default 'Mensal',
  value numeric default 0,
  status text default 'Ativo',
  start_date date,
  end_date date,
  notes text,
  logo_path text,
  contract_path text,
  contract_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.clients enable row level security;

-- Evita erro se as políticas já existirem.
drop policy if exists "Users can view own clients" on public.clients;
drop policy if exists "Users can insert own clients" on public.clients;
drop policy if exists "Users can update own clients" on public.clients;
drop policy if exists "Users can delete own clients" on public.clients;

create policy "Users can view own clients"
on public.clients
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own clients"
on public.clients
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own clients"
on public.clients
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own clients"
on public.clients
for delete
to authenticated
using (auth.uid() = user_id);

-- Buckets privados para logos e contratos.
insert into storage.buckets (id, name, public)
values ('client-logos', 'client-logos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

-- Políticas de storage: cada usuário só acessa arquivos dentro da pasta do seu próprio user_id.
drop policy if exists "Users can view own logos" on storage.objects;
drop policy if exists "Users can upload own logos" on storage.objects;
drop policy if exists "Users can update own logos" on storage.objects;
drop policy if exists "Users can delete own logos" on storage.objects;
drop policy if exists "Users can view own contracts" on storage.objects;
drop policy if exists "Users can upload own contracts" on storage.objects;
drop policy if exists "Users can update own contracts" on storage.objects;
drop policy if exists "Users can delete own contracts" on storage.objects;

create policy "Users can view own logos"
on storage.objects
for select
to authenticated
using (bucket_id = 'client-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can upload own logos"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'client-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can update own logos"
on storage.objects
for update
to authenticated
using (bucket_id = 'client-logos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'client-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete own logos"
on storage.objects
for delete
to authenticated
using (bucket_id = 'client-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can view own contracts"
on storage.objects
for select
to authenticated
using (bucket_id = 'contracts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can upload own contracts"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'contracts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can update own contracts"
on storage.objects
for update
to authenticated
using (bucket_id = 'contracts' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'contracts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete own contracts"
on storage.objects
for delete
to authenticated
using (bucket_id = 'contracts' and (storage.foldername(name))[1] = auth.uid()::text);

-- Trigger simples para manter updated_at atualizado.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_clients_updated_at on public.clients;

create trigger set_clients_updated_at
before update on public.clients
for each row
execute function public.set_updated_at();
