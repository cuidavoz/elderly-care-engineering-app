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
import { createFamily } from "@/lib/data/actions";

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creando..." : "Crear familia"}
    </Button>
  );
}

/**
 * Botón + diálogo para crear una familia. Tras crearla, navega al panel de esa
 * familia para que el cuidador agregue su primer adulto mayor.
 *
 * Manejamos el resultado de la Server Action en el propio submit (no en un
 * efecto), así toast/cierre/navegación son acciones de evento.
 */
export function CreateFamilyDialog({
  triggerLabel = "Nueva familia",
  triggerVariant = "default",
}: {
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createFamily(null, formData);
      if (result.ok) {
        toast.success("Familia creada");
        setOpen(false);
        router.push(`/dashboard/${result.data.id}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={triggerVariant}>
            <Plus />
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear familia</DialogTitle>
          <DialogDescription>
            Una familia agrupa a los adultos mayores que cuidás y a los demás
            cuidadores. Después vas a poder sumar adultos mayores.
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nombre">Nombre de la familia</Label>
            <Input
              id="nombre"
              name="nombre"
              placeholder="Familia Pérez"
              maxLength={80}
              autoFocus
              required
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
