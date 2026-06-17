"""Configuración central (lee de .env)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: str = "anthropic"
    anthropic_api_key: str = ""
    llm_model_report: str = "claude-sonnet-4-6"
    llm_model_light: str = "claude-haiku-4-5-20251001"

    asr_provider: str = "faster_whisper"   # "faster_whisper" | "mock"
    whisper_model: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    telegram_bot_token: str = ""
    db_path: str = "./data/reports.db"
    chroma_path: str = "./data/chroma"

    storage_backend: str = "sqlite"  # "sqlite" | "postgres"
    database_url: str = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


settings = Settings()
