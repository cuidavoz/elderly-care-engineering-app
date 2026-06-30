-- CuidaVoz — implementación de roles: is_family_owner, elders.user_id,
-- accept_invite completo, DELETE policies, transfer_ownership.
--
-- Depende de 0008_roles_enum.sql (ADD VALUE 'adulto_mayor' debe estar visible).

-- ----------------------------------------------------------------------------
-- is_family_owner: usa families.created_by como fuente de verdad del ownership,
-- en vez de family_members.rol (que refleja la membresía, no la propiedad).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_family_owner(_family_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.families
    WHERE id = _family_id AND created_by = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_family_owner(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- elders.user_id: vincula un adulto mayor a su cuenta de usuario.
-- Índice parcial UNIQUE solo cuando user_id no es NULL (un usuario ↔ un elder).
-- ----------------------------------------------------------------------------
ALTER TABLE public.elders
  ADD COLUMN user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_elders_user_id ON public.elders(user_id)
  WHERE user_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- invites.elder_id: para invitaciones de adulto_mayor, apunta al elder
-- que se vinculará cuando la invitación sea aceptada.
-- ----------------------------------------------------------------------------
ALTER TABLE public.invites
  ADD COLUMN elder_id uuid REFERENCES public.elders(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- accept_invite — versión completa con todos los fixes acumulados:
--   · FOR UPDATE en la SELECT del invite (evita race conditions, ronda 4)
--   · AND status='pendiente' en el UPDATE final + GET DIAGNOSTICS (ronda 4)
--   · Verificación de effective_rol después del ON CONFLICT (ronda 2)
--   · GET DIAGNOSTICS en el UPDATE de elders (ronda 5)
--   · Validación: adulto_mayor REQUIERE elder_id (ronda 6 I1)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invite(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  invite        public.invites%rowtype;
  cuenta_email  text;
  effective_rol public.family_role;
  rows_updated  int;
BEGIN
  SELECT * INTO invite
  FROM public.invites
  WHERE token = _token
    AND status = 'pendiente'
    AND created_at > now() - interval '14 days'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitación inválida, vencida o ya utilizada';
  END IF;

  -- Validación ronda 6 I1: adulto_mayor siempre debe tener elder_id.
  IF invite.rol = 'adulto_mayor' AND invite.elder_id IS NULL THEN
    RAISE EXCEPTION 'Invitación de adulto mayor sin adulto mayor asociado (elder_id faltante)';
  END IF;

  SELECT email INTO cuenta_email FROM public.profiles WHERE id = auth.uid();
  IF lower(invite.email) IS DISTINCT FROM lower(cuenta_email) THEN
    RAISE EXCEPTION 'Esta invitación es para otra cuenta de correo';
  END IF;

  INSERT INTO public.family_members (family_id, profile_id, rol)
  VALUES (invite.family_id, auth.uid(), invite.rol)
  ON CONFLICT (family_id, profile_id) DO NOTHING;

  -- Verificar el rol efectivo (puede diferir si ya era miembro con otro rol).
  SELECT rol INTO effective_rol
  FROM public.family_members
  WHERE family_id = invite.family_id AND profile_id = auth.uid();

  IF invite.elder_id IS NOT NULL THEN
    IF effective_rol = 'adulto_mayor' THEN
      BEGIN
        UPDATE public.elders
        SET user_id = auth.uid()
        WHERE id = invite.elder_id
          AND family_id = invite.family_id
          AND user_id IS NULL;

        GET DIAGNOSTICS rows_updated = ROW_COUNT;
        IF rows_updated = 0 THEN
          RAISE EXCEPTION 'El adulto mayor ya está vinculado a otro usuario';
        END IF;
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'Este usuario ya está vinculado a otro adulto mayor';
      END;
    ELSE
      RAISE EXCEPTION 'El usuario ya era miembro con un rol distinto';
    END IF;
  END IF;

  UPDATE public.invites
  SET status = 'aceptada', accepted_at = now(), accepted_by = auth.uid()
  WHERE id = invite.id AND status = 'pendiente';

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  IF rows_updated = 0 THEN
    RAISE EXCEPTION 'Invitación ya fue procesada por otra sesión';
  END IF;

  RETURN invite.family_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated;

-- ----------------------------------------------------------------------------
-- DELETE policies (owner puede eliminar reportes, miembros y la familia misma).
-- ----------------------------------------------------------------------------
CREATE POLICY "reports: owner elimina" ON public.reports
  FOR DELETE USING (public.is_family_owner(family_id));

CREATE POLICY "familias: owner elimina" ON public.families
  FOR DELETE USING (created_by = public.current_user_id());

-- El owner no puede eliminarse a sí mismo (sería eliminar el owner de la familia).
CREATE POLICY "miembros: owner elimina" ON public.family_members
  FOR DELETE USING (
    public.is_family_owner(family_id)
    AND profile_id != (SELECT auth.uid())
  );

GRANT DELETE ON public.reports        TO authenticated;
GRANT DELETE ON public.family_members TO authenticated;
GRANT DELETE ON public.families       TO authenticated;

-- ----------------------------------------------------------------------------
-- transfer_ownership: transfiere el created_by a otro miembro de la familia.
-- Bloquea adulto_mayor como nuevo owner (ronda 5 I2).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_ownership(
  _family_id   uuid,
  _new_owner_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  fam           public.families%rowtype;
  new_owner_rol public.family_role;
BEGIN
  SELECT * INTO fam FROM public.families WHERE id = _family_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Familia no encontrada';
  END IF;
  IF fam.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Solo el owner puede transferir la propiedad';
  END IF;
  IF _new_owner_id = auth.uid() THEN
    RAISE EXCEPTION 'No podés transferirte a vos mismo';
  END IF;

  SELECT rol INTO new_owner_rol
  FROM public.family_members
  WHERE family_id = _family_id AND profile_id = _new_owner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El nuevo owner debe ser miembro de la familia';
  END IF;
  IF new_owner_rol = 'adulto_mayor' THEN
    RAISE EXCEPTION 'Un adulto mayor no puede ser administrador de la familia';
  END IF;

  UPDATE public.families SET created_by = _new_owner_id WHERE id = _family_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.transfer_ownership(uuid, uuid) TO authenticated;
