// packages/simulator/src/start-sequence.ts
// Manages automated state transitions and start-attempt book-keeping.
// The StartSequence is called every engine tick; it inspects the current
// state machine phase + live physics and fires transitions when conditions
// are met (e.g. cranking RPM threshold, stopping coast-down complete).

import type { EngineStateMachine } from './engine-state-machine';
import type { StartPhysicsState } from './mtu8000-start-physics';

const MAX_START_ATTEMPTS  = 3;
const CRANKING_RPM_FIRE   = 180;  // RPM at which engine self-sustains (fires)
const CRANKING_TIMEOUT_S  = 35;   // failed start if not above threshold within this time
const TURNING_DURATION_S  = 10;   // barring gear check before advancing to CRANKING
const CLUTCHING_TIMEOUT_S = 8;    // clutch engagement completes within this time
const STOPPING_RPM_OFF    = 5;    // coast-down complete below this RPM

export class StartSequence {
  private startAttempts = 0;
  private _startAirBar: number;
  private readonly AIR_PER_ATTEMPT = 3;  // bar consumed per start attempt

  constructor(initialAirBar = 25) {
    this._startAirBar = initialAirBar;
  }

  get startAirBar(): number { return this._startAirBar; }
  set startAirBar(v: number) { this._startAirBar = Math.max(0, Math.min(30, v)); }

  get attemptsRemaining(): number { return MAX_START_ATTEMPTS - this.startAttempts; }
  get canAttemptStart(): boolean  { return this.startAttempts < MAX_START_ATTEMPTS && this._startAirBar >= 14; }

  resetAttempts(): void { this.startAttempts = 0; }

  // Called each tick to advance auto-transitions.
  // Returns true if it fired a transition this tick (so engine knows to re-init physics).
  tick(
    machine: EngineStateMachine,
    startState: StartPhysicsState,
    _elapsedS: number,
  ): 'NONE' | 'TO_IDLE' | 'FAILED' {
    const phase = machine.current;
    const phaseElapsed = machine.elapsed_s;

    switch (phase) {
      case 'SAFETY_TURNING': {
        // After barring-gear check, advance to CRANKING (consuming start air)
        if (phaseElapsed >= TURNING_DURATION_S) {
          if (this.canAttemptStart) {
            this.startAttempts++;
            this._startAirBar = Math.max(0, this._startAirBar - this.AIR_PER_ATTEMPT);
            machine.transition('CRANKING');
          } else {
            // No remaining attempts or air too low — abort to STANDBY
            machine.transition('STANDBY');
            return 'FAILED';
          }
        }
        break;
      }

      case 'CRANKING': {
        // Engine fires when RPM rises above CRANKING_RPM_FIRE
        if (startState.rpm >= CRANKING_RPM_FIRE) {
          machine.transition('IDLE');
          return 'TO_IDLE';
        }
        // Cranking timeout — failed start, return to STANDBY
        if (phaseElapsed >= CRANKING_TIMEOUT_S) {
          machine.transition('STANDBY');
          return 'FAILED';
        }
        break;
      }

      case 'CLUTCHING': {
        // Clutch engagement completes automatically after brief transient
        if (phaseElapsed >= CLUTCHING_TIMEOUT_S) {
          machine.transition('CLUTCHED');
        }
        break;
      }

      case 'STOPPING': {
        // Coast-down complete when RPM near zero or timeout
        if (startState.rpm <= STOPPING_RPM_OFF || phaseElapsed >= 120) {
          machine.transition('ENGINE_OFF');
        }
        break;
      }
    }

    return 'NONE';
  }
}
