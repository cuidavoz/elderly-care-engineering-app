"""Configuración global de tests.

Se ejecuta ANTES de importar cualquier módulo de `src`, así que es el lugar
para garantizar que la suite:
  - nunca llame a una API real (fuerza LLM_PROVIDER=mock),
  - nunca ensucie ./data (DB y Chroma van a un directorio temporal).

`src.config.settings` se instancia al importarse; por eso seteamos las env
vars acá arriba, antes de que cualquier test importe `src`.
"""
import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.gettempdir()) / "cuidavoz_tests"
_TMP.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("LLM_PROVIDER", "mock")
os.environ.setdefault("ASR_PROVIDER", "mock")
# Forzar sqlite en tests aunque exista un .env de dev con STORAGE_BACKEND=postgres.
os.environ.setdefault("STORAGE_BACKEND", "sqlite")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key-no-se-usa-en-mock")
os.environ.setdefault("DB_PATH", str(_TMP / "reports.db"))
os.environ.setdefault("CHROMA_PATH", str(_TMP / "chroma"))
