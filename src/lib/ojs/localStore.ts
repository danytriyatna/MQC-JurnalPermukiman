import fs from "fs/promises";
import path from "path";
import { ManuscriptStatus } from "@/lib/types";
import type {
  ReferenceCheckRowData,
  ReferenceRunData,
} from "@/components/references/ReferenceVerificationPanel";

export interface OjsSyncedRecord {
  id: string;
  ojs_submission_id?: number | string;
  title: string;
  originalFileName: string;
  uploadedBy: string;
  status: ManuscriptStatus;
  versionNumber?: number;
  totalRulesChecked?: number;
  totalRulesPassed?: number;
  errorFindings?: number;
  warningFindings?: number;
  score?: number;
  filePath?: string | null;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OjsReferenceStoreEntry {
  run: ReferenceRunData | null;
  checks: ReferenceCheckRowData[];
}

const OJS_SUBMISSIONS_FILE = path.join(process.cwd(), "data", "ojs_synced_submissions.json");
const OJS_REFERENCES_FILE = path.join(process.cwd(), "data", "ojs_reference_checks.json");

export async function findOjsSubmission(id: string): Promise<OjsSyncedRecord | null> {
  try {
    const raw = await fs.readFile(OJS_SUBMISSIONS_FILE, "utf-8");
    const list = JSON.parse(raw) as OjsSyncedRecord[];
    return list.find((item) => item.id === id) ?? null;
  } catch {
    return null;
  }
}

async function readAllReferenceStores(): Promise<Record<string, OjsReferenceStoreEntry>> {
  try {
    const raw = await fs.readFile(OJS_REFERENCES_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, OjsReferenceStoreEntry>;
  } catch {
    return {};
  }
}

export async function readOjsReferenceRun(id: string): Promise<OjsReferenceStoreEntry> {
  const all = await readAllReferenceStores();
  return all[id] ?? { run: null, checks: [] };
}

export async function writeOjsReferenceRun(
  id: string,
  entry: OjsReferenceStoreEntry,
): Promise<void> {
  const dir = path.dirname(OJS_REFERENCES_FILE);
  await fs.mkdir(dir, { recursive: true });
  const all = await readAllReferenceStores();
  all[id] = entry;
  await fs.writeFile(OJS_REFERENCES_FILE, JSON.stringify(all, null, 2), "utf-8");
}
