"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { deleteFamily } from "@/lib/data/actions";

export function DeleteFamilyButton({
  familyId,
  familyNombre,
}: {
  familyId: string;
  familyNombre: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onConfirm() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("familyId", familyId);
      const result = await deleteFamily(null, formData);
      if (result.ok) {
        toast.success("Familia eliminada");
        setOpen(false);
        router.push("/dashboard");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:bg-destructive/10" />
        }
      >
        <Trash2 className="size-4" />
        Eliminar familia
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar familia?</DialogTitle>
          <DialogDescription>
            Esta acción es permanente e irreversible.{" "}
            <span className="font-medium text-foreground">
              &ldquo;{familyNombre}&rdquo;
            </span>{" "}
            y todos sus adultos mayores, reportes y alertas se eliminarán para
            siempre.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancelar</Button>} />
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Eliminando..." : "Sí, eliminar familia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
