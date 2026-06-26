"""Wrapper de ASR.

El tamaño del modelo (settings.whisper_model) es además la variable
independiente del research project. Mantener esta interfaz estable.

Proveedores (settings.asr_provider):
  - "groq":           transcripción via API de Groq (whisper-large-v3-turbo).
                      ~1-3s por audio, calidad alta, gratis hasta 2000 req/día.
                      Requiere GROQ_API_KEY. Recomendado para producción.
  - "faster_whisper": transcripción local con faster-whisper sobre CPU.
                      Lento en free tier (~15-30s). Útil para desarrollo sin API.
  - "mock":           texto canónico determinista, sin descargar el modelo.
                      Lo usa la suite de tests (conftest fuerza ASR_PROVIDER=mock).

La `confianza` (0..1) se deriva de los scores del modelo y se usa aguas abajo
para degradar con gracia: si es baja, no inventamos un reporte.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from src.config import settings

# Texto del fixture tests/fixtures/sample_es.wav — útil para el modo mock.
_MOCK_TEXTO = (
    "Hoy me desperté varias veces durante la noche y no descansé bien. "
    "Me duele un poco la rodilla derecha. Tomé la pastilla de la presión. "
    "Almorcé con mi hija y estoy de buen ánimo."
)


@dataclass
class Transcripcion:
    texto: str
    confianza: float  # 0..1 — usar para degradar con gracia si es baja


def transcribir(audio_path: str) -> Transcripcion:
    """Transcribe un archivo de audio a texto + confianza."""
    if settings.asr_provider == "mock":
        return Transcripcion(texto=_MOCK_TEXTO, confianza=0.9)
    if settings.asr_provider == "groq":
        return _transcribir_groq(audio_path)
    return _transcribir_whisper(audio_path)


def _transcribir_groq(audio_path: str) -> Transcripcion:
    """Transcripción via API de Groq (whisper-large-v3-turbo).

    Manda el archivo de audio a Groq y recibe el texto transcripto en ~1-3s.
    Usa verbose_json para obtener los segmentos y calcular la confianza con
    el mismo método que faster-whisper (promedio ponderado de exp(avg_logprob)).
    Si la API falla, propaga la excepción para que el nodo report.py degrade
    con gracia (reporte incompleto) igual que con cualquier otro error de ASR.
    """
    from groq import Groq

    if not settings.groq_api_key:
        raise RuntimeError(
            "Falta GROQ_API_KEY. Configurá la key en .env o en Render, "
            "o usá ASR_PROVIDER=mock para desarrollo sin costo."
        )

    client = Groq(api_key=settings.groq_api_key)
    with open(audio_path, "rb") as f:
        respuesta = client.audio.transcriptions.create(
            file=(audio_path, f.read()),
            model="whisper-large-v3-turbo",
            language="es",
            response_format="verbose_json",
        )

    texto = (respuesta.text or "").strip()
    if not texto:
        return Transcripcion(texto="", confianza=0.0)

    # Confianza: mismo cálculo que faster-whisper (promedio ponderado por duración).
    segs = getattr(respuesta, "segments", None) or []
    if segs:
        total = sum(max((s.get("end", 0) - s.get("start", 0)), 1e-3) for s in segs)
        confianza = sum(
            math.exp(s.get("avg_logprob", -1.0)) * max((s.get("end", 0) - s.get("start", 0)), 1e-3)
            for s in segs
        ) / total
        confianza = max(0.0, min(1.0, confianza))
    else:
        # Sin segmentos: asumimos confianza alta (large-v3-turbo es muy preciso).
        confianza = 0.9

    return Transcripcion(texto=texto, confianza=confianza)


# Modelo cacheado entre llamadas (cargarlo es caro).
_modelo = None


def _get_modelo():
    global _modelo
    if _modelo is None:
        from faster_whisper import WhisperModel

        _modelo = WhisperModel(
            settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
    return _modelo


def _transcribir_whisper(audio_path: str) -> Transcripcion:
    modelo = _get_modelo()
    segmentos, _info = modelo.transcribe(audio_path, language="es")
    segs = list(segmentos)
    if not segs:
        # Audio vacío o inaudible: confianza nula => el pipeline pedirá reenvío.
        return Transcripcion(texto="", confianza=0.0)

    texto = " ".join(s.text.strip() for s in segs).strip()
    # avg_logprob es un log-prob (negativo); exp(...) lo lleva a ~probabilidad.
    # Promediamos ponderando por la duración de cada segmento.
    total = sum(max(s.end - s.start, 1e-3) for s in segs)
    confianza = sum(
        math.exp(s.avg_logprob) * max(s.end - s.start, 1e-3) for s in segs
    ) / total
    return Transcripcion(texto=texto, confianza=max(0.0, min(1.0, confianza)))
