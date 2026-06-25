import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

let workerInitialized = false;

function ensureWorker(): void {
  if (workerInitialized) return;
  try {
    GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href;
    workerInitialized = true;
  } catch {
    GlobalWorkerOptions.workerSrc = '';
  }
}

export async function extractTextFromPDF(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<string> {
  ensureWorker();

  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const total = pdf.numPages;
  const parts: string[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (text) parts.push(text);
    onProgress?.(i, total);
  }

  return parts.join('\n\n');
}
