"""Agente sintetizador: consolida los outputs de health_agent y wellbeing_agent
en un Reporte completo, aplica el guard de substring y genera el resumen.

En el retry (cuando feedback_faithfulness está seteado), recibe feedback
específico del evaluador y corrige solo los claims problemáticos via merge,
preservando todos los demás datos del reporte anterior.
"""
from __future__ import annotations
import json
from datetime import date

from src.orchestrator.state import GraphState
from src.pipeline.llm import LLMClient
from src.pipeline.parsing import extraer_json, normalizar
from src.schemas import Claim, Faithfulness, Reporte

SYSTEM_INICIAL = (
    "Sos un asistente de cuidado de adultos mayores. Recibís datos de salud y "
    "bienestar ya extraídos y los consolidás en un reporte estructurado completo.\n\n"
    "REGLAS:\n"
    "1. Usá SOLO la información de los datos extraídos y la transcripción original.\n"
    "2. Por CADA afirmación incluí un claim con 'fuente_textual' LITERAL de la transcripción.\n"
    "3. Si hay contradicciones entre salud y bienestar, priorizá lo más conservador.\n"
    "4. El campo 'alertas' debe quedar vacío [].\n\n"
    "ESQUEMA JSON:\n"
    '{"fecha": "YYYY-MM-DD", "salud": {"sintomas": [...], "medicacion_tomada": true|false|null, '
    '"dolor": "..."|null}, "sueno": {"calidad": "buena"|"regular"|"mala"|"desconocida", '
    '"notas": "..."|null}, "animo": {"estado": "..."|null, "notas": "..."|null}, '
    '"actividades": [...], "alertas": [], "resumen": "1-2 oraciones fieles al texto", '
    '"claims": [{"afirmacion": "...", "campo": "...", "fuente_textual": "..."}]}\n'
    "Respondé EXCLUSIVAMENTE con el objeto JSON."
)

SYSTEM_RETRY = (
    "Sos un asistente de cuidado de adultos mayores. El evaluador de fidelidad "
    "detectó claims problemáticos en el reporte. Devolvés ÚNICAMENTE la lista "
    "corregida de claims en JSON.\n\n"
    "REGLAS:\n"
    "1. Para cada claim problemático: si encontrás un fragmento LITERAL en la "
    "transcripción que lo respalde, actualizá 'fuente_textual'. Si no existe, "
    "eliminá ese claim de la lista.\n"
    "2. Incluí TODOS los claims que el evaluador aprobó, sin modificarlos.\n"
    "3. No agregues nuevos claims que no estaban en el reporte original.\n\n"
    'ESQUEMA: {"claims": [{"afirmacion": "...", "campo": "...", "fuente_textual": "..."}]}\n'
    "Respondé EXCLUSIVAMENTE con el objeto JSON."
)


def _build_user_inicial(transcripcion: str, salud: dict, bienestar: dict) -> str:
    return (
        f"TRANSCRIPCIÓN ORIGINAL:\n{transcripcion}\n\n"
        f"DATOS DE SALUD:\n{json.dumps(salud, ensure_ascii=False, indent=2)}\n\n"
        f"DATOS DE BIENESTAR:\n{json.dumps(bienestar, ensure_ascii=False, indent=2)}"
    )


def _build_user_retry(transcripcion: str, reporte: Reporte, feedback: str) -> str:
    claims_actuales = json.dumps(
        [c.model_dump() for c in reporte.claims], ensure_ascii=False, indent=2
    )
    return (
        f"TRANSCRIPCIÓN ORIGINAL:\n{transcripcion}\n\n"
        f"CLAIMS ACTUALES:\n{claims_actuales}\n\n"
        f"FEEDBACK DEL EVALUADOR:\n{feedback}"
    )


def _parsear(raw: str, transcripcion: str) -> Reporte:
    try:
        data = json.loads(extraer_json(raw))
        if not isinstance(data, dict):
            raise ValueError
        data.setdefault("fecha", date.today().isoformat())
        data["alertas"] = []
        return Reporte(**data)
    except Exception:
        return Reporte(fecha=date.today(), resumen=(transcripcion or "")[:200])


def _es_fiel(claim: Claim, base: str) -> bool:
    fuente = normalizar(claim.fuente_textual)
    return bool(fuente) and fuente in base


def _aplicar_guard(reporte: Reporte, transcripcion: str) -> Reporte:
    base = normalizar(transcripcion)
    n = len(reporte.claims)
    n_ok = sum(1 for c in reporte.claims if _es_fiel(c, base))
    reporte.faithfulness = Faithfulness(
        score=(n_ok / n) if n else None, n_claims=n, n_grounded=n_ok, metodo="substring"
    )
    fieles, desc = [], []
    for c in reporte.claims:
        (fieles if _es_fiel(c, base) else desc).append(c)
    reporte.claims = fieles
    reporte.claims_descartados = desc
    return reporte


def run(state: GraphState) -> GraphState:
    if state.get("error") == "transcripcion_poco_confiable":
        state["reporte"] = Reporte(
            fecha=date.today(),
            incompleto=True,
            resumen="Audio poco claro; se solicita reenvío.",
        )
        return state

    transcripcion = state.get("transcripcion") or ""
    feedback = state.get("feedback_faithfulness")
    reporte_existente = state.get("reporte")

    try:
        llm = LLMClient()
        if feedback and reporte_existente:
            # Retry: pedir solo los claims corregidos y mergear sobre el reporte existente.
            # Esto preserva salud, sueno, animo, actividades y resumen sin tocarlos.
            user_msg = _build_user_retry(transcripcion, reporte_existente, feedback)
            raw = llm.complete(SYSTEM_RETRY, user_msg, json_mode=True)
            data = json.loads(extraer_json(raw))
            nuevos_claims = [Claim(**c) for c in (data.get("claims") or [])]
            reporte = reporte_existente.model_copy(
                update={"claims": nuevos_claims, "claims_descartados": []}
            )
        else:
            # Primera ejecución: consolidar datos de los agentes especializados.
            salud = state.get("reporte_salud") or {}
            bienestar = state.get("reporte_bienestar") or {}
            user_msg = _build_user_inicial(transcripcion, salud, bienestar)
            raw = llm.complete(SYSTEM_INICIAL, user_msg, json_mode=True)
            reporte = _parsear(raw, transcripcion)
    except Exception:
        state["error"] = "reporte_no_generado"
        state["reporte"] = Reporte(
            fecha=date.today(),
            incompleto=True,
            resumen="No se pudo generar el reporte.",
        )
        return state

    reporte = _aplicar_guard(reporte, transcripcion)
    state["reporte"] = reporte
    return state
