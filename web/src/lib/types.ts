/**
 * Tipos del dominio CuidaVoz.
 *
 * Reflejan el esquema de Supabase (ver `supabase/migrations/0001_init.sql`).
 * El `payload` de un reporte sigue el esquema Pydantic `Reporte` del backend
 * Python; lo tipamos de forma defensiva (todo opcional) porque se genera fuera
 * del web app y puede venir incompleto.
 */

export type FamilyRole = "owner" | "caregiver";
export type AlertSeverity = "baja" | "media" | "alta";
export type AlertEstado = "pendiente" | "vista" | "resuelta";

export type Family = {
  id: string;
  nombre: string;
  created_by: string;
  created_at: string;
};

/** Familia + el rol del usuario actual en ella (derivado de family_members). */
export type FamilyWithRole = Family & { rol: FamilyRole };

export type Elder = {
  id: string;
  family_id: string;
  nombre: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Report = {
  id: string;
  elder_id: string;
  family_id: string;
  fecha: string;
  payload: ReportePayload;
  resumen: string | null;
  confianza: number | null;
  incompleto: boolean;
  created_at: string;
};

export type Alert = {
  id: string;
  report_id: string;
  elder_id: string;
  family_id: string;
  tipo: string;
  severidad: AlertSeverity;
  evidencia: string | null;
  estado: AlertEstado;
  resuelta_por: string | null;
  resuelta_at: string | null;
  created_at: string;
};

/** Respuesta del backend `POST /digest` (resumen semanal). */
export type Digest = {
  elder_id: string;
  desde: string;
  hasta: string;
  n_reportes: number;
  resumen: string;
  tendencias: {
    sueno?: string | null;
    animo?: string | null;
    salud?: string | null;
    medicacion?: string | null;
  };
  alertas_destacadas: {
    tipo?: string;
    severidad?: AlertSeverity;
    evidencia?: string | null;
    fecha?: string | null;
  }[];
  recomendaciones: string[];
};

/**
 * Forma del jsonb `reports.payload` (esquema `Reporte` del backend).
 * Todo opcional: el reporte puede llegar parcial / con campos faltantes.
 */
export type ReportePayload = {
  fecha?: string;
  salud?: {
    sintomas?: string[];
    medicacion_tomada?: boolean | null;
    dolor?: string | null;
  } | null;
  sueno?: {
    calidad?: string | null;
    notas?: string | null;
  } | null;
  animo?: {
    estado?: string | null;
    notas?: string | null;
  } | null;
  actividades?: string[];
  alertas?: PayloadAlerta[];
  resumen?: string | null;
  claims?: ReporteClaim[];
  incompleto?: boolean;
};

export type PayloadAlerta = {
  tipo?: string;
  severidad?: AlertSeverity;
  evidencia?: string | null;
};

export type ReporteClaim = {
  afirmacion?: string;
  campo?: string;
  fuente_textual?: string;
};
