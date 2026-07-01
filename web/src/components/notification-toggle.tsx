"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  browserSupportsPush,
  getCurrentPushSubscription,
  registerPushServiceWorker,
  subscribeToPush,
} from "@/lib/push/client";

const SHOW_TEST_BUTTON =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_PUSH_TEST === "true";

type LoadState = "checking" | "ready" | "unsupported";
type NotificationToggleAlign = "center" | "start" | "end";

type NotificationToggleProps = {
  elderId: string;
  align?: NotificationToggleAlign;
  className?: string;
};

type PushStatusResponse = {
  publicKey: string | null;
  configured: boolean;
  subscribed: boolean;
  error?: string;
};

type PushTestResponse = {
  sent?: number;
  inactive?: number;
  failed?: number;
  message?: string;
  error?: string;
};

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

function getRootAlignClassName(align: NotificationToggleAlign) {
  if (align === "start") return "items-start text-left";
  if (align === "end") return "items-start text-left sm:items-end sm:text-right";
  return "items-center text-center";
}

function getButtonAlignClassName(align: NotificationToggleAlign) {
  if (align === "start") return "justify-start";
  if (align === "end") return "justify-start sm:justify-end";
  return "justify-center";
}

export function NotificationToggle({
  elderId,
  align = "center",
  className,
}: NotificationToggleProps) {
  const [loadState, setLoadState] = useState<LoadState>("checking");
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rootClassName = cn(
    "flex max-w-xs flex-col gap-3",
    getRootAlignClassName(align),
    className
  );
  const buttonRowClassName = cn(
    "flex flex-wrap gap-2",
    getButtonAlignClassName(align)
  );

  const saveSubscription = useCallback(
    async (sub: PushSubscription) => {
      const res = await fetch(`/api/elders/${elderId}/push/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok || data.error) {
        throw new Error(data.error || "No pudimos activar los avisos.");
      }
    },
    [elderId]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!browserSupportsPush()) {
        if (!cancelled) setLoadState("unsupported");
        return;
      }

      setPermission(Notification.permission);

      try {
        await registerPushServiceWorker();
        const localSubscription = await getCurrentPushSubscription();
        const endpoint = localSubscription?.endpoint
          ? `?endpoint=${encodeURIComponent(localSubscription.endpoint)}`
          : "";
        const res = await fetch(`/api/elders/${elderId}/push${endpoint}`);
        const data = await readJson<PushStatusResponse>(res);

        if (!res.ok || data.error) {
          throw new Error(data.error || "No pudimos revisar los avisos.");
        }

        if (localSubscription && !data.subscribed) {
          await saveSubscription(localSubscription);
        }

        if (!cancelled) {
          setPublicKey(data.publicKey);
          setSubscription(localSubscription);
          setLoadState("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "No pudimos preparar los avisos."
          );
          setLoadState("ready");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [elderId, saveSubscription]);

  async function activate() {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      if (!publicKey) {
        throw new Error("Falta configurar las claves de notificaciones.");
      }

      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        throw new Error("No quedaron activados los avisos.");
      }

      await registerPushServiceWorker();
      const existing = await getCurrentPushSubscription();
      const nextSubscription = existing ?? (await subscribeToPush(publicKey));
      await saveSubscription(nextSubscription);

      setSubscription(nextSubscription);
      setMessage("Listo, los avisos quedaron activados.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos activar los avisos."
      );
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const current = subscription ?? (await getCurrentPushSubscription());
      if (current?.endpoint) {
        const res = await fetch(`/api/elders/${elderId}/push/subscription`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: current.endpoint }),
        });
        const data = await readJson<{ error?: string }>(res);
        if (!res.ok || data.error) {
          throw new Error(data.error || "No pudimos desactivar los avisos.");
        }
        await current.unsubscribe();
      }

      setSubscription(null);
      setMessage("Los avisos quedaron desactivados.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos desactivar los avisos."
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/elders/${elderId}/push/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await readJson<PushTestResponse>(res);
      if (!res.ok || data.error) {
        throw new Error(data.error || "No pudimos mandar el aviso de prueba.");
      }
      setMessage(
        data.sent && data.sent > 0
          ? "Te mandamos un aviso de prueba."
          : data.message || "No hay avisos activos para probar."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos mandar el aviso de prueba."
      );
    } finally {
      setBusy(false);
    }
  }

  if (loadState === "checking") {
    return (
      <div
        className={cn(
          "text-muted-foreground flex items-center gap-2 text-sm",
          className
        )}
      >
        <Loader2 className="size-4 animate-spin" />
        Preparando avisos...
      </div>
    );
  }

  if (loadState === "unsupported") {
    return (
      <p
        className={cn(
          "text-muted-foreground max-w-xs text-sm",
          align === "center" ? "text-center" : "text-left",
          className
        )}
      >
        Este dispositivo no permite activar avisos desde acá.
      </p>
    );
  }

  const isDenied = permission === "denied";
  const isSubscribed = Boolean(subscription);

  return (
    <div className={rootClassName}>
      <div className={buttonRowClassName}>
        {isSubscribed ? (
          <>
            {SHOW_TEST_BUTTON ? (
              <Button
                type="button"
                onClick={sendTest}
                disabled={busy}
                size="sm"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <BellRing className="size-4" />
                )}
                Probar aviso
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={deactivate}
              disabled={busy}
              variant="outline"
              size="sm"
            >
              <BellOff className="size-4" />
              Desactivar
            </Button>
          </>
        ) : (
          <Button type="button" onClick={activate} disabled={busy || isDenied}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Bell className="size-4" />
            )}
            Activar avisos
          </Button>
        )}
      </div>

      {isDenied ? (
        <p className="text-muted-foreground text-sm">
          Los avisos están bloqueados en este navegador.
        </p>
      ) : null}
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
