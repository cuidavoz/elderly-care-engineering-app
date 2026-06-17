"""Tests OFFLINE del digest semanal (digest.py).

Corren con LLM_PROVIDER=mock (forzado en conftest), así que la prosa del LLM es
genérica/determinista; lo que verificamos a fondo es la AGREGACIÓN DETERMINISTA
(que sí refleja los datos reales) y la FORMA EXACTA del dict del contrato.

Cada test apunta db_path a una ruta temporal (igual patrón que test_qa.py) y
seedéa reportes vía `get_report_store()` (SQLite), con fechas dentro del rango
de hoy para que el filtro por fecha los incluya.
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from src.agents.digest import generar_digest
from src.schemas import (
    Alerta,
    Animo,
    Reporte,
    Salud,
    Severidad,
    Sueno,
    CalidadSueno,
)
from src.storage import get_report_store


@pytest.fixture
def storage_tmp(tmp_path, monkeypatch):
    """Apunta db_path/chroma_path a rutas temporales aisladas por test."""
    from src.config import settings

    monkeypatch.setattr(settings, "db_path", str(tmp_path / "reports.db"))
    monkeypatch.setattr(settings, "chroma_path", str(tmp_path / "chroma"))
    return tmp_path


def _reporte(
    fecha: date,
    *,
    calidad: CalidadSueno = CalidadSueno.desconocida,
    medicacion=None,
    animo: str | None = None,
    sintomas=None,
    dolor: str | None = None,
    alertas=None,
    resumen: str = "",
) -> Reporte:
    return Reporte(
        fecha=fecha,
        salud=Salud(
            sintomas=sintomas or [], medicacion_tomada=medicacion, dolor=dolor
        ),
        sueno=Sueno(calidad=calidad),
        animo=Animo(estado=animo),
        alertas=alertas or [],
        resumen=resumen,
    )


# Claves que el contrato exige en el dict del digest.
_CLAVES_CONTRATO = {
    "elder_id",
    "desde",
    "hasta",
    "n_reportes",
    "resumen",
    "tendencias",
    "alertas_destacadas",
    "recomendaciones",
}
_CLAVES_TENDENCIAS = {"sueno", "animo", "salud", "medicacion"}


def test_digest_forma_y_agregacion_determinista(storage_tmp):
    """Seedea 3 reportes con sueño/medicación variados y verifica la forma del
    dict + que la agregación determinista cuenta correctamente."""
    store = get_report_store()
    hoy = date.today()

    # 3 reportes dentro de la última semana, distintas calidades y medicación.
    store.guardar(
        "abuela",
        _reporte(
            hoy - timedelta(days=2),
            calidad=CalidadSueno.buena,
            medicacion=True,
            animo="tranquila",
        ),
    )
    store.guardar(
        "abuela",
        _reporte(
            hoy - timedelta(days=1),
            calidad=CalidadSueno.mala,
            medicacion=False,
            animo="tranquila",
            sintomas=["tos"],
        ),
    )
    store.guardar(
        "abuela",
        _reporte(
            hoy,
            calidad=CalidadSueno.buena,
            medicacion=None,
            animo="contenta",
        ),
    )

    d = generar_digest("abuela", dias=7)

    # Forma exacta del contrato.
    assert set(d.keys()) == _CLAVES_CONTRATO
    assert set(d["tendencias"].keys()) == _CLAVES_TENDENCIAS
    assert d["elder_id"] == "abuela"
    assert d["hasta"] == hoy.isoformat()
    assert d["desde"] == (hoy - timedelta(days=6)).isoformat()
    assert isinstance(d["resumen"], str) and d["resumen"]
    assert isinstance(d["recomendaciones"], list)
    assert isinstance(d["alertas_destacadas"], list)

    # Agregación determinista: los 3 reportes están en el rango.
    assert d["n_reportes"] == 3

    # Medicación: 1 tomada, 1 no tomada, 1 sin dato.
    med = d["tendencias"]["medicacion"]
    assert "tomada: 1" in med
    assert "no tomada: 1" in med
    assert "sin dato: 1" in med

    # Sueño: 2 buenas, 1 mala (la distribución debe reflejarlo).
    sueno = d["tendencias"]["sueno"]
    assert "buena: 2" in sueno
    assert "mala: 1" in sueno

    # Ánimo: "tranquila" aparece 2 veces.
    assert "tranquila: 2" in d["tendencias"]["animo"]

    # Salud: el síntoma "tos" aparece 1 vez.
    assert "tos" in d["tendencias"]["salud"]


def test_digest_alertas_destacadas_alta_y_media(storage_tmp):
    """Solo las alertas alta/media del rango entran en alertas_destacadas,
    con la forma {tipo, severidad, evidencia, fecha} y alta antes que media."""
    store = get_report_store()
    hoy = date.today()

    store.guardar(
        "abuelo",
        _reporte(
            hoy - timedelta(days=1),
            alertas=[
                Alerta(tipo="baja_relevancia", severidad=Severidad.baja, evidencia="x"),
                Alerta(tipo="media_x", severidad=Severidad.media, evidencia="dolor"),
            ],
        ),
    )
    store.guardar(
        "abuelo",
        _reporte(
            hoy,
            alertas=[
                Alerta(tipo="caida", severidad=Severidad.alta, evidencia="se cayó"),
            ],
        ),
    )

    d = generar_digest("abuelo", dias=7)

    destacadas = d["alertas_destacadas"]
    # La baja NO entra; quedan la alta y la media.
    assert len(destacadas) == 2
    severidades = {a["severidad"] for a in destacadas}
    assert severidades == {"alta", "media"}
    # Forma de cada alerta destacada.
    for a in destacadas:
        assert set(a.keys()) == {"tipo", "severidad", "evidencia", "fecha"}
    # Alta primero.
    assert destacadas[0]["severidad"] == "alta"
    assert destacadas[0]["tipo"] == "caida"


def test_digest_filtra_fuera_de_rango(storage_tmp):
    """Reportes anteriores al rango quedan fuera de n_reportes."""
    store = get_report_store()
    hoy = date.today()

    store.guardar("abuela", _reporte(hoy, calidad=CalidadSueno.buena))
    # Muy viejo: fuera de la ventana de 7 días.
    store.guardar("abuela", _reporte(hoy - timedelta(days=30), calidad=CalidadSueno.mala))

    d = generar_digest("abuela", dias=7)
    assert d["n_reportes"] == 1
    assert "buena: 1" in d["tendencias"]["sueno"]


def test_digest_sin_reportes_estructura_amable(storage_tmp):
    """Sin reportes en el período => estructura completa, listas vacías y
    mensajes amables."""
    d = generar_digest("nadie", dias=7)

    assert set(d.keys()) == _CLAVES_CONTRATO
    assert set(d["tendencias"].keys()) == _CLAVES_TENDENCIAS
    assert d["elder_id"] == "nadie"
    assert d["n_reportes"] == 0
    assert d["alertas_destacadas"] == []
    assert d["recomendaciones"] == []
    assert "Sin reportes" in d["resumen"]
    for v in d["tendencias"].values():
        assert "Sin reportes" in v


def test_digest_aisla_por_elder(storage_tmp):
    """El digest de un elder no mezcla reportes de otro."""
    store = get_report_store()
    hoy = date.today()
    store.guardar("abuela", _reporte(hoy, calidad=CalidadSueno.buena))
    store.guardar("abuelo", _reporte(hoy, calidad=CalidadSueno.mala))

    d = generar_digest("abuela", dias=7)
    assert d["n_reportes"] == 1
    assert "buena: 1" in d["tendencias"]["sueno"]
    assert "mala" not in d["tendencias"]["sueno"]
