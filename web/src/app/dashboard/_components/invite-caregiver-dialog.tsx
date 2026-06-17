"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createInvite } from "@/lib/data/actions";
import { CopyInviteLink } from "./copy-invite-link";

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creando..." : "Crear invitación"}
    </Button>
  );
}

/**
 * Diálogo para invitar a un cuidador por correo. Al crear la invitación, en vez
 * de cerrar el diálogo muestra el link generado con un botón para copiarlo
 * (el invitado lo abre logueado para aceptar). El resultado se maneja en el
 * submit, no en un efecto.
 */
export function InviteCaregiverDialog({ familyId }: { familyId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    // Al cerrar, reseteamos el link generado para la próxima invitación.
    if (!next) {
      setToken(null);
    }
  }

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createInvite(null, formData);
      if (result.ok) {
        setToken(result.data.token);
        toast.success("Invitación creada");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <UserPlus />
            Invitar cuidador
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar cuidador</DialogTitle>
          <DialogDescription>
            Mandale el link a otra persona para que colabore en esta familia.
            Cuando lo abra con su cuenta, va a poder aceptar la invitación.
          </DialogDescription>
        </DialogHeader>

        {token ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-link">Link de invitación</Label>
              <Input
                id="invite-link"
                readOnly
                value={`/dashboard/invitacion/${token}`}
                onFocus={(e) => e.currentTarget.select()}
              />
              <p className="text-muted-foreground text-xs">
                Copiá el link y compartilo con la persona que querés sumar.
              </p>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Cerrar</Button>} />
              <CopyInviteLink token={token} size="default" variant="default" />
            </DialogFooter>
          </div>
        ) : (
          <form action={onSubmit} className="flex flex-col gap-4">
            <input type="hidden" name="familyId" value={familyId} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="persona@correo.com"
                maxLength={120}
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rol">Rol</Label>
              <select
                id="rol"
                name="rol"
                defaultValue="caregiver"
                className={cn(
                  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
                )}
              >
                <option value="caregiver">Cuidador</option>
                <option value="owner">Administrador</option>
              </select>
              <p className="text-muted-foreground text-xs">
                El administrador puede gestionar la familia; el cuidador ve
                reportes y alertas.
              </p>
            </div>
            <DialogFooter>
              <DialogClose
                render={<Button variant="outline">Cancelar</Button>}
              />
              <SubmitButton pending={pending} />
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
