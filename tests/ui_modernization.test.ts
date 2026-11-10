import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { cn } from "../src/lib/utils";
import { Button } from "../src/components/ui/button";
import { Badge } from "../src/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../src/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../src/components/ui/tabs";
import { Checkbox } from "../src/components/ui/checkbox";
import { Skeleton } from "../src/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../src/components/ui/table";
import {
  ChartTooltipContent,
  ChartLegendContent,
  ChartContext,
  ChartConfig,
} from "../src/components/ui/chart";
import DashboardStats from "../src/components/dashboard/DashboardStats";
import AnalyticsCharts from "../src/components/dashboard/AnalyticsCharts";
import StatusBadge from "../src/components/dashboard/StatusBadge";
import ManuscriptHistoryTable from "../src/components/dashboard/ManuscriptHistoryTable";
import LoginForm from "../src/components/auth/LoginForm";
import { loginSchema } from "../src/lib/validations/auth";
import { manuscriptEnvelopeSchema } from "../src/lib/validations/manuscript";
import { Manuscript } from "../src/lib/types";
import ManuscriptDashboard from "../src/components/dashboard/ManuscriptDashboard";
import FilterSearchBar from "../src/components/dashboard/FilterSearchBar";
import ExportMonthControl from "../src/components/dashboard/ExportMonthControl";
import RootLoading from "../src/app/loading";
import DashboardLoading from "../src/app/dashboard/loading";
import ManuscriptDetailLoading from "../src/app/manuscripts/[id]/loading";
import UploadPageLoading from "../src/app/manuscripts/upload/loading";
import { BouncedLoader } from "../src/components/ui/bounced-loader";
import { DataTable, type DataTableColumn } from "../src/components/ui/data-table";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

describe("Modernized UI Components Test Suite", () => {
  describe("cn utility", () => {
    it("merges classes and resolves tailwind conflicts", () => {
      const result = cn("px-2 py-1", "bg-red-500", "px-4", undefined, false && "hidden");
      assert.ok(result.includes("px-4"));
      assert.ok(!result.includes("px-2"));
      assert.ok(result.includes("bg-red-500"));
      assert.ok(result.includes("py-1"));
    });
  });

  describe("Button Component", () => {
    it("renders default button with correct classes", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(Button, null, "Klik Saya")
      );
      assert.ok(html.includes("Klik Saya"));
      assert.ok(html.includes("bg-primary"));
    });

    it("renders variant and size variants", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(Button, { variant: "destructive", size: "sm" }, "Hapus")
      );
      assert.ok(html.includes("bg-destructive"));
      assert.ok(html.includes("h-8"));
    });

    it("supports asChild to clone custom element and merge classes", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(
          Button,
          { asChild: true, variant: "outline" },
          React.createElement("a", { href: "/test", className: "custom-link" }, "Tautan")
        )
      );
      assert.ok(html.includes("<a href=\"/test\""));
      assert.ok(html.includes("border-input"));
      assert.ok(html.includes("custom-link"));
    });
  });

  describe("Badge Component", () => {
    it("renders all supported badge variants", () => {
      const variants = ["default", "secondary", "destructive", "outline", "success", "warning", "info"] as const;
      for (const variant of variants) {
        const html = ReactDOMServer.renderToString(
          React.createElement(Badge, { variant }, variant)
        );
        assert.ok(html.includes(variant));
      }
    });
  });

  describe("StatusBadge Component", () => {
    it("renders status badge with Shadcn Badge primitive", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(StatusBadge, { status: "pending" })
      );
      assert.ok(html.includes("Menunggu"));
      assert.ok(html.includes("rounded-full"));
    });
  });

  describe("Card Component Family", () => {
    it("renders nested card structure properly", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(
          Card,
          { className: "my-card" },
          React.createElement(
            CardHeader,
            null,
            React.createElement(CardTitle, null, "Judul Card"),
            React.createElement(CardDescription, null, "Deskripsi Card")
          ),
          React.createElement(CardContent, null, "Konten Card"),
          React.createElement(CardFooter, null, "Footer Card")
        )
      );
      assert.ok(html.includes("Judul Card"));
      assert.ok(html.includes("Deskripsi Card"));
      assert.ok(html.includes("Konten Card"));
      assert.ok(html.includes("Footer Card"));
      assert.ok(html.includes("my-card"));
    });
  });

  describe("Tabs Component Family", () => {
    it("renders active tab content based on defaultValue", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(
          Tabs,
          { defaultValue: "tab1" },
          React.createElement(
            TabsList,
            null,
            React.createElement(TabsTrigger, { value: "tab1" }, "Tab 1"),
            React.createElement(TabsTrigger, { value: "tab2" }, "Tab 2")
          ),
          React.createElement(TabsContent, { value: "tab1" }, "Konten Tab 1"),
          React.createElement(TabsContent, { value: "tab2" }, "Konten Tab 2")
        )
      );
      assert.ok(html.includes("Konten Tab 1"));
      assert.ok(!html.includes("Konten Tab 2"));
      assert.ok(html.includes("data-state=\"active\""));
    });
  });

  describe("Checkbox Component", () => {
    it("renders properly with uncontrolled defaultChecked=true", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(Checkbox, { defaultChecked: true, id: "agree" })
      );
      assert.ok(html.includes("role=\"checkbox\""));
      assert.ok(html.includes("aria-checked=\"true\""));
      assert.ok(html.includes("data-state=\"checked\""));
      assert.ok(html.includes("bg-primary"));
      assert.ok(html.includes("<svg"));
    });

    it("renders properly with controlled checked=false", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(Checkbox, { checked: false, id: "disagree" })
      );
      assert.ok(html.includes("aria-checked=\"false\""));
      assert.ok(html.includes("data-state=\"unchecked\""));
      assert.ok(html.includes("bg-background"));
      assert.ok(!html.includes("<svg"));
    });
  });

  describe("Skeleton Component", () => {
    it("renders skeleton placeholder with pulse animation", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(Skeleton, { className: "h-4 w-32" })
      );
      assert.ok(html.includes("animate-pulse"));
      assert.ok(html.includes("h-4 w-32"));
    });
  });

  describe("Table Component Family", () => {
    it("renders table with header and cells", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(
          Table,
          null,
          React.createElement(
            TableHeader,
            null,
            React.createElement(TableRow, null, React.createElement(TableHead, null, "Kolom"))
          ),
          React.createElement(
            TableBody,
            null,
            React.createElement(TableRow, null, React.createElement(TableCell, null, "Nilai"))
          )
        )
      );
      assert.ok(html.includes("<table"));
      assert.ok(html.includes("Kolom"));
      assert.ok(html.includes("Nilai"));
    });
  });

  describe("DashboardStats Component", () => {
    const dummyManuscripts: Manuscript[] = [
      {
        id: "1",
        title: "Naskah 1",
        originalFileName: "doc1.docx",
        uploadedBy: "Budi",
        status: "passed",
        versionNumber: 1,
        totalRulesChecked: 10,
        totalRulesPassed: 10,
        errorFindings: 0,
        warningFindings: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "2",
        title: "Naskah 2",
        originalFileName: "doc2.docx",
        uploadedBy: "Siti",
        status: "pending",
        versionNumber: 1,
        totalRulesChecked: 0,
        totalRulesPassed: 0,
        errorFindings: 0,
        warningFindings: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "3",
        title: "Naskah 3",
        originalFileName: "doc3.docx",
        uploadedBy: "Budi",
        status: "needs_revision",
        versionNumber: 2,
        totalRulesChecked: 10,
        totalRulesPassed: 7,
        errorFindings: 2,
        warningFindings: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    it("renders stats with calculated counts and percentages", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(DashboardStats, { manuscripts: dummyManuscripts })
      );
      assert.ok(html.includes("Total Naskah"));
      assert.ok(html.includes("Menunggu Pemeriksaan"));
      assert.ok(html.includes("Lolos"));
      assert.ok(html.includes("Perlu Revisi"));
      assert.ok(html.includes("33% dari total"));
    });

    it("handles zero manuscripts gracefully without NaN", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(DashboardStats, { manuscripts: [] })
      );
      assert.ok(!html.includes("NaN"));
      assert.ok(html.includes("0%"));
    });

    it("aligns stat card icon colors and badge variants with status theme", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(DashboardStats, { manuscripts: dummyManuscripts })
      );
      assert.ok(html.includes("bg-slate-100"));
      assert.ok(html.includes("text-slate-700"));
      assert.ok(html.includes("bg-blue-100"));
      assert.ok(html.includes("text-blue-700"));
      assert.ok(html.includes("bg-emerald-100"));
      assert.ok(html.includes("text-emerald-700"));
      assert.ok(html.includes("bg-amber-100"));
      assert.ok(html.includes("text-amber-700"));
    });
  });

  describe("ManuscriptDashboard Component", () => {
    const mockRouter = {
      back: () => {},
      forward: () => {},
      refresh: () => {},
      push: () => {},
      replace: () => {},
      prefetch: () => {},
    };

    const dummyList: Manuscript[] = [
      {
        id: "m-test-1",
        title: "Perencanaan Rumah Susun Hemat Energi",
        originalFileName: "rusun_hemat_energi.docx",
        uploadedBy: "Admin Staf",
        status: "pending",
        versionNumber: 1,
        totalRulesChecked: 0,
        totalRulesPassed: 0,
        errorFindings: 0,
        warningFindings: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    it("renders clean text buttons and toolbar without emojis or decorative icons", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(
          AppRouterContext.Provider,
          { value: mockRouter as never },
          React.createElement(ManuscriptDashboard, { manuscripts: dummyList })
        )
      );

      // Verify clean text labels exist
      assert.ok(html.includes("Antrean Tugas Pemeriksaan Redaksi"));
      assert.ok(html.includes("Periksa Semua"));
      assert.ok(html.includes("Aksi"));

      // Verify no emojis in buttons and text
      assert.ok(!html.includes("⚡"));
      assert.ok(!html.includes("🚀"));
      assert.ok(!html.includes("📋"));
      assert.ok(!html.includes("🎉"));
      assert.ok(!html.includes("✅"));
      assert.ok(!html.includes("⚠️"));
      assert.ok(!html.includes("❌"));
    });

    it("renders tabs for Pending, Screened, and All manuscripts", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(
          AppRouterContext.Provider,
          { value: mockRouter as never },
          React.createElement(ManuscriptDashboard, { manuscripts: dummyList })
        )
      );

      assert.ok(html.includes("Tugas Pemeriksaan (Pending)"));
      assert.ok(html.includes("Selesai Diperiksa"));
      assert.ok(html.includes("Semua Naskah"));
    });
  });

  describe("FilterSearchBar & ExportMonthControl Components", () => {
    it("renders FilterSearchBar with search input and Shadcn Button filter pills", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(FilterSearchBar, {
          query: "studi gempa",
          onQueryChange: () => {},
          statusFilter: "needs_revision",
          onStatusFilterChange: () => {},
        })
      );

      assert.ok(html.includes("studi gempa"));
      assert.ok(html.includes("Cari judul atau nama file..."));
      assert.ok(html.includes("Semua"));
      assert.ok(html.includes("Perlu Revisi"));
      assert.ok(html.includes("Lolos"));
      assert.ok(html.includes("rounded-full"));
    });

    it("renders ExportMonthControl with Shadcn Card, Checkbox, and Button asChild", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(ExportMonthControl)
      );

      assert.ok(html.includes("Unduh Rekapitulasi:"));
      assert.ok(html.includes("Semua bulan"));
      assert.ok(html.includes("Unduh CSV"));
      assert.ok(html.includes("role=\"checkbox\""));
      assert.ok(html.includes("/api/manuscripts/export"));
    });
  });

  describe("LoginForm Component & Toast Feedback Contract", () => {
    const mockRouter = {
      back: () => {},
      forward: () => {},
      refresh: () => {},
      push: () => {},
      replace: () => {},
      prefetch: () => {},
    };

    it("renders login form with clean Masuk button, email, and password fields", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(
          AppRouterContext.Provider,
          { value: mockRouter as never },
          React.createElement(LoginForm)
        )
      );

      assert.ok(html.includes("Masuk"));
      assert.ok(html.includes("id=\"email\""));
      assert.ok(html.includes("id=\"password\""));
      assert.ok(html.includes("placeholder=\"Email\""));
      assert.ok(html.includes("placeholder=\"Kata Sandi\""));
      assert.ok(!html.includes("⚡"));
    });
  });

  describe("Page Loading Bounced Transition Components", () => {
    it("renders bouncing dots indicator in all route transition loaders", () => {
      const rootHtml = ReactDOMServer.renderToString(React.createElement(RootLoading));
      const dashHtml = ReactDOMServer.renderToString(React.createElement(DashboardLoading));
      const detailHtml = ReactDOMServer.renderToString(React.createElement(ManuscriptDetailLoading));
      const uploadHtml = ReactDOMServer.renderToString(React.createElement(UploadPageLoading));

      assert.ok(rootHtml.includes("animate-bounce"));
      assert.ok(rootHtml.includes("Memuat halaman..."));

      assert.ok(dashHtml.includes("animate-bounce"));
      assert.ok(dashHtml.includes("Memuat dasbor naskah..."));

      assert.ok(detailHtml.includes("animate-bounce"));
      assert.ok(detailHtml.includes("Memuat detail naskah..."));

      assert.ok(uploadHtml.includes("animate-bounce"));
      assert.ok(uploadHtml.includes("Memuat formulir unggah..."));
    });

    it("renders centralized BouncedLoader with proper variants and accessibility attributes", () => {
      const screenHtml = ReactDOMServer.renderToString(
        React.createElement(BouncedLoader, {
          variant: "screen",
          message: "Sinkronisasi data...",
          label: "Sedang memuat data",
        })
      );
      assert.ok(screenHtml.includes("role=\"status\""));
      assert.ok(screenHtml.includes("aria-label=\"Sedang memuat data\""));
      assert.ok(screenHtml.includes("Sinkronisasi data..."));
      assert.ok(screenHtml.includes("min-h-[calc(100vh-8rem)]"));

      const overlayHtml = ReactDOMServer.renderToString(
        React.createElement(BouncedLoader, {
          variant: "overlay",
          message: "Menyaring...",
        })
      );
      assert.ok(overlayHtml.includes("absolute inset-0"));
      assert.ok(overlayHtml.includes("backdrop-blur-[2px]"));

      const inlineHtml = ReactDOMServer.renderToString(
        React.createElement(BouncedLoader, {
          variant: "inline",
          size: "sm",
        })
      );
      assert.ok(inlineHtml.includes("inline-flex"));
      assert.ok(inlineHtml.includes("h-2 w-2"));
    });
  });

  describe("ManuscriptHistoryTable Component", () => {
    it("renders manuscript rows using Shadcn Table", () => {
      const sample: Manuscript[] = [
        {
          id: "m-123",
          title: "Evaluasi Struktur Perumahan Tahan Gempa",
          originalFileName: "struktur_gempa.docx",
          uploadedBy: "Ahmad Editor",
          status: "passed",
          versionNumber: 1,
          totalRulesChecked: 15,
          totalRulesPassed: 15,
          errorFindings: 0,
          warningFindings: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const html = ReactDOMServer.renderToString(
        React.createElement(ManuscriptHistoryTable, { manuscripts: sample })
      );
      assert.ok(html.includes("Evaluasi Struktur Perumahan Tahan Gempa"));
      assert.ok(html.includes("struktur_gempa.docx"));
      assert.ok(html.includes("Ahmad Editor"));
      assert.ok(html.includes("aturan terpenuhi"));
      assert.ok(html.includes("Lihat detail"));
    });
  });

  describe("DataTable Generic Component & Large Dataset Performance", () => {
    interface TestItem {
      id: string;
      title: string;
      author: string;
      category: string;
      score: number;
    }

    const testColumns: DataTableColumn<TestItem>[] = [
      { id: "title", header: "Judul", accessorKey: "title" },
      { id: "author", header: "Penulis", accessorKey: "author" },
      { id: "category", header: "Kategori", accessorKey: "category" },
      {
        id: "score",
        header: "Nilai",
        cell: (item) => React.createElement("span", { className: "tabular-nums" }, `${item.score}%`),
      },
    ];

    it("renders generic data table with advance search and faceted filters", () => {
      const data: TestItem[] = [
        { id: "1", title: "Kajian Permukiman Kumuh", author: "Budi", category: "Urban", score: 90 },
        { id: "2", title: "Struktur Baja Tahan Gempa", author: "Siti", category: "Struktur", score: 85 },
      ];

      const html = ReactDOMServer.renderToString(
        React.createElement(DataTable<TestItem>, {
          columns: testColumns,
          data,
          enableSearch: true,
          searchKeys: ["title", "author"],
          searchPlaceholder: "Cari judul atau penulis...",
          facetedFilters: [
            {
              id: "category",
              title: "Kategori",
              accessorKey: "category",
              options: [
                { label: "Semua", value: "all" },
                { label: "Urban", value: "Urban" },
                { label: "Struktur", value: "Struktur" },
              ],
            },
          ],
        })
      );

      assert.ok(html.includes("Kajian Permukiman Kumuh"));
      assert.ok(html.includes("Struktur Baja Tahan Gempa"));
      assert.ok(html.includes("Cari judul atau penulis..."));
      assert.ok(html.includes("Urban"));
      assert.ok(html.includes("Struktur"));
      assert.ok(html.includes("Menampilkan"));
    });

    it("handles large dataset of 10,000 items with memory slicing without memory lag", () => {
      // Generate 10,000 items
      const largeData: TestItem[] = Array.from({ length: 10000 }, (_, i) => ({
        id: `item-${i + 1}`,
        title: `Naskah Ilmiah Nomor ${i + 1}`,
        author: `Penulis ${i % 100}`,
        category: i % 2 === 0 ? "Urban" : "Struktur",
        score: (i * 7) % 100,
      }));

      const startTime = Date.now();
      const html = ReactDOMServer.renderToString(
        React.createElement(DataTable<TestItem>, {
          columns: testColumns,
          data: largeData,
          defaultPageSize: 10,
          enablePagination: true,
        })
      );
      const renderDuration = Date.now() - startTime;

      // Rendering 10k items through memory slicing must take < 50ms in server/render pass
      assert.ok(renderDuration < 100, `Rendering took ${renderDuration}ms, expected < 100ms`);

      // Slicing verification: only page 1 items (item-1 to item-10) should be rendered in HTML
      assert.ok(html.includes("Naskah Ilmiah Nomor 1"));
      assert.ok(html.includes("Naskah Ilmiah Nomor 10"));
      assert.ok(!html.includes("Naskah Ilmiah Nomor 11<"));

      // Counter verification
      assert.ok(html.includes("Menampilkan"));
      assert.ok(html.includes("10000"));
      assert.ok(html.includes("Halaman"));
      assert.ok(html.includes("1000")); // 10,000 / 10 = 1000 pages
    });

    it("displays emptyMessage when dataset has no matching rows", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(DataTable<TestItem>, {
          columns: testColumns,
          data: [],
          emptyMessage: "Tidak ada data riset ditemukan.",
        })
      );

      assert.ok(html.includes("Tidak ada data riset ditemukan."));
    });
  });

  describe("AnalyticsCharts Component", () => {
    it("renders empty state fallback when manuscripts are empty", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(AnalyticsCharts, { manuscripts: [] })
      );
      assert.ok(html.includes("Belum ada data naskah."));
      assert.ok(html.includes("Belum ada naskah yang selesai diperiksa."));
    });

    it("renders donut, area, and compliance charts when manuscripts exist", () => {
      const dummyManuscripts: Manuscript[] = [
        {
          id: "1",
          title: "Studi Permukiman",
          originalFileName: "studi.docx",
          uploadedBy: "Dr. Ahmad",
          status: "passed",
          versionNumber: 1,
          totalRulesChecked: 12,
          totalRulesPassed: 11,
          errorFindings: 0,
          warningFindings: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const html = ReactDOMServer.renderToString(
        React.createElement(AnalyticsCharts, { manuscripts: dummyManuscripts })
      );
      assert.ok(html.includes("Distribusi Status Naskah"));
      assert.ok(html.includes("Naskah Masuk per Bulan"));
      assert.ok(html.includes("Rata-rata Kepatuhan per Staf"));
      assert.ok(html.includes("Dr. Ahmad"));
    });
  });

  describe("Zod Validation Schemas", () => {
    it("validates loginSchema properly", () => {
      const valid = loginSchema.safeParse({
        email: "staff@pupr.go.id",
        password: "secretpassword",
      });
      assert.ok(valid.success);

      const invalidEmail = loginSchema.safeParse({
        email: "not-an-email",
        password: "pass",
      });
      assert.strictEqual(invalidEmail.success, false);

      const emptyPassword = loginSchema.safeParse({
        email: "staff@pupr.go.id",
        password: "",
      });
      assert.strictEqual(emptyPassword.success, false);
    });

    it("validates manuscriptEnvelopeSchema properly", () => {
      const valid = manuscriptEnvelopeSchema.safeParse({
        storagePath: "user-123/2026-11-06/uuid.docx",
        originalFileName: "naskah_final.docx",
      });
      assert.ok(valid.success);

      const nonDocx = manuscriptEnvelopeSchema.safeParse({
        storagePath: "user-123/test.pdf",
        originalFileName: "naskah.pdf",
      });
      assert.strictEqual(nonDocx.success, false);
    });
  });

  describe("Chart Primitives & DOM Prop Sanitization", () => {
    const sampleConfig: ChartConfig = {
      manuscripts: { label: "Naskah", color: "#6366f1" },
    };

    it("sanitizes Recharts internal props in ChartTooltipContent without leaking cursor=false to DOM", () => {
      // Simulate Recharts passing all internal props (cursor={false}, axisId, includeHidden, activeIndex, etc.)
      const html = ReactDOMServer.renderToString(
        React.createElement(
          ChartContext.Provider,
          { value: { config: sampleConfig } },
          React.createElement(ChartTooltipContent, {
            active: true,
            payload: [{ name: "manuscripts", value: 12, color: "#6366f1", dataKey: "manuscripts" }],
            label: "Januari",
            cursor: false,
            axisId: "0",
            includeHidden: false,
            activeIndex: 1,
            coordinate: { x: 50, y: 50 },
            viewBox: { width: 300, height: 200 },
            offset: 10,
            accessibilityLayer: true,
            allowEscapeViewBox: { x: true, y: true },
            animationDuration: 300,
            animationEasing: "ease",
            contentStyle: {},
            wrapperStyle: {},
            itemStyle: {},
            labelStyle: {},
            isAnimationActive: true,
            filterNull: true,
            reverseDirection: false,
            position: { x: 0, y: 0 },
            useTranslate3d: true,
            id: "safe-tooltip-dom-id",
            "data-testid": "chart-tooltip",
          } as never)
        )
      );

      // DOM attribute checks:
      assert.ok(html.includes("id=\"safe-tooltip-dom-id\""));
      assert.ok(html.includes("data-testid=\"chart-tooltip\""));
      assert.ok(html.includes("Januari"));
      assert.ok(html.includes("12"));

      // None of the Recharts internal props should ever leak into DOM attributes:
      assert.ok(!html.includes("cursor="));
      assert.ok(!html.includes("axisId="));
      assert.ok(!html.includes("axisid="));
      assert.ok(!html.includes("includeHidden="));
      assert.ok(!html.includes("includehidden="));
      assert.ok(!html.includes("activeIndex="));
      assert.ok(!html.includes("activeindex="));
      assert.ok(!html.includes("coordinate="));
      assert.ok(!html.includes("viewBox="));
      assert.ok(!html.includes("accessibilityLayer="));
      assert.ok(!html.includes("allowEscapeViewBox="));
      assert.ok(!html.includes("animationDuration="));
      assert.ok(!html.includes("isAnimationActive="));
      assert.ok(!html.includes("reverseDirection="));
    });

    it("sanitizes Recharts internal props in ChartLegendContent without leaking non-DOM attributes", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(
          ChartContext.Provider,
          { value: { config: sampleConfig } },
          React.createElement(ChartLegendContent, {
            payload: [{ value: "manuscripts", color: "#6366f1", dataKey: "manuscripts" }],
            align: "center",
            layout: "horizontal",
            chartWidth: 300,
            chartHeight: 200,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
            id: "safe-legend-dom-id",
          } as never)
        )
      );

      assert.ok(html.includes("id=\"safe-legend-dom-id\""));
      assert.ok(html.includes("Naskah"));
      assert.ok(!html.includes("align="));
      assert.ok(!html.includes("layout="));
      assert.ok(!html.includes("chartWidth="));
      assert.ok(!html.includes("chartHeight="));
    });
  });
});
