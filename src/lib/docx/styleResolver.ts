import { ResolvedFormat } from "./types";

const W_NS = "w:";

type XmlNode = Record<string, unknown>;

function attr(node: XmlNode | undefined, name: string): string | undefined {
  if (!node) return undefined;
  const value = node[`@_${name}`];
  return typeof value === "string" ? value : undefined;
}

function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  if (!node) return undefined;
  const value = node[name];
  if (Array.isArray(value)) return value[0] as XmlNode;
  return value as XmlNode | undefined;
}

/** True unless the toggle element explicitly sets w:val="0"/"false". */
function toggleValue(node: XmlNode | undefined): boolean | undefined {
  if (node === undefined) return undefined;
  const val = attr(node, "w:val");
  if (val === undefined) return true;
  return val !== "0" && val.toLowerCase() !== "false";
}

const ALIGNMENTS: Record<string, ResolvedFormat["alignment"]> = {
  left: "left",
  start: "left",
  center: "center",
  right: "right",
  end: "right",
  both: "both",
};

function applyRPr(base: ResolvedFormat, rPr: XmlNode | undefined): ResolvedFormat {
  if (!rPr) return base;
  const next = { ...base };

  const rFonts = child(rPr, `${W_NS}rFonts`);
  const ascii = attr(rFonts, "w:ascii");
  if (ascii) next.fontAscii = ascii;

  const sz = attr(child(rPr, `${W_NS}sz`), "w:val");
  if (sz) next.sizeHalfPt = parseInt(sz, 10);

  const bold = toggleValue(child(rPr, `${W_NS}b`));
  if (bold !== undefined) next.bold = bold;

  const italic = toggleValue(child(rPr, `${W_NS}i`));
  if (italic !== undefined) next.italic = italic;

  const caps = toggleValue(child(rPr, `${W_NS}caps`));
  if (caps !== undefined) next.caps = caps;

  return next;
}

function applyPPr(base: ResolvedFormat, pPr: XmlNode | undefined): ResolvedFormat {
  if (!pPr) return base;
  const next = { ...base };

  const jc = attr(child(pPr, `${W_NS}jc`), "w:val");
  if (jc && ALIGNMENTS[jc]) next.alignment = ALIGNMENTS[jc];

  const spacing = child(pPr, `${W_NS}spacing`);
  const before = attr(spacing, "w:before");
  if (before) next.spacingBeforeTwips = parseInt(before, 10);
  const after = attr(spacing, "w:after");
  if (after) next.spacingAfterTwips = parseInt(after, 10);

  return next;
}

export interface StyleDefinition {
  id: string;
  basedOn: string | null;
  pPr?: XmlNode;
  rPr?: XmlNode;
}

export class StyleTable {
  private styles = new Map<string, StyleDefinition>();

  constructor(stylesXml: XmlNode) {
    const stylesRoot = child(stylesXml, `${W_NS}styles`);
    const styleNodes = (stylesRoot?.[`${W_NS}style`] as XmlNode[] | undefined) ?? [];

    for (const node of styleNodes) {
      const id = attr(node, "w:styleId");
      if (!id) continue;
      const basedOn = attr(child(node, `${W_NS}basedOn`), "w:val") ?? null;
      this.styles.set(id, {
        id,
        basedOn,
        pPr: child(node, `${W_NS}pPr`),
        rPr: child(node, `${W_NS}rPr`),
      });
    }
  }

  /** Resolves a style's formatting by walking its basedOn chain from the root down. */
  resolve(styleId: string | null): ResolvedFormat {
    const chain: StyleDefinition[] = [];
    let current = styleId ? this.styles.get(styleId) : this.styles.get("Normal");
    const seen = new Set<string>();

    while (current && !seen.has(current.id)) {
      chain.unshift(current);
      seen.add(current.id);
      current = current.basedOn ? this.styles.get(current.basedOn) : undefined;
    }

    let format: ResolvedFormat = { bold: false, italic: false, caps: false };
    for (const style of chain) {
      format = applyPPr(format, style.pPr);
      format = applyRPr(format, style.rPr);
    }
    return format;
  }
}

export function applyDirectParagraphFormat(
  base: ResolvedFormat,
  pPr: XmlNode | undefined,
  firstRunRPr: XmlNode | undefined,
): ResolvedFormat {
  let format = applyPPr(base, pPr);
  format = applyRPr(format, firstRunRPr);
  return format;
}

export { child, attr };
