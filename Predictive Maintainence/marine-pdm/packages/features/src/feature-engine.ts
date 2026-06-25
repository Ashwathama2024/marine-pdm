import type { EngineSnapshot, FeatureSnapshot, BaselineSnapshot } from '@marine-pdm/shared';
import type { BaselineStore, SensorRegistry } from '@marine-pdm/knowledge';
import { computeDeviations, computeBaselineSnapshot } from './deviation';
import { RateCalculator } from './rate';
import { RollingWindow } from './window';
import { computeImbalance } from './imbalance';

export class FeatureEngine {
  private rate = new RateCalculator(15);
  private exhaustWindow = new RollingWindow(30);
  private store: BaselineStore;
  private registry: SensorRegistry;

  constructor(store: BaselineStore, registry: SensorRegistry) {
    this.store = store;
    this.registry = registry;
  }

  process(snap: EngineSnapshot): { features: FeatureSnapshot; baseline: BaselineSnapshot } {
    // 1. Compute baseline expected values
    const baseline = computeBaselineSnapshot(snap, this.store);

    // 2. Deviations
    const { exhaustDev, lubeDev, cylDevs } = computeDeviations(snap, baseline, this.registry);

    // 3. Push into rate and rolling window calculators
    this.rate.push(snap.exhaustTemp, snap.lubeOilPressure);
    this.exhaustWindow.push(snap.exhaustTemp);

    // 4. Cylinder imbalance (from actual temps, not deviations)
    const { imbalance } = computeImbalance(snap.cylTemps);

    const sfocDev     = snap.sfoc     - baseline.expectedSfoc;
    const fuelRackDev = snap.fuelRack - baseline.expectedFuelRack;

    const features: FeatureSnapshot = {
      exhaustDev,
      lubeDev,
      cylDevs,
      cylImbalance: imbalance,
      exhaustRate: this.rate.getExhaustRate(),
      lubeRate: this.rate.getLubeRate(),
      rollingAvg: this.exhaustWindow.getMean(),
      stdDev: this.exhaustWindow.getStdDev(),
      sfocDev,
      fuelRackDev,
    };

    return { features, baseline };
  }

  reset(): void {
    this.rate.reset();
    this.exhaustWindow.reset();
  }
}
