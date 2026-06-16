# CuidaVoz — Sistema multi-agente de cuidado remoto de adultos mayores

Un adulto mayor manda un mensaje de voz diario; el sistema lo transcribe (Whisper),
genera un **reporte estructurado** (salud, sueño, ánimo, actividad, alertas) con un LLM,
detecta señales de riesgo, lo guarda, y le permite al familiar consultar el historial
en lenguaje natural.

Este repo es el *engineering project* de la materia Procesamiento del Lenguaje Natural.
El *research project* (estudio de faithfulness del pipeline voz→reporte) vive en
`../../research/`.

## Arquitectura (resumen)

```
Audio ─► Ingestión ─► Orquestador (LangGraph) ─► Transcripción ─► Reporte ─► Alertas ─► Persistencia ─► Notificación
Familiar ─► API/Frontend ─► Orquestador ─► Agente Q&A (RAG sobre el historial)
```

Spec completo: `../docs/01_system_spec.md` · Plan: `../docs/02_project_plan.md`

## Estado

Scaffolding. El flujo end-to-end corre con **stubs** (datos falsos) para poder
desarrollar cada módulo en paralelo. Cada `TODO` marca lo que falta implementar.

## Estructura

```
src/
  config.py            # configuración (env vars)
  schemas.py           # esquema Pydantic del reporte (contrato central)
  pipeline/
    asr.py             # wrapper de faster-whisper  [Integrante B]
    llm.py             # cliente LLM desacoplado     [Integrante C]
  orchestrator/
    state.py           # estado del grafo
    graph.py           # grafo LangGraph (routing)   [Integrante A]
  agents/
    transcription.py   # nodo: audio -> texto        [Integrante B]
    report.py          # nodo: texto -> reporte      [Integrante C]
    alert.py           # nodo: reporte -> alertas     [Integrante D]
    memory.py          # persistencia + vector store [Integrante D]
    caregiver_qa.py    # Q&A del familiar (RAG)        [Integrante D]
  ingestion/
    telegram_bot.py    # mensajes de voz por Telegram [Integrante E]
  api/
    main.py            # FastAPI                       [Integrante A/E]
frontend/
  app.py               # dashboard Streamlit          [Integrante E]
tests/
  test_smoke.py        # smoke test end-to-end
```

## Quickstart (local)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # completar claves
make run-api                  # API en http://localhost:8000/docs
make run-ui                   # dashboard en http://localhost:8501
make test                     # smoke test
```

## Con Docker

```bash
docker compose up --build     # levanta API + frontend
```
