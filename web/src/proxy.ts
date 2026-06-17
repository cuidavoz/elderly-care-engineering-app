import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Proxy de Next.js 16 (antes "middleware"). Se ejecuta antes de cada request
 * que matchee el `config.matcher` y refresca la sesión de Supabase, además de
 * proteger las rutas privadas.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Matchea todas las rutas excepto:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico
     * - archivos de imagen comunes
     * Así el refresh de sesión corre en navegación pero no en assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
