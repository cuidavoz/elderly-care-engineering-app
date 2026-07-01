import { NextResponse, type NextRequest } from "next/server";

import { getVapidPublicKey } from "@/lib/push/server";
import { requirePushElderAccess } from "@/lib/push/route-auth";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/elders/[elderId]/push">
) {
  const { elderId } = await ctx.params;
  const access = await requirePushElderAccess(elderId);
  if (!access.ok) return access.response;

  const endpoint = request.nextUrl.searchParams.get("endpoint")?.trim();
  let query = access.supabase
    .from("push_subscriptions")
    .select("id")
    .eq("elder_id", elderId)
    .eq("profile_id", access.user.id)
    .eq("estado", "activa")
    .limit(1);

  if (endpoint) {
    query = query.eq("endpoint", endpoint);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: `No se pudo consultar la suscripción: ${error.message}` },
      { status: 500 }
    );
  }

  const publicKey = getVapidPublicKey();
  return NextResponse.json({
    publicKey,
    configured: Boolean(publicKey),
    subscribed: (data ?? []).length > 0,
  });
}
