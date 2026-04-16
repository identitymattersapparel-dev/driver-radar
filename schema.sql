-- ============================================================
-- Driver Radar — Supabase Schema (V1)
-- Run this in the Supabase SQL Editor before first use.
-- ============================================================

-- ── route_sessions ──────────────────────────────────────────

create table if not exists route_sessions (
  id                 uuid primary key default gen_random_uuid(),
  started_at         timestamptz not null,
  target_finish_time timestamptz,
  total_stops        integer     not null,
  completed_stops    integer     not null default 0,
  is_active          boolean     not null default true,
  created_at         timestamptz not null default now()
);

-- Index so fetching the active session is fast
create index if not exists idx_route_sessions_active
  on route_sessions (is_active, started_at desc);

-- ── notes ───────────────────────────────────────────────────

create table if not exists notes (
  id                uuid    primary key default gen_random_uuid(),
  route_session_id  uuid    references route_sessions(id) on delete set null,
  text              text    not null,
  created_at        timestamptz not null,
  stop_number       integer not null,
  route_stop_key    integer,
  location_key      text,
  -- 'session' = belongs to a specific route
  -- 'global'  = cross-route memory
  scope             text    not null check (scope in ('session', 'global'))
);

-- Indexes for the two common fetch patterns
create index if not exists idx_notes_session
  on notes (route_session_id, scope);

create index if not exists idx_notes_global
  on notes (scope, created_at asc)
  where scope = 'global';

