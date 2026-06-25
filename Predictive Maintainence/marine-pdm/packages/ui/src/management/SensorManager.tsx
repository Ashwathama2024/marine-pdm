import React, { useState } from 'react';
import type { SensorDefinition } from '@marine-pdm/shared';
import type { SensorRegistry } from '@marine-pdm/knowledge';

function statusColor(status: string): string {
  if (status === 'ACTIVE') return 'var(--risk-normal)';
  if (status === 'OBSERVATION') return 'var(--risk-obs)';
  if (status === 'DISABLED') return 'var(--text-muted)';
  return 'var(--risk-warning)';
}

interface Props {
  sensors: SensorDefinition[];
  registry: SensorRegistry;
  onActivate: (id: string) => void;
  onRefresh: () => void;
}

const EMPTY_FORM = {
  id: '', displayName: '', unit: '', minPhysical: '', maxPhysical: '',
  alarmHigh: '', alarmLow: '', observationDaysRequired: '30', addedBy: 'engineer',
};

export function SensorManager({ sensors, registry, onActivate, onRefresh }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      registry.addSensor({
        id: form.id,
        displayName: form.displayName,
        unit: form.unit,
        minPhysical: parseFloat(form.minPhysical),
        maxPhysical: parseFloat(form.maxPhysical),
        alarmHigh: form.alarmHigh ? parseFloat(form.alarmHigh) : undefined,
        alarmLow: form.alarmLow ? parseFloat(form.alarmLow) : undefined,
        observationDaysRequired: parseInt(form.observationDaysRequired, 10),
        addedBy: form.addedBy,
        addedDate: new Date().toISOString(),
      });
      setForm(EMPTY_FORM);
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const field = (key: keyof typeof EMPTY_FORM, label: string, placeholder = '') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</label>
      <input
        value={form[key]}
        placeholder={placeholder}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{ padding: '5px 8px', fontSize: 12 }}
      />
    </div>
  );

  return (
    <div>
      {/* Add sensor form */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
          Add New Sensor
        </div>
        <form onSubmit={handleAdd} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {field('id', 'Tag ID', 'ME.Cyl1.ExhaustTemp')}
          {field('displayName', 'Display Name', 'Cylinder 1 Exhaust')}
          {field('unit', 'Unit', '°C')}
          {field('minPhysical', 'Min Physical', '240')}
          {field('maxPhysical', 'Max Physical', '480')}
          {field('alarmHigh', 'Alarm High (opt)', '430')}
          {field('alarmLow', 'Alarm Low (opt)', '')}
          {field('observationDaysRequired', 'Obs Days', '30')}
          {field('addedBy', 'Added By', 'engineer')}
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 600,
              background: 'var(--risk-normal)', color: '#000',
              border: 'none', borderRadius: 4, width: '100%',
            }}>
              Add Sensor
            </button>
          </div>
        </form>
        {error && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--risk-critical)' }}>{error}</div>}
      </div>

      {/* Sensor list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sensors.map(s => {
          const obs = s.status === 'OBSERVATION'
            ? (() => {
                const start = s.observationStartDate ? new Date(s.observationStartDate) : new Date();
                const days = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
                return { days, required: s.observationDaysRequired };
              })()
            : null;

          return (
            <div key={s.id} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '10px 12px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{s.displayName}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.id} · {s.unit} · [{s.minPhysical}–{s.maxPhysical}]</div>
                {obs && (
                  <div style={{ fontSize: 10, color: 'var(--risk-obs)', marginTop: 2 }}>
                    Observation: {obs.days}/{obs.required} days
                    {obs.days < obs.required && ` (${obs.required - obs.days} remaining)`}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: statusColor(s.status) }}>
                  {s.status}
                </span>
                {s.status === 'OBSERVATION' && (
                  <button
                    onClick={() => { try { onActivate(s.id); } catch (e) { alert((e as Error).message); } }}
                    disabled
                    title="Requires 30-day observation + baseline"
                    style={{
                      fontSize: 10, padding: '3px 8px',
                      background: 'transparent', color: 'var(--text-muted)',
                      border: '1px solid var(--border)', borderRadius: 3, cursor: 'not-allowed',
                    }}
                  >
                    Activate (waiting)
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
