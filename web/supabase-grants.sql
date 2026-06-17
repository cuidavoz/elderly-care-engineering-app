-- CuidaVoz — GRANTs faltantes para el rol `authenticated`.
--
-- PROBLEMA (bloquea TODAS las lecturas del web app):
--   La migración `supabase/migrations/0001_init.sql` define políticas RLS pero
--   NO incluye ningún GRANT. En este Postgres local las tablas fueron creadas
--   por el rol `postgres`, cuyos DEFAULT PRIVILEGES otorgan a `authenticated`
--   solo TRUNCATE/TRIGGER/REFERENCES — NO SELECT/INSERT/UPDATE.
--
--   RLS y los privilegios SQL son capas independientes: sin el GRANT, la policy
--   RLS ni siquiera se evalúa y el `select` devuelve:
--     42501  permission denied for table families
--
-- SOLUCIÓN: otorgar a `authenticated` los privilegios que las políticas RLS ya
-- pretenden habilitar. La RLS sigue restringiendo las filas por familia.
--
-- NOTA DE SCOPE: esto idealmente vive en la migración (`0001_init.sql`), fuera
-- del alcance editable de este subagente. Se deja acá para que el dueño del
-- esquema lo incorpore a la migración o lo aplique al entorno.
--
-- Uso (entorno local):
--   docker exec -i supabase_db_elderly-care-engineering \
--     psql -U postgres -d postgres < web/supabase-grants.sql

-- Lecturas del panel (la RLS filtra las filas por membresía):
grant select on
  public.families,
  public.family_members,
  public.elders,
  public.reports,
  public.alerts,
  public.profiles,
  public.report_embeddings
  to authenticated;

-- Escrituras que realiza el web app:
--   families: crear familia (created_by = uid; trigger crea el owner).
--   family_members: el trigger inserta al owner (security definer), pero la
--                   política "miembros: agregar a mi familia" habilita sumar
--                   cuidadores desde la app a futuro.
--   elders: alta de adultos mayores por cualquier miembro.
grant insert on
  public.families,
  public.family_members,
  public.elders
  to authenticated;

-- Edición:
--   families: la política "familias: owner edita".
--   profiles: la política "perfil propio: editar".
grant update on
  public.families,
  public.profiles
  to authenticated;
