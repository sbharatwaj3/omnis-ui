# omnis-latex-service/main.py
#
# Single-endpoint FastAPI microservice: compiles a LaTeX string to a PDF.
#
# POST /api/compile
#   Body (JSON):  { "tex_source": "<raw LaTeX string>" }
#   Response:     application/pdf  (binary stream)
#
# The service runs pdflatex inside a per-request temporary directory, then
# streams the resulting .pdf bytes back to the caller and cleans up.
# All errors fail loudly — no silent failures (IEC 62304 Clause 6.2.5).
#
# CONSTITUTION ALIGNMENT:
#   - No secrets handled here.  This service is a dumb compiler; auth is
#     enforced upstream by the Vercel route that calls it.
#   - LATEX_COMPILER_ALLOWED_ORIGIN env var may be set to restrict CORS
#     to the Vercel deployment URL.  Defaults to "*" for local dev only.

import os
import subprocess
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# App configuration
# ---------------------------------------------------------------------------

ALLOWED_ORIGIN: str = os.getenv("LATEX_COMPILER_ALLOWED_ORIGIN", "*")

app = FastAPI(
    title="Omnis LaTeX Compiler",
    description="Compiles LaTeX source to PDF for the Omnis RegOps submission engine.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN],
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------


class CompileRequest(BaseModel):
    tex_source: str = Field(
        ...,
        description="Complete, self-contained LaTeX document source (.tex).",
        min_length=20,
    )


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health")
def health() -> dict:
    """Render health probe — returns 200 OK when the service is ready."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Compile endpoint
# ---------------------------------------------------------------------------


@app.post("/api/compile", response_class=Response)
async def compile_latex(payload: CompileRequest) -> Response:
    """
    Accepts a raw LaTeX string, compiles it with pdflatex (two passes for
    correct cross-references and longtable page-counts), and returns the
    resulting PDF as application/pdf.

    pdflatex is invoked with -interaction=nonstopmode so it does not hang
    waiting for user input on errors.  Two passes are required because
    \\pageref{LastPage} and longtable continuation headers are only resolved
    on the second typesetting pass.

    Raises HTTP 422 if the source is empty.
    Raises HTTP 500 with the pdflatex log tail if compilation fails.
    All temporary files are deleted on exit regardless of outcome.
    """
    job_id = str(uuid.uuid4())
    tex_filename = "document.tex"
    pdf_filename = "document.pdf"
    log_filename = "document.log"

    with tempfile.TemporaryDirectory(prefix=f"omnis_latex_{job_id}_") as tmpdir:
        tex_path = Path(tmpdir) / tex_filename
        pdf_path = Path(tmpdir) / pdf_filename
        log_path = Path(tmpdir) / log_filename

        # Write .tex source to disk
        tex_path.write_text(payload.tex_source, encoding="utf-8")

        # Base pdflatex command — two passes for \pageref{LastPage} correctness
        pdflatex_cmd = [
            "pdflatex",
            "-interaction=nonstopmode",
            "-halt-on-error",       # exit non-zero on first fatal error
            "-output-directory", tmpdir,
            str(tex_path),
        ]

        for pass_number in (1, 2):
            result = subprocess.run(
                pdflatex_cmd,
                cwd=tmpdir,
                capture_output=True,
                timeout=120,         # 120 s hard cap per pass (Render free tier)
            )
            if result.returncode != 0:
                # Surface the last 60 lines of the pdflatex log to the caller
                log_tail = ""
                if log_path.exists():
                    log_lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
                    log_tail = "\n".join(log_lines[-60:])
                else:
                    log_tail = result.stderr.decode("utf-8", errors="replace")[-2000:]

                raise HTTPException(
                    status_code=500,
                    detail={
                        "error": f"pdflatex failed on pass {pass_number} (exit {result.returncode}).",
                        "log_tail": log_tail,
                        "job_id": job_id,
                    },
                )

        if not pdf_path.exists():
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "pdflatex exited 0 but produced no PDF output.",
                    "job_id": job_id,
                },
            )

        pdf_bytes = pdf_path.read_bytes()

    # tmpdir is cleaned up automatically on context exit (including on error)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="fda_submission.pdf"',
            "X-Omnis-Job-Id": job_id,
        },
    )
