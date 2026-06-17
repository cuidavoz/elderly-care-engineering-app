-- CuidaVoz — invitaciones de cuidadores a una familia (F9.1).
--
-- Flujo: un miembro de la familia invita por email; se genera una fila en
-- `invites` con un token único. El invitado, ya logueado, acepta vía el RPC
-- `accept_invite(token)` y queda como miembro (family_members).
--
-- Decisión clave de RLS: el invitado TODAVÍA no es miembro de la familia, así
-- que la RLS de `invites` no le deja leer su propia invitación por token. Por
-- eso la aceptación pasa por un RPC security-definer (bypassa RLS de forma
-- controlada y valida que el email coincida con la cuenta logueada).

-- ----------------------------------------------------------------------------
-- Tipos
-- ----------------------------------------------------------------------------
create type public.invite_status as enum ('pendiente', 'aceptada', 'revocada');

-- ----------------------------------------------------------------------------
-- invites: invitación pendiente/aceptada/revocada a una familia
-- ----------------------------------------------------------------------------
create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families (id) on delete cascade,
  email        text not null,
  rol          public.family_role not null default 'caregiver',
  -- token opaco para el link de aceptación (uuid sin guiones, único).
  token        text not null unique default replace(gen_random_uuid()::text, '-', ''),
  invited_by   uuid not null references public.profiles (id),
  status       public.invite_status not null default 'pendiente',
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  accepted_by  uuid references public.profiles (id)
);
create index idx_invites_family on public.invites (family_id, status);

-- ----------------------------------------------------------------------------
-- Helpers security-definer
-- ----------------------------------------------------------------------------

-- ¿auth.uid() y _profile_id comparten al menos una familia? Self-join sobre
-- family_members. Security-definer + search_path='' como is_family_member,
-- para evitar recursión de RLS al usarse dentro de una policy de profiles.
create or replace function public.shares_family_with(_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members me
    join public.family_members other on other.family_id = me.family_id
    where me.profile_id = auth.uid()
      and other.profile_id = _profile_id
  );
$$;

-- Único camino de aceptación de una invitación. Es security-definer porque el
-- invitado no es miembro todavía y la RLS de `invites` no le deja leer la fila.
-- Valida que el email de la invitación coincida con el de la cuenta logueada.
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
  -- 1) Buscar la invitación pendiente por token.
  select * into invite
  from public.invites
  where token = _token
    and status = 'pendiente';

  if not found then
    raise exception 'Invitación inválida o ya utilizada';
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

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.invites enable row level security;

-- invites: gestionables solo por miembros de la familia. La aceptación NO pasa
-- por estas policies (va por el RPC security-definer accept_invite).
create policy "invites: miembros ven" on public.invites
  for select using (public.is_family_member(family_id));
create policy "invites: miembros crean" on public.invites
  for insert with check (
    public.is_family_member(family_id)
    and invited_by = (select auth.uid())
  );
-- Update habilita revocar (setear status='revocada').
create policy "invites: miembros actualizan" on public.invites
  for update using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- profiles: policy `select` ADICIONAL (se combina por OR con "perfil propio:
-- ver" de 0001). Permite ver nombre/email de los co-miembros de mis familias,
-- necesario para mostrar quién invitó / quién aceptó.
create policy "perfil: ver co-miembros" on public.profiles
  for select using (public.shares_family_with(id));

-- ----------------------------------------------------------------------------
-- GRANTs (sin ellos, el rol `authenticated` recibe 42501 permission denied)
-- ----------------------------------------------------------------------------
grant select, insert, update on public.invites to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.shares_family_with(uuid) to authenticated;
