-- CuidaVoz — followups: preguntas de seguimiento proactivo (P18).
--
-- Un "agente de seguimiento" (backend Python, service role) inserta una pregunta
-- por día para el adulto mayor, elegida por relevancia/severidad de lo que contó
-- antes. El web (/elder) la lee por RLS y la muestra arriba del botón de grabar;
-- cuando el adulto responde con un audio, el backend la marca 'respondida'.
--
-- Mirror del patrón de public.alerts (0001_init.sql): mismas FKs a elders/families,
-- índice por (elder_id, created_at desc), RLS por pertenencia a la familia. El
-- propio adulto mayor es family_member, así que is_family_member() también lo cubre.
-- Depende de: 0001_init.sql (elders, families, is_family_member, alert_severity).
-- ----------------------------------------------------------------------------
create table public.followups (
  id                uuid primary key default gen_random_uuid(),
  elder_id          uuid not null references public.elders (id) on delete cascade,
  family_id         uuid not null references public.families (id) on delete cascade,
  pregunta          text not null,
  tema              text,
  severidad         public.alert_severity,        -- reusa el enum baja|media|alta
  -- Momento elegido por el agente; el dispatcher lo traduce a `programada_para`.
  -- despues_del_evento | esta_noche | manana_a_la_manana | en_2h | hora_puntual
  momento           text,
  programada_para   timestamptz,                  -- cuándo mostrar/enviar
  fuente_report_id  uuid references public.reports (id) on delete set null,
  -- pendiente | enviada | respondida | descartada
  estado            text not null default 'pendiente',
  created_at        timestamptz not null default now()
);
create index idx_followups_elder on public.followups (elder_id, created_at desc);
-- Para leer rápido la "pregunta del día" vigente de un adulto.
create index idx_followups_pendiente
  on public.followups (elder_id, programada_para) where (estado = 'pendiente');

alter table public.followups enable row level security;

-- Miembros de la familia (incluye al propio adulto mayor) pueden leer. El backend
-- escribe con service role (bypassa RLS), igual que con reports/alerts.
create policy "followups: miembros leen" on public.followups
  for select using (public.is_family_member(family_id));

grant select on public.followups to authenticated;
