import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Confirmación de email (patrón SSR de @supabase/ssr).
 *
 * El template de "Confirm signup" en Supabase apunta acá con `token_hash` + `type`
 * (en vez de usar el flujo implícito de {{ .ConfirmationURL }}, que no setea bien
 * la cookie de sesión en SSR). Verificamos el OTP server-side —lo que escribe la
 * cookie de sesión— y redirigimos a `next` (la invitación o el panel).
 *
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next={{ .RedirectTo }}
 */

/**
 * Normaliza `next` a una ruta interna segura (evita open-redirect). Acepta tanto
 * un path absoluto ("/dashboard/...") como una URL completa del mismo origen.
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

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Token ausente, vencido o inválido → al login con un aviso.
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("notice", "confirm-error");
  return NextResponse.redirect(loginUrl);
}
