import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseEnv } from "./env";

/**
 * Refresca la sesión de Supabase en cada request (se ejecuta desde `proxy.ts`,
 * el equivalente del antiguo middleware en Next.js 16).
 *
 * IMPORTANTE (patrón vigente de @supabase/ssr):
 *  - No ejecutes lógica entre `createServerClient` y `getClaims()`.
 *  - Devolvé siempre el `supabaseResponse` tal cual (con sus cookies), salvo
 *    que crees una nueva respuesta, en cuyo caso copiá las cookies.
 *  - Usamos `getClaims()` (verifica el JWT) en lugar de `getSession()`.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresca el token de auth. No metas lógica entre el create y este await.
  const { data } = await supabase.auth.getClaims();

  const isLoggedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  // Rutas que requieren sesión.
  const isProtected = pathname.startsWith("/dashboard");
  // Rutas de auth: si ya hay sesión, no tiene sentido mostrarlas.
  const isAuthRoute = pathname === "/login" || pathname === "/signup";

  if (!isLoggedIn && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isLoggedIn && isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
