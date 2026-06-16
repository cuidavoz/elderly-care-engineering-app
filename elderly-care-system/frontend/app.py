"""Dashboard del familiar (Streamlit).  Responsable: Integrante E."""
import requests
import streamlit as st

API = "http://localhost:8000"

st.set_page_config(page_title="CuidaVoz", page_icon="💜")
st.title("💜 CuidaVoz — Panel del familiar")

elder_id = st.text_input("ID del adulto mayor", "abuela")

tab_rep, tab_qa = st.tabs(["Reporte de hoy", "Consultar historial"])

with tab_rep:
    audio = st.file_uploader("Subir mensaje de voz", type=["ogg", "mp3", "wav", "m4a"])
    if audio and st.button("Generar reporte"):
        r = requests.post(f"{API}/reportes",
                          data={"elder_id": elder_id},
                          files={"audio": (audio.name, audio.getvalue())})
        rep = r.json().get("reporte")
        if rep:
            for a in rep.get("alertas", []):
                st.error(f"⚠️ {a['tipo']} ({a['severidad']}): {a['evidencia']}")
            st.subheader("Resumen")
            st.write(rep.get("resumen"))
            st.json(rep)

with tab_qa:
    pregunta = st.text_input("Preguntá sobre la evolución",
                             "¿Cómo viene durmiendo esta semana?")
    if st.button("Preguntar"):
        r = requests.post(f"{API}/consultas",
                          data={"elder_id": elder_id, "pregunta": pregunta})
        st.write(r.json().get("respuesta"))
