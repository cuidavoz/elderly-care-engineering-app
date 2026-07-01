import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function requirePushElderAccess(elderId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Tu sesión expiró. Volvé a ingresar." },
        { status: 401 }
      ),
    };
  }

  const { data: elder, error } = await supabase
    .from("elders")
    .select("id, family_id")
    .eq("id", elderId)
    .maybeSingle();

  if (error || !elder) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "No tenés acceso a este adulto mayor." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    supabase,
    user,
    elder: elder as { id: string; family_id: string },
  };
}
