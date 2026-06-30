-- CuidaVoz — sincronización del nombre del adulto mayor al aceptar la invitación.
--
-- Decisión de producto: el nombre que el adulto mayor ingresa al crear su cuenta
-- (profiles.nombre) GANA sobre el que cargó el administrador al dar de alta el
-- elder (elders.nombre). Ej: el admin puso "Juancito", el adulto puso "Juan" ->
-- queda "Juan" consistente en todos los lugares que muestran elders.nombre.
--
-- Implementación: one-shot dentro de accept_invite (no hace falta un trigger
-- continuo porque hoy ningún nombre se edita después del alta). Es el único
-- momento en que profiles.nombre y elders.nombre coexisten y pueden divergir.
--
-- Caso borde (crítico): si el adulto NO escribió nombre en el signup,
-- handle_new_user (0001_init.sql) cae a profiles.nombre = email. En ese caso NO
-- queremos pisar elders.nombre con un email: NULLIF(cuenta_nombre, cuenta_email)
-- lo neutraliza y COALESCE(..., nombre) conserva el nombre que puso el admin.
-- elders.nombre es NOT NULL, así que el COALESCE final garantiza no escribir NULL.
--
-- Depende de 0009_roles_impl.sql. Solo cambia el UPDATE de elders dentro de la
-- función; el resto del cuerpo es idéntico a 0009.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invite(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  invite        public.invites%rowtype;
  cuenta_email  text;
  cuenta_nombre text;
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

  SELECT email, nombre INTO cuenta_email, cuenta_nombre
  FROM public.profiles WHERE id = auth.uid();
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
        -- Vincula el elder al usuario y sincroniza el nombre: gana el que el
        -- adulto eligió en su signup (cuenta_nombre), salvo que ese valor sea
        -- el email-fallback (NULLIF) o NULL, en cuyo caso se conserva el del admin.
        UPDATE public.elders
        SET user_id = auth.uid(),
            nombre  = COALESCE(NULLIF(cuenta_nombre, cuenta_email), nombre)
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
