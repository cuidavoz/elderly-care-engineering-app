"""Wrapper de ASR (faster-whisper).

El tamaño del modelo (settings.whisper_model) es además la variable
independiente del research project. Mantener esta interfaz estable.

Proveedores (settings.asr_provider):
  - "faster_whisper": transcripción real con faster-whisper sobre CPU/GPU.
  - "mock":           texto canónico determinista, sin descargar el modelo.
                      Lo usa la suite de tests (conftest fuerza ASR_PROVIDER=mock).

La `confianza` (0..1) se deriva del `avg_logprob` de los segmentos y se usa
aguas abajo para degradar con gracia: si es baja, no inventamos un reporte.
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
    return _transcribir_whisper(audio_path)


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
