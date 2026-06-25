import { linearRegressionSlope, TICK_MS } from '@marine-pdm/shared';

const TICKS_PER_MINUTE = (60 * 1000) / TICK_MS; // = 60 at TICK_MS=1000

export class RateCalculator {
  private exhaustWindow: number[] = [];
  private lubeWindow: number[] = [];
  private windowSize: number;

  constructor(windowSize = 5) {
    this.windowSize = windowSize;
  }

  push(exhaustTemp: number, lubePressure: number): void {
    this.exhaustWindow.push(exhaustTemp);
    if (this.exhaustWindow.length > this.windowSize) {
      this.exhaustWindow.shift();
    }
    this.lubeWindow.push(lubePressure);
    if (this.lubeWindow.length > this.windowSize) {
      this.lubeWindow.shift();
    }
  }

  /** °C per minute — positive means rising */
  getExhaustRate(): number {
    return linearRegressionSlope(this.exhaustWindow) * TICKS_PER_MINUTE;
  }

  /** bar per minute — negative means falling */
  getLubeRate(): number {
    return linearRegressionSlope(this.lubeWindow) * TICKS_PER_MINUTE;
  }

  reset(): void {
    this.exhaustWindow = [];
    this.lubeWindow = [];
  }
}
