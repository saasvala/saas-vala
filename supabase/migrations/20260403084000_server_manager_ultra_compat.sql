-- Server Manager ultra compatibility (additive only)
-- Adds requested fields and secure-token compatibility without breaking existing schema.

alter table public.servers
  add column if not exists provider text,
  add column if not exists region text;

-- Requested logical aliases compatibility:
-- server_id => existing primary key id
-- ip => existing ip_address
-- type => existing server_type
-- health => existing health_status
-- agent_token remains in agent_token column

create or replace view public.servers_compat as
select
  s.id as server_id,
  s.id,
  s.name,
  s.server_type as type,
  s.server_type,
  s.ip_address as ip,
  s.ip_address,
  s.agent_url,
  s.agent_token,
  s.status,
  s.health_status as health,
  s.health_status,
  s.provider,
  s.region,
  s.created_at
from public.servers s;

create index if not exists idx_servers_provider on public.servers(provider);
create index if not exists idx_servers_region on public.servers(region);
