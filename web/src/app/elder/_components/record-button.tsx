"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Mic, RotateCcw, Square } from "lucide-react";

/** Tope de grabación: el proxy corta a 58s y la función serverless a 60s, así
 * que limitamos el audio del adulto para no chocar con esos límites. */
const MAX_SECONDS = 50;

type Status = "idle" | "recording" | "sending" | "done" | "error";

/** Elige el primer mimeType de grabación soportado por el navegador.
 * Chrome/Android → webm/opus; Safari/iOS no soporta webm y cae a mp4. */
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

function extFor(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg")) return "mp3";
  return "webm";
}

function fmt(total: number): string {
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Botón de grabación para el adulto mayor. Captura audio con MediaRecorder y lo
 * envía al proxy `POST /api/elders/[elderId]/reportes`, que lo manda al backend
 * (transcripción + pipeline agéntico → reporte/alertas/tendencias para la familia).
 * El adulto solo ve una confirmación; el reporte es para los cuidadores.
 */
export function RecordButton({ elderId }: { elderId: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function releaseMic() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Limpieza al desmontar: cortar timer y liberar el micrófono.
  useEffect(() => {
    return () => {
      clearTimer();
      releaseMic();
    };
  }, []);

  async function startRecording() {
    setErrorMsg(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setErrorMsg("Tu dispositivo no permite grabar audio desde el navegador.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus("error");
      setErrorMsg(
        "Necesitamos permiso para usar el micrófono. Activalo e intentá de nuevo."
      );
      return;
    }

    streamRef.current = stream;
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = handleStop;
    recorder.start();

    setStatus("recording");
    setElapsed(0);
    elapsedRef.current = 0;
    timerRef.current = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= MAX_SECONDS) stopRecording();
    }, 1000);
  }

  function stopRecording() {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // dispara onstop → handleStop
    }
  }

  function handleStop() {
    const type = recorderRef.current?.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type });
    releaseMic();

    if (blob.size === 0) {
      setStatus("error");
      setErrorMsg("No se grabó nada. Tocá el micrófono e intentá de nuevo.");
      return;
    }
    void uploadAudio(blob, type);
  }

  async function uploadAudio(blob: Blob, type: string) {
    setStatus("sending");
    const file = new File([blob], `audio.${extFor(type)}`, { type });
    const formData = new FormData();
    formData.set("audio", file);

    try {
      const res = await fetch(`/api/elders/${elderId}/reportes`, {
        method: "POST",
        body: formData,
      });

      // 504 = el backend (lento en el free tier) sigue procesando y va a
      // persistir el reporte igual. Para el adulto es éxito: no debe reenviar.
      if (res.status === 504) {
        setStatus("done");
        return;
      }

      const data = (await res.json().catch(() => ({}))) as {
        error?: string | null;
      };

      if (!res.ok || data?.error) {
        setStatus("error");
        setErrorMsg("No te escuchamos bien. ¿Probás grabar de nuevo?");
        return;
      }

      setStatus("done");
    } catch {
      setStatus("error");
      setErrorMsg("No pudimos conectarnos. Revisá tu internet e intentá de nuevo.");
    }
  }

  function reset() {
    setStatus("idle");
    setElapsed(0);
    setErrorMsg(null);
  }

  // --- Render por estado ---------------------------------------------------

  if (status === "done") {
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-green-100 text-green-700 shadow-lg dark:bg-green-950 dark:text-green-300">
          <Check className="size-14" />
        </div>
        <p className="text-xl font-medium">¡Gracias! Recibimos tu mensaje.</p>
        <button
          type="button"
          onClick={reset}
          className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-lg underline-offset-4 hover:underline"
        >
          <RotateCcw className="size-5" />
          Grabar otro
        </button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-6">
        <button
          type="button"
          onClick={startRecording}
          aria-label="Intentar de nuevo"
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-32 w-32 items-center justify-center rounded-full shadow-lg transition-colors"
        >
          <Mic className="size-12" />
        </button>
        <p className="text-destructive max-w-xs text-lg">{errorMsg}</p>
      </div>
    );
  }

  if (status === "sending") {
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="bg-primary/80 text-primary-foreground flex h-32 w-32 items-center justify-center rounded-full shadow-lg">
          <Loader2 className="size-12 animate-spin" />
        </div>
        <p className="text-muted-foreground text-lg">Enviando tu mensaje…</p>
      </div>
    );
  }

  if (status === "recording") {
    return (
      <div className="flex flex-col items-center gap-6">
        <button
          type="button"
          onClick={stopRecording}
          aria-label="Terminar de grabar"
          className="flex h-32 w-32 animate-pulse items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-colors hover:bg-red-700"
        >
          <Square className="size-12 fill-current" />
        </button>
        <div className="flex flex-col items-center gap-1">
          <p className="text-2xl font-semibold tabular-nums">
            {fmt(elapsed)}{" "}
            <span className="text-muted-foreground text-lg font-normal">
              / {fmt(MAX_SECONDS)}
            </span>
          </p>
          <p className="text-muted-foreground text-lg">Tocá para terminar</p>
        </div>
      </div>
    );
  }

  // idle
  return (
    <div className="flex flex-col items-center gap-6">
      <button
        type="button"
        onClick={startRecording}
        aria-label="Grabar"
        className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-32 w-32 items-center justify-center rounded-full shadow-lg transition-colors"
      >
        <Mic className="size-12" />
      </button>
      <p className="text-muted-foreground text-lg">Tocá para grabar</p>
    </div>
  );
}
