-- CuidaVoz — estado accionable de las alertas (gestión por el cuidador).

create type public.alert_status as enum ('pendiente', 'vista', 'resuelta');

alter table public.alerts
  add column estado       public.alert_status not null default 'pendiente',
  add column resuelta_por  uuid references public.profiles (id),
  add column resuelta_at   timestamptz;

-- El cuidador (miembro de la familia) puede cambiar el estado de una alerta.
create policy "alerts: miembros actualizan" on public.alerts
  for update using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

grant update on public.alerts to authenticated;
