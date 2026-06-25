-- CuidaVoz — Flujo de invitaciones (F9.2): preview + rechazo + hardening de FKs.
--
-- Contexto: el invitado todavía NO es miembro de la familia, así que la RLS de
-- `invites` no le deja leer su propia invitación (igual que en 0004). Por eso
-- tanto ver el detalle como aceptar/rechazar pasan por funciones security-definer
-- que validan que el email de la invitación coincida con la cuenta logueada.
--
-- Tres cambios independientes:
--   1) get_invite_preview: datos para mostrar el popup "X te invita a Y" SIN aceptar.
--   2) reject_invite: el invitado rechaza (marca la invitación como 'revocada').
--   3) Hardening de FKs hacia profiles: invites.accepted_by y alerts.resuelta_por
--      pasan a ON DELETE SET NULL, así borrar un usuario no se bloquea por filas
--      que solo lo referencian de forma accesoria (ver incidente "Database error
--      deleting user").

-- ----------------------------------------------------------------------------
-- 1) get_invite_preview: detalle de la invitación para la pantalla de aceptación.
--    Devuelve 0 filas si el token no existe; 1 fila si existe. No lanza error:
--    la UI decide qué mostrar según los flags (email_matches, already_member,
--    status, is_expired).
-- ----------------------------------------------------------------------------
create or replace function public.get_invite_preview(_token text)
returns table (
  family_id      uuid,
  family_nombre  text,
  inviter_nombre text,
  inviter_email  text,
  rol            public.family_role,
  invite_email   text,
  status         public.invite_status,
  is_expired     boolean,
  email_matches  boolean,
  already_member boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    f.id                                                            as family_id,
    f.nombre                                                        as family_nombre,
    p.nombre                                                        as inviter_nombre,
    p.email                                                         as inviter_email,
    i.rol                                                           as rol,
    i.email                                                         as invite_email,
    i.status                                                        as status,
    (i.created_at <= now() - interval '14 days')                    as is_expired,
    (lower(i.email) = lower(coalesce(
       (select email from public.profiles where id = auth.uid()), ''))) as email_matches,
    exists (
      select 1 from public.family_members m
      where m.family_id = i.family_id
        and m.profile_id = auth.uid()
    )                                                               as already_member
  from public.invites i
  join public.families f      on f.id = i.family_id
  left join public.profiles p on p.id = i.invited_by
  where i.token = _token;
$$;

grant execute on function public.get_invite_preview(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) reject_invite: el invitado rechaza la invitación (queda 'revocada', sale de
--    la lista de pendientes). Valida vigencia y que el email coincida, igual que
--    accept_invite.
-- ----------------------------------------------------------------------------
create or replace function public.reject_invite(_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invites%rowtype;
  cuenta_email text;
begin
  select * into invite
  from public.invites
  where token = _token
    and status = 'pendiente';

  if not found then
    raise exception 'Invitación inválida o ya utilizada';
  end if;

  select email into cuenta_email
  from public.profiles
  where id = auth.uid();

  if lower(invite.email) is distinct from lower(cuenta_email) then
    raise exception 'Esta invitación es para otra cuenta de correo';
  end if;

  update public.invites
  set status = 'revocada'
  where id = invite.id;
end;
$$;

grant execute on function public.reject_invite(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) Hardening de FKs hacia profiles (ON DELETE SET NULL).
--    Antes quedaban en NO ACTION: una invitación aceptada o una alerta resuelta
--    por un usuario impedían borrar ese usuario. Estas referencias son
--    accesorias (registro histórico de "quién"), así que setear NULL al borrar
--    es correcto y no rompe integridad de tenant.
-- ----------------------------------------------------------------------------
alter table public.invites drop constraint if exists invites_accepted_by_fkey;
alter table public.invites
  add constraint invites_accepted_by_fkey
  foreign key (accepted_by) references public.profiles (id) on delete set null;

alter table public.alerts drop constraint if exists alerts_resuelta_por_fkey;
alter table public.alerts
  add constraint alerts_resuelta_por_fkey
  foreign key (resuelta_por) references public.profiles (id) on delete set null;
