import {
  Activity,
  AlertTriangle,
  CalendarDays,
  HeartPulse,
  Moon,
  Smile,
} from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PayloadAlerta, Report } from "@/lib/types";
import { SeverityChip, severityCardBorder } from "./severity";

function formatFecha(fecha: string) {
  // `fecha` es un date (YYYY-MM-DD). Evitamos shift de zona horaria parseando
  // los componentes a mano.
  const [y, m, d] = fecha.split("-").map(Number);
  if (!y || !m || !d) return fecha;
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof HeartPulse;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="space-y-0.5">
        <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
          {label}
        </p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

/** Una tarjeta del timeline: un reporte diario con su desglose. */
export function ReportCard({ report }: { report: Report }) {
  const p = report.payload ?? {};
  const resumen = report.resumen ?? p.resumen ?? null;
  const confianza =
    typeof report.confianza === "number"
      ? Math.round(report.confianza * 100)
      : null;

  const salud = p.salud ?? null;
  const sueno = p.sueno ?? null;
  const animo = p.animo ?? null;
  const actividades = p.actividades ?? [];
  const alertas: PayloadAlerta[] = p.alertas ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-primary size-4" />
            <span className="font-medium capitalize">
              {formatFecha(report.fecha)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {confianza !== null && (
              <Badge variant="secondary">Confianza {confianza}%</Badge>
            )}
            {report.incompleto && (
              <Badge variant="outline">Incompleto</Badge>
            )}
          </div>
        </div>
        {resumen && <p className="text-muted-foreground text-sm">{resumen}</p>}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {salud && (
            <Field icon={HeartPulse} label="Salud">
              <ul className="space-y-0.5">
                {salud.sintomas && salud.sintomas.length > 0 ? (
                  <li>Síntomas: {salud.sintomas.join(", ")}</li>
                ) : (
                  <li className="text-muted-foreground">Sin síntomas referidos</li>
                )}
                {salud.medicacion_tomada != null && (
                  <li>
                    Medicación:{" "}
                    {salud.medicacion_tomada ? "tomada" : "no tomada"}
                  </li>
                )}
                {salud.dolor && <li>Dolor: {salud.dolor}</li>}
              </ul>
            </Field>
          )}

          {sueno && (sueno.calidad || sueno.notas) && (
            <Field icon={Moon} label="Sueño">
              {sueno.calidad && <p className="capitalize">{sueno.calidad}</p>}
              {sueno.notas && (
                <p className="text-muted-foreground">{sueno.notas}</p>
              )}
            </Field>
          )}

          {animo && (animo.estado || animo.notas) && (
            <Field icon={Smile} label="Ánimo">
              {animo.estado && <p className="capitalize">{animo.estado}</p>}
              {animo.notas && (
                <p className="text-muted-foreground">{animo.notas}</p>
              )}
            </Field>
          )}

          {actividades.length > 0 && (
            <Field icon={Activity} label="Actividades">
              <ul className="list-inside list-disc">
                {actividades.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </Field>
          )}
        </div>

        {alertas.length > 0 && (
          <div className="space-y-2">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
              <AlertTriangle className="size-3.5" />
              Alertas del reporte
            </p>
            <div className="space-y-1.5">
              {alertas.map((alerta, i) => (
                <div
                  key={i}
                  className={cn(
                    "bg-muted/40 flex items-start gap-2 rounded-md border-l-2 px-3 py-2 text-sm",
                    severityCardBorder(alerta.severidad)
                  )}
                >
                  <SeverityChip severidad={alerta.severidad} />
                  <div className="space-y-0.5">
                    {alerta.tipo && (
                      <p className="font-medium capitalize">{alerta.tipo}</p>
                    )}
                    {alerta.evidencia && (
                      <p className="text-muted-foreground">
                        {alerta.evidencia}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
