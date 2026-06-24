import { NextResponse, type NextRequest } from "next/server";

export const maxDuration = 60;

import {
  AUDIO_TIMEOUT_MS,
  backendHeaders,
  fetchWithTimeout,
  getApiBase,
  userCanAccessElder,
} from "@/lib/backend";

/**
 * POST /api/elders/[elderId]/reportes
 *
 * Proxy server-side hacia `POST {API_BASE}/reportes` del backend Python.
 * Recibe el `FormData` con el audio del browser, verifica con la sesión del
 * usuario que pueda ver este elder (RLS), y reenvía el multipart al backend.
 *
 * El backend persiste el reporte + alertas en Supabase e indexa para RAG; acá
 * solo devolvemos su JSON tal cual (`{ reporte, confianza, error }`).
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/elders/[elderId]/reportes">
) {
  const { elderId } = await ctx.params;

  // Verificación de acceso vía RLS (el usuario debe ser miembro de la familia).
  if (!(await userCanAccessElder(elderId))) {
    return NextResponse.json(
      { error: "No tenés acceso a este adulto mayor." },
      { status: 403 }
    );
  }

  // Tomamos el audio del FormData que mandó el browser.
  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el archivo enviado." },
      { status: 400 }
    );
  }

  const audio = incoming.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json(
      { error: "Falta el archivo de audio." },
      { status: 400 }
    );
  }

  // Armamos el multipart que espera el backend: elder_id + audio.
  const outgoing = new FormData();
  outgoing.set("elder_id", elderId);
  outgoing.set("audio", audio, audio.name || "audio");

  let backendRes: Response;
  try {
    backendRes = await fetchWithTimeout(
      `${getApiBase()}/reportes`,
      { method: "POST", body: outgoing, headers: backendHeaders() },
      AUDIO_TIMEOUT_MS
    );
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    return NextResponse.json(
      {
        error: isTimeout
          ? "El procesamiento del audio tardó demasiado. Probá de nuevo."
          : "No se pudo conectar con el servicio de procesamiento de audio.",
      },
      { status: isTimeout ? 504 : 502 }
    );
  }

  // Pasamos el JSON del backend al cliente, preservando errores HTTP.
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
