import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { ParsedDocument, ParsedParagraph, SectionProps } from "./types";
import { StyleTable, applyDirectParagraphFormat, child, attr } from "./styleResolver";

const REPEATING_TAGS = new Set([
  "w:p",
  "w:r",
  "w:t",
  "w:style",
  "w:tbl",
  "w:tr",
  "w:tc",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: false,
  isArray: (name) => REPEATING_TAGS.has(name),
});

type XmlNode = Record<string, unknown>;

export class DocxParseError extends Error {}

export async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocxParseError("File tidak bisa dibuka sebagai dokumen Word (.docx) yang valid.");
  }

  const documentXmlFile = zip.file("word/document.xml");
  if (!documentXmlFile) {
    throw new DocxParseError("Struktur file .docx tidak lengkap (word/document.xml tidak ditemukan).");
  }

  const documentXml = await documentXmlFile.async("string");
  const documentRoot = parser.parse(documentXml) as XmlNode;

  const stylesXmlFile = zip.file("word/styles.xml");
  const stylesXml = stylesXmlFile ? await stylesXmlFile.async("string") : null;
  const styleTable = new StyleTable(stylesXml ? (parser.parse(stylesXml) as XmlNode) : {});

  const body = child(child(documentRoot, "w:document"), "w:body");
  const paragraphNodes = extractParagraphsInDocumentOrder(documentXml);

  const paragraphs: ParsedParagraph[] = paragraphNodes.map((node, index) =>
    parseParagraph(node, index, styleTable),
  );

  const sectPr = findSectPr(body);
  const section = sectPr ? parseSectionProps(sectPr) : null;

  const declaredPageCount = await readDeclaredPageCount(zip);

  return { paragraphs, section, declaredPageCount };
}

/**
 * Reads docProps/app.xml's <Pages> value — Word's own last-computed page
 * count for the document, refreshed whenever the file is saved in Word.
 * Read as a plain regex rather than through the full XML parser since it's
 * one flat scalar; parsed directly from the file, not through parser/child
 * helpers used elsewhere for the document body.
 */
async function readDeclaredPageCount(zip: JSZip): Promise<number | null> {
  const appXmlFile = zip.file("docProps/app.xml");
  if (!appXmlFile) return null;
  const appXml = await appXmlFile.async("string");
  const match = appXml.match(/<Pages>(\d+)<\/Pages>/);
  if (!match) return null;
  const pages = parseInt(match[1], 10);
  return pages > 0 ? pages : null;
}

/**
 * Paragraphs can live inside table cells (e.g. a two-column reference list
 * laid out with an invisible-border table), nested arbitrarily deep. Parsing
 * the whole document into one JS object collapses same-tag-name siblings
 * into arrays keyed by tag name, which loses the true document order between
 * mixed w:p / w:tbl siblings. Scanning the raw XML for <w:p>...</w:p>
 * fragments instead — a w:p can never contain another w:p per the OOXML
 * schema — recovers every paragraph exactly once, in true reading order,
 * regardless of table nesting.
 */
// KNOWN ISSUE — floating objects are read twice, and nested paragraphs once.
//
// Word writes a text box or grouped drawing twice: as DrawingML inside
// <mc:Choice>, and again as legacy VML inside <mc:Fallback>. Both copies carry
// the same <w:txbxContent>, so every paragraph inside one appears twice below,
// which inflates the "X dari Y judul tabel/gambar" tally and can report a
// single malformed caption as two.
//
// Discarding <mc:Fallback> is what the Markup Compatibility spec prescribes,
// but on its own it loses content: the paragraph scanner here is not
// nesting-aware, so a <w:p> inside a text box is swallowed by the <w:p> that
// anchors the drawing instead of being emitted in its own right. Today the
// duplicate is the only reason those paragraphs surface at all — in one real
// submission, dropping the fallback made both table captions disappear from
// the parse entirely. Fixing this properly means pairing <w:p> tags with a
// stack and stopping run collection at a nested paragraph, which renumbers
// every paragraph in every document and so shifts the "Paragraf N" references
// that every rule reports.

function extractParagraphsInDocumentOrder(documentXml: string): XmlNode[] {
  // Two independent alternatives (each with its own lazy attribute match),
  // not a shared prefix — a shared-prefix version greedily consumes the
  // trailing "/" of a self-closing <w:p .../> as part of the attribute
  // string, misdetecting it as a real open tag and swallowing everything up
  // to the *next* paragraph's closing tag.
  const fragmentPattern = /<w:p(?:\s[^>]*?)?\/>|<w:p(?:\s[^>]*?)?>[\s\S]*?<\/w:p>/g;
  const fragments = documentXml.match(fragmentPattern) ?? [];

  return fragments.map((fragment) => {
    const wrapped = `<w:root>${fragment}</w:root>`;
    const parsed = parser.parse(wrapped) as XmlNode;
    const root = child(parsed, "w:root");
    const nodes = (root?.["w:p"] as XmlNode[] | undefined) ?? [];
    return nodes[0] ?? {};
  });
}

/**
 * Collects every <w:r> run anywhere inside a paragraph node, however deeply
 * nested. A naive `node["w:r"]` only sees runs that are direct children of
 * <w:p> — but reference-manager plugins (Mendeley, EndNote, Zotero) commonly
 * wrap an inserted citation's run(s) in a Structured Document Tag
 * (<w:sdt><w:sdtContent><w:r>...), and Word itself does the same for other
 * content controls, tracked-change insertions (<w:ins>), and hyperlinks
 * (<w:hyperlink>). Without recursing into those wrapper elements, a citation
 * like "(Abdi, 2007)" is silently invisible to every text-based check in
 * this file even though it's fully visible in the rendered document.
 */
function collectRuns(node: unknown, acc: XmlNode[] = []): XmlNode[] {
  if (Array.isArray(node)) {
    node.forEach((item) => collectRuns(item, acc));
    return acc;
  }
  if (node && typeof node === "object") {
    const obj = node as XmlNode;
    if (obj["w:r"] !== undefined) {
      const runs = Array.isArray(obj["w:r"]) ? (obj["w:r"] as XmlNode[]) : [obj["w:r"] as XmlNode];
      acc.push(...runs);
    }
    for (const key of Object.keys(obj)) {
      // w:r already collected above; w:rPr/w:pPr are formatting properties,
      // never containers for further runs.
      if (key === "w:r" || key === "w:rPr" || key === "w:pPr") continue;
      collectRuns(obj[key], acc);
    }
  }
  return acc;
}

function parseParagraph(node: XmlNode, index: number, styleTable: StyleTable): ParsedParagraph {
  const pPr = child(node, "w:pPr");
  const styleId = attr(child(pPr, "w:pStyle"), "w:val") ?? null;

  const runs = collectRuns(node);
  const firstRunRPr = runs.length > 0 ? child(runs[0], "w:rPr") : undefined;

  const baseFormat = styleTable.resolve(styleId);
  const format = applyDirectParagraphFormat(baseFormat, pPr, firstRunRPr);

  const text = runs
    .flatMap((run) => (run["w:t"] as XmlNode[] | undefined) ?? [])
    .map((t) => (typeof t === "string" ? t : (t as { "#text"?: string })["#text"] ?? ""))
    .join("");

  return { index, text, styleId, format };
}

function findSectPr(body: XmlNode | undefined): XmlNode | undefined {
  if (!body) return undefined;
  const direct = child(body, "w:sectPr");
  if (direct) return direct;
  // Fall back to the sectPr nested inside the last paragraph's pPr, if present.
  const paragraphNodes = (body["w:p"] as XmlNode[] | undefined) ?? [];
  for (let i = paragraphNodes.length - 1; i >= 0; i--) {
    const pPr = child(paragraphNodes[i], "w:pPr");
    const nested = child(pPr, "w:sectPr");
    if (nested) return nested;
  }
  return undefined;
}

function parseSectionProps(sectPr: XmlNode): SectionProps {
  const pgSz = child(sectPr, "w:pgSz");
  const pgMar = child(sectPr, "w:pgMar");

  const num = (node: XmlNode | undefined, name: string, fallback: number) => {
    const value = attr(node, name);
    return value ? parseInt(value, 10) : fallback;
  };

  return {
    pageWidthTwips: num(pgSz, "w:w", 11906),
    pageHeightTwips: num(pgSz, "w:h", 16838),
    marginTopTwips: num(pgMar, "w:top", 0),
    marginBottomTwips: num(pgMar, "w:bottom", 0),
    marginLeftTwips: num(pgMar, "w:left", 0),
    marginRightTwips: num(pgMar, "w:right", 0),
    marginHeaderTwips: num(pgMar, "w:header", 0),
    marginFooterTwips: num(pgMar, "w:footer", 0),
  };
}
