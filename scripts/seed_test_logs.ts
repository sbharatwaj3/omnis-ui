/**
 * omnis-ui/scripts/seed_test_logs.ts
 *
 * Authentic stress-test seed for the LaTeX PDF longtable pagination test.
 *
 * PURPOSE
 * -------
 * Simulates a full sprint's worth of approved test runs against every
 * regulatory requirement in your database — so you can test the traceability
 * matrix and PDF report without manually approving 115 individual logs.
 *
 * WHAT IT DOES
 * ------------
 * 1. Reads all req_ids from YOUR regulatory_rules table (never writes to it).
 * 2. Seeds one scaffold org/build/user set (FK requirements for evidence_logs).
 * 3. Inserts one evidence_log per rule with AUTHENTIC data:
 *      - raw_command   → realistic pytest command for that framework/clause
 *      - raw_logs      → realistic pytest stdout output with pass/fail lines
 *      - execution_status → SUCCESS or FAILED based on distribution
 *      - approved_by   → set on the first ~85% (rest stay pending for realism)
 *
 * DISTRIBUTION (against all N rules found in the DB)
 *   ~85% → COMPLIANT  (approved_by = approver UUID, status = SUCCESS)
 *   ~10% → PENDING    (approved_by = null, status = SUCCESS — awaiting sign-off)
 *   ~5%  → FAILED LOG (approved_by = null, status = FAILED — realistic anomaly)
 *
 * WHAT THIS SCRIPT NEVER DOES
 * ----------------------------
 * - Never writes to regulatory_rules.
 * - Never modifies existing evidence_logs.
 * - Never hardcodes secrets.
 *
 * HOW TO RUN (from the omnis-ui directory):
 *   npx ts-node --transpile-only scripts/seed_test_logs.ts
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Bootstrap — load .env.local
// ---------------------------------------------------------------------------

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.warn("[seed] .env.local not found — relying on process.env");
    return;
  }
  const raw = fs.readFileSync(envPath, "utf-8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("[env] NEXT_PUBLIC_SUPABASE_URL loaded :", !!SUPABASE_URL);
console.log("[env] SUPABASE_SERVICE_ROLE_KEY loaded :", !!SERVICE_ROLE_KEY);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "FATAL: Missing env vars. Run from omnis-ui directory and ensure " +
    ".env.local contains NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
}

function createAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Authentic test command + log generation
//
// Each regulatory clause maps to a specific pytest module and markers that
// reflect what a real SaMD CI pipeline would actually run. This mirrors the
// clinical_heuristic patterns in regulatory_data.json.
// ---------------------------------------------------------------------------

interface ClauseProfile {
  req_id: string;
  module: string;        // pytest file path
  marker: string;        // -m "..." expression
  testCount: number;     // how many tests the suite contains
  passCount: number;     // how many pass (testCount if SUCCESS, less if FAILED)
  suiteName: string;     // human-readable suite name shown in AI insights
}

/**
 * Derives an authentic pytest command and test profile from a req_id.
 * The req_id format in regulatory_rules is e.g. "21 CFR 820 – 820.30(a)"
 * or just the clause code itself — we handle both patterns.
 */
function deriveClauseProfile(reqId: string, status: "SUCCESS" | "FAILED"): ClauseProfile {
  const id = reqId.toLowerCase();

  // Determine framework bucket
  let module: string;
  let marker: string;
  let suiteName: string;
  let baseTests: number;

  if (id.includes("820.30")) {
    const sub = id.match(/820\.30\(([a-j])\)/)?.[1] ?? "a";
    const subMap: Record<string, string> = {
      a: "design_control_scope",
      b: "design_dev_planning",
      c: "design_input",
      d: "design_output",
      e: "design_review",
      f: "design_verification",
      g: "design_validation",
      h: "design_transfer",
      i: "design_changes",
      j: "design_history_file",
    };
    const name = subMap[sub] ?? "design_control";
    module = `tests/cfr820/test_${name}.py`;
    marker = `design_control and cfr_820_30_${sub}`;
    suiteName = `CFR 820.30(${sub.toUpperCase()}) – ${name.replace(/_/g, " ")}`;
    baseTests = 8 + Math.floor(Math.random() * 6);
  } else if (id.includes("820.100")) {
    module = "tests/cfr820/test_capa.py";
    marker = "capa and cfr_820_100";
    suiteName = "CFR 820.100 – Corrective and Preventive Action";
    baseTests = 12;
  } else if (id.includes("11.10")) {
    module = "tests/cfr11/test_closed_system_controls.py";
    marker = "closed_system and cfr_11_10";
    suiteName = "21 CFR Part 11 §11.10 – Closed System Controls";
    baseTests = 15;
  } else if (id.includes("11.30")) {
    module = "tests/cfr11/test_open_system_controls.py";
    marker = "open_system and cfr_11_30";
    suiteName = "21 CFR Part 11 §11.30 – Open System Controls";
    baseTests = 10;
  } else if (id.includes("11.50")) {
    module = "tests/cfr11/test_signature_manifestations.py";
    marker = "esignature and cfr_11_50";
    suiteName = "21 CFR Part 11 §11.50 – Signature Manifestations";
    baseTests = 7;
  } else if (id.includes("11.70")) {
    module = "tests/cfr11/test_signature_linking.py";
    marker = "esignature and cfr_11_70";
    suiteName = "21 CFR Part 11 §11.70 – Signature/Record Linking";
    baseTests = 6;
  } else if (id.includes("11.100")) {
    module = "tests/cfr11/test_general_requirements.py";
    marker = "esignature and cfr_11_100";
    suiteName = "21 CFR Part 11 §11.100 – General E-Sig Requirements";
    baseTests = 8;
  } else if (id.includes("11.200")) {
    module = "tests/cfr11/test_esig_components.py";
    marker = "esignature and cfr_11_200";
    suiteName = "21 CFR Part 11 §11.200 – Electronic Signature Components";
    baseTests = 9;
  } else if (id.includes("11.300")) {
    module = "tests/cfr11/test_identification_codes.py";
    marker = "esignature and cfr_11_300";
    suiteName = "21 CFR Part 11 §11.300 – Identification Code Controls";
    baseTests = 7;
  } else if (id.includes("62304") && id.includes("5.1")) {
    const sub = id.match(/5\.1\.?(\d*)/)?.[1] ?? "";
    module = `tests/iec62304/test_development_planning${sub ? `_${sub}` : ""}.py`;
    marker = `iec62304 and software_planning`;
    suiteName = `IEC 62304 §5.1${sub ? `.${sub}` : ""} – Software Development Planning`;
    baseTests = 6 + Math.floor(Math.random() * 4);
  } else if (id.includes("62304") && id.includes("5.2")) {
    module = "tests/iec62304/test_software_requirements.py";
    marker = "iec62304 and software_requirements";
    suiteName = "IEC 62304 §5.2 – Software Requirements Analysis";
    baseTests = 10;
  } else if (id.includes("62304") && id.includes("5.3")) {
    module = "tests/iec62304/test_software_architecture.py";
    marker = "iec62304 and software_architecture";
    suiteName = "IEC 62304 §5.3 – Software Architecture Design";
    baseTests = 9;
  } else if (id.includes("62304") && id.includes("5.4")) {
    module = "tests/iec62304/test_detailed_design.py";
    marker = "iec62304 and detailed_design";
    suiteName = "IEC 62304 §5.4 – Software Detailed Design";
    baseTests = 8;
  } else if (id.includes("62304") && id.includes("5.5")) {
    module = "tests/iec62304/test_unit_implementation.py";
    marker = "iec62304 and unit_implementation";
    suiteName = "IEC 62304 §5.5 – Software Unit Implementation & Verification";
    baseTests = 14;
  } else if (id.includes("62304") && id.includes("5.6")) {
    module = "tests/iec62304/test_integration_testing.py";
    marker = "iec62304 and integration_testing";
    suiteName = "IEC 62304 §5.6 – Software Integration & Testing";
    baseTests = 12;
  } else if (id.includes("62304") && id.includes("5.7")) {
    module = "tests/iec62304/test_system_testing.py";
    marker = "iec62304 and system_testing";
    suiteName = "IEC 62304 §5.7 – Software System Testing";
    baseTests = 16;
  } else if (id.includes("62304") && id.includes("5.8")) {
    module = "tests/iec62304/test_software_release.py";
    marker = "iec62304 and software_release";
    suiteName = "IEC 62304 §5.8 – Software Release";
    baseTests = 7;
  } else if (id.includes("62304") && id.includes("6.")) {
    module = "tests/iec62304/test_maintenance.py";
    marker = "iec62304 and software_maintenance";
    suiteName = "IEC 62304 §6 – Software Maintenance";
    baseTests = 8;
  } else if (id.includes("62304") && id.includes("7.")) {
    module = "tests/iec62304/test_risk_management.py";
    marker = "iec62304 and risk_management";
    suiteName = "IEC 62304 §7 – Software Risk Management";
    baseTests = 11;
  } else if (id.includes("62304") && id.includes("8.")) {
    module = "tests/iec62304/test_configuration_management.py";
    marker = "iec62304 and configuration_management";
    suiteName = "IEC 62304 §8 – Software Configuration Management";
    baseTests = 9;
  } else if (id.includes("62304") && id.includes("9.")) {
    module = "tests/iec62304/test_problem_resolution.py";
    marker = "iec62304 and problem_resolution";
    suiteName = "IEC 62304 §9 – Software Problem Resolution";
    baseTests = 7;
  } else {
    // Fallback for any clause not matched above
    const safe = reqId.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    module = `tests/regulatory/test_${safe}.py`;
    marker = "regulatory_compliance";
    suiteName = `Regulatory Compliance – ${reqId}`;
    baseTests = 6 + Math.floor(Math.random() * 4);
  }

  const testCount = baseTests;
  const passCount = status === "SUCCESS"
    ? testCount
    : Math.max(0, testCount - (1 + Math.floor(Math.random() * 3)));

  return { req_id: reqId, module, marker, testCount, passCount, suiteName };
}

/** Generates realistic pytest stdout based on pass/fail counts */
function generateRawLogs(profile: ClauseProfile, status: "SUCCESS" | "FAILED"): string {
  const lines: string[] = [
    `============================= test session starts ==============================`,
    `platform linux -- Python 3.11.9, pytest-7.4.3, pluggy-1.3.0`,
    `rootdir: /workspace/omnis-regops`,
    `configfile: pytest.ini`,
    `plugins: anyio-3.6.1, cov-4.1.0, asyncio-0.21.3`,
    `collected ${profile.testCount} items`,
    ``,
    `${profile.module} `,
  ];

  // Generate individual test result lines
  for (let i = 0; i < profile.testCount; i++) {
    const isPassing = i < profile.passCount;
    const testName = `test_${profile.marker.replace(/ and /g, "_").replace(/[^a-z0-9_]/g, "_")}_${String(i + 1).padStart(3, "0")}`;
    if (isPassing) {
      lines.push(`  ${testName} PASSED                                             [ ${Math.round(((i + 1) / profile.testCount) * 100)}%]`);
    } else {
      lines.push(`  ${testName} FAILED                                             [ ${Math.round(((i + 1) / profile.testCount) * 100)}%]`);
      lines.push(`  FAILED ${profile.module}::${testName} - AssertionError: Evidence record missing required approval signature field`);
    }
  }

  lines.push(``);

  if (status === "SUCCESS") {
    lines.push(`============================== ${profile.passCount} passed in 2.${String(Math.floor(Math.random() * 99)).padStart(2, "0")}s ==============================`);
  } else {
    const failCount = profile.testCount - profile.passCount;
    lines.push(`========================= ${failCount} failed, ${profile.passCount} passed in 3.${String(Math.floor(Math.random() * 99)).padStart(2, "0")}s ==========================`);
  }

  return lines.join("\n");
}

/** Random timestamp within the last 90 days */
function randomTimestamp(): string {
  return new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString();
}

/** Deterministic 64-char hex hash for signature_hash */
function fakeHash(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, "0").repeat(8);
}

// ---------------------------------------------------------------------------
// Main seeder
// ---------------------------------------------------------------------------

async function seed() {
  const supabase = createAdminClient();

  console.log("=".repeat(60));
  console.log("OMNIS SEED: Full Regulatory Coverage Stress Test");
  console.log("=".repeat(60));

  // ── Step 1: Read ALL req_ids from the regulatory_rules table of truth ─────
  console.log("\n[1/5] Reading all req_ids from regulatory_rules...");

  const { data: rulesData, error: rulesReadErr } = await supabase
    .from("regulatory_rules")
    .select("req_id")
    .neq("rule_source", "SEED-TEST-DEPRECATED")
    .order("req_id", { ascending: true });

  if (rulesReadErr) {
    console.error("ERROR reading regulatory_rules:", rulesReadErr.message);
    process.exit(1);
  }

  const allReqIds: string[] = (rulesData ?? []).map((r) => r.req_id as string);
  console.log(`      ✓ Found ${allReqIds.length} rules to cover`);

  if (allReqIds.length === 0) {
    console.error(
      "FATAL: regulatory_rules table is empty.\n" +
      "Run omnis-api/scripts/seed_db.py first to populate the table of truth."
    );
    process.exit(1);
  }

  // ── Step 2: Determine distribution ───────────────────────────────────────
  //
  // The last 2 rules are intentional gaps — zero evidence_logs generated for
  // them. They test the [ NO EVIDENCE LINKED ] fallback in the UI and PDF.
  //
  // For the remaining N-2 rules:
  //   ~85% → COMPLIANT  (SUCCESS + approved_by)
  //   ~10% → PENDING    (SUCCESS + no approved_by)
  //   ~5%  → FAILED LOG (FAILED  + no approved_by)
  //
  const n = allReqIds.length;
  const workingIds = allReqIds.slice(0, n - 2);
  const gapIds     = allReqIds.slice(n - 2);

  const w = workingIds.length;
  const compliantCount = Math.round(w * 0.85);
  const pendingCount   = Math.round(w * 0.10);

  const compliantIds = workingIds.slice(0, compliantCount);
  const pendingIds   = workingIds.slice(compliantCount, compliantCount + pendingCount);
  const failedIds    = workingIds.slice(compliantCount + pendingCount);

  console.log(`\n      Coverage distribution across ${n} total rules:`);
  console.log(`        Compliant (SUCCESS + approved) : ${compliantIds.length}`);
  console.log(`        Pending   (SUCCESS + unsigned)  : ${pendingIds.length}`);
  console.log(`        Failed    (FAILED  + unsigned)  : ${failedIds.length}`);
  console.log(`        Gap       (NO LOG — intentional): ${gapIds.length}  → ${gapIds.join(", ")}`);

  // ── Step 3: Resolve scaffold org — reuse existing seed org if present ─────
  //
  // Creating a fresh org every run accumulates garbage and causes FK mismatches
  // when seed users already exist under a different org. We look for an
  // existing seed org first and only create if absent.
  console.log("\n[2/5] Resolving scaffold organization...");

  let orgId: string;
  const { data: existingOrg } = await supabase
    .from("organizations")
    .select("org_id")
    .eq("company_name", "Omnis MedTech Corp [SEED TEST]")
    .maybeSingle();

  if (existingOrg) {
    orgId = existingOrg.org_id as string;
    console.log(`      ✓ Reusing existing org  ${orgId}`);
  } else {
    orgId = randomUUID();
    const { error: orgErr } = await supabase.from("organizations").insert({
      org_id: orgId,
      company_name: "Omnis MedTech Corp [SEED TEST]",
    });
    if (orgErr) { console.error("ERROR inserting org:", orgErr.message); process.exit(1); }
    console.log(`      ✓ Created new org       ${orgId}`);
  }

  // ── Step 4: Resolve scaffold build — reuse existing seed build ────────────
  console.log("\n[3/5] Resolving scaffold build...");

  let buildId: string;
  const { data: existingBuild } = await supabase
    .from("builds")
    .select("build_id")
    .eq("org_id", orgId)
    .eq("version_string", "1.0.0-seed-test")
    .maybeSingle();

  if (existingBuild) {
    buildId = existingBuild.build_id as string;
    console.log(`      ✓ Reusing existing build ${buildId}`);
  } else {
    buildId = randomUUID();
    const { error: buildErr } = await supabase.from("builds").insert({
      build_id: buildId,
      org_id: orgId,
      version_string: "1.0.0-seed-test",
    });
    if (buildErr) { console.error("ERROR inserting build:", buildErr.message); process.exit(1); }
    console.log(`      ✓ Created new build     ${buildId}`);
  }

  // ── Step 5: Resolve scaffold users — look up by email, create if absent ───
  //
  // CRITICAL: We must use the actual user_id values that exist in the database.
  // Generating new UUIDs and trying to upsert them fails because user_id is the
  // PK — Postgres keeps the original PK on conflict. The approved_by FK on
  // evidence_logs points to users.user_id, so we must use the real stored UUIDs.
  console.log("\n[4/5] Resolving scaffold users...");

  const { data: existingUsers, error: usersLookupErr } = await supabase
    .from("users")
    .select("user_id, developer_email")
    .in("developer_email", ["seed-submitter@omnis.test", "seed-approver@omnis.test"]);

  if (usersLookupErr) {
    console.error("ERROR looking up seed users:", usersLookupErr.message);
    process.exit(1);
  }

  let userId: string;
  let approverId: string;

  const existingSubmitter = existingUsers?.find((u) => u.developer_email === "seed-submitter@omnis.test");
  const existingApprover  = existingUsers?.find((u) => u.developer_email === "seed-approver@omnis.test");

  // Create submitter if not found
  if (existingSubmitter) {
    userId = existingSubmitter.user_id as string;
  } else {
    userId = randomUUID();
    const { error: e } = await supabase.from("users").insert({
      user_id: userId,
      org_id: orgId,
      developer_email: "seed-submitter@omnis.test",
      public_key: "seed-public-key-submitter",
    });
    if (e) { console.error("ERROR creating submitter user:", e.message); process.exit(1); }
  }

  // Create approver if not found
  if (existingApprover) {
    approverId = existingApprover.user_id as string;
  } else {
    approverId = randomUUID();
    const { error: e } = await supabase.from("users").insert({
      user_id: approverId,
      org_id: orgId,
      developer_email: "seed-approver@omnis.test",
      public_key: "seed-public-key-approver",
    });
    if (e) { console.error("ERROR creating approver user:", e.message); process.exit(1); }
  }

  console.log(`      submitter : ${userId}  ${existingSubmitter ? "(reused)" : "(created)"}`);
  console.log(`      approver  : ${approverId}  ${existingApprover ? "(reused)" : "(created)"}`);
  console.log("      ✓ Users ready");

  // ── Step 6: Build and insert all evidence_logs ────────────────────────────
  console.log(`\n[5/5] Inserting ${workingIds.length} evidence_logs...`);

  type LogRow = {
    log_id: string;
    org_id: string;
    user_id: string;
    build_id: string;
    req_id: string;
    previous_log_hash: null;
    signature_hash: string;
    raw_command: string;
    sanitized_payload: Record<string, unknown>;
    execution_status: string;
    execution_timestamp: string;
    is_deprecated: boolean;
    event_source: string;
    approved_by: string | null;
  };

  const buildLog = (
    reqId: string,
    status: "SUCCESS" | "FAILED",
    approvedBy: string | null
  ): LogRow => {
    const logId   = randomUUID();
    const profile = deriveClauseProfile(reqId, status);
    const rawLogs = generateRawLogs(profile, status);

    return {
      log_id: logId,
      org_id: orgId,
      user_id: userId,
      build_id: buildId,
      req_id: reqId,
      previous_log_hash: null,
      signature_hash: fakeHash(logId + reqId),
      raw_command: `python -m pytest ${profile.module} -m "${profile.marker}" -v --tb=short`,
      sanitized_payload: {
        raw_logs: rawLogs,
        test_suite: profile.suiteName,
        tests_collected: profile.testCount,
        tests_passed: profile.passCount,
        tests_failed: profile.testCount - profile.passCount,
        coverage_percent: status === "SUCCESS"
          ? (92 + Math.floor(Math.random() * 8))
          : (60 + Math.floor(Math.random() * 20)),
      },
      execution_status: status,
      execution_timestamp: randomTimestamp(),
      is_deprecated: false,
      event_source: "omnis-run/seed-test",
      approved_by: approvedBy,
    };
  };

  const allRows: LogRow[] = [
    ...compliantIds.map((id) => buildLog(id, "SUCCESS", approverId)),
    ...pendingIds.map((id)   => buildLog(id, "SUCCESS", null)),
    ...failedIds.map((id)    => buildLog(id, "FAILED",  null)),
    // gapIds intentionally produce no rows
  ];

  // Insert in batches of 25 to stay within Supabase payload limits
  const BATCH_SIZE = 25;
  let inserted = 0;
  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    const { error: batchErr } = await supabase.from("evidence_logs").insert(batch);
    if (batchErr) {
      console.error(`\nERROR inserting batch ${i}–${i + BATCH_SIZE}:`, batchErr.message);
      process.exit(1);
    }
    inserted += batch.length;
    process.stdout.write(`\r      Inserted ${inserted}/${allRows.length} logs...`);
  }

  console.log(`\n      ✓ All ${inserted} logs inserted`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("SEED COMPLETE");
  console.log("=".repeat(60));
  console.log(`  Total rules in DB         : ${n}`);
  console.log(`  Logs inserted             : ${inserted}`);
  console.log(`    Compliant (SUCCESS+approved) : ${compliantIds.length}`);
  console.log(`    Pending   (SUCCESS+unsigned)  : ${pendingIds.length}`);
  console.log(`    Failed    (FAILED+unsigned)   : ${failedIds.length}`);
  console.log(`  Intentional gaps (no log) : ${gapIds.length}`);
  console.log(`    → ${gapIds.join(", ")}`);
  console.log(`\n  Scaffold org   : ${orgId}`);
  console.log(`  Scaffold build : ${buildId}`);
  console.log(`  Submitter UUID : ${userId}`);
  console.log(`  Approver UUID  : ${approverId}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Refresh /readiness — verify the traceability matrix`);
  console.log(`  2. GET /api/generate-report?format=tex — download LaTeX source`);
  console.log(`  3. Compile with pdflatex or Overleaf — verify longtable pagination`);
  console.log("=".repeat(60));
}

seed().catch((err: unknown) => {
  console.error("\nFATAL UNHANDLED ERROR:", err);
  process.exit(1);
});
