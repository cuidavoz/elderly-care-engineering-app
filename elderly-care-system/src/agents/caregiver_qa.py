"""Q&A del familiar vía RAG sobre el historial.  Responsable: Integrante D."""
from __future__ import annotations
from src.orchestrator.state import GraphState
from src.pipeline.llm import LLMClient
from src.config import settings

SYSTEM = (
    "Respondés preguntas de un familiar sobre la evolución del adulto mayor "
    "usando SOLO los reportes recuperados como contexto. Si la información no "
    "está en los reportes, decílo explícitamente. No inventes."
)


def run(state: GraphState) -> GraphState:
    # TODO(D): recuperar reportes relevantes de Chroma para state["pregunta"].
    contexto = "[reportes recuperados aquí]"
    llm = LLMClient(model=settings.llm_model_light)  # modelo chico = más barato
    state["respuesta"] = llm.complete(
        SYSTEM, f"Contexto:\n{contexto}\n\nPregunta: {state.get('pregunta')}"
    )
    return state
