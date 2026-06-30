"""Grafo de orquestación (LangGraph) — loop agentico A+C.

Pipeline de audio:
  transcription
    → specialists  (health_agent + wellbeing_agent en secuencia, Opción C)
    → synthesizer  (consolida + guard de substring)
    → faithfulness_evaluator  (evaluación semántica, Opción A)
    → [si score < 0.8 y reintentos < MAX_REINTENTOS] → synthesizer (con feedback)
    → alert → persist → END

Pipeline de consulta:
  qa → END

Nota sobre el ciclo LangGraph: 'synthesizer' tiene dos aristas entrantes
(specialists y faithfulness_evaluator). En el modelo Pregel per-superstep de
LangGraph, cada superstep solo ejecuta los nodos activos de ese paso; en la
primera ejecución activa 'specialists', en el retry activa
'faithfulness_evaluator'. No hay fan-in ambiguo.
"""
from __future__ import annotations
from langgraph.graph import StateGraph, START, END

from src.orchestrator.state import GraphState
from src.agents import transcription, alert, memory, caregiver_qa
from src.agents import health_agent, wellbeing_agent, synthesizer, faithfulness_evaluator
from src.agents.faithfulness_evaluator import UMBRAL_FIDELIDAD

# 1 ejecución inicial + hasta MAX_REINTENTOS correcciones del synthesizer
MAX_REINTENTOS = 2


def _run_specialists(state: GraphState) -> GraphState:
    """Fase de extracción especializada (Opción C): salud y bienestar."""
    state = health_agent.run(state)
    state = wellbeing_agent.run(state)
    return state


def _route(state: GraphState) -> str:
    return "transcription" if state.get("tipo_evento") == "audio" else "qa"


def _route_after_eval(state: GraphState) -> str:
    reporte = state.get("reporte")
    if not reporte or not reporte.faithfulness_semantica:
        return "alert"
    score = reporte.faithfulness_semantica.score
    iteracion = state.get("iteracion_reporte") or 0
    if score is not None and score < UMBRAL_FIDELIDAD and iteracion <= MAX_REINTENTOS:
        return "synthesizer"
    return "alert"


def build_graph():
    g = StateGraph(GraphState)

    g.add_node("transcription", transcription.run)
    g.add_node("specialists", _run_specialists)
    g.add_node("synthesizer", synthesizer.run)
    g.add_node("faithfulness_evaluator", faithfulness_evaluator.run)
    g.add_node("alert", alert.run)
    g.add_node("persist", memory.run)
    g.add_node("qa", caregiver_qa.run)

    g.add_conditional_edges(START, _route,
                            {"transcription": "transcription", "qa": "qa"})

    g.add_edge("transcription", "specialists")
    g.add_edge("specialists", "synthesizer")

    # Loop agentico de faithfulness (Opción A)
    g.add_edge("synthesizer", "faithfulness_evaluator")
    g.add_conditional_edges(
        "faithfulness_evaluator",
        _route_after_eval,
        {"synthesizer": "synthesizer", "alert": "alert"},
    )

    g.add_edge("alert", "persist")
    g.add_edge("persist", END)
    g.add_edge("qa", END)

    return g.compile()


GRAPH = build_graph()
