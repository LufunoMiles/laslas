create schema if not exists private;
create table private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table private.admins enable row level security;
revoke all on private.admins from public, anon, authenticated;

create function public.is_store_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.admins where user_id = (select auth.uid())) $$;
revoke all on function public.is_store_admin() from public;
grant execute on function public.is_store_admin() to authenticated;

create table public.products (
  id integer generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 70),
  category text not null check (char_length(category) between 1 and 70),
  price numeric(10,2) not null check (price > 0),
  stock integer not null check (stock >= 0),
  icon text not null default 'fa-box' check (icon ~ '^fa-[a-z0-9-]+$'),
  image_url text not null default '' check (char_length(image_url) <= 2048 and (image_url = '' or image_url ~ '^https://'))
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  request_id uuid not null,
  date timestamptz not null default now(),
  customer text not null check (char_length(customer) between 1 and 120),
  phone text not null default '' check (char_length(phone) <= 40),
  payment text not null check (payment in ('Cash', 'Card', 'Mobile payment', 'EFT')),
  items jsonb not null default '[]',
  total numeric(14,2) not null default 0,
  unique (account_id, request_id)
);
alter table public.products enable row level security;
alter table public.orders enable row level security;
revoke all on public.products, public.orders from anon, authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select on public.orders to authenticated;
create policy products_read on public.products for select to authenticated using (true);
create policy products_admin on public.products for all to authenticated
using ((select public.is_store_admin())) with check ((select public.is_store_admin()));
create policy orders_read on public.orders for select to authenticated
using (account_id = (select auth.uid()) or (select public.is_store_admin()));

create function public.restock_product(product_id integer) returns void
language sql security invoker set search_path = ''
as $$ update public.products set stock = stock + 5 where id = product_id and (select public.is_store_admin()) $$;
revoke all on function public.restock_product(integer) from public;
grant execute on function public.restock_product(integer) to authenticated;

create function public.place_order(order_request uuid, customer_name text, customer_phone text, payment_method text, basket jsonb)
returns public.orders language plpgsql security definer set search_path = ''
as $$
declare
  result public.orders;
  product public.products;
  item record;
  contents jsonb := '[]';
  amount numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign-in required' using errcode = '42501';
  end if;
  if basket is null or jsonb_typeof(basket) <> 'array' then
    raise exception 'Invalid basket' using errcode = '22023';
  end if;
  if jsonb_array_length(basket) not between 1 and 100 then
    raise exception 'Invalid basket size' using errcode = '22023';
  end if;

  insert into public.orders(account_id, request_id, customer, phone, payment)
  values (auth.uid(), order_request, customer_name, customer_phone, payment_method)
  on conflict (account_id, request_id) do nothing
  returning * into result;
  if not found then
    select * into strict result from public.orders where account_id = auth.uid() and request_id = order_request;
    return result;
  end if;

  for item in select entry.id, entry.qty
    from jsonb_to_recordset(basket) as entry(id integer, qty integer) order by entry.id
  loop
    if item.id is null or item.qty is null or item.qty not between 1 and 10000 then
      raise exception 'Invalid basket item' using errcode = '22023';
    end if;
    update public.products set stock = stock - item.qty
      where id = item.id and stock >= item.qty returning * into product;
    if not found then
      raise exception 'Stock changed. Please review your basket.' using errcode = 'P0001';
    end if;
    amount := amount + product.price * item.qty;
    contents := contents || jsonb_build_array(jsonb_build_object(
      'name', product.name, 'price', product.price, 'qty', item.qty
    ));
  end loop;
  update public.orders set total = amount, items = contents where id = result.id returning * into result;
  return result;
end;
$$;
revoke all on function public.place_order(uuid, text, text, text, jsonb) from public;
grant execute on function public.place_order(uuid, text, text, text, jsonb) to authenticated;
