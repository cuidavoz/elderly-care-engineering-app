"""Nodo de generación de reporte: texto -> Reporte.  Responsable: Integrante C.

Convierte la transcripción del audio en un `Reporte` estructurado (Pydantic).
La FIDELIDAD es un requisito duro: el LLM NO debe inventar ni completar lo que
no está en el texto. Cada afirmación del reporte se ata a su fragmento textual
en `claims[].fuente_textual`, y un guard descarta los claims sin respaldo real
en la transcripción.
"""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import date

from src.orchestrator.state import GraphState
from src.pipeline.llm import LLMClient
from src.schemas import Reporte

# Prompt del reporte: describe el esquema campo por campo y fija las reglas de
# anti-alucinación. Tono es-AR, coherente con el resto del repo.
SYSTEM = (
    "Sos un asistente de cuidado de adultos mayores. A partir de la transcripción "
    "de un mensaje de voz, generás un reporte estructurado en JSON.\n"
    "\n"
    "REGLAS CRÍTICAS (faithfulness):\n"
    "1. Usá SOLO información explícita en la transcripción. No infieras, no "
    "completes ni asumas nada que no esté dicho con todas las letras.\n"
    "2. Lo que no se menciona se deja vacío: listas vacías, null/None en los "
    "campos opcionales y 'desconocida' en la calidad del sueño.\n"
    "3. Por CADA afirmación del reporte agregá una entrada en 'claims' con: "
    "'afirmacion' (lo que afirmás), 'campo' (la ruta del dato, p. ej. "
    "'salud.dolor') y 'fuente_textual' (un substring LITERAL y exacto de la "
    "transcripción que respalda la afirmación, copiado tal cual, sin parafrasear).\n"
    "\n"
    "ESQUEMA JSON esperado (respetá nombres y tipos):\n"
    "{\n"
    '  "fecha": "YYYY-MM-DD",                      // fecha del reporte; si no se dice, omitila\n'
    '  "salud": {\n'
    '    "sintomas": ["..."],                       // lista de síntomas mencionados\n'
    '    "medicacion_tomada": true|false|null,      // null si no se menciona\n'
    '    "dolor": "..."|null                        // descripción del dolor, o null\n'
    "  },\n"
    '  "sueno": {\n'
    '    "calidad": "buena"|"regular"|"mala"|"desconocida",\n'
    '    "notas": "..."|null\n'
    "  },\n"
    '  "animo": {\n'
    '    "estado": "..."|null,                      // p. ej. "contento", "triste"\n'
    '    "notas": "..."|null\n'
    "  },\n"
    '  "actividades": ["..."],                      // actividades realizadas\n'
    '  "alertas": [],                               // dejala vacía: las alertas las calcula otro nodo\n'
    '  "resumen": "...",                            // 1-2 oraciones, fiel al texto\n'
    '  "claims": [\n'
    '    {"afirmacion": "...", "campo": "salud.dolor", "fuente_textual": "..."}\n'
    "  ]\n"
    "}\n"
    "\n"
    "Respondé EXCLUSIVAMENTE con el objeto JSON, sin texto alrededor."
)


def _extraer_json(raw: str) -> str:
    """Extrae el primer objeto JSON balanceado de una respuesta del LLM.

    Tolera fences markdown (```json ... ```) y texto antes/después del objeto.
    Devuelve el substring `{...}` con llaves balanceadas (respetando strings y
    escapes) o el texto original si no encuentra un objeto.
    """
    if not raw:
        return raw
    texto = raw.strip()

    # Sacamos fences de markdown si los hubiera (```json ... ``` o ``` ... ```).
    fence = re.search(r"```(?:json)?\s*(.*?)```", texto, flags=re.DOTALL | re.IGNORECASE)
    if fence:
        texto = fence.group(1).strip()

    # Buscamos el primer '{' y avanzamos hasta su '}' balanceado, ignorando las
    # llaves que aparezcan dentro de strings JSON.
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
    # Sin cierre balanceado: devolvemos desde el primer '{' y que json.loads falle.
    return texto[inicio:]


def _parsear_reporte(raw: str, transcripcion: str) -> Reporte:
    """Parsea la respuesta del LLM a un `Reporte` válido.

    Robusto ante fences/ruido. Si el parseo o la validación Pydantic fallan,
    cae a un reporte mínimo válido (nunca tira excepción).
    """
    try:
        data = json.loads(_extraer_json(raw))
        if not isinstance(data, dict):
            raise ValueError("la respuesta no es un objeto JSON")
        # `fecha` por default si el LLM no la incluye.
        data.setdefault("fecha", date.today().isoformat())
        # Las alertas las calcula el nodo de alertas; no las tomamos del LLM.
        data["alertas"] = []
        return Reporte(**data)
    except Exception:
        # Fallback: reporte mínimo válido con el comienzo de la transcripción.
        return Reporte(fecha=date.today(), resumen=(transcripcion or "")[:200])


def _normalizar(texto: str) -> str:
    """Normaliza para comparar fuente_textual contra la transcripción.

    Pasa a minúsculas, colapsa espacios en blanco y elimina acentos (vía
    descomposición NFKD). La comparación queda laxa a propósito: tolera
    diferencias de mayúsculas, espaciado y tildes, pero exige que el contenido
    esté realmente presente en la transcripción.
    """
    texto = unicodedata.normalize("NFKD", texto or "")
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"\s+", " ", texto)
    return texto.strip().lower()


def _filtrar_claims_no_fieles(reporte: Reporte, transcripcion: str) -> Reporte:
    """Guard de faithfulness: descarta los claims sin respaldo en el texto.

    Conserva solo los claims cuyo `fuente_textual` (normalizado) sea substring
    de la transcripción (normalizada). Así ninguna afirmación del reporte queda
    citando un fragmento que el adulto mayor no dijo.
    """
    base = _normalizar(transcripcion)
    fieles = []
    for c in reporte.claims:
        fuente = _normalizar(c.fuente_textual)
        if fuente and fuente in base:
            fieles.append(c)
    reporte.claims = fieles
    return reporte


def run(state: GraphState) -> GraphState:
    # Camino incompleto: si la transcripción fue poco confiable, no inventamos.
    if state.get("error") == "transcripcion_poco_confiable":
        state["reporte"] = Reporte(
            fecha=date.today(),
            incompleto=True,
            resumen="Audio poco claro; se solicita reenvío.",
        )
        return state

    transcripcion = state.get("transcripcion") or ""

    llm = LLMClient()  # modelo grande (por default) para el reporte
    raw = llm.complete(SYSTEM, transcripcion, json_mode=True)

    reporte = _parsear_reporte(raw, transcripcion)
    reporte = _filtrar_claims_no_fieles(reporte, transcripcion)
    state["reporte"] = reporte
    return state
