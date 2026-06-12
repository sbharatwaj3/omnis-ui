// omnis-ui/utils/latexTemplate.ts
// FDA eSTAR Software Documentation Attachment — LaTeX template v2.4
//
// LANDSCAPE HEADER/FOOTER STRATEGY (Section 7):
//   We use pdflscape (\begin{landscape}) to rotate page content, then
//   use the everypage + rotating packages to physically place rotated
//   header/footer text at the correct edges of the landscape page.
//
//   How it works:
//     pdflscape rotates the entire page body 90°.  The PDF viewer shows
//     the page upright.  But fancyhdr's header/footer are part of the
//     portrait page box, so without intervention they appear sideways.
//
//     \AddEverypageHook (from everypage) fires on every page.  Inside
//     the hook we test \ifodd\value{landscapemode} (a counter we flip
//     to 1 before the landscape section and back to 0 after) and, when
//     true, we suppress fancyhdr and instead place four \rotatebox{90}
//     text blocks at the exact corners using \vspace + \hspace offsets
//     computed from the letter-page dimensions.
//
//   Letter page: 8.5 × 11 in.  In pdflscape the long axis is horizontal.
//   Printable area (1-inch margins): 9 × 6.5 in = 22.86 × 16.51 cm.
//
// COLUMN BUDGET (landscape, 22.86 cm printable width):
//   Text cols: 1.8 + 3.5 + 2.5 + 3.5 + 2.5 + 1.8 + 3.5 = 19.1 cm
//   Gaps:      6 × 2 × \tabcolsep (6 pt = 0.2117 cm)    =  2.54 cm
//   Total:     21.64 cm  ≤  22.86 cm  ✓  (1.22 cm safety margin)
//
// PORTRAIT COLUMN BUDGETS (\textwidth = 16.51 cm):
//   Signature:  5 cols 14.2 cm + 4 gaps 1.69 cm = 15.89 cm ✓
//   SOUP/OTS:   6 cols 14.0 cm + 5 gaps 2.11 cm = 16.11 cm ✓
//   Revision:   4 cols 15.0 cm + 3 gaps 1.27 cm = 16.27 cm ✓
//
// DYNAMIC PLACEHOLDERS (injected by app/api/generate-report/route.ts):
//   {{COMPANY_NAME}}            — e.g. "Omnis MedTech Corp"
//   {{PRODUCT_NAME}}            — e.g. "Omnis RegOps Platform"
//   {{DOCUMENT_ID}}             — e.g. "OMNIS-RTM-2026-001"
//   {{DATE_GENERATED}}          — e.g. "June 08, 2026"
//   {{TRACEABILITY_TABLE_ROWS}} — 7-column longtable rows for Section 7
//   {{SIGNATURE_TABLE_ROWS}}    — 5-column longtable rows for Section 2
//   {{SOUP_TABLE_ROWS}}         — 6-column longtable rows for Section 5
//   {{AI_RISK_SUMMARY_TEXT}}    — AI compliance scan summary paragraph

export const fdaLatexTemplate = String.raw`\documentclass[11pt]{article}

% ── Core layout ──────────────────────────────────────────────────────────────
\usepackage[top=1in, bottom=1in, left=1in, right=1in]{geometry}

% ── Tables ───────────────────────────────────────────────────────────────────
\usepackage{longtable}
\usepackage{booktabs}
\usepackage{array}
% ragged2e: \RaggedRight prevents inter-word stretch in narrow p{} columns.
\usepackage{ragged2e}

% ── Typography ───────────────────────────────────────────────────────────────
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{microtype}

% ── Colour & links ───────────────────────────────────────────────────────────
\usepackage{xcolor}
% Named colours used in the AI risk summary paragraph (route.ts aiRiskSummary).
% These MUST be defined before \begin{document} or \textcolor will halt pdflatex.
\definecolor{passgreen}{RGB}{22, 101, 52}
\definecolor{failred}{RGB}{185, 28, 28}
\definecolor{warningyellow}{RGB}{146, 64, 14}
\usepackage{hyperref}

% ── Header / footer ──────────────────────────────────────────────────────────
\usepackage{fancyhdr}
\usepackage{lastpage}

% ── Landscape support ────────────────────────────────────────────────────────
% pdflscape rotates the page body 90° and tells the PDF viewer to display
% it upright.  We use it for Section 7 only.
\usepackage{pdflscape}
% rotating provides \rotatebox used to orient the header/footer text
% correctly on landscape pages.
\usepackage{rotating}
% eso-pic provides \AddToShipoutPictureBG for absolute page positioning.
% We use it directly for the landscape header/footer overlay — this avoids
% any dependency on the everypage package whose \AddEverypageHook API was
% removed in TeX Live 2022+.  \AddToShipoutPictureBG fires on every page
% automatically and we gate on the landscapemode counter inside the hook.
\usepackage{eso-pic}

% ── Hyperref config ──────────────────────────────────────────────────────────
\hypersetup{
    colorlinks = true,
    linkcolor  = blue,
    urlcolor   = blue,
    pdfborder  = {0 0 0}
}

% ── R column type ────────────────────────────────────────────────────────────
\newcolumntype{R}[1]{>{\RaggedRight\arraybackslash}p{#1}}

% ── UUID line-break helper ────────────────────────────────────────────────────
\newcommand{\breakuuid}[1]{\def\temp{#1}\expandafter\breakuuidaux\temp\relax}
\def\breakuuidaux#1{\ifx#1\relax\else
  \ifx#1-{-\hspace{0pt}}\else#1\fi
  \expandafter\breakuuidaux\fi}

% ── Portrait page style ───────────────────────────────────────────────────────
\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\footnotesize \textbf{{{COMPANY_NAME}}} \textbar{} {{PRODUCT_NAME}}}
\fancyhead[R]{\footnotesize {{DOCUMENT_ID}} \textbar{} Confidential}
\fancyfoot[L]{\footnotesize Proprietary and Confidential}
\fancyfoot[R]{\footnotesize Page \thepage\ of \pageref{LastPage}}
\renewcommand{\headrulewidth}{0.4pt}
\renewcommand{\footrulewidth}{0.4pt}
\setlength{\headheight}{14pt}

% ── Landscape header/footer overlay ──────────────────────────────────────────
% When \landscapemode = 1 we suppress fancyhdr (empty style) and instead
% draw four text labels at the physical edges of the rotated page using
% eso-pic absolute coordinates.
%
% Physical letter page in pdflscape: 11 in wide × 8.5 in tall.
% Distances are measured from bottom-left of the physical (unrotated) page.
%
\newcounter{landscapemode}
\setcounter{landscapemode}{0}

% \AddToShipoutPictureBG fires on every page shipout (eso-pic, always present).
% We gate on \value{landscapemode} so it only draws when we are inside the
% landscape section.  This replaces the old \AddEverypageHook approach which
% used the everypage package — that package's hook API was removed in TeX Live
% 2022 and will cause a "undefined control sequence" fatal error on current
% TeX installations.
%
% COORDINATE SYSTEM (\AtPageLowerLeft origin = physical bottom-left):
%   Physical page (portrait storage): 612 pt wide × 792 pt tall.
%   1-inch margin = 72 pt each side.
%
%   pdflscape rotates the *content* 90° CCW for viewing, but eso-pic
%   coordinates remain in the physical (unrotated) frame:
%     Landscape TOP    = physical RIGHT edge  → x = 612−72 = 540 pt
%     Landscape BOTTOM = physical LEFT  edge  → x =       72 pt
%     Landscape LEFT   = physical BOTTOM edge → y =       72 pt
%     Landscape RIGHT  = physical TOP   edge  → y = 792−72 = 720 pt
%
\AddToShipoutPictureBG{%
  \ifnum\value{landscapemode}=1
    \thispagestyle{empty}%
    %
    % ── HEADER RULE ───────────────────────────────────────────────────────
    \AtPageLowerLeft{%
      \put(538, 72){%
        \rotatebox{90}{\rule{648pt}{0.4pt}}%
      }%
    }%
    %
    % ── HEADER TEXT LEFT: Company | Product ─────────────────────────────
    \AtPageLowerLeft{%
      \put(524, 72){%
        \rotatebox{90}{%
          \makebox[648pt][l]{%
            \footnotesize\textbf{{{COMPANY_NAME}}} \textbar{} {{PRODUCT_NAME}}%
          }%
        }%
      }%
    }%
    %
    % ── HEADER TEXT RIGHT: DocID | Confidential ─────────────────────────
    \AtPageLowerLeft{%
      \put(524, 72){%
        \rotatebox{90}{%
          \makebox[648pt][r]{%
            \footnotesize {{DOCUMENT_ID}} \textbar{} Confidential%
          }%
        }%
      }%
    }%
    %
    % ── FOOTER TEXT LEFT: Proprietary and Confidential ──────────────────
    \AtPageLowerLeft{%
      \put(72, 72){%
        \rotatebox{90}{%
          \makebox[648pt][l]{%
            \footnotesize Proprietary and Confidential%
          }%
        }%
      }%
    }%
    %
    % ── FOOTER TEXT RIGHT: Page N of M ──────────────────────────────────
    \AtPageLowerLeft{%
      \put(72, 72){%
        \rotatebox{90}{%
          \makebox[648pt][r]{%
            \footnotesize Page \thepage\ of \pageref{LastPage}%
          }%
        }%
      }%
    }%
  \fi
}%

\begin{document}

%==========================
% TITLE PAGE
%==========================
\begin{titlepage}
    \centering
    \vspace*{2.5cm}

    {\Large \textbf{{{COMPANY_NAME}}} \par}
    \vspace{1.2cm}

    {\huge \textbf{{{PRODUCT_NAME}}} \par}
    \vspace{0.6cm}

    {\Large \textbf{Software Documentation Attachment} \par}
    \vspace{0.5cm}

    {\large For FDA eSTAR Premarket Submission \par}
    \vspace{1.8cm}

    % Title page metadata table — 4cm + 9cm = 13cm, well within margins
    \begin{tabular}{>{\bfseries}p{4.5cm} p{9.0cm}}
        \toprule
        Document ID:        & {{DOCUMENT_ID}} \\[4pt]
        Document Title:     & {{PRODUCT_NAME}} Software Documentation Attachment \\[4pt]
        Document Type:      & Premarket Submission Software Attachment (SaMD) \\[4pt]
        Submission Format:  & eSTAR (Electronic Submission Template and Resource) \\[4pt]
        Company:            & {{COMPANY_NAME}} \\[4pt]
        Date Generated:     & {{DATE_GENERATED}} \\[4pt]
        Confidentiality:    & Proprietary and Confidential \\
        \bottomrule
    \end{tabular}

    \vfill

    \begin{minipage}{0.85\textwidth}
        \centering
        \small
        \textit{This document is submitted in support of the FDA eSTAR premarket
        review process for \textbf{{{PRODUCT_NAME}}} and provides comprehensive
        software documentation, cybersecurity information, and IEC 62304
        traceability in accordance with current FDA guidance.}
    \end{minipage}

    \vspace*{1.5cm}
\end{titlepage}

\setcounter{page}{1}

\tableofcontents
\newpage

%==========================
% 1. DOCUMENT METADATA
%==========================
\section{Document Metadata and Purpose}

\subsection{Purpose of this Document}
The purpose of this Software Documentation Attachment is to provide a consolidated,
traceable, and review-ready description of the software that implements the device
software functions for \textbf{{{PRODUCT_NAME}}}, including safety, effectiveness,
cybersecurity, and lifecycle controls in alignment with current FDA and IEC~62304
expectations for SaMD.

\subsection{Scope}
This document covers:
\begin{itemize}
    \item High-level software description and documentation level determination
          (Basic vs Enhanced Documentation).
    \item Cybersecurity and Software Bill of Materials (SBOM), including
          Section~524B cyber device considerations.
    \item Software of Unknown Provenance (SOUP) and Off-the-Shelf (OTS) software,
          with risk evaluation in accordance with IEC~62304.
    \item AI-related compliance risk summary derived from automated CI/CD anomaly
          detection.
    \item IEC~62304 traceability matrix linking regulatory clauses, requirements,
          implementation evidence, and testing.
    \item 21~CFR Part~11 electronic signature declaration and signature log.
    \item Document revision history.
\end{itemize}

\subsection{Intended Audience}
The intended audience includes FDA reviewers, internal quality and regulatory
personnel, and designated notified experts responsible for evaluating software
safety, cybersecurity posture, and regulatory compliance for
\textbf{{{PRODUCT_NAME}}}.

\newpage

%==========================
% 2. 21 CFR PART 11 ELECTRONIC SIGNATURE
%==========================
\section{21 CFR Part 11 Electronic Signature Declaration and Log}

\subsection{Electronic Signature Declaration}
This section documents the use of electronic signatures associated with this
software documentation in accordance with 21~CFR Part~11.

\begin{itemize}
    \item \textbf{{{COMPANY_NAME}}} has established and maintains policies,
          procedures, and technical controls to ensure that electronic signatures
          are unique to one individual and are not reused or reassigned.
    \item Individuals whose electronic signatures are applied to this document
          certify that their electronic signatures are the legally binding
          equivalent of their handwritten signatures, consistent with
          21~CFR~\S\,11.100.
    \item System access, identity verification, and audit trails are controlled
          by validated electronic systems subject to appropriate access controls,
          password policies, and periodic review.
\end{itemize}

By signing this document electronically within the validated quality management
or document control system, each signer certifies that:
\begin{enumerate}
    \item The signer has reviewed the content of this document.
    \item The signer approves the document for its stated purpose and effective use.
    \item The electronic signature is intended to have the same legal force as a
          handwritten signature.
\end{enumerate}

\subsection{Electronic Signature Log}

% Text cols: 2.0 + 2.2 + 2.5 + 2.5 + 5.0 = 14.2 cm
% Internal gaps: 4 × 2 × \tabcolsep (6pt) = 4 × 0.423 cm = 1.69 cm
% Total: 14.2 + 1.69 = 15.89 cm ≤ 16.51 cm \textwidth ✓
% @{} strips outer padding so left edge aligns with the fancyhdr rule.
\begin{longtable}{@{} R{2.0cm} R{2.2cm} R{2.5cm} R{2.5cm} R{5.0cm} @{}}
\caption{21~CFR Part~11 Electronic Signature Log
    \label{tab:signature-log}} \\
\toprule
\textbf{Signer Name} &
\textbf{Role / Title} &
\textbf{Date / Time (UTC)} &
\textbf{Meaning of Signature} &
\textbf{Electronic Signature (UUID)} \\
\midrule
\endfirsthead
\multicolumn{5}{c}{\small\textit{(Continued from previous page)}} \\[3pt]
\toprule
\textbf{Signer Name} &
\textbf{Role / Title} &
\textbf{Date / Time (UTC)} &
\textbf{Meaning of Signature} &
\textbf{Electronic Signature (UUID)} \\
\midrule
\endhead
\midrule
\multicolumn{5}{r}{\small\textit{Continued on next page\ldots}} \\
\endfoot
\bottomrule
\endlastfoot
{{SIGNATURE_TABLE_ROWS}}
\end{longtable}

\newpage

%==========================
% 3. SOFTWARE DESCRIPTION & DOCUMENTATION LEVEL
%==========================
\section{Software Description and Documentation Level}

\subsection{Device and Software Overview}

\subsubsection{Intended Use and Indications for Use}
Provide a concise summary of the intended use and indications for use of
\textbf{{{PRODUCT_NAME}}} as a software as a medical device (SaMD). This
description should match the indications for use statement provided within the
main eSTAR submission and associated labeling.

\subsubsection{Device Software Functions}
Describe the specific device software functions (DSFs) implemented by
\textbf{{{PRODUCT_NAME}}}, including:
\begin{itemize}
    \item Clinical or diagnostic decision support functions.
    \item Data acquisition, processing, analysis, and output functions.
    \item User interface and visualization elements relevant to clinical decision
          making.
    \item Interfaces to external systems (e.g., EHR, PACS, cloud services,
          other devices).
\end{itemize}

\subsubsection{Operating Environment and Dependencies}
Summarize the supported operating systems, hardware platforms, runtime
environments, and critical external dependencies. Where applicable, note
minimum and recommended system requirements and any constraints (e.g., offline
mode limitations, required network connectivity, or security controls enforced
by infrastructure).

\subsection{Software Architecture Summary}
Provide a high-level architecture narrative that may be accompanied by diagrams
in separate attachments or annexes referenced from this section.

Key elements include:
\begin{itemize}
    \item Overall system decomposition into software items and software units
          aligned with IEC~62304.
    \item Data flows between components, including trust boundaries and
          security-relevant interfaces.
    \item Identification of safety-critical and security-critical components or
          services.
    \item Integration points with SOUP/OTS components and external services.
\end{itemize}

\subsection{Documentation Level Determination}

\subsubsection{Regulatory Framework}
FDA's final guidance \textit{Content of Premarket Submissions for Device
Software Functions} introduces a risk-based framework that distinguishes between
\textbf{Basic Documentation} and \textbf{Enhanced Documentation}.

\begin{itemize}
    \item \textbf{Enhanced Documentation} is generally expected when a failure
          or latent flaw of the device software function could result in death
          or serious injury prior to risk control application.
    \item \textbf{Basic Documentation} is appropriate for device software
          functions that do not meet Enhanced Documentation criteria.
\end{itemize}

\subsubsection{Risk-Based Justification}
Provide a risk-based justification for the selected documentation level for
\textbf{{{PRODUCT_NAME}}}. Reference the ISO~14971 risk management file and
supporting hazard analyses as applicable.

\medskip
\noindent
\textbf{Selected Documentation Level:} \textit{[Basic / Enhanced]}

\subsubsection{Summary of Submitted Documentation}
The submitted documentation set aligns with the selected documentation level
and includes:
\begin{itemize}
    \item Software requirements specifications and architecture descriptions.
    \item Verification and validation plans and reports.
    \item Traceability matrices linking requirements, risk controls, and tests.
    \item Cybersecurity documentation (threat modeling, SBOM, vulnerability
          management).
\end{itemize}

\newpage

%==========================
% 4. CYBERSECURITY & SBOM (SECTION 524B)
%==========================
\section{Cybersecurity and SBOM (Section 524B)}

\subsection{Cyber Device Determination and Regulatory Context}
Indicate whether \textbf{{{PRODUCT_NAME}}} meets FDA's definition of a
\textit{cyber device} in accordance with Section~524B of the FD\&C Act and
associated FDA guidance.

\begin{itemize}
    \item If \textbf{{{PRODUCT_NAME}}} is a cyber device, state this explicitly
          and reference the specific criteria met.
    \item If \textbf{{{PRODUCT_NAME}}} is not considered a cyber device, provide
          justification while still addressing cybersecurity risk management for
          any networked or interoperable features.
\end{itemize}

\subsection{Threat Modeling Summary}
\begin{itemize}
    \item Threat modeling methodology (e.g., STRIDE, attack trees, attack
          surface analysis).
    \item Scope of analysis (e.g., cloud services, APIs, data storage, user
          interfaces, third-party components).
    \item Key identified threats and abuse cases (e.g., unauthorized access,
          data exfiltration, tampering, denial of service).
    \item Alignment with secure-by-design and secure-by-default principles as
          recommended by FDA for cyber devices.
\end{itemize}

\subsection{Security Controls and Risk Mitigations}
\begin{itemize}
    \item \textbf{Identity and Access Management:} Authentication, authorization,
          session management, and least privilege enforcement.
    \item \textbf{Data Protection:} Encryption in transit and at rest, key
          management, data minimization, and integrity controls.
    \item \textbf{System Hardening:} Secure configuration baselines, removal of
          unnecessary services, and adherence to secure coding practices.
    \item \textbf{Monitoring and Logging:} Security logging, audit trails,
          anomaly detection, and alerting mechanisms.
    \item \textbf{Resilience and Recovery:} Backup strategies, rollback
          mechanisms, and business continuity plans relevant to clinical safety.
\end{itemize}

\subsection{Vulnerability Management and Patch Plan}
\begin{itemize}
    \item Periodic vulnerability scanning, penetration testing, and code
          analysis activities.
    \item Intake and triage of externally reported vulnerabilities (e.g., via a
          coordinated vulnerability disclosure program).
    \item Security patching strategy, including timelines for remediation
          commensurate with severity and exploitability.
    \item Communication mechanisms to customers and users regarding
          cybersecurity risks and mitigations.
\end{itemize}

\subsection{Software Bill of Materials (SBOM) Declaration}
\begin{itemize}
    \item A detailed, machine-readable SBOM (SPDX or CycloneDX format) is
          maintained under configuration control and provided as a separate
          submission artifact.
    \item The SBOM includes all first-party, open-source, and commercial
          third-party components with version information sufficient to enable
          vulnerability identification and tracking.
    \item SBOM data is integrated into vulnerability management and risk
          assessment processes for \textbf{{{PRODUCT_NAME}}}.
\end{itemize}

\subsection{Secure Development Lifecycle (SDL) Summary}
\begin{itemize}
    \item Security training for developers and reviewers.
    \item Secure coding standards and linters integrated into CI/CD pipelines.
    \item Code review practices with security-specific review gates.
    \item Automated static and dynamic analysis for security-relevant defects.
\end{itemize}

\newpage

%==========================
% 5. SOUP / OTS SOFTWARE TABLE
%==========================
\section{Software of Unknown Provenance / Off-the-Shelf (SOUP/OTS) Software}

\subsection{Overview}
This section lists SOUP and OTS software components used in
\textbf{{{PRODUCT_NAME}}} and documents their intended use, safety
classification, and risk evaluation in accordance with IEC~62304.

\subsection{SOUP / OTS Inventory and Risk Evaluation}

% Text cols: 1.8 + 1.2 + 1.8 + 3.2 + 1.8 + 4.2 = 14.0 cm
% Internal gaps: 5 × 2 × \tabcolsep (6pt) = 5 × 0.423 cm = 2.11 cm
% Total: 14.0 + 2.11 = 16.11 cm ≤ 16.51 cm \textwidth ✓
% @{} strips outer padding so table flushes with text margin.
\small
\begin{longtable}{@{} R{1.8cm} R{1.2cm} R{1.8cm} R{3.2cm} R{1.8cm} R{4.2cm} @{}}
\caption{SOUP / OTS Software Components and IEC~62304 Risk Evaluation
    \label{tab:soup-ots}} \\
\toprule
\textbf{Component} &
\textbf{Version} &
\textbf{Supplier} &
\textbf{Intended Use} &
\textbf{Safety Class} &
\textbf{Risk Evaluation \& Mitigations} \\
\midrule
\endfirsthead
\multicolumn{6}{c}{\small\textit{(Continued from previous page)}} \\[3pt]
\toprule
\textbf{Component} &
\textbf{Version} &
\textbf{Supplier} &
\textbf{Intended Use} &
\textbf{Safety Class} &
\textbf{Risk Evaluation \& Mitigations} \\
\midrule
\endhead
\midrule
\multicolumn{6}{r}{\small\textit{Continued on next page\ldots}} \\
\endfoot
\bottomrule
\endlastfoot
{{SOUP_TABLE_ROWS}}
\end{longtable}
\normalsize

The detailed risk analysis for each SOUP/OTS component is maintained within the
risk management file and is traceable to IEC~62304 and ISO~14971 documentation.

\newpage

%==========================
% 6. AI COMPLIANCE RISK SUMMARY
%==========================
\section{AI Compliance Risk Summary}

\subsection{Overview}
\textbf{{{PRODUCT_NAME}}} uses automated CI/CD pipelines and AI-driven anomaly
detection to monitor code quality, test results, and operational telemetry for
indications of increased risk, including potential regression in safety or
cybersecurity-related metrics.

\subsection{Automated CI/CD Anomaly Detection Summary}
The following summary is derived from the most recent execution of the automated
CI/CD anomaly detection and AI-based risk scoring framework:

\medskip
\noindent
{{AI_RISK_SUMMARY_TEXT}}
\medskip

At a minimum, this summary addresses:
\begin{itemize}
    \item The types of anomalies or risk patterns monitored (e.g., unexpected
          test failure clusters, code churn in safety-critical modules, abnormal
          operational error rates).
    \item Any recent events that triggered elevated risk levels and the
          remediation actions taken.
    \item Evidence that the AI-based monitoring is integrated into the overall
          quality system and does not override human oversight for
          regulatory-significant decisions.
\end{itemize}

\newpage

%==========================
% 7. IEC 62304 TRACEABILITY MATRIX
%==========================
\section{IEC 62304 Traceability Matrix}

\subsection{Purpose and Scope}
This section provides a traceability matrix that maps regulatory clauses to
software lifecycle artifacts and test evidence for \textbf{{{PRODUCT_NAME}}}.
The matrix supports FDA review of software lifecycle processes, design controls,
and verification and validation.

\subsection{Traceability Matrix}

% ── Enter landscape mode ──────────────────────────────────────────────────────
% Setting landscapemode=1 activates the everypage hook defined in the
% preamble, which suppresses fancyhdr on these pages and draws correctly
% oriented header/footer overlays at the physical page edges instead.
%
% pdflscape rotates the body content 90° so the 7-column table reads
% normally when the PDF is viewed upright.
%
% COLUMN BUDGET (landscape printable width = 22.86 cm):
%   Cols: 1.8 + 3.5 + 2.5 + 3.5 + 2.5 + 1.8 + 3.5 = 19.1 cm
%   Gaps: 6 × 2 × 0.2117 cm (\tabcolsep)             =  2.54 cm
%   Total: 21.64 cm  ≤  22.86 cm  ✓
% @{} strips outer padding — table left edge aligns with header rule.
\setcounter{landscapemode}{1}
\begin{landscape}

\small
\begin{longtable}{@{} R{1.8cm} R{3.5cm} R{2.5cm} R{3.5cm} R{2.5cm} R{1.8cm} R{3.5cm} @{}}
\caption{IEC~62304 / SaMD Regulatory Traceability Matrix
    \label{tab:traceability-matrix}} \\
\toprule
\textbf{Clause} &
\textbf{Regulatory Requirement} &
\textbf{Software Item / Function} &
\textbf{Lifecycle Artifact / Evidence Log} &
\textbf{Test Case ID(s)} &
\textbf{Result} &
\textbf{Comments / Residual Risk} \\
\midrule
\endfirsthead
\multicolumn{7}{c}{\small\textit{(Continued from previous page)}} \\[3pt]
\toprule
\textbf{Clause} &
\textbf{Regulatory Requirement} &
\textbf{Software Item / Function} &
\textbf{Lifecycle Artifact / Evidence Log} &
\textbf{Test Case ID(s)} &
\textbf{Result} &
\textbf{Comments / Residual Risk} \\
\midrule
\endhead
\midrule
\multicolumn{7}{r}{\small\textit{Continued on next page\ldots}} \\
\endfoot
\bottomrule
\multicolumn{7}{l}{\small\textit{End of Traceability Matrix.}} \\
\endlastfoot
{{TRACEABILITY_TABLE_ROWS}}
\end{longtable}
\normalsize

\end{landscape}
% ── Exit landscape mode — portrait fancyhdr resumes ───────────────────────────
\setcounter{landscapemode}{0}

\vspace{0.3cm}
{\small\textit{Auto-generated on \textbf{{{DATE_GENERATED}}}. Doc
ID:~\texttt{{{DOCUMENT_ID}}}. Per IEC~62304 Clause~6.2.5, this RTM must be
re-approved after any change to safety-critical functionality.}}

\newpage

%==========================
% 8. REVISION HISTORY
%==========================
\section{Revision History}

% Text cols: 1.5 + 3.0 + 7.5 + 3.0 = 15.0 cm
% Internal gaps: 3 × 2 × \tabcolsep (6pt) = 3 × 0.423 cm = 1.27 cm
% Total: 15.0 + 1.27 = 16.27 cm ≤ 16.51 cm \textwidth ✓
% @{} strips outer padding.
\begin{longtable}{@{} R{1.5cm} R{3.0cm} R{7.5cm} R{3.0cm} @{}}
\caption{Revision History \label{tab:revision-history}} \\
\toprule
\textbf{Version} &
\textbf{Date} &
\textbf{Summary of Changes} &
\textbf{Author / Approver} \\
\midrule
\endfirsthead
\toprule
\textbf{Version} &
\textbf{Date} &
\textbf{Summary of Changes} &
\textbf{Author / Approver} \\
\midrule
\endhead
\bottomrule
\endlastfoot
1.0 & {{DATE_GENERATED}} &
    Initial automated generation for \textbf{{{PRODUCT_NAME}}}. &
    CI/CD Pipeline \\
\end{longtable}

\label{LastPage}

\end{document}`;
