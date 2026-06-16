# Engineering Project — Especificación del Sistema

**Proyecto:** *CuidaVoz* — Sistema multi-agente de cuidado remoto de adultos mayores
**Materia:** Procesamiento del Lenguaje Natural — Universidad de San Andrés
**Integrantes:** Viaggio, Menceyra, Gremes, Carruthers, Amblard

---

## 1. Problema y motivación

Las familias que cuidan a un adulto mayor a distancia carecen de una forma simple y de baja fricción de saber cómo está esa persona día a día. Las llamadas dependen de la disponibilidad de ambas partes, y las apps de salud asumen que el adulto mayor sabe e interactúa con interfaces complejas.

La interacción de menor fricción que un adulto mayor ya domina es **dejar un mensaje de voz**. *CuidaVoz* parte de ahí: la persona mayor manda un audio diario contando cómo se siente, si tomó la medicación, si durmió bien; el sistema lo transcribe, genera un **reporte estructurado** (salud, ánimo, actividad, alertas), detecta señales de riesgo, y deja todo accesible para la familia, que además puede hacerle preguntas en lenguaje natural al sistema sobre la evolución del adulto mayor.

Este sistema es, además, el **engineering project que motiva el research project** del grupo: el pipeline voz→reporte es el componente que el research estudia en aislamiento (ver `research/experimental_protocol.md`). Construir el sistema y estudiar su confiabilidad son dos caras del mismo trabajo.

## 2. Usuarios y casos de uso

- **Adulto mayor (emisor):** manda un mensaje de voz por día. No instala nada nuevo — usa un canal de mensajería que ya conoce.
- **Familiar / cuidador (consumidor):** recibe el reporte diario, recibe alertas cuando aparecen señales de riesgo, y consulta el historial ("¿cómo durmió esta semana?", "¿mencionó algún dolor?").

Caso de uso principal (happy path):

1. El adulto mayor envía un audio.
2. El sistema lo transcribe.
3. Genera un reporte estructurado fiel al audio.
4. Evalúa si hay señales de alerta.
5. Guarda el reporte en el historial y notifica al familiar.
6. El familiar puede preguntar sobre la evolución y obtener respuestas fundamentadas en los reportes históricos.

## 3. Arquitectura

### 3.1 Visión general

El sistema es un **grafo de agentes orquestados** (patrón *supervisor*) sobre un pipeline secuencial con ramas. El orquestador recibe un evento (audio nuevo o consulta del familiar) y enruta al subgrafo correspondiente.

```
                          ┌─────────────────────────────────────────┐
   Audio (voz)            │            ORQUESTADOR (LangGraph)        │
   ───────────►  Ingestión ─►  router ─┬─► [Pipeline de reporte]      │
   (Telegram bot)         │            │      Transcripción (Whisper) │
                          │            │      → Generación de reporte │
                          │            │      → Detección de alertas  │
                          │            │      → Persistencia + notif. │
   Consulta familiar      │            │                              │
   ───────────►  API ─────►            └─► [Agente Q&A cuidador]      │
   (frontend / API)       │                   RAG sobre historial     │
                          └─────────────────────────────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
         LLM API                    Almacenamiento                Notificaciones
      (reporte + Q&A)          (reportes + vector store)        (mensaje al familiar)
```

### 3.2 Componentes (módulos)

| Módulo | Responsabilidad | Entrada → Salida |
|---|---|---|
| **Ingestión** | Recibe el audio del canal de mensajería; normaliza formato. | Audio crudo → archivo de audio + metadata |
| **Agente de transcripción** | Corre Whisper sobre el audio. | Audio → texto + confianza |
| **Agente de reporte** | Llama al LLM con prompt estructurado; produce el reporte. | Transcripción → reporte (JSON validado) |
| **Agente de alertas** | Analiza el reporte; decide si hay señal de riesgo y su severidad. | Reporte → decisión de alerta |
| **Memoria / historial** | Persiste reportes; indexa en vector store para RAG. | Reporte → registro persistido |
| **Agente Q&A cuidador** | Responde preguntas del familiar usando RAG sobre el historial. | Pregunta → respuesta fundamentada |
| **Orquestador** | Enruta eventos, maneja estado del grafo, gestiona errores. | Evento → resultado |

### 3.3 Esquema del reporte (contrato central)

El reporte es el artefacto central y se valida con Pydantic. Mantenerlo como un esquema estricto es lo que permite (a) detectar alertas de forma programática y (b) medir *faithfulness* en el research, claim por claim.

```json
{
  "fecha": "2026-06-16",
  "salud": { "sintomas": [...], "medicacion_tomada": true|false|null, "dolor": "..." },
  "sueno": { "calidad": "buena|regular|mala|desconocida", "notas": "..." },
  "animo": { "estado": "...", "notas": "..." },
  "actividades": [ "..." ],
  "alertas": [ { "tipo": "...", "severidad": "baja|media|alta", "evidencia": "..." } ],
  "resumen": "...",
  "claims": [ { "afirmacion": "...", "campo": "salud.dolor", "fuente_textual": "..." } ]
}
```

El array `claims` es deliberado: cada afirmación queda atada a su fragmento de la transcripción (`fuente_textual`). Esto habilita la verificación atómica de faithfulness (estilo FActScore) sin reprocesar el reporte.

## 4. Stack técnico (recomendado y justificado)

Nos pediste recomendar el stack. Esta es la propuesta y por qué:

- **Orquestación de agentes — LangGraph.** Modela el flujo como un grafo de estado explícito. Frente a un orquestador "mágico", LangGraph deja el control de flujo *visible y testeable* (cada nodo es una función pura sobre el estado), maneja ramas/condicionales de forma natural (reporte vs Q&A) y facilita reintentos y manejo de errores por nodo. Esto puntúa fuerte en *Arquitectura* y *Robustez*.
- **ASR — `faster-whisper`.** Implementación de Whisper con CTranslate2: 4× más rápido y menor uso de memoria que `openai-whisper`, corre en CPU razonablemente. Decisión de *Eficiencia y Costo*: permite demo sin GPU. La elección del *tamaño* del modelo (tiny→large) es además la variable independiente del research.
- **LLM — API (Claude o GPT-4 class) vía interfaz desacoplada.** El reporte y el Q&A llaman al LLM detrás de una interfaz `LLMClient`, de modo que cambiar de proveedor o de modelo (incluso a uno local) sea un cambio de una línea. Decisión de costo: modelos chicos para tareas simples, modelo grande solo para generación de reporte.
- **Backend — FastAPI.** Async nativo (importa para I/O de audio y llamadas a LLM), validación con Pydantic (reutiliza el esquema del reporte), y OpenAPI gratis para el entregable de *Deployment* ("API pública").
- **Ingestión de voz — bot de Telegram.** WhatsApp Business API requiere aprobación y costo; **Telegram** ofrece mensajes de voz, bot API gratuita y onboarding trivial. Documentamos esto como una decisión costo-beneficio explícita; la arquitectura deja la ingestión detrás de una interfaz para poder migrar a WhatsApp si hiciera falta.
- **Almacenamiento + RAG — SQLite + un vector store liviano (Chroma).** SQLite para los reportes estructurados (cero infraestructura para la demo); Chroma para el índice semántico del Q&A. Migrable a Postgres/pgvector en producción.
- **Frontend / demo — Streamlit.** Dashboard del familiar en pocas líneas: timeline de reportes, alertas resaltadas, y un chat para el Q&A. Cubre *UX/Interfaz* y da una **demo en vivo** sin construir un frontend completo.
- **Empaquetado — Docker + docker-compose.** Un comando levanta API + frontend. Cubre el criterio de *Deployment*.

Lenguaje: **Python 3.11**. Gestión de dependencias con `requirements.txt` (o `uv`/`poetry` si el grupo prefiere).

## 5. Cómo el diseño cubre cada eje de evaluación

- **Arquitectura:** grafo de agentes con responsabilidades separadas e interfaces claras (§3).
- **Funcionalidad:** resuelve el problema end-to-end — de audio a reporte a alerta a consulta.
- **Stack técnico:** elecciones justificadas por costo, latencia y madurez (§4).
- **Eficiencia y costo:** `faster-whisper` en CPU, modelos LLM dimensionados por tarea, Telegram gratis, SQLite/Chroma sin infra.
- **UX/Interfaz:** el adulto mayor solo manda un audio; el familiar tiene dashboard + chat.
- **Robustez:** manejo de errores por nodo, validación estricta del reporte (Pydantic), `confianza` de transcripción para degradar con gracia, tests de smoke. Edge cases en §6.
- **Deployment:** `docker-compose up` levanta todo; API con OpenAPI; demo en Streamlit.
- **Documentación:** este spec + README del repo + protocolo del research.

## 6. Robustez y edge cases

- **Audio vacío / inaudible:** la transcripción devuelve baja confianza → el reporte se marca como "incompleto" y se pide reintento, no se inventan datos.
- **Transcripción degradada (habla de adulto mayor):** problema central del research; en el sistema se mitiga con (a) elección del modelo Whisper y (b) prompts que instruyen al LLM a *no completar* lo que no está en el texto.
- **Alucinación del LLM:** validación de esquema + el array `claims` con `fuente_textual` permite rechazar afirmaciones sin respaldo antes de notificar al familiar.
- **Falla del LLM / timeout:** reintento con backoff; si persiste, se notifica "reporte demorado" en vez de fallar en silencio.
- **Falso negativo en alertas:** la severidad alta nunca depende solo del LLM — reglas explícitas sobre el reporte estructurado (p. ej. palabras clave de riesgo) actúan como red de seguridad.

## 7. Privacidad y ética (relevante en contexto clínico)

Datos de salud de una población vulnerable. Mínimo: consentimiento del adulto mayor y del familiar, almacenamiento local/cifrado, sin reutilización de audios para entrenamiento, y un disclaimer de que *no* es un dispositivo médico. Un reporte que contradice lo que la persona dijo puede llevar a decisiones clínicas erróneas — por eso la faithfulness es un requisito, no un extra (ver research).

## 8. Alcance del entregable

MVP demostrable: ingestión por Telegram → transcripción → reporte → alerta → dashboard con Q&A, corriendo en `docker-compose`, con README reproducible. El scaffolding del repo (en `elderly-care-system/`) ya tiene la estructura, las interfaces y los stubs para que cada integrante implemente su módulo en paralelo.
