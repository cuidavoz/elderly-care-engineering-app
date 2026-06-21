import { NextResponse, type NextRequest } from "next/server";

import {
  QUERY_TIMEOUT_MS,
  backendHeaders,
  fetchWithTimeout,
  getApiBase,
  userCanAccessElder,
} from "@/lib/backend";

/**
 * POST /api/elders/[elderId]/digest
 *
 * Proxy server-side hacia `POST {API_BASE}/digest` del backend Python.
 * Verifica con la sesión del usuario que pueda ver este elder (RLS) y reenvía
 * `elder_id` + `dias` como form-data. Devuelve el JSON del backend (resumen
 * semanal: resumen, tendencias por dimensión, alertas destacadas y
 * recomendaciones).
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/elders/[elderId]/digest">
) {
  const { elderId } = await ctx.params;

  if (!(await userCanAccessElder(elderId))) {
    return NextResponse.json(
      { error: "No tenés acceso a este adulto mayor." },
      { status: 403 }
    );
  }

  // Aceptamos JSON desde el cliente: { dias?: number }. Default 7, acotado.
  let dias = 7;
  try {
    const json = (await request.json().catch(() => ({}))) as { dias?: unknown };
    const n = Number(json.dias);
    if (Number.isFinite(n) && n > 0) {
      dias = Math.min(Math.trunc(n), 90);
    }
  } catch {
    // Body vacío / inválido: usamos el default.
  }

  // El backend espera form-data: elder_id + dias.
  const outgoing = new FormData();
  outgoing.set("elder_id", elderId);
  outgoing.set("dias", String(dias));

  let backendRes: Response;
  try {
    backendRes = await fetchWithTimeout(
      `${getApiBase()}/digest`,
      { method: "POST", body: outgoing, headers: backendHeaders() },
      QUERY_TIMEOUT_MS
    );
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    return NextResponse.json(
      {
        error: isTimeout
          ? "La generación del resumen tardó demasiado. Probá de nuevo."
          : "No se pudo conectar con el servicio de resúmenes.",
      },
      { status: isTimeout ? 504 : 502 }
    );
  }

  let body: unknown;
  try {
    body = await backendRes.json();
  } catch {
    return NextResponse.json(
      { error: "El servicio respondió en un formato inesperado." },
      { status: 502 }
    );
  }

  return NextResponse.json(body, {
    status: backendRes.ok ? 200 : backendRes.status,
  });
}
