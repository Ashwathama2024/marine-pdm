const STORAGE_KEY = 'marine-pdm-knowledge-docs';
const MAX_DOCS = 50;
const MAX_CONTEXT_CHARS = 24000; // ~6000 tokens

export type DocType = 'CASE_STUDY' | 'MANUAL' | 'HISTORIC_LOG' | 'NOTE';

export interface KnowledgeDocument {
  id: string;
  title: string;
  type: DocType;
  content: string;
  uploadedAt: string;
  tags: string[];
  wordCount: number;
  useInContext: boolean;
}

function generateId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function loadDocuments(): KnowledgeDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as KnowledgeDocument[];
  } catch { /* ignore */ }
  return [];
}

export function saveDocuments(docs: KnowledgeDocument[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

export function addDocument(
  docs: KnowledgeDocument[],
  title: string,
  type: DocType,
  content: string,
  tags: string[],
): KnowledgeDocument[] {
  const doc: KnowledgeDocument = {
    id: generateId(),
    title,
    type,
    content,
    uploadedAt: new Date().toISOString(),
    tags,
    wordCount: content.split(/\s+/).filter(Boolean).length,
    useInContext: true,
  };
  const updated = [doc, ...docs].slice(0, MAX_DOCS);
  saveDocuments(updated);
  return updated;
}

export function removeDocument(docs: KnowledgeDocument[], id: string): KnowledgeDocument[] {
  const updated = docs.filter(d => d.id !== id);
  saveDocuments(updated);
  return updated;
}

export function toggleContext(docs: KnowledgeDocument[], id: string): KnowledgeDocument[] {
  const updated = docs.map(d => d.id === id ? { ...d, useInContext: !d.useInContext } : d);
  saveDocuments(updated);
  return updated;
}

export function buildContextString(docs: KnowledgeDocument[]): string {
  const active = docs.filter(d => d.useInContext);
  if (active.length === 0) return '';

  let result = '';
  for (const doc of active) {
    const excerpt = doc.content.slice(0, 2000);
    const section = `--- ${doc.title} (${doc.type}) ---\n${excerpt}\n\n`;
    if ((result + section).length > MAX_CONTEXT_CHARS) break;
    result += section;
  }
  return result.trim();
}
