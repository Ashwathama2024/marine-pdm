import { pushWindow, mean, stdDev } from '@marine-pdm/shared';

export class RollingWindow {
  private values: number[] = [];
  private size: number;

  constructor(size = 30) {
    this.size = size;
  }

  push(value: number): void {
    this.values = pushWindow(this.values, value, this.size);
  }

  getMean(): number {
    return mean(this.values);
  }

  getStdDev(): number {
    return stdDev(this.values);
  }

  isFull(): boolean {
    return this.values.length >= this.size;
  }

  getValues(): number[] {
    return [...this.values];
  }

  reset(): void {
    this.values = [];
  }
}
