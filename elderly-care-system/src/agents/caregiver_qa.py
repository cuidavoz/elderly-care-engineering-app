"""Q&A del familiar vía RAG sobre el historial.  Responsable: Integrante D."""
from __future__ import annotations

import logging

from src.config import settings
from src.orchestrator.state import GraphState
from src.pipeline.llm import LLMClient
from src.storage import ReporteGuardado, get_vector_index

logger = logging.getLogger(__name__)

SYSTEM = (
    "Respondés preguntas de un familiar sobre la evolución del adulto mayor "
    "usando SOLO los reportes recuperados como contexto. Si la información no "
    "está en los reportes, decílo explícitamente. No inventes."
)

SIN_HISTORIAL = (
    "No tengo reportes en el historial de esta persona todavía, así que no "
    "puedo responder esa pregunta. Cuando se registren reportes, podré usarlos."
)


def _formatear_contexto(reportes: list[ReporteGuardado]) -> str:
    """Arma el bloque de contexto con los reportes recuperados."""
    bloques: list[str] = []
    for rg in reportes:
        rep = rg.reporte
        partes = [f"[Reporte {rep.fecha.isoformat()}]"]
        if rep.resumen:
            partes.append(f"Resumen: {rep.resumen}")
        if rep.salud.sintomas:
            partes.append("Síntomas: " + ", ".join(rep.salud.sintomas))
        if rep.salud.dolor:
            partes.append(f"Dolor: {rep.salud.dolor}")
        if rep.sueno.calidad:
            partes.append(f"Sueño: {rep.sueno.calidad.value}")
        if rep.animo.estado:
            partes.append(f"Ánimo: {rep.animo.estado}")
        if rep.actividades:
            partes.append("Actividades: " + ", ".join(rep.actividades))
        if rep.alertas:
            partes.append(
                "Alertas: "
                + "; ".join(f"{a.tipo}({a.severidad.value})" for a in rep.alertas)
            )
        bloques.append("\n".join(partes))
    return "\n\n".join(bloques)


def run(state: GraphState) -> GraphState:
    elder_id = state.get("elder_id") or "desconocido"
    pregunta = state.get("pregunta") or ""

    reportes: list[ReporteGuardado] = []
    try:
        reportes = get_vector_index().buscar(elder_id, pregunta)
    except Exception:
        logger.exception("Error recuperando contexto para Q&A")

    if not reportes:
        state["respuesta"] = SIN_HISTORIAL
        return state

    contexto = _formatear_contexto(reportes)
    llm = LLMClient(model=settings.llm_model_light)  # modelo chico = más barato
    state["respuesta"] = llm.complete(
        SYSTEM, f"Contexto:\n{contexto}\n\nPregunta: {pregunta}"
    )
    return state
