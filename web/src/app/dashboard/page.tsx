import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getFamilies, getElders } from "@/lib/data/queries";
import { FamilyOnboarding } from "./_components/family-onboarding";

export const metadata: Metadata = {
  title: "Panel",
};

/**
 * Punto de entrada del panel. Resuelve el contexto activo:
 *  - sin familias → onboarding ("creá tu primera familia");
 *  - con familias → entra a la primera; si esa tiene adultos mayores, va
 *    directo al dashboard del primero; si no, a la gestión de la familia.
 *
 * La selección de familia/adulto vive en la URL (rutas anidadas
 * `/dashboard/[familyId]/[elderId]`), así el estado es enlazable y la RLS
 * aplica naturalmente sobre los segmentos.
 */
export default async function DashboardPage() {
  const families = await getFamilies();

  if (families.length === 0) {
    return <FamilyOnboarding />;
  }

  const first = families[0];
  const elders = await getElders(first.id);

  if (elders.length > 0) {
    redirect(`/dashboard/${first.id}/${elders[0].id}`);
  }

  redirect(`/dashboard/${first.id}`);
}
