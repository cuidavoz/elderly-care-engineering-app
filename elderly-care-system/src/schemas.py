"""Esquema del reporte: el contrato central del sistema.

Es estricto a propósito: habilita (a) detección programática de alertas y
(b) medición de faithfulness claim-por-claim en el research project.
"""
from __future__ import annotations
from datetime import date
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class Severidad(str, Enum):
    baja = "baja"
    media = "media"
    alta = "alta"


class CalidadSueno(str, Enum):
    buena = "buena"
    regular = "regular"
    mala = "mala"
    desconocida = "desconocida"


class Salud(BaseModel):
    sintomas: list[str] = Field(default_factory=list)
    medicacion_tomada: Optional[bool] = None
    dolor: Optional[str] = None


class Sueno(BaseModel):
    calidad: CalidadSueno = CalidadSueno.desconocida
    notas: Optional[str] = None


class Animo(BaseModel):
    estado: Optional[str] = None
    notas: Optional[str] = None


class Alerta(BaseModel):
    tipo: str
    severidad: Severidad
    evidencia: str  # fragmento textual que justifica la alerta


class Claim(BaseModel):
    """Afirmación atómica del reporte atada a su fuente en la transcripción."""
    afirmacion: str
    campo: str               # p. ej. "salud.dolor"
    fuente_textual: str      # substring de la transcripción que la respalda


class Reporte(BaseModel):
    fecha: date
    salud: Salud = Field(default_factory=Salud)
    sueno: Sueno = Field(default_factory=Sueno)
    animo: Animo = Field(default_factory=Animo)
    actividades: list[str] = Field(default_factory=list)
    alertas: list[Alerta] = Field(default_factory=list)
    resumen: str = ""
    claims: list[Claim] = Field(default_factory=list)
    incompleto: bool = False  # True si la transcripción fue poco confiable
