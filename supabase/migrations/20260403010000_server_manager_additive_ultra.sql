-- ULTRA 4-IN-1 SERVER MANAGER additive schema hardening
-- Non-destructive only: add missing tables/columns/indexes/constraints

-- domains table (used by existing runtime code)
create table if not exists public.domains (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references public.servers(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  domain_name text not null unique,
  domain_type text not null default 'custom',
  status text not null default 'pending',
  ssl_status text not null default 'pending',
  dns_verified boolean not null default false,
  dns_verified_at timestamptz,
  is_primary boolean not null default false,
  ssl_auto_renew boolean not null default true,
  ssl_expiry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- deployment_logs table with server linkage
create table if not exists public.deployment_logs (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid references public.deployments(id) on delete cascade,
  server_id uuid references public.servers(id) on delete cascade,
  type text,
  message text not null,
  status text,
  log_level text,
  timestamp timestamptz not null default now()
);

-- additive columns for dns_records expected by server-manager flow
alter table public.dns_records add column if not exists server_id uuid references public.servers(id) on delete cascade;
alter table public.dns_records add column if not exists status text not null default 'pending';
alter table public.dns_records add column if not exists type text;

-- normalized settings table for toggles
create table if not exists public.server_settings (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null unique references public.servers(id) on delete cascade,
  auto_deploy boolean not null default true,
  maintenance boolean not null default false,
  paused boolean not null default false,
  ddos boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- normalized GitHub account/repo tables
create table if not exists public.github_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  access_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.github_repos (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.github_accounts(id) on delete cascade,
  repo_name text not null,
  branch text not null default 'main',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, repo_name)
);

-- AI logs table for debug/voice actions
create table if not exists public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references public.servers(id) on delete cascade,
  action text not null,
  result text,
  created_at timestamptz not null default now()
);

-- helpful request log table for middleware logging
create table if not exists public.request_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  endpoint text not null,
  method text not null,
  status_code int not null,
  duration_ms int,
  error_code text,
  created_at timestamptz not null default now()
);

-- indexes for performance requirements
create index if not exists idx_deployments_server_id on public.deployments(server_id);
create index if not exists idx_deployments_status on public.deployments(status);
create index if not exists idx_deployments_created_at on public.deployments(created_at desc);

create index if not exists idx_deployment_logs_server_id on public.deployment_logs(server_id);
create index if not exists idx_deployment_logs_status on public.deployment_logs(status);
create index if not exists idx_deployment_logs_timestamp on public.deployment_logs(timestamp desc);
create index if not exists idx_deployment_logs_deployment_id on public.deployment_logs(deployment_id);

create index if not exists idx_dns_records_server_id on public.dns_records(server_id);
create index if not exists idx_dns_records_status on public.dns_records(status);
create index if not exists idx_domains_server_id on public.domains(server_id);
create index if not exists idx_domains_status on public.domains(status);
create index if not exists idx_server_settings_server_id on public.server_settings(server_id);
create index if not exists idx_github_accounts_user_id on public.github_accounts(user_id);
create index if not exists idx_github_repos_account_id on public.github_repos(account_id);
create index if not exists idx_ai_logs_server_id on public.ai_logs(server_id);
create index if not exists idx_ai_logs_action on public.ai_logs(action);
create index if not exists idx_request_logs_user_id_created_at on public.request_logs(user_id, created_at desc);
create index if not exists idx_request_logs_endpoint_created_at on public.request_logs(endpoint, created_at desc);

-- trigger wiring for updated_at where present
create or replace function public.__sv_update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'update_domains_updated_at') then
    create trigger update_domains_updated_at before update on public.domains for each row execute function public.__sv_update_updated_at_column();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'update_server_settings_updated_at') then
    create trigger update_server_settings_updated_at before update on public.server_settings for each row execute function public.__sv_update_updated_at_column();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'update_github_accounts_updated_at') then
    create trigger update_github_accounts_updated_at before update on public.github_accounts for each row execute function public.__sv_update_updated_at_column();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'update_github_repos_updated_at') then
    create trigger update_github_repos_updated_at before update on public.github_repos for each row execute function public.__sv_update_updated_at_column();
  end if;
end;
$$;
