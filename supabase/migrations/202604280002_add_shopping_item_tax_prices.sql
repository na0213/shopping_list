alter table public.shopping_items
add column if not exists actual_price_excluding_tax integer,
add column if not exists tax_rate integer not null default 10;

update public.shopping_items
set tax_rate = 10
where tax_rate is null;

alter table public.shopping_items
alter column tax_rate set default 10,
alter column tax_rate set not null;

update public.shopping_items
set actual_price_excluding_tax = round((actual_price * 100.0) / (100 + tax_rate))::integer
where actual_price is not null
  and actual_price_excluding_tax is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shopping_items_actual_price_excluding_tax_nonnegative'
  ) then
    alter table public.shopping_items
    add constraint shopping_items_actual_price_excluding_tax_nonnegative
    check (
      actual_price_excluding_tax is null
      or actual_price_excluding_tax >= 0
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'shopping_items_tax_rate_allowed'
  ) then
    alter table public.shopping_items
    add constraint shopping_items_tax_rate_allowed
    check (tax_rate in (8, 10));
  end if;
end;
$$;
