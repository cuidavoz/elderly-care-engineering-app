"""Smoke test: el grafo corre end-to-end con stubs y devuelve un reporte válido."""
from src.orchestrator.graph import GRAPH
from src.schemas import Reporte


def test_pipeline_reporte():
    out = GRAPH.invoke({"tipo_evento": "audio", "audio_path": "fake.ogg",
                        "elder_id": "test"})
    assert isinstance(out["reporte"], Reporte)


def test_qa():
    out = GRAPH.invoke({"tipo_evento": "consulta", "pregunta": "¿cómo durmió?",
                        "elder_id": "test"})
    assert "respuesta" in out
