create table if not exists public.sync_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tasks jsonb not null default '[]'::jsonb,
  recurring_tasks jsonb not null default '[]'::jsonb,
  day_notes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.sync_data enable row level security;

create policy "select own sync data" on public.sync_data for select using (auth.uid() = user_id);
create policy "insert own sync data" on public.sync_data for insert with check (auth.uid() = user_id);
create policy "update own sync data" on public.sync_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.sync_data to authenticated;

create table if not exists public.habit_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"habits":[],"entries":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.habit_data enable row level security;

create policy "select own habit data" on public.habit_data for select using (auth.uid() = user_id);
create policy "insert own habit data" on public.habit_data for insert with check (auth.uid() = user_id);
create policy "update own habit data" on public.habit_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.habit_data to authenticated;

notify pgrst, 'reload schema';

-- Planificateur à horizons (remplace sync_data pour les tâches).
create table if not exists public.planner_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.planner_data enable row level security;
create policy "select own planner_data" on public.planner_data
  for select to authenticated using (auth.uid() = user_id);
create policy "insert own planner_data" on public.planner_data
  for insert to authenticated with check (auth.uid() = user_id);
create policy "update own planner_data" on public.planner_data
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.planner_data to authenticated;
alter publication supabase_realtime add table public.planner_data;
notify pgrst, 'reload schema';
