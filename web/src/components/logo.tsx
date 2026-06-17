import { cn } from "@/lib/utils";

/**
 * Marca "Onda de voz": una waveform horizontal de trazo redondeado que sube y
 * baja unas pocas veces (se lee a la vez como onda de sonido y como latido) y
 * termina en un punto (endpoint) en violeta. El trazo principal va en un teal
 * calmo fijo (funciona en fondo claro y oscuro); el punto usa la `primary` del
 * tema.
 */
function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn("size-7 shrink-0", className)}
    >
      <path
        d="M3 16 L8 16 L11 9 L15 23 L19 6 L23 20 L26 16 L29 16"
        stroke="#14b8a6"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="29" cy="16" r="2.4" className="fill-primary" />
    </svg>
  );
}

/**
 * Logo de CuidaVoz: marca "Onda de voz" + (opcional) wordmark "CuidaVoz", con
 * "Voz" en `text-primary`. Server-component friendly (sin estado ni hooks).
 *
 * - `showWordmark`: si es `false`, solo se renderiza la marca y se agrega un
 *   texto accesible oculto (`sr-only`) para que el logo tenga nombre.
 * - El tamaño se controla por `className` (afecta el contenedor); la marca usa
 *   `size-7` por defecto y el wordmark `text-lg`.
 */
export function Logo({
  className,
  markClassName,
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Mark className={markClassName} />
      {showWordmark ? (
        <span className="font-heading text-lg font-bold tracking-tight">
          <span className="text-foreground">Cuida</span>
          <span className="text-primary">Voz</span>
        </span>
      ) : (
        <span className="sr-only">CuidaVoz</span>
      )}
    </span>
  );
}
