"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; text: string };

/** Respuesta de `POST {API_BASE}/consultas` (vía el route handler proxy). */
type ConsultaResponse = { respuesta?: string; error?: string };

/**
 * Q&A sobre el historial del adulto mayor (RAG en el backend). Chat simple con
 * historial en estado local: cada pregunta va al route handler de consultas y
 * mostramos la respuesta del backend. El historial no se persiste (es de la
 * sesión actual).
 */
export function QaChat({ elderId }: { elderId: string }) {
  const [pregunta, setPregunta] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = pregunta.trim();
    if (!q || pending) return;

    setTurns((prev) => [...prev, { role: "user", text: q }]);
    setPregunta("");

    startTransition(async () => {
      let data: ConsultaResponse;
      try {
        const res = await fetch(`/api/elders/${elderId}/consultas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pregunta: q }),
        });
        data = (await res.json().catch(() => ({}))) as ConsultaResponse;

        if (!res.ok) {
          toast.error(data.error ?? "No se pudo responder la consulta.");
          return;
        }
      } catch {
        toast.error("No se pudo conectar con el servidor. Probá de nuevo.");
        return;
      }

      const respuesta = data.respuesta?.trim();
      if (!respuesta) {
        toast.error(data.error ?? "El servicio no devolvió una respuesta.");
        return;
      }
      setTurns((prev) => [...prev, { role: "assistant", text: respuesta }]);
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageCircle className="text-primary size-5" />
          <CardTitle>Consultar el historial</CardTitle>
        </div>
        <CardDescription>
          Preguntá en lenguaje natural sobre el historial del adulto mayor (p.
          ej. &ldquo;¿cómo durmió esta semana?&rdquo;). La respuesta se arma a
          partir de sus reportes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {turns.length > 0 ? (
          <div className="flex flex-col gap-3">
            {turns.map((turn, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  turn.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    turn.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {turn.text}
                </div>
              </div>
            ))}
            {pending ? (
              <div className="flex justify-start">
                <div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Buscando en el historial...
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            placeholder="Escribí tu pregunta..."
            aria-label="Pregunta"
            disabled={pending}
          />
          <Button type="submit" disabled={pending || !pregunta.trim()}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />}
            Preguntar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
