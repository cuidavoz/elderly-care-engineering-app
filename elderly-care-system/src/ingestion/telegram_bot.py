"""Ingestión de mensajes de voz vía Telegram.  Responsable: Integrante E.

Telegram en vez de WhatsApp: bot API gratuita y sin proceso de aprobación.
La ingestión está detrás de esta capa para poder migrar a WhatsApp luego.
"""
from __future__ import annotations
from src.config import settings


def main():
    """TODO(E): con python-telegram-bot, escuchar mensajes de voz, bajar el
    .ogg, postearlo a POST /reportes, y devolverle al familiar el resumen +
    alertas. Token en settings.telegram_bot_token.
    """
    if not settings.telegram_bot_token:
        raise SystemExit("Falta TELEGRAM_BOT_TOKEN en .env")
    print("TODO: implementar bot de Telegram")


if __name__ == "__main__":
    main()
