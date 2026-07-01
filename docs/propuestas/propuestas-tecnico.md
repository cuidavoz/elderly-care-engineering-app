# CuidaVoz — Propuestas (versión técnica)

> Documento de trabajo. Cruza las 6 propuestas originales con lo que vimos en la cursada
> (RAG/IR, agentes/subagentes, Skills/MCP, agente→producción, training/reasoning) y suma
> features nuevas. Cada propuesta: **qué es · qué aporta · cómo (arquitectura) · esfuerzo ·
> riesgos · valor demo/académico**. Pensado para la presentación (~11-jul-2026).
>
> Estado base de CuidaVoz: FastAPI + LangGraph; agentes Claude Haiku 4.5; pipeline de audio
> `transcription (Groq Whisper) → specialists (health + wellbeing, EN SECUENCIA) → synthesizer
> → faithfulness_evaluator (loop con reintentos: FActScore substring + LLM-judge) → alert →
> persist`. RAG con pgvector **pero embeddings son un placeholder de hashing MD5** (no
> semánticos). Q&A para la familia + digest semanal abstractivo. Restricciones duras: **Vercel
> Hobby corta a 60s**, **Render free 512MB RAM**, el audio es efímero.

---

## P0 — La pregunta de fondo: ¿"agentes propios" = entrenar un modelo? ¿API o local?

Esto hay que tenerlo clarísimo porque cambia todo el encuadre del proyecto.

### Agente ≠ Modelo
- **Modelo** = el "cerebro" pre-entrenado (Claude, Whisper, BERT). Entrenarlo cuesta GPUs y datos.
- **Agente** = el **programa que vos escribís alrededor de un modelo**. La cátedra lo define como
  `Agente = LLM + Tools + Loop + Memoria` (Intro Agentes). Un **subagente especializado** es el
  **mismo modelo con distinto system prompt + rol + tools** (patrón SciAgents).
- **"Crear nuestros propios agentes" = escribir esa orquestación** (prompts, tools, subagentes,
  flujos, MCP, memoria). **NO es entrenar un modelo.** CuidaVoz **ya tiene agentes propios**
  (`health_agent`, `wellbeing_agent`, `synthesizer`, `faithfulness_evaluator`): son código nuestro
  sobre el modelo Claude. Lo "propio" y lo que la cátedra evalúa es la **arquitectura agéntica**,
  no el modelo de abajo.
- **Dato clave:** TODA la práctica de la cursada (zonaprop `orchestrator.py`, `from_agent_to_production`)
  corre sobre **Claude por API + orquestación propia**. Usar la API para el LLM no es "hacer trampa":
  es el patrón estándar que enseñaron.

### Entonces, ¿"no usar todo por API"? Tres niveles distintos
1. **El LLM cerebro (Claude):** conviene **API**. Las *scaling laws / Chinchilla* (Clase 7) dicen que
   un modelo chico bien-prompteado alcanza para tareas acotadas; entrenar uno propio para reemplazar
   a Haiku **no mejora** y necesita GPU + hosting (no entra en Render 512MB). El camino de mejora es
   prompting/CoT/inference-time + buena arquitectura agéntica, no entrenar params.
2. **Modelos chicos especializados (NO LLMs) corriendo local:** acá SÍ tiene sentido "lo propio" y
   es factible. No se codean desde cero: se bajan pre-entrenados de HuggingFace y se usan en 1-2 líneas
   (`sentence-transformers`, `transformers`). Ejemplos viables en CPU (Clase 9 muestra DistilBERT 66M
   corriendo en CPU):
   - **Embeddings** para el RAG (`all-MiniLM`, `multilingual-e5-small`, o **FastText español**). → P1/P9.
   - **Clasificadores** (intención, sentimiento, NER) con DistilBERT/MiniLM. → P3/P10/P15.
   - *Caveat RAM:* Render free ya tiene `whisper-tiny` cargado; meter otro modelo en 512MB es ajustado
     → **medir**, o correrlo en el worker (ver P16) o vía API de embeddings (OpenAI/Voyage).
3. **Entrenar/fine-tunear tu propio LLM generativo** (lo del repo `thinking-model`: SFT + GRPO con
   `unsloth`/`trl`/LoRA/vLLM): **posible pero pesado** — necesita GPU (Colab/Kaggle), pesa GB, y
   hostearlo no entra en la infra actual. Para CuidaVoz como "cerebro": fuera de scope. **Pero** si
   quieren tocar entrenamiento para la nota, se puede hacer **una destilación chica OFFLINE** como
   demo puntual (ej.: destilar un mini-clasificador de alertas a partir de etiquetas generadas por
   Claude Opus = "teacher") y mostrarla, aunque no esté en prod.

### ¿Las clases lo nombran? Sí, explícitamente
- **Cómo entrenar/crear un modelo propio:** Clase 6 (Instruction Tuning, SFT, RLHF, PPO, DPO),
  Clase 7 (Reasoning, GRPO), Clase 9 (Distillation) + notebooks `PPO_DPO`, `GRPO`,
  `Instruction_Base_Models` + el repo `thinking-model`. Eso es entrenar un **MODELO**.
- **Cómo crear agentes/subagentes (lo que sí va para CuidaVoz):** toda la práctica Agentic AI
  (clases 9-15), Clase3B (subagentes/Skills/MCP), Clase4 (harness), zonaprop, agent-to-production.

### Recomendación honesta para CuidaVoz
"Hacer lo nuestro" = **construir la arquitectura agéntica** (orquestador + subagentes especializados +
MCP + Skills + flujos que conversan) **sobre Claude API**, y meter **1-2 modelos chicos locales** donde
aportan de verdad (embeddings para el RAG; quizás un clasificador). Entrenar un LLM propio es el camino
más caro y de menor retorno dado el infra. Si quieren mostrar entrenamiento, que sea una **distilación
chica offline** como pieza académica, no el cerebro del sistema.

---

## Parte 1 — Mejoras al "cerebro" actual (NLP core)

### P1 — RAG híbrido (denso + BM25/full-text + RRF) · [reformula la propuesta #2]
- **Qué es:** reemplazar el embedding placeholder (hashing MD5 bag-of-words) por **búsqueda híbrida**:
  un retriever **denso** (embeddings semánticos reales) + un retriever **léxico** (BM25 / Postgres
  full-text `tsvector`), **fusionados con Reciprocal Rank Fusion (RRF, k=60)**.
- **Qué aporta:** hoy si el reporte dice "se despierta de noche" y la familia pregunta "¿cómo viene
  el descanso?", el sistema no encuentra nada (no comparten palabras). El denso captura sinónimos
  /parafraseo; el léxico (BM25) gana en términos exactos (nombres de remedios, dosis, fechas). RRF
  los combina **por ranking, sin normalizar escalas**. Es el patrón canónico del curso.
- **Cómo:** portar `IR_RAG/components/` casi tal cual: `fusion.py` (RRF), `keyword_search.py` (BM25
  sobre los mismos `doc_id`), `embeddings.py`. En Postgres ya hay pgvector (operador `<=>` coseno) y
  `tsvector/ts_rank` para el léxico → ambas búsquedas sobre los mismos chunks, top 20-50 c/u, fusión
  RRF, top-k a Haiku. **Embedder real:** OpenAI `text-embedding-3-small` (1536-dim = **cero migración**
  de la columna, ~$0) o Voyage multilingüe; alternativa local FastText-es/MiniLM (ver P9, ojo RAM).
  Filtrar SIEMPRE por `elder_id` + ventana temporal **antes** del retrieval (privacidad + precisión).
  **Backfill obligatorio:** reindexar los reportes (los vectores hashing viejos son incomparables).
- **Esfuerzo:** bajo-medio (el código existe; el costo es backfill + elegir proveedor).
- **Riesgos:** RAM si se va local; calidad en español (usar modelo multilingüe); backfill.
- **Valor:** ⭐ alto y **medible** (recall@k / MRR híbrido vs hashing, con `evaluation.py`). Demo en
  vivo contundente (misma pregunta con sinónimos: falla vs acierta). Archivos: `storage/postgres.py`,
  `agents/caregiver_qa.py`, `migrations/`.

### P2 — Módulo de evaluación + harness de replay · [propuesta #6]
- **Qué es:** un módulo **offline** que mide la calidad del pipeline con métricas estándar, más un
  **harness de replay** (golden set) que corre en CI sin gastar tokens.
- **Qué aporta:** pasar de "se ve bien" a **números** ("faithfulness 0.94, answer-relevance 0.78,
  context-recall 0.82") que permiten comparar versiones y defender mejoras con evidencia. Es lo que
  separa ingeniería de research para un tribunal.
- **Cómo:** reutilizar `IR_RAG/components/judge.py` (RAGAS: faithfulness por claims atómicos =
  FActScore que ya tenemos, factual_correctness, response_relevancy) cambiando el cliente a Haiku;
  `evaluation.py` (P@k/R@k/MRR/MAP/NDCG) para el retrieval; `eval_synth.py` para generar evals
  sintéticos — incluido **`hallucination_bait`** (preguntas cuya respuesta NO está en los reportes →
  medir que el sistema diga "no hay información" en vez de inventar; **crítico en salud**). El
  **replay** sale de `from_agent_to_production/app/replay/`: capturar N transcripciones reales
  (anonimizadas) con su reporte esperado (claims, alertas, faithfulness) en `events.jsonl` + hashes,
  y reproducir por el grafo con el LLM mock (skill `cuidavoz-dev`) comparando contra baseline.
- **Esfuerzo:** bajo-medio (faithfulness ya está; lo tedioso es armar el dataset etiquetado ~15-30
  casos). No instalar la librería `ragas` (trae deps pesadas); implementar las fórmulas a mano.
- **Valor:** ⭐ alto académico (tabla de métricas), da red de regresión a P3/P5. Archivos nuevos:
  `eval/` + `tests/`.

### P3 — Extracción estructurada de medicamentos y condiciones · [propuesta #4 NER]
- **Qué es:** hoy la medicación es un **booleano** ("tomó / no tomó"). Pasar a capturar **entidades**:
  nombre del medicamento, dosis, frecuencia, condiciones, profesionales mencionados.
- **Qué aporta:** "Tomó Enalapril 10mg y Metformina; refiere hipertensión" + una sección **Historial
  de medicación** (qué fármacos aparecen, cuándo se agregó/cambió una dosis). Valor clínico real.
- **Cómo:** **NO un modelo NER dedicado** (no entra en 512MB y los NER médicos están en inglés). Usar
  el patrón de zonaprop `label_descriptions.py`: **structured output nativo + enum cerrado + abstención
  `sin_dato`** ("si no se menciona claramente → sin_dato, nunca inferir"). Ampliar el schema `Salud`
  (jsonb → **sin migración**), reescribir el prompt del `health_agent` con few-shot es-AR, anclar cada
  entidad a la transcripción vía el guard de faithfulness existente. Agregación del historial en
  `digest.py` (molde `_tendencia_medicacion`).
- **Esfuerzo:** medio (schema + prompt + render + el "historial" en tendencias).
- **Riesgos:** Whisper-tiny transcribe mal nombres de fármacos → no exigir substring exacto en nombres.
- **Valor:** alto y visible; se framea como **NER clínico con verificación de fidelidad**. Archivos:
  `schemas.py`, `agents/health_agent.py`, `web/.../report-card.tsx`.

### P4 — Tendencias longitudinales + resumen verificado · [propuestas #1 + #5]
- **Qué es:** el digest semanal **ya es abstractivo** (agregación determinista + prosa Haiku). Sumarle
  (a) **comparación período-vs-período** ("el sueño mejoró: 5 días buenos vs 2 la semana pasada"),
  (b) un paso de **reflection/faithfulness sobre el propio digest**.
- **Qué aporta:** conecta los puntos en el tiempo (dirección de cambio, rachas) en vez de snapshots; y
  garantiza que la prosa no invente (cada afirmación respaldada por los agregados).
- **Cómo:** principio de zonaprop **"números = código, LLM = narra"**: un script determinista calcula
  deltas/medias móviles/rachas (pandas) sobre dos ventanas; el LLM solo verbaliza esas cifras. El
  paso de verificación clona `faithfulness_evaluator` apuntando a los **agregados** en vez de la
  transcripción. Corre en `/digest` (fuera del request de audio → sin problema de 60s).
- **Esfuerzo:** bajo (el 80% existe; ~40-80 líneas + un evaluador clonado).
- **Valor:** alto demo (historia de evolución) y refuerza la narrativa "mismo verificador, dos veces".
  Archivos: `agents/digest.py`, `web/.../tendencias`, `web/.../resumen`.

### P5 — Detección semántica de cambios entre reportes · [propuesta #3]
- **Qué es:** comparar el reporte nuevo con el anterior y disparar una alerta de **"cambio de tendencia"**.
- **Qué aporta:** captura deterioro **gradual** que ningún reporte individual muestra ("hace 4 días que
  no toma la medicación"; "primer reporte en 5 días que menciona ánimo negativo").
- **Cómo:** dos vías. (a) **Embeddings** (una vez hecho P1): distancia coseno entre embeddings de
  reportes consecutivos por dimensión — Clase 12 da el marco formal (**steering por diferencia de
  medias**, un cambio = desplazamiento direccional). (b) **LLM-juez** (clonando `faithfulness_evaluator`):
  recibe reporte previo + actual y devuelve `{cambio, dimensión, dirección, evidencia}`. Traer el
  previo con `ReportStore.listar(elder_id, limite=1)` (ya existe). **Hacerlo en `/digest`**, no en el
  request de audio (presupuesto 60s). Evaluar con **NDCG graduado** (cambio mayor=3/menor=1/nulo=0).
- **Esfuerzo:** medio.
- **Valor:** alto demo (grabás dos audios contrastantes → salta la alerta). Archivos: `agents/alert.py`
  o nodo nuevo, `schemas.py`.

---

## Parte 2 — Arquitectura agéntica (cómo los agentes conversan entre sí)

### P6 — Subagentes especializados reales (fan-out / fan-in) + paralelizar
- **Qué es:** hoy `health_agent` y `wellbeing_agent` corren **en secuencia** y comparten contexto.
  Reformularlos como **subagentes con contexto aislado** que un coordinador delega en **paralelo**
  (fan-out), y el `synthesizer` ensambla (fan-in) — patrón sec-researcher de Clase3B / zonaprop.
- **Qué aporta:** (1) cada subagente no se "contamina" con el análisis del otro → más fidelidad; (2)
  **paralelismo** → baja latencia (clave por el corte de 60s); (3) pega **justo** en lo que la cátedra
  evalúa ("subagentes especializados"). Era un pendiente del proyecto (specialists secuenciales).
- **Cómo:** son independientes (solo dependen de la transcripción) → lanzarlos concurrentes. Opción
  ligera: `asyncio.gather` de dos llamadas Haiku. Opción "deepagents": coordinador `create_deep_agent`
  con `subagents=[...]`, cada uno con su system prompt/tools/skills. Se puede sumar dinámicamente
  (medicación, sueño, social) sin tocar el grafo.
- **Esfuerzo:** bajo (asyncio.gather) a medio-alto (migrar a deepagents).
- **Valor:** alto académico (es el corazón del énfasis agéntico). Archivos: `orchestrator/graph.py`,
  `agents/`.

### P7 — MCP server de datos + Skills clínicas
- **Qué es:** exponer el acceso a datos del adulto como un **MCP server (FastMCP, read-only)** con tools
  tipadas (`lookup_reporte`, `search_historial`, `tendencia_metrica`, `buscar_alertas_previas`), y sacar
  la metodología clínica de los prompts a **Skills (`SKILL.md`)** versionadas.
- **Qué aporta:** cualquier agente (specialists, caregiver_qa, digest) consume el **mismo contrato** de
  datos en vez de SQL duplicado; un `AuditMiddleware` loguea cada acceso a datos clínicos (trazabilidad
  /compliance — gratis, patrón de `sec_mcp_server.py`). Las Skills permiten versionar criterios clínicos
  sin tocar código (progressive disclosure: el agente abre la skill que matchea). Son **dos unidades
  enteras del programa** (MCP & Multi-Agente; Skills).
- **Cómo:** FastMCP stdio (encaja con el deploy monolítico de Render); envolver `ReportStore`/VectorIndex.
  Skills: `skills/analisis-salud/SKILL.md`, `skills/analisis-medicacion/SKILL.md` con frontmatter + Process
  + Output Format + `references/reglas_clinicas.md`.
- **Esfuerzo:** medio.
- **Valor:** alto académico; desacopla y prepara para Managed Agents.

### P8 — Subagente Crítico / reviewer
- **Qué es:** un nodo extra entre `synthesizer` y `persist` que **revisa** el reporte (fortalezas,
  debilidades, omisiones, rating de calidad) — patrón Crítico de SciAgents.
- **Qué aporta:** QA más allá del faithfulness puro (detecta **omisiones**, no solo alucinaciones).
  Encarna el "varios agentes piensan mejor que uno" de la cátedra.
- **Cómo:** un nodo LangGraph más con system prompt de reviewer (mismo Haiku), reusando el loop de
  reintentos. Puede gatear el persist (si el crítico marca problema grave → reintenta).
- **Esfuerzo:** bajo.
- **Valor:** medio-alto; refuerza el discurso multi-agente.

### P9 — Modelo propio chico y local: embeddings / clasificadores
- **Qué es:** introducir **un modelo propio** (no LLM) corriendo local: un **encoder de embeddings**
  (MiniLM/`multilingual-e5-small`/FastText-es) para P1, y/o un **clasificador** chico (DistilBERT) para
  intención (P10) o pre-screening de alertas.
- **Qué aporta:** es la respuesta concreta a "hagamos algo propio, no todo API". Embeddings locales =
  sin costo por query, control total, y el material de clase los respalda (Clase 1 embeddings; Clase 9
  DistilBERT 66M en CPU). Para una nota: se puede **fine-tunear** uno con datos propios (notebooks del
  curso) como pieza de "modelo entrenado por nosotros".
- **Cómo:** `sentence-transformers` carga el modelo en 2 líneas; generar el vector de cada chunk. **Ojo
  RAM (512MB con whisper-tiny):** correrlo en el **worker** (P16) o en un proceso aparte, o medir y si no
  entra usar API de embeddings. Fine-tune (opcional, offline con GPU) siguiendo `PPO_DPO`/`Instruction_Base_Models`.
- **Esfuerzo:** bajo (usar pre-entrenado) / alto (entrenar/fine-tunear).
- **Riesgos:** RAM; calidad multilingüe; el fine-tune necesita GPU offline.
- **Valor:** alto para el ángulo "modelos propios"; medible contra la API en el harness de P2.

---

## Parte 3 — Features nuevas de producto (acción en el mundo real, flujos conversacionales)

### P10 — Contacto instantáneo por intención ("quiero hablar con mi hija") · [idea del usuario]
- **Qué es:** el adulto dice (o toca un botón y dice) algo como "quiero hablar con Ana" o "llamen a mi
  hijo". Un **agente de intención** detecta el pedido y **dispara una acción real**: llamada/notificación
  al familiar correcto.
- **Qué aporta:** convierte CuidaVoz de "reporta a la familia" a "**conecta** al adulto con la familia en
  el momento" — altísimo valor humano y muy demoable.
- **Cómo:** es el patrón canónico **intención → tool → acción externa** (tool calling = structured output
  de acciones). Flujo: ASR de un audio corto → **clasificador/LLM de intención** (`{intent:
  contactar_familiar, destinatario, urgencia}` con enum cerrado + `sin_dato`) → si `contactar_familiar`,
  un **tool** `notificar_familiar(elder_id, familiar, canal)` que: (a) manda **push/WhatsApp** (o email)
  con "Tu mamá quiere hablar con vos", o (b) **inicia una llamada** vía Twilio Voice / click-to-call.
  Necesita una tabla de contactos por elder + un proveedor de mensajería/telefonía. Para alta urgencia,
  **human-in-the-loop**: confirmar antes de escalar a emergencias.
- **Esfuerzo:** medio (el agente de intención es trivial; lo nuevo es integrar un canal de salida —
  push/WhatsApp es más fácil que telefonía).
- **Valor:** ⭐ muy alto demo y producto. Conecta con el flag `notificar` que hoy nadie consume.

### P11 — Asistente conversacional bidireccional (repregunta)
- **Qué es:** en vez de una sola grabación, un **agente conversacional** que, si el mensaje es pobre o
  ambiguo, **repregunta** ("¿el dolor de rodilla es nuevo? ¿desde cuándo?") hasta tener un reporte rico.
- **Qué aporta:** mejor calidad de datos en origen (más señal para alertas/tendencias) y experiencia más
  natural y cálida para el adulto.
- **Cómo:** un loop agéntico (perceive→decide→act→observe) con **memoria** de la conversación: el agente
  evalúa si tiene suficiente info (structured output `{suficiente: bool, repreguntas: [...]}`) y, si no,
  genera audio de vuelta (TTS) o texto, hasta cerrar. Tope de turnos. Reusa el patrón loop + memoria.
- **Esfuerzo:** medio-alto (maneja turnos de audio bidireccional + TTS).
- **Riesgos:** latencia/costo por turno; UX para adultos mayores (mantenerlo simple).
- **Valor:** alto; muestra agente con loop y memoria "de verdad".

### P12 — Agente de escalamiento / triage de alertas (consume `notificar` + HITL)
- **Qué es:** hoy el pipeline setea `state['notificar']=True` ante alerta ALTA **pero nadie lo consume**.
  Un **agente de escalamiento** que decide **a quién avisar y por qué canal** según severidad, y para
  alertas críticas pide **confirmación humana** antes de notificar a emergencias.
- **Qué aporta:** cierra un cabo suelto real del proyecto; evita falsos positivos alarmantes (HITL) y
  asegura que las alertas reales **lleguen** a alguien.
- **Cómo:** nodo/worker que, ante `notificar`, clasifica (rutina → push al cuidador; crítica → llamada +
  confirmación). HITL con el patrón `interrupt_on` de deepagents (approve/reject) que vimos en Clase3B.
  Reusa el canal de salida de P10.
- **Esfuerzo:** medio.
- **Valor:** alto producto + cierra un pendiente; muestra HITL (unidad de Producción/LLMOps).

### P13 — Recordatorios proactivos + adherencia a medicación
- **Qué es:** a partir de los medicamentos extraídos (P3), un agente **proactivo** que programa
  recordatorios ("¿tomaste la pastilla de la presión?") y registra la respuesta.
- **Qué aporta:** de monitoreo **pasivo** a cuidado **activo**; mejora adherencia (problema clínico real).
- **Cómo:** un scheduler (cron) + un agente que arma el mensaje y, vía el canal de P10, lo manda; la
  respuesta del adulto (audio corto) alimenta el flag de adherencia. Requiere P3 y P10.
- **Esfuerzo:** medio.
- **Valor:** alto producto; conecta extracción → acción.

### P14 — Check-in proactivo / compañía (silencio prolongado → contactar)
- **Qué es:** si el adulto **no graba** en N días, un agente proactivamente lo contacta para un check-in
  (la soledad/aislamiento es un riesgo real en adultos mayores).
- **Qué aporta:** detecta ausencia (que hoy es invisible) y la convierte en acción de cuidado.
- **Cómo:** cron que mira `last_report_at` por elder; si supera umbral, dispara mensaje/llamada (canal de
  P10) y/o avisa a la familia. Simple y de alto impacto humano.
- **Esfuerzo:** bajo-medio.
- **Valor:** alto producto.

### P15 — Detección longitudinal de deterioro cognitivo (proyecto tipo "Alzheimer")
- **Qué es:** analizar **señales lingüísticas del habla a lo largo del tiempo** (riqueza léxica, longitud
  de oraciones, repetición, coherencia, perplexity respecto del patrón histórico del adulto) para
  flaggear posible deterioro cognitivo gradual.
- **Qué aporta:** una capacidad clínica/de investigación de alto valor; la cátedra **listó explícitamente**
  "Detección de Alzheimer" como proyecto ejemplo. Diferencial fuerte.
- **Cómo:** features deterministas sobre las transcripciones (type-token ratio, MLU, n-grams/perplexity —
  Clase 2) + tendencia temporal; un **baseline barato sin LLM** (perplexity alta = semana "rara") que solo
  invoca al LLM cuando hay anomalía. Embeddings (P1) para drift semántico. Es NLP "de verdad", no solo
  prompting.
- **Esfuerzo:** medio-alto (definir features + validación cuidadosa para no alarmar sin fundamento).
- **Riesgos:** **sensibilidad clínica** — presentarlo como "señal para consultar al médico", nunca como
  diagnóstico. Whisper-tiny degrada las features (errores de transcripción).
- **Valor:** ⭐ muy alto académico (NLP longitudinal + tema bendecido por la cátedra).

---

## Parte 4 — Infraestructura que habilita todo

### P16 — Job async + worker (mata el techo de 60s de Vercel) · [el de mayor apalancamiento]
- **Qué es:** sacar el pipeline de audio del request HTTP. `POST /reportes` devuelve **202 + report_id**;
  un **worker** procesa el grafo; el front hace **polling / SSE** para el progreso.
- **Qué aporta:** **elimina de raíz** el límite de 58-60s de Vercel. TODAS las propuestas (P1, P3, P5,
  P11…) **agregan** trabajo al pipeline → sin esto, revientan el timeout. Es la unidad "Producción/LLMOps"
  y de paso da **progreso en vivo** ("analizando salud… verificando fidelidad 2/3…") en vez de un spinner.
- **Cómo:** portar el `JobStore` de `from_agent_to_production/app/` (tablas jobs/events/attempts/leases) —
  CuidaVoz **ya usa SQLite**, es casi copy-paste. API + worker en el mismo contenedor de Render
  (`asyncio.create_task` de un `run_forever`). **Idempotency-Key = sha256(elder_id + fecha + audio)** →
  reenviar el mismo audio no duplica reporte. **Leases + heartbeat** → si el worker muere (OOM), otro
  recupera sin re-transcribir el audio efímero. **SSE** reanudable para el progreso.
- **Esfuerzo:** medio-alto (~1 semana), pero el código de referencia es casi directo.
- **Valor:** ⭐ habilitador transversal; muy fuerte para la defensa (arquitectura de producción real).

### P17 — Caching + métricas + costo (eficiencia / FinOps)
- **Qué es:** **prompt/prefix caching** de Anthropic para el system prompt compartido de los specialists;
  endpoint `/metrics` (Prometheus) y un recibo de **costo por reporte**.
- **Qué aporta:** baja tokens/latencia (Clase 11: prefix caching) y da **visibilidad** del gasto y el
  throughput (hoy es ciego). Pega en el eje "Eficiencia y Costo" que evalúan en el Engineering Project.
- **Cómo:** reordenar prompts para maximizar prefijo común + activar caching; `metrics_snapshot()` +
  `/metrics`; un `CostCalculator` simple con un `pricing_snapshot.json` (tarifas Haiku 4.5, versionado).
- **Esfuerzo:** bajo.
- **Valor:** medio; números reales para la presentación.

---

## Cómo encajan (dependencias)
- **P16 (async)** habilita meter trabajo extra sin timeouts → conviene primero o en paralelo.
- **P1 (RAG híbrido)** habilita **P5** (cambios por coseno) y alimenta **P2** (context-recall).
- **P3 (extracción meds)** habilita **P13** (recordatorios) y enriquece **P4/P5**.
- **P10 (canal de salida)** habilita **P12, P13, P14** (todas necesitan notificar/llamar).
- **P9 (modelo local)** es una forma de implementar el denso de **P1**.

## Paquete sugerido para el 11-jul (no hacer todo)
- **Habilitador:** P16 (async).
- **Núcleo NLP:** P1 (RAG híbrido) + P2 (eval + replay).
- **Sello agéntico:** P6 (subagentes paralelos) + P7 (MCP de datos).
- **1 feature "wow" de producto:** P10 (contacto instantáneo) **o** P12 (triage de alertas) — ambas
  cierran el `notificar` huérfano y se ven espectaculares en vivo.
- **1 pieza de NLP fuerte:** P5 (cambios) **o** P15 (deterioro cognitivo) según ambición.
- **Narrativa:** sistema **multi-agente** (orquestador + subagentes especializados que conversan) con
  **RAG híbrido real**, **verificación de fidelidad en loop**, **evaluación con métricas estándar** y
  **acción en el mundo real** (contacto/escala), corriendo en una **arquitectura de producción** (jobs
  async) — con decisiones justificadas por las restricciones (Haiku por 60s; embeddings/encoders por 512MB).
