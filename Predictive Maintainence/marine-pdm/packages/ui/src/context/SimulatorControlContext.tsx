import React, { createContext, useContext, useState, useCallback } from 'react';
import { engine } from './EngineContext';

export type EngineMode = 'NORMAL' | 'STRESS';

interface SimulatorControlCtx {
  rpm:      number;
  load:     number;
  coupled:  boolean;
  mode:     EngineMode;
  setRpm:   (v: number) => void;
  setLoad:  (v: number) => void;
  setCoupled: (v: boolean) => void;
  setMode:  (m: EngineMode) => void;
  applyPreset: (rpm: number, load: number) => void;
}

const Ctx = createContext<SimulatorControlCtx | null>(null);

function propellerLoad(rpm: number): number {
  return Math.round(85 * Math.pow(rpm / 1150, 3));
}

export function SimulatorControlProvider({ children }: { children: React.ReactNode }) {
  const [rpm,     setRpmState]     = useState(400);
  const [load,    setLoadState]    = useState(4);
  const [coupled, setCoupledState] = useState(true);
  const [mode,    setModeState]    = useState<EngineMode>('NORMAL');

  const setRpm = useCallback((v: number) => {
    setRpmState(v);
    engine.setRPM(v);
    setCoupledState(prev => {
      if (prev) {
        const cl = Math.max(0, Math.min(100, propellerLoad(v)));
        setLoadState(cl);
        engine.setLoad(cl);
      }
      return prev;
    });
  }, []);

  const setLoad = useCallback((v: number) => {
    setLoadState(v);
    engine.setLoad(v);
  }, []);

  const setCoupled = useCallback((v: boolean) => {
    setCoupledState(v);
  }, []);

  const setMode = useCallback((m: EngineMode) => {
    setModeState(m);
    engine.setMode(m);
    if (m === 'STRESS') {
      setRpmState(1100);  engine.setRPM(1100);
      setLoadState(74);   engine.setLoad(74);
      setCoupledState(false);
    } else {
      setRpmState(1000);  engine.setRPM(1000);
      setLoadState(56);   engine.setLoad(56);
    }
  }, []);

  const applyPreset = useCallback((r: number, l: number) => {
    setRpmState(r);  engine.setRPM(r);
    setLoadState(l); engine.setLoad(l);
    setCoupledState(false);
    setModeState('NORMAL');
    engine.setMode('NORMAL');
  }, []);

  return (
    <Ctx.Provider value={{ rpm, load, coupled, mode, setRpm, setLoad, setCoupled, setMode, applyPreset }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSimulatorControl(): SimulatorControlCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSimulatorControl must be inside SimulatorControlProvider');
  return ctx;
}
