import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, MailX, UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getInvitePreview } from "@/lib/data/queries";
import { signout } from "@/app/(auth)/actions";
import { AcceptInviteCard } from "./_components/accept-invite-card";

export const metadata: Metadata = { title: "Aceptar invitación" };

/**
 * Página de aceptación de una invitación. Usa el layout de `dashboard/`, así que
 * la sesión ya está garantizada (el proxy/layout redirige a login si no hay; al
 * volver de login/confirmación el usuario aterriza acá de nuevo).
 *
 * En vez de auto-aceptar, mostramos el detalle y dejamos Aceptar / Rechazar. Los
 * distintos estados (inválida, vencida, ya usada, otro correo, ya sos miembro) se
 * resuelven con los flags de `get_invite_preview`.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getInvitePreview(token);

  // Token inexistente.
  if (!invite) {
    return (
      <InfoCard
        tone="error"
        icon={<MailX className="size-4" />}
        title="No encontramos esa invitación"
        description="El link no es válido. Puede que se haya escrito mal o que la invitación ya no exista."
      >
        <BackButton />
      </InfoCard>
    );
  }

  // Ya sos miembro de esa familia (aceptada antes, o te sumaron por otro lado).
  if (invite.already_member) {
    return (
      <InfoCard
        tone="ok"
        icon={<CheckCircle2 className="size-4" />}
        title={`Ya sos parte de ${invite.family_nombre}`}
        description="No hace falta aceptar de nuevo: ya tenés acceso a esta familia."
      >
        <Button asChild className="w-fit">
          <Link href={`/dashboard/${invite.family_id}`}>Ir a la familia</Link>
        </Button>
      </InfoCard>
    );
  }

  // La invitación ya no está pendiente (aceptada por otra cuenta, o revocada).
  if (invite.status !== "pendiente") {
    return (
      <InfoCard
        tone="error"
        icon={<MailX className="size-4" />}
        title="Esta invitación ya no está disponible"
        description="Es posible que ya se haya usado o que la hayan cancelado. Pedile a quien te invitó que te mande una nueva."
      >
        <BackButton />
      </InfoCard>
    );
  }

  // Venció (más de 14 días).
  if (invite.is_expired) {
    return (
      <InfoCard
        tone="error"
        icon={<Clock className="size-4" />}
        title="La invitación venció"
        description="Las invitaciones valen 14 días. Pedile a quien te invitó que te mande una nueva."
      >
        <BackButton />
      </InfoCard>
    );
  }

  // El correo de la invitación no coincide con la cuenta logueada.
  if (!invite.email_matches) {
    return (
      <InfoCard
        tone="error"
        icon={<UserCog className="size-4" />}
        title="Esta invitación es para otra cuenta"
        description={`Está dirigida a ${invite.invite_email}. Cerrá sesión y volvé a abrir el link con esa cuenta.`}
      >
        <form action={signout}>
          <Button type="submit" variant="outline" className="w-fit">
            Cerrar sesión
          </Button>
        </form>
      </InfoCard>
    );
  }

  // Todo OK: mostramos la confirmación con Aceptar / Rechazar.
  const inviterLabel =
    invite.inviter_nombre?.trim() ||
    invite.inviter_email?.trim() ||
    "Alguien";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-8">
      <AcceptInviteCard
        token={token}
        familyNombre={invite.family_nombre}
        inviterLabel={inviterLabel}
        rol={invite.rol}
      />
    </div>
  );
}

function BackButton() {
  return (
    <Button asChild variant="outline" className="w-fit">
      <Link href="/dashboard">Volver al panel</Link>
    </Button>
  );
}

function InfoCard({
  tone,
  icon,
  title,
  description,
  children,
}: {
  tone: "ok" | "error";
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div
              className={`bg-accent flex size-9 items-center justify-center rounded-full ${
                tone === "ok" ? "text-primary" : "text-destructive"
              }`}
            >
              {icon}
            </div>
            <CardTitle className="flex-1">{title}</CardTitle>
          </div>
          <CardDescription className="mt-2">{description}</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm" />
        <CardFooter>{children}</CardFooter>
      </Card>
    </div>
  );
}
