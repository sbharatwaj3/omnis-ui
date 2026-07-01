// omnis-ui/app/api/generate-report/route.ts
// GET /api/generate-report?format=tex|pdf
//
// FDA Export Engine — Next.js Route Handler.
//
// ?format=tex  → Builds and returns the fully-populated LaTeX source (.tex).
// ?format=pdf  → Builds the same LaTeX string, POSTs it to the remote
//                compiler at LATEX_COMPILER_URL, and streams the PDF back.
//
// CONSTITUTION ALIGNMENT:
//   - Uses @supabase/ssr server client — session-aware, RLS-respecting.
//   - Strictly follows the DDL schema. No hallucinated column names.
//   - Compiler URL loaded from process.env.LATEX_COMPILER_URL — never hardcoded.
//   - No auth bypass. Unauthenticated requests are gated by middleware / RLS.
//
// VERCEL TIMEOUT:
//   maxDuration = 60 tells Vercel to allow up to 60 seconds for this function.
//   Required because pdflatex on Render free tier (cold start + two-pass compile)
//   can take 30–50 seconds. Without this the default 10 s limit kills the request.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { fdaLatexTemplate } from "@/utils/latexTemplate";

// Raise the Vercel serverless function timeout to 60 s (max on Hobby plan).
// The Pro plan allows up to 300 s if you need more headroom later.
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// DDL-aligned types (strictly match Constitution schema)
// ---------------------------------------------------------------------------

interface EvidenceLog {
  log_id: string;
  execution_timestamp: string;
  // approved_by is a plain UUID TEXT field — NOT a FK to users.
  // Email resolution is done via a separate users query (step 1b).
  approved_by: string | null;
  user_id: string; // FK → users.user_id (the submitter)
}

interface RegulatoryRuleWithLogs {
  req_id: string;
  rule_source: string;
  description: string | null;
  evidence_logs: EvidenceLog[];
}

interface UserRow {
  user_id: string;
  developer_email: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape characters that carry special meaning in LaTeX. */
function escapeLaTeX(str: string): string {
  return str
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

/** Format a JS Date as "Month DD, YYYY" (UTC). */
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    timeZone: "UTC",
  });
}

/** Shorten a UUID to its last 8 characters for display in tables. */
function shortId(uuid: string): string {
  return `...${uuid.slice(-8)}`;
}

/**
 * Wrap a string in \breakuuid{} so the LaTeX macro inserts \hspace{0pt}
 * after every hyphen, giving the typesetter legal line-break points inside
 * long identifiers that contain no spaces.  Used for full UUIDs in the
 * Signature table and for shortened IDs in the narrow Traceability Matrix
 * columns where even 8-char strings like "...a1b2c3d4" could overflow.
 */
function latexBreakable(s: string): string {
  return `\\breakuuid{${s}}`;
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── 0. Parse and validate the format query param ─────────────────────────
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") ?? "tex").toLowerCase();

  if (format !== "tex" && format !== "pdf") {
    return NextResponse.json(
      { error: `Unknown format "${format}". Valid values: tex, pdf.` },
      { status: 400 }
    );
  }

  // ── 0b. Verify authenticated session ─────────────────────────────────────
  // Security Standard §II.1: every API route is a public endpoint.
  // The middleware matcher does NOT cover /api/* paths, so this is the
  // authoritative auth gate for this route. Middleware / RLS alone is
  // insufficient — we must verify explicitly before any data query.
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized: valid session required." },
      { status: 401 }
    );
  }

  // ── 1a. Fetch regulatory_rules with nested evidence_logs ─────────────────
  //
  // approved_by has no FK constraint so PostgREST cannot auto-join it.
  // We resolve user emails via a separate query in step 1b.

  const { data: rulesData, error: rulesError } = await supabase
    .from("regulatory_rules")
    .select(
      `req_id,
       rule_source,
       description,
       evidence_logs (
         log_id,
         execution_timestamp,
         approved_by,
         user_id
       )`
    )
    .neq("rule_source", "SEED-TEST-DEPRECATED")
    .order("req_id", { ascending: true });

  if (rulesError) {
    console.error("[generate-report] Supabase rules query error:", rulesError);
    return NextResponse.json(
      { error: "Failed to fetch compliance data from database." },
      { status: 500 }
    );
  }

  const rules = (rulesData ?? []) as unknown as RegulatoryRuleWithLogs[];

  // ── 1b. Fetch users table → UUID → email lookup map ──────────────────────
  //
  // Used in signature rows: show approver email instead of raw UUID.
  // Non-fatal if unavailable — falls back to shortened UUID.
  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("user_id, developer_email");

  if (usersError) {
    console.warn("[generate-report] Could not fetch users table:", usersError);
  }

  const userEmailMap = new Map<string, string>();
  for (const u of (usersData ?? []) as UserRow[]) {
    userEmailMap.set(u.user_id, u.developer_email);
  }

  // ── 2. Build TRACEABILITY_TABLE_ROWS (7 columns) ─────────────────────────
  //
  // Columns: Clause | Regulatory Requirement | Software Item/Function |
  //          Lifecycle Artifact/Evidence Log | Test Case ID(s) | Result | Comments
  //
  // Approved log  → PASS with log IDs in artifact + test case columns
  // No log at all → [ NO EVIDENCE LINKED ] with MISSING status
  const traceabilityRows: string[] = rules.map((rule) => {
    const clause = escapeLaTeX(rule.req_id);
    const req    = escapeLaTeX(rule.description ?? rule.rule_source);

    const approvedLog = rule.evidence_logs.find((l) => l.approved_by !== null);

    if (approvedLog) {
      // Wrap shortened IDs in \breakuuid{} so the 3.5 cm "Lifecycle Artifact"
      // and "Test Case ID" columns can break the "...xxxxxxxx" string at the
      // hyphen if the font metrics push it past the cell boundary.
      const logId  = latexBreakable(escapeLaTeX(shortId(approvedLog.log_id)));
      const testId = latexBreakable(escapeLaTeX(shortId(approvedLog.log_id)));
      // Software item derived from rule_source framework
      const swItem = escapeLaTeX(rule.rule_source);
      return `  ${clause} & ${req} & ${swItem} & \\texttt{${logId}} & \\texttt{${testId}} & \\textbf{\\textcolor{green!60!black}{PASS}} & --- \\\\ \\midrule`;
    }

    return `  ${clause} & ${req} & --- & {\\color{gray}\\textit{[ NO EVIDENCE LINKED ]}} & N/A & \\textbf{\\textcolor{gray}{MISSING}} & No evidence log linked \\\\ \\midrule`;
  });

  // ── 3. Build SIGNATURE_TABLE_ROWS (5 columns for longtable) ─────────────
  //
  // Columns: Signer Name | Role/Title | Date/Time (UTC) | Meaning | Electronic Sig
  const seenApprovers = new Set<string>();
  const signatureRows: string[] = [];

  for (const rule of rules) {
    for (const log of rule.evidence_logs) {
      if (!log.approved_by) continue;
      if (seenApprovers.has(log.approved_by)) continue;
      seenApprovers.add(log.approved_by);

      const approverEmail = userEmailMap.get(log.approved_by);
      const approverLabel = approverEmail
        ? escapeLaTeX(approverEmail)
        : escapeLaTeX(shortId(log.approved_by));

      // escapeLaTeX only escapes &, %, etc. — UUID hyphens are safe to pass through.
      const uuid = escapeLaTeX(log.approved_by);
      const ts = escapeLaTeX(
        new Date(log.execution_timestamp)
          .toISOString()
          .replace("T", " ")
          .slice(0, 19)
      );

      // Wrap the UUID in \breakuuid{} so the LaTeX macro can insert
      // \hspace{0pt} after each hyphen, giving the 36-char UUID legal
      // wrap points inside the 5.5 cm column without visible changes.
      // 5 columns: Name | Role | Date/Time | Meaning | Electronic Signature
      signatureRows.push(
        `  ${approverLabel} & Authorized Approver & ${ts} UTC & Approval of document & \\breakuuid{${uuid}} \\\\`
      );
    }
  }

  if (signatureRows.length === 0) {
    signatureRows.push(
      `  \\textit{No approvals recorded} & --- & --- & --- & --- \\\\`
    );
  }

  // ── 4. Build SOUP_TABLE_ROWS (6 columns) ──────────────────────────────────
  //
  // The SOUP inventory is static for this submission — it reflects the key
  // third-party dependencies of the Omnis RegOps Platform. A production system
  // would derive this from an SBOM file (SPDX/CycloneDX).
  const soupRows = [
    `  Next.js & 16.x & Vercel / Open Source & React-based SaMD web UI framework & Class A & Low risk; actively maintained; no safety-critical logic implemented in framework layer \\\\`,
    `  Supabase (supabase-js) & 2.x & Supabase Inc. & Evidence log storage, RLS-enforced PostgreSQL backend & Class B & Data integrity enforced via RLS and HMAC; covered by 21 CFR Part 11 audit trail controls \\\\`,
    `  @supabase/ssr & 0.x & Supabase Inc. & Server-side session management for Next.js & Class A & Session handling only; no clinical logic \\\\`,
    `  React & 19.x & Meta / Open Source & UI rendering layer & Class A & Presentation layer only; no safety-critical computation \\\\`,
    `  pdflatex (TeX Live) & 2024 & TUG / Open Source & PDF compilation of regulatory submission & Class A & Document generation only; output verified by human reviewer prior to submission \\\\`,
    `  Python 3.11 / pytest & 7.x & PSF / Open Source & Test execution and evidence capture & Class B & Core evidence collection engine; HMAC-signed payloads mitigate tampering risk \\\\`,
    `  AWS Bedrock (Titan Embed) & v1 & Amazon Web Services & Vector embedding for AI semantic search & Class A & AI outputs are advisory only; no automated clinical decisions made without human review \\\\`,
    `  Go 1.22 (omnis-run) & 1.22 & Google / Open Source & Secure CLI transport layer for test evidence & Class B & HMAC-SHA256 signed; JWT-authenticated; raw byte capture with no sanitization \\\\`,
  ].join("\n  \\midrule\n");


  // ── 5. Compute document metadata ─────────────────────────────────────────
  const now = new Date();
  const companyName = "Omnis MedTech Corp";
  const productName = "Omnis RegOps Platform";
  const documentId = `OMNIS-RTM-${now.getUTCFullYear()}-001`;
  const dateGenerated = formatDate(now);

  const totalRules = rules.length;
  const compliantRules = rules.filter((r) =>
    r.evidence_logs.some((l) => l.approved_by !== null)
  ).length;
  const missingRules = rules.filter(
    (r) => r.evidence_logs.length === 0
  ).length;

  const aiRiskSummary =
    `\\textbf{Automated Scan Complete.} ` +
    `Total regulatory requirements evaluated: \\textbf{${totalRules}}. ` +
    `Compliant (signed evidence present): \\textbf{\\textcolor{passgreen}{${compliantRules}}}. ` +
    `Missing evidence: \\textbf{\\textcolor{failred}{${missingRules}}}. ` +
    `Pending approval: \\textbf{\\textcolor{warningyellow}{${totalRules - compliantRules - missingRules}}}. ` +
    `Overall submission readiness: \\textbf{${
      totalRules > 0
        ? ((compliantRules / totalRules) * 100).toFixed(1)
        : "0.0"
    }\\%}.`;

  // ── 6. Inject all placeholders into the shared template ──────────────────
  //
  // This string is used by BOTH the .tex and .pdf paths. All gap detection,
  // signature rows, and compliance metadata are already embedded here.
  const finalLatexString = fdaLatexTemplate
    .replace(/{{COMPANY_NAME}}/g, escapeLaTeX(companyName))
    .replace(/{{PRODUCT_NAME}}/g, escapeLaTeX(productName))
    .replace(/{{DOCUMENT_ID}}/g, escapeLaTeX(documentId))
    .replace(/{{DATE_GENERATED}}/g, escapeLaTeX(dateGenerated))
    .replace("{{TRACEABILITY_TABLE_ROWS}}", traceabilityRows.join("\n"))
    .replace("{{SIGNATURE_TABLE_ROWS}}", signatureRows.join("\n"))
    .replace("{{SOUP_TABLE_ROWS}}", soupRows)
    .replace("{{AI_RISK_SUMMARY_TEXT}}", aiRiskSummary);

  // ── 6a. TEX export — return LaTeX source directly ────────────────────────
  if (format === "tex") {
    return new NextResponse(finalLatexString, {
      status: 200,
      headers: {
        "Content-Type": "application/x-tex; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="fda_submission_draft.tex"',
        "Cache-Control": "no-store",
      },
    });
  }

  // ── 6b. PDF export — POST LaTeX to the Omnis LaTeX microservice ──────────
  //
  // Compiler: omnis-latex-service (FastAPI + pdflatex on Render)
  //
  // API CONTRACT (our own service — omnis-latex-service/main.py):
  //   POST /api/compile
  //   Content-Type: application/json
  //   Body: { "tex_source": "<raw LaTeX string>" }
  //   Response: application/pdf  (binary stream, two-pass pdflatex)
  //
  // LATEX_COMPILER_URL must point to the Render service root, e.g.:
  //   https://omnis-latex-service.onrender.com
  // The /api/compile path is appended here.
  //
  // CONSTITUTION LAW: service URLs are NEVER hardcoded.
  const compilerBaseUrl = process.env.LATEX_COMPILER_URL;

  if (!compilerBaseUrl) {
    console.error(
      "[generate-report] LATEX_COMPILER_URL is not set in the environment."
    );
    return NextResponse.json(
      {
        error:
          "PDF compilation is not configured. " +
          "Set LATEX_COMPILER_URL to the Omnis LaTeX microservice URL " +
          "(e.g. https://omnis-latex-service.onrender.com).",
      },
      { status: 500 }
    );
  }

  // Strip any trailing slash so the path concatenation is always clean.
  const compileEndpoint = `${compilerBaseUrl.replace(/\/$/, "")}/api/compile`;

  // Our service expects a simple JSON body with a single `tex_source` field.
  const compilerPayload = { tex_source: finalLatexString };

  let compileRes: Response;
  try {
    compileRes = await fetch(compileEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(compilerPayload),
    });
  } catch (networkErr) {
    console.error(
      "[generate-report] Network error reaching LaTeX compiler:",
      networkErr
    );
    return NextResponse.json(
      {
        error:
          "Could not reach the LaTeX compiler service. " +
          "Check LATEX_COMPILER_URL and ensure the Render service is running.",
      },
      { status: 502 }
    );
  }

  if (!compileRes.ok) {
    // The Render service (FastAPI) wraps HTTPException details under a top-level
    // "detail" key, so its body is: { detail: { error, log_tail, job_id } }
    //
    // We unwrap one level so Vercel returns the flat shape the frontend expects:
    //   { error: "...", detail: { error: "...", log_tail: "...", job_id: "..." } }
    //
    // Previously this code did `detail: errorDetail` where errorDetail was the
    // entire parsed body { detail: { ... } }, producing double-nesting:
    //   { error: "...", detail: { detail: { error: "...", log_tail: "..." } } }
    // which the frontend could not destructure correctly.
    let innerDetail: unknown = "(no body)";
    try {
      const body = await compileRes.json() as { detail?: unknown };
      // Unwrap FastAPI's outer "detail" envelope if present
      innerDetail = body?.detail ?? body;
    } catch {
      innerDetail = await compileRes.text().catch(() => "(no body)");
    }
    console.error(
      "[generate-report] LaTeX compiler returned an error:",
      compileRes.status,
      compileRes.statusText,
      "\nService response body:\n",
      JSON.stringify(innerDetail, null, 2)
    );
    return NextResponse.json(
      {
        error: `LaTeX compiler failed: ${compileRes.statusText} (HTTP ${compileRes.status}).`,
        detail: innerDetail,
      },
      { status: 500 }
    );
  }

  const pdfBuffer = await compileRes.arrayBuffer();

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="fda_submission.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
