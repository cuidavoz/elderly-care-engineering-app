"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserMinus } from "lucide-react";
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
import { removeMember } from "@/lib/data/actions";

export function RemoveMemberButton({
  familyId,
  profileId,
  nombre,
}: {
  familyId: string;
  profileId: string;
  nombre: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onConfirm() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("familyId", familyId);
      formData.set("profileId", profileId);
      const result = await removeMember(null, formData);
      if (result.ok) {
        toast.success("Miembro eliminado de la familia");
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
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive shrink-0"
          />
        }
        aria-label="Eliminar miembro"
      >
        <UserMinus className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar miembro?</DialogTitle>
          <DialogDescription>
            {nombre ? (
              <>
                <span className="font-medium">{nombre}</span> dejará de tener
                acceso a esta familia y sus reportes.
              </>
            ) : (
              "Este miembro dejará de tener acceso a esta familia y sus reportes."
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancelar</Button>} />
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Eliminando..." : "Eliminar miembro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
