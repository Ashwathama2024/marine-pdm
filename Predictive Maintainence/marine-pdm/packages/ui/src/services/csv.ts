// CSV writing + browser download.
//
// Extracted from DeviationTable.exportCSV, which had two defects worth not repeating now that the
// training-data export shares this path:
//   • no field escaping — any label containing a comma or quote silently corrupted the file, and
//     shifted every column after it;
//   • no URL.revokeObjectURL — each export leaked the blob for the lifetime of the document.

/** RFC 4180 field: quote when the value contains a comma, quote, CR or LF; double interior quotes. */
export function csvField(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsvRow(values: readonly unknown[]): string {
  return values.map(csvField).join(',');
}

/** Trigger a download of already-assembled text. Revokes the object URL once the click is queued. */
export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export function downloadCsv(filename: string, text: string): void {
  downloadText(filename, text, 'text/csv');
}

/**
 * Download a pre-built Blob. Prefer this for large exports — the caller can build the Blob from an
 * array of chunks instead of concatenating a multi-megabyte string.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on a later frame: revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
