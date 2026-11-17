import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  real,
  jsonb,
  unique,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ============================================================
// users — custom auth replacing Supabase auth.users & profiles
// ============================================================
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull().default("staff"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// manuscripts — one row per manuscript, summary of current version
// ============================================================
export const manuscripts = pgTable(
  "manuscripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    originalFileName: text("original_file_name").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    status: text("status").notNull().default("processing"),
    versionNumber: integer("version_number").notNull().default(1),
    totalRulesChecked: integer("total_rules_checked").notNull().default(0),
    totalRulesPassed: integer("total_rules_passed").notNull().default(0),
    errorFindings: integer("error_findings").notNull().default(0),
    warningFindings: integer("warning_findings").notNull().default(0),
    currentVersionId: uuid("current_version_id").references(
      (): AnyPgColumn => manuscriptVersions.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ojsSubmissionId: integer("ojs_submission_id"),
    ojsUserId: integer("ojs_user_id"),
    authorName: text("author_name"),
    authorEmail: text("author_email"),
    assignedEditorName: text("assigned_editor_name"),
    assignedEditorFetchedAt: timestamp("assigned_editor_fetched_at", { withTimezone: true }),
    ojsReportSubmissionFileId: integer("ojs_report_submission_file_id"),
    ojsSyncStatus: text("ojs_sync_status").notNull().default("idle"),
    ojsLastSyncedAt: timestamp("ojs_last_synced_at", { withTimezone: true }),
    ojsSyncError: text("ojs_sync_error"),
  },
  (table) => [
    index("manuscripts_updated_at_idx").on(table.updatedAt),
    index("manuscripts_status_idx").on(table.status),
    index("manuscripts_deleted_at_idx").on(table.deletedAt),
    index("manuscripts_ojs_submission_id_idx").on(table.ojsSubmissionId),
    index("manuscripts_ojs_sync_status_idx").on(table.ojsSyncStatus),
  ],
);

// ============================================================
// manuscript_versions — full upload history per manuscript
// ============================================================
export const manuscriptVersions = pgTable(
  "manuscript_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manuscriptId: uuid("manuscript_id")
      .notNull()
      .references(() => manuscripts.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    originalFileName: text("original_file_name").notNull(),
    fileStoragePath: text("file_storage_path").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    parseStatus: text("parse_status").notNull().default("success"),
    parseErrorMessage: text("parse_error_message"),
  },
  (table) => [
    unique("manuscript_versions_manuscript_id_version_number_key").on(
      table.manuscriptId,
      table.versionNumber,
    ),
  ],
);

// ============================================================
// screening_runs — one row per automated screening pass
// ============================================================
export const screeningRuns = pgTable("screening_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  manuscriptVersionId: uuid("manuscript_version_id")
    .notNull()
    .references(() => manuscriptVersions.id, { onDelete: "cascade" }),
  ruleSetVersion: text("rule_set_version").notNull(),
  totalRulesChecked: integer("total_rules_checked").notNull().default(0),
  totalRulesPassed: integer("total_rules_passed").notNull().default(0),
  totalRulesFailed: integer("total_rules_failed").notNull().default(0),
  status: text("status").notNull().default("completed"),
  errorFindings: integer("error_findings").notNull().default(0),
  warningFindings: integer("warning_findings").notNull().default(0),
  noticeFindings: integer("notice_findings").notNull().default(0),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("screening_runs_manuscript_version_id_idx").on(table.manuscriptVersionId),
]);

// ============================================================
// findings — individual rule-check results within a screening run
// ============================================================
export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    screeningRunId: uuid("screening_run_id")
      .notNull()
      .references(() => screeningRuns.id, { onDelete: "cascade" }),
    section: text("section").notNull().default("title_author"),
    ruleId: text("rule_id").notNull(),
    ruleName: text("rule_name"),
    ruleCategory: text("rule_category"),
    severity: text("severity").notNull(),
    checkType: text("check_type").notNull().default("automated"),
    message: text("message"),
    targetText: text("target_text"),
    paragraphIndex: integer("paragraph_index"),
    visualAnchor: text("visual_anchor"),
    location: text("location").notNull().default(""),
    currentValue: text("current_value").notNull().default(""),
    expectedValue: text("expected_value").notNull().default(""),
    suggestedFix: text("suggested_fix").notNull().default(""),
    suggestion: text("suggestion"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("findings_screening_run_id_idx").on(table.screeningRunId)],
);

// ============================================================
// reference_check_runs — verification pass over manuscript version
// ============================================================
export const referenceCheckRuns = pgTable(
  "reference_check_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manuscriptVersionId: uuid("manuscript_version_id")
      .notNull()
      .references(() => manuscriptVersions.id, { onDelete: "cascade" }),
    sourceSetVersion: text("source_set_version").notNull().default("crossref+openalex+openlibrary-v1"),
    totalReferences: integer("total_references").notNull().default(0),
    totalChecked: integer("total_checked").notNull().default(0),
    totalValid: integer("total_valid").notNull().default(0),
    totalInvalid: integer("total_invalid").notNull().default(0),
    totalWarning: integer("total_warning").notNull().default(0),
    status: text("status").notNull().default("completed"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("reference_check_runs_version_idx").on(
      table.manuscriptVersionId,
      table.startedAt,
    ),
  ],
);

// ============================================================
// reference_checks — one row per bibliography entry
// ============================================================
export const referenceChecks = pgTable(
  "reference_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => referenceCheckRuns.id, { onDelete: "cascade" }),
    manuscriptVersionId: uuid("manuscript_version_id").references(
      () => manuscriptVersions.id,
      { onDelete: "cascade" },
    ),
    entryIndex: integer("entry_index"),
    rawText: text("raw_text").notNull(),
    kind: text("kind").notNull().default("unknown"),
    doi: text("doi"),
    url: text("url"),
    title: text("title"),
    citedYear: text("cited_year"),
    verdict: text("verdict").notNull().default("pending"),
    confidence: text("confidence"),
    note: text("note"),
    matchSource: text("match_source"),
    matchTitle: text("match_title"),
    matchYear: text("match_year"),
    matchUrl: text("match_url"),
    matchSimilarity: real("match_similarity"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),

    // Additional fields for compatibility
    indexInBibliography: integer("index_in_bibliography"),
    parsedAuthors: text("parsed_authors"),
    parsedYear: text("parsed_year"),
    parsedTitle: text("parsed_title"),
    parsedSource: text("parsed_source"),
    parsedDoi: text("parsed_doi"),
    parsedUrl: text("parsed_url"),
    verificationStatus: text("verification_status"),
    failureReason: text("failure_reason"),
    sourceRegistry: text("source_registry"),
    matchedTitle: text("matched_title"),
    matchedDoi: text("matched_doi"),
    similarityScore: real("similarity_score"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("reference_checks_run_id_entry_index_key").on(
      table.runId,
      table.entryIndex,
    ),
    index("reference_checks_run_id_idx").on(table.runId),
    index("reference_checks_pending_idx")
      .on(table.runId, table.entryIndex)
      .where(sql`verdict = 'pending'`),
  ],
);

// ============================================================
// screening_jobs — durable job queue (FOR UPDATE SKIP LOCKED)
// ============================================================
export const screeningJobs = pgTable(
  "screening_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manuscriptId: uuid("manuscript_id")
      .notNull()
      .references(() => manuscripts.id, { onDelete: "cascade" }),
    manuscriptVersionId: uuid("manuscript_version_id")
      .notNull()
      .references(() => manuscriptVersions.id, { onDelete: "cascade" }),
    ojsSubmissionId: integer("ojs_submission_id"),
    versionNumber: integer("version_number").notNull().default(1),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").notNull().default("pending"), // pending | processing | completed | failed | dead
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lockedBy: text("locked_by"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    syncMode: text("sync_mode").notNull().default("dry_run"), // dry_run | live | skipped
    syncPayload: jsonb("sync_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("screening_jobs_status_available_idx").on(table.status, table.availableAt),
    index("screening_jobs_manuscript_id_idx").on(table.manuscriptId),
    index("screening_jobs_locked_until_idx").on(table.lockedUntil),
  ],
);

// ============================================================
// Relations
// ============================================================

export const usersRelations = relations(users, ({ many }) => ({
  manuscripts: many(manuscripts),
  manuscriptVersions: many(manuscriptVersions),
}));

export const manuscriptsRelations = relations(manuscripts, ({ one, many }) => ({
  uploader: one(users, {
    fields: [manuscripts.uploadedBy],
    references: [users.id],
  }),
  currentVersion: one(manuscriptVersions, {
    fields: [manuscripts.currentVersionId],
    references: [manuscriptVersions.id],
    relationName: "currentVersion",
  }),
  versions: many(manuscriptVersions, { relationName: "manuscriptVersions" }),
}));

export const manuscriptVersionsRelations = relations(manuscriptVersions, ({ one, many }) => ({
  manuscript: one(manuscripts, {
    fields: [manuscriptVersions.manuscriptId],
    references: [manuscripts.id],
    relationName: "manuscriptVersions",
  }),
  uploader: one(users, {
    fields: [manuscriptVersions.uploadedBy],
    references: [users.id],
  }),
  screeningRuns: many(screeningRuns),
  referenceCheckRuns: many(referenceCheckRuns),
  referenceChecks: many(referenceChecks),
}));

export const screeningRunsRelations = relations(screeningRuns, ({ one, many }) => ({
  manuscriptVersion: one(manuscriptVersions, {
    fields: [screeningRuns.manuscriptVersionId],
    references: [manuscriptVersions.id],
  }),
  findings: many(findings),
}));

export const findingsRelations = relations(findings, ({ one }) => ({
  screeningRun: one(screeningRuns, {
    fields: [findings.screeningRunId],
    references: [screeningRuns.id],
  }),
}));

export const referenceCheckRunsRelations = relations(referenceCheckRuns, ({ one, many }) => ({
  manuscriptVersion: one(manuscriptVersions, {
    fields: [referenceCheckRuns.manuscriptVersionId],
    references: [manuscriptVersions.id],
  }),
  referenceChecks: many(referenceChecks),
}));

export const referenceChecksRelations = relations(referenceChecks, ({ one }) => ({
  run: one(referenceCheckRuns, {
    fields: [referenceChecks.runId],
    references: [referenceCheckRuns.id],
  }),
  manuscriptVersion: one(manuscriptVersions, {
    fields: [referenceChecks.manuscriptVersionId],
    references: [manuscriptVersions.id],
  }),
}));
