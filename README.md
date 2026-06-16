# NLP — Cuidado remoto de adultos mayores · Engineering (*CuidaVoz*)

Proyecto de **ingeniería** para **Procesamiento del Lenguaje Natural** (UdeSA).
Viaggio · Menceyra · Gremes · Carruthers · Amblard

Sistema multi-agente end-to-end donde un adulto mayor manda un audio diario y la
familia recibe un reporte estructurado, alertas y un chat de consulta sobre el historial.

> El proyecto de investigación (survey + protocolo experimental sobre el componente
> voz→reporte) vive en un repo aparte: **elderly-care-research**.

## Contenido

```
docs/01_system_spec.md      ← arquitectura + especificación del producto
docs/02_project_plan.md     ← milestones, división de trabajo, cronograma
elderly-care-system/        ← scaffolding del repo (corre end-to-end con stubs)
```

## Por dónde empezar

1. Leer `docs/01_system_spec.md` (define el contrato: el esquema del reporte).
2. Repartir módulos según `docs/02_project_plan.md`.
3. Levantar el esqueleto: `cd elderly-care-system && make test`.
