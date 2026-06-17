"""Resumen semanal inteligente (digest).  Capacidad agéntica F6.1.

Dado un adulto mayor y un rango (default 7 días), sintetiza sus reportes
diarios en tendencias + recomendaciones para la familia. El diseño combina
dos partes complementarias:

  - AGREGACIÓN DETERMINISTA (Python puro, desde `reporte`): número de
    reportes, distribución de calidad de sueño, estados de ánimo frecuentes,
    síntomas/dolor recurrentes, adherencia a la medicación y las alertas
    destacadas (severidad alta/media) del rango. Es 100% reproducible y no
    depende del LLM: en modo mock sigue siendo real.

  - PROSA DEL LLM LIVIANO (`settings.llm_model_light`): a partir de los datos
    ya agregados, redacta un `resumen` en prosa natural y una lista de
    `recomendaciones` para la familia. NO inventa: solo reformula lo agregado.
    El parseo de su respuesta es defensivo (como en report.py); si falla, hay
    un fallback determinista para `resumen`/`recomendaciones`.

El contrato del dict devuelto es estable: lo consume el web app.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from datetime import date, timedelta

from src.config import settings
from src.pipeline.llm import LLMClient
from src.schemas import Reporte, Severidad
from src.storage import ReporteGuardado, get_report_store

# Cuántos reportes traer del store antes de filtrar por fecha. Con un reporte
# diario, 7 días caben holgadamente; pedimos un margen amplio por si hay varios
# reportes por día o rangos más largos.
_LIMITE_MAX = 365

SYSTEM = (
    "Sos un asistente de cuidado de adultos mayores. Recibís datos YA AGREGADOS "
    "sobre la evolución de una persona durante un período y los sintetizás para "
    "su familia.\n"
    "\n"
    "REGLAS:\n"
    "1. Usá SOLO los datos agregados que te paso. No inventes síntomas, cifras "
    "ni eventos que no estén ahí.\n"
    "2. Tono cálido, claro y en español rioplatense (es-AR), sin tecnicismos.\n"
    "3. Las recomendaciones deben desprenderse de los datos (p. ej. si la "
    "adherencia a la medicación es baja, sugerir reforzar recordatorios).\n"
    "\n"
    "Respondé EXCLUSIVAMENTE con un objeto JSON con esta forma:\n"
    "{\n"
    '  "resumen": "2-4 oraciones en prosa sobre la evolución del período",\n'
    '  "recomendaciones": ["sugerencia 1", "sugerencia 2"]\n'
    "}\n"
)


# --------------------------------------------------------------------------- #
# Parseo defensivo de la respuesta del LLM (igual criterio que report.py)
# --------------------------------------------------------------------------- #
def _extraer_json(raw: str) -> str:
    """Extrae el primer objeto JSON balanceado de la respuesta del LLM.

    Tolera fences markdown y texto antes/después. Devuelve `{...}` con llaves
    balanceadas (respetando strings y escapes) o el texto original.
    """
    if not raw:
        return raw
    texto = raw.strip()

    fence = re.search(r"```(?:json)?\s*(.*?)```", texto, flags=re.DOTALL | re.IGNORECASE)
    if fence:
        texto = fence.group(1).strip()

    inicio = texto.find("{")
    if inicio == -1:
        return texto

    profundidad = 0
    en_string = False
    escape = False
    for i in range(inicio, len(texto)):
        ch = texto[i]
        if en_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                en_string = False
            continue
        if ch == '"':
            en_string = True
        elif ch == "{":
            profundidad += 1
        elif ch == "}":
            profundidad -= 1
            if profundidad == 0:
                return texto[inicio : i + 1]
    return texto[inicio:]


# --------------------------------------------------------------------------- #
# Agregación determinista
# --------------------------------------------------------------------------- #
def _filtrar_por_fecha(
    guardados: list[ReporteGuardado], desde: date, hasta: date
) -> list[ReporteGuardado]:
    """Conserva los reportes cuya fecha cae en [desde, hasta] (inclusive)."""
    return [g for g in guardados if desde <= g.reporte.fecha <= hasta]


def _tendencia_sueno(reportes: list[Reporte]) -> str:
    conteo = Counter(r.sueno.calidad.value for r in reportes)
    # Orden estable por frecuencia desc; el .value es legible ("buena", etc.).
    partes = [f"{cal}: {n}" for cal, n in conteo.most_common()]
    return "Distribución de calidad de sueño — " + ", ".join(partes)


def _tendencia_animo(reportes: list[Reporte]) -> str:
    conteo = Counter(
        r.animo.estado.strip()
        for r in reportes
        if r.animo.estado and r.animo.estado.strip()
    )
    if not conteo:
        return "Sin estados de ánimo registrados en el período."
    partes = [f"{estado}: {n}" for estado, n in conteo.most_common()]
    return "Estados de ánimo más frecuentes — " + ", ".join(partes)


def _tendencia_salud(reportes: list[Reporte]) -> str:
    sintomas = Counter()
    dolores = Counter()
    for r in reportes:
        for s in r.salud.sintomas:
            if s and s.strip():
                sintomas[s.strip()] += 1
        if r.salud.dolor and r.salud.dolor.strip():
            dolores[r.salud.dolor.strip()] += 1
    if not sintomas and not dolores:
        return "Sin síntomas ni dolores registrados en el período."
    partes: list[str] = []
    if sintomas:
        partes.append(
            "síntomas recurrentes — "
            + ", ".join(f"{s}: {n}" for s, n in sintomas.most_common())
        )
    if dolores:
        partes.append(
            "dolor — "
            + ", ".join(f"{d}: {n}" for d, n in dolores.most_common())
        )
    return "; ".join(partes).capitalize()


def _tendencia_medicacion(reportes: list[Reporte]) -> tuple[str, dict[str, int]]:
    """Adherencia a la medicación: cuenta días True/False/None.

    Devuelve el texto de la tendencia y el desglose numérico (útil para tests
    y para que el LLM lo cite sin inventar).
    """
    tomada = sum(1 for r in reportes if r.salud.medicacion_tomada is True)
    no_tomada = sum(1 for r in reportes if r.salud.medicacion_tomada is False)
    sin_dato = sum(1 for r in reportes if r.salud.medicacion_tomada is None)
    desglose = {"tomada": tomada, "no_tomada": no_tomada, "sin_dato": sin_dato}
    texto = (
        f"Adherencia a la medicación — días con medicación tomada: {tomada}, "
        f"no tomada: {no_tomada}, sin dato: {sin_dato}."
    )
    return texto, desglose


def _alertas_destacadas(guardados: list[ReporteGuardado]) -> list[dict]:
    """Alertas de severidad alta o media del rango, con su fecha."""
    destacadas: list[dict] = []
    for g in guardados:
        for a in g.reporte.alertas:
            if a.severidad in (Severidad.alta, Severidad.media):
                destacadas.append(
                    {
                        "tipo": a.tipo,
                        "severidad": a.severidad.value,
                        "evidencia": a.evidencia,
                        "fecha": g.reporte.fecha.isoformat(),
                    }
                )
    # Más severas primero (alta antes que media). Empate: más recientes primero.
    # Las fechas ISO ordenan lexicográficamente, así que `reverse=True` sobre la
    # fecha da el orden descendente; lo hacemos en un primer sort estable y luego
    # ordenamos por severidad (que no toca el orden relativo dentro de cada sev).
    _orden_sev = {"alta": 0, "media": 1}
    destacadas.sort(key=lambda d: d["fecha"], reverse=True)
    destacadas.sort(key=lambda d: _orden_sev.get(d["severidad"], 9))
    return destacadas


# --------------------------------------------------------------------------- #
# Prosa del LLM (resumen + recomendaciones)
# --------------------------------------------------------------------------- #
def _prompt_usuario(
    n_reportes: int,
    desde: date,
    hasta: date,
    tendencias: dict[str, str],
    med_desglose: dict[str, int],
    alertas: list[dict],
) -> str:
    lineas = [
        f"Período: {desde.isoformat()} a {hasta.isoformat()}.",
        f"Cantidad de reportes: {n_reportes}.",
        "",
        "Tendencias agregadas:",
        f"- Sueño: {tendencias['sueno']}",
        f"- Ánimo: {tendencias['animo']}",
        f"- Salud: {tendencias['salud']}",
        f"- Medicación: {tendencias['medicacion']}",
        "",
        (
            "Adherencia (días): tomada="
            f"{med_desglose['tomada']}, no_tomada={med_desglose['no_tomada']}, "
            f"sin_dato={med_desglose['sin_dato']}."
        ),
    ]
    if alertas:
        lineas.append("")
        lineas.append("Alertas destacadas:")
        for a in alertas:
            lineas.append(
                f"- [{a['fecha']}] {a['tipo']} (severidad {a['severidad']}): "
                f"{a['evidencia']}"
            )
    else:
        lineas.append("")
        lineas.append("Sin alertas destacadas en el período.")
    return "\n".join(lineas)


def _fallback_resumen(tendencias: dict[str, str], n_reportes: int) -> str:
    """Resumen determinista breve, usado si el LLM no devuelve algo parseable."""
    return (
        f"En el período se registraron {n_reportes} reporte(s). "
        f"{tendencias['sueno']} {tendencias['medicacion']}"
    )


def _prosa_llm(
    n_reportes: int,
    desde: date,
    hasta: date,
    tendencias: dict[str, str],
    med_desglose: dict[str, int],
    alertas: list[dict],
) -> tuple[str, list[str]]:
    """Pide al LLM liviano el resumen + recomendaciones, con parseo defensivo.

    Nunca propaga excepción: ante cualquier fallo cae a un resumen determinista
    y a una lista de recomendaciones vacía.
    """
    fallback = (_fallback_resumen(tendencias, n_reportes), [])
    try:
        llm = LLMClient(model=settings.llm_model_light)
        user = _prompt_usuario(
            n_reportes, desde, hasta, tendencias, med_desglose, alertas
        )
        raw = llm.complete(SYSTEM, user, json_mode=True)
        data = json.loads(_extraer_json(raw))
        if not isinstance(data, dict):
            return fallback

        resumen = data.get("resumen")
        if not isinstance(resumen, str) or not resumen.strip():
            resumen = _fallback_resumen(tendencias, n_reportes)

        recomendaciones = data.get("recomendaciones")
        if isinstance(recomendaciones, list):
            recomendaciones = [
                str(x).strip() for x in recomendaciones if str(x).strip()
            ]
        else:
            recomendaciones = []

        return resumen.strip(), recomendaciones
    except Exception:
        return fallback


# --------------------------------------------------------------------------- #
# Entrada pública
# --------------------------------------------------------------------------- #
def generar_digest(elder_id: str, dias: int = 7) -> dict:
    """Genera el resumen semanal (digest) de un adulto mayor.

    Trae los reportes del `elder_id`, los filtra al rango [hoy - dias, hoy],
    computa la agregación determinista y le pide al LLM liviano la prosa.
    Devuelve un dict con la forma exacta que consume el web app.
    """
    hasta = date.today()
    # `dias` cuenta el día de hoy + (dias - 1) días previos; con dias=7 cubre
    # una semana terminando hoy. Acotamos a >= 1 para evitar rangos vacíos.
    desde = hasta - timedelta(days=max(dias, 1) - 1)

    try:
        guardados = get_report_store().listar(elder_id, limite=_LIMITE_MAX)
    except Exception:
        guardados = []

    en_rango = _filtrar_por_fecha(guardados, desde, hasta)
    reportes = [g.reporte for g in en_rango]
    n_reportes = len(reportes)

    base = {
        "elder_id": elder_id,
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "n_reportes": n_reportes,
    }

    if n_reportes == 0:
        return {
            **base,
            "resumen": "Sin reportes en el período.",
            "tendencias": {
                "sueno": "Sin reportes en el período.",
                "animo": "Sin reportes en el período.",
                "salud": "Sin reportes en el período.",
                "medicacion": "Sin reportes en el período.",
            },
            "alertas_destacadas": [],
            "recomendaciones": [],
        }

    med_texto, med_desglose = _tendencia_medicacion(reportes)
    tendencias = {
        "sueno": _tendencia_sueno(reportes),
        "animo": _tendencia_animo(reportes),
        "salud": _tendencia_salud(reportes),
        "medicacion": med_texto,
    }
    alertas = _alertas_destacadas(en_rango)

    resumen, recomendaciones = _prosa_llm(
        n_reportes, desde, hasta, tendencias, med_desglose, alertas
    )

    return {
        **base,
        "resumen": resumen,
        "tendencias": tendencias,
        "alertas_destacadas": alertas,
        "recomendaciones": recomendaciones,
    }
