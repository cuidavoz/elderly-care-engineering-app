import type { Metadata } from "next";
import { Download, FileText, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

  // Promedio de fidelidad: proporción de afirmaciones del modelo respaldadas por
  // la transcripción, a través de los reportes que la tengan calculada. Los
  // reportes viejos (sin `faithfulness`) o sin claims (score null) se ignoran.
  const scoresFidelidad = reports
    .map((r) => r.payload?.faithfulness?.score)
    .filter((s): s is number => typeof s === "number");
  const fidelidadPromedio =
    scoresFidelidad.length > 0
      ? Math.round(
          (scoresFidelidad.reduce((acc, s) => acc + s, 0) /
            scoresFidelidad.length) *
            100
        )
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Button asChild variant="outline" size="sm">
          <a href={`/api/elders/${elderId}/pdf`} download>
            <Download />
            Descargar PDF
          </a>
        </Button>
      </div>

      {fidelidadPromedio !== null && (
        <Card size="sm">
          <CardContent className="flex items-center gap-3">
            <ShieldCheck className="text-primary size-5 shrink-0" />
            <div className="space-y-0.5">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Fidelidad promedio
              </p>
              <p className="text-sm">
                <span className="text-base font-semibold">
                  {fidelidadPromedio}%
                </span>{" "}
                <span className="text-muted-foreground">
                  de las afirmaciones generadas estuvieron respaldadas por las
                  transcripciones ({scoresFidelidad.length}{" "}
                  {scoresFidelidad.length === 1 ? "reporte" : "reportes"})
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {reports.map((report) => (
        <ReportCard key={report.id} report={report} />
      ))}
    </div>
  );
}
