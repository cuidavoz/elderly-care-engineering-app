import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseEnv } from "./env";

/**
 * Crea un cliente de Supabase para usar en Server Components, Server Actions
 * y Route Handlers.
 *
 * En Next.js 15/16 `cookies()` es asíncrono, por eso esta función es async.
 * Usamos el patrón vigente de `@supabase/ssr` (getAll / setAll).
 *
 * Nota: dentro de un Server Component el `set` de cookies puede lanzar (solo
 * se pueden escribir cookies en Server Actions o Route Handlers). Por eso el
 * `setAll` envuelve la escritura en try/catch: si el middleware (proxy) refresca
 * la sesión, esto es seguro de ignorar.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // El `setAll` fue llamado desde un Server Component. Se puede ignorar
          // si hay un middleware (proxy) refrescando las sesiones de usuario.
        }
      },
    },
  });
}
