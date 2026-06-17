# ADR — Arquitectura v2: de MVP a producto (web app multi-tenant)

**Estado:** aceptado · 16-jun-2026 · Continúa `01_system_spec.md` y `03_implementation_plan.md`.

## Contexto

El MVP (M0→M4) resolvió el loop central — voz → reporte fiel → alertas → persistencia → Q&A — pero es **mono-usuario y local** (un adulto mayor, SQLite/Chroma en disco, Telegram + Streamlit). El objetivo ahora es llevarlo lo más lejos posible como **producto**: un servicio **multi-tenant** donde muchas familias usan el sistema, con un **web app** como superficie principal. La mensajería (Telegram → WhatsApp) se difiere a lo último (WhatsApp requiere aprobaciones de Meta/Apple).

## Decisión

Adoptamos el stack estándar de la industria para un SaaS de este tipo:

- **Web app:** **Next.js** (App Router, TypeScript) + **Tailwind** + **shadcn/ui**, desplegable en **Vercel**. Es la superficie principal del producto (cuidadores).
- **Datos + Auth:** **Supabase** — Postgres gestionado, **Auth**, **RLS** (aislamiento multi-tenant a nivel de fila) y **pgvector** (índice semántico para RAG). Un solo origen de verdad.
- **Backend de procesamiento agéntico:** se mantiene el **sistema Python** (LangGraph + faster-whisper + LLM) construido en M0→M4. Es el "cerebro" — transcribe, genera el reporte fiel, detecta alertas, indexa y responde Q&A. Expone una **API (FastAPI)** que el web app invoca; escribe/lee en Supabase con rol de servicio.

> Por qué no rehacer todo en TS: el núcleo NLP/agéntico (orquestación, faithfulness, ASR, RAG) es el corazón del proyecto y ya está hecho y probado en Python. Next.js/Supabase aportan el caparazón de producto (auth, multi-tenancy, UX). Cada uno en lo que es mejor.

## Topología de componentes

```
┌────────────────────────┐        HTTPS        ┌──────────────────────────────┐
│  Web app (Next.js)     │ ──────────────────► │  Backend de procesamiento     │
│  Vercel · shadcn/ui    │   /procesar-audio   │  (Python · FastAPI · LangGraph)│
│  - Auth (Supabase)     │   /consultar        │  - faster-whisper (ASR)        │
│  - Gestión familia/    │ ◄────────────────── │  - LLM (reporte fiel + Q&A)    │
│    adulto/cuidador     │     reporte/alertas │  - alertas (reglas + LLM)      │
│  - Dashboard, chat     │                     │  - RAG (pgvector)              │
└───────────┬────────────┘                     └───────────────┬──────────────┘
            │  @supabase/ssr (RLS, anon key)                    │  service role
            ▼                                                   ▼
        ┌───────────────────────────── Supabase (Postgres) ─────────────────────────┐
        │  auth.users · profiles · families · family_members · elders               │
        │  reports · alerts · report_embeddings (pgvector)   — todo con RLS por tenant│
        └───────────────────────────────────────────────────────────────────────────┘
```

- El **web app** lee/escribe datos de dominio vía Supabase con la sesión del cuidador → **RLS** garantiza que solo ve lo de **sus** familias.
- El **backend Python** usa el **service role** (bypassa RLS) y recibe el contexto de tenant (`family_id`, `elder_id`) explícito en cada request; es responsable de escribir solo en el tenant correcto.

## Modelo de datos (multi-tenant)

La **familia es el tenant**. Un cuidador puede pertenecer a varias familias; una familia tiene varios adultos mayores y varios cuidadores.

| Entidad | Qué es | Claves / campos relevantes |
|---|---|---|
| `profiles` | espejo de `auth.users` (cuidador logueado) | `id` (= auth.uid), `nombre`, `email` |
| `families` | el **tenant** (un grupo familiar) | `id`, `nombre`, `created_by` |
| `family_members` | pertenencia cuidador↔familia + **rol** | `family_id`, `profile_id`, `rol` ∈ {owner, caregiver} |
| `elders` | adulto mayor (emisor de audios; **no** loguea) | `id`, `family_id`, `nombre`, `metadata` |
| `reports` | reporte estructurado de un día | `id`, `elder_id`, `family_id`, `fecha`, `payload` (jsonb = esquema `Reporte`), `resumen`, `confianza`, `incompleto` |
| `alerts` | alerta derivada de un reporte | `id`, `report_id`, `elder_id`, `family_id`, `tipo`, `severidad`, `evidencia` |
| `report_embeddings` | vector del reporte para RAG | `id`, `report_id`, `elder_id`, `family_id`, `embedding vector(1536)`, `contenido` |

**Aislamiento (RLS):** toda tabla de dominio lleva `family_id` y tiene políticas que exigen que el `auth.uid()` sea miembro de esa familia (`family_members`). Una función `is_family_member(family_id)` `security definer` evita recursión en las políticas. El esquema `Reporte` de Pydantic (`elderly-care-system/src/schemas.py`) sigue siendo el **contrato del `payload`** — Postgres lo guarda como jsonb; nada se reescribe.

## Interfaces que NO cambian (continuidad con M0→M4)

Gracias a los contratos ya congelados, la migración entra **detrás de las mismas firmas**:
- `ReportStore` / `VectorIndex` (`src/storage/`) → nueva implementación Postgres/pgvector, ahora **tenant-aware** (`family_id`, `elder_id`). El modo `mock`/offline para tests se mantiene.
- `LLMClient`, `transcribir()`, `Reporte` → sin cambios.
- La capa de **ingestión** sigue detrás de su interfaz; hoy la entrada es el web app, mañana Telegram/WhatsApp.

## Layout del repositorio

```
elderly-care-engineering/
  docs/                  ← specs y ADRs
  elderly-care-system/   ← backend Python (LangGraph, ASR, LLM, storage, API)
  web/                   ← web app Next.js (nuevo)
  supabase/              ← migraciones, config, seed (nuevo)
```

## Entorno de desarrollo

- **Supabase local** vía Docker (`npx supabase start`) — Postgres + Auth + Studio sin cuenta cloud. Migraciones portables a un proyecto cloud cuando el equipo lo linkee.
- El web app apunta a `http://127.0.0.1:54321` (env en `web/.env.local`).
- El backend Python apunta a la misma DB local (connection string del Supabase local).
- Deploy futuro: web app en Vercel, backend Python en un contenedor (Docker ya validado), Supabase cloud.

## Consecuencias

- **+** Multi-tenancy real, auth de verdad, aislamiento por RLS, RAG sobre pgvector — es "el producto".
- **+** El núcleo NLP/agéntico se reusa intacto.
- **−** Dos lenguajes/proyectos (TS + Python) y una dependencia de Supabase local (Docker) en dev.
- **Diferido:** mensajería (Telegram primero, WhatsApp al final), billing/suscripción, notificaciones proactivas (F6+).
