-- CuidaVoz — GRANTs para el rol `authenticated`.
--
-- RLS y los privilegios SQL son capas independientes: las políticas de
-- 0001_init.sql restringen QUÉ filas se ven, pero el rol necesita además el
-- privilegio de tabla. Sin estos GRANTs, todo `select` desde el web app
-- (rol `authenticated`) devuelve `42501 permission denied`.
-- La RLS sigue filtrando por pertenencia a la familia.

-- Lecturas del panel:
grant select on
  public.families,
  public.family_members,
  public.elders,
  public.reports,
  public.alerts,
  public.profiles,
  public.report_embeddings
  to authenticated;

-- Escrituras que realiza el web app (alta de familia/adulto; el trigger suma al
-- owner; sumar cuidadores a futuro):
grant insert on
  public.families,
  public.family_members,
  public.elders
  to authenticated;

-- Edición (políticas "familias: owner edita" y "perfil propio: editar"):
grant update on
  public.families,
  public.profiles
  to authenticated;
