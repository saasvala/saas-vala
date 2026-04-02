-- ULTRA NEXT additive monitoring + alerts persistence layer
-- Non-breaking: only creates new tables/indexes if absent.

create table if not exists public.request_logs (
  id uuid primary key default gen_random_uuid(),
  method text not null,
  endpoint text not null,
  status_code integer,
  duration_ms integer,
  request_meta jsonb,
  response_meta jsonb,
  error_text text,
  created_at timestamptz not null default now()
);

create index if not exists idx_request_logs_created_at on public.request_logs(created_at desc);
create index if not exists idx_request_logs_endpoint on public.request_logs(endpoint);
create index if not exists idx_request_logs_status_code on public.request_logs(status_code);

create table if not exists public.request_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_type text not null,
  metric_value numeric not null default 0,
  metric_window text not null default 'single_run',
  metadata jsonb,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_request_metrics_type_recorded on public.request_metrics(metric_type, recorded_at desc);

create table if not exists public.system_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  message text not null,
  context jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_system_alerts_status on public.system_alerts(status);
create index if not exists idx_system_alerts_type on public.system_alerts(alert_type);
create index if not exists idx_system_alerts_last_seen on public.system_alerts(last_seen_at desc);

create or replace function public.update_system_alerts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_system_alerts_updated_at on public.system_alerts;
create trigger trg_system_alerts_updated_at
before update on public.system_alerts
for each row
execute procedure public.update_system_alerts_updated_at();
