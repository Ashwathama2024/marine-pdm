import type { BaselineCurve } from '@marine-pdm/shared';
import { evaluate, parse } from 'mathjs';

export interface EvalContext {
  load: number;
  rpm: number;
  coolingEff?: number;
  [key: string]: number | undefined;
}

function validateEquation(equation: string, sampleContext: EvalContext): void {
  try {
    parse(equation);
    const scope: Record<string, number> = {
      load: sampleContext.load,
      rpm: sampleContext.rpm,
      coolingEff: sampleContext.coolingEff ?? 1.0,
    };
    const result = evaluate(equation, scope);
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error(`Equation produces non-finite result: ${result}`);
    }
  } catch (e) {
    throw new Error(`Invalid equation '${equation}': ${(e as Error).message}`);
  }
}

export class BaselineStore {
  // Map: sensorId → list of curves (newest last); only one is_active at a time
  private curves = new Map<string, BaselineCurve[]>();

  addCurve(curve: BaselineCurve): void {
    if (!curve.source || curve.source.trim() === '') {
      throw new Error(`Baseline source is mandatory for sensor '${curve.sensorId}'`);
    }

    validateEquation(curve.equation, { load: 65, rpm: 720, coolingEff: 1.0 });

    const existing = this.curves.get(curve.sensorId) ?? [];

    // Deactivate all previous curves
    const updated = existing.map(c => ({ ...c, isActive: false }));
    updated.push({ ...curve, isActive: true });
    this.curves.set(curve.sensorId, updated);
  }

  getExpected(sensorId: string, context: EvalContext): number | null {
    const curveList = this.curves.get(sensorId);
    const active = curveList?.find(c => c.isActive);
    if (!active) return null;

    const { load, rpm, coolingEff = 1.0 } = context;

    // Bounds check
    if (load < active.validLoadMin || load > active.validLoadMax) return null;

    try {
      const scope: Record<string, number> = { load, rpm, coolingEff };
      const result = evaluate(active.equation, scope);
      if (typeof result !== 'number' || !isFinite(result)) return null;
      return result;
    } catch {
      return null;
    }
  }

  updateCoefficients(
    sensorId: string,
    newCoeffs: Record<string, number>,
    newEquation: string,
    source: string,
  ): void {
    if (!source || source.trim() === '') {
      throw new Error(`Source is mandatory when updating baseline for '${sensorId}'`);
    }
    const existing = this.curves.get(sensorId);
    if (!existing || existing.length === 0) {
      throw new Error(`No existing baseline for sensor '${sensorId}'`);
    }
    const current = existing.find(c => c.isActive);
    if (!current) throw new Error(`No active baseline for sensor '${sensorId}'`);

    this.addCurve({
      ...current,
      coefficients: newCoeffs,
      equation: newEquation,
      source,
      addedDate: new Date().toISOString(),
      isActive: true,
    });
  }

  getCurveHistory(sensorId: string): BaselineCurve[] {
    return [...(this.curves.get(sensorId) ?? [])];
  }

  getActiveCurve(sensorId: string): BaselineCurve | null {
    return this.curves.get(sensorId)?.find(c => c.isActive) ?? null;
  }

  hasCurve(sensorId: string): boolean {
    return (this.curves.get(sensorId) ?? []).some(c => c.isActive);
  }

  getSensorIds(): string[] {
    return [...this.curves.keys()];
  }
}
