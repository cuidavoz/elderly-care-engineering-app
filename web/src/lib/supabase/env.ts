/**
 * Lee las variables de entorno de Supabase de forma tolerante.
 *
 * Durante `next build` (o en previews sin Supabase configurado) las env reales
 * pueden no estar presentes. En lugar de romper el build, devolvemos
 * placeholders sintácticamente válidos. Los clientes de Supabase solo fallan
 * en tiempo de ejecución cuando se intenta hacer una request real, no al
 * construirse, así que el build pasa sin problemas.
 *
 * Las env reales se obtienen de `npx supabase start` (lo provee otro módulo)
 * y se cargan vía `.env.local`.
 */
const PLACEHOLDER_URL = "http://127.0.0.1:54321";
// Placeholder con forma de JWT (header.payload.signature) para que cualquier
// validación de formato del SDK no falle en build.
const PLACEHOLDER_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PLACEHOLDER.PLACEHOLDER";

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || PLACEHOLDER_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || PLACEHOLDER_ANON_KEY;

  return { url, anonKey };
}

/**
 * Indica si Supabase está realmente configurado (no placeholders).
 * Útil para mostrar avisos en la UI durante el setup.
 */
export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
}
