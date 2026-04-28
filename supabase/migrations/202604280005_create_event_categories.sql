create table if not exists public.event_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_categories_event_sort_idx
on public.event_categories (event_id, sort_order, created_at);

create unique index if not exists event_categories_event_name_unique
on public.event_categories (event_id, lower(name));

drop trigger if exists set_event_categories_updated_at on public.event_categories;
create trigger set_event_categories_updated_at
before update on public.event_categories
for each row execute function public.set_updated_at();

alter table public.event_categories enable row level security;

revoke all on public.event_categories from anon;
grant select, insert, update, delete on public.event_categories to authenticated;

drop policy if exists "event_categories_select_event_members" on public.event_categories;
create policy "event_categories_select_event_members"
on public.event_categories
for select
to authenticated
using (public.is_event_member(event_id));

drop policy if exists "event_categories_insert_event_members" on public.event_categories;
create policy "event_categories_insert_event_members"
on public.event_categories
for insert
to authenticated
with check (public.is_event_member(event_id));

drop policy if exists "event_categories_update_event_members" on public.event_categories;
create policy "event_categories_update_event_members"
on public.event_categories
for update
to authenticated
using (public.is_event_member(event_id))
with check (public.is_event_member(event_id));

drop policy if exists "event_categories_delete_event_members" on public.event_categories;
create policy "event_categories_delete_event_members"
on public.event_categories
for delete
to authenticated
using (public.is_event_member(event_id));

insert into public.event_categories (event_id, name, sort_order)
select existing_categories.event_id,
       existing_categories.name,
       existing_categories.sort_order
from (
  select normalized_categories.event_id,
         normalized_categories.name,
         (row_number() over (
           partition by normalized_categories.event_id
           order by lower(normalized_categories.name)
         ))::integer - 1 as sort_order
  from (
    select distinct event_id,
           btrim(category) as name
    from public.shopping_items
    where category is not null
      and btrim(category) <> ''
  ) normalized_categories
) existing_categories
where not exists (
  select 1
  from public.event_categories current_categories
  where current_categories.event_id = existing_categories.event_id
    and lower(current_categories.name) = lower(existing_categories.name)
);

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_categories'
  ) then
    alter publication supabase_realtime add table public.event_categories;
  end if;
end $$;
