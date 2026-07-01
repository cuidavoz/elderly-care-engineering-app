import { NextResponse, type NextRequest } from "next/server";

import {
  getVapidConfig,
  isExpiredPushSubscriptionError,
  sendWebPush,
} from "@/lib/push/server";
import { requirePushElderAccess } from "@/lib/push/route-auth";
import { buildNotificationPayload } from "@/lib/push/shared";
import type { PushSubscriptionRow } from "@/lib/types";

const PUSH_TEST_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_PUSH_TEST === "true";

type PushTarget = Pick<
  PushSubscriptionRow,
  "id" | "endpoint" | "p256dh" | "auth"
>;

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/elders/[elderId]/push/test">
) {
  if (!PUSH_TEST_ENABLED) {
    return NextResponse.json(
      { error: "Los avisos de prueba no están habilitados." },
      { status: 404 }
    );
  }

  const { elderId } = await ctx.params;
  const access = await requirePushElderAccess(elderId);
  if (!access.ok) return access.response;

  const config = getVapidConfig();
  if (!config.ok) {
    return NextResponse.json({ error: config.error }, { status: 400 });
  }

  const json = (await request.json().catch(() => ({}))) as { body?: unknown };
  const body =
    typeof json.body === "string" && json.body.trim()
      ? json.body.trim()
      : undefined;
  const payload = buildNotificationPayload(body);

  const { data, error } = await access.supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("elder_id", elderId)
    .eq("estado", "activa");

  if (error) {
    return NextResponse.json(
      { error: `No se pudieron leer las suscripciones: ${error.message}` },
      { status: 500 }
    );
  }

  const subscriptions = Array.from(
    new Map(((data ?? []) as PushTarget[]).map((row) => [row.endpoint, row]))
      .values()
  );
  if (subscriptions.length === 0) {
    return NextResponse.json({
      sent: 0,
      inactive: 0,
      failed: 0,
      message: "No hay dispositivos activos para probar.",
    });
  }

  let sent = 0;
  let inactive = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    try {
      await sendWebPush(subscription, payload);
      sent += 1;
    } catch (err) {
      if (isExpiredPushSubscriptionError(err)) {
        inactive += 1;
        await access.supabase
          .from("push_subscriptions")
          .update({ estado: "inactiva", updated_at: new Date().toISOString() })
          .eq("id", subscription.id);
      } else {
        failed += 1;
      }
    }
  }

  return NextResponse.json({ sent, inactive, failed });
}
