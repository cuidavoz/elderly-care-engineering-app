"""Capa de almacenamiento: persistencia estructurada + índice semántico (RAG).

Contrato congelado en Fase 0; dos implementaciones detrás de las mismas firmas:
  - SQLite/Chroma (offline, default `storage_backend="sqlite"`) — `store.py`.
  - Postgres/pgvector (Supabase, multi-tenant) — `postgres.py`.

La fábrica (`get_report_store` / `get_vector_index`) elige según
`settings.storage_backend`. Los call sites (memory, caregiver_qa, api) usan la
fábrica, así que cambiar de backend es una sola variable de entorno.
"""
from src.config import settings
from src.storage.store import ReporteGuardado, ReportStore, VectorIndex

__all__ = [
    "ReporteGuardado",
    "ReportStore",
    "VectorIndex",
    "get_report_store",
    "get_vector_index",
]


def get_report_store():
    """Devuelve la implementación de `ReportStore` según el backend configurado.

    `sqlite` (default) → `ReportStore` (SQLite).
    `postgres`         → `PostgresReportStore` (Supabase).
    """
    if settings.storage_backend == "postgres":
        from src.storage.postgres import PostgresReportStore

        return PostgresReportStore()
    return ReportStore()


def get_vector_index():
    """Devuelve la implementación de `VectorIndex` según el backend configurado.

    `sqlite` (default) → `VectorIndex` (Chroma).
    `postgres`         → `PostgresVectorIndex` (pgvector).
    """
    if settings.storage_backend == "postgres":
        from src.storage.postgres import PostgresVectorIndex

        return PostgresVectorIndex()
    return VectorIndex()
