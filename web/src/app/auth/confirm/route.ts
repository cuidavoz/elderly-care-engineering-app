import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

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

  return NextResponse.redirect(new URL(next, origin));
}
