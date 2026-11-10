import { Manuscript } from "@/lib/types";

function countBy(manuscripts: Manuscript[], status: Manuscript["status"]) {
  return manuscripts.filter((m) => m.status === status).length;
}

function DocumentIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 14V6.75A2.75 2.75 0 0 0 16.25 4h-8.5A2.75 2.75 0 0 0 5 6.75v10.5A2.75 2.75 0 0 0 7.75 20h6M9 8h6M9 11.5h6M9 15h3.5M19 14v6m0 0-2.5-2.5M19 20l2.5-2.5"
      />
    </svg>
  );
}

function CheckBadgeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m9 12.75 2.25 2.25L15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function AlertIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m0 3.75h.008v.008H12v-.008ZM10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.3 2.25h17.76a1.5 1.5 0 0 0 1.3-2.25L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"
      />
    </svg>
  );
}

export default function DashboardStats({ manuscripts }: { manuscripts: Manuscript[] }) {
  const stats = [
    {
      label: "Total Naskah",
      value: manuscripts.length,
      Icon: DocumentIcon,
      iconBg: "bg-[#FDF4F0] ring-1 ring-[#F4D4C9]",
      iconColor: "text-[#C13D0D]",
      topBorder: "border-t-[3px] border-t-[#C13D0D]",
    },
    {
      label: "Lolos",
      value: countBy(manuscripts, "passed"),
      Icon: CheckBadgeIcon,
      iconBg: "bg-emerald-50 ring-1 ring-emerald-200/80",
      iconColor: "text-emerald-600",
      topBorder: "border-t-[3px] border-t-emerald-500",
    },
    {
      label: "Perlu Revisi",
      value: countBy(manuscripts, "needs_revision"),
      Icon: AlertIcon,
      iconBg: "bg-amber-50 ring-1 ring-amber-200/80",
      iconColor: "text-amber-600",
      topBorder: "border-t-[3px] border-t-amber-500",
    },
  ];

  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {stats.map(({ label, value, Icon, iconBg, iconColor, topBorder }) => (
        <div
          key={label}
          className={`fresh-card ${topBorder} flex items-center gap-3.5 rounded-2xl p-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md`}
        >
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div className="min-w-0">
            <dd className="text-2xl font-bold tabular-nums text-stone-900">{value}</dd>
            <dt className="truncate text-xs font-semibold text-stone-500">{label}</dt>
          </div>
        </div>
      ))}
    </dl>
  );
}
