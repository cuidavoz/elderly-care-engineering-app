"""Configuración central (lee de .env)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: str = "anthropic"
    anthropic_api_key: str = ""
    llm_model_report: str = "claude-sonnet-4-6"
    llm_model_light: str = "claude-haiku-4-5-20251001"

    whisper_model: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    telegram_bot_token: str = ""
    db_path: str = "./data/reports.db"
    chroma_path: str = "./data/chroma"


settings = Settings()
