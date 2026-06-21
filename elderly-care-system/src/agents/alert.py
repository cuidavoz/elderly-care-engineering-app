"""Nodo de alertas: reporte -> alertas.  Responsable: Integrante D.

Dos capas: reglas explícitas (red de seguridad, no dependen del LLM) + un
pase opcional del LLM liviano para matices. La severidad alta nunca depende
solo del LLM.
"""
from __future__ import annotations

import json
import logging
import re

from src.config import settings
from src.orchestrator.state import GraphState
from src.pipeline.llm import LLMClient
# Reutilizamos utilidades ya probadas de report.py (NO se modifica ese módulo):
#  - `_normalizar`: NFKD + sin diacríticos + minúsculas (caí -> cai).
#  - `_extraer_json`: extrae el primer objeto JSON balanceado tolerando fences
#    markdown (```json ... ```) y texto alrededor.
from src.agents.report import _extraer_json, _normalizar
from src.schemas import Alerta, Severidad

logger = logging.getLogger(__name__)

# Palabras/frases de riesgo (severidad ALTA). Se guardan YA NORMALIZADAS (sin
# tildes, en minúsculas) para comparar contra el texto también normalizado, de
# modo que una caída escrita sin tilde ("me cai") igual dispare la alerta. El
# matching es por LÍMITE DE PALABRA (regex \b) para evitar falsos positivos por
# substring (p. ej. "pecho" en "pechuga" o "sangre" en "sangria").
PALABRAS_RIESGO = {
    _normalizar(p)
    for p in (
        # Caídas: formas frecuentes NO cubiertas por los stems de abajo.
        "cai", "me cai", "caigo", "caída", "caí", "caida",
        # Dificultad respiratoria.
        "no puedo respirar", "falta de aire", "me falta el aire", "falta el aire",
        "sin aire", "ahogo", "me ahogo",
        # Dolor torácico. OJO: NO incluimos "pecho" suelto (evita "pechuga").
        "dolor de pecho", "dolor en el pecho", "me duele el pecho", "duele el pecho",
        "opresion en el pecho", "puntada en el pecho",
        # Sangrado. Literales a propósito: un stem `sangr\w*` matchearía "sangria".
        "sangre", "sangrado", "sangrando", "sangra",
        # Pérdida de conocimiento.
        "desmayo", "desmaye", "perdi el conocimiento", "perdi la conciencia",
        "me desvanecio", "desvaneci",
        # Mareo. Literales a propósito: un stem `marea\w*` matchearía "marea" (mar).
        "mareo", "mareos", "mareado", "mareada", "mareo fuerte",
        # Inmovilidad (típico post-caída).
        "no me puedo levantar", "no puedo levantarme", "no me puedo mover",
    )
}

# Stems regex SEGUROS para familias verbales productivas (ya anclados por \b en
# el patrón final). Elegidos para NO generar falsos positivos:
#  - caer: cay* (cayo/cayendo/cayeron), caer* (caerme/caerse/caer), caid* (caido)
#  - desmayar: desmay* (desmayo/desmaye/desmayado/desmayarse)
# Deliberadamente NO se usan stems para sangrar (chocaría con "sangria") ni
# marear (chocaría con "marea"/el mar): esas familias van por literales arriba.
_STEMS_RIESGO = (r"cay\w*", r"caer\w*", r"caid\w*", r"desmay\w*")

# Patrón único: alterna literales (escapados) + stems, todos con límite de
# palabra. Se compila una sola vez. \b en los extremos exige palabra completa.
_PATRON_RIESGO = re.compile(
    r"\b(?:"
    + "|".join(
        [re.escape(kw) for kw in sorted(PALABRAS_RIESGO)] + list(_STEMS_RIESGO)
    )
    + r")\b"
)

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
    """Capa 1: reglas por palabras (red de seguridad, severidad ALTA).

    Determinística (no depende del LLM). Normaliza el texto (NFKD + sin tildes +
    minúsculas) y busca las palabras de riesgo por LÍMITE DE PALABRA, de modo que
    "me cai" dispare la alerta aunque venga sin tilde, pero "pechuga" NO matchee
    "pecho". La evidencia guardada es el fragmento de riesgo realmente hallado.
    """
    texto_norm = _normalizar(texto)
    if not texto_norm:
        return
    existentes = {_clave_alerta(a) for a in rep.alertas}
    for match in _PATRON_RIESGO.finditer(texto_norm):
        nueva = Alerta(
            tipo="señal_de_riesgo",
            severidad=Severidad.alta,
            evidencia=match.group(0),
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
        # El LLM puede envolver el JSON en fences markdown (```json ... ```) o
        # rodearlo de texto. `_extraer_json` aísla el objeto {...} balanceado
        # antes de parsear, así no descartamos alertas válidas por el envoltorio.
        data = json.loads(_extraer_json(raw))
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
    texto = state.get("transcripcion") or ""

    # Capa 1: reglas (severidad alta, no depende del LLM). La normalización
    # (sin tildes, por límite de palabra) se hace dentro de _aplicar_reglas.
    _aplicar_reglas(rep, texto)

    # Capa 2: pase del LLM liviano para matices baja/media.
    _pase_llm(rep)

    return state
