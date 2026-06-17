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

from src.config import settings


def _dividir_oraciones(texto: str) -> list[str]:
    """Parte el texto en oraciones (heurística simple, suficiente para el mock)."""
    partes = re.split(r"(?<=[.!?])\s+", (texto or "").strip())
    return [p.strip() for p in partes if p.strip()]


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

        msg = client.messages.create(
            model=self.model,
            max_tokens=1500,
            system=system,
            messages=messages,
        )
        texto = msg.content[0].text
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
