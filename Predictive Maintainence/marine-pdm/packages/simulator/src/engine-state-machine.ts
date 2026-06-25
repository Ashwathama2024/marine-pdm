// packages/simulator/src/engine-state-machine.ts
// MTU 8000 11-state engine lifecycle state machine.

export type EngineState =
  | 'ENGINE_OFF'
  | 'STANDBY'
  | 'SAFETY_TURNING'
  | 'CRANKING'
  | 'IDLE'
  | 'WARMING'
  | 'DECLUTCHED_RUN'
  | 'CLUTCHING'
  | 'CLUTCHED'
  | 'LOADED'
  | 'STOPPING';

export interface StateBadgeConfig {
  color: string;
  pulse: boolean;
  label: string;
}

export const STATE_BADGE: Record<EngineState, StateBadgeConfig> = {
  ENGINE_OFF:     { color: '#FF3B3B', pulse: false, label: 'ENGINE OFF' },
  STANDBY:        { color: '#FFD700', pulse: true,  label: 'STANDBY' },
  SAFETY_TURNING: { color: '#FF8C00', pulse: true,  label: 'SAFETY TURNING' },
  CRANKING:       { color: '#FF8C00', pulse: true,  label: 'CRANKING' },
  IDLE:           { color: '#D4AC0D', pulse: false, label: 'IDLE' },
  WARMING:        { color: '#D4AC0D', pulse: false, label: 'WARMING' },
  DECLUTCHED_RUN: { color: '#D4AC0D', pulse: false, label: 'DECLUTCHED RUN' },
  CLUTCHING:      { color: '#00E5A0', pulse: true,  label: 'CLUTCHING' },
  CLUTCHED:       { color: '#00C878', pulse: false, label: 'CLUTCHED' },
  LOADED:         { color: '#00C878', pulse: false, label: 'LOADED' },
  STOPPING:       { color: '#FF3B3B', pulse: true,  label: 'STOPPING' },
};

// Valid transitions: state → list of allowable next states
const VALID_TRANSITIONS: Partial<Record<EngineState, EngineState[]>> = {
  ENGINE_OFF:     ['STANDBY'],
  STANDBY:        ['SAFETY_TURNING', 'ENGINE_OFF'],
  SAFETY_TURNING: ['CRANKING', 'STANDBY'],
  CRANKING:       ['IDLE', 'STANDBY'],
  IDLE:           ['WARMING', 'STOPPING'],
  WARMING:        ['DECLUTCHED_RUN', 'IDLE', 'STOPPING'],
  DECLUTCHED_RUN: ['CLUTCHING', 'WARMING', 'STOPPING'],
  CLUTCHING:      ['CLUTCHED', 'DECLUTCHED_RUN'],
  CLUTCHED:       ['LOADED', 'DECLUTCHED_RUN'],
  LOADED:         ['STOPPING', 'CLUTCHED', 'DECLUTCHED_RUN'],
  STOPPING:       ['ENGINE_OFF'],
};

export class EngineStateMachine {
  private _state: EngineState = 'ENGINE_OFF';
  private _stateStartMs: number = Date.now();

  get current(): EngineState { return this._state; }

  get elapsed_s(): number { return (Date.now() - this._stateStartMs) / 1000; }

  get badge(): StateBadgeConfig { return STATE_BADGE[this._state]; }

  get isPreOperational(): boolean {
    return this._state === 'ENGINE_OFF'
      || this._state === 'STANDBY'
      || this._state === 'SAFETY_TURNING'
      || this._state === 'CRANKING';
  }

  get isOperational(): boolean { return !this.isPreOperational && this._state !== 'STOPPING'; }

  canTransition(next: EngineState): boolean {
    return (VALID_TRANSITIONS[this._state] ?? []).includes(next);
  }

  transition(next: EngineState): boolean {
    if (!this.canTransition(next)) return false;
    this._state = next;
    this._stateStartMs = Date.now();
    return true;
  }

  // Force a transition regardless of validity (for internal recovery only)
  forceTransition(next: EngineState): void {
    this._state = next;
    this._stateStartMs = Date.now();
  }
}
