import type { Metadata } from "next";

import { getElder } from "@/lib/data/queries";
import { DigestPanel } from "./_components/digest-panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ elderId: string }>;
}): Promise<Metadata> {
  const { elderId } = await params;
  const elder = await getElder(elderId);
  return { title: elder ? `Resumen · ${elder.nombre}` : "Resumen" };
}

/**
 * "Resumen": genera un resumen semanal (digest) del adulto mayor a partir de
 * sus reportes. Pega a un Route Handler que proxya al backend Python `/digest`.
 */
export default async function ResumenPage({
  params,
}: {
  params: Promise<{ familyId: string; elderId: string }>;
}) {
  const { elderId } = await params;

  return <DigestPanel elderId={elderId} />;
}
