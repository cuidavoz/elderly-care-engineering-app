"""API FastAPI.  Responsable: Integrante A/E."""
from __future__ import annotations
import shutil
import tempfile
from fastapi import FastAPI, UploadFile, File, Form
from src.orchestrator.graph import GRAPH

app = FastAPI(title="CuidaVoz API", version="0.1.0")


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
