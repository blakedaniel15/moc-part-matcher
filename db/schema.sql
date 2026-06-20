create table if not exists archetypes (
  bare_part_number text primary key,
  manufacturer_part text not null,
  incentive integer not null default 0,
  components text[] null,
  source text not null default 'official',
  official_name text null
);

create table if not exists approved_mappings (
  dms_sku text primary key,
  dms_part_name text not null default '',
  bare_part_number text not null,
  manufacturer_part text not null,
  incentive integer not null default 0,
  approved_at timestamptz not null default now(),
  approved_by text null
);

create table if not exists aliases (
  id bigserial primary key,
  bare_part_number text not null,
  name text not null,
  source_sku text not null default '',
  origin text not null,
  added_at timestamptz not null default now(),
  unique (bare_part_number, name)
);

create table if not exists decisions (
  id bigserial primary key,
  sku text not null,
  part_name text not null default '',
  match_type text null,
  confidence text null,
  outcome text not null,            -- approve | reject | correct
  bare_part_number text null,       -- the human-confirmed answer (null = not MOC)
  ts timestamptz not null default now()
);

create table if not exists blocked_skus (
  sku text primary key,
  part_name text not null default '',
  reason text null,
  blocked_at timestamptz not null default now()
);

create table if not exists dealer_rejections (
  dealer text not null,
  sku text not null,
  ts timestamptz not null default now(),
  primary key (dealer, sku)
);

create table if not exists runs (
  id bigserial primary key,
  dealer text null,
  total integer not null,
  exact integer not null,
  exact_pct numeric null,
  ts timestamptz not null default now()
);

create table if not exists ai_verdict_cache (
  content_hash text primary key,
  verdict jsonb not null,
  model text not null,
  catalog_version text null,
  created_at timestamptz not null default now()
);
