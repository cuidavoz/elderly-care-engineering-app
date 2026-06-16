# Engineering Project — Plan de Proyecto

**Proyecto:** *CuidaVoz* · 5 integrantes · Ver `01_system_spec.md` para la arquitectura.

## 1. Estrategia

El sistema está diseñado para que los módulos se construyan **en paralelo** detrás de interfaces estables. El orden de prioridad es: primero un *esqueleto end-to-end que corre con stubs* (devuelve datos falsos pero el flujo completo funciona), y recién después se reemplaza cada stub por su implementación real. Así siempre hay una demo que funciona y la integración no se posterga al final.

## 2. Milestones

| # | Milestone | Criterio de "hecho" |
|---|---|---|
| M0 | Repo y esqueleto | `docker-compose up` levanta API + frontend; el grafo corre end-to-end con stubs. |
| M1 | Pipeline voz→reporte real | Un audio real produce un reporte estructurado válido (Whisper + LLM reales). |
| M2 | Alertas + persistencia | Reportes guardados; alertas detectadas con reglas + LLM; historial visible. |
| M3 | Q&A del cuidador (RAG) | El familiar pregunta sobre el historial y obtiene respuestas fundamentadas. |
| M4 | Ingestión Telegram + UX | Mensaje de voz por Telegram dispara el pipeline; dashboard pulido. |
| M5 | Robustez + demo + docs | Manejo de edge cases, tests, README reproducible, demo grabada/en vivo. |

## 3. División de trabajo (propuesta)

Las áreas se mapean a los módulos del spec. Son responsables, no compartimentos estancos.

- **Integrante A — Orquestación e integración.** Grafo LangGraph, estado, routing, manejo de errores, `docker-compose`. Dueño del esqueleto end-to-end (M0).
- **Integrante B — ASR / pipeline de transcripción.** `faster-whisper`, normalización de audio, métrica de confianza. Punto de contacto con el research (el research necesita correr varios tamaños de Whisper).
- **Integrante C — Generación de reporte.** Diseño de prompts, esquema Pydantic, validación, el array `claims`. Comparte trabajo con el research (estrategias de prompt).
- **Integrante D — Alertas + memoria/RAG + Q&A.** Reglas de alerta, persistencia, vector store, agente de consultas del familiar.
- **Integrante E — Ingestión + frontend + UX + evaluación de robustez.** Bot de Telegram, dashboard Streamlit, edge cases, tests de smoke, demo.

> Nota: B y C son justamente quienes más se solapan con el research project, lo que conviene para reaprovechar trabajo (correr Whisper, diseñar prompts).

## 4. Cronograma sugerido (ajustar a las fechas reales de la cátedra)

Asumiendo ~6 semanas de trabajo efectivo:

- **Sem 1:** M0 — esqueleto corriendo con stubs. Acordar contratos (esquema del reporte, interfaces).
- **Sem 2:** M1 — transcripción y reporte reales.
- **Sem 3:** M2 — alertas y persistencia.
- **Sem 4:** M3 — RAG y Q&A.
- **Sem 5:** M4 — Telegram y UX.
- **Sem 6:** M5 — robustez, tests, documentación, demo. Buffer.

## 5. Riesgos y mitigaciones

- **WhatsApp/Telegram bloqueado o complejo →** la ingestión está detrás de una interfaz; fallback: subir el audio por la API/Streamlit directamente para la demo.
- **Latencia de Whisper en CPU →** usar modelos chicos para la demo; documentar el trade-off (esto es además un hallazgo del research).
- **Costo de API del LLM →** modelos chicos para Q&A y alertas, modelo grande solo para el reporte; cachear; límite de tokens.
- **Integración tardía →** mitigado por el orden "esqueleto primero". Cada PR debe pasar el test de smoke end-to-end.

## 6. Definición de "demo lista"

Un familiar abre el dashboard, ve el reporte de hoy generado a partir de un audio real enviado por Telegram, con una alerta resaltada, y le pregunta al sistema "¿cómo viene durmiendo esta semana?" obteniendo una respuesta correcta basada en el historial — todo levantado con un solo `docker-compose up`.
