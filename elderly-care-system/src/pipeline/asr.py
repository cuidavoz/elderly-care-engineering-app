"""Wrapper de ASR (faster-whisper).  Responsable: Integrante B.

El tamaño del modelo (settings.whisper_model) es además la variable
independiente del research project. Mantener esta interfaz estable.
"""
from __future__ import annotations
from dataclasses import dataclass
from src.config import settings


@dataclass
class Transcripcion:
    texto: str
    confianza: float  # 0..1 — usar para degradar con gracia si es baja


def transcribir(audio_path: str) -> Transcripcion:
    """Transcribe un archivo de audio.

    TODO(B): implementar con faster-whisper:
        from faster_whisper import WhisperModel
        model = WhisperModel(settings.whisper_model,
                             device=settings.whisper_device,
                             compute_type=settings.whisper_compute_type)
        segments, info = model.transcribe(audio_path)
        texto = " ".join(s.text for s in segments)
        confianza = derivar_de(avg_logprob de los segmentos)
    """
    # --- STUB ---
    return Transcripcion(
        texto="Hoy me desperté varias veces, me duele un poco la rodilla. "
              "Tomé la pastilla de la presión. Almorcé con mi hija.",
        confianza=0.9,
    )
