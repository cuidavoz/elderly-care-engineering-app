# HANDOFF — Continuar P18 (agente de seguimiento proactivo)

Para quien retoma el trabajo. **Empezá leyendo:** [`plan-p18-roadmap.md`](./plan-p18-roadmap.md) (el paso a
paso) y [`spec-p18-agente-seguimiento.md`](./spec-p18-agente-seguimiento.md) (el diseño). Contexto general de
propuestas: [`propuestas-simple.md`](./propuestas-simple.md) / [`propuestas-tecnico.md`](./propuestas-tecnico.md).

## Qué es P18
Un agente que, 1×/día, mira lo que el adulto contó en las últimas 24 h, elige UN tema para hacerle
seguimiento (prioridad severidad alta→media→baja, o decide no molestar), decide cuándo preguntarlo y redacta
una pregunta cálida. Aparece en `/elder` arriba del botón (Fase 1) y como notificación (Fase 2). El adulto
responde con un audio → arranca el pipeline normal.

## Estado actual (ya en el repo)
- Agente: `elderly-care-system/src/agents/followup.py` (coordinador + Selector + Redactor; provider-agnóstico;
  ventana 24 h con "hace cuánto" + franja del día; nunca rompe → degrada a "no preguntar").
- Política (Skill): `elderly-care-system/src/agents/skills/seguimiento/SKILL.md`.
- Migración: `supabase/migrations/0012_followups.sql` (tabla + RLS). **Falta aplicarla a la base.**
- Stores exponen `creado_en` (timestamp real): `storage/store.py` y `storage/postgres.py`.
- Config: `llm_model_followup` (hook para migrar SOLO este agente a un modelo propio).
- Infra base de notificaciones/PWA (parcial Fase 2): `supabase/migrations/0013_push_subscriptions.sql` +
  `0014_push_subscription_endpoint_scope.sql`, `web/src/app/manifest.ts`, `web/public/sw.js`,
  Route Handlers `/api/elders/[elderId]/push/*`, helper `web-push` y toggle compartido en `/elder` y
  dashboard de cuidadores. El botón "Probar aviso" queda oculto/bloqueado en producción salvo opt-in.

Falta (ver el roadmap): tests + eval (Fase 0), storage CRUD de `followups` + servicio + endpoint/scheduler +
`/elder` (Fase 1), integración del dispatcher real con Web Push + prueba iPhone/WhatsApp (Fase 2).

## Puesta a punto
1. **Backend** (`elderly-care-system/`): usá el skill `cuidavoz-dev` (crea venv, instala deps, corre tests,
   alterna LLM mock/real). Tests: `pytest`. El mock (`LLM_PROVIDER=mock`) permite correr sin costo/red.
2. **Web** (`web/`): `npm install` && `npm run dev`. ⚠️ **Leé `web/AGENTS.md`**: es Next.js 16 con breaking
   changes — antes de tocar código Next, mirá `node_modules/next/dist/docs/`.
3. **Secretos (no están en el repo, son `.env`):** pedíselos al equipo o armá los tuyos desde los
   `.env.example`. Backend `.env`: `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `ASR_PROVIDER` (prod=groq),
   `STORAGE_BACKEND`/`DATABASE_URL`, `INTERNAL_API_TOKEN`, `LLM_PROVIDER`. Web `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CUIDAVOZ_API_BASE`,
   `CUIDAVOZ_INTERNAL_TOKEN`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
4. **Aplicar migraciones pendientes** a Supabase (SQL editor o `npx supabase db push` / `migration up`):
   `0012_followups.sql` para Fase 1 y `0013`/`0014` para Web Push. Las migraciones NO se aplican solas.
   (Nota: revisá que el historial de migraciones esté al día.)

## MCPs (recomendados para verificar/inspeccionar; no imprescindibles para codear)
Instalalos con **tus propios tokens** (no reutilices los de otro). Son read-only/inspección: Supabase (DB),
Render (backend), Vercel (deploys del front).
- **Supabase** (read-only, scopeado al proyecto de CuidaVoz):
  `claude mcp add supabase -- npx -y @supabase/mcp-server-supabase@latest --read-only --project-ref=<REF>`
  (con tu Access Token de Supabase en el entorno; pedí el `<REF>` del proyecto al equipo).
- **Render** (HTTP): `claude mcp add --transport http render https://mcp.render.com/mcp` (con tu API key).
- **Vercel** (HTTP, OAuth): `claude mcp add --transport http vercel https://mcp.vercel.com` y después
  autorizá con `/mcp` en una sesión interactiva.
Verificá con `claude mcp list`.

## Por dónde empezar
Roadmap → **Fase 0.1**: escribir `tests/test_followup.py` (lógica determinista: ventana 24 h, "hace cuánto",
parseo, camino "no molestar", resiliencia) con el LLM mockeado. Luego el golden set (`eval/followup_casos.json`)
y el harness (`eval/eval_followup.py`). Si se retoma primero la rama de notificaciones, el siguiente paso es
conectar el dispatcher/followup programado con `sendWebPush` y validar iPhone real (PWA instalada, iOS 16.4+).

## Notas del proyecto
- Cada agente sigue la convención: función pura + parseo defensivo + **nunca tirar excepción** (degrada a un
  default seguro). Mantenerlo así.
- El material de clase (`Teoricas/`, `Prácticas/`) está **gitignored** a propósito (no se versiona).
- Git: el owner maneja sus propios commits/pushes.
