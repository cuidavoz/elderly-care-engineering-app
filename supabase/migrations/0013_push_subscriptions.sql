-- CuidaVoz — infraestructura Web Push para notificaciones.
--
-- Guarda suscripciones Push API por adulto mayor y usuario autenticado. La web
-- escribe con la sesión del usuario (RLS activa); el service/dispatcher futuro
-- podrá leer estas filas para enviar recordatorios o followups.
-- ----------------------------------------------------------------------------

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  elder_id    uuid not null references public.elders (id) on delete cascade,
  family_id   uuid not null references public.families (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  estado      text not null default 'activa'
              check (estado in ('activa', 'inactiva')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_push_subscriptions_elder
  on public.push_subscriptions (elder_id, estado, updated_at desc);

create index idx_push_subscriptions_profile
  on public.push_subscriptions (profile_id, estado, updated_at desc);

-- Un endpoint de Push pertenece al navegador/service worker, no a una persona.
-- Por eso puede repetirse si el mismo browser se usa con más de una cuenta.
create unique index uniq_push_subscriptions_profile_elder_endpoint
  on public.push_subscriptions (profile_id, elder_id, endpoint);

alter table public.push_subscriptions enable row level security;

-- Miembros de la familia pueden leer suscripciones de esa familia. Esto permite
-- a la pantalla del adulto y a futuros paneles saber si ya hay un dispositivo.
create policy "push_subscriptions: miembros leen" on public.push_subscriptions
  for select using (public.is_family_member(family_id));

-- Cada usuario puede registrar sus propios dispositivos en familias propias.
create policy "push_subscriptions: usuario crea propias" on public.push_subscriptions
  for insert with check (
    profile_id = public.current_user_id()
    and public.is_family_member(family_id)
  );

-- Cada usuario puede refrescar o desactivar sus propias suscripciones.
create policy "push_subscriptions: usuario actualiza propias" on public.push_subscriptions
  for update using (
    profile_id = public.current_user_id()
    and public.is_family_member(family_id)
  )
  with check (
    profile_id = public.current_user_id()
    and public.is_family_member(family_id)
  );

create policy "push_subscriptions: usuario borra propias" on public.push_subscriptions
  for delete using (
    profile_id = public.current_user_id()
    and public.is_family_member(family_id)
  );

grant select, insert, update, delete on public.push_subscriptions to authenticated;
