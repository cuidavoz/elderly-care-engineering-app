"""Interfaces de almacenamiento (contrato congelado).

`ReportStore`  → persistencia estructurada de reportes (SQLite).
`VectorIndex`  → índice semántico para el Q&A por RAG (Chroma).

Estas firmas son el límite estable entre el orquestador y el subagente D.
La implementación va en este mismo archivo (Fases 2 y 3). Mantener las firmas.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from src.config import settings
from src.schemas import Reporte


@dataclass
class ReporteGuardado:
    """Un reporte persistido, con su id y a qué adulto mayor pertenece."""
    elder_id: str
    fecha: date
    reporte: Reporte
    id: int | None = None


# --------------------------------------------------------------------------- #
# Persistencia estructurada: SQLite
# --------------------------------------------------------------------------- #
class ReportStore:
    """Persistencia estructurada de reportes sobre SQLite (settings.db_path).

    Serializa cada `Reporte` a JSON (`model_dump(mode="json")`) en una única
    tabla `reportes`. `guardar` inserta y devuelve el `ReporteGuardado` con su
    id autogenerado; `listar` devuelve los últimos `limite` reportes del
    `elder_id`, más recientes primero (por id descendente).

    Concurrencia: una conexión por instancia con `check_same_thread=False` y un
    `Lock` que serializa las escrituras (suficiente para el uso del grafo).
    """

    def __init__(self, db_path: str | None = None):
        self._path = Path(db_path or settings.db_path)
        # SQLite necesita el directorio padre existente antes de abrir el archivo.
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(self._path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._crear_tabla()

    def _crear_tabla(self) -> None:
        with self._lock:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS reportes (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    elder_id  TEXT NOT NULL,
                    fecha     TEXT NOT NULL,
                    reporte   TEXT NOT NULL,
                    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
                )
                """
            )
            self._conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_reportes_elder "
                "ON reportes (elder_id, id DESC)"
            )
            self._conn.commit()

    def guardar(self, elder_id: str, reporte: Reporte) -> ReporteGuardado:
        payload = json.dumps(reporte.model_dump(mode="json"), ensure_ascii=False)
        fecha_iso = reporte.fecha.isoformat()
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO reportes (elder_id, fecha, reporte) VALUES (?, ?, ?)",
                (elder_id, fecha_iso, payload),
            )
            self._conn.commit()
            new_id = cur.lastrowid
        return ReporteGuardado(
            elder_id=elder_id, fecha=reporte.fecha, reporte=reporte, id=new_id
        )

    def listar(self, elder_id: str, limite: int = 30) -> list[ReporteGuardado]:
        with self._lock:
            filas = self._conn.execute(
                "SELECT id, elder_id, fecha, reporte FROM reportes "
                "WHERE elder_id = ? ORDER BY id DESC LIMIT ?",
                (elder_id, limite),
            ).fetchall()
        resultado: list[ReporteGuardado] = []
        for fila in filas:
            reporte = Reporte(**json.loads(fila["reporte"]))
            resultado.append(
                ReporteGuardado(
                    elder_id=fila["elder_id"],
                    fecha=reporte.fecha,
                    reporte=reporte,
                    id=fila["id"],
                )
            )
        return resultado


# --------------------------------------------------------------------------- #
# Índice semántico: Chroma con embedding determinista (offline)
# --------------------------------------------------------------------------- #
#
# Por qué un embedding propio:
#   El embedder por defecto de Chroma (all-MiniLM-L6-v2) DESCARGA un modelo la
#   primera vez que se usa, lo que rompe los tests offline. Usamos en su lugar
#   un embedding determinista de "bag-of-words con hashing" (hashing trick):
#   no requiere red ni modelos, y es estable entre procesos porque el hash es
#   md5 (a diferencia de hash() de Python, que está aleatorizado por proceso).
#
#   Es suficiente para que el RAG recupere reportes cuyo texto comparte tokens
#   con la consulta. EN PRODUCCIÓN conviene reemplazar `_HashingEmbedding` por
#   un embedder real (sentence-transformers, OpenAI, Voyage, etc.); el resto de
#   `VectorIndex` no cambia.
try:  # import perezoso-tolerante para no romper la importación del módulo
    from chromadb.api.types import Documents, EmbeddingFunction, Embeddings
except Exception:  # pragma: no cover - chromadb siempre está instalado
    EmbeddingFunction = object  # type: ignore
    Documents = list  # type: ignore
    Embeddings = list  # type: ignore


class _HashingEmbedding(EmbeddingFunction):  # type: ignore[misc]
    """Embedding determinista por hashing de tokens (bag-of-words).

    No descarga nada y es estable entre procesos. Sustituir por un embedder
    real en producción.
    """

    DIM = 256

    def __init__(self) -> None:  # requerido por chromadb >= 1.5
        pass

    @staticmethod
    def name() -> str:
        # Identifica la EF al persistir/reabrir la colección.
        return "cuidavoz_hashing_v1"

    def get_config(self) -> dict:
        return {"dim": _HashingEmbedding.DIM}

    @classmethod
    def build_from_config(cls, config: dict) -> "_HashingEmbedding":
        return cls()

    @staticmethod
    def _tokenizar(texto: str) -> list[str]:
        return [t for t in (texto or "").lower().split() if t]

    def __call__(self, input: "Documents") -> "Embeddings":  # noqa: A002
        vectores: list[list[float]] = []
        for doc in input:
            vec = [0.0] * self.DIM
            for tok in self._tokenizar(doc):
                h = int.from_bytes(hashlib.md5(tok.encode("utf-8")).digest()[:4], "big")
                vec[h % self.DIM] += 1.0
            vectores.append(vec)
        return vectores


class VectorIndex:
    """Índice semántico para RAG sobre Chroma (settings.chroma_path).

    `indexar` agrega el resumen + claims del reporte a la colección (con
    metadata `elder_id` para filtrar por adulto mayor y el JSON del reporte
    embebido para poder reconstruirlo). `buscar` recupera los `k` reportes más
    relevantes para la consulta, restringido al `elder_id`.
    """

    _COLECCION = "reportes_cuidavoz"

    def __init__(self, chroma_path: str | None = None):
        import chromadb

        path = Path(chroma_path or settings.chroma_path)
        path.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=str(path))
        self._coleccion = self._client.get_or_create_collection(
            name=self._COLECCION,
            embedding_function=_HashingEmbedding(),
            # Cosine: con el embedding bag-of-words, la similitud por coseno
            # mide solapamiento de tokens sin penalizar por longitud del
            # documento (a diferencia de L2, el default de Chroma).
            metadata={"hnsw:space": "cosine"},
        )

    @staticmethod
    def _documento(reporte: Reporte) -> str:
        """Texto indexable: resumen + claims + síntomas/actividades."""
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
        # Garantizamos un documento no vacío para que Chroma pueda embeber.
        return texto or reporte.fecha.isoformat()

    def indexar(self, elder_id: str, reporte: Reporte) -> None:
        payload = json.dumps(reporte.model_dump(mode="json"), ensure_ascii=False)
        documento = self._documento(reporte)
        # id estable y único por (elder, fecha, contenido) para evitar choques
        # y permitir reindexar de forma idempotente.
        firma = hashlib.md5(
            f"{elder_id}|{payload}".encode("utf-8")
        ).hexdigest()
        doc_id = f"{elder_id}:{reporte.fecha.isoformat()}:{firma[:12]}"
        self._coleccion.upsert(
            ids=[doc_id],
            documents=[documento],
            metadatas=[
                {
                    "elder_id": elder_id,
                    "fecha": reporte.fecha.isoformat(),
                    "reporte_json": payload,
                }
            ],
        )

    def buscar(self, elder_id: str, consulta: str, k: int = 5) -> list[ReporteGuardado]:
        # No buscar más resultados de los que existen para este elder.
        total = self._coleccion.count()
        if total == 0:
            return []
        n = max(1, min(k, total))
        res = self._coleccion.query(
            query_texts=[consulta or ""],
            n_results=n,
            where={"elder_id": elder_id},
        )
        metadatas = (res.get("metadatas") or [[]])[0]
        salida: list[ReporteGuardado] = []
        for meta in metadatas:
            payload = (meta or {}).get("reporte_json")
            if not payload:
                continue
            try:
                reporte = Reporte(**json.loads(payload))
            except Exception:
                continue
            salida.append(
                ReporteGuardado(
                    elder_id=str(meta.get("elder_id", elder_id)),
                    fecha=reporte.fecha,
                    reporte=reporte,
                    id=None,
                )
            )
        return salida
