import { FindingDraft, FindingSection, ParsedDocument, ParsedParagraph, ResolvedFormat } from "./types";

// Expected values below are taken from the actual Word styles applied in
// Template_Jurnal_Permukiman (2026).docx (not from its prose "Writing
// Guidelines" text, which drifted from the real template in a few places —
// title casing, heading alignment/size). See PRD appendix for the full rule
// catalogue this is a working subset of.
//
// Margins are the one exception: the user explicitly confirmed the prose
// guideline (25mm on all four sides, 15mm header/footer) is the authoritative
// value here, overriding the applied style found in the template file
// itself (which showed bottom=20mm, header=12.7mm).

const EXPECTED_PAGE = { widthTwips: 11906, heightTwips: 16838 };
const EXPECTED_MARGINS = {
  top: 1418,
  right: 1418,
  left: 1418,
  bottom: 1418,
  header: 851,
  footer: 851,
};
const MARGIN_TOLERANCE_TWIPS = 40; // ~0.7mm rounding slack

const BODY_FONT = "Cambria";
const BODY_SIZE_HALF_PT = 20; // 10pt

const STRUCTURE_HEADINGS = [
  { key: "INTRODUCTION", label: "Introduction", variants: ["INTRODUCTION"] },
  {
    key: "METHOD",
    label: "Method",
    variants: [
      "METHOD",
      "METHODS",
      "METHODOLOGY",
      "RESEARCH METHOD",
      "RESEARCH METHODS",
      "MATERIALS AND METHOD",
      "MATERIALS AND METHODS",
      "MATERIAL AND METHOD",
      "MATERIAL AND METHODS",
    ],
  },
  {
    key: "RESULTS AND DISCUSSION",
    label: "Results and Discussion",
    variants: ["RESULTS AND DISCUSSION", "RESULT AND DISCUSSION"],
  },
  { key: "CONCLUSION", label: "Conclusion", variants: ["CONCLUSION", "CONCLUSIONS"] },
  {
    key: "ACKNOWLEDGEMENTS",
    label: "Acknowledgements",
    variants: ["ACKNOWLEDGEMENTS", "ACKNOWLEDGEMENT", "ACKNOWLEDGMENTS", "ACKNOWLEDGMENT"],
  },
  { key: "REFERENCES", label: "References", variants: ["REFERENCES", "REFERENCE"] },
];

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function twipsToMm(twips: number): number {
  return Math.round((twips * 25.4) / 1440);
}

function formatSummary(format: ResolvedFormat): string {
  const parts = [format.fontAscii ?? "?"];
  if (format.sizeHalfPt) parts.push(`${format.sizeHalfPt / 2}pt`);
  if (format.bold) parts.push("bold");
  if (format.italic) parts.push("italic");
  if (format.caps) parts.push("ALL CAPS");
  if (format.alignment) parts.push(`align:${format.alignment}`);
  return parts.join(", ");
}

function firstNonEmptyParagraph(paragraphs: ParsedParagraph[], fromIndex = 0): ParsedParagraph | undefined {
  return paragraphs.find((p, i) => i >= fromIndex && p.text.trim().length > 0);
}

function findByExactText(paragraphs: ParsedParagraph[], text: string): ParsedParagraph | undefined {
  const target = text.trim().toLowerCase();
  return paragraphs.find((p) => p.text.trim().toLowerCase() === target);
}

function findByPrefix(paragraphs: ParsedParagraph[], prefix: string): ParsedParagraph | undefined {
  const target = prefix.trim().toLowerCase();
  return paragraphs.find((p) => p.text.trim().toLowerCase().startsWith(target));
}

export function checkPageSetup(doc: ParsedDocument): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const section = doc.section;

  if (!section) {
    findings.push({
      section: "structure_heading",
      ruleId: "page-setup-unreadable",
      severity: "warning",
      checkType: "manual_review_suggested",
      location: "Pengaturan halaman",
      currentValue: "Tidak terbaca",
      expectedValue: "A4, margin sesuai template",
      suggestedFix: "Periksa manual ukuran kertas dan margin halaman.",
    });
    return findings;
  }

  const isA4 =
    Math.abs(section.pageWidthTwips - EXPECTED_PAGE.widthTwips) <= MARGIN_TOLERANCE_TWIPS &&
    Math.abs(section.pageHeightTwips - EXPECTED_PAGE.heightTwips) <= MARGIN_TOLERANCE_TWIPS;

  if (!isA4) {
    findings.push({
      section: "structure_heading",
      ruleId: "page-size-a4",
      severity: "error",
      checkType: "automated",
      location: "Pengaturan halaman",
      currentValue: `${twipsToMm(section.pageWidthTwips)}mm x ${twipsToMm(section.pageHeightTwips)}mm`,
      expectedValue: "210mm x 297mm (A4)",
      suggestedFix: "Ubah ukuran kertas ke A4 lewat Layout > Size > A4.",
    });
  }

  const marginChecks: [keyof typeof EXPECTED_MARGINS, number, string][] = [
    ["top", section.marginTopTwips, "atas"],
    ["bottom", section.marginBottomTwips, "bawah"],
    ["left", section.marginLeftTwips, "kiri"],
    ["right", section.marginRightTwips, "kanan"],
    ["header", section.marginHeaderTwips, "header"],
    ["footer", section.marginFooterTwips, "footer"],
  ];

  const mismatched = marginChecks.filter(
    ([key, value]) => Math.abs(value - EXPECTED_MARGINS[key]) > MARGIN_TOLERANCE_TWIPS,
  );

  if (mismatched.length > 0) {
    findings.push({
      section: "structure_heading",
      ruleId: "page-margins",
      severity: "error",
      checkType: "automated",
      location: "Pengaturan halaman",
      currentValue: mismatched.map(([, value, label]) => `${label}: ${twipsToMm(value)}mm`).join(", "),
      expectedValue: `atas/kiri/kanan: ${twipsToMm(EXPECTED_MARGINS.top)}mm, bawah: ${twipsToMm(EXPECTED_MARGINS.bottom)}mm, header/footer: ${twipsToMm(EXPECTED_MARGINS.header)}mm`,
      suggestedFix: "Samakan margin halaman dengan template resmi lewat Layout > Margins > Custom Margins.",
    });
  }

  return findings;
}

const MAX_PAGES = 15;

// Calibrated from a real reviewed manuscript (naskah 1.docx): Word's own
// docProps/app.xml reported 11 pages for 5,900 words in this template's
// layout (Cambria 10pt, single spacing, A4, template margins) — used only
// as a fallback estimate when a file's own declared page count (Word's own
// pagination) isn't available.
const WORDS_PER_PAGE_ESTIMATE = 536;

export function checkPageLimit(doc: ParsedDocument): FindingDraft[] {
  if (doc.declaredPageCount !== null) {
    const pages = doc.declaredPageCount;
    if (pages <= MAX_PAGES) return [];
    return [
      {
        section: "structure_heading",
        ruleId: "page-count-limit",
        severity: "error",
        checkType: "automated",
        location: "Keseluruhan naskah",
        currentValue: `${pages} halaman`,
        expectedValue: `Maksimum ${MAX_PAGES} halaman`,
        suggestedFix: `Ringkas naskah agar tidak melebihi ${MAX_PAGES} halaman (saat ini ${pages} halaman menurut Word).`,
      },
    ];
  }

  // No page count saved in the file (e.g. never opened/saved in Word) —
  // estimate from total word count instead. Inherently imprecise, so this
  // is always manual_review_suggested and never drives pass/fail.
  const totalWords = doc.paragraphs.reduce((sum, p) => sum + wordCount(p.text), 0);
  const estimatedPages = Math.round((totalWords / WORDS_PER_PAGE_ESTIMATE) * 10) / 10;

  return [
    {
      section: "structure_heading",
      ruleId: "page-count-limit",
      severity: "warning",
      checkType: "manual_review_suggested",
      location: "Keseluruhan naskah",
      currentValue: `~${estimatedPages} halaman (estimasi dari ${totalWords} kata, jumlah halaman aktual tidak tersimpan di file)`,
      expectedValue: `Maksimum ${MAX_PAGES} halaman`,
      suggestedFix: "Periksa manual jumlah halaman aktual di Word (estimasi ini hanya berbasis jumlah kata).",
    },
  ];
}

export function checkBodyFont(doc: ParsedDocument): FindingDraft[] {
  const bodyParagraphs = doc.paragraphs.filter(
    (p) => p.text.trim().length > 60 && (p.styleId === null || p.styleId === "Normal" || p.styleId?.startsWith("A3Isi") || p.styleId === "JurnalBodyTEXT0"),
  );

  if (bodyParagraphs.length === 0) {
    return [
      {
        section: "structure_heading",
        ruleId: "body-font",
        severity: "warning",
        checkType: "manual_review_suggested",
        location: "Teks isi naskah",
        currentValue: "Tidak ditemukan paragraf isi yang cukup panjang untuk dicek",
        expectedValue: `${BODY_FONT}, ${BODY_SIZE_HALF_PT / 2}pt`,
        suggestedFix: "Periksa manual apakah teks isi naskah sudah pakai font dan ukuran yang benar.",
      },
    ];
  }

  const mismatched = bodyParagraphs.filter(
    (p) => p.format.fontAscii !== undefined && p.format.fontAscii !== BODY_FONT,
  );
  const ratio = mismatched.length / bodyParagraphs.length;

  if (ratio > 0.2) {
    return [
      {
        section: "structure_heading",
        ruleId: "body-font",
        severity: "error",
        checkType: "automated",
        location: `${mismatched.length} dari ${bodyParagraphs.length} paragraf isi`,
        currentValue: mismatched[0]?.format.fontAscii ?? "tidak diketahui",
        expectedValue: `${BODY_FONT}, ${BODY_SIZE_HALF_PT / 2}pt`,
        suggestedFix: `Ubah font teks isi naskah menjadi ${BODY_FONT} ${BODY_SIZE_HALF_PT / 2}pt.`,
      },
    ];
  }

  return [];
}

export function checkTitle(doc: ParsedDocument): FindingDraft[] {
  const title = firstNonEmptyParagraph(doc.paragraphs);
  if (!title) {
    return [
      {
        section: "title_author",
        ruleId: "title-missing",
        severity: "error",
        checkType: "automated",
        location: "Awal naskah",
        currentValue: "Tidak ditemukan",
        expectedValue: "Judul naskah",
        suggestedFix: "Tambahkan judul naskah di baris pertama.",
      },
    ];
  }

  const f = title.format;
  const issues: string[] = [];
  if (f.fontAscii && f.fontAscii !== BODY_FONT) issues.push(`font ${f.fontAscii}`);
  if (!f.bold) issues.push("tidak bold");
  if (!f.italic) issues.push("tidak italic");
  if (f.sizeHalfPt && (f.sizeHalfPt < 26 || f.sizeHalfPt > 30)) issues.push(`ukuran ${f.sizeHalfPt / 2}pt`);
  if (f.alignment && f.alignment !== "center") issues.push(`rata ${f.alignment}`);

  if (issues.length === 0) return [];

  return [
    {
      section: "title_author",
      ruleId: "title-format",
      severity: "error",
      checkType: "automated",
      location: `Paragraf ${title.index + 1} (Judul)`,
      currentValue: formatSummary(f),
      expectedValue: `${BODY_FONT}, Bold, 14pt, Italic, rata tengah (Capitalize Each Word, bukan ALL CAPS)`,
      suggestedFix: `Perbaiki format judul: ${issues.join(", ")}.`,
    },
  ];
}

function checkAbstractBlock(
  doc: ParsedDocument,
  labelText: string,
  keywordPrefix: string,
  langLabel: string,
  expectItalic: boolean,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const label = findByExactText(doc.paragraphs, labelText);

  if (!label) {
    findings.push({
      section: "abstract",
      ruleId: `abstract-${langLabel}-missing`,
      severity: "error",
      checkType: "automated",
      location: "Bagian Abstrak",
      currentValue: `Label "${labelText}" tidak ditemukan`,
      expectedValue: `Ada bagian "${labelText}"`,
      suggestedFix: `Tambahkan bagian ${labelText} sesuai template.`,
    });
    return findings;
  }

  const body = firstNonEmptyParagraph(doc.paragraphs, label.index + 1);
  if (body) {
    const words = wordCount(body.text);
    if (words < 150 || words > 200) {
      findings.push({
        section: "abstract",
        ruleId: `abstract-${langLabel}-word-count`,
        severity: "error",
        checkType: "automated",
        location: `Paragraf ${body.index + 1} (${labelText})`,
        currentValue: `${words} kata`,
        expectedValue: "150–200 kata",
        suggestedFix: `Sesuaikan panjang ${labelText} menjadi 150–200 kata (saat ini ${words} kata).`,
      });
    }
    if (body.format.italic !== expectItalic) {
      findings.push({
        section: "abstract",
        ruleId: `abstract-${langLabel}-italic`,
        severity: "warning",
        checkType: "automated",
        location: `Paragraf ${body.index + 1} (${labelText})`,
        currentValue: body.format.italic ? "Italic" : "Tidak italic",
        expectedValue: expectItalic ? "Italic" : "Tidak italic (tegak/reguler)",
        suggestedFix: expectItalic
          ? `Ubah teks ${labelText} menjadi italic.`
          : `Ubah teks ${labelText} menjadi tegak (bukan italic).`,
      });
    }
  }

  const keywords = findByPrefix(doc.paragraphs, keywordPrefix);
  if (!keywords) {
    findings.push({
      section: "abstract",
      ruleId: `abstract-${langLabel}-keywords-missing`,
      severity: "error",
      checkType: "automated",
      location: "Bagian Abstrak",
      currentValue: `"${keywordPrefix}" tidak ditemukan`,
      expectedValue: `Ada baris "${keywordPrefix}"`,
      suggestedFix: `Tambahkan baris ${keywordPrefix} setelah ${labelText}.`,
    });
  } else {
    const afterColon = keywords.text.split(":").slice(1).join(":");
    const items = afterColon
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length < 3 || items.length > 5) {
      findings.push({
        section: "abstract",
        ruleId: `abstract-${langLabel}-keywords-count`,
        severity: "warning",
        checkType: "automated",
        location: `Paragraf ${keywords.index + 1} (${keywordPrefix})`,
        currentValue: `${items.length} kata kunci`,
        expectedValue: "3–5 kata kunci/frasa",
        suggestedFix: `Sesuaikan jumlah kata kunci menjadi 3–5 (saat ini ${items.length}).`,
      });
    }
  }

  return findings;
}

export function checkAbstracts(doc: ParsedDocument): FindingDraft[] {
  return [
    ...checkAbstractBlock(doc, "Abstract", "Keywords", "en", false),
    ...checkAbstractBlock(doc, "Abstrak", "Kata Kunci", "id", true),
  ];
}

function isHeadingCandidate(text: string): string | null {
  // Strip a trailing parenthetical style-note (e.g. "INTRODUCTION (a1 Head 1
  // Style)") and require an exact match, so a body sentence that merely
  // starts with a heading word (e.g. "References must be cited when...")
  // is never mistaken for the section heading itself.
  const stripped = text
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()
    .toUpperCase();
  const match = STRUCTURE_HEADINGS.find((h) => h.variants.includes(stripped));
  return match ? match.key : null;
}

export function checkStructureHeadings(doc: ParsedDocument): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const foundIndexByKey = new Map<string, number>();

  doc.paragraphs.forEach((p) => {
    const key = isHeadingCandidate(p.text);
    if (key && !foundIndexByKey.has(key)) {
      foundIndexByKey.set(key, p.index);
    }
  });

  let lastIndex = -1;
  let outOfOrder = false;

  for (const heading of STRUCTURE_HEADINGS) {
    const paraIndex = foundIndexByKey.get(heading.key);
    if (paraIndex === undefined) {
      findings.push({
        section: "structure_heading",
        ruleId: `structure-missing-${heading.key.toLowerCase().replace(/\s+/g, "-")}`,
        severity: "error",
        checkType: "automated",
        location: "Struktur naskah",
        currentValue: "Tidak ditemukan",
        expectedValue: `Ada bagian "${heading.label}"`,
        suggestedFix: `Tambahkan bagian "${heading.label}" sesuai struktur wajib template.`,
      });
      continue;
    }
    if (paraIndex < lastIndex) outOfOrder = true;
    lastIndex = paraIndex;
  }

  if (outOfOrder) {
    findings.push({
      section: "structure_heading",
      ruleId: "structure-order",
      severity: "warning",
      checkType: "automated",
      location: "Struktur naskah",
      currentValue: "Urutan bagian tidak sesuai",
      expectedValue: STRUCTURE_HEADINGS.map((h) => h.label).join(" → "),
      suggestedFix: "Susun ulang urutan bagian sesuai struktur wajib template.",
    });
  }

  return findings;
}

const HEADING_SIZE_HALF_PT_H1 = 22; // 11pt

/**
 * Format of the six required top-level (Heading 1) sections. Checked
 * against every real heading paragraph found by checkStructureHeadings
 * (reusing the same text-based detection, not styleId, since styleId names
 * are Word-internal and not guaranteed stable across different authors'
 * files) rather than a separate heuristic. Calibrated from both the 2026
 * template and a real reviewed manuscript: all 6 headings in both files
 * show Bold, Cambria 11pt, ALL CAPS, and justified alignment — notably
 * *justified*, not "left aligned" as the template's own prose guidelines
 * claim, which is the same kind of prose/reality drift already found for
 * margins and title casing elsewhere in this file.
 */
export function checkHeadingFormat(doc: ParsedDocument): FindingDraft[] {
  const found = doc.paragraphs.filter((p) => isHeadingCandidate(p.text) !== null);
  if (found.length === 0) return []; // already reported by checkStructureHeadings

  const mismatched = found.filter(
    (p) =>
      !(
        p.format.bold &&
        p.format.caps &&
        p.format.fontAscii === BODY_FONT &&
        p.format.sizeHalfPt === HEADING_SIZE_HALF_PT_H1 &&
        p.format.alignment === "both"
      ),
  );

  if (mismatched.length === 0) return [];

  return [
    {
      section: "structure_heading",
      ruleId: "structure-heading-format",
      severity: "error",
      checkType: "automated",
      location: `${mismatched.length} dari ${found.length} judul bagian`,
      currentValue: `Paragraf ${mismatched.map((p) => p.index + 1).join(", ")}: ${formatSummary(mismatched[0].format)}`,
      expectedValue: `${BODY_FONT}, Bold, ${HEADING_SIZE_HALF_PT_H1 / 2}pt, ALL CAPS, rata kiri-kanan (justified)`,
      suggestedFix: `Perbaiki format judul bagian (paragraf ${mismatched.map((p) => p.index + 1).join(", ")}): ${BODY_FONT}, Bold, ${HEADING_SIZE_HALF_PT_H1 / 2}pt, ALL CAPS, rata kiri-kanan.`,
    },
  ];
}

/**
 * Loose signal for "looks like an author-date APA entry": has a 4-digit
 * year (or "n.d.") in parentheses somewhere in the line. Deliberately does
 * NOT try to validate author-name ordering/formatting — real reference
 * lists vary a lot there (organizational authors, non-Latin name order,
 * missing initials) and a stricter regex produces more false positives
 * than it's worth. This is a rough completeness signal, not a validator.
 */
function hasApaYearMarker(text: string): boolean {
  return /\((?:\d{4}[a-z]?|n\.d\.)\)/i.test(text);
}

/**
 * Locates the reference-entry paragraphs, preferring the template's own
 * reference-entry style ("A6 Pustaka") when present — reliable even if
 * content unrelated to references (e.g. an appendix table of maintenance
 * costs) follows later in the document, since counting "every paragraph
 * after the References heading" has no way to know where the reference
 * list itself actually ends. Falls back to a text-length heuristic if
 * styles weren't preserved. Returns null if no References heading exists
 * (already reported by checkStructureHeadings).
 */
export function getReferenceEntries(doc: ParsedDocument): ParsedParagraph[] | null {
  const refHeadingIndex = doc.paragraphs.find((p) => isHeadingCandidate(p.text) === "REFERENCES")?.index;
  if (refHeadingIndex === undefined) return null;

  const styledEntries = doc.paragraphs.filter(
    (p) => p.index > refHeadingIndex && p.styleId === "A6Pustaka",
  );
  return styledEntries.length > 0
    ? styledEntries
    : doc.paragraphs.filter((p) => p.index > refHeadingIndex && p.text.trim().length > 15);
}

export function checkReferences(doc: ParsedDocument): FindingDraft[] {
  const entries = getReferenceEntries(doc);
  if (entries === null) return [];

  const withYearMarker = entries.filter((p) => hasApaYearMarker(p.text)).length;
  const meetsMinimum = entries.length >= 20;

  const findings: FindingDraft[] = [];

  // Reference count is objectively countable, so it's a real automated
  // rule (counts toward the X/Y automated tally) and only appears here
  // when it fails — consistent with every other automated check.
  if (!meetsMinimum) {
    findings.push({
      section: "references_citation",
      ruleId: "references-min-count",
      severity: "error",
      checkType: "automated",
      location: "Bagian References",
      currentValue: `${entries.length} entri referensi terdeteksi`,
      expectedValue: "Minimal 20 referensi (artikel riset) / 25 (artikel review)",
      suggestedFix: "Tambahkan referensi hingga memenuhi jumlah minimum.",
    });
  }

  // APA style consistency and primary-source/recency ratio can't be
  // verified reliably by regex, so this always appears as a manual-review
  // reminder — it does not count toward the automated tally, and its
  // severity is always "warning" so it never drives pass/fail on its own
  // (that's references-min-count's job above).
  findings.push({
    section: "references_citation",
    ruleId: "references-manual-review",
    severity: "warning",
    checkType: "manual_review_suggested",
    location: "Bagian References",
    currentValue: `${entries.length} entri referensi terdeteksi · ${withYearMarker} dari ${entries.length} entri memiliki pola "(Tahun)" ala APA`,
    expectedValue: "Gaya sitasi APA konsisten · minimal 80% sumber primer terbit 10 tahun terakhir",
    suggestedFix: "Periksa manual konsistensi gaya sitasi APA dan proporsi/usia sumber primer (belum bisa diverifikasi otomatis dengan andal).",
  });

  return findings;
}

const HEADING_SIZE_HALF_PT = 22; // 11pt — used to tell an actual caption
// apart from prose that merely starts with the word "Table"/"Figure" (e.g.
// a writing-guideline heading like "Table Presentation in the Manuscript
// (Heading Lev. 3)"), which is set at heading size, never caption size.

/**
 * Table/figure captions in the real template and a real reviewed manuscript
 * (naskah 1.docx) both use Cambria, Bold, 10pt, centered — regardless of
 * which named paragraph style is applied (A5tabel1, Caption, or direct
 * formatting on a heading-styled paragraph all show up in practice). The
 * caption's sequence number itself is a Word SEQ field, not extractable as
 * plain text, so only format compliance is checked here — not numbering
 * order, which needs real evidence of how the app renders those fields
 * before it could be validated automatically.
 */
/** "Figure 5", "Tabel 2.", "Figure " with the number still a SEQ field. */
const CAPTION_LABEL = /^(table|tabel|figure|gambar)\s*\d*\s*[.:]?\s*/i;

/**
 * A caption is a label and a short title. Body prose that opens by referring
 * to a figure runs on for a paragraph; the longest real caption observed
 * across the submissions on file is 90 characters, the shortest offending
 * sentence 639, so this sits far from both.
 */
const MAX_CAPTION_CHARS = 250;

/**
 * Tells a caption apart from a sentence that merely begins with the word
 * "Figure" or "Table".
 *
 * The original test — starts with the word, is not at heading size — matched
 * ordinary prose such as "Figure 8 shows an overlay map between the results of
 * annual SO2 dispersion modelling...", because body text is set in the same
 * Cambria 10pt as a caption and the only guard was against the 11pt used by
 * headings. Every such sentence was then reported as a malformed caption, in
 * manuscripts whose captions were in fact correct, which is the worst kind of
 * false positive: it tells an author to fix something that was never wrong.
 *
 * Two signals separate them, and both must hold. A caption is short. And what
 * follows its number is a title, which starts with a capital — whereas a
 * sentence continues in lower case ("shows", "presents", "menunjukkan").
 * Together these cost at most a caption whose title genuinely begins in lower
 * case, which goes unchecked rather than wrongly accused — the safe direction
 * to err for a rule that drives pass/fail.
 */
function isCaptionParagraph(p: ParsedParagraph): boolean {
  const text = p.text.trim();

  if (!CAPTION_LABEL.test(text)) return false;
  // Guideline headings like "Table Presentation in the Manuscript (Heading
  // Lev. 3)" are set at heading size, never caption size.
  if (p.format.sizeHalfPt === HEADING_SIZE_HALF_PT) return false;
  if (text.length > MAX_CAPTION_CHARS) return false;

  const title = text.replace(CAPTION_LABEL, "").trim();
  // A bare "Figure 3" with no title is a cross-reference in running text, not
  // a caption, and carries nothing to check.
  if (title.length === 0) return false;

  return !/^\p{Ll}/u.test(title);
}

export function checkTableFigureCaptions(doc: ParsedDocument): FindingDraft[] {
  const captions = doc.paragraphs.filter(isCaptionParagraph);

  if (captions.length === 0) return [];

  const mismatched = captions.filter(
    (p) =>
      !(
        p.format.bold &&
        p.format.alignment === "center" &&
        p.format.fontAscii === BODY_FONT &&
        p.format.sizeHalfPt === BODY_SIZE_HALF_PT
      ),
  );

  if (mismatched.length === 0) return [];

  return [
    {
      section: "tables_figures_equations",
      ruleId: "table-figure-caption-format",
      severity: "error",
      checkType: "automated",
      location: `${mismatched.length} dari ${captions.length} judul tabel/gambar`,
      currentValue: `Paragraf ${mismatched.map((p) => p.index + 1).join(", ")}: ${formatSummary(mismatched[0].format)}`,
      expectedValue: `${BODY_FONT}, Bold, ${BODY_SIZE_HALF_PT / 2}pt, rata tengah`,
      suggestedFix: `Perbaiki format judul tabel/gambar (paragraf ${mismatched.map((p) => p.index + 1).join(", ")}): ${BODY_FONT}, Bold, ${BODY_SIZE_HALF_PT / 2}pt, rata tengah.`,
    },
  ];
}

export interface ParsedReference {
  surnames: string[];
  year: string;
}

/**
 * Pulls author surnames + year out of an APA-formatted reference entry,
 * e.g. "Ozorhon, B., Arditi, D., Dikmen, I., & Birgonul, M. T. (2007).
 * Effect Of Host Country..." -> surnames ["Ozorhon", "Arditi", "Dikmen",
 * "Birgonul"], year "2007". Matches each "Surname, Initials." unit before
 * the year parenthesis; organizational authors (e.g. "[BNPB] Badan
 * Nasional...") won't match this pattern and are skipped — there is no
 * reliable evidence for how those get cited in-text, so they're excluded
 * rather than guessed.
 */
// Marks an institutional/legal "author" (e.g. "Badan Standardisasi
// Nasional.", "Menteri Pekerjaan Umum.", "SNI.") — these have no personal
// surname, but per APA are still cited, just by their full name or the
// document's own title rather than a truncated surname (see the
// looksLikeOrgOrTitle branch below).
const INSTITUTIONAL_AUTHOR_KEYWORDS =
  /\b(badan|kementerian|menteri|pemerintah|peraturan|permen|dinas|direktorat|instruksi|inpres|undang|SNI|BSN|LIPI|BNPB)\b/i;

/**
 * Pulls author surnames + year out of an APA-formatted reference entry,
 * e.g. "Ozorhon, B., Arditi, D., Dikmen, I., & Birgonul, M. T. (2007).
 * Effect Of Host Country..." -> surnames ["Ozorhon", "Arditi", "Dikmen",
 * "Birgonul"], year "2007". Matches each "Surname, Initials." unit before
 * the year parenthesis.
 *
 * Falls back to a looser "last word of each &/and/dan-separated name
 * segment" pattern when that finds nothing — real reference lists (esp.
 * Indonesian-authored ones) often write single-name authors without
 * initials ("Amanullah. (2024)") or full names without the comma-initial
 * convention ("Drajat Wirdianto, & Albani Musyafa'. (2009)"), which the
 * strict pattern above misses entirely. Falls back further still to using
 * the whole pre-year text as a single citation phrase for organizational,
 * government, or legal-document "authors", which APA cites by full name or
 * title rather than a surname.
 */
export function parseReferenceAuthorYear(refText: string): ParsedReference | null {
  // Allows a full publication date in parens, e.g. "(2023a, January 9)" —
  // common for news/blog references — not just a bare "(2007)".
  const yearMatch = refText.match(/\((\d{4}[a-z]?)(?:,[^)]*)?\)/);
  if (!yearMatch || yearMatch.index === undefined) return null;

  const beforeYear = refText.slice(0, yearMatch.index);
  const surnameRegex = /([A-ZÀ-Ý][\p{L}'-]+),\s*(?:[A-ZÀ-Ý]\.\s*){1,3}/gu;
  const surnames: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = surnameRegex.exec(beforeYear))) {
    surnames.push(match[1]);
  }

  // A first author with no initials of their own (a mononym — common for
  // Indonesian authors, e.g. "Suranto, Kencono, D. S., & Iqbal, M.") isn't
  // matched by the pattern above, since it only recognizes "Surname,
  // Initials." units. Left alone, the loop above starts matching at the
  // *second* author instead, silently promoting them to "first author" for
  // citation purposes — wrong, since the real in-text citation cites the
  // true first author. Detect this case and prepend the mononym.
  const leadingMononym = beforeYear.match(/^([A-ZÀ-Ý][\p{L}'-]+),(?!\s*[A-ZÀ-Ý]\.)/u);
  if (leadingMononym) {
    surnames.unshift(leadingMononym[1]);
  }

  if (surnames.length > 0) return { surnames, year: yearMatch[1] };

  const cleaned = beforeYear.trim().replace(/\.$/, "");
  if (!cleaned) return null;

  // Distinguish an actual personal name (just written without initials,
  // e.g. "Amanullah" or "Drajat Wirdianto, & Albani Musyafa'") from an
  // organizational/legal "author" (a government body or a regulation's own
  // title) — the latter contains institutional keywords, reference
  // numbers, or is simply too long to plausibly be a person's name.
  const looksLikeOrgOrTitle =
    INSTITUTIONAL_AUTHOR_KEYWORDS.test(cleaned) ||
    /\d/.test(cleaned) ||
    cleaned.split(/\s+/).filter(Boolean).length > 6;

  if (!looksLikeOrgOrTitle) {
    const segments = cleaned
      .split(/,?\s*(?:&|and|dan)\s*/i)
      .map((s) => s.trim())
      .filter(Boolean);

    if (segments.length >= 1 && segments.length <= 2) {
      const fallbackSurnames = segments.map((segment) => {
        const words = segment.split(/\s+/).filter(Boolean);
        return words[words.length - 1].replace(/[.,;:]+$/, "");
      });

      if (!fallbackSurnames.some((s) => !s || !/^[A-ZÀ-Ý]/u.test(s))) {
        return { surnames: fallbackSurnames, year: yearMatch[1] };
      }
    }
  }

  // Organizational/government/legal "author" (or anything the personal-name
  // heuristics above couldn't confidently parse): APA cites these by their
  // full name or document title, not a truncated surname, e.g. "(Dinas
  // Perpustakaan dan Kearsipan Kota Surabaya, 2024)" or "(Keputusan Walikota
  // Surabaya Nomor ... Kota Surabaya, 2023)". A legal reference's title is
  // usually followed by publication details ("Pub. L. No. ...") before the
  // year — cut at the first comma so only the title itself becomes the
  // match target, matching what's actually repeated in-text.
  const titlePhrase = cleaned.split(",")[0].trim();
  if (titlePhrase.length > 0 && titlePhrase.length <= 200) {
    return { surnames: [titlePhrase], year: yearMatch[1] };
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds the expected in-text citation pattern for a reference, per APA:
 * 1–2 authors are cited by full surname(s); 3+ collapse to "first author et
 * al." A short run of non-alphanumeric characters is allowed between name
 * and year to tolerate both narrative ("Ozorhon et al. (2007)") and
 * parenthetical ("(Ozorhon et al., 2007)") citation styles.
 */
function buildCitationPattern(ref: ParsedReference): RegExp {
  const year = escapeRegExp(ref.year);
  const gap = "[^A-Za-z0-9]{0,12}";

  if (ref.surnames.length === 1) {
    return new RegExp(`\\b${escapeRegExp(ref.surnames[0])}\\b${gap}\\(?${year}`, "i");
  }
  if (ref.surnames.length === 2) {
    const wideGap = "[^A-Za-z0-9]{0,15}";
    return new RegExp(
      `\\b${escapeRegExp(ref.surnames[0])}\\b${wideGap}(?:&|and|dan)${wideGap}\\b${escapeRegExp(ref.surnames[1])}\\b${gap}\\(?${year}`,
      "i",
    );
  }
  // 3+ authors: cited as "First et al." When two references share the same
  // first author and year, real citations sometimes disambiguate by
  // inserting the second author's name before "et al." (e.g. "Hair, Tomas,
  // et al., 2021" vs "Hair, Hult, et al., 2021" for two different Hair-led
  // 2021 references) — allow that insertion, anchored to this specific
  // reference's own second author, so a citation for one such duplicate
  // doesn't also satisfy the other.
  const first = escapeRegExp(ref.surnames[0]);
  const second = ref.surnames[1]
    ? `(?:${gap}${escapeRegExp(ref.surnames[1])}\\b)?`
    : "";
  return new RegExp(`\\b${first}\\b${second}${gap}et\\.?\\s*al\\.?${gap}\\(?${year}`, "i");
}

function formatCitationLabel(ref: ParsedReference): string {
  if (ref.surnames.length === 1) return `${ref.surnames[0]}, ${ref.year}`;
  if (ref.surnames.length === 2) return `${ref.surnames[0]} & ${ref.surnames[1]}, ${ref.year}`;
  return `${ref.surnames[0]} et al., ${ref.year}`;
}

/**
 * Every reference listed in the bibliography should be cited at least once
 * in the manuscript body — a real, checkable APA convention distinct from
 * the reference-count/style checks above. Only references whose
 * author/year could be confidently parsed are checked; unparseable entries
 * (e.g. organizational authors) are silently skipped rather than flagged,
 * since there's no reliable expected citation pattern to test for those.
 */
export function checkReferenceCitations(doc: ParsedDocument): FindingDraft[] {
  const entries = getReferenceEntries(doc);
  if (entries === null || entries.length === 0) return [];

  const refHeadingIndex = doc.paragraphs.find((p) => isHeadingCandidate(p.text) === "REFERENCES")!.index;
  const bodyText = doc.paragraphs
    .filter((p) => p.index < refHeadingIndex)
    .map((p) => p.text)
    .join(" \n ");

  const cited: string[] = [];
  const uncited: string[] = [];
  let unparseable = 0;

  for (const entry of entries) {
    const parsed = parseReferenceAuthorYear(entry.text);
    if (!parsed) {
      unparseable += 1;
      continue;
    }
    const label = formatCitationLabel(parsed);
    if (buildCitationPattern(parsed).test(bodyText)) {
      cited.push(label);
    } else {
      uncited.push(label);
    }
  }

  const findings: FindingDraft[] = [];

  if (uncited.length > 0) {
    findings.push({
      section: "references_citation",
      ruleId: "references-cited-in-text",
      severity: "error",
      checkType: "automated",
      location: "Bagian References",
      currentValue: `${uncited.length} referensi tidak ditemukan sitasinya di teks: ${uncited.join("; ")}`,
      expectedValue: 'Setiap referensi disitasi minimal sekali (APA: 1–2 penulis disebut lengkap, 3+ penulis pakai "et al.")',
      suggestedFix: "Tambahkan sitasi di badan naskah untuk tiap referensi yang terdaftar, atau hapus referensi yang tidak pernah dirujuk.",
    });
  }

  // Always-shown breakdown (not itself a pass/fail check — that's
  // references-cited-in-text above) so staff can see the full cited vs.
  // uncited picture per reference, not just the failing ones.
  if (cited.length + uncited.length > 0) {
    const unparseableNote = unparseable > 0 ? ` · ${unparseable} entri tidak dapat diverifikasi (mis. penulis organisasi)` : "";
    findings.push({
      section: "references_citation",
      ruleId: "references-citation-breakdown",
      severity: "warning",
      checkType: "manual_review_suggested",
      location: "Bagian References",
      currentValue: `Sudah disitasi (${cited.length}): ${cited.length > 0 ? cited.join("; ") : "-"} | Belum disitasi (${uncited.length}): ${uncited.length > 0 ? uncited.join("; ") : "-"}${unparseableNote}`,
      expectedValue: "Semua referensi tercantum dalam daftar sudah disitasi di teks",
      suggestedFix: "Gunakan daftar ini untuk verifikasi cepat referensi mana yang sudah/belum dirujuk di badan naskah.",
    });
  }

  return findings;
}

export function runAllChecks(doc: ParsedDocument): FindingDraft[] {
  return [
    ...checkPageSetup(doc),
    ...checkPageLimit(doc),
    ...checkBodyFont(doc),
    ...checkTableFigureCaptions(doc),
    ...checkTitle(doc),
    ...checkAbstracts(doc),
    ...checkStructureHeadings(doc),
    ...checkHeadingFormat(doc),
    ...checkReferences(doc),
    ...checkReferenceCitations(doc),
  ];
}

/**
 * Total number of distinct automated checks this engine currently runs,
 * regardless of how many produced a finding. Used to compute the
 * "X of Y rules passed" summary.
 */
export const TOTAL_AUTOMATED_RULE_COUNT = 27;

export interface RuleCatalogEntry {
  ruleId: string;
  section: FindingSection;
  label: string;
  expectedValue: string;
}

/**
 * Canonical list of every distinct automated ruleId the engine can produce
 * a finding for (23 entries, matching TOTAL_AUTOMATED_RULE_COUNT above).
 * Used to build the exported report: any rule not present among a
 * screening run's findings is reported as compliant ("Sesuai"), consistent
 * with how totalRulesPassed is derived in screenManuscript.ts.
 */
export const AUTOMATED_RULE_CATALOG: RuleCatalogEntry[] = [
  {
    ruleId: "page-size-a4",
    section: "structure_heading",
    label: "Ukuran kertas",
    expectedValue: "A4 (210mm x 297mm)",
  },
  {
    ruleId: "page-margins",
    section: "structure_heading",
    label: "Margin halaman",
    expectedValue: "Atas/kiri/kanan 25mm, bawah 20mm, header/footer sesuai template",
  },
  {
    ruleId: "body-font",
    section: "structure_heading",
    label: "Font teks isi naskah",
    expectedValue: `${BODY_FONT}, ${BODY_SIZE_HALF_PT / 2}pt`,
  },
  {
    ruleId: "title-missing",
    section: "title_author",
    label: "Judul naskah tercantum",
    expectedValue: "Ada judul naskah di awal dokumen",
  },
  {
    ruleId: "title-format",
    section: "title_author",
    label: "Format judul naskah",
    expectedValue: `${BODY_FONT}, Bold, 14pt, Italic, rata tengah, Capitalize Each Word`,
  },
  {
    ruleId: "abstract-en-missing",
    section: "abstract",
    label: "Bagian Abstract (EN) tercantum",
    expectedValue: 'Ada bagian "Abstract"',
  },
  {
    ruleId: "abstract-en-word-count",
    section: "abstract",
    label: "Jumlah kata Abstract (EN)",
    expectedValue: "150–200 kata",
  },
  {
    ruleId: "abstract-en-italic",
    section: "abstract",
    label: "Format teks Abstract (EN)",
    expectedValue: "Tidak italic (tegak/reguler)",
  },
  {
    ruleId: "abstract-en-keywords-missing",
    section: "abstract",
    label: "Baris Keywords tercantum",
    expectedValue: 'Ada baris "Keywords" setelah Abstract',
  },
  {
    ruleId: "abstract-en-keywords-count",
    section: "abstract",
    label: "Jumlah Keywords",
    expectedValue: "3–5 kata kunci/frasa",
  },
  {
    ruleId: "abstract-id-missing",
    section: "abstract",
    label: "Bagian Abstrak (ID) tercantum",
    expectedValue: 'Ada bagian "Abstrak"',
  },
  {
    ruleId: "abstract-id-word-count",
    section: "abstract",
    label: "Jumlah kata Abstrak (ID)",
    expectedValue: "150–200 kata",
  },
  {
    ruleId: "abstract-id-italic",
    section: "abstract",
    label: "Format teks Abstrak (ID)",
    expectedValue: "Italic",
  },
  {
    ruleId: "abstract-id-keywords-missing",
    section: "abstract",
    label: "Baris Kata Kunci tercantum",
    expectedValue: 'Ada baris "Kata Kunci" setelah Abstrak',
  },
  {
    ruleId: "abstract-id-keywords-count",
    section: "abstract",
    label: "Jumlah Kata Kunci",
    expectedValue: "3–5 kata kunci/frasa",
  },
  ...STRUCTURE_HEADINGS.map((heading) => ({
    ruleId: `structure-missing-${heading.key.toLowerCase().replace(/\s+/g, "-")}`,
    section: "structure_heading" as FindingSection,
    label: `Bagian "${heading.label}" tercantum`,
    expectedValue: `Ada bagian "${heading.label}"`,
  })),
  {
    ruleId: "structure-order",
    section: "structure_heading",
    label: "Urutan struktur bagian",
    expectedValue: STRUCTURE_HEADINGS.map((h) => h.label).join(" → "),
  },
  {
    ruleId: "references-min-count",
    section: "references_citation",
    label: "Jumlah minimum referensi",
    expectedValue: "Minimal 20 referensi (artikel riset) / 25 referensi (artikel review)",
  },
  {
    ruleId: "page-count-limit",
    section: "structure_heading",
    label: "Batas jumlah halaman",
    expectedValue: `Maksimum ${MAX_PAGES} halaman`,
  },
  {
    ruleId: "references-cited-in-text",
    section: "references_citation",
    label: "Setiap referensi disitasi di teks",
    expectedValue: 'Setiap referensi disitasi minimal sekali (1–2 penulis lengkap, 3+ penulis pakai "et al.")',
  },
  {
    ruleId: "structure-heading-format",
    section: "structure_heading",
    label: "Format judul bagian (Heading 1)",
    expectedValue: `${BODY_FONT}, Bold, ${HEADING_SIZE_HALF_PT_H1 / 2}pt, ALL CAPS, rata kiri-kanan (justified)`,
  },
  {
    ruleId: "table-figure-caption-format",
    section: "tables_figures_equations",
    label: "Format judul tabel/gambar",
    expectedValue: `${BODY_FONT}, Bold, ${BODY_SIZE_HALF_PT / 2}pt, rata tengah`,
  },
];
