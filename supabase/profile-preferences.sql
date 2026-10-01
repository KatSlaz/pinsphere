-- Run once in the Supabase SQL Editor. No frontend changes are included.
begin;

-- Stop if the supplied policy snapshot no longer matches the database.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  ) then
    raise exception 'profiles already has policies; review them before running this migration';
  end if;
end
$$;

alter table public.profiles
  add column theme text not null default 'system',
  add column map_style text not null default 'fiord',
  add constraint profiles_theme_check
    check (theme in ('light', 'dark', 'system')),
  add constraint profiles_map_style_check
    check (map_style in ('fiord', 'dark', 'bright', 'liberty', 'positron'));

alter table public.profiles enable row level security;

-- Limit client privileges on this table only. Clear column grants as well.
revoke all privileges on table public.profiles
  from public, anon, authenticated;
revoke all privileges (id, username, theme, map_style)
  on table public.profiles from public, anon, authenticated;

grant select (id, theme, map_style)
  on table public.profiles to authenticated;
grant insert (id, theme, map_style)
  on table public.profiles to authenticated;
grant update (theme, map_style)
  on table public.profiles to authenticated;

create policy profiles_select_own
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

-- Create missing rows after authentication, importing local preferences once.
create policy profiles_insert_own
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

commit;
