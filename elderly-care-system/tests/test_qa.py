"""Tests OFFLINE del Q&A del familiar y del pase de alertas (subagente D).

El Q&A se prueba end-to-end del nodo: indexa reportes en una ruta temporal,
sobreescribe settings.db_path/chroma_path para que los nodos usen ese mismo
almacenamiento, y verifica que devuelve una respuesta basada en el contexto
recuperado (LLM mock).
"""
from __future__ import annotations

from datetime import date

import pytest

from src.agents import alert, caregiver_qa, memory
from src.schemas import (
    Alerta,
    Animo,
    Claim,
    Reporte,
    Salud,
    Severidad,
    Sueno,
    CalidadSueno,
)
from src.storage.store import VectorIndex


def _reporte(fecha: date, resumen: str, sintomas=None) -> Reporte:
    return Reporte(
        fecha=fecha,
        salud=Salud(sintomas=sintomas or []),
        sueno=Sueno(calidad=CalidadSueno.regular),
        animo=Animo(estado="estable"),
        resumen=resumen,
        claims=[Claim(afirmacion=resumen, campo="resumen", fuente_textual=resumen)],
    )


@pytest.fixture
def storage_tmp(tmp_path, monkeypatch):
    """Apunta db_path y chroma_path a rutas temporales aisladas por test."""
    from src.config import settings

    monkeypatch.setattr(settings, "db_path", str(tmp_path / "reports.db"))
    monkeypatch.setattr(settings, "chroma_path", str(tmp_path / "chroma"))
    return tmp_path


# --------------------------------------------------------------------------- #
# Q&A del familiar
# --------------------------------------------------------------------------- #
def test_qa_con_historial_devuelve_respuesta(storage_tmp):
    # indexamos reportes en la ruta temporal (misma que usará el nodo)
    idx = VectorIndex()
    idx.indexar("abuela", _reporte(date(2026, 6, 10), "durmió bien y caminó"))
    idx.indexar("abuela", _reporte(date(2026, 6, 11), "ánimo estable, sin dolores"))

    state = {"elder_id": "abuela", "pregunta": "¿cómo durmió esta semana?"}
    out = caregiver_qa.run(state)

    assert out["respuesta"]
    assert isinstance(out["respuesta"], str)
    # el mock de Q&A (json_mode=False) responde con su texto fijo
    assert "[mock]" in out["respuesta"]


def test_qa_sin_historial_responde_honestamente(storage_tmp):
    state = {"elder_id": "sin_datos", "pregunta": "¿cómo está?"}
    out = caregiver_qa.run(state)
    assert out["respuesta"]
    assert "historial" in out["respuesta"].lower()
    # no debe inventar: no llega a llamar al LLM con contexto vacío
    assert "[mock]" not in out["respuesta"]


# --------------------------------------------------------------------------- #
# Memory (persistencia + indexado + flag de notificación)
# --------------------------------------------------------------------------- #
def test_memory_persiste_indexa_y_marca_notificacion(storage_tmp):
    rep = _reporte(date(2026, 6, 12), "se cayó en el baño")
    rep.alertas.append(
        Alerta(tipo="señal_de_riesgo", severidad=Severidad.alta, evidencia="caída")
    )
    state = {"elder_id": "abuela", "reporte": rep}
    out = memory.run(state)

    assert "error" not in out  # no debe fallar
    assert out.get("notificar") is True  # alerta alta => notificar

    # el reporte quedó indexado y es recuperable por el Q&A
    res = VectorIndex().buscar("abuela", "se cayó en el baño", k=5)
    assert len(res) == 1


# --------------------------------------------------------------------------- #
# Alertas: reglas (alta) + pase LLM defensivo en mock
# --------------------------------------------------------------------------- #
def test_alerta_regla_dispara_alta():
    rep = _reporte(date(2026, 6, 12), "comentó que tuvo un mareo fuerte")
    state = {
        "elder_id": "abuela",
        "reporte": rep,
        "transcripcion": "hoy tuve un mareo y dolor en el pecho",
    }
    out = alert.run(state)
    alertas = out["reporte"].alertas
    assert any(a.severidad == Severidad.alta for a in alertas)
    evidencias = {a.evidencia for a in alertas}
    assert "mareo" in evidencias
    assert "pecho" in evidencias


def test_alerta_pase_llm_no_rompe_en_mock():
    # sin palabras de riesgo => reglas no agregan nada; el pase LLM en mock
    # no debe romper ni inventar alertas.
    rep = _reporte(date(2026, 6, 12), "día tranquilo, sin novedades")
    state = {
        "elder_id": "abuela",
        "reporte": rep,
        "transcripcion": "hoy fue un día tranquilo",
    }
    out = alert.run(state)
    # el mock de LLM no devuelve alertas parseables => lista vacía, sin error
    assert out["reporte"].alertas == []


def test_alerta_no_duplica():
    rep = _reporte(date(2026, 6, 12), "mareo")
    state = {
        "elder_id": "abuela",
        "reporte": rep,
        "transcripcion": "mareo mareo mareo",
    }
    out = alert.run(state)
    evidencias = [a.evidencia for a in out["reporte"].alertas if a.evidencia == "mareo"]
    assert len(evidencias) == 1
