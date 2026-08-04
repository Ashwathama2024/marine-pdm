import React, { useState, useCallback } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  loadCurves, saveCurves, upsertCurve, interpolateCurve,
  type LoadRPMCurve,
} from '../services/baseline-curves';
import { useEngine } from '../context/EngineContext';

const RPMS  = [400, 600, 720, 900, 1100, 1250];
const LOADS = [10, 25, 40, 55, 70, 85, 100];

export function BaselineEditorPage() {
  const [curves, setCurves] = useState<LoadRPMCurve[]>(() => loadCurves());
  const [selected, setSelected] = useState(curves[0]?.sensorId ?? '');
  const [editCell, setEditCell] = useState<{ rpm: number; load: number } | null>(null);
  const [editVal, setEditVal] = useState('');
  const [source, setSource] = useState('');
  const [saved, setSaved] = useState(false);
  const { snapshot, history } = useEngine();

  const curve = curves.find(c => c.sensorId === selected);

  const getCellValue = useCallback((rpm: number, load: number): string => {
    if (!curve) return '—';
    const pt = curve.points.find(p => p.rpm === rpm && p.load === load);
    return pt != null ? String(pt.expected) : '—';
  }, [curve]);

  function startEdit(rpm: number, load: number) {
    const val = getCellValue(rpm, load);
    setEditCell({ rpm, load });
    setEditVal(val === '—' ? '' : val);
  }

  function commitEdit() {
    if (!editCell || !curve) { setEditCell(null); return; }
    const v = parseFloat(editVal);
    if (isNaN(v)) { setEditCell(null); return; }
    const updated: LoadRPMCurve = {
      ...curve,
      points: [
        ...curve.points.filter(p => !(p.rpm === editCell.rpm && p.load === editCell.load)),
        { rpm: editCell.rpm, load: editCell.load, expected: v },
      ],
    };
    const newCurves = upsertCurve(curves, updated);
    setCurves(newCurves);
    setEditCell(null);
    setSaved(false);
  }

  function handleSave() {
    if (!source.trim()) { alert('Source field is required before saving.'); return; }
    if (!curve) return;
    const withSource = curves.map(c => c.sensorId === selected ? { ...c, source } : c);
    saveCurves(withSource);
    setCurves(withSource);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    const { getDefaultCurves } = require('../services/baseline-curves');
    const defaults: LoadRPMCurve[] = getDefaultCurves();
    const reset = defaults.find(c => c.sensorId === selected);
    if (!reset) return;
    const newCurves = upsertCurve(curves, reset);
    setCurves(newCurves);
    setSaved(false);
  }

  // Current interpolated value for the running engine
  const currentInterp = snapshot && curve
    ? interpolateCurve(curve, snapshot.load, snapshot.rpm)
    : null;

  // Scatter plot data: last 60 actuals + current curve interpolated at same load/rpm
  const histKey = selected === 'ME.ExhaustTemp' ? 'exhaustTemp'
    : selected === 'ME.LubeOilPressure' ? 'lubeOilPressure'
    : selected === 'ME.ScavengeAirPressure' ? 'scavengeAir'
    : selected === 'ME.TCSpeed' ? 'tcRPM'
    : selected === 'ME.JacketCoolingOutlet' ? 'jacketOutlet'
    : selected === 'ME.SFOC' ? 'sfoc' : null;

  const actuals = histKey ? (history[histKey as keyof typeof history] as number[]).slice(-60) : [];
  const scatterData = curve ? actuals.map((val, i) => ({
    actual: val,
    baseline: currentInterp ?? null,
    i,
  })) : [];

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="page-title">BASELINE EDITOR</div>
          <div className="page-subtitle">LOAD × RPM EDITABLE CURVES · 400–1250 RPM</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleReset} className="mag-btn mag-btn-ghost" style={{ fontSize: 10 }}>Reset to Default</button>
          <input
            value={source}
            onChange={e => setSource(e.target.value)}
            placeholder="Source (required) *"
            style={{ padding: '5px 10px', fontSize: 11, minWidth: 220 }}
          />
          <button
            onClick={handleSave}
            className={`mag-btn ${saved ? 'mag-btn-solid' : 'mag-btn-ghost'}`}
            style={{ fontSize: 10 }}
          >
            {saved ? 'Saved ✓' : 'Save Version'}
          </button>
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: 0 }}>
        {/* Sensor selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {curves.map(c => (
            <button
              key={c.sensorId}
              onClick={() => setSelected(c.sensorId)}
              className={`mag-btn ${selected === c.sensorId ? 'mag-btn-active' : 'mag-btn-ghost'}`}
              style={{ fontSize: 9, padding: '5px 12px' }}
            >
              {c.displayName}
            </button>
          ))}
        </div>

        {curve && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              {/* Current engine state */}
              {snapshot && (
                <div className="glass-card" style={{ padding: '10px 16px', display: 'flex', gap: 20 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>CURRENT RPM</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-blue)' }}>{snapshot.rpm.toFixed(0)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>CURRENT LOAD</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--risk-normal)' }}>{snapshot.load.toFixed(0)}%</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>INTERPOLATED</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {currentInterp?.toFixed(2) ?? '—'} {curve.unit}
                    </div>
                  </div>
                </div>
              )}
              <div className="glass-card" style={{ padding: '10px 16px' }}>
                <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 2 }}>SOURCE</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{curve.source}</div>
                <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>Version {curve.version} · {new Date(curve.lastModified).toLocaleDateString()}</div>
              </div>
            </div>

            {/* Scatter plot */}
            {scatterData.length > 0 && (
              <div className="glass-card" style={{ padding: '12px 16px', marginBottom: 14 }}>
                <div className="label-xs" style={{ marginBottom: 8 }}>LAST 60 ACTUALS vs CURRENT BASELINE ({curve.unit})</div>
                <ResponsiveContainer width="100%" height={100}>
                  <ScatterChart margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="i" hide />
                    <YAxis domain={['auto', 'auto']} hide />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10, fontFamily: 'var(--font)' }}
                      formatter={(v: number) => [v?.toFixed(2) + ' ' + curve.unit, '']}
                    />
                    <Scatter data={scatterData} dataKey="actual" fill="var(--risk-normal)" name="Actual" />
                    {currentInterp != null && (
                      <Scatter data={[{ i: scatterData.length / 2, baseline: currentInterp }]} dataKey="baseline" fill="var(--border-hi)" name="Baseline" />
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* RPM × Load grid */}
            <div className="glass-card" style={{ overflow: 'auto' }}>
              <div style={{ padding: '12px 16px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                {curve.displayName} ({curve.unit}) — click any cell to edit
              </div>
              <div style={{ overflow: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '6px 14px', textAlign: 'left', color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.1em', borderBottom: '1px solid var(--border-dim)' }}>RPM ↓ / Load →</th>
                      {LOADS.map(l => (
                        <th key={l} style={{ padding: '6px 14px', textAlign: 'center', color: 'var(--accent-blue)', fontSize: 9, borderBottom: '1px solid var(--border-dim)' }}>{l}%</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RPMS.map(rpm => (
                      <tr key={rpm}>
                        <td style={{ padding: '6px 14px', color: 'var(--risk-normal)', fontSize: 10, fontWeight: 600, borderBottom: '1px solid rgba(11,29,46,0.5)' }}>{rpm}</td>
                        {LOADS.map(load => {
                          const isEditing = editCell?.rpm === rpm && editCell?.load === load;
                          const val = getCellValue(rpm, load);
                          return (
                            <td
                              key={load}
                              style={{
                                padding: '4px 8px', textAlign: 'center',
                                borderBottom: '1px solid rgba(11,29,46,0.5)',
                                cursor: 'pointer',
                                background: isEditing ? 'rgba(56,189,248,0.1)' : 'transparent',
                                minWidth: 70,
                              }}
                              onClick={() => !isEditing && startEdit(rpm, load)}
                            >
                              {isEditing ? (
                                <input
                                  autoFocus
                                  value={editVal}
                                  onChange={e => setEditVal(e.target.value)}
                                  onBlur={commitEdit}
                                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditCell(null); }}
                                  style={{ width: 60, textAlign: 'center', padding: '2px 4px', fontSize: 11, background: 'var(--bg-inset)', border: '1px solid var(--accent-blue)', borderRadius: 3, color: 'var(--text-primary)' }}
                                />
                              ) : (
                                <span style={{ color: val === '—' ? 'var(--text-dim)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
