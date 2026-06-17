"""Implementación Postgres + pgvector (Supabase) de la capa de almacenamiento.

Misma firma congelada que `src/storage/store.py` (SQLite/Chroma), pero
**tenant-aware**: persiste en el Postgres multi-tenant de Supabase. El backend
Python se conecta con el usuario `postgres` (service role) que **bypassa RLS**;
es responsable de escribir únicamente en el tenant correcto.

El `family_id` NO viaja en la firma: se resuelve consultando `elders.family_id`
a partir del `elder_id` (un UUID de la tabla `elders`). Si el elder no existe,
se lanza `ElderNoEncontrado`.

Tablas (ver `supabase/migrations/0001_init.sql`):
  - `reports`            : reporte estructurado (payload jsonb = esquema Reporte).
  - `alerts`             : una fila por alerta del reporte (para el dashboard).
  - `report_embeddings`  : vector(1536) para RAG (pgvector).
  - función `match_reports(_elder_id, _query_embedding, _match_count)`.

Embedding: determinista por hashing a 1536 dimensiones (offline, sin red ni
modelos). En producción se reemplaza `_HashingEmbedding1536` por un embedder
real (OpenAI / Voyage / sentence-transformers) sin tocar el resto.
"""
from __future__ import annotations

import hashlib
import json
import threading
from datetime import date

import psycopg
from psycopg.types.json import Jsonb

from src.config import settings
from src.schemas import Reporte
from src.storage.store import ReporteGuardado


class ElderNoEncontrado(ValueError):
    """El `elder_id` dado no existe en la tabla `elders`."""


# --------------------------------------------------------------------------- #
# Embedding determinista 1536-dim (offline)
# --------------------------------------------------------------------------- #
#
# La columna pgvector es `vector(1536)`. Reusamos la misma idea que
# `_HashingEmbedding` de store.py (bag-of-words con hashing md5, estable entre
# procesos y sin descargas) pero a dimensión 1536 para matchear la columna.
#
# EN PRODUCCIÓN se reemplaza por un embedder real (OpenAI text-embedding-3-small
# es 1536-dim, Voyage, sentence-transformers, etc.): basta cambiar esta clase;
# `PostgresVectorIndex` no cambia.
class _HashingEmbedding1536:
    """Embedding determinista por hashing de tokens (bag-of-words), 1536-dim."""

    DIM = 1536

    @staticmethod
    def _tokenizar(texto: str) -> list[str]:
        return [t for t in (texto or "").lower().split() if t]

    def embed(self, texto: str) -> list[float]:
        vec = [0.0] * self.DIM
        for tok in self._tokenizar(texto):
            h = int.from_bytes(hashlib.md5(tok.encode("utf-8")).digest()[:4], "big")
            vec[h % self.DIM] += 1.0
        return vec


def _vector_literal(vec: list[float]) -> str:
    """Serializa un embedding al formato textual de pgvector: '[v1,v2,...]'.

    Se pasa como parámetro (sin interpolar en el SQL) y se castea a ::vector
    en la query, evitando dependencia del adaptador binario de pgvector.
    """
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


def _documento(reporte: Reporte) -> str:
    """Texto indexable: resumen + claims + síntomas + actividades.

    Misma composición que `VectorIndex._documento` de store.py.
    """
    partes: list[str] = []
    if reporte.resumen:
        partes.append(reporte.resumen)
    partes.extend(c.afirmacion for c in reporte.claims)
    partes.extend(reporte.salud.sintomas)
    partes.extend(reporte.actividades)
    if reporte.animo.estado:
        partes.append(reporte.animo.estado)
    if reporte.sueno.notas:
        partes.append(reporte.sueno.notas)
    texto = " ".join(p for p in partes if p).strip()
    return texto or reporte.fecha.isoformat()


# --------------------------------------------------------------------------- #
# Conexión reutilizable
# --------------------------------------------------------------------------- #
class _Conexion:
    """Encapsula una conexión psycopg reutilizable, serializada por un Lock.

    Una conexión por instancia, autocommit. Un `Lock` serializa las operaciones
    (suficiente para el uso del grafo, igual que el `ReportStore` de SQLite).
    Reconecta de forma perezosa si la conexión quedó rota.
    """

    def __init__(self, dsn: str | None = None):
        self._dsn = dsn or settings.database_url
        self._lock = threading.Lock()
        self._conn: psycopg.Connection | None = None

    def _get(self) -> psycopg.Connection:
        if self._conn is None or self._conn.closed:
            self._conn = psycopg.connect(self._dsn, autocommit=True)
        return self._conn

    def _resolver_family_id(self, cur: psycopg.Cursor, elder_id: str) -> str:
        cur.execute("SELECT family_id FROM public.elders WHERE id = %s", (elder_id,))
        fila = cur.fetchone()
        if fila is None:
            raise ElderNoEncontrado(
                f"No existe un elder con id={elder_id!r} en la tabla elders"
            )
        return str(fila[0])


# --------------------------------------------------------------------------- #
# Persistencia estructurada: Postgres
# --------------------------------------------------------------------------- #
class PostgresReportStore(_Conexion):
    """Persistencia de reportes sobre Postgres (Supabase), tenant-aware.

    `guardar` resuelve el `family_id` del elder, inserta en `reports` (payload =
    `reporte.model_dump(mode="json")`) y **explota `reporte.alertas` en `alerts`**
    (una fila por alerta) para que el dashboard las consulte. `listar` devuelve
    los reportes del elder por `fecha desc` (desempatando por `created_at desc`),
    reconstruyendo cada `Reporte` desde el payload jsonb.
    """

    def guardar(self, elder_id: str, reporte: Reporte) -> ReporteGuardado:
        payload = reporte.model_dump(mode="json")
        # `confianza` vive en el GraphState, no en el Reporte ni en la firma
        # congelada de `guardar`, así que aquí queda NULL. El dashboard la lee
        # del reporte (payload) si la necesita; en producción, si se quisiera
        # persistir, se pasaría por fuera de esta interfaz.
        with self._lock:
            with self._get().cursor() as cur:
                family_id = self._resolver_family_id(cur, elder_id)
                cur.execute(
                    """
                    INSERT INTO public.reports
                        (elder_id, family_id, fecha, payload, resumen,
                         confianza, incompleto)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        elder_id,
                        family_id,
                        reporte.fecha,
                        Jsonb(payload),
                        reporte.resumen or None,
                        None,  # confianza (ver nota arriba)
                        reporte.incompleto,
                    ),
                )
                report_id = str(cur.fetchone()[0])

                # Explotar las alertas del reporte en la tabla `alerts`.
                for alerta in reporte.alertas:
                    cur.execute(
                        """
                        INSERT INTO public.alerts
                            (report_id, elder_id, family_id, tipo,
                             severidad, evidencia)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (
                            report_id,
                            elder_id,
                            family_id,
                            alerta.tipo,
                            alerta.severidad.value,
                            alerta.evidencia,
                        ),
                    )

        return ReporteGuardado(
            elder_id=elder_id, fecha=reporte.fecha, reporte=reporte, id=report_id
        )

    def listar(self, elder_id: str, limite: int = 30) -> list[ReporteGuardado]:
        with self._lock:
            with self._get().cursor() as cur:
                cur.execute(
                    """
                    SELECT id, elder_id, payload
                    FROM public.reports
                    WHERE elder_id = %s
                    ORDER BY fecha DESC, created_at DESC
                    LIMIT %s
                    """,
                    (elder_id, limite),
                )
                filas = cur.fetchall()

        resultado: list[ReporteGuardado] = []
        for rid, eid, payload in filas:
            reporte = Reporte(**payload)
            resultado.append(
                ReporteGuardado(
                    elder_id=str(eid),
                    fecha=reporte.fecha,
                    reporte=reporte,
                    id=str(rid),
                )
            )
        return resultado


# --------------------------------------------------------------------------- #
# Índice semántico: pgvector
# --------------------------------------------------------------------------- #
class PostgresVectorIndex(_Conexion):
    """Índice semántico para RAG sobre pgvector (tabla `report_embeddings`).

    `indexar` genera el embedding (1536-dim, determinista) del documento del
    reporte y lo inserta junto al report más reciente del elder en esa fecha
    (lo busca por `elder_id`+`fecha`; si no existe, persiste primero el report).
    `buscar` embebe la consulta y usa la función `match_reports` para traer los
    `k` report_id más cercanos del elder, reconstruyendo cada `Reporte` con un
    join contra `reports`.
    """

    def __init__(self, dsn: str | None = None):
        super().__init__(dsn)
        self._embedder = _HashingEmbedding1536()

    def _asegurar_report_id(
        self, cur: psycopg.Cursor, elder_id: str, family_id: str, reporte: Reporte
    ) -> str:
        """Devuelve el report_id para este reporte; lo crea si no existe.

        Para mantener `indexar` independiente de `guardar` (igual que en el
        modo Chroma, donde el VectorIndex es autónomo), buscamos un report del
        elder cuyo payload coincida; si no hay, insertamos uno.
        """
        payload = reporte.model_dump(mode="json")
        cur.execute(
            """
            SELECT id FROM public.reports
            WHERE elder_id = %s AND fecha = %s AND payload = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (elder_id, reporte.fecha, Jsonb(payload)),
        )
        fila = cur.fetchone()
        if fila is not None:
            return str(fila[0])

        cur.execute(
            """
            INSERT INTO public.reports
                (elder_id, family_id, fecha, payload, resumen, incompleto)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                elder_id,
                family_id,
                reporte.fecha,
                Jsonb(payload),
                reporte.resumen or None,
                reporte.incompleto,
            ),
        )
        return str(cur.fetchone()[0])

    def indexar(self, elder_id: str, reporte: Reporte) -> None:
        documento = _documento(reporte)
        embedding = _vector_literal(self._embedder.embed(documento))
        with self._lock:
            with self._get().cursor() as cur:
                family_id = self._resolver_family_id(cur, elder_id)
                report_id = self._asegurar_report_id(
                    cur, elder_id, family_id, reporte
                )
                # Idempotencia: no duplicar el embedding del mismo report.
                cur.execute(
                    "SELECT 1 FROM public.report_embeddings WHERE report_id = %s",
                    (report_id,),
                )
                if cur.fetchone() is not None:
                    return
                cur.execute(
                    """
                    INSERT INTO public.report_embeddings
                        (report_id, elder_id, family_id, contenido, embedding)
                    VALUES (%s, %s, %s, %s, %s::extensions.vector)
                    """,
                    (report_id, elder_id, family_id, documento, embedding),
                )

    def buscar(
        self, elder_id: str, consulta: str, k: int = 5
    ) -> list[ReporteGuardado]:
        embedding = _vector_literal(self._embedder.embed(consulta or ""))
        with self._lock:
            with self._get().cursor() as cur:
                # match_reports acota al elder y ordena por distancia coseno.
                cur.execute(
                    """
                    SELECT m.report_id, r.elder_id, r.payload
                    FROM public.match_reports(
                             %s, %s::extensions.vector, %s
                         ) AS m
                    JOIN public.reports r ON r.id = m.report_id
                    """,
                    (elder_id, embedding, k),
                )
                filas = cur.fetchall()

        salida: list[ReporteGuardado] = []
        for rid, eid, payload in filas:
            try:
                reporte = Reporte(**payload)
            except Exception:
                continue
            salida.append(
                ReporteGuardado(
                    elder_id=str(eid),
                    fecha=reporte.fecha,
                    reporte=reporte,
                    id=str(rid),
                )
            )
        return salida
