"use client"; // Los error boundaries deben ser Client Components.

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Error boundary del dashboard. Captura fallos de render del segmento
 * (p. ej. una query de `@/lib/data/queries` que tira) y muestra un fallback
 * con marca y un botón para reintentar, en vez de la pantalla genérica de Next.
 *
 * En Next 16.2 el prop de recuperación es `unstable_retry` (re-fetchea y
 * re-renderiza el boundary); dejamos `reset` como fallback por compatibilidad.
 */
export default function DashboardError({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    // Registramos el error para diagnóstico (en prod, `digest` matchea el log).
    console.error(error);
  }, [error]);

  function onRetry() {
    if (unstable_retry) {
      unstable_retry();
    } else {
      reset?.();
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <div className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-2xl">
        <AlertTriangle className="size-7" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">
        Algo salió mal
      </h1>
      <p className="text-muted-foreground text-sm">
        No pudimos cargar esta parte del panel. Puede ser algo temporal: probá
        de nuevo en un momento.
      </p>
      <Button onClick={onRetry}>
        <RotateCcw />
        Reintentar
      </Button>
    </div>
  );
}
