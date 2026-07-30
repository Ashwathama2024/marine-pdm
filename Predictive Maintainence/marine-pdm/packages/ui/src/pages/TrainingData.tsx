// Training-data management page.
//
// Recording is automatic — a run opens on the pre-op → running edge in EngineContext's tick effect
// and every running tick is written with its injected-fault ground truth. This page is the readout
// and the way data gets out: class balance per run (the number that decides whether a set is
// trainable at all) and CSV / JSONL export for offline Python.

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listRuns, deleteRun, wipeDatabase, storageEstimate, eachSampleChunk, runStats,
  type TrainingRun, type TrainingSample,
} from '../services/training-store';
import { getCurrentRun, subscribeRecorder, flush, getBufferedCount, skipped } from '../services/training-recorder';
import { toCsvRow, downloadBlob } from '../services/csv';
import { isRampMode } from '../services/ramp-mode';
import { useEngine } from '../context/EngineContext';

const fmtBytes = (n: number) =>
  n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e3).toFixed(0)} kB`;

const fmtDur = (from: number, to: number | null) => {
  const s = Math.round(((to ?? Date.now()) - from) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

const CLASS_COLORS: Record<string, string> = {
  HEALTHY: 'var(--risk-normal)', F01: '#F59E0B', F02: '#F97316', F03: '#38BDF8',
  F04: '#EF4444', F05: '#A78BFA', F06: '#10B981', F07: '#F472B6', F08: '#6366F1', F09: '#FBBF24',
};

/**
 * Column order for export. Derived from the widest row in the set rather than hardcoded, so a schema
 * change cannot silently drop columns — but `runId`/`t`/`tickIndex` are pinned first for readability,
 * and the label columns pinned last so `y` sits at the right-hand edge where a Python reader expects.
 */
const FIRST_COLS = ['runId', 't', 'tickIndex', 'engineState', 'load', 'rpm', 'dataQuality', 'degradedSensors'];
const LAST_COLS = ['faultClass', 'faultCount', 'faultTargets', 'faultIntensity', 'faultSpeed', 'faultElapsedS', 'severity', 'systemRisk', 'status', 'patternsFiring'];

function orderColumns(keys: Set<string>): string[] {
  const rest = [...keys].filter(k => !FIRST_COLS.includes(k) && !LAST_COLS.includes(k)).sort();
  return [
    ...FIRST_COLS.filter(k => keys.has(k)),
    ...rest,
    ...LAST_COLS.filter(k => keys.has(k)),
  ];
}

export function TrainingData() {
  const { engineState } = useEngine();
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [live, setLive] = useState<TrainingRun | null>(getCurrentRun());
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [balances, setBalances] = useState<Record<string, Record<string, number>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRuns(await listRuns());
    setStorage(await storageEstimate());
    setLive(getCurrentRun());
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => subscribeRecorder(() => { void refresh(); }), [refresh]);

  async function showBalance(runId: string) {
    setBusy(runId);
    try {
      setBalances(prev => ({ ...prev, [runId]: {} }));
      const b = await runStats(runId);
      setBalances(prev => ({ ...prev, [runId]: b }));
    } finally { setBusy(null); }
  }

  /** Export by streaming chunks into an array of strings, so a long run never becomes one big string. */
  async function exportRun(runId: string, format: 'csv' | 'jsonl') {
    setBusy(runId);
    try {
      await flush();   // land anything still buffered before reading back
      const chunks: string[] = [];
      const keys = new Set<string>();
      const collected: TrainingSample[] = [];
      await eachSampleChunk(runId, 500, rows => {
        for (const r of rows) { Object.keys(r).forEach(k => keys.add(k)); collected.push(r); }
      });
      if (collected.length === 0) { setBusy(null); return; }

      if (format === 'jsonl') {
        for (const r of collected) chunks.push(JSON.stringify(r) + '\n');
        downloadBlob(`${runId}.jsonl`, new Blob(chunks, { type: 'application/x-ndjson;charset=utf-8' }));
      } else {
        const cols = orderColumns(keys);
        chunks.push(toCsvRow(cols) + '\n');
        for (const r of collected) chunks.push(toCsvRow(cols.map(c => r[c] ?? '')) + '\n');
        downloadBlob(`${runId}.csv`, new Blob(chunks, { type: 'text/csv;charset=utf-8' }));
      }
    } finally { setBusy(null); }
  }

  async function handleDelete(runId: string) {
    setBusy(runId);
    try { await deleteRun(runId); await refresh(); } finally { setBusy(null); }
  }

  async function handleWipe() {
    setBusy('__wipe');
    try { await wipeDatabase(); setBalances({}); await refresh(); } finally { setBusy(null); }
  }

  const totalSamples = runs.reduce((s, r) => s + r.sampleCount, 0);
  const ramp = isRampMode();

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="page-title">TRAINING DATA</div>
          <div className="page-subtitle">PERSISTENT LOCAL CAPTURE — LABELLED BY INJECTED FAULT</div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={handleWipe} disabled={busy !== null} className="mag-btn mag-btn-ghost"
          style={{ fontSize: 10, color: 'var(--risk-critical)' }}>
          {busy === '__wipe' ? 'Wiping…' : 'Wipe Database'}
        </button>
      </div>

      <div className="page-body" style={{ paddingTop: 0 }}>
        {/* Status strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'RECORDING', value: live ? 'ACTIVE' : 'IDLE', color: live ? 'var(--risk-normal)' : 'var(--text-dim)' },
            { label: 'ENGINE STATE', value: engineState, color: 'var(--text-secondary)' },
            { label: 'CURRENT RUN', value: live ? `${live.sampleCount} +${getBufferedCount()} buf` : '—', color: 'var(--text-primary)' },
            { label: 'TOTAL ROWS', value: totalSamples.toLocaleString(), color: 'var(--accent-blue)' },
            { label: 'RUNS', value: String(runs.length), color: 'var(--text-primary)' },
            { label: 'STORAGE', value: storage ? fmtBytes(storage.usage) : 'n/a', color: 'var(--text-secondary)' },
          ].map(s => (
            <div key={s.label} className="glass-card" style={{ padding: '10px 14px' }}>
              <div className="label-xs" style={{ marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Skipped-tick counters. A tick offered to the recorder but not stored used to be completely
            invisible — a whole run once recorded zero rows with nothing to show why. `noRun` climbing
            while the engine runs means the run lifecycle is broken; `featureError` means the feature
            builder is throwing (details in the console). `duplicateTick` is expected in dev, where
            StrictMode offers every snapshot twice. */}
        {(skipped.noRun > 0 || skipped.featureError > 0) && (
          <div className="glass-card" style={{ padding: '10px 14px', marginBottom: 14, borderLeft: '3px solid var(--risk-critical)' }}>
            <div style={{ fontSize: 10, color: 'var(--risk-critical)', fontWeight: 700, marginBottom: 3 }}>
              TICKS SKIPPED BY THE RECORDER
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              no open run: {skipped.noRun} · feature-build error: {skipped.featureError} · duplicate tick (StrictMode, expected): {skipped.duplicateTick}
            </div>
          </div>
        )}

        {/* Ramp warning — the one setting that decides whether the data can support prediction */}
        {!ramp && (
          <div className="glass-card" style={{ padding: '12px 16px', marginBottom: 14, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>
              SEVERITY RAMP IS OFF — rows will capture fully-developed faults only
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Injected faults are jumping straight to their intensity cap, so there is no incipient phase to
              learn from and a model trained on this data can only confirm alarms that have already fired.
              Turn on <b>Severity Ramp</b> in the <Link to="/simulator" style={{ color: 'var(--accent-blue)' }}>Simulator</Link>'s
              fault injector before collecting a set you intend to train on.
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="glass-card" style={{ padding: '12px 16px', marginBottom: 14 }}>
          <div className="label-xs" style={{ marginBottom: 6 }}>WHAT IS BEING RECORDED</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            One row per running tick (1 Hz), written to IndexedDB so it survives reload and is present in
            every later local session. Each row carries the ~100-scalar <b>MTU8000Features</b> vector, the six
            latent root-factor values, and the ground truth read from the engine at that instant — fault id,
            target, intensity, speed and live severity. Healthy ticks are labelled <b>HEALTHY</b>, so the
            negative class accumulates for free.
            <br /><br />
            Two RUL columns per forecastable metric: <b>rulTrue_*</b> is solved exactly from the linear
            degradation model (matrix ∂ weights × growth rate vs the coded MTU alarm band), and
            <b> minsToAlarm_*</b> is the naive slope extrapolation the rules engine can already do. The gap
            between them is the headroom a learned model has to capture.
            <br /><br />
            Rows recorded while a sensor failure mode or manual override is active are marked
            <b> dataQuality=DEGRADED</b> rather than dropped — filter them out for fault classification, keep
            them for sensor-fault-vs-equipment-fault work.
          </div>
        </div>

        {/* Runs */}
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Run</th><th>Started</th><th>Duration</th><th>Rows</th>
                <th>Ramp</th><th>Class balance</th><th>Export</th><th></th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr><td colSpan={8} style={{ color: 'var(--text-dim)', fontSize: 11, padding: '16px 12px' }}>
                  No runs yet. Start the engine on the <Link to="/simulator" style={{ color: 'var(--accent-blue)' }}>Simulator</Link> page
                  — recording begins automatically once it reaches IDLE or above.
                </td></tr>
              )}
              {runs.map(run => {
                const isLive = live?.runId === run.runId;
                const bal = balances[run.runId];
                return (
                  <tr key={run.runId} style={{ background: isLive ? 'rgba(0,212,170,0.04)' : undefined }}>
                    <td style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                      {isLive && <span style={{ color: 'var(--risk-normal)', marginRight: 6 }}>●</span>}
                      {run.runId.replace('run-', '')}
                    </td>
                    <td style={{ fontSize: 10, color: 'var(--text-dim)' }}>{new Date(run.startedAt).toLocaleString()}</td>
                    <td style={{ fontSize: 10, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>{fmtDur(run.startedAt, run.endedAt)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{run.sampleCount.toLocaleString()}</td>
                    <td>
                      <span className={`badge ${run.rampMode ? 'badge-normal' : 'badge-warning'}`}>
                        {run.rampMode ? 'RAMP' : 'STEP'}
                      </span>
                    </td>
                    <td>
                      {bal === undefined ? (
                        <button onClick={() => showBalance(run.runId)} disabled={busy !== null}
                          className="mag-btn mag-btn-ghost" style={{ fontSize: 8, padding: '3px 8px' }}>
                          {busy === run.runId ? '…' : 'Count'}
                        </button>
                      ) : Object.keys(bal).length === 0 ? (
                        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>counting…</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {Object.entries(bal).sort((a, b) => b[1] - a[1]).map(([cls, n]) => (
                            <span key={cls} style={{
                              fontSize: 8, padding: '2px 5px', borderRadius: 3,
                              background: `${CLASS_COLORS[cls] ?? 'var(--text-dim)'}22`,
                              color: CLASS_COLORS[cls] ?? 'var(--text-dim)', fontWeight: 700,
                            }}>{cls} {n}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => exportRun(run.runId, 'csv')} disabled={busy !== null || run.sampleCount === 0}
                          className="mag-btn mag-btn-ghost" style={{ fontSize: 8, padding: '3px 8px' }}>CSV</button>
                        <button onClick={() => exportRun(run.runId, 'jsonl')} disabled={busy !== null || run.sampleCount === 0}
                          className="mag-btn mag-btn-ghost" style={{ fontSize: 8, padding: '3px 8px' }}>JSONL</button>
                      </div>
                    </td>
                    <td>
                      <button onClick={() => handleDelete(run.runId)} disabled={busy !== null || isLive}
                        className="mag-btn mag-btn-ghost"
                        style={{ fontSize: 8, padding: '3px 8px', color: isLive ? 'var(--text-dim)' : 'var(--risk-critical)' }}
                        title={isLive ? 'Cannot delete the run that is currently recording' : 'Delete this run'}>
                        DEL
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
