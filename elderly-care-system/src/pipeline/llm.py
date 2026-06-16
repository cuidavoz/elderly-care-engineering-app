"""Cliente LLM desacoplado del proveedor.  Responsable: Integrante C.

Toda llamada al LLM pasa por aquí, de modo que cambiar de proveedor o de
modelo sea un cambio local. `complete` debe devolver texto plano.
"""
from __future__ import annotations
from src.config import settings


class LLMClient:
    def __init__(self, model: str | None = None):
        self.model = model or settings.llm_model_report

    def complete(self, system: str, user: str, json_mode: bool = False) -> str:
        """TODO(C): implementar según settings.llm_provider.

        anthropic:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            msg = client.messages.create(model=self.model, max_tokens=1500,
                                         system=system,
                                         messages=[{"role": "user", "content": user}])
            return msg.content[0].text
        """
        # --- STUB ---
        return '{"stub": true}' if json_mode else "respuesta stub del LLM"
