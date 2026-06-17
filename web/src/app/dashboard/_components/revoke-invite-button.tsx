"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { revokeInvite } from "@/lib/data/actions";

/**
 * Revoca una invitación pendiente. Usa `useTransition` para llamar la Server
 * Action y refresca al terminar; el resultado se muestra con un toast.
 */
export function RevokeInviteButton({
  inviteId,
  familyId,
}: {
  inviteId: string;
  familyId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onRevoke() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("inviteId", inviteId);
      formData.set("familyId", familyId);
      const result = await revokeInvite(null, formData);
      if (result.ok) {
        toast.success("Invitación revocada");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onRevoke}
      disabled={pending}
    >
      <X />
      {pending ? "Revocando..." : "Revocar"}
    </Button>
  );
}
