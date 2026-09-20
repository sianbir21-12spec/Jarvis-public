import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import AdmZip from 'adm-zip';

export const filesRouter = Router();

// Minimal shape of what multer attaches to req.file -- defined locally so
// this route's types don't depend on @types/multer's global Express
// namespace augmentation being resolved first.
interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

// Memory storage: files are small (chat attachments), never need to hit disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB upload cap
});

// Keep this in sync with MAX_FILE_READ_BYTES in src/App.tsx so plain-text and
// extracted-document attachments are truncated the same way.
const MAX_TEXT_BYTES = 300 * 1024;

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_BYTES) return { text, truncated: false };
  return { text: text.slice(0, MAX_TEXT_BYTES) + '\n\n...[truncated]', truncated: true };
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text.trim();
}

function extractSpreadsheet(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // CSV output is compact and lets the model reason over rows/columns
    // without shipping the raw XML.
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      sheets.push(`--- Sheet: ${sheetName} ---\n${csv.trim()}`);
    }
  }

  return sheets.join('\n\n').trim();
}

// Extensions we can pull readable text from -- either directly (plain
// text/code) or via one of the extractors above (documents/spreadsheets).
const TEXT_LIKE_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.csv', '.tsv', '.log', '.yml', '.yaml', '.xml', '.html', '.css',
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.rb', '.php',
  '.sh', '.sql', '.ini', '.cfg', '.toml', '.env'
]);

// Zip-bomb guardrails: cap how many entries we open and how much
// uncompressed content we're willing to process from a single archive.
const MAX_ZIP_ENTRIES = 200;
const MAX_ZIP_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50MB total, pre-truncation

async function extractZip(buffer: Buffer): Promise<string> {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);

  if (entries.length > MAX_ZIP_ENTRIES) {
    return (
      `[Archive contains ${entries.length} files, which exceeds the ${MAX_ZIP_ENTRIES}-file limit for inline extraction. ` +
      `Listing the first ${MAX_ZIP_ENTRIES} entries only:]\n\n` +
      entries
        .slice(0, MAX_ZIP_ENTRIES)
        .map((e) => `- ${e.entryName}`)
        .join('\n')
    );
  }

  const totalUncompressed = entries.reduce((sum, e) => sum + e.header.size, 0);
  if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
    return (
      `[Archive unpacks to ${(totalUncompressed / 1024 / 1024).toFixed(1)}MB, which exceeds the ` +
      `${MAX_ZIP_UNCOMPRESSED_BYTES / 1024 / 1024}MB limit for inline extraction, so it was not unpacked. ` +
      `Files it contains:]\n\n${entries.map((e) => `- ${e.entryName}`).join('\n')}`
    );
  }

  const sections: string[] = [];

  for (const entry of entries) {
    const entryExt = path.extname(entry.entryName).toLowerCase();
    const entryBuffer = entry.getData();
    let entryText: string | null = null;

    try {
      switch (entryExt) {
        case '.docx':
          entryText = await extractDocx(entryBuffer);
          break;
        case '.pdf':
          entryText = await extractPdf(entryBuffer);
          break;
        case '.xlsx':
        case '.xls':
        case '.csv':
          entryText = extractSpreadsheet(entryBuffer);
          break;
        case '.zip':
          // One level of nested-zip support; deeper nesting is skipped to
          // keep this bounded rather than recursing indefinitely.
          entryText = `[Nested zip archive -- not unpacked further]\n${entryBuffer.length} bytes`;
          break;
        default:
          if (TEXT_LIKE_EXTENSIONS.has(entryExt)) {
            entryText = entryBuffer.toString('utf-8');
          }
      }
    } catch (err: any) {
      entryText = `[Could not extract this file: ${err?.message || 'unknown error'}]`;
    }

    if (entryText === null) {
      // Binary file we don't know how to read (image, executable, etc.) --
      // note its presence without dumping raw bytes into the context.
      sections.push(`--- ${entry.entryName} (${entryBuffer.length} bytes, binary, not extracted) ---`);
      continue;
    }

    sections.push(`--- ${entry.entryName} ---\n${entryText.trim() || '[empty]'}`);
  }

  return sections.join('\n\n');
}

/**
 * ---------------------------------------------------------------------
 * File generation ("write files back out")
 * ---------------------------------------------------------------------
 * The extraction endpoint above reads files IN. This is the reverse: takes
 * text the assistant produced (or the user typed) and returns it as a real
 * downloadable file in the requested format, the way Claude's file-creation
 * feature works. Kept deliberately simple -- markdown-ish text in, a
 * document/spreadsheet/PDF out -- rather than a full layout engine.
 */

const MAX_GENERATE_CHARS = 300 * 1000; // mirrors MAX_TEXT_BYTES above

function sanitizeFilename(name: string, fallbackExt: string): string {
  const base = (name || 'jarvis-output')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 120) || 'jarvis-output';
  return base.toLowerCase().endsWith(`.${fallbackExt}`) ? base : `${base}.${fallbackExt}`;
}

// Turns lightly-markdown text into docx paragraphs: '#'-headings, '-'/'*'
// bullets, and plain paragraphs for everything else.
function buildDocx(content: string): Promise<Buffer> {
  const lines = content.split(/\r?\n/);
  const children: Paragraph[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      children.push(new Paragraph({ text: '' }));
      continue;
    }
    const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][
        headingMatch[1].length - 1
      ];
      children.push(new Paragraph({ text: headingMatch[2], heading: level }));
      continue;
    }
    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      children.push(new Paragraph({ text: bulletMatch[1], bullet: { level: 0 } }));
      continue;
    }
    children.push(new Paragraph({ children: [new TextRun(line)] }));
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}

// Streams plain text into a basic PDF (one continuous flow, word-wrapped by
// pdfkit). Good for reports/letters/summaries -- not for pixel-precise layout.
function buildPdf(content: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica');
    const lines = content.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trimEnd();
      const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
      if (headingMatch) {
        const size = 20 - (headingMatch[1].length - 1) * 2;
        doc.fontSize(size).font('Helvetica-Bold').text(headingMatch[2], { paragraphGap: 6 });
        doc.font('Helvetica');
        continue;
      }
      if (!line.trim()) {
        doc.moveDown(0.5);
        continue;
      }
      doc.fontSize(11).text(line, { paragraphGap: 4 });
    }
    doc.end();
  });
}

// Interprets content as CSV/TSV if it looks tabular, otherwise as JSON
// (array of objects or array of arrays), otherwise falls back to one
// column of text lines.
function buildXlsx(content: string): Buffer {
  let rows: unknown[];
  const trimmed = content.trim();

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      rows = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      rows = trimmed.split(/\r?\n/).map((line) => ({ value: line }));
    }
  } else if (trimmed.includes(',') || trimmed.includes('\t')) {
    const delim = trimmed.includes('\t') ? '\t' : ',';
    rows = trimmed.split(/\r?\n/).map((line) => line.split(delim));
  } else {
    rows = trimmed.split(/\r?\n/).map((line) => ({ value: line }));
  }

  const isAoa = Array.isArray(rows) && Array.isArray(rows[0]);
  const sheet = isAoa ? XLSX.utils.aoa_to_sheet(rows as unknown[][]) : XLSX.utils.json_to_sheet(rows as Record<string, unknown>[]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/**
 * POST /api/files/generate
 * body: { format: 'docx' | 'pdf' | 'xlsx' | 'txt' | 'md', filename?: string, content: string }
 * Returns the generated file as a binary download.
 */
filesRouter.post('/files/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format, filename, content } = req.body as { format?: string; filename?: string; content?: string };

    if (!content || typeof content !== 'string') {
      throw { status: 400, message: 'Missing "content" to generate a file from.' };
    }
    if (content.length > MAX_GENERATE_CHARS) {
      throw { status: 413, message: `Content too large to generate a file from (max ${MAX_GENERATE_CHARS} characters).` };
    }

    switch (format) {
      case 'docx': {
        const buffer = await buildDocx(content);
        const name = sanitizeFilename(filename || '', 'docx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
        res.send(buffer);
        return;
      }
      case 'pdf': {
        const buffer = await buildPdf(content);
        const name = sanitizeFilename(filename || '', 'pdf');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
        res.send(buffer);
        return;
      }
      case 'xlsx': {
        const buffer = buildXlsx(content);
        const name = sanitizeFilename(filename || '', 'xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
        res.send(buffer);
        return;
      }
      case 'txt':
      case 'md': {
        const ext = format;
        const name = sanitizeFilename(filename || '', ext);
        res.setHeader('Content-Type', ext === 'md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
        res.send(content);
        return;
      }
      default:
        res.status(415).json({
          ok: false,
          error: `Unsupported format "${format}". Supported: docx, pdf, xlsx, txt, md.`
        });
    }
  } catch (err: any) {
    if (err?.status) {
      next(err);
      return;
    }
    res.status(500).json({ ok: false, error: `Could not generate file: ${err?.message || 'unknown error'}` });
  }
});

/**
 * POST /api/files/extract
 * multipart/form-data, field name "file".
 * Returns extracted plain text for document formats the browser can't parse
 * on its own (docx, pdf, xlsx/xls, zip archives -- unpacked entry by
 * entry). The frontend falls back to its existing
 * "binary file, not extracted" message for anything unsupported or on error,
 * so this endpoint is additive -- it never has to be the only path.
 */
filesRouter.post(
  '/files/extract',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Cast rather than rely on @types/multer's global Express.Request
      // augmentation -- keeps this route compiling regardless of type
      // resolution order.
      const file = (req as Request & { file?: UploadedFile }).file;
      if (!file) {
        throw { status: 400, message: 'No file was uploaded (expected multipart field "file").' };
      }

      const ext = path.extname(file.originalname).toLowerCase();
      let text: string;
      let format: string;

      switch (ext) {
        case '.docx':
          text = await extractDocx(file.buffer);
          format = 'docx';
          break;
        case '.pdf':
          text = await extractPdf(file.buffer);
          format = 'pdf';
          break;
        case '.xlsx':
        case '.xls':
        case '.csv':
          text = extractSpreadsheet(file.buffer);
          format = 'spreadsheet';
          break;
        case '.zip':
          text = await extractZip(file.buffer);
          format = 'zip';
          break;
        default:
          res.status(415).json({
            ok: false,
            error: `Unsupported format "${ext || 'unknown'}". Supported: .docx, .pdf, .xlsx, .xls, .csv, .zip.`
          });
          return;
      }

      if (!text) {
        res.json({
          ok: true,
          format,
          text: '[No extractable text was found in this file -- it may be empty, image-only, or scanned without OCR.]',
          truncated: false
        });
        return;
      }

      const { text: finalText, truncated } = truncate(text);
      res.json({ ok: true, format, text: finalText, truncated });
    } catch (err: any) {
      // .doc (legacy binary Word format), corrupt files, and password-protected
      // documents all land here -- mammoth/pdf-parse throw rather than return
      // empty text for those, so give a specific, actionable message instead
      // of a generic 500.
      if (err?.status) {
        next(err);
        return;
      }
      res.status(422).json({
        ok: false,
        error: `Could not extract text from this file: ${err?.message || 'unknown error'}. It may be corrupted, password-protected, or in an unsupported legacy format (e.g. old .doc instead of .docx).`
      });
    }
  }
);
