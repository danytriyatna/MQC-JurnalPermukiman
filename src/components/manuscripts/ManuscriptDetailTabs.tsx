"use client";

import { useState } from "react";

interface ManuscriptDetailTabsProps {
  findingsCount: number;
  referencesCount: number;
  hasReferencesPanel: boolean;
  findingsContent: React.ReactNode;
  referencesContent?: React.ReactNode;
}

type TabKey = "all" | "findings" | "references";

export default function ManuscriptDetailTabs({
  findingsCount,
  referencesCount,
  hasReferencesPanel,
  findingsContent,
  referencesContent,
}: ManuscriptDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  if (!hasReferencesPanel || !referencesContent) {
    return <div className="space-y-5">{findingsContent}</div>;
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: "Semua Panel" },
    { key: "findings", label: `Temuan Format (${findingsCount})` },
    {
      key: "references",
      label:
        referencesCount > 0 ? `Verifikasi Referensi (${referencesCount})` : "Verifikasi Referensi",
    },
  ];

  return (
    <div className="space-y-4">
      <div
        className="inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-[#DFD9D2] bg-white p-1.5 shadow-xs"
        role="tablist"
        aria-label="Tampilan detail pemeriksaan"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all duration-150 ${
                isActive
                  ? "bg-gradient-to-r from-[#D14715] to-[#A0320A] text-white shadow-xs"
                  : "text-stone-600 hover:bg-[#FDF4F0] hover:text-[#A0320A]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {(activeTab === "all" || activeTab === "findings") && (
        <div key="findings-slot">{findingsContent}</div>
      )}
      {(activeTab === "all" || activeTab === "references") && (
        <div key="references-slot">{referencesContent}</div>
      )}
    </div>
  );
}
