"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Smartphone } from "lucide-react";
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
import { invitarAdultoMayor } from "@/lib/data/actions";
import type { Elder } from "@/lib/types";

export function InviteElderDialog({
  familyId,
  elders,
}: {
  familyId: string;
  elders: Elder[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Solo adultos mayores que todavía no tienen cuenta vinculada.
  const sinVincular = elders.filter((e) => e.user_id === null);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await invitarAdultoMayor(null, formData);
      if (result.ok) {
        toast.success(
          result.data.emailed
            ? "Magic link enviado por mail"
            : "Invitación creada (mail no enviado)"
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" variant="outline" />}
      >
        <Smartphone className="size-4" />
        Vincular adulto mayor
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular adulto mayor</DialogTitle>
          <DialogDescription>
            Le mandaremos un magic link al correo del adulto mayor. Al hacer
            clic podrá ingresar a su propia vista para grabar sus audios.
          </DialogDescription>
        </DialogHeader>

        {sinVincular.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todos los adultos mayores ya tienen cuenta vinculada.
          </p>
        ) : (
          <form action={onSubmit} className="flex flex-col gap-4">
            <input type="hidden" name="familyId" value={familyId} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="elder-select">Adulto mayor</Label>
              <select
                id="elder-select"
                name="elderId"
                required
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Elegí un adulto mayor...</option>
                {sinVincular.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="elder-email">Correo</Label>
              <Input
                id="elder-email"
                name="email"
                type="email"
                placeholder="adulto@correo.com"
                maxLength={120}
                required
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Cancelar</Button>} />
              <Button type="submit" disabled={pending}>
                {pending ? "Enviando..." : "Enviar magic link"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {sinVincular.length === 0 && (
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cerrar</Button>} />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
