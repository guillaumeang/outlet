"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ChartWidget, DashboardBody, MetricWidget } from "../types";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "#60a5fa",
  "#34d399",
  "#f59e0b",
  "#f472b6",
  "#a78bfa",
];

// ─── Metric card ─────────────────────────────────────────────────────────────

const MetricCard = ({
  metric,
  onSendPrompt,
}: {
  metric: MetricWidget;
  onSendPrompt: (prompt: string) => void;
}) => {
  const isClickable = Boolean(metric.prompt);
  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={`rounded-lg border border-border/60 bg-surface-2/30 px-4 py-3 ${
        isClickable
          ? "cursor-pointer transition hover:border-primary/40 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
          : ""
      }`}
      onClick={isClickable ? () => onSendPrompt(metric.prompt!) : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSendPrompt(metric.prompt!);
              }
            }
          : undefined
      }
    >
      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {metric.label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {metric.value}
      </div>
      {metric.delta ? (
        <div
          className={`mt-0.5 font-mono text-[11px] font-medium ${
            metric.deltaPositive === false
              ? "text-red-500"
              : metric.deltaPositive === true
                ? "text-emerald-500"
                : "text-muted-foreground"
          }`}
        >
          {metric.delta}
        </div>
      ) : null}
    </div>
  );
};

// ─── Chart card ──────────────────────────────────────────────────────────────

const ChartCard = ({
  chart,
  onSendPrompt,
}: {
  chart: ChartWidget;
  onSendPrompt: (prompt: string) => void;
}) => {
  const isClickable = Boolean(chart.prompt);
  const data = chart.data;
  const xKey = chart.xKey ?? Object.keys(data[0] ?? {})[0] ?? "x";

  const renderChart = () => {
    switch (chart.type) {
      case "bar":
        return (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
              stroke="var(--muted-foreground)"
            />
            <YAxis
              tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
              stroke="var(--muted-foreground)"
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: 11,
              }}
            />
            <Bar dataKey={chart.dataKey} fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
          </BarChart>
        );
      case "line":
        return (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
              stroke="var(--muted-foreground)"
            />
            <YAxis
              tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
              stroke="var(--muted-foreground)"
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: 11,
              }}
            />
            <Line
              type="monotone"
              dataKey={chart.dataKey}
              stroke={CHART_COLORS[0]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        );
      case "area":
        return (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
              stroke="var(--muted-foreground)"
            />
            <YAxis
              tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
              stroke="var(--muted-foreground)"
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: 11,
              }}
            />
            <Area
              type="monotone"
              dataKey={chart.dataKey}
              stroke={CHART_COLORS[0]}
              fill={CHART_COLORS[0]}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          </AreaChart>
        );
      case "pie":
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey={chart.dataKey}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({ name, percent }) =>
                `${name} ${(percent * 100).toFixed(0)}%`
              }
            >
              {data.map((_entry, i) => (
                <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: 11,
              }}
            />
          </PieChart>
        );
    }
  };

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={`rounded-lg border border-border/60 bg-surface-2/30 p-4 ${
        isClickable
          ? "cursor-pointer transition hover:border-primary/40 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
          : ""
      }`}
      onClick={isClickable ? () => onSendPrompt(chart.prompt!) : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSendPrompt(chart.prompt!);
              }
            }
          : undefined
      }
    >
      {chart.title ? (
        <div className="mb-3 font-mono text-[11px] font-semibold text-muted-foreground">
          {chart.title}
        </div>
      ) : null}
      <ResponsiveContainer width="100%" height={200}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
};

// ─── Dashboard renderer ───────────────────────────────────────────────────────

type DashboardRendererProps = {
  body: DashboardBody;
  onSendPrompt: (prompt: string) => void;
};

export const DashboardRenderer = ({ body, onSendPrompt }: DashboardRendererProps) => {
  const { metrics = [], charts = [] } = body;
  const hasContent = metrics.length > 0 || charts.length > 0;

  if (!hasContent) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="font-mono text-[11px] text-muted-foreground">Empty dashboard</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {metrics.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric, index) => (
            <MetricCard
              key={metric.id ?? `metric-${index}`}
              metric={metric}
              onSendPrompt={onSendPrompt}
            />
          ))}
        </div>
      ) : null}
      {charts.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {charts.map((chart, index) => (
            <ChartCard
              key={chart.id ?? `chart-${index}`}
              chart={chart}
              onSendPrompt={onSendPrompt}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};
