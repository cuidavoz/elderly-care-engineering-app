"""API FastAPI.  Responsable: Integrante A/E."""
from __future__ import annotations
import os
import shutil
import tempfile
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from src.agents.digest import generar_digest
from src.orchestrator.graph import GRAPH
from src.storage import get_report_store

app = FastAPI(title="CuidaVoz API", version="0.1.0")

# El web app (Next.js) corre en otro origen y le pega a esta API desde el browser.
_origins = os.getenv(
    "CUIDAVOZ_WEB_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

_store = get_report_store()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/reportes")
async def crear_reporte(elder_id: str = Form(...), audio: UploadFile = File(...)):
    """Recibe un audio, corre el pipeline y devuelve el reporte estructurado."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".ogg") as tmp:
        shutil.copyfileobj(audio.file, tmp)
        path = tmp.name
    out = GRAPH.invoke({"tipo_evento": "audio", "audio_path": path,
                        "elder_id": elder_id})
    rep = out.get("reporte")
    return {"reporte": rep.model_dump(mode="json") if rep else None,
            "confianza": out.get("confianza"), "error": out.get("error")}


@app.post("/consultas")
def consultar(elder_id: str = Form(...), pregunta: str = Form(...)):
    """Q&A del familiar sobre el historial."""
    out = GRAPH.invoke({"tipo_evento": "consulta", "pregunta": pregunta,
                        "elder_id": elder_id})
    return {"respuesta": out.get("respuesta")}


@app.post("/digest")
def digest(elder_id: str = Form(...), dias: int = Form(7)):
    """Resumen semanal inteligente (tendencias + recomendaciones) para la familia.

    Combina agregación determinista de los reportes del rango (default 7 días)
    con prosa del LLM liviano. Degrada con gracia: ante error devuelve la
    estructura del digest con un mensaje, sin 500 sin contexto.
    """
    try:
        return generar_digest(elder_id, dias=dias)
    except Exception as exc:  # nunca 500 mudo hacia el frontend
        return {
            "elder_id": elder_id,
            "n_reportes": 0,
            "resumen": "No se pudo generar el resumen en este momento.",
            "tendencias": {"sueno": "", "animo": "", "salud": "", "medicacion": ""},
            "alertas_destacadas": [],
            "recomendaciones": [],
            "error": f"digest falló: {exc}",
        }


@app.get("/reportes/{elder_id}")
def historial(elder_id: str, limite: int = 30):
    """Historial de reportes del adulto mayor, para el timeline del dashboard."""
    try:
        guardados = _store.listar(elder_id, limite=limite)
    except NotImplementedError:
        # Persistencia aún no implementada (subagente D, Fase 2). Degradar con
        # gracia para no romper al frontend que se desarrolla en paralelo.
        return {"reportes": [], "pendiente": "persistencia no implementada aún"}
    return {"reportes": [g.reporte.model_dump(mode="json") for g in guardados]}
