// packages/simulator/src/interlocks.ts
// MTU 8000 8-interlock pre-start safety system.

export interface InterlockValues {
  il1_externalClear: boolean;   // PLANT READY toggle
  il2_airFlapsOpen: boolean;    // AIR FLAPS OPEN toggle
  il3_lubeLevel: number;        // 0–100 % — slider
  il4_coolantLevel: boolean;    // coolant level OK toggle
  il5_startAirBar: number;      // 0–30 bar — slider
  il6_coolantTemp: number;      // °C — set by preheater
  il7_primingSeconds: number;   // auto-increments when priming active
  il8_fuelReady: boolean;       // fuel system ready toggle
}

export interface InterlockStatusItem {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export class InterlockSystem {
  values: InterlockValues = {
    il1_externalClear: false,
    il2_airFlapsOpen: false,
    il3_lubeLevel: 0,
    il4_coolantLevel: false,
    il5_startAirBar: 0,
    il6_coolantTemp: 20,
    il7_primingSeconds: 0,
    il8_fuelReady: false,
  };

  private _primingActive = false;
  private _preheaterOn = false;

  get primingActive(): boolean { return this._primingActive; }
  get preheaterOn(): boolean   { return this._preheaterOn; }

  // ── Individual interlock checks ──────────────────────────────────────────────
  get il1(): boolean { return this.values.il1_externalClear; }
  get il2(): boolean { return this.values.il2_airFlapsOpen; }
  get il3(): boolean { return this.values.il3_lubeLevel > 20; }
  get il4(): boolean { return this.values.il4_coolantLevel; }
  get il5(): boolean { return this.values.il5_startAirBar >= 14 && this.values.il5_startAirBar <= 30; }
  get il6(): boolean { return this.values.il6_coolantTemp >= 40; }  // min preheat to start (MTU high-speed diesel practice)
  get il7(): boolean { return this.values.il7_primingSeconds >= 180; }
  get il8(): boolean { return this.values.il8_fuelReady; }

  allSatisfied(): boolean {
    return this.il1 && this.il2 && this.il3 && this.il4
        && this.il5 && this.il6 && this.il7 && this.il8;
  }

  getStatus(): InterlockStatusItem[] {
    return [
      { id: 'IL-1', label: 'Plant Ready',        ok: this.il1, detail: this.values.il1_externalClear ? 'CLEAR' : 'NOT CLEAR' },
      { id: 'IL-2', label: 'Air Flaps',           ok: this.il2, detail: this.values.il2_airFlapsOpen  ? 'OPEN'  : 'CLOSED' },
      { id: 'IL-3', label: 'Lube Oil Level',      ok: this.il3, detail: `${this.values.il3_lubeLevel.toFixed(0)} %` },
      { id: 'IL-4', label: 'Coolant Level',       ok: this.il4, detail: this.values.il4_coolantLevel  ? 'OK'    : 'LOW' },
      { id: 'IL-5', label: 'Start Air Pressure',  ok: this.il5, detail: `${this.values.il5_startAirBar.toFixed(1)} bar` },
      { id: 'IL-6', label: 'Coolant Temp (Pre-heat)', ok: this.il6, detail: `${this.values.il6_coolantTemp.toFixed(1)} °C` },
      { id: 'IL-7', label: 'Oil Priming',         ok: this.il7, detail: `${Math.floor(this.values.il7_primingSeconds)} / 180 s` },
      { id: 'IL-8', label: 'Fuel System',         ok: this.il8, detail: this.values.il8_fuelReady     ? 'READY' : 'NOT READY' },
    ];
  }

  // ── Actuator controls (UI calls these) ──────────────────────────────────────
  setPrimingActive(on: boolean): void  { this._primingActive = on; }
  setPreheaterOn(on: boolean): void    { this._preheaterOn = on; }

  setToggle(key: 'il1_externalClear' | 'il2_airFlapsOpen' | 'il4_coolantLevel' | 'il8_fuelReady', value: boolean): void {
    this.values[key] = value;
  }

  setLubeLevel(pct: number): void     { this.values.il3_lubeLevel  = Math.max(0, Math.min(100, pct)); }
  setStartAir(bar: number): void       { this.values.il5_startAirBar = Math.max(0, Math.min(30, bar)); }
  setCoolantTemp(degC: number): void   { this.values.il6_coolantTemp = degC; }

  // ── Per-tick advance (called by engine tick) ─────────────────────────────────
  advanceTick(elapsedS: number): void {
    // IL-7: priming counter advances while priming pump is active
    if (this._primingActive) {
      this.values.il7_primingSeconds = Math.min(300, this.values.il7_primingSeconds + elapsedS);
    }
    // IL-6: preheater slowly raises coolant toward 45 °C start setpoint (tau ≈ 600 s)
    if (this._preheaterOn) {
      const target = 45;
      this.values.il6_coolantTemp += (1 / 600) * (target - this.values.il6_coolantTemp) * elapsedS;
    }
  }
}
