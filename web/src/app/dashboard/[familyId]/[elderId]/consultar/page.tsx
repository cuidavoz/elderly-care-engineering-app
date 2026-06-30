import type { Metadata } from "next";

import { QaChat } from "./_components/qa-chat";

export const metadata: Metadata = {
  title: "Consultar",
};

/**
 * "Consultar": Q&A sobre el historial (RAG). Pega a un Route Handler
 * (`/api/elders/[elderId]/consultas`) que proxyea al backend Python
 * (RAG sobre los reportes persistidos en Supabase).
 *
 * La carga manual de audio se jubiló: el insumo ahora es el audio que graba el
 * propio adulto mayor desde /elder (genera reportes, tendencias y alertas).
 */
export default async function ConsultarPage({
  params,
}: {
  params: Promise<{ familyId: string; elderId: string }>;
}) {
  const { elderId } = await params;

  return (
    <div className="flex flex-col gap-6">
      <QaChat elderId={elderId} />
    </div>
  );
}
