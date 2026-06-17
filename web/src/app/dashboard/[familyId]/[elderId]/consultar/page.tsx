import type { Metadata } from "next";

import { QaChat } from "./_components/qa-chat";
import { UploadAudio } from "./_components/upload-audio";

export const metadata: Metadata = {
  title: "Consultar",
};

/**
 * "Consultar": Q&A sobre el historial (RAG) + Subir audio (genera reporte).
 * Ambos flujos pegan a Route Handlers (`/api/elders/[elderId]/...`) que
 * proxyean al backend Python (transcripción + LLM + RAG, persiste en Supabase).
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
      <UploadAudio elderId={elderId} />
    </div>
  );
}
