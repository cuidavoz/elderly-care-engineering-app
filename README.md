# NLP — Cuidado remoto de adultos mayores · Engineering (*CuidaVoz*)

Proyecto de **ingeniería** para **Procesamiento del Lenguaje Natural** (UdeSA).
Viaggio · Menceyra · Gremes · Carruthers · Amblard

Sistema multi-agente end-to-end donde un adulto mayor manda un audio diario y la
familia recibe un reporte estructurado, alertas y un chat de consulta sobre el historial.

> El proyecto de investigación (survey + protocolo experimental sobre el componente
> voz→reporte) vive en un repo aparte: **elderly-care-research**.

## Contenido

```
docs/01_system_spec.md         ← arquitectura + especificación del producto
docs/02_project_plan.md        ← milestones, división de trabajo, cronograma
docs/03_implementation_plan.md ← plan de implementación M1→M4
docs/04_architecture_v2.md     ← ADR: de MVP a producto multi-tenant (web + Supabase)
docs/05_setup_y_deploy.md      ← correr en local + cómo está deployado en la nube
docs/06_onboarding.md          ← ⭐ arrancá acá: clonar, levantar local y subir trabajo
elderly-care-system/           ← backend Python (FastAPI · LangGraph · faster-whisper · LLM)
web/                           ← web app Next.js (cuidadores) + Supabase
supabase/                      ← migraciones, config y seed
```

## Por dónde empezar

- **¿Nuevo en el equipo y querés levantarlo en tu compu?** → empezá por **[`docs/06_onboarding.md`](docs/06_onboarding.md)**.
- Arquitectura y contrato del reporte → `docs/01_system_spec.md` y `docs/04_architecture_v2.md`.
- Setup detallado + deploy en la nube → `docs/05_setup_y_deploy.md`.
