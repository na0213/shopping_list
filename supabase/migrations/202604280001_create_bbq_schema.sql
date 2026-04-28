create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_event_created_by_change()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed';
  end if;

  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  year integer not null check (year between 2000 and 2100),
  budget integer not null default 0 check (budget >= 0),
  note text check (note is null or char_length(note) <= 2000),
  status text not null default 'active' check (status in ('active', 'completed')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_members (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text check (category is null or char_length(category) <= 80),
  planned_quantity numeric check (planned_quantity is null or planned_quantity >= 0),
  actual_quantity numeric check (actual_quantity is null or actual_quantity >= 0),
  unit_price integer check (unit_price is null or unit_price >= 0),
  actual_price integer check (actual_price is null or actual_price >= 0),
  last_year_price integer check (last_year_price is null or last_year_price >= 0),
  note text check (note is null or char_length(note) <= 2000),
  is_checked boolean not null default false,
  is_extra boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_created_by_idx on public.events (created_by);
create index events_year_idx on public.events (year);
create index event_members_user_id_idx on public.event_members (user_id);
create index shopping_items_event_id_idx on public.shopping_items (event_id);
create index shopping_items_event_sort_idx on public.shopping_items (event_id, sort_order, created_at);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger prevent_event_created_by_change
before update on public.events
for each row execute function public.prevent_event_created_by_change();

create trigger set_event_members_updated_at
before update on public.event_members
for each row execute function public.set_updated_at();

create trigger set_shopping_items_updated_at
before update on public.shopping_items
for each row execute function public.set_updated_at();

create or replace function public.is_event_member(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_members em
    where em.event_id = target_event_id
      and em.user_id = auth.uid()
  );
$$;

create or replace function public.is_event_owner(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_members em
    where em.event_id = target_event_id
      and em.user_id = auth.uid()
      and em.role = 'owner'
  );
$$;

create or replace function public.shares_event_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id = auth.uid()
    or exists (
      select 1
      from public.event_members current_user_membership
      join public.event_members target_user_membership
        on target_user_membership.event_id = current_user_membership.event_id
      where current_user_membership.user_id = auth.uid()
        and target_user_membership.user_id = target_user_id
    );
$$;

create or replace function public.add_event_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.event_members (event_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (event_id, user_id) do update
    set role = 'owner',
        updated_at = now();

  return new;
end;
$$;

create trigger add_event_owner_membership
after insert on public.events
for each row execute function public.add_event_owner_membership();

revoke execute on function public.set_updated_at() from public;
revoke execute on function public.prevent_event_created_by_change() from public;
revoke execute on function public.is_event_member(uuid) from public;
revoke execute on function public.is_event_owner(uuid) from public;
revoke execute on function public.shares_event_with(uuid) from public;
revoke execute on function public.add_event_owner_membership() from public;

grant execute on function public.is_event_member(uuid) to authenticated;
grant execute on function public.is_event_owner(uuid) to authenticated;
grant execute on function public.shares_event_with(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.shopping_items enable row level security;
alter table public.event_members enable row level security;

revoke all on public.profiles from anon;
revoke all on public.events from anon;
revoke all on public.shopping_items from anon;
revoke all on public.event_members from anon;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.shopping_items to authenticated;
grant select, insert, update, delete on public.event_members to authenticated;

create policy "profiles_select_visible_users"
on public.profiles
for select
to authenticated
using (public.shares_event_with(id));

create policy "profiles_insert_own_profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_own_profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "events_select_members"
on public.events
for select
to authenticated
using (public.is_event_member(id));

create policy "events_insert_authenticated_creator"
on public.events
for insert
to authenticated
with check (created_by = auth.uid());

create policy "events_update_members"
on public.events
for update
to authenticated
using (public.is_event_member(id))
with check (public.is_event_member(id));

create policy "events_delete_owners"
on public.events
for delete
to authenticated
using (public.is_event_owner(id));

create policy "shopping_items_select_event_members"
on public.shopping_items
for select
to authenticated
using (public.is_event_member(event_id));

create policy "shopping_items_insert_event_members"
on public.shopping_items
for insert
to authenticated
with check (public.is_event_member(event_id));

create policy "shopping_items_update_event_members"
on public.shopping_items
for update
to authenticated
using (public.is_event_member(event_id))
with check (public.is_event_member(event_id));

create policy "shopping_items_delete_event_members"
on public.shopping_items
for delete
to authenticated
using (public.is_event_member(event_id));

create policy "event_members_select_same_event_members"
on public.event_members
for select
to authenticated
using (public.is_event_member(event_id));

create policy "event_members_insert_event_owners"
on public.event_members
for insert
to authenticated
with check (public.is_event_owner(event_id));

create policy "event_members_update_event_owners"
on public.event_members
for update
to authenticated
using (public.is_event_owner(event_id))
with check (public.is_event_owner(event_id));

create policy "event_members_delete_event_owners"
on public.event_members
for delete
to authenticated
using (public.is_event_owner(event_id));
