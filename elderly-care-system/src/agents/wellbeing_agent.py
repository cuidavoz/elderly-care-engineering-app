"""Agente especialista en bienestar (sueño, ánimo, actividades).

Parte del loop agentico (Opción C): corre junto a health_agent dentro
del nodo 'specialists'. Su output se consolida en el synthesizer.
"""
from __future__ import annotations
import json

from src.orchestrator.state import GraphState
from src.pipeline.llm import LLMClient
from src.pipeline.parsing import extraer_json

SYSTEM = (
    "Sos un asistente especializado en bienestar de adultos mayores. "
    "A partir de la transcripción de un mensaje de voz, extraés EXCLUSIVAMENTE "
    "datos de BIENESTAR: calidad del sueño, estado de ánimo y actividades.\n\n"
    "REGLAS CRÍTICAS:\n"
    "1. Usá SOLO información explícita en la transcripción. No infieras ni asumas.\n"
    "2. Lo que no se menciona: 'desconocida' para sueño, null o [] para el resto.\n"
    "3. Por CADA afirmación incluí un claim con 'fuente_textual' LITERAL de la transcripción.\n\n"
    "ESQUEMA JSON:\n"
    '{"sueno": {"calidad": "buena"|"regular"|"mala"|"desconocida", "notas": "..."|null}, '
    '"animo": {"estado": "..."|null, "notas": "..."|null}, '
    '"actividades": ["..."], '
    '"claims": [{"afirmacion": "...", "campo": "sueno.calidad", "fuente_textual": "..."}]}\n'
    "Respondé EXCLUSIVAMENTE con el objeto JSON."
)


def _vacio() -> dict:
    return {
        "sueno": {"calidad": "desconocida", "notas": None},
        "animo": {"estado": None, "notas": None},
        "actividades": [],
        "claims": [],
    }


def run(state: GraphState) -> GraphState:
    if state.get("error"):
        state["reporte_bienestar"] = _vacio()
        return state
    transcripcion = state.get("transcripcion") or ""
    try:
        raw = LLMClient().complete(SYSTEM, transcripcion, json_mode=True)
        data = json.loads(extraer_json(raw))
        if not isinstance(data, dict):
            raise ValueError
        state["reporte_bienestar"] = data
    except Exception:
        state["reporte_bienestar"] = _vacio()
    return state
