export interface ResolvedFormat {
  fontAscii?: string;
  sizeHalfPt?: number; // Word stores font size in half-points
  bold: boolean;
  italic: boolean;
  caps: boolean;
  alignment?: "left" | "center" | "right" | "both";
  spacingBeforeTwips?: number;
  spacingAfterTwips?: number;
}

export interface ParsedParagraph {
  index: number;
  text: string;
  styleId: string | null;
  format: ResolvedFormat;
}

export interface SectionProps {
  pageWidthTwips: number;
  pageHeightTwips: number;
  marginTopTwips: number;
  marginBottomTwips: number;
  marginLeftTwips: number;
  marginRightTwips: number;
  marginHeaderTwips: number;
  marginFooterTwips: number;
}

export interface ParsedDocument {
  paragraphs: ParsedParagraph[];
  section: SectionProps | null;
  // Word's own last-saved page count from docProps/app.xml, when present.
  // Null if the file was never saved/paginated by Word (e.g. exported from
  // another tool), in which case page-limit checking falls back to a word
  // count estimate.
  declaredPageCount: number | null;
}

export type FindingSection =
  | "title_author"
  | "abstract"
  | "structure_heading"
  | "tables_figures_equations"
  | "references_citation";

export type FindingSeverity = "error" | "warning";
export type FindingCheckType = "automated" | "manual_review_suggested";

export interface FindingDraft {
  section: FindingSection;
  ruleId: string;
  severity: FindingSeverity;
  checkType: FindingCheckType;
  location: string;
  currentValue: string;
  expectedValue: string;
  suggestedFix: string;
}

export interface ScreeningResult {
  totalRulesChecked: number;
  totalRulesPassed: number;
  findings: FindingDraft[];
}
