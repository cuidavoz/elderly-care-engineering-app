-- CuidaVoz — renombrar valores del enum family_role + agregar adulto_mayor.
--
-- IMPORTANTE: el trigger handle_new_family() inserba 'owner' hardcodeado;
-- debe actualizarse ANTES del RENAME para que no quede referencia al valor viejo.
-- ADD VALUE no puede revertirse en la misma transacción → lo dejamos como última
-- sentencia de esta migración para minimizar el riesgo de estado inconsistente.

-- 1) Actualizar trigger ANTES del rename (ya no insertará 'owner' sino 'familiar').
CREATE OR REPLACE FUNCTION public.handle_new_family()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.family_members (family_id, profile_id, rol)
  VALUES (new.id, new.created_by, 'familiar');
  RETURN new;
END;
$$;

-- 2) Renombrar valores del enum (renombra datos existentes + defaults automáticamente).
ALTER TYPE public.family_role RENAME VALUE 'owner'     TO 'familiar';
ALTER TYPE public.family_role RENAME VALUE 'caregiver' TO 'cuidador';

-- 3) Actualizar el default del campo rol en invites para ser explícitos.
ALTER TABLE public.invites ALTER COLUMN rol SET DEFAULT 'cuidador';

-- 4) ADD VALUE al final: no es transaccional → si falla, el enum queda modificado
--    pero el resto de la migración (ya aplicada) es consistente con el nuevo valor.
ALTER TYPE public.family_role ADD VALUE IF NOT EXISTS 'adulto_mayor';
