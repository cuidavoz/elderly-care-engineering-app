import { NextResponse, type NextRequest } from "next/server";

import { requirePushElderAccess } from "@/lib/push/route-auth";
import { parsePushSubscription } from "@/lib/push/shared";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/elders/[elderId]/push/subscription">
) {
  const { elderId } = await ctx.params;
  const access = await requirePushElderAccess(elderId);
  if (!access.ok) return access.response;

  const json = (await request.json().catch(() => null)) as {
    subscription?: unknown;
  } | null;
  const subscription = parsePushSubscription(json?.subscription ?? json);

  if (!subscription) {
    return NextResponse.json(
      { error: "La suscripción de notificaciones es inválida." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { error } = await access.supabase.from("push_subscriptions").upsert(
    {
      elder_id: elderId,
      family_id: access.elder.family_id,
      profile_id: access.user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: request.headers.get("user-agent"),
      estado: "activa",
      updated_at: now,
    },
    { onConflict: "profile_id,elder_id,endpoint" }
  );

  if (error) {
    return NextResponse.json(
      { error: `No se pudo guardar la suscripción: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/elders/[elderId]/push/subscription">
) {
  const { elderId } = await ctx.params;
  const access = await requirePushElderAccess(elderId);
  if (!access.ok) return access.response;

  const json = (await request.json().catch(() => null)) as {
    endpoint?: unknown;
  } | null;
  const endpoint = typeof json?.endpoint === "string" ? json.endpoint.trim() : "";

  if (!endpoint) {
    return NextResponse.json(
      { error: "Falta identificar el dispositivo a desactivar." },
      { status: 400 }
    );
  }

  const { error } = await access.supabase
    .from("push_subscriptions")
    .update({ estado: "inactiva", updated_at: new Date().toISOString() })
    .eq("elder_id", elderId)
    .eq("profile_id", access.user.id)
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json(
      { error: `No se pudo desactivar la suscripción: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
