-- PinSphere: universal pin editing, scoped removal, and guarded global deletion.
-- Run this entire script in Supabase SQL Editor using the postgres role.
-- This installs permissions/functions/triggers; it does not rewrite existing data.

begin;

-- Existing indexes contain no pin_id index. All permission checks use pin_id.
create index if not exists pinsphere_pin_maps_pin_id_idx
    on public.pin_maps (pin_id);

-- Helpers use the caller's authenticated identity, never a supplied user ID.
-- SECURITY DEFINER avoids recursive pins <-> pin_maps RLS evaluation.
create or replace function public.can_access_pin(p_pin_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
    select auth.uid() is not null and (
        exists (
            select 1 from public.pins p
            where p.id = p_pin_id and p.user_id = auth.uid()
        )
        or exists (
            select 1
            from public.pin_maps pm
            left join public.submaps sm on sm.id = pm.submap_id
            where pm.pin_id = p_pin_id
              and (
                  public.is_map_owner(coalesce(pm.map_id, sm.map_id), auth.uid())
                  or public.is_map_collaborator(coalesce(pm.map_id, sm.map_id), auth.uid())
              )
        )
    );
$function$;

create or replace function public.can_edit_pin(p_pin_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
    select auth.uid() is not null and exists (
        select 1
        from public.pin_maps pm
        left join public.submaps sm on sm.id = pm.submap_id
        where pm.pin_id = p_pin_id
          and public.is_map_editor(coalesce(pm.map_id, sm.map_id), auth.uid())
    );
$function$;

-- Eligibility reveals only a boolean, not hidden destinations or their counts.
-- A creator may delete an unassigned pin (including failed-create cleanup).
-- For linked pins, creator identity does not override destination permissions.
create or replace function public.can_delete_pin_everywhere(p_pin_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
    v_creator uuid;
begin
    if auth.uid() is null then
        return false;
    end if;

    select p.user_id into v_creator
    from public.pins p where p.id = p_pin_id;
    if not found then
        return false;
    end if;

    if not exists (
        select 1 from public.pin_maps pm where pm.pin_id = p_pin_id
    ) then
        return v_creator = auth.uid();
    end if;

    return not exists (
        select 1
        from public.pin_maps pm
        left join public.submaps sm on sm.id = pm.submap_id
        where pm.pin_id = p_pin_id
          and public.is_map_editor(
              coalesce(pm.map_id, sm.map_id), auth.uid()
          ) is distinct from true
    );
end;
$function$;

-- All connection writes take the parent pin's row lock. This prevents a
-- concurrent attachment from arriving between a global-delete check and delete.
-- Cascading deletes can find no remaining parent row; that is intentionally OK.
create or replace function public.pinsphere_lock_pin_connections()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
    if tg_op = 'INSERT' then
        perform p.id from public.pins p where p.id = new.pin_id for update;
    elsif tg_op = 'UPDATE' then
        perform p.id from public.pins p
        where p.id in (old.pin_id, new.pin_id)
        order by p.id for update;
    else
        perform p.id from public.pins p where p.id = old.pin_id for update;
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$function$;

create or replace trigger pinsphere_lock_pin_connections
before insert or update or delete on public.pin_maps
for each row execute function public.pinsphere_lock_pin_connections();

-- Protect direct DELETE as well as the RPC. Pin row locking excludes concurrent
-- connection writes; brief SHARE locks exclude concurrent permission changes
-- and submap moves while the final deletion check is made.
create or replace function public.pinsphere_guard_pin_delete()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
    -- Preserve administrative/service operations without an end-user JWT.
    -- Anonymous clients still have no pin DELETE access through RLS.
    if auth.uid() is null then
        return old;
    end if;

    lock table public.maps, public.submaps, public.map_collaborators
        in share mode;

    if not public.can_delete_pin_everywhere(old.id) then
        raise exception 'You cannot delete this pin everywhere';
    end if;
    return old;
end;
$function$;

create or replace trigger pinsphere_guard_pin_delete
before delete on public.pins
for each row execute function public.pinsphere_guard_pin_delete();

-- RPC: recheck eligibility inside the deletion transaction.
create or replace function public.delete_pin_everywhere(p_pin_id bigint)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
    if auth.uid() is null then
        return false;
    end if;

    perform p.id from public.pins p where p.id = p_pin_id for update;
    if not found then
        return false;
    end if;

    lock table public.maps, public.submaps, public.map_collaborators
        in share mode;

    if not public.can_delete_pin_everywhere(p_pin_id) then
        return false;
    end if;

    delete from public.pins p where p.id = p_pin_id;
    return found;
end;
$function$;

-- RPC: remove only this map's direct and submap connections. Keep the pin.
create or replace function public.remove_pin_from_map(
    p_pin_id bigint,
    p_map_id bigint
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
    if auth.uid() is null then
        return false;
    end if;

    perform p.id from public.pins p where p.id = p_pin_id for update;
    if not found then
        return false;
    end if;

    lock table public.maps, public.submaps, public.map_collaborators
        in share mode;

    if not public.is_map_editor(p_map_id, auth.uid()) then
        return false;
    end if;

    delete from public.pin_maps pm
    where pm.pin_id = p_pin_id
      and (
          pm.map_id = p_map_id
          or exists (
              select 1 from public.submaps sm
              where sm.id = pm.submap_id and sm.map_id = p_map_id
          )
      );
    return found;
end;
$function$;

-- RPC: remove only one submap connection. Keep every other connection.
create or replace function public.remove_pin_from_submap(
    p_pin_id bigint,
    p_submap_id bigint
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
    v_map_id bigint;
begin
    if auth.uid() is null then
        return false;
    end if;

    perform p.id from public.pins p where p.id = p_pin_id for update;
    if not found then
        return false;
    end if;

    lock table public.maps, public.submaps, public.map_collaborators
        in share mode;

    select sm.map_id into v_map_id
    from public.submaps sm where sm.id = p_submap_id;
    if not found or not public.is_map_editor(v_map_id, auth.uid()) then
        return false;
    end if;

    delete from public.pin_maps pm
    where pm.pin_id = p_pin_id and pm.submap_id = p_submap_id;
    return found;
end;
$function$;

-- Change only the four existing pin-write policies; leave SELECT and INSERT
-- on pins, and all map/submap/collaboration/invitation policies unchanged.
alter policy "Users can update accessible pins" on public.pins
using (public.can_edit_pin(id))
with check (public.can_edit_pin(id));

alter policy "Users can delete accessible pins" on public.pins
using (public.can_delete_pin_everywhere(id));

alter policy "Owners and editors can create pin connections" on public.pin_maps
with check (
    public.can_access_pin(pin_id)
    and (
        (map_id is not null and public.is_map_editor(map_id, auth.uid()))
        or (
            submap_id is not null and exists (
                select 1 from public.submaps sm
                where sm.id = pin_maps.submap_id
                  and public.is_map_editor(sm.map_id, auth.uid())
            )
        )
    )
);

alter policy "Owners and editors can delete pin connections" on public.pin_maps
using (
    (map_id is not null and public.is_map_editor(map_id, auth.uid()))
    or (
        submap_id is not null and exists (
            select 1 from public.submaps sm
            where sm.id = pin_maps.submap_id
              and public.is_map_editor(sm.map_id, auth.uid())
        )
    )
);

-- Remove broad UPDATE permission before granting only content columns.
-- Clear any existing column grants as well as the supplied table grants.
revoke update on public.pins from public, anon, authenticated;
revoke update (id, user_id, name, notes, longitude, latitude)
    on public.pins from public, anon, authenticated;
grant update (name, notes, longitude, latitude)
    on public.pins to authenticated;

-- TRUNCATE bypasses RLS. Client roles also must not install their own triggers.
revoke truncate, trigger on public.pins, public.pin_maps
    from public, anon, authenticated;

revoke execute on function public.can_access_pin(bigint),
    public.can_edit_pin(bigint),
    public.can_delete_pin_everywhere(bigint),
    public.delete_pin_everywhere(bigint),
    public.remove_pin_from_map(bigint, bigint),
    public.remove_pin_from_submap(bigint, bigint)
    from public, anon;

grant execute on function public.can_access_pin(bigint),
    public.can_edit_pin(bigint),
    public.can_delete_pin_everywhere(bigint),
    public.delete_pin_everywhere(bigint),
    public.remove_pin_from_map(bigint, bigint),
    public.remove_pin_from_submap(bigint, bigint)
    to authenticated;

-- Trigger functions are invoked by PostgreSQL, not through client RPC calls.
revoke execute on function public.pinsphere_lock_pin_connections(),
    public.pinsphere_guard_pin_delete()
    from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
