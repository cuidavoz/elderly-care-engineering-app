"""Estado que fluye por el grafo de agentes."""
from __future__ import annotations
from typing import Optional, TypedDict
from src.schemas import Reporte


class GraphState(TypedDict, total=False):
    # entrada
    tipo_evento: str            # "audio" | "consulta"
    audio_path: Optional[str]
    pregunta: Optional[str]     # para el evento "consulta"
    elder_id: str
    # intermedios / salida
    transcripcion: Optional[str]
    confianza: Optional[float]
    reporte: Optional[Reporte]
    respuesta: Optional[str]    # respuesta del Q&A
    notificar: Optional[bool]   # True si hay alerta alta -> notificar al familiar
    error: Optional[str]
    # loop agentico A+C
    reporte_salud: Optional[dict]         # output del health_agent
    reporte_bienestar: Optional[dict]     # output del wellbeing_agent
    iteracion_reporte: Optional[int]      # cuántas veces corrió el evaluador
    feedback_faithfulness: Optional[str]  # feedback del evaluador → synthesizer
