/**
 * omnis-ui/scripts/fix_ownership.ts
 *
 * Three-step data repair:
 *   1. Insert every auth.users account that is missing from public.users
 *      (satisfies the evidence_logs FK constraint).
 *   2. Reassign all evidence_logs whose user_id is not a real auth.users id
 *      to admin@omnis.com.
 *   3. Verify and print final ownership counts.
 *
 * Uses service-role client (bypasses RLS). Read the output before anything
 * else — no changes are silent.
 *
 *   npx ts-node --transpile-only scripts/fix_ownership.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("FATAL: Missing env vars. Run from omnis-ui directory.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SENTINEL_ORG_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  console.log("=".repeat(70));
  console.log("OMNIS: evidence_logs ownership repair");
  console.log("=".repeat(70));

  // ── Step 1: List all auth.users ──────────────────────────────────────────
  const { data: authData, error: authErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (authErr) { console.error("auth listUsers:", authErr.message); process.exit(1); }
  const authUsers = authData?.users ?? [];
  const authIds   = new Set(authUsers.map((u) => u.id));
  console.log(`\n[1/3] Found ${authUsers.length} auth.users accounts:`);
  for (const u of authUsers) console.log(`  ${u.id}  ${u.email}`);

  const adminUser = authUsers.find((u) => u.email === "admin@omnis.com");
  if (!adminUser) { console.error("admin@omnis.com not found in auth.users"); process.exit(1); }

  // ── Step 2: Insert missing auth users into public.users ──────────────────
  const { data: existingPu, error: puErr } = await admin
    .from("users")
    .select("user_id, developer_email");
  if (puErr) { console.error("read public.users:", puErr.message); process.exit(1); }

  const existingPuIds = new Set((existingPu ?? []).map((u) => (u as any).user_id as string));

  console.log(`\n[2/3] Syncing auth.users → public.users:`);
  let synced = 0;
  for (const u of authUsers) {
    if (existingPuIds.has(u.id)) {
      console.log(`  SKIP  ${u.email} — already in public.users`);
      continue;
    }
    const { error: insertErr } = await admin.from("users").insert({
      user_id:         u.id,
      org_id:          SENTINEL_ORG_ID,
      developer_email: u.email ?? u.id,
      public_key:      "PENDING_ONBOARDING",
    });
    if (insertErr) {
      console.error(`  ERROR inserting ${u.email}: ${insertErr.message}`);
      process.exit(1);
    }
    console.log(`  INSERT ${u.email} (${u.id})`);
    synced++;
  }
  console.log(`  ✓ ${synced} user(s) added to public.users`);

  // ── Step 3: Reassign orphaned logs to admin ──────────────────────────────
  console.log(`\n[3/3] Reassigning evidence_logs not owned by a real auth.users id:`);
  const { data: logs, error: logsErr } = await admin
    .from("evidence_logs")
    .select("log_id, user_id");
  if (logsErr) { console.error("read evidence_logs:", logsErr.message); process.exit(1); }

  const toFix = (logs ?? []).filter(
    (r) => !(r as any).user_id || !authIds.has((r as any).user_id as string),
  );
  console.log(`  Logs to reassign: ${toFix.length} (of ${(logs ?? []).length} total)`);

  if (toFix.length > 0) {
    const ids = toFix.map((r) => (r as any).log_id as string);
    let done = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { error: updErr } = await admin
        .from("evidence_logs")
        .update({ user_id: adminUser.id })
        .in("log_id", chunk);
      if (updErr) { console.error("  update error:", updErr.message); process.exit(1); }
      done += chunk.length;
      process.stdout.write(`\r  reassigned ${done}/${ids.length}...`);
    }
    console.log();
  }

  // ── Verification ─────────────────────────────────────────────────────────
  console.log("\n── Verification ──────────────────────────────────────────────");
  const { data: finalLogs } = await admin.from("evidence_logs").select("user_id");
  const byUser = new Map<string, number>();
  for (const r of finalLogs ?? []) {
    const uid = (r as any).user_id ?? "NULL";
    byUser.set(uid, (byUser.get(uid) ?? 0) + 1);
  }
  for (const [uid, n] of byUser) {
    const who = authUsers.find((u) => u.id === uid)?.email ?? "unknown";
    console.log(`  ${uid}  (${who}) : ${n} logs`);
  }
  console.log("\n✓ Done. Refresh /dashboard to verify.");
  console.log("=".repeat(70));
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
