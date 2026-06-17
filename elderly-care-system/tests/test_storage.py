"""Tests OFFLINE de la capa de datos (subagente D).

Cubre ReportStore (SQLite) y VectorIndex (Chroma con embedding determinista).
Cada test usa rutas temporales propias (tmp_path) inyectadas por construcción
para no interferir con el directorio compartido del conftest.
"""
from __future__ import annotations

from datetime import date

import pytest

from src.schemas import Animo, Claim, Reporte, Salud, Sueno, CalidadSueno
from src.storage.store import ReportStore, VectorIndex


def _reporte(fecha: date, resumen: str, sintomas=None, actividades=None) -> Reporte:
    return Reporte(
        fecha=fecha,
        salud=Salud(sintomas=sintomas or []),
        sueno=Sueno(calidad=CalidadSueno.buena),
        animo=Animo(estado="tranquilo"),
        actividades=actividades or [],
        resumen=resumen,
        claims=[Claim(afirmacion=resumen, campo="resumen", fuente_textual=resumen)]
        if resumen
        else [],
    )


# --------------------------------------------------------------------------- #
# ReportStore (SQLite)
# --------------------------------------------------------------------------- #
def test_report_store_guardar_y_listar_orden(tmp_path):
    db = str(tmp_path / "reports.db")
    store = ReportStore(db_path=db)

    r1 = _reporte(date(2026, 6, 10), "primer reporte: durmió bien")
    r2 = _reporte(date(2026, 6, 11), "segundo reporte: dolor de cabeza leve")
    r3 = _reporte(date(2026, 6, 12), "tercer reporte: caminó en el parque")

    g1 = store.guardar("abuela", r1)
    g2 = store.guardar("abuela", r2)
    g3 = store.guardar("abuela", r3)

    # ids autogenerados y crecientes
    assert g1.id is not None and g2.id is not None and g3.id is not None
    assert g1.id < g2.id < g3.id

    listado = store.listar("abuela")
    assert len(listado) == 3
    # más recientes primero
    assert [g.id for g in listado] == [g3.id, g2.id, g1.id]
    # contenido intacto (round-trip)
    assert listado[0].reporte.resumen == "tercer reporte: caminó en el parque"
    assert listado[2].reporte.resumen == "primer reporte: durmió bien"
    assert listado[0].fecha == date(2026, 6, 12)


def test_report_store_aisla_por_elder(tmp_path):
    db = str(tmp_path / "reports.db")
    store = ReportStore(db_path=db)
    store.guardar("abuela", _reporte(date(2026, 6, 10), "reporte de abuela"))
    store.guardar("abuelo", _reporte(date(2026, 6, 10), "reporte de abuelo"))

    assert len(store.listar("abuela")) == 1
    assert len(store.listar("abuelo")) == 1
    assert store.listar("abuela")[0].reporte.resumen == "reporte de abuela"
    assert store.listar("nadie") == []


def test_report_store_respeta_limite(tmp_path):
    db = str(tmp_path / "reports.db")
    store = ReportStore(db_path=db)
    for i in range(5):
        store.guardar("abuela", _reporte(date(2026, 6, 10), f"reporte {i}"))
    assert len(store.listar("abuela", limite=2)) == 2


def test_report_store_persiste_entre_instancias(tmp_path):
    db = str(tmp_path / "reports.db")
    ReportStore(db_path=db).guardar(
        "abuela", _reporte(date(2026, 6, 10), "persistido en disco")
    )
    # nueva instancia, misma db => debe leer lo anterior
    listado = ReportStore(db_path=db).listar("abuela")
    assert len(listado) == 1
    assert listado[0].reporte.resumen == "persistido en disco"


# --------------------------------------------------------------------------- #
# VectorIndex (Chroma, embedding determinista offline)
# --------------------------------------------------------------------------- #
def test_vector_index_indexar_y_buscar(tmp_path):
    idx = VectorIndex(chroma_path=str(tmp_path / "chroma"))

    idx.indexar(
        "abuela",
        _reporte(date(2026, 6, 10), "durmió tranquila y descansó toda la noche"),
    )
    idx.indexar(
        "abuela",
        _reporte(
            date(2026, 6, 11),
            "se quejó de dolor de rodilla al caminar",
            sintomas=["dolor", "rodilla"],
        ),
    )

    # consulta que comparte tokens con el segundo reporte
    res = idx.buscar("abuela", "dolor de rodilla", k=2)
    assert len(res) >= 1
    # el más relevante debe ser el del dolor de rodilla
    assert "rodilla" in res[0].reporte.resumen
    # round-trip del Reporte
    assert isinstance(res[0].fecha, date)


def test_vector_index_filtra_por_elder(tmp_path):
    idx = VectorIndex(chroma_path=str(tmp_path / "chroma"))
    idx.indexar("abuela", _reporte(date(2026, 6, 10), "abuela durmió bien"))
    idx.indexar("abuelo", _reporte(date(2026, 6, 10), "abuelo durmió mal"))

    res = idx.buscar("abuela", "durmió", k=5)
    assert len(res) == 1
    assert res[0].elder_id == "abuela"
    assert "abuela" in res[0].reporte.resumen


def test_vector_index_sin_datos_devuelve_vacio(tmp_path):
    idx = VectorIndex(chroma_path=str(tmp_path / "chroma"))
    assert idx.buscar("nadie", "cualquier pregunta", k=5) == []


def test_vector_index_idempotente(tmp_path):
    """Reindexar el mismo reporte no duplica entradas (upsert por firma)."""
    idx = VectorIndex(chroma_path=str(tmp_path / "chroma"))
    rep = _reporte(date(2026, 6, 10), "reporte único")
    idx.indexar("abuela", rep)
    idx.indexar("abuela", rep)
    res = idx.buscar("abuela", "reporte único", k=5)
    assert len(res) == 1
