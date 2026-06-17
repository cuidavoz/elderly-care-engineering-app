import { notFound } from "next/navigation";

import { getFamily } from "@/lib/data/queries";

/**
 * Layout de una familia (tenant). Valida que la familia exista y sea accesible
 * por RLS; si no, 404. Los segmentos hijos (`page.tsx`, `[elderId]/...`) heredan
 * este contexto validado.
 */
export default async function FamilyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const family = await getFamily(familyId);

  if (!family) {
    notFound();
  }

  return <>{children}</>;
}
