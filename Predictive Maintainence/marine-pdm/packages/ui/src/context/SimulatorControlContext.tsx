import React, { createContext, useContext, useState, useCallback } from 'react';
import { engine } from './EngineContext';

export type EngineMode = 'NORMAL' | 'STRESS';

// Speed-lever only console. Load is NOT operator-set — it follows the propeller cube-law from RPM
// once the clutch is engaged (declutched → 0). The engine owns that ratio internally; there is no
// load UI. `rpm` here mirrors the operator's speed-lever setpoint; live load is read from the snapshot.
interface SimulatorControlCtx {
  rpm:         number;
  mode:        EngineMode;
  setRpm:      (v: number) => void;
  setMode:     (m: EngineMode) => void;
  applyPreset: (rpm: number) => void;
}

const Ctx = createContext<SimulatorControlCtx | null>(null);

export function SimulatorControlProvider({ children }: { children: React.ReactNode }) {
  const [rpm,  setRpmState]  = useState(400);
  const [mode, setModeState] = useState<EngineMode>('NORMAL');

  const setRpm = useCallback((v: number) => {
    setRpmState(v);
    engine.setRPM(v);   // engine derives load from RPM via the propeller law when clutched
  }, []);

  const setMode = useCallback((m: EngineMode) => {
    setModeState(m);
    engine.setMode(m);
    if (m === 'STRESS') {
      setRpmState(1100); engine.setRPM(1100);   // load follows (~74% once clutched)
    } else {
      setRpmState(1000); engine.setRPM(1000);
    }
  }, []);

  const applyPreset = useCallback((r: number) => {
    setRpmState(r); engine.setRPM(r);
    setModeState('NORMAL');
    engine.setMode('NORMAL');
  }, []);

  return (
    <Ctx.Provider value={{ rpm, mode, setRpm, setMode, applyPreset }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSimulatorControl(): SimulatorControlCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSimulatorControl must be inside SimulatorControlProvider');
  return ctx;
}
