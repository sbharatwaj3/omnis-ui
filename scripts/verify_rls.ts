/**
 * omnis-ui/scripts/verify_rls.ts
 *
 * Run this AFTER applying the RLS SQL in the Supabase dashboard.
 * Signs in as omnis@dev.com with a temp password, runs both the
 * direct evidence_logs query and the readiness embed, and reports
 * whether isolation is working.
 *
 * Exit code 0 = all clear. Exit code 1 = still leaking.
 *
 *   npx ts-node --transpile-only scripts/verify_rls.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf-8").replace(/\r\n/g, "\n");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin    = createClient(SUPA_URL, SVC_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  console.log("=".repeat(70));
  console.log("RLS VERIFICATION");
  console.log("=".repeat(70));

  const TARGET = "omnis@dev.com";
  const TEMP   = "TempVerify_" + Date.now().toString(36) + "Aa1!";

  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 200 });
  const testUser = (authData?.users ?? []).find((u) => u.email === TARGET);
  if (!testUser) { console.error(`${TARGET} not found`); process.exit(1); }

  await admin.auth.admin.updateUserById(testUser.id, { email_confirm: true, password: TEMP });

  const anonClient = createClient(SUPA_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({ email: TARGET, password: TEMP });
  if (signInErr || !signIn?.session) { console.error("sign-in:", signInErr?.message); process.exit(1); }

  const authed = createClient(SUPA_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
  });

  let passed = 0;
  let failed = 0;

  // Test 1: direct evidence_logs
  const { count: logCount, error: logErr } = await authed
    .from("evidence_logs")
    .select("*", { count: "exact", head: true });
  const test1 = !logErr && logCount === 0;
  console.log(`\n[1] Direct evidence_logs for ${TARGET}: ${logErr ? "error: " + logErr.message : logCount + " rows"}`);
  console.log(`    ${test1 ? "✅ PASS — 0 rows (isolated)" : "❌ FAIL — user can see " + logCount + " rows"}`);
  test1 ? passed++ : failed++;

  // Test 2: readiness embed
  const { data: embedData, error: embedErr } = await authed
    .from("regulatory_rules")
    .select("req_id, evidence_logs(log_id, approved_by)")
    .neq("rule_source", "SEED-TEST-DEPRECATED");

  let withApproved = 0;
  if (!embedErr) {
    for (const r of (embedData ?? []) as any[]) {
      if (((r.evidence_logs ?? []) as any[]).some((l: any) => l.approved_by)) withApproved++;
    }
  }
  const test2 = !embedErr && withApproved === 0;
  console.log(`\n[2] Readiness embed approved count for ${TARGET}: ${embedErr ? "error: " + embedErr.message : withApproved}`);
  console.log(`    ${test2 ? "✅ PASS — 0 approved (isolated)" : "❌ FAIL — user sees " + withApproved + " approved rules"}`);
  test2 ? passed++ : failed++;

  // Revoke temp password
  await admin.auth.admin.updateUserById(testUser.id, {
    password: "revoked_" + Math.random().toString(36).slice(2),
  });

  // Test 3: admin still sees all their data
  const { count: adminCount } = await admin
    .from("evidence_logs")
    .select("*", { count: "exact", head: true });
  const test3 = adminCount === 145;
  console.log(`\n[3] Service-role total evidence_logs: ${adminCount}`);
  console.log(`    ${test3 ? "✅ PASS — 145 rows intact" : "⚠️  UNEXPECTED — expected 145, got " + adminCount}`);
  test3 ? passed++ : failed++;

  console.log("\n" + "=".repeat(70));
  console.log(`Result: ${passed}/3 passed, ${failed} failed`);
  if (failed === 0) {
    console.log("✅ RLS is working correctly on the live database.");
  } else {
    console.log("❌ RLS is NOT active. The SQL has not been applied.");
    console.log("   Go to: https://supabase.com/dashboard/project/cumjuquyooqpfymwmjrq/sql/new");
    console.log("   Paste and run: supabase/migrations/20260610000005_enforce_rls_on_live_db.sql");
  }
  console.log("=".repeat(70));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
