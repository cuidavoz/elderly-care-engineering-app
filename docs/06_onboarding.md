# CuidaVoz — Onboarding (arrancá acá)

Guía para un integrante nuevo: **clonar el repo, levantarlo en tu compu y subir tu trabajo**.
Para el detalle de arquitectura ver `01_system_spec.md` / `04_architecture_v2.md`; para el
deploy en la nube ver `05_setup_y_deploy.md`.

> **Idea clave:** podés desarrollar **todo en local sin ningún secreto de producción** y
> **sin gastar API**, usando Supabase local + los proveedores en modo `mock`. Los valores
> reales (keys de Anthropic/Supabase, tokens) viven en los dashboards y en el gestor de
> contraseñas del equipo — **no hacen falta para programar**.

---

## 0. Accesos que necesitás

| Para… | Qué necesitás | Cómo |
|---|---|---|
| **Pushear código** | Ser miembro de la org **`cuidavoz`** en GitHub con permiso **Write** sobre el repo | Pediselo a un Owner de la org. Con su propia cuenta de GitHub. |
| Ver/administrar la base en la nube *(opcional)* | Invitación a la **org de Supabase** (rol *Developer* alcanza) | No hace falta para dev local. |
| Entrar a los dashboards de **Vercel / Render** | Login de la cuenta compartida **`cuidavoz.team@gmail.com`** | El free tier no permite invitar miembros, así que todos usan ese login. Credenciales en el gestor de contraseñas del equipo. |
| **Dev local** | **Nada** de lo anterior | Todo corre con Supabase local + mock. |

---

## 1. Requisitos

- **Node.js** 20+
- **Python 3.11** (⚠️ no 3.14 — algunas wheels de ML no lo soportan)
- **Docker Desktop** (lo usa Supabase local)
- En **Windows**: no tengas el repo dentro de OneDrive (ralentiza mucho el dev server).

---

## 2. Clonar

```bash
git clone https://github.com/cuidavoz/elderly-care-engineering-app.git
cd elderly-care-engineering-app
```

El repo tiene tres piezas: `web/` (Next.js), `elderly-care-system/` (backend Python) y
`supabase/` (DB + Auth).

---

## 3. Supabase local (base de datos + Auth)

Desde la raíz del repo:

```bash
npx supabase start      # levanta Postgres + Auth + Studio en Docker
npx supabase db reset   # aplica las migraciones (supabase/migrations/*)
```

`supabase start` te imprime los datos que vas a necesitar:
- **API URL**: `http://127.0.0.1:54321`
- **DB**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- **anon / publishable key**
- **Studio**: `http://127.0.0.1:54323`

*(Opcional)* datos de demo: pegá el contenido de `web/supabase-seed.sql` en
**Studio → SQL Editor → Run**. Login demo: `demo@cuidavoz.test` / `cuidavoz123`.

---

## 4. Backend (Python · FastAPI)

```bash
cd elderly-care-system

# venv (Mac/Linux)
python3.11 -m venv .venv && source .venv/bin/activate
# venv (Windows)
#   py -3.11 -m venv .venv
#   .venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env        # (Windows: copy .env.example .env)
```

Editá `.env` para dev full-stack contra Supabase local:

```
STORAGE_BACKEND=postgres
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
LLM_PROVIDER=mock           # mock = sin costo ni API key. Para IA real: anthropic + ANTHROPIC_API_KEY
ASR_PROVIDER=mock           # mock = sin bajar Whisper. Para transcripción real: faster_whisper
INTERNAL_API_TOKEN=         # vacío en local está OK (es localhost)
```

Correr:

```bash
make run-api                # = uvicorn src.api.main:app --reload --port 8000
# API + docs en http://localhost:8000/docs
```

Tests (offline, no llaman a ninguna API ni ensucian `./data`):

```bash
make test                   # = pytest -q
```

> Para programar solo el backend sin levantar Supabase, dejá `STORAGE_BACKEND=sqlite`
> (default) + `LLM_PROVIDER=mock` y listo — usa SQLite/Chroma en disco. Pero para ver
> tus reportes en la web, usá `postgres` contra Supabase local (misma base que lee la web).

---

## 5. Web (Next.js)

```bash
cd web
npm install
cp .env.example .env.local  # (Windows: copy .env.example .env.local)
```

Completá `.env.local` con lo que imprimió `supabase start`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<la anon/publishable key local>
CUIDAVOZ_API_BASE=http://localhost:8000
CUIDAVOZ_INTERNAL_TOKEN=          # vacío en local (tiene que coincidir con el del backend)
```

Para probar notificaciones Web Push, generá VAPID y agregá:

```bash
npx web-push generate-vapid-keys
```

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:cuidavoz.team@gmail.com
```

Correr:

```bash
npm run dev                 # http://localhost:3000
```

> El backend tiene que estar corriendo (paso 4) para que funcionen **subir audio**,
> **Consultar (Q&A)** y **Resumen**.

---

## 6. Modo mock vs real

Todo el desarrollo y la demo pueden correr **sin gastar API**:
- **mock** (default en dev): `LLM_PROVIDER=mock` devuelve un reporte válido determinista;
  `ASR_PROVIDER=mock` evita bajar Whisper.
- **real**: `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY=...` y/o `ASR_PROVIDER=faster_whisper`.
  ⚠️ La API key es secreta: nunca la subas al repo, va solo en tu `.env` local (ya está en `.gitignore`).

---

## 7. Flujo de trabajo para subir tu trabajo ⚠️

**`main` despliega solo**: cada push a `main` dispara un deploy automático en **Vercel** (web)
y **Render** (backend). Por eso **no se pushea directo a `main`**.

Flujo:

```bash
git checkout -b feat/lo-que-hagas      # rama por feature/fix
# ...cambios...
git add -A && git commit -m "feat: ..."
git push -u origin feat/lo-que-hagas   # push de la RAMA, no de main
```

Después abrís un **Pull Request** en GitHub (`base: main`), lo revisan, y al **mergear**
recién ahí se despliega.

**Antes de pushear**, que pase:
- Backend: `make test` (o `pytest -q`)
- Web: `npm run lint`

---

## 8. ¿Dónde viven los secretos?

- **En local NO los necesitás** (mock + Supabase local cubren todo).
- En **producción** viven en los dashboards (Vercel / Render / Supabase) y en el
  **gestor de contraseñas del equipo**. **Nunca** en el repo.
- Los `.env` / `.env.local` reales están en `.gitignore` — no se commitean. Los
  `.env.example` son las plantillas (sin valores reales) que copiás y completás.

---

## Resumen rápido (TL;DR)

```bash
git clone https://github.com/cuidavoz/elderly-care-engineering-app.git
cd elderly-care-engineering-app
npx supabase start && npx supabase db reset
# backend:
cd elderly-care-system && python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cp .env.example .env   # editar: postgres + mock
make run-api
# web (otra terminal):
cd web && npm install && cp .env.example .env.local        # completar con datos de supabase start
npm run dev
# trabajar:
git checkout -b feat/mi-cambio   # nunca pushear directo a main
```
