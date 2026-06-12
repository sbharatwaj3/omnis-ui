# omnis-latex-service/Dockerfile
#
# Multi-stage build — keeps the final image lean by separating the TeX Live
# installation (which is large but immutable) from the Python app layer.
#
# Render Free Web Service deploys from this Dockerfile automatically when
# connected to the repo.  The service listens on $PORT (default 8000).
#
# PACKAGE BREAKDOWN — why each package is required:
#
#   texlive-latex-base        pdflatex binary, article/report/book classes,
#                             core packages (inputenc, fontenc, array, etc.)
#
#   texlive-latex-recommended eso-pic, lastpage, fancyhdr, booktabs,
#                             pdflscape, rotating, caption, xcolor, hyperref,
#                             geometry — every package in our preamble that is
#                             NOT in base or extra lives here.
#
#   texlive-latex-extra       ragged2e, microtype, longtable, and thousands
#                             of other add-on packages.
#
#   texlive-fonts-recommended Computer Modern + base Latin Modern font files.
#
#   lmodern                   Latin Modern Type 1 (scalable outline) fonts.
#                             REQUIRED — this is a SEPARATE apt package from
#                             texlive-fonts-recommended.  Without it, pdfTeX
#                             cannot find lmodern.sty (\usepackage{lmodern})
#                             and falls back to bitmap (PK / Type 3) fonts,
#                             causing the fatal crash:
#                               ! pdfTeX error (font expansion): auto expansion
#                                 is only possible with scalable fonts.
#
# Do NOT use texlive-full — it is ~5 GB and would bust Render's build cache.

# ── Stage 1: base OS + TeX Live ───────────────────────────────────────────
FROM python:3.12-slim AS texbase

# Avoid interactive prompts during apt installs
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        texlive-latex-base \
        texlive-latex-recommended \
        texlive-latex-extra \
        texlive-fonts-recommended \
        lmodern \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── Stage 2: Python app on top of the TeX base ───────────────────────────
FROM texbase AS app

WORKDIR /app

# Install Python dependencies first (layer-cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY main.py .

# Render injects $PORT at runtime; uvicorn reads it via the shell expansion below.
# Using sh -c allows the $PORT variable to be evaluated at container start time.
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
