export type StoredPushSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type NotificationPayload = {
  title: string;
  body: string;
  url: string;
};

export function parsePushSubscription(
  value: unknown
): StoredPushSubscription | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };

  const endpoint =
    typeof candidate.endpoint === "string" ? candidate.endpoint.trim() : "";
  const p256dh =
    typeof candidate.keys?.p256dh === "string"
      ? candidate.keys.p256dh.trim()
      : "";
  const auth =
    typeof candidate.keys?.auth === "string" ? candidate.keys.auth.trim() : "";

  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

export function buildNotificationPayload(
  body = "Esta es una prueba de notificaciones."
): NotificationPayload {
  return {
    title: "CuidaVoz",
    body,
    url: "/elder",
  };
}
