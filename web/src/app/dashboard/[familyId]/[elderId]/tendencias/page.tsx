import type { Metadata } from "next";
import { HeartPulse, Moon, Smile, TrendingUp } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getElder, getReportsAsc } from "@/lib/data/queries";
import { EmptyState } from "../../../_components/empty-state";
import {
  AlertasChart,
  AnimoChart,
  MedicacionChart,
  SuenoChart,
} from "./_components/trend-charts";
import {
  alertasPorDiaSeries,
  animoFrecuencia,
  medicacionResumen,
  medicacionSeries,
  suenoSeries,
} from "./_components/trends-data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ elderId: string }>;
}): Promise<Metadata> {
  const { elderId } = await params;
  const elder = await getElder(elderId);
  return { title: elder ? `Tendencias · ${elder.nombre}` : "Tendencias" };
}

function ChartCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Moon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="text-primary size-5" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function TendenciasPage({
  params,
}: {
  params: Promise<{ elderId: string }>;
}) {
  const { elderId } = await params;
  const reports = await getReportsAsc(elderId);

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Todavía no hay datos para graficar"
        description="Cuando se procesen algunos reportes, vas a ver acá la evolución del sueño, la medicación, las alertas y el ánimo a lo largo del tiempo."
      />
    );
  }

  const sueno = suenoSeries(reports);
  const medicacion = medicacionSeries(reports);
  const medResumen = medicacionResumen(reports);
  const alertas = alertasPorDiaSeries(reports);
  const animo = animoFrecuencia(reports);
  const totalAlertas = alertas.reduce((acc, d) => acc + d.total, 0);

  const pocosDatos = reports.length < 3;

  return (
    <div className="flex flex-col gap-4">
      {pocosDatos && (
        <p className="text-muted-foreground text-sm">
          Hay pocos reportes ({reports.length}). Los gráficos se vuelven más
          útiles a medida que se acumulan más jornadas.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          icon={Moon}
          title="Sueño"
          description="Calidad del sueño en el tiempo (mala / regular / buena)."
        >
          <SuenoChart data={sueno} />
        </ChartCard>

        <ChartCard
          icon={HeartPulse}
          title="Adherencia a la medicación"
          description={`Por día: tomada / no tomada / sin dato. ${medResumen.tomada} tomada · ${medResumen.no} no tomada · ${medResumen.desconocida} sin dato.`}
        >
          <MedicacionChart data={medicacion} />
        </ChartCard>

        <ChartCard
          icon={TrendingUp}
          title="Frecuencia de alertas"
          description={
            totalAlertas > 0
              ? "Alertas por día, apiladas por severidad."
              : "No se registraron alertas en los reportes."
          }
        >
          {totalAlertas > 0 ? (
            <AlertasChart data={alertas} />
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Sin alertas en el período. 🎉
            </p>
          )}
        </ChartCard>

        <ChartCard
          icon={Smile}
          title="Ánimo"
          description="Estados de ánimo más frecuentes."
        >
          {animo.length > 0 ? (
            <AnimoChart data={animo} />
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Todavía no hay datos de ánimo registrados.
            </p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
