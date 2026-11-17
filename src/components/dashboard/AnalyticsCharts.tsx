"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Manuscript } from "@/lib/types";
import { statusDistribution, manuscriptsPerMonth, complianceByUploader } from "@/lib/dashboard/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const areaChartConfig = {
  count: {
    label: "Naskah",
    color: "#6366f1",
  },
} satisfies ChartConfig;

function MonthlyAreaChart({ manuscripts }: { manuscripts: Manuscript[] }) {
  const buckets = manuscriptsPerMonth(manuscripts, 6);
  const rawId = React.useId();
  const fillId = `fill-${rawId.replace(/:/g, "")}`;

  return (
    <ChartContainer config={areaChartConfig} className="aspect-auto h-[180px] w-full">
      <AreaChart
        data={buckets}
        margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-count, #6366f1)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-count, #6366f1)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          className="text-xs text-muted-foreground"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          allowDecimals={false}
          className="text-xs text-muted-foreground"
        />
        <ChartTooltip
          cursor={{ stroke: "var(--color-count, #6366f1)", strokeWidth: 1, strokeDasharray: "4 4" }}
          content={<ChartTooltipContent indicator="line" />}
        />
        <Area
          dataKey="count"
          type="monotone"
          fill={`url(#${fillId})`}
          fillOpacity={1}
          stroke="var(--color-count, #6366f1)"
          strokeWidth={2}
          dot={{ fill: "var(--color-count, #6366f1)", r: 3 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}

const donutChartConfig = {
  count: {
    label: "Naskah",
  },
  pending: {
    label: "Menunggu",
    color: "#3b82f6",
  },
  passed: {
    label: "Lolos",
    color: "#10b981",
  },
  needs_revision: {
    label: "Perlu Revisi",
    color: "#f59e0b",
  },
  processing: {
    label: "Proses",
    color: "#0ea5e9",
  },
  processing_failed: {
    label: "Gagal",
    color: "#f43f5e",
  },
} satisfies ChartConfig;

function StatusDonutChart({ manuscripts }: { manuscripts: Manuscript[] }) {
  const slices = statusDistribution(manuscripts);
  const total = slices.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        Belum ada data naskah.
      </div>
    );
  }

  const pieData = slices.map((s) => ({
    status: s.status,
    label: s.label,
    count: s.count,
    fill: s.hexColor,
  }));

  return (
    <div className="flex flex-col gap-2">
      <ChartContainer
        config={donutChartConfig}
        className="mx-auto aspect-square h-[170px]"
      >
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent nameKey="status" hideLabel />}
          />
          <Pie
            data={pieData}
            dataKey="count"
            nameKey="status"
            innerRadius={50}
            outerRadius={75}
            strokeWidth={3}
            stroke="var(--background)"
          >
            {pieData.map((entry) => (
              <Cell key={entry.status} fill={entry.fill} />
            ))}
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  const cx = viewBox.cx ?? 0;
                  const cy = viewBox.cy ?? 0;
                  return (
                    <text
                      x={cx}
                      y={cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={cx}
                        y={cy - 4}
                        className="fill-foreground text-2xl font-bold tabular-nums"
                      >
                        {total}
                      </tspan>
                      <tspan
                        x={cx}
                        y={cy + 16}
                        className="fill-muted-foreground text-[10px]"
                      >
                        Total
                      </tspan>
                    </text>
                  );
                }
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-1 text-xs">
        {slices.map((s) => (
          <div key={s.status} className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.hexColor }}
              aria-hidden="true"
            />
            <span>{s.label}:</span>
            <span className="font-semibold tabular-nums text-foreground">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComplianceByUploaderDisplay({ manuscripts }: { manuscripts: Manuscript[] }) {
  const rows = complianceByUploader(manuscripts);

  if (rows.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        Belum ada naskah yang selesai diperiksa.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3.5 pt-1">
      {rows.slice(0, 5).map((row, index) => (
        <li key={`${row.name}-${index}`} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate font-medium text-foreground">{row.name}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                {row.manuscriptCount} naskah
              </Badge>
            </div>
            <span
              className={cn(
                "tabular-nums font-semibold",
                row.avgPercent >= 80
                  ? "text-emerald-600 dark:text-emerald-400"
                  : row.avgPercent >= 50
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-rose-600 dark:text-rose-400"
              )}
            >
              {row.avgPercent}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out",
                row.avgPercent >= 80
                  ? "bg-emerald-500"
                  : row.avgPercent >= 50
                  ? "bg-amber-500"
                  : "bg-rose-500"
              )}
              style={{ width: `${Math.min(100, Math.max(0, row.avgPercent))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function AnalyticsCharts({ manuscripts }: { manuscripts: Manuscript[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Distribusi Status Naskah</CardTitle>
          <CardDescription className="text-xs">Proporsi status kelayakan seluruh naskah</CardDescription>
        </CardHeader>
        <CardContent>
          <StatusDonutChart manuscripts={manuscripts} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Naskah Masuk per Bulan</CardTitle>
          <CardDescription className="text-xs">Tren volume pengiriman 6 bulan terakhir</CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyAreaChart manuscripts={manuscripts} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Rata-rata Kepatuhan per Staf</CardTitle>
          <CardDescription className="text-xs">Tingkat kepatuhan panduan penulisan per pengunggah</CardDescription>
        </CardHeader>
        <CardContent>
          <ComplianceByUploaderDisplay manuscripts={manuscripts} />
        </CardContent>
      </Card>
    </div>
  );
}
