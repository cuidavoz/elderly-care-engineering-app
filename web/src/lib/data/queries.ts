import { createClient } from "@/lib/supabase/server";
import type {
  Alert,
  Elder,
  Family,
  FamilyWithRole,
  Report,
} from "@/lib/types";

/**
 * Capa de lectura contra Supabase. Todo se ejecuta en el server con la sesión
 * del usuario, así que la RLS filtra por familia: un `select` solo devuelve
 * lo que el usuario puede ver. No hace falta filtrar por usuario a mano.
 */

/**
 * Familias del usuario, con su rol. Hacemos el join desde `family_members`
 * (del que el usuario es parte) hacia `families`, así obtenemos el rol.
 */
export async function getFamilies(): Promise<FamilyWithRole[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("family_members")
    .select("rol, families(id, nombre, created_by, created_at)")
    .order("created_at", { referencedTable: "families", ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar las familias: ${error.message}`);
  }

  type Row = { rol: FamilyWithRole["rol"]; families: Family | null };

  return ((data ?? []) as unknown as Row[])
    .filter((row): row is Row & { families: Family } => row.families != null)
    .map((row) => ({ ...row.families, rol: row.rol }));
}

/** Una familia puntual (o null si no existe / no es accesible por RLS). */
export async function getFamily(familyId: string): Promise<Family | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("families")
    .select("id, nombre, created_by, created_at")
    .eq("id", familyId)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar la familia: ${error.message}`);
  }
  return data as Family | null;
}

/** Adultos mayores de una familia, alfabéticos. */
export async function getElders(familyId: string): Promise<Elder[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("elders")
    .select("id, family_id, nombre, metadata, created_at")
    .eq("family_id", familyId)
    .order("nombre", { ascending: true });

  if (error) {
    throw new Error(
      `No se pudieron cargar los adultos mayores: ${error.message}`
    );
  }
  return (data ?? []) as Elder[];
}

/** Un adulto mayor puntual (o null). */
export async function getElder(elderId: string): Promise<Elder | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("elders")
    .select("id, family_id, nombre, metadata, created_at")
    .eq("id", elderId)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar el adulto mayor: ${error.message}`);
  }
  return data as Elder | null;
}

const REPORT_COLUMNS =
  "id, elder_id, family_id, fecha, payload, resumen, confianza, incompleto, created_at";

const ALERT_COLUMNS =
  "id, report_id, elder_id, family_id, tipo, severidad, evidencia, estado, resuelta_por, resuelta_at, created_at";

/** Reportes de un adulto mayor, más recientes primero. */
export async function getReports(elderId: string): Promise<Report[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("reports")
    .select(REPORT_COLUMNS)
    .eq("elder_id", elderId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`No se pudieron cargar los reportes: ${error.message}`);
  }
  return (data ?? []) as Report[];
}

/**
 * Reportes en orden cronológico ascendente (para series temporales en el tab
 * de Tendencias).
 */
export async function getReportsAsc(elderId: string): Promise<Report[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("reports")
    .select(REPORT_COLUMNS)
    .eq("elder_id", elderId)
    .order("fecha", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar los reportes: ${error.message}`);
  }
  return (data ?? []) as Report[];
}

/**
 * Alertas de un adulto mayor. Ordenadas con las pendientes primero, luego por
 * fecha de creación descendente (más recientes arriba).
 */
export async function getAlerts(elderId: string): Promise<Alert[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("alerts")
    .select(ALERT_COLUMNS)
    .eq("elder_id", elderId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`No se pudieron cargar las alertas: ${error.message}`);
  }

  const alerts = (data ?? []) as Alert[];
  // Orden: pendiente (0) → vista (1) → resuelta (2); dentro del grupo, el más
  // reciente primero (ya viene así de la query).
  const rank: Record<Alert["estado"], number> = {
    pendiente: 0,
    vista: 1,
    resuelta: 2,
  };
  return alerts.sort(
    (a, b) => (rank[a.estado] ?? 3) - (rank[b.estado] ?? 3)
  );
}

/** Cantidad de alertas pendientes de un adulto mayor (para el badge del tab). */
export async function getPendingAlertCount(elderId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .eq("elder_id", elderId)
    .eq("estado", "pendiente");

  if (error) {
    // No es crítico: si falla, mostramos 0 (no rompemos el layout).
    return 0;
  }
  return count ?? 0;
}
