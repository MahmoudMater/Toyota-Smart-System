#!/usr/bin/env node
/**
 * Build Toyota-Smart-Gate-Technical-Handover.docx from markdown + PNG diagrams.
 * Usage: node build-docx.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
} from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MD_PATH = path.join(__dirname, 'Toyota-Smart-Gate-Technical-Handover.md');
const OUT_PATH = path.join(__dirname, 'Toyota-Smart-Gate-Technical-Handover.docx');

function headingLevel(line) {
  if (line.startsWith('#### ')) return HeadingLevel.HEADING_3;
  if (line.startsWith('### ')) return HeadingLevel.HEADING_2;
  if (line.startsWith('## ')) return HeadingLevel.HEADING_1;
  if (line.startsWith('# ')) return HeadingLevel.TITLE;
  return null;
}

function stripMd(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1');
}

function parseTableRows(lines, startIdx) {
  const rows = [];
  let i = startIdx;
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    const cells = lines[i]
      .split('|')
      .slice(1, -1)
      .map((c) => stripMd(c.trim()));
    if (!cells.every((c) => /^[-:]+$/.test(c))) {
      rows.push(cells);
    }
    i++;
  }
  return { rows, nextIdx: i };
}

function makeTable(rows) {
  if (rows.length === 0) return null;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (cells, rowIdx) =>
        new TableRow({
          children: cells.map(
            (text) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text,
                        bold: rowIdx === 0,
                        size: 20,
                      }),
                    ],
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

function imageParagraph(imagePath, alt) {
  const full = path.join(__dirname, imagePath);
  if (!fs.existsSync(full)) {
    return new Paragraph({
      children: [new TextRun({ text: `[Missing image: ${alt}]`, italics: true })],
    });
  }
  const data = fs.readFileSync(full);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    children: [
      new ImageRun({
        type: 'png',
        data,
        transformation: { width: 600, height: 400 },
      }),
    ],
  });
}

function buildDocument() {
  const md = fs.readFileSync(MD_PATH, 'utf8');
  const lines = md.split('\n');
  const children = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '' || trimmed === '---') {
      i++;
      continue;
    }

    // Image
    const imgMatch = trimmed.match(/^!\[(.+?)\]\((.+?)\)$/);
    if (imgMatch) {
      children.push(imageParagraph(imgMatch[2], imgMatch[1]));
      i++;
      continue;
    }

    // Headings
    const level = headingLevel(trimmed);
    if (level) {
      const text = stripMd(trimmed.replace(/^#+\s*/, ''));
      children.push(
        new Paragraph({
          heading: level,
          spacing: { before: level === HeadingLevel.TITLE ? 0 : 240, after: 120 },
          children: [new TextRun({ text, bold: true })],
        }),
      );
      i++;
      continue;
    }

    // Table
    if (trimmed.startsWith('|')) {
      const { rows, nextIdx } = parseTableRows(lines, i);
      const table = makeTable(rows);
      if (table) children.push(table);
      i = nextIdx;
      continue;
    }

    // Code block
    if (trimmed.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: [
            new TextRun({
              text: codeLines.join('\n'),
              font: 'Courier New',
              size: 18,
            }),
          ],
        }),
      );
      continue;
    }

    // Bullet list item
    if (trimmed.startsWith('- ')) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: stripMd(trimmed.slice(2)), size: 22 })],
        }),
      );
      i++;
      continue;
    }

    // Numbered list
    const numMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (numMatch) {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: stripMd(trimmed), size: 22 })],
        }),
      );
      i++;
      continue;
    }

    // Regular paragraph (collect consecutive non-special lines)
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('- ') &&
      !lines[i].trim().startsWith('![') &&
      lines[i].trim() !== '---'
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length > 0) {
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: stripMd(paraLines.join(' ')), size: 22 })],
        }),
      );
    } else {
      i++;
    }
  }

  return new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });
}

async function main() {
  const doc = buildDocument();
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(OUT_PATH, buffer);
  console.log(`Wrote ${OUT_PATH} (${buffer.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
