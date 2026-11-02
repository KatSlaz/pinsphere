-- PinSphere: scoped pin removal. Apply after pin-permissions.sql.
-- Records the reviewed migration already installed in Supabase; do not rerun
-- against that database. Run once as postgres when setting up another database.

begin;

create function public.delete_pin_from_editable_maps(p_pin_id bigint)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
    v_user_id uuid := auth.uid();
    v_removed bigint;
begin
    if v_user_id is null then
        return false;
    end if;

    -- Reject callers without an editable connection before taking locks.
    if not public.can_edit_pin(p_pin_id) then
        return false;
    end if;

    -- Follow the existing pin RPC lock order.
    -- Connection-write triggers acquire this same parent-pin lock.
    perform p.id
    from public.pins p
    where p.id = p_pin_id
    for update;

    if not found then
        return false;
    end if;

    -- Stabilize ownership, collaboration roles, and submap parents.
    lock table public.maps, public.submaps, public.map_collaborators
        in share mode;

    -- Permissions may have changed while waiting for locks.
    if not public.can_edit_pin(p_pin_id) then
        return false;
    end if;

    delete from public.pin_maps pm
    where pm.pin_id = p_pin_id
      and (
          (
              pm.map_id is not null
              and public.is_map_editor(pm.map_id, v_user_id)
          )
          or (
              pm.submap_id is not null
              and exists (
                  select 1
                  from public.submaps sm
                  where sm.id = pm.submap_id
                    and public.is_map_editor(sm.map_id, v_user_id)
              )
          )
      );

    get diagnostics v_removed = row_count;

    if v_removed = 0 then
        return false;
    end if;

    -- Inspect every connection, including connections hidden by client RLS.
    -- Cleanup must also satisfy existing pin-deletion authorization.
    if not exists (
        select 1
        from public.pin_maps pm
        where pm.pin_id = p_pin_id
    ) and public.can_delete_pin_everywhere(p_pin_id) then
        delete from public.pins p
        where p.id = p_pin_id;
    end if;

    -- Reveal neither remaining memberships nor whether cleanup occurred.
    return true;
end;
$function$;

alter function public.delete_pin_from_editable_maps(bigint)
    owner to postgres;

revoke all privileges
    on function public.delete_pin_from_editable_maps(bigint)
    from public, anon, authenticated;

grant execute
    on function public.delete_pin_from_editable_maps(bigint)
    to authenticated;

notify pgrst, 'reload schema';

commit;
