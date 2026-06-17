"""Tests OFFLINE del formateo de mensajes del bot de Telegram (subagente E).

Sólo testea la función pura _formatear_respuesta (sin red ni Telegram).
"""
from __future__ import annotations

from src.ingestion.telegram_bot import _formatear_respuesta


def test_formatea_resumen_simple():
    payload = {
        "reporte": {"resumen": "Durmió bien y caminó.", "alertas": [], "incompleto": False},
        "confianza": 0.9,
        "error": None,
    }
    texto = _formatear_respuesta(payload)
    assert "Durmió bien y caminó." in texto
    assert "Alertas" not in texto


def test_resalta_alertas_con_severidad():
    payload = {
        "reporte": {
            "resumen": "Se sintió mareada.",
            "alertas": [
                {"tipo": "caida", "severidad": "alta", "evidencia": "se cayó"},
            ],
            "incompleto": False,
        },
        "confianza": 0.8,
        "error": None,
    }
    texto = _formatear_respuesta(payload)
    assert "Alertas detectadas" in texto
    assert "caida" in texto
    assert "alta" in texto
    assert "🔴" in texto  # emoji de severidad alta


def test_pide_reenvio_si_error():
    payload = {"reporte": None, "confianza": 0.0, "error": "transcripción vacía"}
    texto = _formatear_respuesta(payload)
    assert "reenviá" in texto.lower() or "reenvia" in texto.lower()
    assert "transcripción vacía" in texto


def test_pide_reenvio_si_incompleto():
    payload = {
        "reporte": {"resumen": "ok", "alertas": [], "incompleto": True},
        "confianza": 0.3,
        "error": None,
    }
    texto = _formatear_respuesta(payload)
    assert "incompleto" in texto.lower()


def test_reporte_nulo_sin_error_pide_reenvio():
    payload = {"reporte": None, "confianza": 0.0, "error": None}
    texto = _formatear_respuesta(payload)
    assert "reenviá" in texto.lower() or "reenvia" in texto.lower()
