"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MailPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { acceptInvite, rejectInvite } from "@/lib/data/actions";
import type { FamilyRole } from "@/lib/types";

function rolLabel(rol: FamilyRole): string {
  if (rol === "adulto_mayor") return "Adulto/a mayor";
  if (rol === "familiar") return "Familiar";
  return "Cuidador/a";
}

/**
 * Tarjeta de confirmación de una invitación: muestra quién invita, a qué familia
 * y con qué rol, y deja Aceptar o Rechazar. Las acciones devuelven un resultado
 * (no redirigen server-side) y acá navegamos con el router del cliente.
 */
export function AcceptInviteCard({
  token,
  familyNombre,
  inviterLabel,
  rol,
}: {
  token: string;
  familyNombre: string;
  inviterLabel: string;
  rol: FamilyRole;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onAccept() {
    startTransition(async () => {
      const result = await acceptInvite(token);
      if (result.ok) {
        toast.success(`Te uniste a ${familyNombre}`);
        router.push(`/dashboard/${result.data.familyId}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function onReject() {
    startTransition(async () => {
      const result = await rejectInvite(token);
      if (result.ok) {
        toast.success("Invitación rechazada");
        router.push("/dashboard");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="bg-accent text-primary mb-1 flex size-11 items-center justify-center rounded-2xl">
          <MailPlus className="size-5" />
        </div>
        <CardTitle className="text-xl">Te invitaron a una familia</CardTitle>
        <CardDescription>
          <strong>{inviterLabel}</strong> te invita a participar de{" "}
          <strong>{familyNombre}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-accent/40 flex items-center justify-between rounded-lg px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="bg-background text-primary flex size-9 items-center justify-center rounded-lg">
              <Users className="size-4" />
            </div>
            <div>
              <p className="font-medium">{familyNombre}</p>
              <p className="text-muted-foreground text-sm">
                Vas a entrar como cuidador/a de esta familia.
              </p>
            </div>
          </div>
          <Badge variant={rol === "familiar" ? "default" : "secondary"}>
            {rolLabel(rol)}
          </Badge>
        </div>
      </CardContent>
      <CardFooter className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onReject}
          disabled={pending}
        >
          Rechazar
        </Button>
        <Button className="flex-1" onClick={onAccept} disabled={pending}>
          {pending ? "Procesando..." : "Aceptar invitación"}
        </Button>
      </CardFooter>
    </Card>
  );
}
