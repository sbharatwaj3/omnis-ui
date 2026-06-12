// omnis-ui/utils/generate-pdf.ts
// Client-side PDF generation utility.
//
// Uses html2canvas to rasterize a DOM element and jsPDF to embed the
// resulting image into a standard US Letter (8.5 × 11 in) PDF.
//
// This replaces the previous server-side LaTeX → pdflatex pipeline for the
// PDF export path. The LaTeX / .tex export path in the API route is unchanged.
//
// Usage:
//   import { generateCompliancePdf } from "@/utils/generate-pdf";
//   await generateCompliancePdf("compliance-report-content");

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Capture the DOM element identified by `elementId`, render it to a canvas
 * via html2canvas, then embed the canvas image into a jsPDF document and
 * trigger a browser download.
 *
 * @param elementId  - The `id` attribute of the element to capture.
 * @param filename   - Output filename (defaults to "eSTAR_Compliance_Report.pdf").
 */
export async function generateCompliancePdf(
  elementId: string,
  filename = "eSTAR_Compliance_Report.pdf"
): Promise<void> {
  const element = document.getElementById(elementId);

  if (!element) {
    throw new Error(
      `[generate-pdf] Target element #${elementId} not found in the DOM. ` +
        "Ensure the compliance report content is mounted before calling this function."
    );
  }

  // ---------------------------------------------------------------------------
  // 1. Rasterize the DOM element at 2× scale for crisp rendering on HiDPI
  //    screens and to keep text legible at standard PDF zoom levels.
  // ---------------------------------------------------------------------------
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,          // allow cross-origin images (Supabase avatars, etc.)
    logging: false,
    backgroundColor: "#ffffff", // force white background — avoids dark-mode bleed
    // Scroll to the element top before capturing so off-screen content
    // is included in the snapshot.
    scrollX: 0,
    scrollY: -window.scrollY,
    windowWidth: document.documentElement.scrollWidth,
    windowHeight: document.documentElement.scrollHeight,
  });

  // ---------------------------------------------------------------------------
  // 2. Compute page geometry.
  //    US Letter: 215.9 mm × 279.4 mm  (8.5 × 11 in)
  //    Leave 10 mm margins on left/right.
  // ---------------------------------------------------------------------------
  const PAGE_WIDTH_MM  = 215.9;
  const PAGE_HEIGHT_MM = 279.4;
  const MARGIN_MM      = 10;
  const contentWidthMm = PAGE_WIDTH_MM - MARGIN_MM * 2;

  // Convert canvas pixel dimensions → mm at 96 dpi
  // 1 px = 0.2646 mm  (25.4 mm / 96 dpi)
  const PX_TO_MM = 25.4 / 96;

  const canvasWidthMm  = (canvas.width  / 2) * PX_TO_MM; // /2 because scale=2
  const canvasHeightMm = (canvas.height / 2) * PX_TO_MM;

  // Scale the image to fill the printable content width
  const scaleFactor     = contentWidthMm / canvasWidthMm;
  const scaledHeightMm  = canvasHeightMm * scaleFactor;

  // ---------------------------------------------------------------------------
  // 3. Build the PDF — split across multiple pages if the content is tall.
  // ---------------------------------------------------------------------------
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "letter",
  });

  const imgData = canvas.toDataURL("image/png");

  const printableHeightMm = PAGE_HEIGHT_MM - MARGIN_MM * 2;
  let yOffset = 0; // how many mm of the image we have already placed

  while (yOffset < scaledHeightMm) {
    if (yOffset > 0) pdf.addPage();

    // Source rect in canvas pixels for this page slice
    const sliceHeightMm  = Math.min(printableHeightMm, scaledHeightMm - yOffset);
    const srcY           = (yOffset / scaleFactor) / PX_TO_MM * 2; // back to canvas px (scale=2)
    const srcHeight      = (sliceHeightMm / scaleFactor) / PX_TO_MM * 2;

    // Create a temporary canvas for this page slice
    const sliceCanvas         = document.createElement("canvas");
    sliceCanvas.width         = canvas.width;
    sliceCanvas.height        = Math.round(srcHeight);
    const ctx                 = sliceCanvas.getContext("2d");
    if (!ctx) throw new Error("[generate-pdf] Could not get 2D context for slice canvas.");

    ctx.drawImage(
      canvas,
      0, Math.round(srcY),   // source x, y
      canvas.width, Math.round(srcHeight), // source w, h
      0, 0,                   // dest x, y
      sliceCanvas.width, sliceCanvas.height // dest w, h
    );

    pdf.addImage(
      sliceCanvas.toDataURL("image/png"),
      "PNG",
      MARGIN_MM,
      MARGIN_MM,
      contentWidthMm,
      sliceHeightMm
    );

    yOffset += printableHeightMm;
  }

  // ---------------------------------------------------------------------------
  // 4. Trigger browser download.
  // ---------------------------------------------------------------------------
  pdf.save(filename);
}
