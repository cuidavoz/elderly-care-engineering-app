"""Nodo de transcripción: audio -> texto.  Responsable: Integrante B."""
from __future__ import annotations
from src.orchestrator.state import GraphState
from src.pipeline.asr import transcribir

CONFIANZA_MINIMA = 0.5


def run(state: GraphState) -> GraphState:
    t = transcribir(state["audio_path"])
    state["transcripcion"] = t.texto
    state["confianza"] = t.confianza
    # Robustez: si la transcripción es poco confiable, no inventamos nada.
    if t.confianza < CONFIANZA_MINIMA:
        state["error"] = "transcripcion_poco_confiable"
    return state
