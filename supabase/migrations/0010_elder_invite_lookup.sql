-- CuidaVoz — permite que un usuario vea las invitaciones dirigidas a su propio email.
--
-- Sin esta policy, cuando el adulto mayor llega a /auth/confirm (tras hacer clic
-- en el magic link), su sesión ya está establecida pero todavía NO es miembro de
-- ninguna familia. La RLS existente de invites requiere is_family_member(), así
-- que la query devuelve null y la invitación nunca se acepta.
--
-- Esta policy es mínimamente permisiva: solo expone las invitaciones cuyo email
-- coincide con el del usuario autenticado.

CREATE POLICY "invites: ver propia por email" ON public.invites
  FOR SELECT USING (
    lower(email) = lower((
      SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()
    ))
  );
