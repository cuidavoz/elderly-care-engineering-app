-- CuidaVoz — Hardening de seguridad (RLS + RPC). Surge de una auditoría
-- adversarial de aislamiento multi-tenant. Tres correcciones independientes:
--
-- 1) [ALTO] La policy de INSERT de `family_members` solo validaba que el
--    family_id fuera de una familia del usuario, pero NO que el profile_id fuera
--    el propio. Un miembro de la familia A podía insertar a CUALQUIER profile_id
--    (incl. auto-asignarse rol 'owner', o meter a un tercero sin invitación),
--    sorteando el flujo de `accept_invite`. Se restringe a uno mismo.
--    (El alta legítima de cuidadores pasa por el RPC `accept_invite`, que es
--     security-definer y bypassa RLS, así que NO se ve afectada.)
--
-- 2) [BAJO] La policy de UPDATE de `families` se llamaba "owner edita" pero
--    permitía editar a cualquier miembro. Se restringe a 'owner' de verdad, vía
--    un helper security-definer (evita recursión de RLS al consultar
--    family_members dentro de la policy, igual que is_family_member).
--
-- 3) [BAJO] `accept_invite` no expiraba los tokens: una invitación pendiente
--    valía para siempre. Se agrega una ventana de 14 días.

-- ----------------------------------------------------------------------------
-- 1) family_members: solo podés agregarte a VOS MISMO a una familia tuya.
-- ----------------------------------------------------------------------------
drop policy if exists "miembros: agregar a mi familia" on public.family_members;
create policy "miembros: agregar a mi familia" on public.family_members
  for insert with check (
    public.is_family_member(family_id)
    and profile_id = (select auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 2) families: editar solo si sos 'owner' de esa familia.
-- ----------------------------------------------------------------------------
create or replace function public.is_family_owner(_family_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members
    where family_id = _family_id
      and profile_id = auth.uid()
      and rol = 'owner'
  );
$$;
grant execute on function public.is_family_owner(uuid) to authenticated;

drop policy if exists "familias: owner edita" on public.families;
create policy "familias: owner edita" on public.families
  for update using (public.is_family_owner(id))
  with check (public.is_family_owner(id));

-- ----------------------------------------------------------------------------
-- 3) accept_invite: expira invitaciones pendientes a los 14 días.
-- ----------------------------------------------------------------------------
create or replace function public.accept_invite(_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invites%rowtype;
  cuenta_email text;
begin
  -- 1) Buscar la invitación pendiente por token (no vencida: ventana 14 días).
  select * into invite
  from public.invites
  where token = _token
    and status = 'pendiente'
    and created_at > now() - interval '14 days';

  if not found then
    raise exception 'Invitación inválida, vencida o ya utilizada';
  end if;

  -- 2) El email de la invitación debe coincidir con la cuenta logueada.
  select email into cuenta_email
  from public.profiles
  where id = auth.uid();

  if lower(invite.email) is distinct from lower(cuenta_email) then
    raise exception 'Esta invitación es para otra cuenta de correo';
  end if;

  -- 3) Sumar al invitado como miembro (idempotente si ya lo fuera).
  insert into public.family_members (family_id, profile_id, rol)
  values (invite.family_id, auth.uid(), invite.rol)
  on conflict (family_id, profile_id) do nothing;

  -- 4) Marcar la invitación como aceptada.
  update public.invites
  set status = 'aceptada',
      accepted_at = now(),
      accepted_by = auth.uid()
  where id = invite.id;

  -- 5) Devolver la familia a la que se unió (para redirigir en el web app).
  return invite.family_id;
end;
$$;
