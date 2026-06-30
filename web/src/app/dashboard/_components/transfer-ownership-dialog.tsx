"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { transferOwnership } from "@/lib/data/actions";
import type { FamilyMember } from "@/lib/types";

export function TransferOwnershipDialog({
  familyId,
  members,
}: {
  familyId: string;
  members: FamilyMember[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Solo miembros que no son el owner actual ni adulto_mayor.
  const elegibles = members.filter(
    (m) => !m.isOwner && m.rol !== "adulto_mayor"
  );

  function onSubmit() {
    if (!selectedId) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("familyId", familyId);
      formData.set("newOwnerId", selectedId);
      const result = await transferOwnership(null, formData);
      if (result.ok) {
        toast.success("Administración transferida");
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
        render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}
      >
        <ShieldCheck className="size-4" />
        Transferir administración
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir administración</DialogTitle>
          <DialogDescription>
            El nuevo administrador podrá gestionar miembros y eliminar la
            familia. Vos quedás como familiar.
          </DialogDescription>
        </DialogHeader>

        {elegibles.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No hay otros miembros elegibles. Invitá a alguien primero.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-owner">Nuevo administrador</Label>
            <select
              id="new-owner"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">Elegí un miembro...</option>
              {elegibles.map((m) => (
                <option key={m.profile_id} value={m.profile_id}>
                  {m.nombre ?? m.email ?? m.profile_id}
                </option>
              ))}
            </select>
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancelar</Button>} />
          <Button
            onClick={onSubmit}
            disabled={pending || !selectedId}
          >
            {pending ? "Transfiriendo..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
