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

/** Estado de una invitación a colaborar en una familia. */
export type InviteStatus = "pendiente" | "aceptada" | "revocada";

/**
 * Invitación a sumarse a una familia. La crea un miembro; el invitado abre el
 * link con el `token` (único) y la acepta. `token` y `status` los pone la DB
 * por default al insertar.
 */
export type Invite = {
  id: string;
  family_id: string;
  email: string;
  rol: FamilyRole;
  token: string;
  invited_by: string;
  status: InviteStatus;
  created_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
};

/**
 * Detalle de una invitación para la pantalla de aceptación (RPC
 * `get_invite_preview`). Permite mostrar "X te invita a Y como Z" sin aceptar, y
 * los flags dejan a la UI decidir qué mostrar.
 */
export type InvitePreview = {
  family_id: string;
  family_nombre: string;
  inviter_nombre: string | null;
  inviter_email: string | null;
  rol: FamilyRole;
  invite_email: string;
  status: InviteStatus;
  is_expired: boolean;
  email_matches: boolean;
  already_member: boolean;
};

/**
 * Miembro de una familia con su perfil. `nombre`/`email` pueden venir null si el
 * perfil asociado todavía no tiene esos datos.
 */
export type FamilyMember = {
  profile_id: string;
  nombre: string | null;
  email: string | null;
  rol: FamilyRole;
};

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
  // Afirmaciones que el modelo generó pero el guard descartó por no tener
  // respaldo en la transcripción (alucinaciones filtradas). Puede faltar o
  // venir vacío en reportes viejos / sin claims.
  claims_descartados?: ReporteClaim[];
  faithfulness?: Faithfulness | null;
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

/**
 * Fidelidad (faithfulness) del reporte respecto de la transcripción: mide qué
 * proporción de las afirmaciones que el modelo generó estaban realmente
 * respaldadas por lo que dijo el adulto mayor (cuántas NO fueron alucinadas).
 * Se calcula sobre los claims crudos del LLM. Puede venir ausente/`null` en
 * reportes viejos.
 */
export type Faithfulness = {
  score?: number | null; // 0..1; null si el reporte no tuvo claims
  n_claims?: number; // claims crudos del modelo
  n_grounded?: number; // cuántos estaban respaldados por la transcripción
  metodo?: string; // p. ej. "substring"
};
