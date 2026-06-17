"""Tests del nodo de reporte (report.py).

Corren OFFLINE: `conftest.py` fuerza LLM_PROVIDER=mock, así que no se llama a
ninguna API. Verifican: (1) reporte válido + guard de faithfulness, (2) parseo
robusto ante fences/ruido, (3) camino incompleto por baja confianza.
"""
from __future__ import annotations

from datetime import date

from src.agents import report
from src.agents.report import (
    _extraer_json,
    _filtrar_claims_no_fieles,
    _parsear_reporte,
)
from src.schemas import Claim, Reporte

TRANSCRIPCION = (
    "Hoy me desperté con un poco de dolor en la rodilla. Tomé la medicación a la "
    "mañana. Dormí bien y estoy de buen ánimo."
)


def test_run_devuelve_reporte_y_claims_fieles():
    """Caso 1: run() produce un Reporte válido y todos los claims tienen
    fuente_textual que es substring de la transcripción (guard)."""
    state = {"transcripcion": TRANSCRIPCION}
    out = report.run(state)

    rep = out["reporte"]
    assert isinstance(rep, Reporte)
    assert rep.incompleto is False
    assert rep.claims, "el mock debería producir al menos un claim citable"

    base = TRANSCRIPCION.lower()
    for c in rep.claims:
        # Comparación laxa equivalente a la del guard (sin acentos ni espacios
        # extra); acá la transcripción no tiene tildes problemáticas, así que
        # alcanza con minúsculas.
        assert c.fuente_textual.lower() in base


def test_guard_descarta_claim_inventado():
    """El guard elimina claims cuyo fuente_textual no está en la transcripción."""
    rep = Reporte(
        fecha=date.today(),
        claims=[
            Claim(afirmacion="real", campo="resumen",
                  fuente_textual="dolor en la rodilla"),
            Claim(afirmacion="inventado", campo="salud.dolor",
                  fuente_textual="se cayó por la escalera"),
        ],
    )
    filtrado = _filtrar_claims_no_fieles(rep, TRANSCRIPCION)
    afirmaciones = {c.afirmacion for c in filtrado.claims}
    assert "real" in afirmaciones
    assert "inventado" not in afirmaciones


def test_guard_normaliza_acentos_y_espacios():
    """El guard tolera diferencias de mayúsculas, espacios y tildes."""
    transcripcion = "Tomé la medicación por la mañana."
    rep = Reporte(
        fecha=date.today(),
        claims=[
            # Sin tilde, mayúsculas distintas y espacios extra: igual debe pasar.
            Claim(afirmacion="med", campo="salud.medicacion_tomada",
                  fuente_textual="TOME  la  MEDICACION"),
        ],
    )
    filtrado = _filtrar_claims_no_fieles(rep, transcripcion)
    assert len(filtrado.claims) == 1


def test_parseo_robusto_con_fences_y_ruido():
    """Caso 2: parseo robusto. JSON envuelto en fences markdown y texto alrededor
    igual produce un Reporte válido."""
    raw = (
        "Claro, acá va el reporte:\n"
        "```json\n"
        '{"resumen": "todo bien", "salud": {"sintomas": ["tos"]}, '
        '"claims": [{"afirmacion": "tos", "campo": "salud.sintomas", '
        '"fuente_textual": "tos"}]}\n'
        "```\n"
        "Avisame si necesitás otra cosa."
    )
    rep = _parsear_reporte(raw, "el paciente tiene tos")
    assert isinstance(rep, Reporte)
    assert rep.resumen == "todo bien"
    assert rep.salud.sintomas == ["tos"]
    assert rep.fecha == date.today()  # default cuando el LLM no la incluye


def test_extraer_json_objeto_balanceado():
    """_extraer_json toma el primer objeto {...} balanceado, ignorando ruido y
    llaves dentro de strings."""
    raw = 'basura {"a": {"b": "tiene } llave"}, "c": 1} más basura'
    assert _extraer_json(raw) == '{"a": {"b": "tiene } llave"}, "c": 1}'


def test_parseo_invalido_cae_a_reporte_minimo():
    """Si la respuesta no es JSON parseable, cae a un reporte mínimo válido."""
    rep = _parsear_reporte("esto no es json", "transcripción de respaldo")
    assert isinstance(rep, Reporte)
    assert rep.resumen == "transcripción de respaldo"
    assert rep.claims == []


def test_camino_incompleto_por_baja_confianza():
    """Caso 3: con error de confianza, el reporte queda incompleto y sin inventar."""
    state = {
        "transcripcion": "ruido inentendible",
        "error": "transcripcion_poco_confiable",
    }
    out = report.run(state)
    rep = out["reporte"]
    assert isinstance(rep, Reporte)
    assert rep.incompleto is True
    assert rep.claims == []
