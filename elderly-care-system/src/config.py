"""Configuración central (lee de .env)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: str = "anthropic"
    anthropic_api_key: str = ""
    # Reporte con haiku (no sonnet) a propósito: es más rápido y mantiene el
    # total (transcripción + reporte) dentro del timeout de 60s de Vercel Hobby.
    # Sonnet daría mejor fidelidad pero corre riesgo de pasarse del límite.
    llm_model_report: str = "claude-haiku-4-5-20251001"
    llm_model_light: str = "claude-haiku-4-5-20251001"
    # Agente de seguimiento proactivo (P18). Modelo POR-FEATURE: es el hook para
    # migrar SOLO este agente a un modelo propio (p. ej. self-hosteado en la VM)
    # sin tocar el resto — se cambia acá, y para un proveedor nuevo se agrega en
    # pipeline/llm.py. El módulo del agente no cambia.
    llm_model_followup: str = "claude-haiku-4-5-20251001"

    groq_api_key: str = ""

    asr_provider: str = "faster_whisper"   # "faster_whisper" | "groq" | "mock"
    # "tiny" es el que pre-descarga el Dockerfile y el único que entra en los
    # 512MB del free tier de Render. NO subir a "base" sin más RAM: OOM al
    # transcribir. Override con WHISPER_MODEL solo si el host tiene memoria.
    whisper_model: str = "tiny"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    telegram_bot_token: str = ""
    db_path: str = "./data/reports.db"
    chroma_path: str = "./data/chroma"

    storage_backend: str = "sqlite"  # "sqlite" | "postgres"
    database_url: str = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

    # Token compartido server-to-server: el web app (Next) lo manda en el header
    # `X-Internal-Token` y la API lo valida. La API usa el service role (bypassa
    # RLS), así que sin este token quedaría expuesta a cualquiera que conozca un
    # elder_id. Si queda vacío, la API arranca en modo abierto (con warning) para
    # no romper despliegues existentes; SETEARLO en prod cierra el acceso.
    internal_api_token: str = ""


settings = Settings()
