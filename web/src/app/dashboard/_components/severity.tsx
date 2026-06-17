import { cn } from "@/lib/utils";
import type { AlertEstado, AlertSeverity } from "@/lib/types";

/**
 * Estilos por severidad de alerta (alta=rojo, media=naranja, baja=amarillo).
 * Usamos clases utilitarias directas en vez de tokens del tema porque son
 * colores semánticos de severidad, no del branding.
 */
const SEVERITY_STYLES: Record<
  AlertSeverity,
  { chip: string; label: string; dot: string; cardBorder: string }
> = {
  alta: {
    chip: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    label: "Alta",
    dot: "bg-red-500",
    cardBorder: "border-l-red-500",
  },
  media: {
    chip: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
    label: "Media",
    dot: "bg-orange-500",
    cardBorder: "border-l-orange-500",
  },
  baja: {
    chip: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
    label: "Baja",
    dot: "bg-yellow-500",
    cardBorder: "border-l-yellow-500",
  },
};

function styleFor(severidad: AlertSeverity | undefined) {
  return SEVERITY_STYLES[severidad ?? "baja"] ?? SEVERITY_STYLES.baja;
}

/** Chip de severidad. */
export function SeverityChip({
  severidad,
  className,
}: {
  severidad?: AlertSeverity;
  className?: string;
}) {
  const s = styleFor(severidad);
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-medium",
        s.chip,
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

/** Borde lateral coloreado por severidad (para resaltar tarjetas de alerta). */
export function severityCardBorder(severidad?: AlertSeverity) {
  return styleFor(severidad).cardBorder;
}

/**
 * Estilos por estado de gestión de la alerta (pendiente / vista / resuelta).
 * Son colores de workflow, no de severidad: el púrpura del branding marca lo
 * que requiere atención (pendiente).
 */
const ESTADO_STYLES: Record<AlertEstado, { chip: string; label: string }> = {
  pendiente: {
    chip: "bg-accent text-accent-foreground",
    label: "Pendiente",
  },
  vista: {
    chip: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
    label: "Vista",
  },
  resuelta: {
    chip: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
    label: "Resuelta",
  },
};

/** Chip de estado de gestión de la alerta. */
export function EstadoChip({
  estado,
  className,
}: {
  estado: AlertEstado;
  className?: string;
}) {
  const s = ESTADO_STYLES[estado] ?? ESTADO_STYLES.pendiente;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
        s.chip,
        className
      )}
    >
      {s.label}
    </span>
  );
}
