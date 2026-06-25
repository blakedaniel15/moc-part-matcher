// Runs each DDL statement as its own tagged-template call. The Neon HTTP client
// (`neon()`) exposes ONLY the tagged-template interface — no `.query()`, and it
// can't run multiple statements in one call — so the schema is applied one
// statement at a time. `sql` is the neon() tagged-template function.
// Keep db/schema.sql in sync for human reference.
type Sql = (strings: TemplateStringsArray, ...vals: any[]) => Promise<any>;

export async function runMigration(sql: Sql): Promise<void> {
  await sql`create table if not exists archetypes (
    bare_part_number text primary key,
    manufacturer_part text not null,
    incentive integer not null default 0,
    components text[] null,
    source text not null default 'official',
    official_name text null
  )`;
  await sql`create table if not exists approved_mappings (
    dms_sku text primary key,
    dms_part_name text not null default '',
    bare_part_number text not null,
    manufacturer_part text not null,
    incentive integer not null default 0,
    approved_at timestamptz not null default now(),
    approved_by text null
  )`;
  await sql`create table if not exists aliases (
    id bigserial primary key,
    bare_part_number text not null,
    name text not null,
    source_sku text not null default '',
    origin text not null,
    added_at timestamptz not null default now(),
    unique (bare_part_number, name)
  )`;
  await sql`create table if not exists decisions (
    id bigserial primary key,
    sku text not null,
    part_name text not null default '',
    match_type text null,
    confidence text null,
    outcome text not null,
    bare_part_number text null,
    ts timestamptz not null default now()
  )`;
  await sql`create table if not exists blocked_skus (
    sku text primary key,
    part_name text not null default '',
    reason text null,
    blocked_at timestamptz not null default now()
  )`;
  await sql`create table if not exists dealer_rejections (
    dealer text not null,
    sku text not null,
    ts timestamptz not null default now(),
    primary key (dealer, sku)
  )`;
  await sql`create table if not exists runs (
    id bigserial primary key,
    dealer text null,
    total integer not null,
    exact integer not null,
    exact_pct numeric null,
    ts timestamptz not null default now()
  )`;
  await sql`create table if not exists ai_verdict_cache (
    content_hash text primary key,
    verdict jsonb not null,
    model text not null,
    catalog_version text null,
    created_at timestamptz not null default now()
  )`;
  // run_id ties each decision to one file upload (added after the initial release,
  // so applied as an idempotent ALTER — re-run /setup to pick it up).
  await sql`alter table decisions add column if not exists run_id text`;
  await sql`alter table decisions add column if not exists dealer text`;
  // Saved snapshot of each finished file's results (the run history list).
  await sql`create table if not exists run_snapshots (
    run_id text primary key,
    dealer text,
    file_name text,
    total integer not null default 0,
    matched integer not null default 0,
    review integer not null default 0,
    unmatched integer not null default 0,
    snapshot jsonb,
    ran_at timestamptz not null default now()
  )`;
  // 'in_progress' | 'reviewed'. Default 'reviewed' so existing rows (all written
  // by the old Done-only flow, hence finished) backfill correctly; every writer
  // passes status explicitly going forward.
  await sql`alter table run_snapshots add column if not exists status text not null default 'reviewed'`;
  await sql`create table if not exists dealers (
    key text primary key,
    name text not null,
    dms_type text null,
    created_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
  )`;
  // Weekly sales-ingest tables (see /api/v1/sales).
  await sql`create table if not exists ingest_batches (
    batch_id text primary key,
    idempotency_key text unique,
    store_id text not null,
    period_start date null,
    period_end date null,
    line_count integer not null default 0,
    distinct_skus integer not null default 0,
    new_parts integer not null default 0,
    status text not null default 'done',
    received_at timestamptz not null default now()
  )`;
  await sql`create table if not exists sales_lines (
    id bigserial primary key,
    batch_id text not null,
    store_id text not null,
    dealer_sku text not null,
    sku_description text null,
    op_code text null,
    op_description text null,
    vehicle_make text null,
    quantity_sold integer null,
    sale_date date null,
    cost numeric null,
    sale numeric null,
    ingested_at timestamptz not null default now()
  )`;
  await sql`create index if not exists sales_lines_store_sku on sales_lines (store_id, dealer_sku)`;
  await sql`create index if not exists sales_lines_store_date on sales_lines (store_id, sale_date)`;
  await sql`create table if not exists dealer_known_skus (
    dealer_key text not null,
    sku text not null,
    source text not null default 'decided',
    updated_at timestamptz not null default now(),
    primary key (dealer_key, sku)
  )`;
}
