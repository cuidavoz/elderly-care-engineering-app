"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { updateAlertEstado } from "@/lib/data/actions";
import type { AlertEstado } from "@/lib/types";

/**
 * Acciones de gestión de una alerta: marcar vista / resuelta / reabrir.
 * Llama a la Server Action `updateAlertEstado` (update con el server client,
 * RLS aplica) y refresca la ruta para reflejar el nuevo estado + el badge.
 */
export function AlertActions({
  alertId,
  familyId,
  elderId,
  estado,
}: {
  alertId: string;
  familyId: string;
  elderId: string;
  estado: AlertEstado;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setEstado(nuevo: AlertEstado) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("alertId", alertId);
      formData.set("estado", nuevo);
      formData.set("familyId", familyId);
      formData.set("elderId", elderId);

      const result = await updateAlertEstado(null, formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const mensajes: Record<AlertEstado, string> = {
        pendiente: "Alerta reabierta.",
        vista: "Alerta marcada como vista.",
        resuelta: "Alerta marcada como resuelta.",
      };
      toast.success(mensajes[nuevo]);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pending ? (
        <Loader2 className="text-muted-foreground size-4 animate-spin" />
      ) : null}

      {estado === "pendiente" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setEstado("vista")}
        >
          <Eye />
          Marcar vista
        </Button>
      )}

      {estado !== "resuelta" && (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => setEstado("resuelta")}
        >
          <Check />
          Marcar resuelta
        </Button>
      )}

      {estado === "resuelta" && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setEstado("pendiente")}
        >
          <RotateCcw />
          Reabrir
        </Button>
      )}
    </div>
  );
}
