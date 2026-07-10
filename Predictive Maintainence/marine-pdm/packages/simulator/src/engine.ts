// packages/simulator/src/engine.ts
// SimulatorEngine — MTU 8000 M71/M71L physics engine with 11-state lifecycle.

import { TICK_MS, addNoise, applyLag } from '@marine-pdm/shared';
import type { EngineSnapshot, IDataSource } from '@marine-pdm/shared';
import { makeInitialPhysicsState, tickPhysics, snapshotFromState } from './physics';
import { createFault, tickFaults, removeFault } from './faults';
import { tickFaultsMTU8000, createFaultConfig } from './faults-mtu8000';
import type { PhysicsState } from './physics';
import type { ActiveFault, FaultType } from './faults';
import type { FaultConfig } from './faults-mtu8000';
import { EngineStateMachine } from './engine-state-machine';
import type { EngineState } from './engine-state-machine';
import { InterlockSystem } from './interlocks';
import { StartSequence } from './start-sequence';
import {
  makeInitialStartState,
  advanceStartState,
  startStateToSnapshot,
  exhaustTemp_noLoad,
  clutchRpmDip,
} from './mtu8000-start-physics';
import type { StartPhysicsState } from './mtu8000-start-physics';
import { cylExhaustTemp_MTU8000, sfoc_MTU8000 } from './mtu8000-physics';
import { CYLINDER_COUNT } from '@marine-pdm/shared';

export type SimMode = 'NORMAL' | 'STRESS' | 'FAULT';

const EXHAUST_LAG_ALPHA = 0.04;  // idle no-load exhaust response (slower than loaded 0.08)
const GOV_RPM_IDLE      = 400;   // MTU 8000 M71 governed idle — 400 RPM, clutch neutral, no load
const GOV_RPM_RATED     = 1150;
const GOV_RPM_STEP      = 15;    // per SPEED INC/DEC button press
const STOPPING_RPM_RATE = 8;     // RPM/s linear coast-down
const PROP_LOAD_RATED   = 85;    // % MCR a clean fixed-pitch propeller absorbs at rated RPM (light-running margin)

// Fixed-pitch propeller law: absorbed power ∝ N³ (cube law). Anchored so rated 1150 RPM → 85 % load (CSR).
// Load is therefore a CONSEQUENCE of RPM once the clutch is engaged — never set independently.
function propellerLoad(rpm: number): number {
  const ld = PROP_LOAD_RATED * Math.pow(rpm / GOV_RPM_RATED, 3);
  return Math.max(0, Math.min(100, ld));
}

// No-load idle steady-state cylinder temps (used to seed lag state on entry to IDLE,
// so the live no-load baselines see zero deviation instead of a warm-up false alarm).
function noLoadCylTemps(rpm: number): number[] {
  const mean = exhaustTemp_noLoad(rpm);
  return Array.from({ length: CYLINDER_COUNT }, (_, i) => cylExhaustTemp_MTU8000(mean, i, {}));
}

export class SimulatorEngine implements IDataSource {
  // ── Physics / fault state ─────────────────────────────────────────────────────
  private state: PhysicsState;
  private faults: ActiveFault[] = [];
  private mtuFaults: FaultConfig[] = [];
  private mode: SimMode = 'NORMAL';
  private latest: EngineSnapshot | null = null;
  private subscribers: ((snap: EngineSnapshot) => void)[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private lastTickMs = Date.now();

  // ── Start sequence subsystems ─────────────────────────────────────────────────
  readonly stateMachine: EngineStateMachine;
  readonly interlocks:   InterlockSystem;
  readonly startSeq:     StartSequence;
  private startState: StartPhysicsState;
  private _govRpm:            number;   // operator governor setpoint (IDLE–RATED)
  private _stoppingRpm:       number;   // coast-down tracker
  private _autoClutchPending: boolean = false; // set by engageClutch() from IDLE/WARMING

  constructor(initialRpm = 400, initialLoad = 4) {
    this.state      = makeInitialPhysicsState(initialRpm, initialLoad);
    this.stateMachine = new EngineStateMachine();
    this.interlocks   = new InterlockSystem();
    this.startSeq     = new StartSequence(25);
    this.startState   = makeInitialStartState();
    this._govRpm      = GOV_RPM_IDLE;
    this._stoppingRpm = 0;
  }

  // ── State machine public API ──────────────────────────────────────────────────

  getEngineState(): EngineState { return this.stateMachine.current; }

  /** ENGINE_OFF → STANDBY */
  readyForOperation(): boolean {
    this._autoClutchPending = false;  // never clutch in on start sequence
    return this.stateMachine.transition('STANDBY');
  }

  /** STANDBY → SAFETY_TURNING (requires all 8 interlocks satisfied) */
  startEngine(): boolean {
    this._autoClutchPending = false;  // never clutch in on start sequence
    if (!this.interlocks.allSatisfied()) return false;
    return this.stateMachine.transition('SAFETY_TURNING');
  }

  /** IDLE → WARMING */
  beginWarming(): boolean {
    return this.stateMachine.transition('WARMING');
  }

  /** WARMING → DECLUTCHED_RUN */
  advanceToDeclutched(): boolean {
    return this.stateMachine.transition('DECLUTCHED_RUN');
  }

  /** DECLUTCHED_RUN → CLUTCHING */
  clutchAhead(): boolean {
    return this.stateMachine.transition('CLUTCHING');
  }

  /** CLUTCHED or LOADED → DECLUTCHED_RUN */
  clutchNeutral(): boolean {
    const ph = this.stateMachine.current;
    if (ph === 'CLUTCHED' || ph === 'LOADED') {
      return this.stateMachine.transition('DECLUTCHED_RUN');
    }
    return false;
  }

  /** Transition to STOPPING from any running state */
  stopEngine(): boolean {
    if (!this.stateMachine.canTransition('STOPPING')) return false;
    this._stoppingRpm = this.state.rpm;
    return this.stateMachine.transition('STOPPING');
  }

  /** Operator speed governor (WARMING/DECLUTCHED phases) */
  speedIncrease(amount = GOV_RPM_STEP): void {
    this._govRpm = Math.min(GOV_RPM_RATED, this._govRpm + amount);
  }

  speedDecrease(amount = GOV_RPM_STEP): void {
    this._govRpm = Math.max(GOV_RPM_IDLE, this._govRpm - amount);
  }

  /** Synchronise start-air bottle with interlock IL-5 */
  setStartAir(bar: number): void {
    this.startSeq.startAirBar = bar;
    this.interlocks.setStartAir(bar);
  }

  /** One-button start: ENGINE_OFF → STANDBY → SAFETY_TURNING (combines readyForOp + start) */
  initStart(): boolean {
    this._autoClutchPending = false;  // engine on start shall never clutch in on itself
    if (this.stateMachine.current === 'ENGINE_OFF') {
      this.readyForOperation(); // ENGINE_OFF → STANDBY
    }
    if (this.stateMachine.current === 'STANDBY') {
      return this.startEngine(); // STANDBY → SAFETY_TURNING (requires interlocks)
    }
    return false;
  }

  /** Engage clutch at current governor RPM — no auto-ramp.
   *  RPM increases only when operator moves the speed lever. */
  engageClutch(): boolean {
    const st = this.stateMachine.current;
    this._autoClutchPending = false;
    if (st === 'IDLE' || st === 'WARMING') {
      // Bypass DECLUTCHED_RUN — engage directly at current idle speed
      this.stateMachine.forceTransition('CLUTCHING');
      return true;
    }
    if (st === 'DECLUTCHED_RUN') {
      return this.stateMachine.transition('CLUTCHING');
    }
    return false;
  }

  /** Bypass turning/cranking for demo — lands at IDLE (400 RPM, declutched, no load).
   *  Operator still uses CLUTCH button + RPM lever to proceed. */
  quickStart(): void {
    // Satisfy all interlocks
    this.interlocks.setToggle('il1_externalClear', true);
    this.interlocks.setToggle('il2_airFlapsOpen',  true);
    this.interlocks.setLubeLevel(80);
    this.interlocks.setToggle('il4_coolantLevel', true);
    this.interlocks.setStartAir(25);
    this.interlocks.setCoolantTemp(45);
    this.interlocks.values.il7_primingSeconds = 200;
    this.interlocks.setToggle('il8_fuelReady', true);

    // Seed physics at idle steady-state (post-warmup, declutched, no load).
    // Exhaust/cyls seeded on the NO-LOAD curve so the live no-load baselines read zero
    // deviation on the first tick instead of a warm-up false alarm.
    this.state = {
      ...makeInitialPhysicsState(400, 0),
      lagExhaust:          exhaustTemp_noLoad(GOV_RPM_IDLE),
      lagCyls:             noLoadCylTemps(GOV_RPM_IDLE),
      lagCoolantTemp:      52,   // jacket water warmed at idle (thermostat closed)
    };
    this._govRpm = GOV_RPM_IDLE;
    this._stoppingRpm = 0;
    this._autoClutchPending = false;

    // Jump to IDLE — clutch and speed are operator-controlled from here
    this.stateMachine.forceTransition('IDLE');
  }

  // ── Existing controls (preserved for EngineControlPanel / SimulatorControl) ───

  setRPM(rpm: number): void {
    this._govRpm = Math.max(GOV_RPM_IDLE, Math.min(GOV_RPM_RATED, rpm));
    this.state   = { ...this.state, rpm: Math.max(400, Math.min(1150, rpm)) };
  }

  /** @deprecated Load is no longer set independently — it follows the propeller cube-law from RPM
   *  once the clutch is engaged (see applyPhaseSetpoints). Kept as a no-op for API compatibility. */
  setLoad(_load: number): void { /* load is derived from RPM via propellerLoad() */ }

  setMode(mode: SimMode): void {
    this.mode = mode;
    if (mode === 'STRESS') {
      // High-speed stress point: 1100 RPM. Load follows the propeller law (~74 %) once clutched.
      this._govRpm = 1100;
      this.state   = { ...this.state, rpm: 1100 };
    }
  }

  injectFault(type: FaultType, cylIndex?: number, initialSeverity = 0.05): void {
    this.faults = removeFault(this.faults, type, cylIndex);
    this.faults.push(createFault(type, cylIndex, initialSeverity));
  }

  clearFault(type: FaultType, cylIndex?: number): void {
    this.faults = removeFault(this.faults, type, cylIndex);
    const remaining = this.faults.filter(f => f.type === type);
    if (remaining.length === 0) {
      if (type === 'lube')    this.state = { ...this.state, lubeFault: 0 };
      if (type === 'cooling') this.state = { ...this.state, coolingEff: 1.0 };
      if (type === 'injector' && cylIndex !== undefined) {
        const injFaults = { ...this.state.injFaults };
        delete injFaults[cylIndex];
        this.state = { ...this.state, injFaults };
      }
    }
  }

  clearAllFaults(): void {
    this.faults    = [];
    this.mtuFaults = [];
    this.state     = {
      ...this.state,
      lubeFault: 0, coolingEff: 1.0, pistonBlowby: 0,
      injFaults: {}, tcEffs: [1.0, 1.0, 1.0, 1.0], bearingFaults: {},
    };
  }

  injectMTUFault(config: FaultConfig): void {
    this.mtuFaults = this.mtuFaults.filter(f => f.id !== config.id);
    this.mtuFaults.push({ ...config, active: true, startedAt: Date.now() });
  }

  clearMTUFault(faultId: string): void {
    this.mtuFaults = this.mtuFaults.filter(f => f.id !== faultId);
    if (this.mtuFaults.length === 0) {
      this.state = {
        ...this.state,
        lubeFault: 0, coolingEff: 1.0, pistonBlowby: 0,
        injFaults: {}, tcEffs: [1.0, 1.0, 1.0, 1.0], bearingFaults: {},
      };
    }
  }

  clearAllMTUFaults(): void {
    this.mtuFaults = [];
    this.state     = {
      ...this.state,
      lubeFault: 0, coolingEff: 1.0, pistonBlowby: 0,
      injFaults: {}, tcEffs: [1.0, 1.0, 1.0, 1.0], bearingFaults: {},
    };
  }

  getMTUFaultList(): FaultConfig[] { return [...this.mtuFaults]; }

  /** Live independent root-factor values (the degradation X-vector for regression).
   *  Each is the actual PhysicsState excursion driving the dependent sensors. */
  getRootFactors(): {
    injFaultMax: number; coolingEffDrop: number; tcEffDrop: number;
    lubeFault: number; bearingFaultMax: number; pistonBlowby: number;
  } {
    const inj = Object.values(this.state.injFaults);
    const brg = Object.values(this.state.bearingFaults);
    return {
      injFaultMax:     inj.length ? Math.max(...inj) : 0,
      coolingEffDrop:  1 - this.state.coolingEff,
      tcEffDrop:       1 - Math.min(...this.state.tcEffs),
      lubeFault:       this.state.lubeFault,
      bearingFaultMax: brg.length ? Math.max(...brg) : 0,
      pistonBlowby:    this.state.pistonBlowby,
    };
  }

  subscribe(cb: (snap: EngineSnapshot) => void): void {
    this.subscribers.push(cb);
    if (this.intervalId === null) {
      this.intervalId = setInterval(() => this.tick(), TICK_MS);
    }
  }

  unsubscribe(): void {
    this.subscribers = [];
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getLatest(): EngineSnapshot | null { return this.latest; }
  getFaultList(): ActiveFault[]       { return [...this.faults]; }

  // ── Tick ──────────────────────────────────────────────────────────────────────
  private tick(): void {
    this.tickCount++;
    const nowMs    = Date.now();
    const elapsedS = Math.min((nowMs - this.lastTickMs) / 1000, 5);
    this.lastTickMs = nowMs;

    // Advance interlock timers (priming pump + preheater) every tick
    this.interlocks.advanceTick(elapsedS);

    const snap = this.stateMachine.isPreOperational
      ? this.tickPreOp(this.stateMachine.current, elapsedS, nowMs)
      : this.tickOperational(this.stateMachine.current, elapsedS, nowMs);

    this.latest = snap;
    for (const cb of this.subscribers) cb(snap);
  }

  // ── Pre-operational tick (ENGINE_OFF → CRANKING) ──────────────────────────────
  private tickPreOp(phase: string, elapsedS: number, nowMs: number): EngineSnapshot {
    // Advance start-phase physics
    this.startState = advanceStartState(
      this.startState, phase, elapsedS,
      this.interlocks.values.il6_coolantTemp,
      this.interlocks.primingActive,
    );

    // Keep IL-6 (coolant >20°C) in sync with preheater physics — no manual toggle needed
    this.interlocks.setCoolantTemp(this.startState.coolantTemp);

    // Auto-transitions (TURNING→CRANKING, CRANKING→IDLE, failed starts)
    const result = this.startSeq.tick(this.stateMachine, this.startState, elapsedS);

    // CRANKING fired → IDLE: initialise lag physics and produce first IDLE snapshot
    if (result === 'TO_IDLE') {
      this.initPhysicsForIdle();
      return this.tickOperational('IDLE', elapsedS, nowMs);
    }

    return startStateToSnapshot(this.startState, nowMs);
  }

  // Seed lag physics from start-state so there's no discontinuity on CRANKING→IDLE.
  private initPhysicsForIdle(): void {
    const s = this.startState;
    this._govRpm = GOV_RPM_IDLE;
    // Seed exhaust/cyls at the no-load idle steady-state (not the low cranking value) so the
    // live no-load baselines see ~zero deviation — avoids a post-crank warm-up false alarm.
    this.state = {
      ...this.state,
      rpm:                    Math.max(200, s.rpm),
      load:                   0,
      lagExhaust:             exhaustTemp_noLoad(GOV_RPM_IDLE),
      lagLube:                s.lubePress,
      lagCyls:                noLoadCylTemps(GOV_RPM_IDLE),
      lagTcSpeeds:            [...s.tcSpeeds],
      lagBearingTemps:        [...s.bearingTemps],
      lagCoolantTemp:         s.coolantTemp,
      lagLubeOilTemp:         s.coolantTemp + 2,
      lagLubeAfterFilter:     Math.max(0, s.lubePress - 0.1),
      lagLubeLastBearing:     s.lubePress * 0.35,
      lagPistonCoolingPress:  s.lubePress * 0.6,
      lagFuelRailPressure:    s.fuelRailPress,
      lagFuelTemp:            25,
      // Idle no-load SFOC (rpm penalty dominates: (1150-400)*0.08=60 on top of the
      // (100-0)*0.333=33.3 load penalty) — was hardcoded 0, which the 0.03 lag alpha then took
      // 100+ ticks to climb away from, tripping a spurious 30-tick "Sustained High SFOC" alert
      // on every engine start regardless of what the operator did afterward.
      lagSfoc:                sfoc_MTU8000(0, GOV_RPM_IDLE, {}, 1.0),
      lagChargeAirTemp:       25,
      lagChargeAirPress:      1.013,
      lagCrankcasePressure:   -0.5,
      lagExhaustBackP:        0,
      lagCoolantPressure:     0.4,
    };
  }

  // ── Operational tick (IDLE → LOADED, STOPPING) ────────────────────────────────
  private tickOperational(phase: string, elapsedS: number, nowMs: number): EngineSnapshot {
    // 1. Update RPM / load setpoints from state machine
    this.applyPhaseSetpoints(phase, elapsedS);

    // 2. Advance faults — only when actually running under load
    if (phase === 'CLUTCHED' || phase === 'LOADED') {
      if (this.faults.length > 0) {
        const { faults, updatedState } = tickFaults(this.faults, this.state);
        this.faults  = faults;
        this.state   = updatedState;
      }
      if (this.mtuFaults.length > 0) {
        const { faults, updatedState } = tickFaultsMTU8000(this.mtuFaults, this.state, elapsedS);
        this.mtuFaults = faults;
        this.state     = updatedState;
      }
    }

    // 3. Save exhaust lag value before tickPhysics overwrites it
    const lagExhBefore = this.state.lagExhaust;

    // 4. Advance all sensor lags
    this.state = tickPhysics(this.state);

    // 5. For no-load phases the exhaust follows a different curve than the loaded
    //    formula in tickPhysics. Patch lagExhaust toward the no-load target.
    const isNoLoad = phase === 'IDLE' || phase === 'WARMING'
                  || phase === 'DECLUTCHED_RUN' || phase === 'CLUTCHING';
    if (isNoLoad) {
      const noLoadTarget = exhaustTemp_noLoad(this.state.rpm, this.state.coolingEff);
      this.state = {
        ...this.state,
        lagExhaust: applyLag(lagExhBefore, noLoadTarget, EXHAUST_LAG_ALPHA),
      };
    }

    // 6. Mirror current RPM into startState so StartSequence can read it
    this.startState = { ...this.startState, rpm: this.state.rpm };

    // 7. Auto-transitions (STOPPING coast-down, CLUTCHING completion)
    this.startSeq.tick(this.stateMachine, this.startState, elapsedS);

    // 8. Build and return snapshot
    return this.buildOperationalSnapshot(nowMs);
  }

  private applyPhaseSetpoints(phase: string, elapsedS: number): void {
    switch (phase) {
      case 'IDLE': {
        // Governor brings cranking speed up to the operator setpoint (idle default 400). The speed
        // lever is live from the moment the engine is running — load stays 0 (clutch out).
        const next = applyLag(this.state.rpm, this._govRpm, 0.15);
        this.state = { ...this.state, rpm: next, load: 0 };
        // Operator revved above idle while declutched → enter the warm-up/run-up phase.
        if (this._govRpm > GOV_RPM_IDLE) this.stateMachine.transition('WARMING');
        break;
      }
      case 'WARMING': {
        // Declutched run-up — RPM chases the speed-lever setpoint, load stays 0.
        const next = applyLag(this.state.rpm, this._govRpm, 0.12);
        this.state = { ...this.state, rpm: next, load: 0 };
        // Once RPM has settled at the setpoint, hold as steady declutched running.
        if (next >= this._govRpm - 15) this.stateMachine.transition('DECLUTCHED_RUN');
        break;
      }
      case 'DECLUTCHED_RUN': {
        // Steady declutched running — speed lever controls RPM directly, no propeller load.
        this.state = { ...this.state, rpm: this._govRpm, load: 0 };
        break;
      }
      case 'CLUTCHING': {
        // Brief RPM dip centred at current governor RPM during engagement
        const dipped = clutchRpmDip(this.stateMachine.elapsed_s, this._govRpm);
        this.state = { ...this.state, rpm: dipped, load: 0 };
        break;
      }
      case 'CLUTCHED': {
        // Clutch engaged — propeller now absorbs power per the cube law; load follows RPM.
        this.state = { ...this.state, rpm: this._govRpm, load: propellerLoad(this._govRpm) };
        if (this.state.load > 0) this.stateMachine.transition('LOADED');
        break;
      }
      case 'LOADED': {
        // Normal driving — RPM from the speed lever, load = propeller cube-law(RPM).
        this.state = { ...this.state, rpm: this._govRpm, load: propellerLoad(this._govRpm) };
        break;
      }
      case 'STOPPING': {
        // Linear coast-down from entry RPM to 0
        this._autoClutchPending = false;
        this._stoppingRpm = Math.max(0, this._stoppingRpm - STOPPING_RPM_RATE * elapsedS);
        this.state = { ...this.state, rpm: this._stoppingRpm, load: 0 };
        break;
      }
    }
  }

  private buildOperationalSnapshot(nowMs: number): EngineSnapshot {
    const phys = snapshotFromState(this.state);
    const rpmRedundant = this.state.rpm + addNoise(0, 5);

    return {
      timestamp: nowMs,
      rpm:  this.state.rpm,
      load: this.state.load,

      // Core (EngineSnapshot-compatible)
      exhaustTemp:       phys.exhaustTemp,
      lubeOilPressure:   phys.lubeOilPressure,
      fuelRack:          0,
      scavengeAir:       phys.chargeAirPressure,
      tcRPM:             phys.tcSpeeds[0] ?? 0,
      jacketOutlet:      phys.coolantTempAfterEngine,
      sfoc:              phys.sfoc,
      cylTemps:          phys.cylTemps,
      coolingEff:        phys.coolingEff,
      chargeAirTemp:     phys.chargeAirTemp,
      fuelOilPressure:   6.0 + (this.state.load / 100) * 1.8 + addNoise(0, 0.08),
      fuelOilTemp:       phys.fuelTemp,
      loFilterDP:        phys.filterDifferentialP,
      pistonCoolingPress: phys.pistonCoolingPress,
      shaftPower:        (this.state.load / 100) * 9100,

      // MTU 8000 v2.0 extended fields
      exhaustMeanTemp:              phys.exhaustTemp,
      exhaustBackPressure:          phys.exhaustBackPressure,
      lubeOilPressureBeforeFilter:  phys.lubeOilPressure,
      lubeOilPressureAfterFilter:   phys.lubeOilPressureAfterFilter,
      lubeOilPressurePistonCooling: phys.pistonCoolingPress,
      lubeLastBearingPressure:      phys.lubeLastBearingPressure,
      lubeOilTemp:                  phys.lubeOilTemp,
      bearingTemps:                 phys.bearingTemps,
      coolantTempAfterEngine:       phys.coolantTempAfterEngine,
      coolantPressure:              phys.coolantPressure,
      chargeAirPressure:            phys.chargeAirPressure,
      tcSpeeds:                     phys.tcSpeeds,
      fuelRailPressure:             phys.fuelRailPressure,
      fuelTemp:                     phys.fuelTemp,
      crankcasePressure:            phys.crankcasePressure,
      rpmPrimary:                   this.state.rpm,
      rpmRedundant,
      aSideMeanExhaust:             phys.aSideMeanExhaust,
      bSideMeanExhaust:             phys.bSideMeanExhaust,
      cylImbalance:                 phys.cylImbalance,
      filterDifferentialP:          phys.filterDifferentialP,
    };
  }
}

export { createFaultConfig };
