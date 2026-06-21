import { NextResponse, type NextRequest } from "next/server";

import {
  QUERY_TIMEOUT_MS,
  backendHeaders,
  fetchWithTimeout,
  getApiBase,
  userCanAccessElder,
} from "@/lib/backend";

/**
 * POST /api/elders/[elderId]/consultas
 *
 * Proxy server-side hacia `POST {API_BASE}/consultas` del backend Python.
 * Verifica con la sesión del usuario que pueda ver este elder (RLS) y reenvía
 * `elder_id` + `pregunta` como form-data. Devuelve `{ respuesta }` (RAG sobre
 * el historial del adulto).
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/elders/[elderId]/consultas">
) {
  const { elderId } = await ctx.params;

  if (!(await userCanAccessElder(elderId))) {
    return NextResponse.json(
      { error: "No tenés acceso a este adulto mayor." },
      { status: 403 }
    );
  }

  // Aceptamos JSON desde el cliente (más simple de mandar desde el form).
  let pregunta = "";
  try {
    const json = (await request.json()) as { pregunta?: unknown };
    pregunta = typeof json.pregunta === "string" ? json.pregunta.trim() : "";
  } catch {
    return NextResponse.json(
      { error: "Pregunta inválida." },
      { status: 400 }
    );
  }

  if (!pregunta) {
    return NextResponse.json(
      { error: "Escribí una pregunta." },
      { status: 400 }
    );
  }

  // El backend espera form-data: elder_id + pregunta.
  const outgoing = new FormData();
  outgoing.set("elder_id", elderId);
  outgoing.set("pregunta", pregunta);

  let backendRes: Response;
  try {
    backendRes = await fetchWithTimeout(
      `${getApiBase()}/consultas`,
      { method: "POST", body: outgoing, headers: backendHeaders() },
      QUERY_TIMEOUT_MS
    );
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    return NextResponse.json(
      {
        error: isTimeout
          ? "La consulta tardó demasiado. Probá de nuevo."
          : "No se pudo conectar con el servicio de consultas.",
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
