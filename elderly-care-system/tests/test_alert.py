"""Tests del nodo de alertas (alert.py).

Corren OFFLINE: `conftest.py` fuerza LLM_PROVIDER=mock, así que no se llama a
ninguna API y el pase LLM no agrega alertas reales (el mock json_mode devuelve
un reporte con `alertas: []`). Por eso la severidad ALTA que se observa acá sale
SIEMPRE de las reglas determinísticas (la red de seguridad), que es justamente
lo que queremos blindar.

Cubre los bugs auditados:
  1. Normalización de acentos: una caída sin tilde ("me cai") igual dispara ALTA.
  2. Matching por límite de palabra: "pecho" NO matchea dentro de "pechuga".
  3. `_parsear_alertas` tolera fences markdown (```json ... ```).
"""
from __future__ import annotations

from datetime import date

from src.agents import alert
from src.agents.alert import _aplicar_reglas, _parsear_alertas
from src.schemas import Alerta, Reporte, Severidad


def _correr_alertas(transcripcion: str) -> Reporte:
    """Corre el nodo de alertas sobre una transcripción y devuelve el reporte.

    Imita el estilo de los tests de report.py: arma un `state` mínimo con un
    `Reporte` vacío y la transcripción, e invoca `alert.run`.
    """
    rep = Reporte(fecha=date.today())
    state = {"reporte": rep, "transcripcion": transcripcion, "elder_id": "test"}
    out = alert.run(state)
    return out["reporte"]


def _hay_alerta_alta(rep: Reporte) -> bool:
    """Mismo predicado que usa memory.run para decidir `state['notificar']`."""
    return any(a.severidad == Severidad.alta for a in rep.alertas)


def _derivar_notificar(rep: Reporte) -> bool:
    """Deriva la intención de notificar tal como lo hace el nodo `persist`
    (memory.run): True si hay al menos una alerta de severidad ALTA. Lo
    replicamos acá para no acoplar el test al storage real, manteniendo la
    misma semántica de producto."""
    return _hay_alerta_alta(rep)


def test_caida_sin_tilde_dispara_alta_y_notificar():
    """Bug 1 (el más crítico): una caída real escrita/transcripta SIN tilde
    igual tiene que disparar una alerta ALTA y marcar la intención de notificar.
    """
    rep = _correr_alertas(
        "hoy me cai en el baño y no me puedo levantar"
    )
    altas = [a for a in rep.alertas if a.severidad == Severidad.alta]
    assert altas, "una caída sin tilde debe disparar al menos una alerta ALTA"
    assert _derivar_notificar(rep) is True


def test_caida_con_tilde_tambien_dispara_alta():
    """Variante con tilde: debe seguir disparando (no rompimos el caso original)."""
    rep = _correr_alertas("hoy me caí en el baño y no me puedo levantar")
    assert _hay_alerta_alta(rep)
    assert _derivar_notificar(rep) is True


def test_pechuga_no_es_falso_positivo_de_pecho():
    """Bug 2: el matching por substring marcaba "pecho" dentro de "pechuga".
    Con límite de palabra eso NO debe ocurrir: comer pechuga no es una alerta.
    """
    rep = _correr_alertas("comí pechuga al horno y dormí bien")
    assert not _hay_alerta_alta(rep), "no debe haber ALTA por 'pecho' en 'pechuga'"
    assert _derivar_notificar(rep) is False


def test_dolor_de_pecho_si_dispara_alta():
    """Un dolor de pecho real SÍ debe disparar una alerta ALTA."""
    rep = _correr_alertas("tengo un dolor de pecho fuerte")
    altas = [a for a in rep.alertas if a.severidad == Severidad.alta]
    assert altas, "un dolor de pecho debe disparar alerta ALTA"
    assert _derivar_notificar(rep) is True


def test_sangria_no_es_falso_positivo_de_sangre():
    """Otro caso de substring espurio: "sangre" dentro de "sangría"."""
    rep = _correr_alertas("tomé sangría en la cena y estuve tranquilo")
    assert not _hay_alerta_alta(rep), "no debe haber ALTA por 'sangre' en 'sangría'"


def test_variantes_de_riesgo_disparan_alta():
    """Cobertura de variantes razonables agregadas al set de riesgo."""
    frases = [
        "siento falta de aire desde ayer",
        "no puedo respirar bien",
        "tuve un desmayo en la cocina",
        "se cayó de la cama anoche",
        "vi sangre en el pañuelo",
    ]
    for frase in frases:
        rep = _correr_alertas(frase)
        assert _hay_alerta_alta(rep), f"esperaba ALTA para: {frase!r}"


def test_parsear_alertas_tolera_fences_markdown():
    """Bug 3: `_parsear_alertas` con JSON envuelto en fences ```json ... ``` no
    debe descartar la alerta: tiene que devolver la alerta baja."""
    raw = (
        "```json\n"
        '{"alertas":[{"tipo":"animo","severidad":"baja","evidencia":"triste"}]}\n'
        "```"
    )
    alertas = _parsear_alertas(raw)
    assert len(alertas) == 1
    a = alertas[0]
    assert isinstance(a, Alerta)
    assert a.tipo == "animo"
    assert a.severidad == Severidad.baja
    assert a.evidencia == "triste"


def test_parsear_alertas_texto_no_json_se_ignora():
    """Robustez: texto libre que no contiene JSON se ignora sin romper."""
    assert _parsear_alertas("no hay nada estructurado acá") == []
    assert _parsear_alertas("") == []


def test_llm_nunca_escala_a_alta(monkeypatch):
    """Garantía clave: el pase LLM solo puede agregar baja/media; si el LLM
    devolviera una alerta ALTA, debe ser descartada. La ALTA es exclusiva de las
    reglas. Forzamos un LLM que intenta colar una ALTA junto a una baja válida.
    """
    raw = (
        '{"alertas":['
        '{"tipo":"intruso","severidad":"alta","evidencia":"el LLM intenta escalar"},'
        '{"tipo":"animo","severidad":"baja","evidencia":"un poco triste"}'
        "]}"
    )
    monkeypatch.setattr(
        alert.LLMClient,
        "complete",
        lambda self, system, user, json_mode=False: raw,
    )
    # Transcripción sin palabras de riesgo: las reglas NO agregan ninguna ALTA,
    # así que cualquier ALTA presente vendría (indebidamente) del LLM.
    rep = Reporte(fecha=date.today(), resumen="se lo notó un poco triste hoy")
    state = {"reporte": rep, "transcripcion": "se lo notó un poco triste hoy",
             "elder_id": "test"}
    out = alert.run(state)
    rep = out["reporte"]

    assert not _hay_alerta_alta(rep), "el LLM nunca debe poder escalar a ALTA"
    # La baja válida sí se incorpora.
    bajas = [a for a in rep.alertas if a.severidad == Severidad.baja]
    assert any(a.tipo == "animo" for a in bajas)
