import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readPdf } from '../pdf.js';
import { captureSource } from '../research/sources.js';

// A tiny deterministic PDF fixture; no network or external document is involved.
function samplePdf() {
  const stream = 'BT /F1 12 Tf 72 720 Td (Reproducible research sample) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return Buffer.from(
    pdf + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
}
test('PDF tool extracts real text with page numbers and validates ranges', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-pdf-test-'));
  try {
    await writeFile(join(root, 'sample.pdf'), samplePdf());
    const result = await readPdf(root, 'sample.pdf', 1, 1);
    assert.equal(result.totalPages, 1);
    assert.equal(result.pages[0].page, 1);
    assert.match(result.pages[0].text, /Reproducible research sample/);
    await assert.rejects(() => readPdf(root, 'sample.pdf', 2, 3), { code: 'pdfRange' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('research PDF evidence matches an exact page and rejects missing pages and fabricated excerpts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-pdf-source-test-'));
  try {
    await writeFile(join(root, 'sample.pdf'), samplePdf());
    const source = await captureSource(root, {
      path: 'sample.pdf',
      page: 1,
      quote: 'Reproducible research sample',
      role: 'source',
    });
    assert.equal(source.verification, 'excerpt-matched');
    assert.equal(source.page, 1);
    assert.match(source.sha256!, /^[a-f0-9]{64}$/);
    await assert.rejects(
      () =>
        captureSource(root, {
          path: 'sample.pdf',
          quote: 'Reproducible research sample',
          role: 'source',
        }),
      { code: 'researchPageRequired' },
    );
    await assert.rejects(
      () =>
        captureSource(root, {
          path: 'sample.pdf',
          page: 1,
          quote: 'Not in the actual PDF.',
          role: 'source',
        }),
      { code: 'researchExcerptMismatch' },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
