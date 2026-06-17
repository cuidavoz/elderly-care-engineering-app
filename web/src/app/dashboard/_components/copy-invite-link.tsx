"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Arma la URL absoluta de aceptación a partir del token (en el cliente). */
function buildInviteUrl(token: string): string {
  return `${window.location.origin}/dashboard/invitacion/${token}`;
}

/**
 * Copia al portapapeles el link de aceptación de una invitación. Reusable: lo
 * usa tanto la lista de invitaciones pendientes como el diálogo de invitar.
 * Tiene fallback por si `navigator.clipboard` no está disponible.
 */
export function CopyInviteLink({
  token,
  label = "Copiar link",
  variant = "outline",
  size = "sm",
}: {
  token: string;
  label?: string;
  variant?: "outline" | "ghost" | "secondary" | "default";
  size?: "xs" | "sm" | "default";
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const url = buildInviteUrl(token);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback para contextos sin Clipboard API (http, navegadores viejos).
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success("Link copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar el link.");
    }
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={onCopy}>
      {copied ? <Check /> : <Copy />}
      {label}
    </Button>
  );
}
