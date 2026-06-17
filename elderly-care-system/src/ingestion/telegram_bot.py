"""Ingestión de mensajes de voz vía Telegram.  Responsable: Integrante E.

Telegram en vez de WhatsApp: bot API gratuita y sin proceso de aprobación.
La ingestión está detrás de esta capa para poder migrar a WhatsApp luego.

Flujo: el adulto mayor manda un mensaje de voz -> el bot baja el .ogg ->
lo postea a POST {API_BASE}/reportes -> le devuelve al usuario el resumen y,
si hay alertas, las resalta. La generación del reporte vive en la API; este
módulo es sólo la capa de transporte (descarga del audio + HTTP + formateo).
"""
from __future__ import annotations

import logging
import os
import tempfile

import requests
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from src.config import settings

# URL de la API configurable por entorno (sin tocar config.py, según consigna).
API_BASE = os.getenv("CUIDAVOZ_API_BASE", "http://localhost:8000")

# Timeout del POST a /reportes: el pipeline corre ASR + LLM, así que puede
# tardar. Generoso pero acotado para no colgar el handler indefinidamente.
REQUEST_TIMEOUT = 120

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("cuidavoz.telegram")

# Emoji por severidad para resaltar alertas en el mensaje de vuelta.
_EMOJI_SEVERIDAD = {"alta": "🔴", "media": "🟠", "baja": "🟡"}


def _formatear_respuesta(payload: dict) -> str:
    """Arma el texto que se le devuelve al usuario a partir de la respuesta
    de la API (``{"reporte": ...|null, "confianza": float, "error": str|null}``).

    Función pura (sin red ni I/O) para poder testearla de forma liviana.
    """
    error = payload.get("error")
    reporte = payload.get("reporte")

    # Caso de error explícito del pipeline o falta de reporte.
    if error or reporte is None:
        detalle = f" ({error})" if error else ""
        return (
            "😕 No pude procesar el audio" + detalle + ".\n"
            "Por favor, reenviá el mensaje de voz hablando claro y sin ruido."
        )

    lineas: list[str] = []

    resumen = (reporte.get("resumen") or "").strip()
    if resumen:
        lineas.append(f"📝 {resumen}")
    else:
        lineas.append("📝 Recibí tu mensaje, ¡gracias!")

    # Alertas resaltadas (emoji + severidad).
    alertas = reporte.get("alertas") or []
    if alertas:
        lineas.append("")  # separador visual
        lineas.append("⚠️ *Alertas detectadas:*")
        for a in alertas:
            sev = a.get("severidad", "baja")
            emoji = _EMOJI_SEVERIDAD.get(sev, "⚠️")
            tipo = a.get("tipo", "alerta")
            evidencia = a.get("evidencia", "")
            lineas.append(f"{emoji} {tipo} ({sev}): {evidencia}")

    # Si la transcripción fue poco confiable, pedimos reenviar.
    if reporte.get("incompleto"):
        lineas.append("")
        lineas.append(
            "ℹ️ El audio quedó incompleto o poco claro. Si podés, reenvialo "
            "para registrar todo bien."
        )

    return "\n".join(lineas)


async def on_voice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handler de mensajes de voz: baja el .ogg, lo postea a la API y responde."""
    message = update.message
    if message is None or message.voice is None:
        return

    # elder_id: usamos el chat_id (entero estable y siempre presente). El
    # username puede no estar configurado y cambia; el chat_id identifica de
    # forma unívoca la conversación con ese adulto mayor. Lo pasamos como str
    # porque el contrato de /reportes espera un campo de texto.
    elder_id = str(message.chat_id)

    await message.reply_text("🎧 Recibí tu audio, lo estoy procesando...")

    tmp_path: str | None = None
    try:
        # Descarga del archivo de voz a un temporal .ogg.
        archivo = await message.voice.get_file()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".ogg") as tmp:
            tmp_path = tmp.name
        await archivo.download_to_drive(tmp_path)

        # POST a la API con form-data (elder_id) + archivo (audio).
        with open(tmp_path, "rb") as fh:
            resp = requests.post(
                f"{API_BASE}/reportes",
                data={"elder_id": elder_id},
                files={"audio": ("mensaje.ogg", fh, "audio/ogg")},
                timeout=REQUEST_TIMEOUT,
            )
        resp.raise_for_status()
        payload = resp.json()

    except requests.exceptions.Timeout:
        logger.warning("Timeout al postear el audio a la API (elder_id=%s)", elder_id)
        await message.reply_text(
            "⏳ El servidor tardó demasiado en responder. Probá reenviar el audio "
            "en un rato."
        )
        return
    except requests.exceptions.RequestException as exc:
        logger.error("Error de red al postear el audio: %s", exc)
        await message.reply_text(
            "🔌 No pude conectarme con el servidor. Por favor, reenviá el audio "
            "más tarde."
        )
        return
    except Exception as exc:  # noqa: BLE001 - robustez: nunca dejar al usuario sin respuesta
        logger.exception("Error inesperado procesando el audio: %s", exc)
        await message.reply_text(
            "😕 Ocurrió un problema procesando tu audio. Por favor, reenvialo."
        )
        return
    finally:
        # Limpieza del temporal pase lo que pase.
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                logger.warning("No pude borrar el temporal %s", tmp_path)

    # Respuesta formateada (resumen + alertas resaltadas / pedido de reenvío).
    texto = _formatear_respuesta(payload)
    try:
        await message.reply_text(texto, parse_mode="Markdown")
    except Exception:  # noqa: BLE001 - si el Markdown falla, mandamos texto plano
        await message.reply_text(texto)


async def on_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Comando /start: saludo breve con instrucciones."""
    if update.message is None:
        return
    await update.message.reply_text(
        "👋 ¡Hola! Soy CuidaVoz.\n"
        "Mandame un mensaje de voz contándome cómo estás (cómo dormiste, cómo "
        "te sentís, si tomaste la medicación...) y le preparo un resumen a tu "
        "familia. 💜"
    )


def build_app() -> Application:
    """Construye la Application con sus handlers (sin arrancar el polling).

    Separado de ``main()`` para poder construir/inspeccionar la app en tests
    sin disparar la red.
    """
    app = Application.builder().token(settings.telegram_bot_token).build()
    app.add_handler(CommandHandler("start", on_start))
    app.add_handler(MessageHandler(filters.VOICE, on_voice))
    return app


def main() -> None:
    """Arranca el bot por polling.  Requiere settings.telegram_bot_token."""
    if not settings.telegram_bot_token:
        raise SystemExit("Falta TELEGRAM_BOT_TOKEN en .env")
    logger.info("Iniciando bot de CuidaVoz (API_BASE=%s)", API_BASE)
    app = build_app()
    app.run_polling()


if __name__ == "__main__":
    main()
