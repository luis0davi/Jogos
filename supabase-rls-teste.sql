-- TESTE DE RLS. Revise antes de usar em produção.
-- O usuário precisa ter app_metadata: {"empresa_id": 1}

alter table public.empresas enable row level security;
create policy "empresa do usuario" on public.empresas for select to authenticated
using (id=((auth.jwt()->'app_metadata'->>'empresa_id')::bigint));

alter table public."Órfãos" enable row level security;
create policy "dispositivo da empresa" on public."Órfãos" for select to authenticated
using (empresa_id=((auth.jwt()->'app_metadata'->>'empresa_id')::bigint));

alter table public.fornos enable row level security;
create policy "forno da empresa" on public.fornos for select to authenticated
using (exists(select 1 from public."Órfãos" d where d.id=fornos.dispositivo_id
and d.empresa_id=((auth.jwt()->'app_metadata'->>'empresa_id')::bigint)));

alter table public.leituras enable row level security;
create policy "leitura da empresa" on public.leituras for select to authenticated
using (exists(select 1 from public."Órfãos" d where d.id=leituras.dispositivo_id
and d.empresa_id=((auth.jwt()->'app_metadata'->>'empresa_id')::bigint)));
