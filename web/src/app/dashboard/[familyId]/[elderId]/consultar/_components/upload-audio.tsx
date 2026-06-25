"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mic, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SeverityChip } from "../../../../_components/severity";
import type { AlertSeverity, ReportePayload } from "@/lib/types";

/** Respuesta de `POST {API_BASE}/reportes` (vía el route handler proxy). */
type ReporteResponse = {
  reporte?: ReportePayload | null;
  confianza?: number | null;
  error?: string | null;
};

const ACCEPT = ".ogg,.mp3,.wav,.m4a,.webm,audio/*";
const ACCEPT_LABEL = ".ogg, .mp3, .wav o .m4a";
/** Extensiones permitidas (fallback cuando el navegador no informa `file.type`). */
const ALLOWED_EXTENSIONS = [".ogg", ".mp3", ".m4a", ".wav", ".webm"];
/** Tamaño máximo del audio: 25 MB. */
const MAX_SIZE_BYTES = 25 * 1024 * 1024;

/** Valida que el archivo sea audio por MIME type o, si falta, por extensión. */
function isAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  const name = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Subir audio del adulto mayor → genera un reporte. Envía el archivo al route
 * handler (proxy server-side hacia el backend Python), que persiste el reporte
 * + alertas en Supabase. Al éxito refrescamos la ruta para que la pestaña de
 * Reportes muestre el nuevo reporte.
 */
export function UploadAudio({ elderId }: { elderId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ReporteResponse | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit() {
    if (!file) {
      toast.error(`Elegí un archivo de audio (${ACCEPT_LABEL}).`);
      return;
    }

    if (!isAudioFile(file)) {
      toast.error(`El archivo no parece ser audio. Usá ${ACCEPT_LABEL}.`);
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      toast.error("El audio es demasiado grande (máximo 25 MB).");
      return;
    }

    startTransition(async () => {
      setResult(null);
      const formData = new FormData();
      formData.set("audio", file);

      let data: ReporteResponse;
      try {
        const res = await fetch(`/api/elders/${elderId}/reportes`, {
          method: "POST",
          body: formData,
        });
        data = (await res.json().catch(() => ({}))) as ReporteResponse;

        // 504 = el proxy cortó por timeout, pero el backend (lento en el free
        // tier) sigue procesando y va a PERSISTIR el reporte igual. No es un
        // error real, y NO hay que reintentar (generaría un duplicado): avisamos
        // que se está generando y refrescamos para que aparezca en Reportes.
        if (res.status === 504) {
          toast.info(
            "El reporte está tardando más de lo normal, pero se está generando. " +
              "Va a aparecer en Reportes y Tendencias en unos segundos — no lo subas de nuevo.",
            { duration: 9000 }
          );
          setFile(null);
          if (inputRef.current) inputRef.current.value = "";
          // Le damos tiempo al backend a terminar y persistir, y refrescamos.
          setTimeout(() => router.refresh(), 12_000);
          return;
        }

        if (!res.ok) {
          toast.error(data.error ?? "No se pudo procesar el audio.");
          setResult(data);
          return;
        }
      } catch {
        toast.error("No se pudo conectar con el servidor. Probá de nuevo.");
        return;
      }

      setResult(data);

      if (data.error) {
        toast.error(data.error);
        return;
      }

      toast.success("Reporte generado a partir del audio.");
      // El backend ya persistió el reporte en Supabase: refrescamos para que
      // la pestaña Reportes lo liste.
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  const alertas = result?.reporte?.alertas ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mic className="text-primary size-5" />
          <CardTitle>Subir audio</CardTitle>
        </div>
        <CardDescription>
          Subí un audio del adulto mayor para generar un reporte. El
          procesamiento (audio → reporte) lo hace el sistema de CuidaVoz. La
          primera vez del día puede tardar hasta ~1 minuto mientras el servidor
          se enciende; después es cuestión de segundos.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="border-border flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <Upload className="text-muted-foreground size-6" />
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            aria-label="Archivo de audio"
            disabled={pending}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
          <p className="text-muted-foreground text-sm">
            {file ? (
              <span className="text-foreground font-medium">{file.name}</span>
            ) : (
              `Seleccioná un archivo de audio (${ACCEPT_LABEL})`
            )}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
            >
              <Upload />
              {file ? "Cambiar archivo" : "Elegir archivo"}
            </Button>
            <Button type="button" disabled={pending || !file} onClick={onSubmit}>
              {pending ? <Loader2 className="animate-spin" /> : <Mic />}
              {pending ? "Generando reporte..." : "Generar reporte"}
            </Button>
          </div>
        </div>

        {result?.reporte && !result.error ? (
          <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Reporte generado</span>
              {typeof result.confianza === "number" ? (
                <span className="text-muted-foreground text-xs">
                  Confianza: {Math.round(result.confianza * 100)}%
                </span>
              ) : null}
              {result.reporte.incompleto ? (
                <span className="rounded-full bg-yellow-100 px-2 text-xs font-medium text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
                  Reporte incompleto
                </span>
              ) : null}
            </div>
            {result.reporte.resumen ? (
              <p className="text-muted-foreground">{result.reporte.resumen}</p>
            ) : null}
            {alertas.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">
                  Alertas detectadas ({alertas.length})
                </span>
                {alertas.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <SeverityChip
                      severidad={a.severidad as AlertSeverity | undefined}
                    />
                    <span className="font-medium">{a.tipo}</span>
                    {a.evidencia ? (
                      <span className="text-muted-foreground">
                        — {a.evidencia}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {result?.error ? (
          <p className="text-destructive text-sm">{result.error}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
