import webpush from "web-push";

import type { PushSubscriptionRow } from "@/lib/types";
import type { NotificationPayload } from "./shared";

type VapidConfig =
  | {
      ok: true;
      publicKey: string;
      privateKey: string;
      subject: string;
    }
  | { ok: false; error: string; publicKey: string | null };

export function getVapidConfig(): VapidConfig {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:cuidavoz.team@gmail.com";

  if (!publicKey || !privateKey) {
    return {
      ok: false,
      publicKey,
      error:
        "Faltan las claves VAPID para enviar notificaciones. Configurá NEXT_PUBLIC_VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY.",
    };
  }

  return { ok: true, publicKey, privateKey, subject };
}

export function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

export async function sendWebPush(
  subscription: Pick<PushSubscriptionRow, "endpoint" | "p256dh" | "auth">,
  payload: NotificationPayload
) {
  const config = getVapidConfig();
  if (!config.ok) {
    throw new Error(config.error);
  }

  webpush.setVapidDetails(
    config.subject,
    config.publicKey,
    config.privateKey
  );

  return webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    },
    JSON.stringify(payload)
  );
}

export function isExpiredPushSubscriptionError(error: unknown): boolean {
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : NaN;
  return statusCode === 404 || statusCode === 410;
}
