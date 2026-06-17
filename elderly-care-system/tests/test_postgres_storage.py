"""Tests de la capa de datos contra el Postgres local (Supabase).

Se SALTEAN automáticamente (pytest.skip) si no hay conexión al Postgres local,
para que el CI offline siga verde. Si conecta:
  - seedea datos vía SQL disparando los triggers del esquema
    (auth.users → profiles, families → owner family_member, elders),
  - valida guardar→listar, indexar→buscar y que las alertas se explotaron,
  - limpia todo lo que insertó (ids únicos por corrida con uuid.uuid4()).

El usuario `postgres` (DSN por defecto) es superusuario y bypassa RLS:
es el "service role" del backend.
"""
from __future__ import annotations

import uuid
from datetime import date

import pytest

from src.config import settings
from src.schemas import (
    Alerta,
    Animo,
    CalidadSueno,
    Claim,
    Reporte,
    Salud,
    Severidad,
    Sueno,
)

psycopg = pytest.importorskip("psycopg")

DSN = settings.database_url


def _hay_conexion() -> bool:
    try:
        with psycopg.connect(DSN, connect_timeout=3):
            return True
    except Exception:
        return False


# Salta TODO el módulo si el Postgres local no está disponible.
pytestmark = pytest.mark.skipif(
    not _hay_conexion(),
    reason=f"Postgres local no disponible en {DSN} (test offline saltado)",
)


def _reporte(fecha: date, resumen: str, sintomas=None, actividades=None,
             alertas=None) -> Reporte:
    return Reporte(
        fecha=fecha,
        salud=Salud(sintomas=sintomas or []),
        sueno=Sueno(calidad=CalidadSueno.buena),
        animo=Animo(estado="tranquilo"),
        actividades=actividades or [],
        alertas=alertas or [],
        resumen=resumen,
        claims=[Claim(afirmacion=resumen, campo="resumen", fuente_textual=resumen)]
        if resumen
        else [],
    )


@pytest.fixture()
def tenant():
    """Seedea un tenant aislado y devuelve (elder_id, family_id, user_id).

    Inserta en auth.users (dispara el trigger que crea el profile), luego una
    families (trigger crea el owner family_member) y un elders. Limpia todo al
    final por cascada desde auth.users / families.
    """
    user_id = str(uuid.uuid4())
    family_id = str(uuid.uuid4())
    elder_id = str(uuid.uuid4())
    email = f"seed-{user_id[:8]}@cuidavoz.test"

    conn = psycopg.connect(DSN, autocommit=True)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO auth.users (id, email) VALUES (%s, %s)",
                (user_id, email),
            )
            # Trigger handle_new_user crea el profile.
            cur.execute(
                "INSERT INTO public.families (id, nombre, created_by) "
                "VALUES (%s, %s, %s)",
                (family_id, "Familia Test", user_id),
            )
            # Trigger handle_new_family crea el owner en family_members.
            cur.execute(
                "INSERT INTO public.elders (id, family_id, nombre) "
                "VALUES (%s, %s, %s)",
                (elder_id, family_id, "Abuela Test"),
            )

        yield {"elder_id": elder_id, "family_id": family_id, "user_id": user_id}

    finally:
        with conn.cursor() as cur:
            # reports/alerts/embeddings/elders/family_members caen por cascada.
            cur.execute("DELETE FROM public.families WHERE id = %s", (family_id,))
            cur.execute("DELETE FROM auth.users WHERE id = %s", (user_id,))
        conn.close()


def test_elder_inexistente_lanza_error():
    from src.storage.postgres import ElderNoEncontrado, PostgresReportStore

    store = PostgresReportStore(dsn=DSN)
    with pytest.raises(ElderNoEncontrado):
        store.guardar(str(uuid.uuid4()), _reporte(date(2026, 6, 10), "x"))


def test_guardar_y_listar_resuelve_family_id(tenant):
    from src.storage.postgres import PostgresReportStore

    elder_id = tenant["elder_id"]
    store = PostgresReportStore(dsn=DSN)

    r1 = _reporte(date(2026, 6, 10), "primer reporte: durmió bien")
    r2 = _reporte(date(2026, 6, 11), "segundo reporte: dolor de cabeza")
    g1 = store.guardar(elder_id, r1)
    g2 = store.guardar(elder_id, r2)

    assert g1.id is not None and g2.id is not None

    listado = store.listar(elder_id)
    assert len(listado) == 2
    # más reciente (fecha desc) primero
    assert listado[0].reporte.resumen == "segundo reporte: dolor de cabeza"
    assert listado[1].reporte.resumen == "primer reporte: durmió bien"
    assert listado[0].fecha == date(2026, 6, 11)

    # El family_id se resolvió y persistió correctamente en reports.
    conn = psycopg.connect(DSN, autocommit=True)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT family_id FROM public.reports WHERE id = %s", (g1.id,)
            )
            assert str(cur.fetchone()[0]) == tenant["family_id"]
    finally:
        conn.close()


def test_alertas_se_explotan_en_tabla_alerts(tenant):
    from src.storage.postgres import PostgresReportStore

    elder_id = tenant["elder_id"]
    store = PostgresReportStore(dsn=DSN)

    alertas = [
        Alerta(tipo="caida", severidad=Severidad.alta, evidencia="me caí ayer"),
        Alerta(tipo="dolor", severidad=Severidad.media, evidencia="me duele la rodilla"),
    ]
    rep = _reporte(date(2026, 6, 12), "reporte con alertas", alertas=alertas)
    guardado = store.guardar(elder_id, rep)

    conn = psycopg.connect(DSN, autocommit=True)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT tipo, severidad::text, evidencia, family_id "
                "FROM public.alerts WHERE report_id = %s ORDER BY tipo",
                (guardado.id,),
            )
            filas = cur.fetchall()
    finally:
        conn.close()

    assert len(filas) == 2
    tipos = {f[0] for f in filas}
    assert tipos == {"caida", "dolor"}
    # severidad y family_id correctos
    por_tipo = {f[0]: f for f in filas}
    assert por_tipo["caida"][1] == "alta"
    assert por_tipo["dolor"][1] == "media"
    assert str(por_tipo["caida"][3]) == tenant["family_id"]


def test_indexar_y_buscar(tenant):
    from src.storage.postgres import PostgresVectorIndex

    elder_id = tenant["elder_id"]
    idx = PostgresVectorIndex(dsn=DSN)

    idx.indexar(
        elder_id,
        _reporte(date(2026, 6, 10), "durmió tranquila y descansó toda la noche"),
    )
    idx.indexar(
        elder_id,
        _reporte(
            date(2026, 6, 11),
            "se quejó de dolor de rodilla al caminar",
            sintomas=["dolor", "rodilla"],
        ),
    )

    res = idx.buscar(elder_id, "dolor de rodilla", k=2)
    assert len(res) >= 1
    # el más relevante comparte tokens con el reporte de la rodilla
    assert "rodilla" in res[0].reporte.resumen
    assert isinstance(res[0].fecha, date)


def test_buscar_filtra_por_elder(tenant):
    from src.storage.postgres import PostgresVectorIndex

    elder_id = tenant["elder_id"]
    idx = PostgresVectorIndex(dsn=DSN)
    idx.indexar(elder_id, _reporte(date(2026, 6, 10), "abuela durmió bien"))

    # Otro elder de la misma familia no debe contaminar la búsqueda.
    otro_elder = str(uuid.uuid4())
    conn = psycopg.connect(DSN, autocommit=True)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO public.elders (id, family_id, nombre) "
                "VALUES (%s, %s, %s)",
                (otro_elder, tenant["family_id"], "Abuelo Test"),
            )
    finally:
        conn.close()
    idx.indexar(otro_elder, _reporte(date(2026, 6, 10), "abuelo durmió mal"))

    res = idx.buscar(elder_id, "durmió", k=5)
    assert len(res) == 1
    assert res[0].elder_id == elder_id
    assert "abuela" in res[0].reporte.resumen


def test_indexar_idempotente(tenant):
    from src.storage.postgres import PostgresVectorIndex

    elder_id = tenant["elder_id"]
    idx = PostgresVectorIndex(dsn=DSN)
    rep = _reporte(date(2026, 6, 10), "reporte único")
    idx.indexar(elder_id, rep)
    idx.indexar(elder_id, rep)

    res = idx.buscar(elder_id, "reporte único", k=5)
    assert len(res) == 1
