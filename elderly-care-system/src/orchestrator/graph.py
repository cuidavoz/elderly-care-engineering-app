"""Grafo de orquestación (LangGraph).  Responsable: Integrante A.

Patrón supervisor: el router enruta según el tipo de evento al subgrafo de
reporte (audio nuevo) o al de Q&A (consulta del familiar).
"""
from __future__ import annotations
from langgraph.graph import StateGraph, START, END

from src.orchestrator.state import GraphState
from src.agents import transcription, report, alert, memory, caregiver_qa


def _route(state: GraphState) -> str:
    return "transcription" if state.get("tipo_evento") == "audio" else "qa"


def build_graph():
    g = StateGraph(GraphState)

    # nodos
    g.add_node("transcription", transcription.run)
    g.add_node("report", report.run)
    g.add_node("alert", alert.run)
    g.add_node("persist", memory.run)
    g.add_node("qa", caregiver_qa.run)

    # routing inicial
    g.add_conditional_edges(START, _route,
                            {"transcription": "transcription", "qa": "qa"})

    # subgrafo de reporte (secuencial)
    g.add_edge("transcription", "report")
    g.add_edge("report", "alert")
    g.add_edge("alert", "persist")
    g.add_edge("persist", END)

    # subgrafo de Q&A
    g.add_edge("qa", END)

    return g.compile()


GRAPH = build_graph()
