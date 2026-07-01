"""Agente de seguimiento proactivo (P18).

Una vez al día, mira los reportes recientes del adulto mayor, elige UN tema para
hacerle seguimiento (prioridad severidad alta > media > baja), decide CUÁNDO
preguntarlo y redacta una pregunta cálida. Devuelve una `SeguimientoDecision`
(o `None` si hoy no conviene preguntar / no hay material). NO persiste ni
notifica: eso lo hace el caller (endpoint / dispatcher).

Composición (subagentes especializados = mismo modelo, distinto prompt/rol):
  - Selector: elige {preguntar, tema, severidad, momento} — structured output.
  - Redactor: redacta la pregunta cálida a partir del tema.
El coordinador es `decidir_seguimiento`.

Provider-agnóstico: usa `LLMClient` (switch `settings.llm_provider`) con el modelo
`settings.llm_model_followup`. Migrar SOLO este agente a un modelo propio
(self-hosteado en la VM) = cambiar esa config + agregar el provider en
`pipeline/llm.py`; este módulo NO cambia.

Reusa: `get_report_store().listar` (misma "memoria" que digest.py), el patrón de
parseo defensivo con `pipeline.parsing.extraer_json`, y las severidades ya
calculadas por `alert.py` (se consumen, no se recomputan). Nunca propaga
excepción: ante cualquier fallo devuelve None (equivale a "hoy no molesto").
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from src.config import settings
from src.pipeline.llm import LLMClient
from src.pipeline.parsing import extraer_json
from src.schemas import Severidad
from src.storage import get_report_store

logger = logging.getLogger(__name__)

# Ventana de contexto: miramos lo que contó en las últimas 24 horas.
_HORAS_CONTEXTO = 24
_LIMITE_MAX = 60  # cuántos reportes traer del store antes de filtrar por fecha

# Zona horaria local de los adultos (Argentina, sin horario de verano). Se usa
# solo para etiquetar "franja del día" y "hoy/ayer" en el contexto que ve el LLM.
_TZ_LOCAL = timezone(timedelta(hours=-3))

# La política de "cómo elegir y cómo preguntar" vive en una Skill versionada
# (conocimiento, no código): se puede editar sin tocar este módulo.
_SKILL_PATH = Path(__file__).parent / "skills" / "seguimiento" / "SKILL.md"


class Momento(str, Enum):
    """Cuándo preguntar. El agente lo decide; el dispatcher lo traduce a hora."""
    despues_del_evento = "despues_del_evento"
    esta_noche = "esta_noche"
    manana_a_la_manana = "manana_a_la_manana"
    en_2h = "en_2h"
    hora_puntual = "hora_puntual"


class SeguimientoDecision(BaseModel):
    """Decisión del agente para el seguimiento del día."""
    preguntar: bool = False
    tema: Optional[str] = None
    severidad: Optional[Severidad] = None
    momento: Optional[Momento] = None
    hora_puntual: Optional[str] = None   # "HH:MM" si momento == hora_puntual
    fuente_fecha: Optional[str] = None   # fecha ISO del reporte que lo motiva
    justificacion: Optional[str] = None
    pregunta: Optional[str] = None       # la completa el Redactor


# --------------------------------------------------------------------------- #
# Memoria: contexto reciente (reusa el mismo store que digest.py)
# --------------------------------------------------------------------------- #
def _cargar_politica() -> str:
    """Lee la Skill de política. Si falta, seguimos sin ella (defensivo)."""
    try:
        return _SKILL_PATH.read_text(encoding="utf-8")
    except Exception:
        logger.warning("No se pudo leer la skill de seguimiento en %s", _SKILL_PATH)
        return ""


def _a_utc(dt: datetime) -> datetime:
    """Normaliza a UTC. Un datetime naive se asume UTC (SQLite guarda UTC)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _hace_texto(creado_en: datetime, ahora: datetime) -> str:
    """Etiqueta relativa 'hace cuánto' se registró el reporte."""
    horas = (ahora - _a_utc(creado_en)).total_seconds() / 3600
    if horas < 1:
        return "hace menos de una hora"
    if horas < 24:
        return f"hace {int(horas)} horas"
    dias = int(horas // 24)
    return "hace alrededor de un día" if dias == 1 else f"hace {dias} días"


def _franja_del_dia(dt: datetime) -> str:
    """Franja del día en hora local: madrugada / mañana / tarde / noche."""
    h = _a_utc(dt).astimezone(_TZ_LOCAL).hour
    if h < 6:
        return "madrugada"
    if h < 12:
        return "mañana"
    if h < 20:
        return "tarde"
    return "noche"


def _contexto_reciente(elder_id: str, ahora: datetime) -> list[dict]:
    """Trae los reportes de las ÚLTIMAS 24 HORAS y arma un contexto COMPACTO.

    Cada item incluye 'hace' (hace cuánto se registró) y 'franja_del_dia' para
    darle contexto temporal al agente. Filtra por el timestamp real `creado_en`;
    si algún reporte no lo tiene (datos viejos), cae a aproximar por `fecha`.
    """
    limite_dt = ahora - timedelta(hours=_HORAS_CONTEXTO)
    hoy_local = ahora.astimezone(_TZ_LOCAL).date()
    try:
        guardados = get_report_store().listar(elder_id, limite=_LIMITE_MAX)
    except Exception:
        logger.exception("No se pudo listar reportes de elder=%s", elder_id)
        return []

    compactos: list[dict] = []
    for g in guardados:
        r = g.reporte
        creado = g.creado_en
        if creado is not None:
            if _a_utc(creado) < limite_dt:
                continue  # fuera de la ventana de 24 h
            hace = _hace_texto(creado, ahora)
            franja = _franja_del_dia(creado)
        else:
            # Sin timestamp: aproximamos por fecha (hoy o ayer) y sin franja.
            if r.fecha < hoy_local - timedelta(days=1):
                continue
            hace = "hoy" if r.fecha == hoy_local else "ayer"
            franja = None
        compactos.append(
            {
                "fecha": r.fecha.isoformat(),
                "hace": hace,
                "franja_del_dia": franja,
                "resumen": r.resumen,
                "actividades": r.actividades,
                "animo": r.animo.estado,
                "sintomas": r.salud.sintomas,
                "dolor": r.salud.dolor,
                "alertas": [
                    {
                        "tipo": a.tipo,
                        "severidad": a.severidad.value,
                        "evidencia": a.evidencia,
                    }
                    for a in r.alertas
                ],
            }
        )
    return compactos


# --------------------------------------------------------------------------- #
# Subagente 1: Selector (elige tema + severidad + momento)
# --------------------------------------------------------------------------- #
def _selector(
    contexto: list[dict], preguntas_recientes: list[str], ahora: datetime
) -> SeguimientoDecision:
    ahora_local = ahora.astimezone(_TZ_LOCAL)
    system = (
        "Sos el SELECTOR de un agente de seguimiento de adultos mayores. A partir "
        "de lo que la persona contó en las ÚLTIMAS 24 HORAS, elegís UN solo tema "
        "para hacerle seguimiento hoy (o decidís NO preguntar), su severidad y "
        "cuándo preguntarlo. Cada reporte trae 'hace' (hace cuánto lo contó) y "
        "'franja_del_dia': usalos para decidir el momento y para dar contexto.\n\n"
        "POLÍTICA (seguila al pie de la letra):\n"
        + _cargar_politica()
        + "\n\nRespondé EXCLUSIVAMENTE con un objeto JSON con esta forma:\n"
        '{"preguntar": true|false, '
        '"tema": "breve descripción o null", '
        '"severidad": "alta"|"media"|"baja"|null, '
        '"momento": "despues_del_evento"|"esta_noche"|"manana_a_la_manana"|"en_2h"|"hora_puntual"|null, '
        '"hora_puntual": "HH:MM"|null, '
        '"fuente_fecha": "YYYY-MM-DD del reporte que lo motiva o null", '
        '"justificacion": "por qué elegiste esto, breve"}\n'
        "Si hoy no conviene preguntar: preguntar=false y el resto en null."
    )
    user = json.dumps(
        {
            "ahora": ahora_local.strftime("%Y-%m-%d %H:%M"),
            "franja_actual": _franja_del_dia(ahora),
            "reportes_ultimas_24h": contexto,
            "preguntas_ya_hechas_recientemente": preguntas_recientes,
        },
        ensure_ascii=False,
        indent=2,
    )

    llm = LLMClient(model=settings.llm_model_followup)
    raw = llm.complete(system, user, json_mode=True)
    data = json.loads(extraer_json(raw))
    if not isinstance(data, dict):
        return SeguimientoDecision(preguntar=False)

    return SeguimientoDecision(
        preguntar=bool(data.get("preguntar")),
        tema=_str_o_none(data.get("tema")),
        severidad=_severidad_o_none(data.get("severidad")),
        momento=_momento_o_none(data.get("momento")),
        hora_puntual=_str_o_none(data.get("hora_puntual")),
        fuente_fecha=_str_o_none(data.get("fuente_fecha")),
        justificacion=_str_o_none(data.get("justificacion")),
    )


# --------------------------------------------------------------------------- #
# Subagente 2: Redactor (escribe la pregunta cálida)
# --------------------------------------------------------------------------- #
def _redactor(decision: SeguimientoDecision, contexto: list[dict]) -> Optional[str]:
    system = (
        "Sos el REDACTOR de un agente de seguimiento de adultos mayores. Te dan un "
        "tema ya elegido y escribís UNA pregunta corta, cálida y cercana para "
        "enviarle a la persona.\n\n"
        "POLÍTICA (seguila al pie de la letra):\n"
        + _cargar_politica()
        + '\n\nRespondé EXCLUSIVAMENTE con un objeto JSON: {"pregunta": "..."}'
    )
    user = json.dumps(
        {
            "tema": decision.tema,
            "severidad": decision.severidad.value if decision.severidad else None,
            "reportes_recientes": contexto,
        },
        ensure_ascii=False,
        indent=2,
    )

    llm = LLMClient(model=settings.llm_model_followup)
    raw = llm.complete(system, user, json_mode=True)
    data = json.loads(extraer_json(raw))
    if not isinstance(data, dict):
        return None
    pregunta = data.get("pregunta")
    if isinstance(pregunta, str) and pregunta.strip():
        return pregunta.strip()
    return None


# --------------------------------------------------------------------------- #
# Coordinador (entrada pública)
# --------------------------------------------------------------------------- #
def decidir_seguimiento(
    elder_id: str,
    preguntas_recientes: Optional[list[str]] = None,
    ahora: Optional[datetime] = None,
) -> Optional[SeguimientoDecision]:
    """Decide la pregunta de seguimiento del día para un adulto mayor.

    Devuelve una `SeguimientoDecision` con la pregunta lista, o `None` si hoy no
    conviene preguntar (sin material en las últimas 24 h, el Selector decidió no
    molestar, o falló algún paso — siempre degradamos a "no preguntar").
    `ahora` es inyectable para tests (default: UTC actual).
    """
    ahora = ahora or datetime.now(timezone.utc)
    preguntas_recientes = preguntas_recientes or []

    contexto = _contexto_reciente(elder_id, ahora)
    if not contexto:
        return None  # sin nada en las últimas 24 h que seguir

    try:
        decision = _selector(contexto, preguntas_recientes, ahora)
    except Exception:
        logger.exception("Selector de seguimiento falló (elder=%s)", elder_id)
        return None

    if not decision.preguntar:
        return None  # el agente decidió no molestar hoy

    try:
        pregunta = _redactor(decision, contexto)
    except Exception:
        logger.exception("Redactor de seguimiento falló (elder=%s)", elder_id)
        return None

    if not pregunta:
        return None

    decision.pregunta = pregunta
    return decision


# --------------------------------------------------------------------------- #
# Helpers de parseo defensivo
# --------------------------------------------------------------------------- #
def _str_o_none(v) -> Optional[str]:
    return v.strip() if isinstance(v, str) and v.strip() else None


def _severidad_o_none(v) -> Optional[Severidad]:
    try:
        return Severidad(v)
    except (ValueError, TypeError):
        return None


def _momento_o_none(v) -> Optional[Momento]:
    try:
        return Momento(v)
    except (ValueError, TypeError):
        return None
