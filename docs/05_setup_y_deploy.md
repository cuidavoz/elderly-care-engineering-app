# CuidaVoz — Setup y Deploy (guía para el equipo)

Cómo correr el proyecto en local y cómo está deployado en la nube. Para el detalle
de arquitectura y features ver `01_system_spec.md` y `04_architecture_v2.md`.

## Arquitectura (rápido)

- **Web** (`web/`): Next.js 16 + Tailwind + shadcn/Base UI. Superficie principal (cuidadores).
- **Backend** (`elderly-care-system/`): Python 3.11, FastAPI + LangGraph + faster-whisper + LLM. Transcribe, genera el reporte fiel, detecta alertas, responde Q&A y arma el resumen semanal.
- **Datos/Auth**: Supabase (Postgres + Auth + RLS + pgvector). El `payload` de los reportes sigue el esquema Pydantic `Reporte` (`elderly-care-system/src/schemas.py`).
- La web habla con Supabase (con la sesión del usuario, RLS) y con el backend Python vía Route Handlers (`CUIDAVOZ_API_BASE`).

## Correr en local

### Requisitos
- Node.js, Python **3.11** (no 3.14), Docker Desktop (para Supabase local).
- Recomendado en Windows: **NO** tener el repo dentro de OneDrive (ralentiza mucho el dev server por el sync de `.next`/`node_modules`).

### 1. Supabase local (DB + Auth)
Desde la raíz del repo:
```bash
npx supabase start          # levanta Postgres+Auth+Studio (Docker). Imprime API URL + anon key.
npx supabase db reset       # aplica las migraciones supabase/migrations/0001..0005
```
Datos de demo (opcional): pegá el contenido de `web/supabase-seed.sql` en **Supabase Studio → SQL Editor → Run**.
Login demo: `demo@cuidavoz.test` / `cuidavoz123`.
> En Windows NO cargues el seed con `Get-Content | docker exec` (rompe los acentos UTF-8). Usá el SQL Editor, o `docker cp` + `psql -f`.

### 2. Backend Python (API)
```bash
cd elderly-care-system
py -3.11 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
# Configurá el entorno:
copy .env.example .env       # y editá (ver abajo)
.venv\Scripts\python.exe -m uvicorn src.api.main:app --port 8000
```
`.env` mínimo para dev local contra Supabase local:
```
STORAGE_BACKEND=postgres
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
LLM_PROVIDER=mock            # mock = sin costo/API key. Para IA real: anthropic + ANTHROPIC_API_KEY
ASR_PROVIDER=faster_whisper  # o mock para evitar bajar el modelo
```
Tests: `.venv\Scripts\python.exe -m pytest -q`. (También hay una skill del proyecto `cuidavoz-dev`.)
> El backend debe estar corriendo para **Resumen**, **Consultar (Q&A)** y **subir audio**.

### 3. Web (Next.js)
```bash
cd web
npm install
copy .env.example .env.local   # completá con la URL + anon key que imprimió `supabase start`
npm run dev                    # http://localhost:3000
```

### Gotchas (Windows/Docker)
- Si el dashboard tira 500 con `JWT issued at future` → desfase de reloj del contenedor Docker (pasa tras dormir la PC). Reiniciá Docker o `wsl --shutdown`.
- Free tier / cold starts no aplican en local; sí en la nube (ver abajo).

## Deploy en la nube (producción)

| Capa | Servicio | URL / ref |
|---|---|---|
| Web | **Vercel** | https://elderly-care-engineering-app.vercel.app (root dir `web/`) |
| Backend | **Render** (Docker) | https://elderly-care-engineering-app.onrender.com (root dir `elderly-care-system/`) |
| DB/Auth | **Supabase Cloud** | project ref `obznbqvtsktwbeceitan` |

- **Auto-deploy:** un push a `main` del repo del equipo (`FelipeViaggio/elderly-care-engineering-app`) dispara el build en Vercel (web) y Render (backend).
- **Render free tier duerme** tras ~15 min de inactividad → la 1ª request (ej. Resumen) puede tardar 30–60s.

### Variables de entorno (los valores reales viven en los dashboards, NO en el repo)
- **Vercel:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CUIDAVOZ_API_BASE` (= URL de Render), `CUIDAVOZ_INTERNAL_TOKEN` (ver seguridad ⬇).
- **Render:** `STORAGE_BACKEND=postgres`, `DATABASE_URL` (Supabase Cloud, Session pooler + `?sslmode=require`), `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `LLM_MODEL_REPORT`, `LLM_MODEL_LIGHT`, `ASR_PROVIDER=mock`, `INTERNAL_API_TOKEN` (ver seguridad ⬇).
- Migraciones a la nube: `npx supabase link --project-ref obznbqvtsktwbeceitan` + `npx supabase db push` (incluye `0005_security_hardening.sql`).

### ⚠️ Seguridad: token interno API (OBLIGATORIO en prod)
El backend Python usa el **service role** de Supabase (bypassa RLS), así que **no debe ser público**: cualquiera que conozca un `elder_id` podría leer/escribir datos de otra familia pegándole directo a Render. Para cerrarlo, la API valida un token compartido en el header `X-Internal-Token`:
1. Generá un secreto fuerte: `openssl rand -hex 32`.
2. Poné **el mismo valor** en `INTERNAL_API_TOKEN` (Render) y `CUIDAVOZ_INTERNAL_TOKEN` (Vercel).
3. Redeploy ambos.

> Mientras `INTERNAL_API_TOKEN` esté vacío, la API arranca en **modo abierto** (loguea un warning) para no romper despliegues existentes — solo aceptable en dev local. **Seteá el token antes de exponer la demo.**

## Trabajar en el repo
- Repo del equipo: `FelipeViaggio/elderly-care-engineering-app` (privado). Pedí acceso como colaborador.
- Flujo normal: rama o `main` → `git push origin main` → auto-deploy. Cada PR/push debería pasar `pytest -q` (backend) y `npm run lint` + `tsc --noEmit` (web).

## Estado del producto
M0–M4 (pipeline voz→reporte, alertas, persistencia, RAG/Q&A) + producto multi-tenant. Features F6–F12: digest/tendencias/alertas, fidelidad (faithfulness), evidencia de claims, invitar cuidadores, export PDF, identidad de marca.
