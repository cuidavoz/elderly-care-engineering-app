import { createElement, type ReactElement } from "react";
import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

import { userCanAccessElder } from "@/lib/backend";
import { getElder, getFamily, getReports } from "@/lib/data/queries";
import { ReportDocument } from "@/lib/pdf/report-document";

/**
 * GET /api/elders/[elderId]/pdf
 *
 * Genera, del lado del servidor, el informe de seguimiento en PDF y lo
 * devuelve como descarga (Content-Disposition: attachment). Sin diálogo de
 * impresión ni cambio de vista en el cliente.
 *
 * Verifica acceso con la sesión del usuario (RLS vía `userCanAccessElder`) y
 * arma el documento con @react-pdf/renderer. Como este archivo es `.ts` (Next
 * solo acepta route handlers en `route.ts`/`route.tsx` para handlers HTTP, y
 * acá no hay JSX), construimos el elemento con `React.createElement` en vez de
 * JSX.
 */

// @react-pdf/renderer necesita APIs de Node (no Edge).
export const runtime = "nodejs";

/** Normaliza un nombre para usarlo en el filename: lowercase, sin acentos. */
function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      // Saca diacríticos (tildes, diéresis, etc.).
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "informe"
  );
}

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/elders/[elderId]/pdf">
) {
  const { elderId } = await ctx.params;

  if (!(await userCanAccessElder(elderId))) {
    return NextResponse.json(
      { error: "No tenés acceso a este adulto mayor." },
      { status: 403 }
    );
  }

  try {
    const elder = await getElder(elderId);
    if (!elder) {
      return NextResponse.json(
        { error: "No se encontró el adulto mayor." },
        { status: 404 }
      );
    }

    const [family, reports] = await Promise.all([
      getFamily(elder.family_id),
      getReports(elderId),
    ]);

    // `renderToBuffer` está tipado contra `DocumentProps` (los props de
    // `<Document>`), no contra los de nuestro componente. El elemento es válido
    // en runtime (su raíz es un `<Document>`); casteamos para satisfacer al tipo.
    const element = createElement(ReportDocument, {
      family,
      elder,
      reports,
    }) as unknown as ReactElement<DocumentProps>;
    const buffer = await renderToBuffer(element);

    const fecha = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const slug = `informe-${slugify(elder.nombre)}-${fecha}`;

    // `buffer` es un Uint8Array/Buffer de Node; NextResponse lo acepta como body.
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${slug}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo generar el PDF. Probá de nuevo." },
      { status: 500 }
    );
  }
}
