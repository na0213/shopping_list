alter table public.shopping_items
add column if not exists last_year_price_excluding_tax integer;

update public.shopping_items
set last_year_price_excluding_tax = round((last_year_price * 100.0) / (100 + tax_rate))::integer
where last_year_price is not null
  and tax_rate in (8, 10)
  and last_year_price_excluding_tax is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shopping_items_last_year_price_excluding_tax_nonnegative'
  ) then
    alter table public.shopping_items
    add constraint shopping_items_last_year_price_excluding_tax_nonnegative
    check (
      last_year_price_excluding_tax is null
      or last_year_price_excluding_tax >= 0
    );
  end if;
end;
$$;
