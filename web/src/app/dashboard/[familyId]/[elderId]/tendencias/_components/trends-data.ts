import type { Report } from "@/lib/types";

/**
 * Transformaciones de los reportes a series listas para graficar.
 *
 * Son funciones puras (sin React) para poder usarlas desde el Server Component
 * de Tendencias y pasar solo datos serializables a los charts cliente.
 */

/** Etiqueta corta de fecha (dd/mm) a partir de un date YYYY-MM-DD, sin shift TZ. */
export function shortFecha(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  if (!y || !m || !d) return fecha;
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
  });
}

/** Mapea calidad de sueño a un score 1..3 (null si desconocida/ausente). */
export function suenoScore(calidad?: string | null): number | null {
  switch ((calidad ?? "").toLowerCase()) {
    case "buena":
      return 3;
    case "regular":
      return 2;
    case "mala":
      return 1;
    default:
      return null;
  }
}

export type SuenoPoint = {
  fecha: string;
  label: string;
  score: number | null;
  calidad: string;
};

/** Serie temporal del sueño (score 1..3). */
export function suenoSeries(reports: Report[]): SuenoPoint[] {
  return reports.map((r) => {
    const calidad = r.payload?.sueno?.calidad ?? null;
    return {
      fecha: r.fecha,
      label: shortFecha(r.fecha),
      score: suenoScore(calidad),
      calidad: calidad ?? "desconocida",
    };
  });
}

export type MedicacionPoint = {
  fecha: string;
  label: string;
  /** 1 = tomada, -1 = no tomada, 0 = desconocida (para barras divergentes). */
  valor: number;
  estado: "tomada" | "no" | "desconocida";
};

/** Adherencia a la medicación por día. */
export function medicacionSeries(reports: Report[]): MedicacionPoint[] {
  return reports.map((r) => {
    const tomada = r.payload?.salud?.medicacion_tomada;
    let estado: MedicacionPoint["estado"] = "desconocida";
    let valor = 0;
    if (tomada === true) {
      estado = "tomada";
      valor = 1;
    } else if (tomada === false) {
      estado = "no";
      valor = -1;
    }
    return { fecha: r.fecha, label: shortFecha(r.fecha), valor, estado };
  });
}

/** Resumen de adherencia (conteos) para el estado vacío / leyenda. */
export function medicacionResumen(reports: Report[]) {
  let tomada = 0;
  let no = 0;
  let desconocida = 0;
  for (const r of reports) {
    const t = r.payload?.salud?.medicacion_tomada;
    if (t === true) tomada++;
    else if (t === false) no++;
    else desconocida++;
  }
  return { tomada, no, desconocida };
}

export type AlertasPorDiaPoint = {
  fecha: string;
  label: string;
  alta: number;
  media: number;
  baja: number;
  total: number;
};

/**
 * Frecuencia de alertas por día a partir de `payload.alertas` de cada reporte.
 * Usamos el payload (no la tabla alerts) para alinear cada alerta con la fecha
 * del reporte que la originó.
 */
export function alertasPorDiaSeries(reports: Report[]): AlertasPorDiaPoint[] {
  return reports.map((r) => {
    const alertas = r.payload?.alertas ?? [];
    let alta = 0;
    let media = 0;
    let baja = 0;
    for (const a of alertas) {
      if (a.severidad === "alta") alta++;
      else if (a.severidad === "media") media++;
      else baja++;
    }
    return {
      fecha: r.fecha,
      label: shortFecha(r.fecha),
      alta,
      media,
      baja,
      total: alertas.length,
    };
  });
}

export type AnimoPoint = { estado: string; cantidad: number };

/** Estados de ánimo más frecuentes (conteo descendente, capitalizado afuera). */
export function animoFrecuencia(reports: Report[]): AnimoPoint[] {
  const counts = new Map<string, number>();
  for (const r of reports) {
    const estado = r.payload?.animo?.estado?.trim().toLowerCase();
    if (!estado) continue;
    counts.set(estado, (counts.get(estado) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([estado, cantidad]) => ({ estado, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);
}
