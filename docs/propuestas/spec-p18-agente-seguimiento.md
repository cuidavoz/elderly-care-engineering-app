# P18 — Agente de seguimiento proactivo (spec)

## Qué es
Un agente que, **una vez por día**, mira lo que el adulto mayor contó recientemente, **elige UN tema**
para hacerle seguimiento (priorizando severidad **alta → media → baja**), decide **cuándo** preguntarlo,
y **redacta una pregunta cálida y corta**. Esa "pregunta del día" aparece arriba del botón en `/elder`
(y, en Fase 2, llega como notificación). El adulto responde con un audio → arranca el pipeline normal.

## De qué se encarga / de qué NO
- **Sí:** revisar historial reciente → decidir si hoy conviene preguntar (puede decidir *no molestar*) →
  elegir tema+severidad → decidir el momento → redactar la pregunta → dejarla lista.
- **No:** generar el reporte (pipeline de audio), dar diagnósticos, decidir alertas clínicas (`alert`),
  responder a la familia (`caregiver_qa`), transcribir.

## Arquitectura (vocabulario de la cátedra: `Agente = LLM + Tools + Loop + Memoria`)
Coordinador `decidir_seguimiento(elder_id)` que delega en subagentes especializados (mismo Haiku,
distinto prompt/rol):
- **🎯 Selector** — mira el contexto reciente y decide `{preguntar, tema, severidad, momento}`
  (structured output, enum cerrado). Acá vive la prioridad por severidad + el timing.
- **✍️ Redactor** — toma el tema y escribe la pregunta cálida (voz para adulto mayor).
- **🛡️ Revisor (opcional, futuro)** — chequea que no sea inapropiada / consejo médico. Molde:
  clonar `faithfulness_evaluator.py`.

**Comunicación entre agentes:** por **datos compartidos + evento**, no por llamadas directas. El pipeline
deja reportes/alertas/flag `notificar`; este agente los consume y deja una fila en `followups`; el web la
lee y el audio de respuesta realimenta el pipeline → **loop diario cerrado**.

## Timing: lo decide el agente, lo ejecuta la infra
El Selector devuelve un `momento` acotado (enum): `despues_del_evento | esta_noche | manana_a_la_manana |
en_2h | hora_puntual(HH:MM)`, con fallback sensato si el horario es vago. El agente **NO espera**: emite
"mandar a las X" y un **dispatcher** (cron liviano) lo ejecuta cuando llega el momento. Guardrails: ventana
≤ ~24-36h, horarios sensatos, máx 1/día, no repetir lo de ayer.

## Modelo de datos — tabla `followups` (Supabase/Postgres)
`id, elder_id, family_id, pregunta, tema, severidad(alert_severity), momento, programada_para,
fuente_report_id, estado(pendiente|enviada|respondida|descartada), created_at`. RLS: `is_family_member`
(cubre al propio adulto, que es family_member). El backend escribe con service role; el web (`/elder`) lee
por RLS. Migración: `0012_followups.sql`.

## Provider-agnóstico + escenario de migración a modelo propio (decidido: probable)
- El agente usa `LLMClient` (que ya tiene el switch `provider`) con el modelo `settings.llm_model_followup`
  → **migrar SOLO este agente a un modelo propio = cambiar esa config + agregar el provider en
  `pipeline/llm.py`**; el módulo del agente NO cambia.
- El structured output se define con schema portable (Pydantic + JSON) → si mañana corre en un modelo
  local, se fuerza con guided/constrained decoding sin reescribir el agente.
- Camino recomendado: Claude ahora; benchmark local vs Claude con el harness de eval (P6) antes de migrar.

## Reuso (no repetir trabajo, estructura conectada)
- **Memoria / leer historial:** `get_report_store().listar(elder_id)` (misma que `digest.py`).
- **Severidad / qué priorizar:** las alertas ya vienen con severidad (`alert.py`); se consumen, no se
  recomputan.
- **Prosa / parseo defensivo:** patrón de `digest._prosa_llm` + `pipeline.parsing.extraer_json`.
- **Molde LLM-as-judge (Revisor):** `faithfulness_evaluator.py`.
- **Disparo del aviso:** el flag `state["notificar"]` de `memory.py` (hoy huérfano) → este flujo lo consume.

## Fase 1 (sin nada de iOS) — checklist
- [x] Migración `0012_followups.sql` (tabla + RLS).
- [x] Skill de política `agents/skills/seguimiento/SKILL.md`.
- [x] Config `llm_model_followup` (hook de migración).
- [x] Agente `agents/followup.py` (Selector + Redactor, provider-agnóstico, devuelve `SeguimientoDecision`).
- [ ] Storage: función para insertar/superseder un followup (postgres.py) + leer últimas preguntas.
- [ ] Endpoint backend `POST /elders/{id}/followup` (protegido X-Internal-Token) + dispatcher/cron.
- [ ] Web: mostrar la "pregunta del día" arriba del botón en `/elder` y limpiar al responder.
- [ ] (Fase 2) PWA + Web Push / WhatsApp como canal de aviso.

## Fase 2 — notificación (resumen)
Notificación al celu en iPhone = **solo como PWA instalada** ("Agregar a inicio", iOS 16.4+): requiere
manifest + service worker + suscripción VAPID + backend `web-push`. Alternativa más robusta para adulto
mayor: **WhatsApp/SMS**. Esta infra de avisos es un habilitador compartido con P10/P12/P13/P14.
