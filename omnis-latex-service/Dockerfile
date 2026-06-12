# omnis-latex-service/Dockerfile
#
# Multi-stage build — keeps the final image lean by separating the TeX Live
# installation (which is large but immutable) from the Python app layer.
#
# Render Free Web Service deploys from this Dockerfile automatically when
# connected to the repo.  The service listens on $PORT (default 8000).
#
# TeX Live packages installed:
#   texlive-latex-base      — pdflatex, core classes, basic packages
#   texlive-latex-extra     — longtable, booktabs, array, ragged2e, pdflscape,
#                             everypage, rotating, eso-pic, microtype, lastpage,
#                             fancyhdr, geometry, hyperref, xcolor, inputenc,
#                             fontenc — everything the fdaLatexTemplate uses.
#   texlive-fonts-recommended — default Computer Modern + Latin Modern fonts
#
# This covers 100 % of the \usepackage{...} calls in latexTemplate.ts.
# Do NOT add texlive-full — it is ~5 GB and would bust Render's build cache.

# ── Stage 1: base OS + TeX Live ───────────────────────────────────────────
FROM python:3.12-slim AS texbase

# Avoid interactive prompts during apt installs
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        texlive-latex-base \
        texlive-latex-extra \
        texlive-fonts-recommended \
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
