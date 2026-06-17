# Engineering Project — Plan de Implementación (M1→M4)

**Proyecto:** *CuidaVoz* · Continúa `02_project_plan.md`. Ver `01_system_spec.md` para la arquitectura y el contrato del reporte.

Este documento es el plan **operativo** para llevar el sistema de *esqueleto con stubs* (M0, ya validado) a un sistema **funcional end-to-end** (M1→M4). Está escrito para ejecutarse bajo un modelo **orquestador + subagentes**, que es el mismo patrón de trabajo paralelo que propone el plan de proyecto (un dueño por módulo, detrás de interfaces estables).

> **Estado (16-jun-2026):** Fases 0→4 implementadas y verificadas — `pytest -q` → 28 verdes (offline/mock) y flujo real (Whisper + persistencia + RAG) corriendo end-to-end. Pendiente único del gate final: el build de Docker en vivo (requiere levantar Docker Desktop; `Dockerfile`/`compose` y `.dockerignore` ya listos).

---

## 0. Punto de partida (verificado)

- ✅ **M0 corre de verdad**: el grafo LangGraph se ejecuta end-to-end con stubs; los 2 smoke tests pasan (`pytest -q`).
- ✅ Entorno: **Python 3.11** disponible (`py -3.11`); venv en `elderly-care-system/.venv`.
- ✅ Único módulo con lógica real: `alert.py` (detección por palabras de riesgo).
- ⏳ Todo lo demás es stub: ASR, LLM/reporte, persistencia, RAG/Q&A, Telegram.

**Decisiones de alcance (acordadas):**
1. **Alcance:** M1→M4 completo (pipeline + alertas + persistencia + RAG/Q&A + Telegram + UX), desglosado en fases con *gates* de verificación.
2. **LLM:** implementar el cliente real (Anthropic) **detrás de la interfaz** + un **modo `mock`** que devuelve fixtures deterministas, para testear y demostrar **sin gastar API**. El equipo corre el camino real con su propia key.
3. **ASR:** **faster-whisper real** ya en esta tanda, con métrica de confianza.

---

## 1. Modelo de orquestación

```
ORQUESTADOR (yo)
  ├─ Fase 0: fundaciones + congelar contratos  (archivos compartidos — los toca solo el orquestador)
  ├─ Fase 1..4: fan-out de SUBAGENTES, uno por módulo, sobre archivos DISJUNTOS
  └─ Gate de integración tras cada fase: correr el end-to-end + tests
```

**Regla de oro para paralelizar sin conflictos:** cada subagente edita **solo sus archivos**. Los archivos compartidos (`schemas.py`, `config.py`, `state.py`, `requirements.txt`, contratos nuevos) los modifica **únicamente el orquestador** en la Fase 0. Si un subagente necesita un cambio en un archivo compartido, lo pide y el orquestador lo aplica.

**Mapa módulo → archivos → dueño (subagente):**

| Subagente | Rol (spec) | Archivos propios |
|---|---|---|
| **B — ASR** | transcripción | `src/pipeline/asr.py`, `src/agents/transcription.py` |
| **C — Reporte** | generación de reporte | `src/agents/report.py` (usa el `LLMClient` ya congelado en Fase 0) |
| **D — Datos** | alertas + memoria + RAG + Q&A | `src/agents/alert.py`, `src/agents/memory.py`, `src/agents/caregiver_qa.py`, `src/storage/*` |
| **E — Interfaz** | ingestión + frontend | `src/ingestion/telegram_bot.py`, `frontend/app.py` |

---

## 2. Contratos congelados en Fase 0 (las interfaces estables)

Estos son los límites que hacen posible el trabajo paralelo. No cambian sin acuerdo.

1. **ASR** — `asr.transcribir(audio_path: str) -> Transcripcion(texto: str, confianza: float)`
2. **LLM** — `LLMClient(model).complete(system, user, json_mode: bool) -> str`; soporta `LLM_PROVIDER ∈ {anthropic, mock}`.
3. **Reporte** — el esquema Pydantic actual (`schemas.Reporte`) es el contrato central; no se toca.
4. **Almacenamiento** *(nuevo)* — `src/storage`:
   - `ReportStore.guardar(elder_id, reporte) -> None`
   - `ReportStore.listar(elder_id, limite=30) -> list[ReporteGuardado]`
   - `VectorIndex.indexar(elder_id, reporte) -> None`
   - `VectorIndex.buscar(elder_id, consulta, k=5) -> list[ReporteGuardado]`
5. **API** — `GET /health`, `POST /reportes`, `POST /consultas`, y *(nuevo)* `GET /reportes/{elder_id}` (historial para el timeline del dashboard).

---

## 3. Fases y criterios de "hecho"

### Fase 0 — Fundaciones (orquestador) — *desbloquea todo*
- [ ] Instalar **todas** las dependencias en el venv y validar que importan en Windows/3.11 (riesgo: `ctranslate2`, `chromadb`).
- [ ] Modo **`mock`** del `LLMClient` (fixtures deterministas para reporte y Q&A) → tests sin red.
- [ ] Infra de test: `conftest.py` que fuerza `LLM_PROVIDER=mock` y usa DB/Chroma temporales; nada de red en CI.
- [ ] Definir interfaz de `src/storage` (stubs con las firmas del §2) + endpoint `GET /reportes/{elder_id}`.
- [ ] **Fixture de audio** real corto (es-AR) para probar Whisper de verdad.
- [ ] Skill de proyecto `cuidavoz-dev` (cómo levantar venv, tests, API/UI, mock vs real).
- **Done:** `pytest -q` pasa con el modo mock; todas las deps importan; contratos congelados.

### Fase 1 — M1: voz→reporte real
- [ ] **B (ASR):** `faster-whisper` real + confianza derivada de `avg_logprob`; degradar con gracia si baja.
- [ ] **C (Reporte):** `LLMClient` real (anthropic) + prompt del reporte (fiel, anti-alucinación) + parseo/validación JSON robusto + array `claims` con `fuente_textual`.
- **Done:** un audio real → `Reporte` válido y fiel (probado con mock en CI; con Claude real manualmente). Test de faithfulness básico (los `claims` citan substrings de la transcripción).

### Fase 2 — M2: alertas + persistencia
- [ ] **D (alertas):** mantener reglas (red de seguridad) + pase del LLM liviano para severidad baja/media.
- [ ] **D (memoria):** `ReportStore` sobre SQLite; `memory.run` guarda; disparar notificación si hay severidad alta.
- **Done:** los reportes se guardan e historizan; `GET /reportes/{elder_id}` los devuelve; alertas de dos capas.

### Fase 3 — M3: RAG + Q&A
- [ ] **D (RAG):** `VectorIndex` sobre Chroma; indexar resumen/claims al persistir.
- [ ] **D (Q&A):** `caregiver_qa.run` recupera contexto real y responde fundamentado (sin inventar).
- **Done:** "¿cómo durmió esta semana?" devuelve una respuesta basada en reportes reales del historial.

### Fase 4 — M4: ingestión Telegram + UX
- [ ] **E (Telegram):** bot que escucha voz, baja el `.ogg`, postea a `/reportes`, responde resumen+alertas.
- [ ] **E (frontend):** dashboard pulido — timeline del historial, alertas resaltadas, chat de Q&A.
- **Done:** mensaje de voz por Telegram dispara el pipeline; el dashboard muestra timeline + alertas + chat.

### Gate final (orquestador)
- [ ] `docker-compose up` levanta API + UI; smoke test end-to-end ampliado pasa; README/docs actualizados.

---

## 4. Riesgos y mitigaciones

- **Wheels de ML en Windows/3.11** (`ctranslate2`, `chromadb`, `onnxruntime`): se valida en Fase 0; si falla, fijar versión o documentar correr en WSL/Docker.
- **Costo de API:** el modo `mock` permite todo el desarrollo y la demo sin gastar; el camino real queda detrás de la interfaz.
- **Whisper lento en CPU:** usar `tiny`/`base` para la demo; documentar el trade-off (insumo del research).
- **Conflictos de edición entre subagentes:** evitados por la regla de archivos disjuntos + contratos congelados.
- **Faithfulness:** el prompt instruye a no completar; los `claims` con `fuente_textual` permiten verificar/rechazar afirmaciones sin respaldo.
