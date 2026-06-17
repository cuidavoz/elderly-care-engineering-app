import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type {
  Elder,
  Family,
  PayloadAlerta,
  Report,
} from "@/lib/types";

/**
 * Documento PDF del informe de seguimiento (server-side, @react-pdf/renderer).
 *
 * Se renderiza a buffer desde el route handler `GET /api/elders/[elderId]/pdf`.
 * Espejo sobrio de la timeline de reportes (`report-card.tsx`): por cada reporte
 * mostramos resumen + Salud / Sueño / Ánimo / Actividades / Alertas y la
 * fidelidad cuando está disponible. Todo defensivo: el `payload` puede venir
 * parcial.
 *
 * No usa Tailwind (react-pdf tiene su propio sistema de estilos) ni fuentes
 * externas: Helvetica viene built-in.
 */

const VIOLET = "#7c3aed";
const TEAL = "#14b8a6";
const INK = "#1f2937";
const MUTED = "#6b7280";
const FAINT = "#9ca3af";
const LINE = "#e5e7eb";
const SOFT_BG = "#f9fafb";

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: INK,
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 44,
    lineHeight: 1.4,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: VIOLET,
    paddingBottom: 12,
    marginBottom: 18,
  },
  brand: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: VIOLET,
  },
  elderName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginTop: 8,
  },
  metaLine: {
    fontSize: 9,
    color: MUTED,
    marginTop: 3,
  },
  reportBlock: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
  },
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  reportDate: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: VIOLET,
    textTransform: "capitalize",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  badge: {
    fontSize: 8,
    color: "#ffffff",
    backgroundColor: TEAL,
    borderRadius: 3,
    paddingVertical: 2,
    paddingHorizontal: 5,
    marginLeft: 4,
    marginBottom: 2,
  },
  badgeMuted: {
    backgroundColor: FAINT,
  },
  badgeWarn: {
    backgroundColor: "#dc2626",
  },
  resumen: {
    fontSize: 10,
    color: INK,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
    marginTop: 6,
  },
  fieldText: {
    fontSize: 10,
    color: INK,
  },
  fieldMuted: {
    fontSize: 10,
    color: MUTED,
  },
  alertBox: {
    backgroundColor: SOFT_BG,
    borderLeftWidth: 2,
    borderLeftColor: VIOLET,
    borderRadius: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 3,
  },
  alertTipo: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: INK,
    textTransform: "capitalize",
  },
  alertEvidencia: {
    fontSize: 9,
    color: MUTED,
  },
  faithfulness: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: TEAL,
    marginTop: 8,
  },
  faithfulnessLow: {
    color: "#dc2626",
  },
  empty: {
    fontSize: 11,
    color: MUTED,
    marginTop: 24,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    fontSize: 8,
    color: FAINT,
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 6,
  },
});

const SEVERITY_LABEL: Record<string, string> = {
  baja: "Severidad baja",
  media: "Severidad media",
  alta: "Severidad alta",
};

/** Formatea YYYY-MM-DD a es-AR sin shift de zona horaria. */
function formatFecha(fecha: string | undefined): string {
  if (!fecha) return "Fecha desconocida";
  const [y, m, d] = fecha.split("-").map(Number);
  if (!y || !m || !d) return fecha;
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Formatea un Date a es-AR legible (para "generado el"). */
function formatTimestamp(d: Date): string {
  return d.toLocaleString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Rango de fechas de los reportes (vienen más reciente primero). */
function rangoFechas(reports: Report[]): string | null {
  const fechas = reports.map((r) => r.fecha).filter(Boolean).sort();
  if (fechas.length === 0) return null;
  const desde = formatFecha(fechas[0]);
  const hasta = formatFecha(fechas[fechas.length - 1]);
  return desde === hasta ? hasta : `${desde} — ${hasta}`;
}

function ReportSection({ report }: { report: Report }) {
  const p = report.payload ?? {};
  const resumen = report.resumen ?? p.resumen ?? null;

  const confianza =
    typeof report.confianza === "number"
      ? Math.round(report.confianza * 100)
      : null;

  const salud = p.salud ?? null;
  const sueno = p.sueno ?? null;
  const animo = p.animo ?? null;
  const actividades = p.actividades ?? [];
  const alertas: PayloadAlerta[] = p.alertas ?? [];

  const fidScore = p.faithfulness?.score ?? null;
  const fidPct = typeof fidScore === "number" ? Math.round(fidScore * 100) : null;
  const nGrounded = p.faithfulness?.n_grounded ?? 0;
  const nClaims = p.faithfulness?.n_claims ?? 0;

  const tieneSalud =
    salud != null &&
    ((salud.sintomas && salud.sintomas.length > 0) ||
      salud.medicacion_tomada != null ||
      !!salud.dolor);
  const tieneSueno = sueno != null && (!!sueno.calidad || !!sueno.notas);
  const tieneAnimo = animo != null && (!!animo.estado || !!animo.notas);

  return (
    <View style={styles.reportBlock} wrap={false}>
      <View style={styles.reportHeader}>
        <Text style={styles.reportDate}>{formatFecha(report.fecha)}</Text>
        <View style={styles.badgeRow}>
          {confianza !== null && (
            <Text style={[styles.badge, styles.badgeMuted]}>
              Confianza {confianza}%
            </Text>
          )}
          {fidPct !== null && (
            <Text
              style={[
                styles.badge,
                fidScore != null && fidScore < 0.7 ? styles.badgeWarn : {},
              ]}
            >
              Fidelidad {fidPct}%
            </Text>
          )}
          {report.incompleto && (
            <Text style={[styles.badge, styles.badgeMuted]}>Incompleto</Text>
          )}
        </View>
      </View>

      {resumen && <Text style={styles.resumen}>{resumen}</Text>}

      {tieneSalud && salud && (
        <View>
          <Text style={styles.sectionTitle}>Salud</Text>
          {salud.sintomas && salud.sintomas.length > 0 ? (
            <Text style={styles.fieldText}>
              Síntomas: {salud.sintomas.join(", ")}
            </Text>
          ) : (
            <Text style={styles.fieldMuted}>Sin síntomas referidos</Text>
          )}
          {salud.medicacion_tomada != null && (
            <Text style={styles.fieldText}>
              Medicación: {salud.medicacion_tomada ? "tomada" : "no tomada"}
            </Text>
          )}
          {salud.dolor && (
            <Text style={styles.fieldText}>Dolor: {salud.dolor}</Text>
          )}
        </View>
      )}

      {tieneSueno && sueno && (
        <View>
          <Text style={styles.sectionTitle}>Sueño</Text>
          {sueno.calidad && (
            <Text style={styles.fieldText}>{sueno.calidad}</Text>
          )}
          {sueno.notas && <Text style={styles.fieldMuted}>{sueno.notas}</Text>}
        </View>
      )}

      {tieneAnimo && animo && (
        <View>
          <Text style={styles.sectionTitle}>Ánimo</Text>
          {animo.estado && (
            <Text style={styles.fieldText}>{animo.estado}</Text>
          )}
          {animo.notas && <Text style={styles.fieldMuted}>{animo.notas}</Text>}
        </View>
      )}

      {actividades.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>Actividades</Text>
          {actividades.map((a, i) => (
            <Text key={i} style={styles.fieldText}>
              • {a}
            </Text>
          ))}
        </View>
      )}

      {alertas.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>Alertas del reporte</Text>
          {alertas.map((alerta, i) => (
            <View key={i} style={styles.alertBox}>
              {(alerta.tipo || alerta.severidad) && (
                <Text style={styles.alertTipo}>
                  {alerta.tipo ?? "Alerta"}
                  {alerta.severidad
                    ? ` — ${SEVERITY_LABEL[alerta.severidad] ?? alerta.severidad}`
                    : ""}
                </Text>
              )}
              {alerta.evidencia && (
                <Text style={styles.alertEvidencia}>{alerta.evidencia}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {fidPct !== null && (
        <Text
          style={[
            styles.faithfulness,
            fidScore != null && fidScore < 0.7 ? styles.faithfulnessLow : {},
          ]}
        >
          Fidelidad: {fidPct}% — {nGrounded} de {nClaims} afirmaciones
          respaldadas
        </Text>
      )}
    </View>
  );
}

export function ReportDocument({
  family,
  elder,
  reports,
}: {
  family: Family | null;
  elder: Elder;
  reports: Report[];
}) {
  const familyName = family?.nombre ?? "Familia";
  const rango = rangoFechas(reports);
  const generado = formatTimestamp(new Date());

  return (
    <Document
      title={`Informe de seguimiento — ${elder.nombre}`}
      author="CuidaVoz"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>CuidaVoz — Informe de seguimiento</Text>
          <Text style={styles.elderName}>{elder.nombre}</Text>
          <Text style={styles.metaLine}>Familia: {familyName}</Text>
          {rango && (
            <Text style={styles.metaLine}>Período: {rango}</Text>
          )}
          <Text style={styles.metaLine}>
            {reports.length}{" "}
            {reports.length === 1 ? "reporte" : "reportes"} · Generado el{" "}
            {generado}
          </Text>
        </View>

        {reports.length === 0 ? (
          <Text style={styles.empty}>
            Todavía no hay reportes registrados para {elder.nombre}.
          </Text>
        ) : (
          reports.map((report) => (
            <ReportSection key={report.id} report={report} />
          ))
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `CuidaVoz · Informe de ${elder.nombre} · Página ${pageNumber} de ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

export default ReportDocument;
