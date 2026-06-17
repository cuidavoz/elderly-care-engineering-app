"""Nodo de alertas: reporte -> alertas.  Responsable: Integrante D.

Dos capas: reglas explícitas (red de seguridad, no dependen del LLM) + un
pase opcional del LLM liviano para matices. La severidad alta nunca depende
solo del LLM.
"""
from __future__ import annotations

import json
import logging

from src.config import settings
from src.orchestrator.state import GraphState
from src.pipeline.llm import LLMClient
from src.schemas import Alerta, Severidad

logger = logging.getLogger(__name__)

PALABRAS_RIESGO = {"caí", "caída", "pecho", "no puedo respirar", "mareo", "sangre"}

SYSTEM_ALERTAS = (
    "Sos un asistente clínico que detecta señales de alerta en reportes de "
    "adultos mayores. Te paso un resumen. Devolvé EXCLUSIVAMENTE un objeto JSON "
    'con esta forma: {"alertas": [{"tipo": "...", "severidad": "baja|media", '
    '"evidencia": "fragmento textual"}]}. Detectá SOLO matices de severidad '
    "baja o media (cansancio, ánimo bajo, sueño irregular, dolor leve, olvidos). "
    "NO marques severidad alta (eso lo cubren las reglas). Si no hay nada que "
    'reportar, devolvé {"alertas": []}. No inventes evidencia.'
)

_SEVERIDADES_LLM = {Severidad.baja, Severidad.media}


def _clave_alerta(a: Alerta) -> tuple[str, str]:
    """Identidad para deduplicar (tipo + evidencia, normalizados)."""
    return (a.tipo.strip().lower(), a.evidencia.strip().lower())


def _aplicar_reglas(rep, texto: str) -> None:
    """Capa 1: reglas por palabras (red de seguridad, severidad alta)."""
    existentes = {_clave_alerta(a) for a in rep.alertas}
    for kw in PALABRAS_RIESGO:
        if kw in texto:
            nueva = Alerta(
                tipo="señal_de_riesgo", severidad=Severidad.alta, evidencia=kw
            )
            if _clave_alerta(nueva) not in existentes:
                rep.alertas.append(nueva)
                existentes.add(_clave_alerta(nueva))


def _pase_llm(rep) -> None:
    """Capa 2: LLM liviano para matices de severidad baja/media.

    Parseo defensivo: en modo mock el LLM no devuelve alertas reales (devuelve
    un texto fijo no-JSON), así que cualquier fallo de parseo se ignora sin
    romper el grafo. Evita duplicar alertas ya detectadas por las reglas.
    """
    contexto = rep.resumen or ""
    if rep.salud.sintomas:
        contexto += "\nSíntomas: " + ", ".join(rep.salud.sintomas)
    if rep.animo.estado:
        contexto += f"\nÁnimo: {rep.animo.estado}"
    if rep.sueno.notas:
        contexto += f"\nSueño: {rep.sueno.notas}"
    contexto = contexto.strip()
    if not contexto:
        return

    try:
        llm = LLMClient(model=settings.llm_model_light)
        raw = llm.complete(SYSTEM_ALERTAS, contexto, json_mode=True)
    except Exception:
        logger.debug("Pase LLM de alertas no disponible; sigo con reglas.")
        return

    alertas_llm = _parsear_alertas(raw)
    existentes = {_clave_alerta(a) for a in rep.alertas}
    for a in alertas_llm:
        if a.severidad not in _SEVERIDADES_LLM:
            # El LLM nunca debe escalar a alta; eso es exclusivo de las reglas.
            continue
        if _clave_alerta(a) in existentes:
            continue
        rep.alertas.append(a)
        existentes.add(_clave_alerta(a))


def _parsear_alertas(raw: str) -> list[Alerta]:
    """Extrae alertas de la respuesta del LLM de forma tolerante a errores."""
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        # En mock json_mode devuelve un reporte (con clave "alertas": []), o en
        # otros casos texto libre no-JSON: lo ignoramos silenciosamente.
        return []
    if not isinstance(data, dict):
        return []
    items = data.get("alertas")
    if not isinstance(items, list):
        return []
    alertas: list[Alerta] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        try:
            alertas.append(Alerta(**it))
        except Exception:
            continue
    return alertas


def run(state: GraphState) -> GraphState:
    rep = state.get("reporte")
    if rep is None:
        return state
    texto = (state.get("transcripcion") or "").lower()

    # Capa 1: reglas (severidad alta, no depende del LLM).
    _aplicar_reglas(rep, texto)

    # Capa 2: pase del LLM liviano para matices baja/media.
    _pase_llm(rep)

    return state
