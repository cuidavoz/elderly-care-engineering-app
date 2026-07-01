# P18 — Roadmap paso a paso (hasta funcional, con tests y evaluación)

Objetivo final: **el adulto abre `/elder` (o recibe una notificación) y ve una pregunta contextual sobre
algo que contó en las últimas 24 h; la responde con un audio y eso alimenta el pipeline** — con tests y
evaluaciones que garanticen que el agente elige bien, no repite, no da consejo médico y degrada seguro.

Convención: cada paso tiene **entregable** y **cómo se verifica**. Marcá los `[ ]` al avanzar.

---

## ✅ Ya hecho (punto de partida)
- [x] Agente `followup.py` (coordinador + Selector + Redactor), provider-agnóstico, ventana **24 h** con
      "hace cuánto" + franja del día. Nunca rompe (degrada a "no preguntar").
- [x] Skill de política `agents/skills/seguimiento/SKILL.md`.
- [x] Migración `0012_followups.sql` (tabla + RLS) — **falta aplicarla a la base**.
- [x] `store.py` / `postgres.py` exponen `creado_en` (timestamp real).
- [x] Config `llm_model_followup` (hook de migración a modelo propio).
- [x] Spec `spec-p18-agente-seguimiento.md`.

---

## Fase 0 — Cimiento: tests + evaluación del agente (antes de cablear nada)
*Meta: poder confiar en el agente y detectar regresiones. Acotado a lo que P18 necesita (no una
plataforma de observabilidad completa).*

- [ ] **0.1 Tests unitarios de lo determinista** — `tests/test_followup.py`.
  - Ventana de 24 h: reportes fuera de las 24 h se excluyen; dentro, se incluyen.
  - Etiqueta "hace" (`_hace_texto`) y franja (`_franja_del_dia`) con timestamps fijos.
  - Parseo defensivo (`_severidad_o_none`, `_momento_o_none`, `_str_o_none`).
  - Camino "no molestar": si el Selector devuelve `preguntar=false` → `decidir_seguimiento` = `None`.
  - Resiliencia: si el LLM tira excepción o JSON basura → `None` (nunca explota).
  - **Verificación:** `pytest tests/test_followup.py` en verde. LLM mockeado con JSON canned
    (monkeypatch de `LLMClient.complete`) para que sea determinista.
- [ ] **0.2 Golden set de escenarios** — `eval/followup_casos.json` (~10-15 casos).
  - Cada caso: `reportes_ultimas_24h` + `preguntas_ya_hechas` + **esperado** (severidad elegida, o
    "no_preguntar", o "no_repetir_tema_X"). Incluir casos borde: nada reciente, alerta ALTA presente,
    solo algo cotidiano, tema ya preguntado ayer, evento con hora ("cena a las 21").
  - **Verificación:** el archivo carga y valida contra un schema.
- [ ] **0.3 Harness de evaluación offline** — `eval/eval_followup.py`.
  - Corre el agente sobre cada caso y mide: **acierto de severidad**, **tasa de abstención correcta**
    (no preguntar cuando corresponde), **no-repetición** (no elige un tema ya preguntado), **seguridad**
    (la pregunta no da consejo/diagnóstico médico → chequeo por reglas + LLM-judge), **timing razonable**
    (no preguntar "durante" un evento). Imprime una tabla de métricas.
  - Dos modos: **mock** (determinista, CI) y **real** (Claude, para números de calidad).
  - **Verificación:** `python -m eval.eval_followup` imprime la tabla; guardás el baseline.
- [ ] **0.4 Traza mínima** — logging estructurado por corrida del agente (decisión, severidad, momento,
      si preguntó o no, latencia). Opcional: persistir en una tabla `agent_runs` más adelante.
  - **Verificación:** corrés el agente y ves en el log qué decidió y por qué.

---

## Fase 1 — Agente funcional dentro de la app (sin notificaciones aún)

- [ ] **1.1 Aplicar la migración** `0012_followups.sql` a Supabase (SQL editor o `db push`).
  - **Verificación:** la tabla `followups` existe con su RLS (query de control).
- [ ] **1.2 Storage de followups** — funciones en `postgres.py` (y `store.py` para dev):
  - `guardar_followup(elder_id, decision)` → inserta, **superseding** el `pendiente` anterior
    (marca el viejo `descartada`) para no saturar; traduce `momento` → `programada_para`.
  - `pregunta_pendiente(elder_id)` → la vigente (o None).
  - `ultimas_preguntas(elder_id, n)` → para el dedup del Selector.
  - `marcar_respondida(followup_id)`.
  - **Verificación:** tests de storage (`tests/test_followup_store.py`) contra una DB de prueba:
    insertar → leer pendiente → superseder → marcar respondida.
- [ ] **1.3 Servicio de orquestación** — `generar_followup(elder_id)`:
  - lee `ultimas_preguntas` → llama `decidir_seguimiento(elder_id, preguntas_recientes=...)` →
    si hay decisión, `guardar_followup`. Si `None`, no hace nada.
  - **Verificación:** test de integración con reportes sembrados en SQLite + LLM canned →
    asserts (crea followup / no crea cuando corresponde / no repite).
- [ ] **1.4 Endpoint + disparo** — en `api/main.py`, `POST /elders/{id}/followup` protegido por
      `X-Internal-Token`; y un **scheduler** (cron 1×/día por elder, o al persistir un reporte) que lo llama.
  - El **dispatcher** decide qué "pendiente" mostrar según `programada_para` (no antes del momento).
  - **Verificación:** test del endpoint (auth OK / 401 sin token / crea followup). Simular `ahora`
    para chequear que respeta el momento.
- [ ] **1.5 Web `/elder`** — leer la `pregunta pendiente` (supabase client, RLS) y mostrarla **arriba del
      botón** (reemplaza el texto genérico). Al responder con audio, el backend marca `respondida`.
  - Ojo Next 16: leer `node_modules/next/dist/docs/` antes de tocar el server component.
  - **Verificación:** manual con el skill `/verify` + a ojo en el navegador: aparece la pregunta;
    tras responder, desaparece.
- [ ] **1.6 Prueba end-to-end (Fase 1 completa)**:
  - Grabar un audio con un evento ("hoy almuerzo con amigos") → correr `generar_followup` →
    ver en `/elder` "¿Cómo te fue en el almuerzo con tus amigos?" → responder → verificar que se marca
    `respondida` y que aparece el reporte nuevo.
  - **Verificación:** checklist manual + revisar la fila en `followups` (estado) y el reporte nuevo.

**Al terminar la Fase 1, P18 ya es funcional en la app** (sin push): la pregunta del día aparece al abrir.

---

## Fase 2 — Notificación al celular

- [ ] **2.1 PWA instalable** — `manifest` (nombre, iconos, `display: standalone`) + service worker básico.
  - **Verificación:** en iPhone, Safari → "Agregar a inicio"; abre en modo app.
- [ ] **2.2 Web Push** — claves **VAPID**, botón "Activar notificaciones" (desde la PWA instalada), guardar
      la suscripción por elder, backend con librería `web-push` que envía cuando el dispatcher marca
      `enviar` (según `programada_para`).
  - **Verificación:** suscribir un device de prueba → disparar → llega la notificación → al tocarla abre
    `/elder` con la pregunta. (iOS 16.4+, solo como PWA instalada.)
- [ ] **2.3 (Recomendado) Canal WhatsApp/SMS** (p. ej. Twilio) como aviso más robusto para un adulto mayor
      (no requiere instalar/PWA). Comparte la "infra de avisos" con P10/P12/P13/P14.
  - **Verificación:** enviar un mensaje de prueba y confirmar recepción.
- [ ] **2.4 Prueba en iPhone real** — instalar, activar, recibir el aviso a la hora elegida, tocar → abre
      la pregunta. Reintentos/errores de envío manejados.

---

## Fase 3 — Opcional / hardening (post-objetivo)
- [ ] Benchmark **Claude vs modelo propio** (local en la VM) con el harness de 0.3; migrar `llm_model_followup`
      si los números lo justifican (constrained decoding para el JSON).
- [ ] Agente **Revisor/seguridad** que gatee la pregunta antes de salir (clona `faithfulness_evaluator`).
- [ ] Traza persistente (`agent_runs`) + panel de métricas.

---

## Estrategia de tests y evaluación (transversal)
- **Unitarios** (rápidos, en CI, LLM mockeado): lógica determinista (ventana 24 h, "hace", parseo,
  no-molestar, resiliencia) + storage (insertar/superseder/leer/responder).
- **Integración** (LLM canned o mock): `generar_followup` end-to-end sobre reportes sembrados.
- **Evaluación de calidad** (`eval/eval_followup.py`, con Claude real sobre el golden set): severidad
  correcta, abstención correcta, no-repetición, seguridad (sin consejo médico), timing razonable →
  **tabla de métricas** que se guarda como baseline y se re-corre ante cualquier cambio de prompt/modelo.
- **Manual E2E** (skill `/verify`): el flujo real en `/elder` (Fase 1) y en el iPhone (Fase 2).

**Definition of Done:** P18 corre 1×/día, elige un tema relevante de las últimas 24 h (o decide no
molestar), lo muestra en `/elder` (y notifica en Fase 2), el adulto responde y realimenta el pipeline; y el
harness de evaluación reporta métricas dentro del umbral acordado, con los tests unitarios/integración en verde.

## Orden sugerido de ataque
**0.1 + 0.2 + 0.3 (tests + golden set + harness)** → **1.1–1.3 (storage + servicio)** →
**1.4–1.6 (endpoint + `/elder` + E2E)** → **Fase 2 (notificaciones)** → **Fase 3 (opcional)**.
