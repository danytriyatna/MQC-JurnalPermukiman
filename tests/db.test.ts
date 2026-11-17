import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import {
  db,
  client,
  users,
  manuscripts,
  manuscriptVersions,
  screeningRuns,
  findings,
  referenceCheckRuns,
  referenceChecks,
} from "../src/db";

describe("Database & Schema Verification Suite", () => {
  let seededUserId: string;
  let testManuscriptId: string;
  let testVersionId: string;
  let testScreeningRunId: string;
  let testFindingId: string;
  let testRefRunId: string;
  let testRefCheckId: string;

  before(async () => {
    const seeded = await db
      .select()
      .from(users)
      .where(eq(users.email, "user_dev@test.com"))
      .limit(1);

    assert.ok(seeded.length > 0, "Seeded user should exist in database");
    seededUserId = seeded[0].id;
  });

  after(async () => {
    // Clean up any test manuscript created during tests
    if (testManuscriptId) {
      await db.delete(manuscripts).where(eq(manuscripts.id, testManuscriptId));
    }
    await client.end();
  });

  it("verifies seeded user details and password hash", async () => {
    const user = (
      await db.select().from(users).where(eq(users.id, seededUserId))
    )[0];
    assert.equal(user.email, "user_dev@test.com");
    assert.equal(user.fullName, "Developer");
    assert.equal(user.role, "staff");
    assert.ok(user.createdAt instanceof Date, "createdAt should be a Date");

    const match = await bcrypt.compare("adminadmin", user.passwordHash);
    assert.equal(match, true, "Password should match bcrypt hash");
  });

  it("inserts a manuscript and manuscript version with circular reference", async () => {
    // 1. Insert manuscript
    const [insertedManuscript] = await db
      .insert(manuscripts)
      .values({
        title: "Test Manuscript Drizzle Migration",
        originalFileName: "test_manuscript.docx",
        uploadedBy: seededUserId,
        status: "processing",
        versionNumber: 1,
      })
      .returning();

    assert.ok(insertedManuscript.id);
    testManuscriptId = insertedManuscript.id;

    // 2. Insert manuscript version
    const [insertedVersion] = await db
      .insert(manuscriptVersions)
      .values({
        manuscriptId: testManuscriptId,
        versionNumber: 1,
        originalFileName: "test_manuscript.docx",
        fileStoragePath: `${seededUserId}/${testManuscriptId}.docx`,
        uploadedBy: seededUserId,
        parseStatus: "success",
      })
      .returning();

    assert.ok(insertedVersion.id);
    testVersionId = insertedVersion.id;

    // 3. Update manuscript current_version_id
    const [updatedManuscript] = await db
      .update(manuscripts)
      .set({
        currentVersionId: testVersionId,
        totalRulesChecked: 27,
        totalRulesPassed: 25,
        errorFindings: 1,
        warningFindings: 1,
        status: "needs_revision",
      })
      .where(eq(manuscripts.id, testManuscriptId))
      .returning();

    assert.equal(updatedManuscript.currentVersionId, testVersionId);
    assert.equal(updatedManuscript.status, "needs_revision");
  });

  it("verifies manuscript relations query", async () => {
    const record = await db.query.manuscripts.findFirst({
      where: eq(manuscripts.id, testManuscriptId),
      with: {
        uploader: true,
        currentVersion: true,
        versions: true,
      },
    });

    assert.ok(record, "Manuscript record should exist");
    assert.equal(record.uploader?.email, "user_dev@test.com");
    assert.equal(record.currentVersion?.id, testVersionId);
    assert.equal(record.versions.length, 1);
    assert.equal(record.versions[0].id, testVersionId);
  });

  it("inserts screening runs and findings, then queries with relations", async () => {
    const [run] = await db
      .insert(screeningRuns)
      .values({
        manuscriptVersionId: testVersionId,
        ruleSetVersion: "jurnal-permukiman-2026-v1",
        totalRulesChecked: 27,
        totalRulesPassed: 25,
      })
      .returning();

    assert.ok(run.id);
    testScreeningRunId = run.id;

    const [finding] = await db
      .insert(findings)
      .values({
        screeningRunId: testScreeningRunId,
        section: "title_author",
        ruleId: "TITLE_MAX_WORDS",
        ruleName: "Batas Jumlah Kata Judul",
        ruleCategory: "Format Judul",
        severity: "error",
        checkType: "automated",
        location: "Halaman 1",
        currentValue: "22 kata",
        expectedValue: "Maksimal 15 kata",
        suggestedFix: "Persingkat judul naskah",
        suggestion: "Persingkat judul naskah",
      })
      .returning();

    assert.ok(finding.id);
    testFindingId = finding.id;

    const runWithFindings = await db.query.screeningRuns.findFirst({
      where: eq(screeningRuns.id, testScreeningRunId),
      with: {
        findings: true,
      },
    });

    assert.ok(runWithFindings);
    assert.equal(runWithFindings.findings.length, 1);
    assert.equal(runWithFindings.findings[0].ruleId, "TITLE_MAX_WORDS");
  });

  it("inserts reference check runs and reference checks, then queries with relations", async () => {
    const [refRun] = await db
      .insert(referenceCheckRuns)
      .values({
        manuscriptVersionId: testVersionId,
        sourceSetVersion: "crossref+openalex+openlibrary-v1",
        totalReferences: 1,
      })
      .returning();

    assert.ok(refRun.id);
    testRefRunId = refRun.id;

    const [refCheck] = await db
      .insert(referenceChecks)
      .values({
        runId: testRefRunId,
        manuscriptVersionId: testVersionId,
        entryIndex: 1,
        rawText: "Smith, J. (2020). Urban Planning in Indonesia. Journal of Housing.",
        kind: "journal",
        doi: "10.1234/urban.2020.001",
        verdict: "verified",
        confidence: "high",
        matchSource: "crossref",
        matchTitle: "Urban Planning in Indonesia",
        matchSimilarity: 0.98,
      })
      .returning();

    assert.ok(refCheck.id);
    testRefCheckId = refCheck.id;

    const runWithChecks = await db.query.referenceCheckRuns.findFirst({
      where: eq(referenceCheckRuns.id, testRefRunId),
      with: {
        referenceChecks: true,
      },
    });

    assert.ok(runWithChecks);
    assert.equal(runWithChecks.referenceChecks.length, 1);
    assert.equal(runWithChecks.referenceChecks[0].id, testRefCheckId);
    assert.equal(runWithChecks.referenceChecks[0].verdict, "verified");
  });

  it("inserts reference checks using prompt-specified columns and tests pending query", async () => {
    // Insert using indexInBibliography, parsedTitle, etc. without entryIndex
    const [promptRefCheck] = await db
      .insert(referenceChecks)
      .values({
        runId: testRefRunId,
        manuscriptVersionId: testVersionId,
        rawText: "Doe, J. (2021). Housing Dynamics. Architecture Press.",
        indexInBibliography: 2,
        parsedAuthors: "Doe, J.",
        parsedYear: "2021",
        parsedTitle: "Housing Dynamics",
        parsedSource: "Architecture Press",
        parsedDoi: "10.1000/182",
        parsedUrl: "https://example.com/paper",
        verificationStatus: "pending",
        failureReason: null,
        sourceRegistry: "crossref",
        matchedTitle: "Housing Dynamics",
        matchedDoi: "10.1000/182",
        similarityScore: 0.95,
        metadata: { publisher: "Architecture Press" },
      })
      .returning();

    assert.ok(promptRefCheck.id);
    assert.equal(promptRefCheck.indexInBibliography, 2);
    assert.equal(promptRefCheck.parsedTitle, "Housing Dynamics");

    // Test querying pending reference checks
    const pendingRows = await db
      .select()
      .from(referenceChecks)
      .where(eq(referenceChecks.verdict, "pending"));
    assert.ok(pendingRows.length >= 1, "Should find pending reference check rows");
  });

  it("queries user relations to manuscripts and manuscript versions", async () => {
    const userWithRelations = await db.query.users.findFirst({
      where: eq(users.id, seededUserId),
      with: {
        manuscripts: true,
        manuscriptVersions: true,
      },
    });

    assert.ok(userWithRelations);
    assert.ok(userWithRelations.manuscripts.length >= 1);
    assert.ok(userWithRelations.manuscriptVersions.length >= 1);
  });

  it("verifies direct cascading delete on manuscript with circular FK", async () => {
    // Before delete, records exist
    const initialRun = await db
      .select()
      .from(screeningRuns)
      .where(eq(screeningRuns.id, testScreeningRunId));
    assert.equal(initialRun.length, 1);

    // Verify currentVersionId is set (circular FK active)
    const [currentM] = await db.select().from(manuscripts).where(eq(manuscripts.id, testManuscriptId));
    assert.equal(currentM.currentVersionId, testVersionId);

    // Direct deletion without updating currentVersionId to null first!
    await db.delete(manuscripts).where(eq(manuscripts.id, testManuscriptId));

    // After manuscript delete, cascade should have deleted manuscript_versions,
    // screening_runs, findings, reference_check_runs, and reference_checks.
    const remainingVersions = await db
      .select()
      .from(manuscriptVersions)
      .where(eq(manuscriptVersions.id, testVersionId));
    assert.equal(remainingVersions.length, 0, "manuscript_versions should cascade delete");

    const remainingRuns = await db
      .select()
      .from(screeningRuns)
      .where(eq(screeningRuns.id, testScreeningRunId));
    assert.equal(remainingRuns.length, 0, "screening_runs should cascade delete");

    const remainingFindings = await db
      .select()
      .from(findings)
      .where(eq(findings.id, testFindingId));
    assert.equal(remainingFindings.length, 0, "findings should cascade delete");

    const remainingRefChecks = await db
      .select()
      .from(referenceChecks)
      .where(eq(referenceChecks.id, testRefCheckId));
    assert.equal(remainingRefChecks.length, 0, "reference_checks should cascade delete");

    // Clear testManuscriptId so after() doesn't need to clean up
    testManuscriptId = "";
  });
});
