import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "./env";

/**
 * Crea un cliente de Supabase para usar en componentes de cliente
 * (componentes con la directiva "use client").
 *
 * Se ejecuta en el navegador y persiste la sesión en cookies, lo que
 * permite que el servidor y el middleware lean la misma sesión.
 */
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
