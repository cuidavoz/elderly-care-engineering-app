"""API FastAPI.  Responsable: Integrante A/E."""
from __future__ import annotations
import hmac
import logging
import os
import shutil
import tempfile
from fastapi import Depends, FastAPI, Header, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from src.agents.digest import generar_digest
from src.config import settings
from src.orchestrator.graph import GRAPH
from src.storage import get_report_store

logger = logging.getLogger("cuidavoz.api")


def _precargar_whisper() -> None:
    """Pre-carga el modelo Whisper en memoria al arrancar el servidor.

    Sin esto, el modelo se carga lazy en el primer POST /reportes, agregando
    10-15s al primer request y a cualquier request post cold-start. Pre-cargarlo
    aquí garantiza que el pipeline de audio entre dentro de la ventana de 58s
    de Vercel Hobby desde el primer request.
    """
    if settings.asr_provider == "faster_whisper":
        from src.pipeline.asr import _get_modelo
        try:
            _get_modelo()
            logger.info("Modelo Whisper pre-cargado OK (%s)", settings.whisper_model)
        except Exception:
            logger.warning("No se pudo pre-cargar Whisper; se cargará en el primer request.")


app = FastAPI(title="CuidaVoz API", version="0.1.0", on_startup=[_precargar_whisper])


def require_internal_token(
    x_internal_token: str | None = Header(default=None),
) -> None:
    """Valida el token compartido server-to-server.

    La API usa el service role (bypassa RLS), por lo que NO debe ser pública: el
    único cliente legítimo es el web app, que firma cada request con el header
    `X-Internal-Token`. Comparación en tiempo constante (hmac.compare_digest).

    Rollout gradual: si `internal_api_token` está vacío, se permite el acceso
    (con warning al arranque) para no romper despliegues que todavía no setearon
    el env var. Setearlo en Render + Vercel cierra el agujero de cross-tenant.
    """
    expected = (settings.internal_api_token or "").strip()
    if not expected:
        return  # modo abierto (ver warning de arranque)
    if not x_internal_token or not hmac.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="Token interno inválido o ausente.")


if not (settings.internal_api_token or "").strip():
    logger.warning(
        "INTERNAL_API_TOKEN no está seteado: la API acepta requests sin "
        "autenticar y usa el service role (bypassa RLS). Seteá INTERNAL_API_TOKEN "
        "en el backend y CUIDAVOZ_INTERNAL_TOKEN (mismo valor) en el web app para "
        "cerrar el acceso cross-tenant."
    )

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


@app.post("/reportes", dependencies=[Depends(require_internal_token)])
def crear_reporte(elder_id: str = Form(...), audio: UploadFile = File(...)):
    """Recibe un audio, corre el pipeline y devuelve el reporte estructurado.

    Sync def A PROPÓSITO (no async): el pipeline (Whisper + LLM) es CPU-bound y
    bloqueante, y no usa await. FastAPI corre los `def` en un threadpool, así el
    event loop queda libre para responder /health. Si fuera `async def`, bloquearía
    el loop durante toda la transcripción → el health check de Render (5s) falla →
    Render reinicia la instancia y mata el request del audio a mitad (→ timeout 55s
    en el web). Mantener como `def`."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".ogg") as tmp:
        shutil.copyfileobj(audio.file, tmp)
        path = tmp.name
    out = GRAPH.invoke({"tipo_evento": "audio", "audio_path": path,
                        "elder_id": elder_id})
    rep = out.get("reporte")
    return {"reporte": rep.model_dump(mode="json") if rep else None,
            "confianza": out.get("confianza"), "error": out.get("error")}


@app.post("/consultas", dependencies=[Depends(require_internal_token)])
def consultar(elder_id: str = Form(...), pregunta: str = Form(...)):
    """Q&A del familiar sobre el historial."""
    out = GRAPH.invoke({"tipo_evento": "consulta", "pregunta": pregunta,
                        "elder_id": elder_id})
    return {"respuesta": out.get("respuesta")}


@app.post("/digest", dependencies=[Depends(require_internal_token)])
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


@app.get("/reportes/{elder_id}", dependencies=[Depends(require_internal_token)])
def historial(elder_id: str, limite: int = 30):
    """Historial de reportes del adulto mayor, para el timeline del dashboard."""
    try:
        guardados = _store.listar(elder_id, limite=limite)
    except NotImplementedError:
        # Persistencia aún no implementada (subagente D, Fase 2). Degradar con
        # gracia para no romper al frontend que se desarrolla en paralelo.
        return {"reportes": [], "pendiente": "persistencia no implementada aún"}
    return {"reportes": [g.reporte.model_dump(mode="json") for g in guardados]}
