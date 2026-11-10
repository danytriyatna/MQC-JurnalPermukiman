import { Manuscript } from "@/lib/types";
import { statusDistribution, manuscriptsPerMonth, complianceByUploader } from "@/lib/dashboard/analytics";

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fresh-card rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[#C13D0D]" aria-hidden="true" />
        <h3 className="text-sm font-bold text-stone-900">{title}</h3>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function StatusDonut({ manuscripts }: { manuscripts: Manuscript[] }) {
  const slices = statusDistribution(manuscripts);
  const total = slices.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) {
    return <p className="text-sm text-slate-500">Belum ada data.</p>;
  }

  const stops = slices.reduce<{ list: string[]; current: number }>(
    (acc, s) => {
      const start = acc.current;
      const percent = (s.count / total) * 100;
      const next = start + percent;
      return {
        list: [...acc.list, `${s.hexColor} ${start}% ${next}%`],
        current: next,
      };
    },
    { list: [], current: 0 }
  ).list;

  return (
    <div className="flex items-center gap-5">
      <div
        className="h-28 w-28 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
        role="img"
        aria-label={slices.map((s) => `${s.label}: ${s.count}`).join(", ")}
      >
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white">
            <span className="text-lg font-semibold tabular-nums text-slate-900">{total}</span>
          </div>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5">
        {slices.map((s) => (
          <li key={s.status} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.hexColor }} aria-hidden="true" />
            <span className="text-slate-700">{s.label}</span>
            <span className="ml-auto font-medium tabular-nums text-slate-900">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MonthlyBarChart({ manuscripts }: { manuscripts: Manuscript[] }) {
  const buckets = manuscriptsPerMonth(manuscripts, 6);
  const max = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div className="flex h-36 items-end justify-between gap-2">
      {buckets.map((b) => (
        <div key={b.key} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex h-28 w-full items-end justify-center">
            <div
              className="w-full max-w-8 origin-bottom rounded-t-md bg-gradient-to-t from-[#A0320A] to-[#D14715] shadow-xs transition-transform duration-500 ease-[var(--ease-out)]"
              style={{ height: "100%", transform: `scaleY(${b.count / max})` }}
              title={`${b.label}: ${b.count} naskah`}
            />
          </div>
          <span className="text-[11px] tabular-nums text-stone-500">{b.label}</span>
          <span className="text-xs font-semibold tabular-nums text-stone-900">{b.count}</span>
        </div>
      ))}
    </div>
  );
}

function ComplianceByUploaderChart({ manuscripts }: { manuscripts: Manuscript[] }) {
  const rows = complianceByUploader(manuscripts);

  if (rows.length === 0) {
    return <p className="text-sm text-stone-500">Belum ada naskah yang selesai diperiksa.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.name}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="truncate font-medium text-stone-800">{row.name}</span>
            <span className="tabular-nums text-stone-500">{row.avgPercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#EFEAE4]">
            <div
              className={`h-full w-full origin-left rounded-full transition-transform duration-500 ease-[var(--ease-out)] ${
                row.avgPercent >= 85
                  ? "bg-emerald-600"
                  : row.avgPercent >= 70
                    ? "bg-[#C13D0D]"
                    : "bg-amber-500"
              }`}
              style={{ transform: `scaleX(${row.avgPercent / 100})` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function AnalyticsCharts({ manuscripts }: { manuscripts: Manuscript[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <ChartCard title="Distribusi Status Naskah">
        <StatusDonut manuscripts={manuscripts} />
      </ChartCard>
      <ChartCard title="Naskah Masuk per Bulan">
        <MonthlyBarChart manuscripts={manuscripts} />
      </ChartCard>
      <ChartCard title="Rata-rata Kepatuhan per Staf">
        <ComplianceByUploaderChart manuscripts={manuscripts} />
      </ChartCard>
    </div>
  );
}
