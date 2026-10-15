const fs = require("fs");
const path = require("path");

/**
 * Extrai texto puro de um arquivo de roteiro enviado pelo usuário.
 * Suporta .txt, .md, .pdf e .docx. Para imagens de storyboard,
 * não fazemos OCR nesta versão MVP — a legenda escrita pelo usuário
 * é usada como texto de análise (ver server.js).
 */
async function extractTextFromFile(filePath, originalName) {
  const ext = path.extname(originalName || filePath).toLowerCase();

  if (ext === ".txt" || ext === ".md") {
    return fs.readFileSync(filePath, "utf8");
  }

  if (ext === ".pdf") {
    return extractPdfText(filePath);
  }

  if (ext === ".docx") {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
  }

  // fallback: tenta ler como texto puro
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (e) {
    return "";
  }
}

async function extractPdfText(filePath) {
  // pdfjs-dist v4+ só distribui build ESM — usamos import() dinâmico
  // dentro deste módulo CommonJS para carregá-lo.
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const standardFontDataUrl =
    "file://" + path.join(require.resolve("pdfjs-dist/package.json"), "..", "standard_fonts") + "/";

  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({
    data,
    standardFontDataUrl,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return text;
}

module.exports = { extractTextFromFile };
