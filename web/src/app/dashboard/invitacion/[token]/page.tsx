import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailX } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { acceptInvite } from "@/lib/data/actions";

export const metadata: Metadata = { title: "Aceptar invitación" };

/**
 * Página de aceptación de una invitación. Usa el layout de `dashboard/`, así que
 * la sesión ya está garantizada (el proxy/layout redirige a login si no hay).
 * Intenta aceptar con el token; si funciona, redirige al panel de la familia.
 * Si falla (token inválido/usado o email que no coincide), muestra una tarjeta
 * con el motivo.
 *
 * Nota: `redirect()` lanza internamente, por eso NO va dentro de un try/catch
 * que pueda tragarse el throw; lo llamamos sobre el camino feliz, fuera de uno.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await acceptInvite(token);

  if (result.ok) {
    redirect(`/dashboard/${result.data.familyId}`);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="bg-accent text-destructive flex size-9 items-center justify-center rounded-full">
              <MailX className="size-4" />
            </div>
            <CardTitle className="flex-1">No pudimos aceptar la invitación</CardTitle>
          </div>
          <CardDescription className="mt-2">{result.error}</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-col gap-4 text-sm">
          <p>
            Es posible que el link ya se haya usado o vencido, o que esté dirigido
            a otra cuenta. Pedile a quien te invitó que te mande uno nuevo.
          </p>
          <Button asChild variant="outline" className="w-fit">
            <Link href="/dashboard">Volver al panel</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
