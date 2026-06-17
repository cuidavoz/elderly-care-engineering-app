---
name: cuidavoz-dev
description: Levantar, testear y correr el sistema CuidaVoz en local (Windows/Python 3.11). Usar cuando haya que crear/activar el venv, instalar dependencias, correr los tests, levantar la API o el dashboard, o alternar entre el LLM mock (sin costo) y el real (Anthropic). Cubre también el ASR (faster-whisper) y el fixture de audio.
---

# CuidaVoz — entorno de desarrollo

Sistema multi-agente voz→reporte. Esqueleto en `elderly-care-system/`. Todo el
desarrollo y la demo pueden correr **sin gastar API** usando el LLM en modo `mock`.

## Setup (una vez)

El proyecto apunta a **Python 3.11** (no 3.14 — algunas wheels de ML no lo soportan).

```powershell
cd elderly-care-system
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
# reproducible exacto: usar requirements.lock.txt en vez de requirements.txt
```

Verificar que la stack pesada importa:
```powershell
.\.venv\Scripts\python.exe -c "import faster_whisper, chromadb, anthropic, fastapi, streamlit, telegram; print('ok')"
```

## Tests

`conftest.py` fuerza `LLM_PROVIDER=mock` y usa DB/Chroma temporales — los tests
nunca llaman a una API ni ensucian `./data`.

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

## Correr el sistema

```powershell
# API (http://localhost:8000/docs)
.\.venv\Scripts\python.exe -m uvicorn src.api.main:app --reload --port 8000
# Dashboard (http://localhost:8501)
.\.venv\Scripts\streamlit.exe run frontend/app.py
```

## LLM: mock vs real

- **mock (default en tests, sin costo):** `LLM_PROVIDER=mock`. Devuelve un reporte
  válido cuyos `claims` citan substrings reales de la transcripción.
- **real (Anthropic):** en `.env` poner `LLM_PROVIDER=anthropic` y `ANTHROPIC_API_KEY=...`.
  Modelos en `LLM_MODEL_REPORT` (grande, reporte) y `LLM_MODEL_LIGHT` (chico, alertas/Q&A).

Todo el LLM pasa por `src/pipeline/llm.py` (`LLMClient.complete`). No llamar al
proveedor desde otro lado.

## ASR (faster-whisper)

- Tamaño del modelo en `WHISPER_MODEL` (tiny|base|small|...). `tiny`/`base` para la demo en CPU.
- La primera corrida descarga los pesos a `~/.cache/huggingface`.
- Fixture de audio en español para pruebas: `tests/fixtures/sample_es.wav`
  (generado con la voz SAPI Sabina es-MX).
- Warnings de HF token y de symlinks en Windows son benignos. Para silenciar symlinks:
  `setx HF_HUB_DISABLE_SYMLINKS_WARNING 1`.

## Convención de trabajo (orquestador + subagentes)

Cada módulo tiene un dueño y edita **solo sus archivos** (ver `docs/03_implementation_plan.md`).
Los archivos compartidos (`schemas.py`, `config.py`, `state.py`, `pipeline/llm.py`,
`storage/*`, `requirements*.txt`) los toca solo quien orquesta. Contratos congelados:
`transcribir()`, `LLMClient.complete()`, `Reporte`, `ReportStore`/`VectorIndex`, y los endpoints de la API.
