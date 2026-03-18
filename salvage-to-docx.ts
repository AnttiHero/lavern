import * as fs from 'fs';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, TableOfContents,
} from 'docx';

const md = fs.readFileSync('/tmp/salvaged-tos.md', 'utf-8');
const lines = md.split('\n');

const children: Paragraph[] = [];

let i = 0;
while (i < lines.length) {
  const line = lines[i];

  // Headings
  if (line.startsWith('# ')) {
    children.push(new Paragraph({
      text: line.replace(/^# /, ''),
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }));
    i++;
    continue;
  }

  if (line.startsWith('## ')) {
    children.push(new Paragraph({
      text: line.replace(/^## /, ''),
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    }));
    i++;
    continue;
  }

  if (line.startsWith('### ')) {
    children.push(new Paragraph({
      text: line.replace(/^### /, ''),
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 150 },
    }));
    i++;
    continue;
  }

  if (line.startsWith('#### ')) {
    children.push(new Paragraph({
      text: line.replace(/^#### /, ''),
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 200, after: 100 },
    }));
    i++;
    continue;
  }

  // Horizontal rule
  if (line.match(/^---+$/)) {
    children.push(new Paragraph({
      text: '',
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999' } },
      spacing: { before: 200, after: 200 },
    }));
    i++;
    continue;
  }

  // Empty line
  if (line.trim() === '') {
    i++;
    continue;
  }

  // Bullet points
  if (line.match(/^[-*] /)) {
    const text = line.replace(/^[-*] /, '');
    children.push(new Paragraph({
      children: parseInlineFormatting(text),
      bullet: { level: 0 },
      spacing: { before: 60, after: 60 },
    }));
    i++;
    continue;
  }

  // Sub-bullets
  if (line.match(/^\s+[-*] /)) {
    const text = line.replace(/^\s+[-*] /, '');
    children.push(new Paragraph({
      children: parseInlineFormatting(text),
      bullet: { level: 1 },
      spacing: { before: 40, after: 40 },
    }));
    i++;
    continue;
  }

  // Regular paragraph — collect continuation lines
  let paraText = line;
  while (i + 1 < lines.length && lines[i + 1].trim() !== '' && !lines[i + 1].match(/^#{1,4} /) && !lines[i + 1].match(/^[-*] /) && !lines[i + 1].match(/^\s+[-*] /) && !lines[i + 1].match(/^---+$/)) {
    i++;
    paraText += ' ' + lines[i];
  }

  children.push(new Paragraph({
    children: parseInlineFormatting(paraText),
    spacing: { before: 100, after: 100 },
  }));
  i++;
}

function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Split on bold (**text**) and regular text
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({
        text: part.slice(2, -2),
        bold: true,
        size: 22, // 11pt
        font: 'Calibri',
      }));
    } else if (part) {
      runs.push(new TextRun({
        text: part,
        size: 22,
        font: 'Calibri',
      }));
    }
  }
  return runs;
}

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { size: 22, font: 'Calibri' },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, // 1 inch
      },
    },
    children,
  }],
});

const outPath = '/tmp/HeartConnect-Terms-of-Service.docx';
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer);
  console.log(`Done: ${outPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
});
