"""Persistencia + vector store para RAG.  Responsable: Integrante D.

Nodo `persist` del grafo: tras generar el reporte y detectar alertas, lo
persiste en SQLite e indexa su texto en Chroma para el Q&A. Si hay alguna
alerta de severidad ALTA, deja registrada la intención de notificar al familiar
(`state["notificar"] = True`); la notificación real (Telegram) la implementa
otro módulo. Nunca propaga excepciones que rompan el grafo: ante error setea
`state["error"]`.
"""
from __future__ import annotations

import logging

from src.orchestrator.state import GraphState
from src.schemas import Severidad
from src.storage import get_report_store, get_vector_index

logger = logging.getLogger(__name__)


def run(state: GraphState) -> GraphState:
    rep = state.get("reporte")
    if rep is None:
        return state

    elder_id = state.get("elder_id") or "desconocido"

    try:
        guardado = get_report_store().guardar(elder_id, rep)
        logger.info("Reporte guardado (id=%s, elder=%s)", guardado.id, elder_id)
    except Exception as exc:  # no romper el grafo
        logger.exception("Error guardando reporte")
        state["error"] = f"persistencia falló: {exc}"

    try:
        get_vector_index().indexar(elder_id, rep)
    except Exception as exc:  # no romper el grafo
        logger.exception("Error indexando reporte")
        # No pisar un error previo de persistencia si lo hubo.
        if not state.get("error"):
            state["error"] = f"indexado falló: {exc}"

    # Intención de notificar si hay alerta de severidad alta. La notificación
    # real por Telegram la dispara otro módulo leyendo este flag.
    hay_alerta_alta = any(
        a.severidad == Severidad.alta for a in rep.alertas
    )
    if hay_alerta_alta:
        state["notificar"] = True
        logger.warning(
            "ALERTA ALTA para elder=%s — se marca notificar=True", elder_id
        )

    return state
