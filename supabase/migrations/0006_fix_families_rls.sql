-- CuidaVoz — Fix RLS para creación de familias.
--
-- PROBLEMA: al crear una familia desde el web app, el Server Action hace
-- `.insert().select("id")`. Supabase evalúa la política SELECT (RETURNING)
-- justo después del INSERT, pero en ese instante el usuario todavía no figura
-- en `family_members` (el trigger `handle_new_family` corre en la misma
-- transacción pero el RETURNING se evalúa antes de que la visibilidad se
-- propague). Resultado: "new row violates row-level security policy for table
-- 'families'" aunque el INSERT en sí era correcto.
--
-- FIX:
-- 1) Helper `current_user_id()` (security definer): envuelve `auth.uid()` en
--    una función con el mismo patrón que `is_family_member`, evitando que las
--    llamadas directas a `auth.uid()` en WITH CHECK fallen en ciertos contextos
--    de Next.js 16 + @supabase/ssr.
-- 2) Política SELECT de `families`: agrega `OR created_by = current_user_id()`
--    para que el creador pueda ver su familia recién creada en el RETURNING,
--    incluso antes de que el trigger la agregue a `family_members`.
-- 3) Política INSERT de `families`: usa `current_user_id()` en lugar de
--    `auth.uid()` directamente, por consistencia y robustez.

-- ----------------------------------------------------------------------------
-- 1) Helper: current_user_id()
-- ----------------------------------------------------------------------------
create or replace function public.current_user_id()
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select auth.uid();
$$;
grant execute on function public.current_user_id() to authenticated;

-- ----------------------------------------------------------------------------
-- 2) Política SELECT de families: creador puede ver su familia recién creada
-- ----------------------------------------------------------------------------
drop policy if exists "familias: ver las propias" on public.families;
create policy "familias: ver las propias" on public.families
  for select using (
    public.is_family_member(id)
    or created_by = public.current_user_id()
  );

-- ----------------------------------------------------------------------------
-- 3) Política INSERT de families: usa current_user_id() para robustez
-- ----------------------------------------------------------------------------
drop policy if exists "familias: crear" on public.families;
create policy "familias: crear" on public.families
  for insert with check (created_by = public.current_user_id());
