import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { AUTOMATED_RULE_CATALOG } from "./rules";
import { FindingSection } from "./types";

export interface ReportFinding {
  ruleId: string;
  section: FindingSection;
  severity: "error" | "warning";
  checkType: "automated" | "manual_review_suggested";
  location: string;
  currentValue: string;
  expectedValue: string;
  suggestedFix: string;
}

export interface ReportInput {
  manuscriptTitle: string;
  originalFileName: string;
  versionNumber: number;
  reviewedBy: string;
  reviewedAt: Date;
  totalRulesChecked: number;
  totalRulesPassed: number;
  findings: ReportFinding[];
}

type RowStatus = "compliant" | "non_compliant" | "manual_review";

interface ReportRow {
  section: FindingSection;
  rule: string;
  status: RowStatus;
  currentValue: string;
  expectedValue: string;
  suggestedFix: string;
}

const SECTION_LABELS: Record<FindingSection, string> = {
  title_author: "Judul & Penulis",
  abstract: "Abstrak",
  structure_heading: "Struktur & Heading",
  tables_figures_equations: "Tabel, Gambar, Persamaan",
  references_citation: "Referensi & Sitasi",
};

const SECTION_ORDER: FindingSection[] = [
  "title_author",
  "abstract",
  "structure_heading",
  "tables_figures_equations",
  "references_citation",
];

const STATUS_LABEL: Record<RowStatus, string> = {
  compliant: "Sesuai",
  non_compliant: "Belum Sesuai",
  manual_review: "Perlu Verifikasi Manual",
};

const STATUS_FILL: Record<RowStatus, string> = {
  compliant: "DCFCE7",
  non_compliant: "FEE2E2",
  manual_review: "F1F5F9",
};

function buildReportRows(findings: ReportFinding[]): ReportRow[] {
  const findingByRuleId = new Map(findings.map((f) => [f.ruleId, f]));
  const catalogRuleIds = new Set(AUTOMATED_RULE_CATALOG.map((c) => c.ruleId));

  const catalogRows: ReportRow[] = AUTOMATED_RULE_CATALOG.map((catalog) => {
    const finding = findingByRuleId.get(catalog.ruleId);
    if (!finding) {
      return {
        section: catalog.section,
        rule: catalog.label,
        status: "compliant" as RowStatus,
        currentValue: "Sesuai template",
        expectedValue: catalog.expectedValue,
        suggestedFix: "-",
      };
    }
    return {
      section: catalog.section,
      rule: catalog.label,
      status: (finding.checkType === "manual_review_suggested"
        ? "manual_review"
        : "non_compliant") as RowStatus,
      currentValue: finding.currentValue,
      expectedValue: finding.expectedValue,
      suggestedFix: finding.suggestedFix,
    };
  });

  // Findings that aren't part of the 23-rule automated catalog (e.g. the
  // always-on "references-manual-review" reminder) are additional
  // human-review notes, not automated pass/fail results — show them too so
  // the report doesn't silently drop information the web UI displays.
  const extraRows: ReportRow[] = findings
    .filter((f) => !catalogRuleIds.has(f.ruleId))
    .map((f) => ({
      section: f.section,
      rule: f.location,
      status: "manual_review" as RowStatus,
      currentValue: f.currentValue,
      expectedValue: f.expectedValue,
      suggestedFix: f.suggestedFix,
    }));

  return [...catalogRows, ...extraRows];
}

function metaParagraph(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: value }),
    ],
    spacing: { after: 80 },
  });
}

function headerCell(text: string, widthPercent: number): TableCell {
  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    shading: { fill: "1E293B" },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 18 })],
      }),
    ],
  });
}

function bodyCell(text: string, widthPercent: number, fill?: string): TableCell {
  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    shading: fill ? { fill } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text: text || "-", size: 18 })] })],
  });
}

function rowsTable(rows: ReportRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell("Aturan", 24),
          headerCell("Status", 14),
          headerCell("Ditemukan", 18),
          headerCell("Seharusnya", 22),
          headerCell("Saran Perbaikan", 22),
        ],
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: [
              bodyCell(r.rule, 24),
              bodyCell(STATUS_LABEL[r.status], 14, STATUS_FILL[r.status]),
              bodyCell(r.currentValue, 18),
              bodyCell(r.expectedValue, 22),
              bodyCell(r.suggestedFix, 22),
            ],
          }),
      ),
    ],
  });
}

export async function generateReportDocx(input: ReportInput): Promise<Buffer> {
  const allRows = buildReportRows(input.findings);

  const bySection = SECTION_ORDER.map((section) => ({
    section,
    rows: allRows.filter((r) => r.section === section),
  })).filter((group) => group.rows.length > 0);

  const sectionBlocks = bySection.flatMap((group) => [
    new Paragraph({
      text: SECTION_LABELS[group.section],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
    }),
    rowsTable(group.rows),
  ]);

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: "Laporan Pemeriksaan Kualitas Naskah",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
          metaParagraph("Naskah", input.manuscriptTitle),
          metaParagraph("File asli", input.originalFileName),
          metaParagraph("Versi", String(input.versionNumber)),
          metaParagraph("Diperiksa oleh", input.reviewedBy),
          metaParagraph(
            "Tanggal pemeriksaan",
            input.reviewedAt.toLocaleString("id-ID", {
              dateStyle: "long",
              timeStyle: "short",
            }),
          ),
          metaParagraph(
            "Ringkasan",
            `${input.totalRulesPassed}/${input.totalRulesChecked} aturan otomatis terpenuhi`,
          ),
          new Paragraph({ text: "", spacing: { after: 120 } }),
          ...(sectionBlocks.length > 0
            ? sectionBlocks
            : [
                new Paragraph({
                  text: "Tidak ada aturan yang dapat dievaluasi untuk naskah ini.",
                  spacing: { after: 120 },
                }),
              ]),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
