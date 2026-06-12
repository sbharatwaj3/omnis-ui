// omnis-ui/utils/generate-pdf.ts
// Client-side PDF generation utility.
//
// Uses html-to-image (toPng) to rasterize a DOM element, then feeds the
// resulting PNG data URL into jsPDF for a standard US Letter (8.5 × 11 in)
// PDF with 10mm margins and automatic multi-page splitting.
//
// Why html-to-image instead of html2canvas:
//   html2canvas does not support modern CSS color functions (lab(), oklch(),
//   color(display-p3 …), etc.) and throws an "unsupported color function"
//   error on any page that uses Tailwind's dark-mode or Radix color tokens.
//   html-to-image uses the browser's native foreignObject SVG pipeline which
//   handles all current CSS color spaces without polyfilling.
//
// Usage:
//   import { generateCompliancePdf } from "@/utils/generate-pdf";
//   await generateCompliancePdf("compliance-report-content");

import jsPDF from "jspdf";
import { toPng } from "html-to-image";

/**
 * Capture the DOM element identified by `elementId`, render it to a PNG via
 * html-to-image, then embed the image into a jsPDF document and trigger a
 * browser download.
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
  // 1. Rasterize via html-to-image at 2× pixel ratio for crisp HiDPI output.
  //    backgroundColor forces white so dark-mode tokens don't bleed through.
  //    cacheBust prevents stale cross-origin image responses.
  // ---------------------------------------------------------------------------
  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    cacheBust: true,
    // Skip any element that deliberately opts out of capture
    // (e.g. the modal overlay itself, if it were in the DOM tree).
    filter: (node) => {
      if (node instanceof HTMLElement) {
        return !node.hasAttribute("data-pdf-exclude");
      }
      return true;
    },
  });

  // ---------------------------------------------------------------------------
  // 2. Decode dimensions from the PNG so we can compute correct page geometry
  //    without needing a separate canvas element.
  // ---------------------------------------------------------------------------
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });

  // Natural dimensions at 1× (html-to-image bakes pixelRatio into the file
  // but keeps the CSS pixel width/height as the reported naturalWidth/Height
  // when the image is loaded back into the DOM at 1× device pixel ratio).
  // Actual pixel dimensions are naturalWidth * pixelRatio inside the PNG,
  // but for jsPDF's mm math we use the CSS-pixel size (÷ pixelRatio).
  const cssWidthPx  = img.naturalWidth  / 2; // /2 because pixelRatio=2
  const cssHeightPx = img.naturalHeight / 2;

  // ---------------------------------------------------------------------------
  // 3. Compute page geometry.
  //    US Letter: 215.9 mm × 279.4 mm  (8.5 × 11 in)
  //    10 mm margins left/right; 10 mm margins top/bottom.
  // ---------------------------------------------------------------------------
  const PAGE_WIDTH_MM  = 215.9;
  const PAGE_HEIGHT_MM = 279.4;
  const MARGIN_MM      = 10;
  const contentWidthMm  = PAGE_WIDTH_MM  - MARGIN_MM * 2;
  const printableHeightMm = PAGE_HEIGHT_MM - MARGIN_MM * 2;

  // 1 CSS px ≈ 0.2646 mm at 96 dpi
  const PX_TO_MM = 25.4 / 96;

  const imgWidthMm  = cssWidthPx  * PX_TO_MM;
  const imgHeightMm = cssHeightPx * PX_TO_MM;

  // Scale the image uniformly to fill the printable content width
  const scaleFactor    = contentWidthMm / imgWidthMm;
  const scaledHeightMm = imgHeightMm * scaleFactor;

  // ---------------------------------------------------------------------------
  // 4. Build the PDF — split across multiple pages when content is tall.
  //    We slice the source PNG into page-sized strips using an offscreen
  //    canvas, then add each strip as a separate PDF page.
  // ---------------------------------------------------------------------------
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "letter",
  });

  // Load the full image onto an offscreen canvas so we can slice it
  const srcCanvas         = document.createElement("canvas");
  srcCanvas.width         = img.naturalWidth;   // full 2× pixel dimensions
  srcCanvas.height        = img.naturalHeight;
  const srcCtx            = srcCanvas.getContext("2d");
  if (!srcCtx) throw new Error("[generate-pdf] Could not get 2D context for source canvas.");
  srcCtx.drawImage(img, 0, 0);

  // How many source pixels correspond to one printed page's height?
  // printableHeightMm / scaleFactor → CSS px per page → × 2 for 2× canvas
  const pageHeightCssPx  = printableHeightMm / scaleFactor;
  const pageHeightSrcPx  = pageHeightCssPx * 2; // 2× because pixelRatio=2

  let yOffsetMm  = 0; // mm already placed
  let ySrcPx     = 0; // source canvas y cursor (2× pixels)

  while (yOffsetMm < scaledHeightMm) {
    if (yOffsetMm > 0) pdf.addPage();

    // How much of the scaled image remains?
    const remainingMm    = scaledHeightMm - yOffsetMm;
    const sliceHeightMm  = Math.min(printableHeightMm, remainingMm);
    const sliceHeightSrcPx = Math.round((sliceHeightMm / scaleFactor) * 2);

    const sliceCanvas         = document.createElement("canvas");
    sliceCanvas.width         = srcCanvas.width;
    sliceCanvas.height        = sliceHeightSrcPx;
    const sliceCtx            = sliceCanvas.getContext("2d");
    if (!sliceCtx) throw new Error("[generate-pdf] Could not get 2D context for slice canvas.");

    sliceCtx.drawImage(
      srcCanvas,
      0, Math.round(ySrcPx),          // source x, y
      srcCanvas.width, sliceHeightSrcPx, // source w, h
      0, 0,                            // dest x, y
      sliceCanvas.width, sliceHeightSrcPx // dest w, h
    );

    pdf.addImage(
      sliceCanvas.toDataURL("image/png"),
      "PNG",
      MARGIN_MM,
      MARGIN_MM,
      contentWidthMm,
      sliceHeightMm
    );

    yOffsetMm += printableHeightMm;
    ySrcPx    += pageHeightSrcPx;
  }

  // ---------------------------------------------------------------------------
  // 5. Trigger browser download.
  // ---------------------------------------------------------------------------
  pdf.save(filename);
}
