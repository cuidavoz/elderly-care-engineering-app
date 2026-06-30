"""Utilidades de parseo de respuestas LLM, compartidas por los agentes."""
from __future__ import annotations
import re
import unicodedata


def extraer_json(raw: str) -> str:
    """Extrae el primer objeto JSON balanceado de una respuesta del LLM.

    Tolera fences markdown y texto alrededor del objeto.
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
    profundidad, en_string, escape = 0, False, False
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
                return texto[inicio:i + 1]
    return texto[inicio:]


def normalizar(texto: str) -> str:
    """Normaliza texto para comparación: sin tildes, minúsculas, sin espacios extra."""
    texto = unicodedata.normalize("NFKD", texto or "")
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"\s+", " ", texto)
    return texto.strip().lower()
