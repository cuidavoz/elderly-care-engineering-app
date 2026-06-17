import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { getElder, getReports } from "@/lib/data/queries";
import { ReportCard } from "../../_components/report-card";
import { EmptyState } from "../../_components/empty-state";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ elderId: string }>;
}): Promise<Metadata> {
  const { elderId } = await params;
  const elder = await getElder(elderId);
  return { title: elder ? `Reportes · ${elder.nombre}` : "Reportes" };
}

export default async function ReportesPage({
  params,
}: {
  params: Promise<{ familyId: string; elderId: string }>;
}) {
  const { elderId } = await params;
  const reports = await getReports(elderId);

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Todavía no hay reportes"
        description="Cuando lleguen los audios y se procesen, vas a ver acá el resumen diario de cada jornada."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} />
      ))}
    </div>
  );
}
