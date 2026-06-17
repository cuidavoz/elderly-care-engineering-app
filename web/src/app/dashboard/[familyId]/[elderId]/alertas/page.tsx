import type { Metadata } from "next";
import { Bell } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getAlerts, getElder } from "@/lib/data/queries";
import { EmptyState } from "../../../_components/empty-state";
import {
  EstadoChip,
  SeverityChip,
  severityCardBorder,
} from "../../../_components/severity";
import { AlertActions } from "./_components/alert-actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ elderId: string }>;
}): Promise<Metadata> {
  const { elderId } = await params;
  const elder = await getElder(elderId);
  return { title: elder ? `Alertas · ${elder.nombre}` : "Alertas" };
}

export default async function AlertasPage({
  params,
}: {
  params: Promise<{ familyId: string; elderId: string }>;
}) {
  const { familyId, elderId } = await params;
  const alerts = await getAlerts(elderId);

  if (alerts.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="Sin alertas"
        description="No hay alertas para esta persona. Las alertas se generan automáticamente a partir de los reportes."
      />
    );
  }

  const pendientes = alerts.filter((a) => a.estado === "pendiente").length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        {pendientes > 0 ? (
          <>
            <span className="text-foreground font-medium">{pendientes}</span>{" "}
            {pendientes === 1 ? "alerta pendiente" : "alertas pendientes"} de{" "}
            {alerts.length} en total.
          </>
        ) : (
          <>Todas las alertas fueron atendidas. {alerts.length} en total.</>
        )}
      </p>

      <div className="flex flex-col gap-3">
        {alerts.map((alert) => (
          <Card
            key={alert.id}
            className={cn(
              "border-l-4",
              severityCardBorder(alert.severidad),
              alert.estado === "resuelta" && "opacity-70"
            )}
          >
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium capitalize">{alert.tipo}</span>
                <div className="flex items-center gap-2">
                  <EstadoChip estado={alert.estado} />
                  <SeverityChip severidad={alert.severidad} />
                  <span className="text-muted-foreground text-xs">
                    {new Date(alert.created_at).toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {alert.evidencia && (
                <p className="text-muted-foreground text-sm">
                  {alert.evidencia}
                </p>
              )}
              <AlertActions
                alertId={alert.id}
                familyId={familyId}
                elderId={elderId}
                estado={alert.estado}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
