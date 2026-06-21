import { createClient } from "@/lib/supabase/server";

/**
 * Helpers compartidos para hablar con el backend Python (FastAPI) de CuidaVoz
 * desde los Route Handlers (proxy server-side).
 *
 * El backend transcribe el audio, genera el reporte fiel, detecta alertas,
 * persiste en la MISMA base Supabase (con STORAGE_BACKEND=postgres) e indexa
 * para RAG. El web app NO lo toca: solo lo consume vía estos handlers.
 */

/**
 * Base URL del backend. Server-side a propósito (sin NEXT_PUBLIC_): el browser
 * nunca le pega directo, siempre pasa por el Route Handler. Default local.
 */
export function getApiBase(): string {
  return process.env.CUIDAVOZ_API_BASE?.trim() || "http://localhost:8000";
}

/**
 * Headers de autenticación server-to-server hacia el backend Python. El backend
 * usa el service role (bypassa RLS), así que NO debe ser público: firmamos cada
 * request con un token compartido (`X-Internal-Token`). Se setea vía la env
 * `CUIDAVOZ_INTERNAL_TOKEN` (en Vercel) y debe coincidir con `INTERNAL_API_TOKEN`
 * del backend (en Render). Si no está seteado, no mandamos header (el backend en
 * ese caso queda en modo abierto; ver `require_internal_token` en la API).
 */
export function backendHeaders(): Record<string, string> {
  const token = process.env.CUIDAVOZ_INTERNAL_TOKEN?.trim();
  return token ? { "X-Internal-Token": token } : {};
}

/**
 * El backend puede tardar varios segundos (transcripción + LLM). Damos un
 * margen amplio para audio; las consultas Q&A usan un timeout más corto.
 */
export const AUDIO_TIMEOUT_MS = 120_000;
export const QUERY_TIMEOUT_MS = 60_000;

/**
 * Verifica, con la sesión del usuario logueado, que pueda ver este elder.
 * La RLS hace el trabajo: el `select` solo devuelve la fila si el usuario es
 * miembro de la familia del elder. Devuelve `true` si tiene acceso.
 *
 * Importante para seguridad: usamos el server client (cookies del usuario), no
 * un cliente con service role, así la RLS aplica de verdad.
 */
export async function userCanAccessElder(elderId: string): Promise<boolean> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("elders")
    .select("id")
    .eq("id", elderId)
    .maybeSingle();

  if (error) return false;
  return data != null;
}

/**
 * Hace un `fetch` con timeout vía AbortController. Re-lanza un error con
 * `name === "TimeoutError"` cuando vence el plazo para distinguirlo de otros
 * fallos de red.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      const timeoutErr = new Error("La operación tardó demasiado.");
      timeoutErr.name = "TimeoutError";
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
