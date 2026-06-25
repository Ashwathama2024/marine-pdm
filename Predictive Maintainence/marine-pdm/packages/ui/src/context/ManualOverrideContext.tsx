import React, { createContext, useContext, useState, useCallback } from 'react';
import type { EngineSnapshot } from '@marine-pdm/shared';

// Maps sensor field name → override value (null = use live value)
type Overrides = Partial<Record<keyof EngineSnapshot, number>>;

interface ManualOverrideCtx {
  overrides: Overrides;
  setOverride: (field: keyof EngineSnapshot, value: number) => void;
  clearOverride: (field: keyof EngineSnapshot) => void;
  clearAll: () => void;
  applyToSnapshot: (snap: EngineSnapshot) => EngineSnapshot;
  hasAny: boolean;
}

const Ctx = createContext<ManualOverrideCtx | null>(null);

export function ManualOverrideProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Overrides>({});

  const setOverride = useCallback((field: keyof EngineSnapshot, value: number) => {
    setOverrides(prev => ({ ...prev, [field]: value }));
  }, []);

  const clearOverride = useCallback((field: keyof EngineSnapshot) => {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setOverrides({}), []);

  const applyToSnapshot = useCallback((snap: EngineSnapshot): EngineSnapshot => {
    if (Object.keys(overrides).length === 0) return snap;
    return { ...snap, ...overrides } as EngineSnapshot;
  }, [overrides]);

  const hasAny = Object.keys(overrides).length > 0;

  return (
    <Ctx.Provider value={{ overrides, setOverride, clearOverride, clearAll, applyToSnapshot, hasAny }}>
      {children}
    </Ctx.Provider>
  );
}

export function useManualOverride(): ManualOverrideCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useManualOverride must be inside ManualOverrideProvider');
  return ctx;
}
