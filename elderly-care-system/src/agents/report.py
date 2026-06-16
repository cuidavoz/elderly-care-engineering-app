"""Nodo de generación de reporte: texto -> Reporte.  Responsable: Integrante C."""
from __future__ import annotations
import json
from datetime import date
from src.orchestrator.state import GraphState
from src.pipeline.llm import LLMClient
from src.schemas import Reporte

SYSTEM = (
    "Sos un asistente de cuidado de adultos mayores. A partir de la transcripción "
    "de un mensaje de voz, generás un reporte estructurado en JSON. REGLA CRÍTICA: "
    "no inventes ni completes información que no esté explícita en el texto; si un "
    "campo no se menciona, dejalo vacío/desconocido. Por cada afirmación del reporte "
    "incluí en 'claims' el fragmento textual exacto que la respalda."
)


def run(state: GraphState) -> GraphState:
    if state.get("error") == "transcripcion_poco_confiable":
        state["reporte"] = Reporte(fecha=date.today(), incompleto=True,
                                   resumen="Audio poco claro; se solicita reenvío.")
        return state

    llm = LLMClient()  # modelo grande para el reporte
    raw = llm.complete(SYSTEM, state["transcripcion"], json_mode=True)
    try:
        data = json.loads(raw)
        data.setdefault("fecha", date.today().isoformat())
        state["reporte"] = Reporte(**data)
    except Exception:
        # STUB / fallback: reporte mínimo válido
        state["reporte"] = Reporte(fecha=date.today(),
                                   resumen=state.get("transcripcion", "")[:200])
    return state
