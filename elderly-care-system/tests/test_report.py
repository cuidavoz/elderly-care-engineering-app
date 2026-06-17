"""Tests del nodo de reporte (report.py).

Corren OFFLINE: `conftest.py` fuerza LLM_PROVIDER=mock, así que no se llama a
ninguna API. Verifican: (1) reporte válido + guard de faithfulness, (2) parseo
robusto ante fences/ruido, (3) camino incompleto por baja confianza.
"""
from __future__ import annotations

from datetime import date

from src.agents import report
from src.agents.report import (
    _calcular_faithfulness,
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
    # Sin claims que medir: la fidelidad queda en None (más honesto que un score
    # sobre cero claims).
    assert rep.faithfulness is None


# --------------------------------------------------------------------------- #
# Faithfulness (F7.1): la métrica se mide sobre los claims CRUDOS del LLM,
# ANTES del guard. Por eso puede dar < 1.0 aunque después `reporte.claims`
# quede con solo los fundamentados.
# --------------------------------------------------------------------------- #

# JSON con 3 claims: 2 citan substrings reales de TRANSCRIPCION y 1 está
# inventado (no aparece en el texto). Sirve para forzar un score no trivial.
_RAW_CON_CLAIM_INVENTADO = (
    '{"resumen": "dolor en la rodilla", '
    '"claims": ['
    '{"afirmacion": "dolor", "campo": "salud.dolor", '
    '"fuente_textual": "dolor en la rodilla"}, '
    '{"afirmacion": "medicacion", "campo": "salud.medicacion_tomada", '
    '"fuente_textual": "Tomé la medicación"}, '
    '{"afirmacion": "inventado", "campo": "salud.sintomas", '
    '"fuente_textual": "se cayó por la escalera"}'
    "]}"
)


def test_faithfulness_sobre_crudos_no_es_trivial(monkeypatch):
    """Con un claim inventado entre los crudos, el score baja de 1.0 y refleja
    TODOS los claims del LLM, aunque el guard luego deje solo los fundamentados.

    Este es el test clave: demuestra que la métrica NO es 1.0 trivial porque se
    mide ANTES del filtro.
    """
    monkeypatch.setattr(
        report.LLMClient, "complete",
        lambda self, system, user, json_mode=False: _RAW_CON_CLAIM_INVENTADO,
    )
    out = report.run({"transcripcion": TRANSCRIPCION})
    rep = out["reporte"]

    fa = rep.faithfulness
    assert fa is not None
    assert fa.metodo == "substring"
    # 3 claims crudos, 2 fundamentados.
    assert fa.n_claims == 3
    assert fa.n_grounded == 2
    assert fa.score is not None
    assert 0 < fa.score < 1
    assert fa.score == 2 / 3

    # El guard sí descartó el inventado: `reporte.claims` tiene solo los fieles,
    # pero `faithfulness.n_claims` sigue contando los 3 crudos.
    assert len(rep.claims) == 2
    assert fa.n_claims > len(rep.claims)
    assert "inventado" not in {c.afirmacion for c in rep.claims}


def test_faithfulness_todos_fundamentados_da_uno():
    """Si todos los claims crudos están en la transcripción, score == 1.0."""
    rep = Reporte(
        fecha=date.today(),
        claims=[
            Claim(afirmacion="dolor", campo="salud.dolor",
                  fuente_textual="dolor en la rodilla"),
            Claim(afirmacion="med", campo="salud.medicacion_tomada",
                  fuente_textual="Tomé la medicación"),
        ],
    )
    fa = _calcular_faithfulness(rep, TRANSCRIPCION)
    assert fa.n_claims == 2
    assert fa.n_grounded == 2
    assert fa.score == 1.0


def test_faithfulness_cero_claims_da_none():
    """Sin claims crudos, score is None y n_claims == 0."""
    rep = Reporte(fecha=date.today(), claims=[])
    fa = _calcular_faithfulness(rep, TRANSCRIPCION)
    assert fa.score is None
    assert fa.n_claims == 0
    assert fa.n_grounded == 0


def test_run_mock_todos_fundamentados_da_uno():
    """Con el LLM mock (claims = substrings reales), el score es 1.0 y refleja
    los claims crudos del mock."""
    out = report.run({"transcripcion": TRANSCRIPCION})
    rep = out["reporte"]
    fa = rep.faithfulness
    assert fa is not None
    assert fa.n_claims >= 1
    assert fa.n_grounded == fa.n_claims
    assert fa.score == 1.0


# --------------------------------------------------------------------------- #
# claims_descartados (F8.1): el guard ya no PIERDE los claims no fieles; los
# parte en una sola pasada entre `reporte.claims` (fieles) y
# `reporte.claims_descartados` (las "alucinaciones" filtradas), para mostrar en
# la UI qué afirmó el modelo sin sustento.
# --------------------------------------------------------------------------- #


def test_claims_descartados_conserva_inventados(monkeypatch):
    """Con claims mixtos, los fieles quedan en `claims` y los inventados en
    `claims_descartados`; se cumplen los invariantes contra `faithfulness`."""
    monkeypatch.setattr(
        report.LLMClient, "complete",
        lambda self, system, user, json_mode=False: _RAW_CON_CLAIM_INVENTADO,
    )
    out = report.run({"transcripcion": TRANSCRIPCION})
    rep = out["reporte"]
    fa = rep.faithfulness

    # Los inventados se conservan exactamente (ni más, ni menos).
    assert {c.afirmacion for c in rep.claims} == {"dolor", "medicacion"}
    assert {c.afirmacion for c in rep.claims_descartados} == {"inventado"}

    # Invariantes de la partición contra la métrica (sobre los claims crudos).
    assert fa.n_claims == 3
    assert fa.n_grounded == 2
    assert len(rep.claims) + len(rep.claims_descartados) == fa.n_claims
    assert len(rep.claims) == fa.n_grounded
    assert len(rep.claims_descartados) == fa.n_claims - fa.n_grounded

    # Ningún descartado cumple _es_fiel; todos los conservados sí.
    base = report._normalizar(TRANSCRIPCION)
    assert all(not report._es_fiel(c, base) for c in rep.claims_descartados)
    assert all(report._es_fiel(c, base) for c in rep.claims)


def test_claims_descartados_vacio_si_todos_fieles():
    """Si todos los claims crudos están respaldados, `claims_descartados` queda
    vacío y todos los crudos van a `claims`."""
    rep = Reporte(
        fecha=date.today(),
        claims=[
            Claim(afirmacion="dolor", campo="salud.dolor",
                  fuente_textual="dolor en la rodilla"),
            Claim(afirmacion="med", campo="salud.medicacion_tomada",
                  fuente_textual="Tomé la medicación"),
        ],
    )
    filtrado = _filtrar_claims_no_fieles(rep, TRANSCRIPCION)
    assert filtrado.claims_descartados == []
    assert len(filtrado.claims) == 2


def test_claims_descartados_vacio_sin_claims():
    """Sin claims crudos (p. ej. camino incompleto), `claims_descartados` queda
    vacío: la partición no inventa nada."""
    rep = Reporte(fecha=date.today(), claims=[])
    filtrado = _filtrar_claims_no_fieles(rep, TRANSCRIPCION)
    assert filtrado.claims == []
    assert filtrado.claims_descartados == []


def test_camino_incompleto_no_rompe_claims_descartados():
    """El camino incompleto (transcripción poco confiable) no produce claims, así
    que `claims_descartados` queda en su default vacío."""
    out = report.run({
        "transcripcion": "ruido inentendible",
        "error": "transcripcion_poco_confiable",
    })
    rep = out["reporte"]
    assert rep.incompleto is True
    assert rep.claims == []
    assert rep.claims_descartados == []
