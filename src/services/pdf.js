const pdfParse = require('pdf-parse');

async function extractPdfText(buffer) {
  const data = await pdfParse(buffer);
  const text = String(data.text || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('PDF tidak berisi teks yang bisa dibaca');
  return text;
}

module.exports = { extractPdfText };
