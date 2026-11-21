const TESSERACT_VERSION = "7.0.0";
const PDFJS_VERSION = "4.10.38";

async function createOcrWorker(onProgress) {
  const { createWorker } = await import("https://esm.sh/tesseract.js@7.0.0?bundle");
  return createWorker("eng", 1, {
    workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/worker.min.js`,
    corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${TESSERACT_VERSION}`,
    langPath: "https://tessdata.projectnaptha.com/4.0.0_fast",
    cachePath: "universe-ocr-v2",
    cacheMethod: "write",
    workerBlobURL: true,
    errorHandler: error => console.error("[UNI-VERSE OCR worker]", error),
    logger: message => {
      if (message.status) onProgress?.(message.status, Number(message.progress) || 0);
    }
  });
}

async function recognizeImage(worker, source) {
  const { data } = await worker.recognize(source);
  return String(data?.text || "").trim();
}

async function extractImageText(file, onProgress) {
  let worker;
  let bitmap;
  let canvas;
  try {
    worker = await createOcrWorker(onProgress);
    bitmap = await createImageBitmap(file);
    const maxSide = 2400;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const text = await recognizeImage(worker, canvas);
    return `[PAGE 1]\n${text}`;
  } finally {
    bitmap?.close?.();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    if (worker) await worker.terminate();
  }
}

async function extractPdfText(file, onProgress, options = {}) {
  const maxPages = Number.isInteger(options.maxPdfPages) ? options.maxPdfPages : 30;
  const maxOcrPages = Number.isInteger(options.maxOcrPages) ? options.maxOcrPages : 30;
  const maxCharacters = Number.isInteger(options.maxCharacters) ? options.maxCharacters : 60000;
  const pdfjsLib = await import("https://esm.sh/pdfjs-dist@4.10.38/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
  const pdfDocument = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (pdfDocument.numPages > maxPages) {
    await pdfDocument.destroy();
    throw new Error(`This PDF has more than ${maxPages} pages. Split it into smaller files before processing.`);
  }

  let worker;
  const pages = [];
  let totalCharacters = 0;
  let ocrPages = 0;
  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
      onProgress?.(`Reading PDF page ${pageNumber} of ${pdfDocument.numPages}`, pageNumber / pdfDocument.numPages);
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      const selectable = content.items
        .filter(item => typeof item.str === "string")
        .map(item => item.str)
        .join(" ")
        .trim();
      let pageText = selectable;

      if (selectable.replace(/\s/g, "").length < 35) {
        ocrPages++;
        if (ocrPages > maxOcrPages) throw new Error(`This PDF needs OCR on more than ${maxOcrPages} pages. Split it into smaller files before processing.`);
        if (!worker) worker = await createOcrWorker(onProgress);
        const base = page.getViewport({ scale: 1 });
        const maxPixels = 9000000;
        const scale = Math.min(2, Math.sqrt(maxPixels / Math.max(1, base.width * base.height)));
        const viewport = page.getViewport({ scale: Math.max(1, scale) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        await page.render({ canvasContext: context, viewport }).promise;
        pageText = await recognizeImage(worker, canvas);
        canvas.width = 0;
        canvas.height = 0;
      }

      pages.push(`[PAGE ${pageNumber}]\n${pageText}`);
      totalCharacters += pageText.length;
      page.cleanup();
      if (totalCharacters > maxCharacters) {
        throw new Error(`This document contains more than ${maxCharacters.toLocaleString()} characters. Split it into smaller files before processing.`);
      }
    }
    return pages.join("\n\n");
  } finally {
    if (worker) await worker.terminate();
    await pdfDocument.destroy();
  }
}

export async function extractResourceText(file, onProgress, options = {}) {
  const extension = String(file?.name || "").split(".").pop().toLowerCase();
  if (["jpg", "jpeg", "png", "webp"].includes(extension)) return extractImageText(file, onProgress);
  if (extension === "pdf") return extractPdfText(file, onProgress, options);
  throw new Error("Question extraction currently supports PDF, JPG, PNG and WEBP files. Convert DOCX/PPTX to PDF first.");
}
