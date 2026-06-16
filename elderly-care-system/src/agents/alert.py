"""Nodo de alertas: reporte -> alertas.  Responsable: Integrante D.

Dos capas: reglas explícitas (red de seguridad, no dependen del LLM) + un
pase opcional del LLM liviano para matices. La severidad alta nunca depende
solo del LLM.
"""
from __future__ import annotations
from src.orchestrator.state import GraphState
from src.schemas import Alerta, Severidad

PALABRAS_RIESGO = {"caí", "caída", "pecho", "no puedo respirar", "mareo", "sangre"}


def run(state: GraphState) -> GraphState:
    rep = state.get("reporte")
    if rep is None:
        return state
    texto = (state.get("transcripcion") or "").lower()
    for kw in PALABRAS_RIESGO:
        if kw in texto:
            rep.alertas.append(Alerta(tipo="señal_de_riesgo",
                                      severidad=Severidad.alta,
                                      evidencia=kw))
    # TODO(D): pase del LLM liviano para alertas de severidad baja/media.
    return state
