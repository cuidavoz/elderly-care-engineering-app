"use client";

import { useState, useTransition } from "react";
import {
  CalendarRange,
  HeartPulse,
  Lightbulb,
  Loader2,
  Moon,
  Pill,
  Smile,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SeverityChip } from "../../../../_components/severity";
import type { AlertSeverity, Digest } from "@/lib/types";

type DigestResponse = Partial<Digest> & { error?: string };

const OPCIONES_DIAS = [7, 14, 30] as const;

function formatFecha(fecha?: string | null): string {
  if (!fecha) return "";
  // Aceptamos date (YYYY-MM-DD) o ISO; parseamos los componentes de fecha.
  const base = fecha.slice(0, 10);
  const [y, m, d] = base.split("-").map(Number);
  if (!y || !m || !d) return fecha;
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Genera y muestra el resumen semanal (digest) del adulto mayor.
 * Llama al route handler proxy (`/api/elders/[elderId]/digest`) que reenvía al
 * backend Python. Estados de carga + errores con toasts.
 */
export function DigestPanel({ elderId }: { elderId: string }) {
  const [dias, setDias] = useState<number>(7);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [pending, startTransition] = useTransition();

  function generar() {
    startTransition(async () => {
      let data: DigestResponse;
      try {
        const res = await fetch(`/api/elders/${elderId}/digest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dias }),
        });
        data = (await res.json().catch(() => ({}))) as DigestResponse;

        if (!res.ok) {
          toast.error(data.error ?? "No se pudo generar el resumen.");
          return;
        }
      } catch {
        toast.error("No se pudo conectar con el servidor. Probá de nuevo.");
        return;
      }

      if (data.error) {
        toast.error(data.error);
        return;
      }
      if (!data.resumen) {
        toast.error("El servicio no devolvió un resumen.");
        return;
      }

      setDigest({
        elder_id: data.elder_id ?? elderId,
        desde: data.desde ?? "",
        hasta: data.hasta ?? "",
        n_reportes: data.n_reportes ?? 0,
        resumen: data.resumen,
        tendencias: data.tendencias ?? {},
        alertas_destacadas: data.alertas_destacadas ?? [],
        recomendaciones: data.recomendaciones ?? [],
      });
      toast.success("Resumen generado.");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarRange className="text-primary size-5" />
            <CardTitle>Resumen del período</CardTitle>
          </div>
          <CardDescription>
            Generá un resumen del estado del adulto mayor a partir de sus
            reportes recientes: tendencias por dimensión, recomendaciones y
            alertas destacadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Período
            </span>
            <div className="flex w-fit gap-1 rounded-lg border p-1">
              {OPCIONES_DIAS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={pending}
                  onClick={() => setDias(opt)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
                    dias === opt
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt} días
                </button>
              ))}
            </div>
          </div>
          <Button
            type="button"
            disabled={pending}
            onClick={generar}
            className="w-fit"
          >
            {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {pending ? "Generando resumen..." : "Generar resumen de la semana"}
          </Button>
        </CardContent>
      </Card>

      {digest && <DigestResult digest={digest} />}
    </div>
  );
}

function DigestResult({ digest }: { digest: Digest }) {
  const tendencias = [
    { key: "sueno", label: "Sueño", icon: Moon, valor: digest.tendencias.sueno },
    {
      key: "animo",
      label: "Ánimo",
      icon: Smile,
      valor: digest.tendencias.animo,
    },
    {
      key: "salud",
      label: "Salud",
      icon: HeartPulse,
      valor: digest.tendencias.salud,
    },
    {
      key: "medicacion",
      label: "Medicación",
      icon: Pill,
      valor: digest.tendencias.medicacion,
    },
  ].filter((t) => t.valor);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Resumen</CardTitle>
          {(digest.desde || digest.hasta) && (
            <span className="text-muted-foreground text-xs">
              {formatFecha(digest.desde)}
              {digest.desde && digest.hasta ? " – " : ""}
              {formatFecha(digest.hasta)} · {digest.n_reportes}{" "}
              {digest.n_reportes === 1 ? "reporte" : "reportes"}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {digest.resumen}
        </p>

        {tendencias.length > 0 && (
          <section className="flex flex-col gap-3">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Tendencias
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {tendencias.map(({ key, label, icon: Icon, valor }) => (
                <div
                  key={key}
                  className="bg-muted/40 flex gap-3 rounded-lg border p-3"
                >
                  <Icon className="text-primary mt-0.5 size-4 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-muted-foreground text-sm">{valor}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {digest.recomendaciones.length > 0 && (
          <section className="flex flex-col gap-3">
            <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
              <Lightbulb className="size-3.5" />
              Recomendaciones
            </h3>
            <ul className="flex flex-col gap-2">
              {digest.recomendaciones.map((rec, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-primary mt-1.5 size-1.5 shrink-0 rounded-full bg-current" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {digest.alertas_destacadas.length > 0 && (
          <section className="flex flex-col gap-3">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Alertas destacadas
            </h3>
            <div className="flex flex-col gap-2">
              {digest.alertas_destacadas.map((a, i) => (
                <div
                  key={i}
                  className="bg-muted/40 flex items-start gap-2 rounded-md px-3 py-2 text-sm"
                >
                  <SeverityChip
                    severidad={a.severidad as AlertSeverity | undefined}
                  />
                  <div className="space-y-0.5">
                    <p className="font-medium capitalize">
                      {a.tipo}
                      {a.fecha ? (
                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                          {formatFecha(a.fecha)}
                        </span>
                      ) : null}
                    </p>
                    {a.evidencia && (
                      <p className="text-muted-foreground">{a.evidencia}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
