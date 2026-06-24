no"""Dashboard del familiar (Streamlit).  Responsable: Integrante E.

Tres pestañas:
  - Reporte de hoy: subir audio -> POST /reportes -> alertas + desglose legible.
  - Historial (timeline): GET /reportes/{elder_id} -> lista cronológica inversa.
  - Consultar: chat de Q&A sobre la evolución -> POST /consultas.
"""
import os

import requests
import streamlit as st

# Base de la API configurable por entorno (mismo default que el bot).
API = os.getenv("CUIDAVOZ_API_BASE", "http://localhost:8000")

# Timeout generoso: la generación del reporte corre ASR + LLM.
REPORTE_TIMEOUT = 120
RAPIDO_TIMEOUT = 60

# Emoji por severidad para resaltar alertas de forma consistente.
EMOJI_SEVERIDAD = {"alta": "🔴", "media": "🟠", "baja": "🟡"}

st.set_page_config(page_title="CuidaVoz", page_icon="💜")
st.title("💜 CuidaVoz — Panel del familiar")

elder_id = st.text_input("ID del adulto mayor", "abuela")


# --------------------------------------------------------------------------- #
# Helpers de renderizado
# --------------------------------------------------------------------------- #
def mostrar_alertas(rep: dict) -> None:
    """Resalta las alertas del reporte con st.error por severidad."""
    alertas = rep.get("alertas") or []
    if not alertas:
        return
    st.subheader("⚠️ Alertas")
    # Ordenamos por severidad (alta primero) para que lo urgente quede arriba.
    orden = {"alta": 0, "media": 1, "baja": 2}
    for a in sorted(alertas, key=lambda x: orden.get(x.get("severidad"), 3)):
        sev = a.get("severidad", "baja")
        emoji = EMOJI_SEVERIDAD.get(sev, "⚠️")
        msg = f"{emoji} **{a.get('tipo', 'alerta')}** ({sev}): {a.get('evidencia', '')}"
        if sev == "alta":
            st.error(msg)
        elif sev == "media":
            st.warning(msg)
        else:
            st.info(msg)


def mostrar_desglose(rep: dict) -> None:
    """Muestra salud / sueño / ánimo / actividades de forma legible."""
    salud = rep.get("salud") or {}
    sueno = rep.get("sueno") or {}
    animo = rep.get("animo") or {}
    actividades = rep.get("actividades") or []

    col1, col2 = st.columns(2)

    with col1:
        st.markdown("### 🩺 Salud")
        sintomas = salud.get("sintomas") or []
        st.write("**Síntomas:** " + (", ".join(sintomas) if sintomas else "ninguno"))
        med = salud.get("medicacion_tomada")
        med_txt = {True: "sí ✅", False: "no ❌", None: "sin dato"}[med]
        st.write(f"**Medicación tomada:** {med_txt}")
        st.write(f"**Dolor:** {salud.get('dolor') or 'sin dato'}")

        st.markdown("### 😴 Sueño")
        st.write(f"**Calidad:** {sueno.get('calidad', 'desconocida')}")
        if sueno.get("notas"):
            st.caption(sueno["notas"])

    with col2:
        st.markdown("### 🙂 Ánimo")
        st.write(f"**Estado:** {animo.get('estado') or 'sin dato'}")
        if animo.get("notas"):
            st.caption(animo["notas"])

        st.markdown("### 🚶 Actividades")
        if actividades:
            for act in actividades:
                st.write(f"- {act}")
        else:
            st.write("sin actividades registradas")


def mostrar_reporte(rep: dict) -> None:
    """Render completo de un reporte: alertas, resumen, desglose y detalle crudo."""
    mostrar_alertas(rep)

    st.subheader("Resumen")
    st.write(rep.get("resumen") or "_(sin resumen)_")

    if rep.get("incompleto"):
        st.info(
            "ℹ️ El audio quedó incompleto o poco claro. Conviene pedir que se "
            "reenvíe el mensaje de voz."
        )

    mostrar_desglose(rep)

    with st.expander("Ver detalle completo (JSON)"):
        st.json(rep)


# --------------------------------------------------------------------------- #
# Pestañas
# --------------------------------------------------------------------------- #
tab_rep, tab_hist, tab_qa = st.tabs(
    ["Reporte de hoy", "Historial", "Consultar"]
)

# --- Reporte de hoy -------------------------------------------------------- #
with tab_rep:
    st.write("Subí el último mensaje de voz para generar el reporte de hoy.")
    audio = st.file_uploader(
        "Subir mensaje de voz", type=["ogg", "mp3", "wav", "m4a"]
    )
    if audio and st.button("Generar reporte"):
        with st.spinner("Procesando el audio (transcripción + análisis)..."):
            try:
                r = requests.post(
                    f"{API}/reportes",
                    data={"elder_id": elder_id},
                    files={"audio": (audio.name, audio.getvalue())},
                    timeout=REPORTE_TIMEOUT,
                )
                r.raise_for_status()
                data = r.json()
            except requests.exceptions.RequestException as exc:
                st.error(f"No pude contactar a la API: {exc}")
                data = None

        if data is not None:
            confianza = data.get("confianza")
            if confianza is not None:
                st.caption(f"Confianza del reconocimiento de voz: {confianza:.0%}")

            error = data.get("error")
            rep = data.get("reporte")
            if error or rep is None:
                st.error(
                    "No se pudo generar el reporte"
                    + (f": {error}" if error else ".")
                    + " Pedile a la persona que reenvíe el audio."
                )
            else:
                mostrar_reporte(rep)

# --- Historial (timeline) -------------------------------------------------- #
with tab_hist:
    st.write("Historial de reportes, del más reciente al más antiguo.")
    if st.button("Actualizar historial"):
        st.session_state.pop("_historial", None)  # forzar recarga

    if "_historial" not in st.session_state:
        try:
            r = requests.get(
                f"{API}/reportes/{elder_id}",
                params={"limite": 30},
                timeout=RAPIDO_TIMEOUT,
            )
            r.raise_for_status()
            st.session_state["_historial"] = r.json()
        except requests.exceptions.RequestException as exc:
            st.error(f"No pude obtener el historial: {exc}")
            st.session_state["_historial"] = None

    hist = st.session_state.get("_historial")
    if hist is not None:
        reportes = hist.get("reportes") or []
        # La API ya devuelve más recientes primero; igual lo aseguramos por fecha.
        reportes = sorted(
            reportes, key=lambda rp: rp.get("fecha", ""), reverse=True
        )
        if not reportes:
            pendiente = hist.get("pendiente")
            if pendiente:
                st.info(f"Todavía no hay historial disponible ({pendiente}).")
            else:
                st.info(
                    "Aún no hay reportes registrados. Cuando llegue el primer "
                    "mensaje de voz, va a aparecer acá. 💜"
                )
        else:
            for rep in reportes:
                fecha = rep.get("fecha", "sin fecha")
                alertas = rep.get("alertas") or []
                # En el título marcamos visualmente si el día tuvo alertas.
                marca = " ⚠️" if alertas else ""
                with st.expander(f"📅 {fecha}{marca}", expanded=False):
                    st.write(rep.get("resumen") or "_(sin resumen)_")
                    mostrar_alertas(rep)
                    mostrar_desglose(rep)

# --- Consultar (chat Q&A) -------------------------------------------------- #
with tab_qa:
    st.write("Preguntá sobre la evolución del adulto mayor.")

    # Historial de la conversación en sesión, por look de chat.
    if "_chat" not in st.session_state:
        st.session_state["_chat"] = []

    for rol, texto in st.session_state["_chat"]:
        with st.chat_message(rol):
            st.write(texto)

    pregunta = st.chat_input("Ej: ¿Cómo viene durmiendo esta semana?")
    if pregunta:
        st.session_state["_chat"].append(("user", pregunta))
        with st.chat_message("user"):
            st.write(pregunta)

        with st.chat_message("assistant"):
            with st.spinner("Consultando el historial..."):
                try:
                    r = requests.post(
                        f"{API}/consultas",
                        data={"elder_id": elder_id, "pregunta": pregunta},
                        timeout=RAPIDO_TIMEOUT,
                    )
                    r.raise_for_status()
                    respuesta = r.json().get("respuesta") or "_(sin respuesta)_"
                except requests.exceptions.RequestException as exc:
                    respuesta = f"No pude contactar a la API: {exc}"
            st.write(respuesta)
        st.session_state["_chat"].append(("assistant", respuesta))
