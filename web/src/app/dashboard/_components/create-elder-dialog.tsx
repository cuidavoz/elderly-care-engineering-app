"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { createElder } from "@/lib/data/actions";

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Agregando..." : "Agregar"}
    </Button>
  );
}

/**
 * Botón + diálogo para sumar un adulto mayor a una familia. Tras agregarlo,
 * navega a su dashboard. El resultado de la Server Action se maneja en el
 * submit (no en un efecto).
 */
export function CreateElderDialog({
  familyId,
  triggerLabel = "Agregar adulto mayor",
}: {
  familyId: string;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createElder(null, formData);
      if (result.ok) {
        toast.success("Adulto mayor agregado");
        setOpen(false);
        router.push(`/dashboard/${familyId}/${result.data.id}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus />
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar adulto mayor</DialogTitle>
          <DialogDescription>
            Sumá a la persona que cuidás. Vas a ver sus reportes diarios y
            alertas en su panel.
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="familyId" value={familyId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              name="nombre"
              placeholder="Rosa Martínez"
              maxLength={80}
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notas">Notas (opcional)</Label>
            <Textarea
              id="notas"
              name="notas"
              placeholder="Datos útiles: condiciones, medicación habitual, contacto..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancelar</Button>} />
            <SubmitButton pending={pending} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
