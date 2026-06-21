"""Cliente LLM desacoplado del proveedor.

Toda llamada al LLM pasa por aquí, de modo que cambiar de proveedor o de
modelo sea un cambio local. `complete` devuelve siempre texto plano.

Proveedores (settings.llm_provider):
  - "anthropic": llamada real a la API de Claude.
  - "mock":      fixtures deterministas, sin red ni costo. Se usa en tests y
                 para la demo sin API key. El mock es "semi-inteligente": en
                 modo JSON arma un reporte cuyos `claims.fuente_textual` son
                 substrings reales del texto de entrada, de modo que la
                 verificación de faithfulness corra de forma determinista.

NOTA (contrato congelado — Fase 0): la firma de `complete` no cambia. Quien
genera el reporte (report.py) y el Q&A (caregiver_qa.py) dependen de ella.
"""
from __future__ import annotations

import json
import re
import time

from src.config import settings

# Robustez de la llamada real a la API (BUG 1): un timeout acotado evita que un
# cuelgue de red bloquee el pipeline para siempre, y unos pocos reintentos con
# backoff exponencial absorben fallos transitorios (timeouts, 429, 5xx, errores
# de conexión) sin propagar la excepción al grafo.
LLM_TIMEOUT_S = 60.0          # segundos por intento
LLM_MAX_INTENTOS = 3          # 1 intento + 2 reintentos
LLM_BACKOFF_BASE_S = 1.0      # sleep = base * 2**(intento-1) -> 1s, 2s, ...


def _dividir_oraciones(texto: str) -> list[str]:
    """Parte el texto en oraciones (heurística simple, suficiente para el mock)."""
    partes = re.split(r"(?<=[.!?])\s+", (texto or "").strip())
    return [p.strip() for p in partes if p.strip()]


def _extraer_texto(content) -> str:
    """Extrae de forma SEGURA el primer bloque de texto de `msg.content` (BUG 1).

    La respuesta de Anthropic es una lista de bloques que NO siempre empieza por
    uno de tipo `text`: puede venir vacía, o el primer bloque puede ser de otro
    tipo (p. ej. `tool_use`, o un refusal). Acceder a ciegas a `content[0].text`
    revienta con IndexError/AttributeError. Acá recorremos los bloques y nos
    quedamos con el primero que sea de tipo `text` (o que exponga `.text`); si no
    hay ninguno, lanzamos un error claro en vez de un crash opaco.
    """
    for bloque in content or []:
        # Bloque tipado del SDK: tiene `.type == "text"` y `.text`.
        tipo = getattr(bloque, "type", None)
        texto = getattr(bloque, "text", None)
        if tipo == "text" and isinstance(texto, str):
            return texto
        # Tolerancia: un bloque con `.text` string pero sin `type` declarado.
        if tipo is None and isinstance(texto, str):
            return texto
    raise RuntimeError("respuesta del LLM sin texto")


class LLMClient:
    """Interfaz única hacia el LLM. `model` permite dimensionar por tarea
    (modelo grande para el reporte, chico para alertas/Q&A)."""

    def __init__(self, model: str | None = None):
        self.model = model or settings.llm_model_report
        self.provider = settings.llm_provider

    def complete(self, system: str, user: str, json_mode: bool = False) -> str:
        if self.provider == "mock":
            return self._complete_mock(system, user, json_mode)
        if self.provider == "anthropic":
            return self._complete_anthropic(system, user, json_mode)
        raise ValueError(f"LLM_PROVIDER desconocido: {self.provider!r}")

    # ------------------------------------------------------------------ #
    # Proveedor real: Anthropic (Claude)
    # ------------------------------------------------------------------ #
    def _complete_anthropic(self, system: str, user: str, json_mode: bool) -> str:
        import anthropic

        if not settings.anthropic_api_key:
            raise RuntimeError(
                "Falta ANTHROPIC_API_KEY. Configurá la key en .env o usá "
                "LLM_PROVIDER=mock para desarrollo/tests sin costo."
            )
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        messages: list[dict] = [{"role": "user", "content": user}]
        if json_mode:
            # Técnica de "prefill": forzamos a Claude a empezar la respuesta con
            # '{' para que devuelva JSON puro y parseable, sin texto alrededor.
            system = system + "\n\nRespondé EXCLUSIVAMENTE con un objeto JSON válido."
            messages.append({"role": "assistant", "content": "{"})

        # Tipos de error del SDK que vale la pena reintentar (timeout/red/429/5xx).
        # Los importamos de forma defensiva: si una versión del SDK no expone
        # alguno, caemos a `Exception` para no romper el import.
        reintentables = tuple(
            t for t in (
                getattr(anthropic, "APITimeoutError", None),
                getattr(anthropic, "APIConnectionError", None),
                getattr(anthropic, "RateLimitError", None),
                getattr(anthropic, "InternalServerError", None),
                getattr(anthropic, "APIStatusError", None),
            )
            if isinstance(t, type)
        ) or (Exception,)

        ultimo_error: Exception | None = None
        for intento in range(1, LLM_MAX_INTENTOS + 1):
            try:
                msg = client.messages.create(
                    model=self.model,
                    max_tokens=1500,
                    system=system,
                    messages=messages,
                    timeout=LLM_TIMEOUT_S,
                )
                break
            except reintentables as e:
                ultimo_error = e
                if intento >= LLM_MAX_INTENTOS:
                    # Agotamos los reintentos: re-lanzamos para que el caller
                    # (report.run) degrade de forma controlada.
                    raise
                # Backoff exponencial: 1s, 2s, ... antes del próximo intento.
                time.sleep(LLM_BACKOFF_BASE_S * (2 ** (intento - 1)))
        else:  # pragma: no cover - el break/raise cubren todas las salidas
            raise ultimo_error if ultimo_error else RuntimeError("LLM sin respuesta")

        # Acceso seguro al contenido: nunca `msg.content[0].text` a ciegas.
        texto = _extraer_texto(msg.content)
        if json_mode:
            # Reponemos el '{' del prefill que Claude no repite.
            texto = "{" + texto
        return texto

    # ------------------------------------------------------------------ #
    # Proveedor mock: determinista, sin red
    # ------------------------------------------------------------------ #
    def _complete_mock(self, system: str, user: str, json_mode: bool) -> str:
        if not json_mode:
            # Q&A u otra tarea de texto libre: respuesta fundamentada y honesta.
            return (
                "[mock] Según los reportes recuperados, la evolución se mantuvo "
                "estable. No tengo información suficiente para afirmar más de lo "
                "que figura en el historial."
            )

        # Modo JSON => reporte. Construimos uno válido cuyos claims citan
        # substrings reales del `user` (la transcripción).
        oraciones = _dividir_oraciones(user)
        resumen = " ".join(oraciones[:2])[:200] if oraciones else ""
        claims = [
            {"afirmacion": o, "campo": "resumen", "fuente_textual": o}
            for o in oraciones[:3]
        ]
        reporte = {
            "salud": {"sintomas": [], "medicacion_tomada": None, "dolor": None},
            "sueno": {"calidad": "desconocida", "notas": None},
            "animo": {"estado": None, "notas": None},
            "actividades": [],
            "alertas": [],
            "resumen": resumen,
            "claims": claims,
        }
        return json.dumps(reporte, ensure_ascii=False)
