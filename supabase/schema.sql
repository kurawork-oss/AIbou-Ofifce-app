-- AIbou Office 用 Supabaseスキーマ
-- SupabaseダッシュボードのSQL Editorで実行してください。

-- 会社全体のスナップショット(バックアップ・外部ダッシュボード用)
create table if not exists company_state (
  id integer primary key default 1,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- AI社員の記憶保管庫(Googleメールアドレスごとに蓄積)
create table if not exists employee_memories (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  employee_name text,
  google_email text not null,
  category text not null default 'work', -- work / meeting / break / approval / system
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_memories_email
  on employee_memories (google_email, created_at desc);

-- ⚠️ デモ用のRLSポリシー(anonキーで読み書き可)。
-- 本番運用ではSupabase Authを導入し、ポリシーを絞ってください。
alter table company_state enable row level security;
alter table employee_memories enable row level security;

drop policy if exists "demo full access state" on company_state;
create policy "demo full access state" on company_state
  for all using (true) with check (true);

drop policy if exists "demo full access memories" on employee_memories;
create policy "demo full access memories" on employee_memories
  for all using (true) with check (true);
