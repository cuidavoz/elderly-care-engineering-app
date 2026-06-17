"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type {
  AlertasPorDiaPoint,
  AnimoPoint,
  MedicacionPoint,
  SuenoPoint,
} from "./trends-data";

/** Sueño en el tiempo: línea con score 1..3 (mala/regular/buena). */
const suenoConfig = {
  score: { label: "Calidad del sueño", color: "var(--chart-1)" },
} satisfies ChartConfig;

const SUENO_LABELS: Record<number, string> = { 1: "Mala", 2: "Regular", 3: "Buena" };

export function SuenoChart({ data }: { data: SuenoPoint[] }) {
  return (
    <ChartContainer config={suenoConfig} className="aspect-auto h-56 w-full">
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
        />
        <YAxis
          domain={[0, 3]}
          ticks={[1, 2, 3]}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => SUENO_LABELS[v] ?? ""}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="text-foreground font-medium">
                  {typeof value === "number"
                    ? (SUENO_LABELS[value] ?? "Desconocida")
                    : "Desconocida"}
                </span>
              )}
            />
          }
        />
        <Line
          dataKey="score"
          type="monotone"
          stroke="var(--color-score)"
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
      </LineChart>
    </ChartContainer>
  );
}

/** Adherencia a la medicación: barras divergentes (tomada arriba / no abajo). */
const medConfig = {
  valor: { label: "Medicación" },
} satisfies ChartConfig;

const MED_LABELS: Record<MedicacionPoint["estado"], string> = {
  tomada: "Tomada",
  no: "No tomada",
  desconocida: "Sin dato",
};

function medColor(estado: MedicacionPoint["estado"]) {
  if (estado === "tomada") return "var(--chart-5)"; // verde
  if (estado === "no") return "var(--destructive)";
  return "var(--muted-foreground)";
}

export function MedicacionChart({ data }: { data: MedicacionPoint[] }) {
  return (
    <ChartContainer config={medConfig} className="aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
        />
        <YAxis
          domain={[-1, 1]}
          ticks={[-1, 0, 1]}
          tickLine={false}
          axisLine={false}
          width={72}
          tickFormatter={(v: number) =>
            v === 1 ? "Tomada" : v === -1 ? "No tomada" : ""
          }
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(_value, _name, item) => {
                const estado = (item?.payload as MedicacionPoint | undefined)
                  ?.estado;
                return (
                  <span className="text-foreground font-medium">
                    {estado ? MED_LABELS[estado] : "Sin dato"}
                  </span>
                );
              }}
            />
          }
        />
        <Bar dataKey="valor" radius={4}>
          {data.map((d, i) => (
            <Cell key={i} fill={medColor(d.estado)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Frecuencia de alertas por día: barras apiladas por severidad. */
const alertasConfig = {
  alta: { label: "Alta", color: "var(--destructive)" },
  media: { label: "Media", color: "var(--chart-2)" },
  baja: { label: "Baja", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function AlertasChart({ data }: { data: AlertasPorDiaPoint[] }) {
  return (
    <ChartContainer config={alertasConfig} className="aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="baja" stackId="a" fill="var(--color-baja)" />
        <Bar dataKey="media" stackId="a" fill="var(--color-media)" />
        <Bar dataKey="alta" stackId="a" fill="var(--color-alta)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

/** Ánimo: barras horizontales con la frecuencia de cada estado. */
const animoConfig = {
  cantidad: { label: "Días", color: "var(--chart-3)" },
} satisfies ChartConfig;

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function AnimoChart({ data }: { data: AnimoPoint[] }) {
  const rows = data.map((d) => ({ ...d, estadoLabel: capitalizar(d.estado) }));
  return (
    <ChartContainer
      config={animoConfig}
      className="aspect-auto w-full"
      style={{ height: Math.max(120, rows.length * 40 + 24) }}
    >
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="estadoLabel"
          tickLine={false}
          axisLine={false}
          width={96}
        />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="cantidad" fill="var(--color-cantidad)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
