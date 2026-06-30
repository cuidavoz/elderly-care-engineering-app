"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { sendInviteEmail } from "@/lib/email";
import type { AlertEstado, FamilyRole } from "@/lib/types";

/** Base URL del sitio para armar el link de aceptación en mails (server-side). */
function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000"
  ).replace(/\/$/, "");
}

/**
 * Server Actions de mutación para CuidaVoz.
 *
 * Patrón: devuelven `{ error }` (o un payload con datos) para que el componente
 * cliente muestre un toast con `sonner`. La RLS y los triggers del esquema hacen
 * el trabajo pesado:
 *  - Al insertar en `families`, un trigger agrega al creador como `owner` en
 *    `family_members`, por eso después puede leerla.
 *  - Insertar en `elders` está permitido a cualquier miembro de la familia.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Crea una familia con `created_by = user.id`. */
export async function createFamily(
  _prevState: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const nombre = String(formData.get("nombre") ?? "").trim();

  if (!nombre) {
    return { ok: false, error: "Poné un nombre para la familia." };
  }
  if (nombre.length > 80) {
    return { ok: false, error: "El nombre es demasiado largo (máx. 80)." };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "Tu sesión expiró. Volvé a ingresar." };
  }

  const { data, error } = await supabase
    .from("families")
    .insert({ nombre, created_by: user.id })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: `No se pudo crear la familia: ${error?.message ?? "error desconocido"}`,
    };
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true, data: { id: data.id } };
}

/** Agrega un adulto mayor a una familia de la que el usuario es miembro. */
export async function createElder(
  _prevState: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const familyId = String(formData.get("familyId") ?? "").trim();
  const notas = String(formData.get("notas") ?? "").trim();

  if (!familyId) {
    return { ok: false, error: "Falta la familia." };
  }
  if (!nombre) {
    return { ok: false, error: "Poné el nombre del adulto mayor." };
  }
  if (nombre.length > 80) {
    return { ok: false, error: "El nombre es demasiado largo (máx. 80)." };
  }

  const supabase = await createClient();

  const metadata = notas ? { notas } : {};

  const { data, error } = await supabase
    .from("elders")
    .insert({ family_id: familyId, nombre, metadata })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: `No se pudo agregar el adulto mayor: ${error?.message ?? "error desconocido"}`,
    };
  }

  revalidatePath(`/dashboard/${familyId}`, "layout");
  return { ok: true, data: { id: data.id } };
}

const VALID_ROLES: FamilyRole[] = ["cuidador", "familiar", "adulto_mayor"];

// Regex simple para descartar entradas claramente inválidas (no valida RFC).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Crea una invitación pendiente para un email. El `token` y el `status` los
 * pone la DB por default. La RLS valida que el usuario sea miembro de la familia.
 * Si ya hay una invitación pendiente para ese email (unique violation, 23505),
 * devolvemos un mensaje amable en vez del error crudo de Postgres.
 */
export async function createInvite(
  _prevState: ActionResult<{ token: string; emailed: boolean }> | null,
  formData: FormData
): Promise<ActionResult<{ token: string; emailed: boolean }>> {
  const familyId = String(formData.get("familyId") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const rolRaw = String(formData.get("rol") ?? "cuidador").trim();
  const rol = (VALID_ROLES.includes(rolRaw as FamilyRole)
    ? rolRaw
    : "cuidador") as FamilyRole;

  if (!familyId) {
    return { ok: false, error: "Falta la familia." };
  }
  if (!email) {
    return { ok: false, error: "Poné el correo de la persona a invitar." };
  }
  if (email.length > 120) {
    return { ok: false, error: "El correo es demasiado largo (máx. 120)." };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Ese correo no parece válido." };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "Tu sesión expiró. Volvé a ingresar." };
  }

  const { data, error } = await supabase
    .from("invites")
    .insert({ family_id: familyId, email, rol, invited_by: user.id })
    .select("token")
    .single();

  if (error || !data) {
    // 23505 = unique_violation → ya existe una invitación pendiente para ese email.
    if (error?.code === "23505") {
      return {
        ok: false,
        error: "Ya hay una invitación pendiente para ese correo.",
      };
    }
    return {
      ok: false,
      error: `No se pudo crear la invitación: ${error?.message ?? "error desconocido"}`,
    };
  }

  const token = data.token as string;

  // Mandamos el mail de invitación (best-effort: si SMTP no está configurado o
  // falla, no rompemos — el link queda copiable en el diálogo igual).
  const { data: family } = await supabase
    .from("families")
    .select("nombre")
    .eq("id", familyId)
    .maybeSingle();

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const inviterName =
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    user.email ||
    "Alguien";

  const emailed = await sendInviteEmail({
    to: email,
    familyName: family?.nombre ?? "tu familia",
    inviterName,
    role: rol,
    acceptUrl: `${getSiteUrl()}/dashboard/invitacion/${token}`,
  });

  revalidatePath(`/dashboard/${familyId}`, "layout");
  return { ok: true, data: { token, emailed } };
}

/**
 * Revoca una invitación pendiente (la marca como 'revocada'). La RLS valida que
 * el usuario pertenezca a la familia de la invitación.
 */
export async function revokeInvite(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const inviteId = String(formData.get("inviteId") ?? "").trim();
  const familyId = String(formData.get("familyId") ?? "").trim();

  if (!inviteId) {
    return { ok: false, error: "Falta la invitación." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("invites")
    .update({ status: "revocada" })
    .eq("id", inviteId);

  if (error) {
    return {
      ok: false,
      error: `No se pudo revocar la invitación: ${error.message}`,
    };
  }

  if (familyId) {
    revalidatePath(`/dashboard/${familyId}`, "layout");
  } else {
    revalidatePath("/dashboard", "layout");
  }
  return { ok: true, data: undefined };
}

/**
 * Acepta una invitación a partir del token. No es una action de formulario: la
 * llama la página de aceptación. El RPC `accept_invite` valida el token (vigente,
 * no usado) y que el email coincida con la cuenta logueada; si algo falla, tira
 * un error de Postgres que traducimos a un mensaje amable. Al aceptar devuelve
 * el `family_id` (uuid escalar).
 */
export async function acceptInvite(
  token: string
): Promise<ActionResult<{ familyId: string }>> {
  const cleanToken = String(token ?? "").trim();
  if (!cleanToken) {
    return { ok: false, error: "El link de invitación no es válido." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("accept_invite", {
    _token: cleanToken,
  });

  if (error) {
    return {
      ok: false,
      error: `No se pudo aceptar la invitación: ${error.message}`,
    };
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true, data: { familyId: String(data) } };
}

/**
 * Rechaza una invitación a partir del token (la marca como 'revocada'). El RPC
 * `reject_invite` valida que el token esté vigente y que el email coincida con la
 * cuenta logueada.
 */
export async function rejectInvite(token: string): Promise<ActionResult> {
  const cleanToken = String(token ?? "").trim();
  if (!cleanToken) {
    return { ok: false, error: "El link de invitación no es válido." };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("reject_invite", { _token: cleanToken });

  if (error) {
    return {
      ok: false,
      error: `No se pudo rechazar la invitación: ${error.message}`,
    };
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true, data: undefined };
}

/** Elimina un reporte. La RLS valida que el usuario sea owner de la familia. */
export async function deleteReport(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const reportId = String(formData.get("reportId") ?? "").trim();
  const familyId = String(formData.get("familyId") ?? "").trim();
  const elderId = String(formData.get("elderId") ?? "").trim();

  if (!reportId) return { ok: false, error: "Falta el reporte." };

  const supabase = await createClient();
  const { error } = await supabase.from("reports").delete().eq("id", reportId);

  if (error) {
    return { ok: false, error: `No se pudo eliminar el reporte: ${error.message}` };
  }

  if (familyId && elderId) {
    revalidatePath(`/dashboard/${familyId}/${elderId}`, "layout");
  } else {
    revalidatePath("/dashboard", "layout");
  }
  return { ok: true, data: undefined };
}

/** Elimina una familia. La RLS valida que created_by = usuario actual. */
export async function deleteFamily(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const familyId = String(formData.get("familyId") ?? "").trim();
  if (!familyId) return { ok: false, error: "Falta la familia." };

  const supabase = await createClient();
  const { error } = await supabase.from("families").delete().eq("id", familyId);

  if (error) {
    return { ok: false, error: `No se pudo eliminar la familia: ${error.message}` };
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true, data: undefined };
}

/** Elimina un miembro de la familia. La RLS bloquea que el owner se elimine a sí mismo. */
export async function removeMember(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const familyId = String(formData.get("familyId") ?? "").trim();
  const profileId = String(formData.get("profileId") ?? "").trim();

  if (!familyId || !profileId) {
    return { ok: false, error: "Faltan datos." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("family_members")
    .delete()
    .eq("family_id", familyId)
    .eq("profile_id", profileId);

  if (error) {
    return { ok: false, error: `No se pudo eliminar el miembro: ${error.message}` };
  }

  revalidatePath(`/dashboard/${familyId}`, "layout");
  return { ok: true, data: undefined };
}

/** Transfiere el ownership a otro miembro (RPC valida roles y permisos). */
export async function transferOwnership(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const familyId = String(formData.get("familyId") ?? "").trim();
  const newOwnerId = String(formData.get("newOwnerId") ?? "").trim();

  if (!familyId || !newOwnerId) {
    return { ok: false, error: "Faltan datos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_ownership", {
    _family_id: familyId,
    _new_owner_id: newOwnerId,
  });

  if (error) {
    return { ok: false, error: `No se pudo transferir: ${error.message}` };
  }

  revalidatePath(`/dashboard/${familyId}`, "layout");
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: undefined };
}

/**
 * Invita a un adulto mayor: crea la fila en `invites` con el `elder_id`
 * asociado y envía un magic link al email para que pueda ingresar sin
 * necesidad de crear una cuenta manualmente.
 */
export async function invitarAdultoMayor(
  _prevState: ActionResult<{ emailed: boolean }> | null,
  formData: FormData
): Promise<ActionResult<{ emailed: boolean }>> {
  const familyId = String(formData.get("familyId") ?? "").trim();
  const elderId = String(formData.get("elderId") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!familyId) return { ok: false, error: "Falta la familia." };
  if (!elderId) return { ok: false, error: "Falta el adulto mayor." };
  if (!email) return { ok: false, error: "Poné el correo del adulto mayor." };
  if (email.length > 120) return { ok: false, error: "El correo es demasiado largo (máx. 120)." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Ese correo no parece válido." };

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "Tu sesión expiró. Volvé a ingresar." };
  }

  const { error: insertError } = await supabase.from("invites").insert({
    family_id: familyId,
    email,
    rol: "adulto_mayor" as const,
    elder_id: elderId,
    invited_by: user.id,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { ok: false, error: "Ya hay una invitación pendiente para ese correo." };
    }
    return {
      ok: false,
      error: `No se pudo crear la invitación: ${insertError.message}`,
    };
  }

  // Enviar magic link (crea el usuario si no existe; al aceptar la OTP el
  // confirm/route.ts detecta la invitación pendiente y llama accept_invite).
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
    },
  });

  revalidatePath(`/dashboard/${familyId}`, "layout");
  return { ok: true, data: { emailed: !otpError } };
}

const VALID_ESTADOS: AlertEstado[] = ["pendiente", "vista", "resuelta"];

/**
 * Cambia el estado de una alerta (pendiente / vista / resuelta).
 *
 * La RLS valida que el usuario sea miembro de la familia de la alerta; acá solo
 * seteamos el estado y, cuando pasa a "resuelta", registramos quién y cuándo.
 * Al reabrir (volver a "pendiente"/"vista") limpiamos esos campos.
 */
export async function updateAlertEstado(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const alertId = String(formData.get("alertId") ?? "").trim();
  const estado = String(formData.get("estado") ?? "").trim() as AlertEstado;
  const familyId = String(formData.get("familyId") ?? "").trim();
  const elderId = String(formData.get("elderId") ?? "").trim();

  if (!alertId) {
    return { ok: false, error: "Falta la alerta." };
  }
  if (!VALID_ESTADOS.includes(estado)) {
    return { ok: false, error: "Estado de alerta inválido." };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "Tu sesión expiró. Volvé a ingresar." };
  }

  // Solo registramos resuelta_por / resuelta_at cuando la alerta queda resuelta;
  // al reabrir, los limpiamos.
  const patch =
    estado === "resuelta"
      ? {
          estado,
          resuelta_por: user.id,
          resuelta_at: new Date().toISOString(),
        }
      : { estado, resuelta_por: null, resuelta_at: null };

  const { error } = await supabase
    .from("alerts")
    .update(patch)
    .eq("id", alertId);

  if (error) {
    return {
      ok: false,
      error: `No se pudo actualizar la alerta: ${error.message}`,
    };
  }

  // Revalidamos el panel del adulto mayor (tab Alertas + badge del tab).
  if (familyId && elderId) {
    revalidatePath(`/dashboard/${familyId}/${elderId}`, "layout");
  } else {
    revalidatePath("/dashboard", "layout");
  }
  return { ok: true, data: undefined };
}
