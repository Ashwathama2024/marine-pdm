import React, { useState, useRef, useCallback } from 'react';
import {
  loadDocuments, addDocument, removeDocument, toggleContext, buildContextString,
  type KnowledgeDocument, type DocType,
} from '../services/knowledge-store';
import { extractTextFromPDF } from '../services/pdf-extract';

const DOC_TYPES: DocType[] = ['CASE_STUDY', 'MANUAL', 'HISTORIC_LOG', 'NOTE'];
const SENSOR_TAGS = [
  'ME.ExhaustTemp', 'ME.LubeOilPressure',
  'ME.ScavengeAirPressure', 'ME.TCSpeed', 'ME.JacketCoolingOutlet', 'ME.SFOC',
];

export function KnowledgeBase() {
  const [docs, setDocs] = useState<KnowledgeDocument[]>(() => loadDocuments());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocType | 'ALL'>('ALL');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ title: '', type: 'CASE_STUDY' as DocType, content: '', tags: [] as string[] });
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileProcess = useCallback(async (file: File) => {
    if (!file.name.endsWith('.pdf')) {
      setAddForm(f => ({ ...f, content: 'Drop a PDF file here.' }));
      return;
    }
    setUploading(true);
    setUploadProgress('Extracting text…');
    try {
      const text = await extractTextFromPDF(file, (page, total) => {
        setUploadProgress(`Extracting page ${page}/${total}…`);
      });
      const suggested = file.name.replace('.pdf', '').replace(/[-_]/g, ' ');
      setAddForm(f => ({ ...f, title: suggested, content: text, type: 'MANUAL' }));
      setShowAdd(true);
    } catch (e) {
      setUploadProgress(`Error: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileProcess(file);
  }

  function handleSave() {
    if (!addForm.title.trim() || !addForm.content.trim()) return;
    const updated = addDocument(docs, addForm.title, addForm.type, addForm.content, addForm.tags);
    setDocs(updated);
    setAddForm({ title: '', type: 'CASE_STUDY', content: '', tags: [] });
    setShowAdd(false);
    setUploadProgress('');
  }

  function handleToggleContext(id: string) {
    setDocs(toggleContext(docs, id));
  }

  function handleRemove(id: string) {
    setDocs(removeDocument(docs, id));
  }

  function toggleTag(tag: string) {
    setAddForm(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
    }));
  }

  const filtered = docs.filter(d => {
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase()) || d.content.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'ALL' || d.type === typeFilter;
    return matchSearch && matchType;
  });

  const activeContext = docs.filter(d => d.useInContext);
  const totalWords = docs.reduce((s, d) => s + d.wordCount, 0);
  const contextWords = activeContext.reduce((s, d) => s + d.wordCount, 0);

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="page-title">KNOWLEDGE BASE</div>
          <div className="page-subtitle">CASE STUDIES · MANUALS · HISTORIC LOGS</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowAdd(true)} className="mag-btn mag-btn-solid" style={{ fontSize: 10 }}>+ Add Text</button>
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: 0 }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'DOCUMENTS', val: docs.length },
            { label: 'TOTAL WORDS', val: totalWords.toLocaleString() },
            { label: 'IN AI CONTEXT', val: activeContext.length },
            { label: 'CONTEXT WORDS', val: contextWords.toLocaleString() },
          ].map(s => (
            <div key={s.label} className="glass-card" style={{ padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{s.val}</div>
              <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* PDF Drop zone */}
        <div
          className={`dropzone${dragOver ? ' drag-over' : ''}`}
          style={{ marginBottom: 16 }}
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileProcess(f); }} />
          {uploading ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{uploadProgress}</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                Drop PDF manual or click to browse
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                Text will be extracted and added to the knowledge base
              </div>
            </>
          )}
        </div>

        {/* Add text form */}
        {showAdd && (
          <div className="glass-card-hi" style={{ padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>ADD KNOWLEDGE DOCUMENT</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginBottom: 10 }}>
              <input
                value={addForm.title}
                onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Document title *"
                style={{ padding: '6px 10px', fontSize: 11 }}
              />
              <select
                value={addForm.type}
                onChange={e => setAddForm(f => ({ ...f, type: e.target.value as DocType }))}
                style={{ padding: '6px 10px', fontSize: 11 }}
              >
                {DOC_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>

            <textarea
              value={addForm.content}
              onChange={e => setAddForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Paste document content here *"
              rows={6}
              style={{ width: '100%', padding: '8px 10px', fontSize: 11, resize: 'vertical', marginBottom: 10 }}
            />

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 6, letterSpacing: '0.1em' }}>RELATED SENSORS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SENSOR_TAGS.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={addForm.tags.includes(tag) ? 'mag-btn mag-btn-solid' : 'mag-btn mag-btn-ghost'}
                    style={{ fontSize: 9, padding: '3px 8px' }}
                  >
                    {tag.replace('ME.', '')}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowAdd(false); setUploadProgress(''); }} className="mag-btn mag-btn-ghost" style={{ fontSize: 10 }}>Cancel</button>
              <button onClick={handleSave} className="mag-btn mag-btn-solid" style={{ fontSize: 10 }}
                disabled={!addForm.title.trim() || !addForm.content.trim()}>
                Save Document
              </button>
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search documents…"
            style={{ flex: 1, minWidth: 200, padding: '5px 10px', fontSize: 11 }}
          />
          {(['ALL', ...DOC_TYPES] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`mag-btn ${typeFilter === t ? 'mag-btn-ghost' : 'mag-btn-ghost'}`}
              style={{ fontSize: 9, padding: '4px 10px', opacity: typeFilter === t ? 1 : 0.5 }}>
              {t.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Document list */}
        {filtered.length === 0 ? (
          <div className="glass-card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            {docs.length === 0
              ? 'No documents yet. Drop a PDF or paste text above.'
              : 'No documents match the filter.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(doc => (
              <div key={doc.id} className="glass-card" style={{ padding: '12px 16px', opacity: doc.useInContext ? 1 : 0.65 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className="badge badge-info">{doc.type.replace('_', ' ')}</span>
                      <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                        {new Date(doc.uploadedAt).toLocaleDateString()} · {doc.wordCount.toLocaleString()} words
                      </span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{doc.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90%' }}>
                      {doc.content.slice(0, 120)}…
                    </div>
                    {doc.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                        {doc.tags.map(t => <span key={t} className="badge badge-obs" style={{ fontSize: 8 }}>{t.replace('ME.', '')}</span>)}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => handleToggleContext(doc.id)}
                      className={`mag-btn ${doc.useInContext ? 'mag-btn-solid' : 'mag-btn-ghost'}`}
                      style={{ fontSize: 9, padding: '4px 8px' }}
                      title={doc.useInContext ? 'Remove from AI context' : 'Add to AI context'}
                    >
                      {doc.useInContext ? 'IN AI ✓' : 'Use in AI'}
                    </button>
                    <button
                      onClick={() => handleRemove(doc.id)}
                      className="mag-btn mag-btn-danger"
                      style={{ fontSize: 9, padding: '4px 8px' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
