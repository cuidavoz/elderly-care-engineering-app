"""Agente evaluador de fidelidad semántica (Opción A del loop agentico).

A diferencia del guard de substring en el synthesizer, usa comprensión
semántica (Claude) para verificar si cada claim está realmente respaldado
por la transcripción. Si el score < UMBRAL_FIDELIDAD y no se agotaron los
reintentos, el grafo vuelve al synthesizer con feedback específico.
"""
from __future__ import annotations
import json

from src.config import settings
from src.orchestrator.state import GraphState
from src.pipeline.llm import LLMClient
from src.pipeline.parsing import extraer_json
from src.schemas import Faithfulness

UMBRAL_FIDELIDAD = 0.8

SYSTEM = (
    "Sos un evaluador estricto de fidelidad de reportes médicos de adultos mayores. "
    "Verificás si cada claim está realmente respaldado por la transcripción, "
    "usando comprensión semántica (no solo búsqueda de substring).\n\n"
    "CRITERIOS:\n"
    "- FIEL: la transcripción lo menciona explícitamente, aunque con otras palabras.\n"
    "- NO FIEL: fue inferido, asumido o extrapolado.\n\n"
    "IMPORTANTE sobre campos del reporte: los valores null, lista vacía o 'desconocida' "
    "en los campos de salud, sueño y ánimo son VÁLIDOS — significan 'no mencionado'. "
    "Evaluá solo si 'fuente_textual' de cada claim aparece en la transcripción.\n\n"
    "RESPUESTA en JSON:\n"
    '{"score": 0.0, '
    '"claims_no_fieles": [{"afirmacion": "...", "campo": "...", "problema": "..."}], '
    '"feedback": "instrucciones concretas para el synthesizer"}\n'
    "Si todos los claims son fieles: score=1.0, claims_no_fieles=[], feedback=''.\n"
    "Respondé EXCLUSIVAMENTE con el objeto JSON."
)


def run(state: GraphState) -> GraphState:
    reporte = state.get("reporte")
    state["iteracion_reporte"] = (state.get("iteracion_reporte") or 0) + 1

    if not reporte or reporte.incompleto or not reporte.claims:
        state["feedback_faithfulness"] = None
        return state

    transcripcion = state.get("transcripcion") or ""
    claims_json = json.dumps(
        [c.model_dump() for c in reporte.claims], ensure_ascii=False, indent=2
    )
    user_msg = f"TRANSCRIPCIÓN:\n{transcripcion}\n\nCLAIMS DEL REPORTE:\n{claims_json}"

    try:
        llm = LLMClient(model=settings.llm_model_light)
        raw = llm.complete(SYSTEM, user_msg, json_mode=True)
        data = json.loads(extraer_json(raw))
        score = max(0.0, min(1.0, float(data.get("score", 1.0))))
        feedback = str(data.get("feedback", ""))
        n_no_fieles = len(data.get("claims_no_fieles") or [])
    except Exception:
        score, feedback, n_no_fieles = 1.0, "", 0

    n_claims = len(reporte.claims)
    reporte.faithfulness_semantica = Faithfulness(
        score=score,
        n_claims=n_claims,
        n_grounded=max(0, n_claims - n_no_fieles),
        metodo="semantico",
    )
    state["reporte"] = reporte
    state["feedback_faithfulness"] = feedback if score < UMBRAL_FIDELIDAD else None
    return state
