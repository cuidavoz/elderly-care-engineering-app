"""Agente especialista en datos de salud (síntomas, medicación, dolor).

Parte del loop agentico (Opción C): corre junto a wellbeing_agent dentro
del nodo 'specialists'. Su output se consolida en el synthesizer.
"""
from __future__ import annotations
import json

from src.orchestrator.state import GraphState
from src.pipeline.llm import LLMClient
from src.pipeline.parsing import extraer_json

SYSTEM = (
    "Sos un asistente médico especializado en salud de adultos mayores. "
    "A partir de la transcripción de un mensaje de voz, extraés EXCLUSIVAMENTE "
    "datos de SALUD: síntomas físicos, medicación y dolor.\n\n"
    "REGLAS CRÍTICAS:\n"
    "1. Usá SOLO información explícita en la transcripción. No infieras ni asumas.\n"
    "2. Lo que no se menciona: lista vacía [] o null según el campo.\n"
    "3. Por CADA afirmación incluí un claim con 'fuente_textual' que sea un "
    "substring LITERAL y EXACTO de la transcripción.\n\n"
    "ESQUEMA JSON:\n"
    '{"salud": {"sintomas": ["..."], "medicacion_tomada": true|false|null, '
    '"dolor": "..."|null}, '
    '"claims": [{"afirmacion": "...", "campo": "salud.dolor", "fuente_textual": "..."}]}\n'
    "Respondé EXCLUSIVAMENTE con el objeto JSON."
)


def _vacio() -> dict:
    return {"salud": {"sintomas": [], "medicacion_tomada": None, "dolor": None}, "claims": []}


def run(state: GraphState) -> GraphState:
    if state.get("error"):
        state["reporte_salud"] = _vacio()
        return state
    transcripcion = state.get("transcripcion") or ""
    try:
        raw = LLMClient().complete(SYSTEM, transcripcion, json_mode=True)
        data = json.loads(extraer_json(raw))
        if not isinstance(data, dict):
            raise ValueError
        state["reporte_salud"] = data
    except Exception:
        state["reporte_salud"] = _vacio()
    return state
