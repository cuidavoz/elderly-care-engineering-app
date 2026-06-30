import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Confirmación de OTP (magic link y signup).
 *
 * Flujo adulto_mayor:
 *   1. invitarAdultoMayor() crea la fila en `invites` y envía magic link.
 *   2. El adulto mayor hace clic → llega acá con token_hash + type=magiclink.
 *   3. Verificamos el OTP → sesión establecida.
 *   4. Buscamos la invitación pendiente de adulto_mayor para ese email.
 *   5. Llamamos accept_invite() → elders.user_id queda vinculado.
 *   6. Redirigimos a /elder.
 *
 * Flujo regular (signup de cuidador/familiar):
 *   - Igual que antes: verifica OTP y redirige a `next` (default /dashboard).
 */

function safeNext(raw: string | null, origin: string): string {
  if (!raw) return "/dashboard";
  try {
    const u = new URL(raw, origin);
    if (u.origin !== origin) return "/dashboard";
    return `${u.pathname}${u.search}`;
  } catch {
    return "/dashboard";
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"), origin);

  if (!tokenHash || !type) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("notice", "confirm-error");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const { error: otpError } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (otpError) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("notice", "confirm-error");
    return NextResponse.redirect(loginUrl);
  }

  // Null-guard: getUser() puede devolver null en edge cases.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  // Buscar invitación pendiente de adulto_mayor para este email.
  const { data: pendingInvite } = await supabase
    .from("invites")
    .select("token")
    .eq("email", user.email.toLowerCase())
    .eq("status", "pendiente")
    .eq("rol", "adulto_mayor")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pendingInvite) {
    // Fix ronda 6 C1: redirect fuera del try para que NEXT_REDIRECT no sea
    // capturado por el catch (en Route Handlers se usa NextResponse.redirect,
    // pero dejamos el patrón explícito por claridad).
    try {
      const { error: rpcError } = await supabase.rpc("accept_invite", {
        _token: pendingInvite.token,
      });
      if (rpcError) throw rpcError;
    } catch {
      return NextResponse.redirect(
        new URL("/error?message=invite_failed", origin)
      );
    }
    return NextResponse.redirect(new URL("/elder", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
