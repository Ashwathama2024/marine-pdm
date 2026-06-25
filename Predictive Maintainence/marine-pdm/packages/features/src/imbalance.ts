import { mean } from '@marine-pdm/shared';

export interface ImbalanceResult {
  imbalance: number;        // max − min cylinder temp
  cylDevsFromMean: number[]; // per-cylinder deviation from fleet mean
  meanCylTemp: number;
  maxCylTemp: number;
  minCylTemp: number;
}

export function computeImbalance(cylTemps: number[]): ImbalanceResult {
  if (cylTemps.length === 0) {
    return { imbalance: 0, cylDevsFromMean: [], meanCylTemp: 0, maxCylTemp: 0, minCylTemp: 0 };
  }
  const meanTemp = mean(cylTemps);
  const maxTemp = Math.max(...cylTemps);
  const minTemp = Math.min(...cylTemps);
  const imbalance = maxTemp - minTemp;
  const cylDevsFromMean = cylTemps.map(t => t - meanTemp);

  return {
    imbalance,
    cylDevsFromMean,
    meanCylTemp: meanTemp,
    maxCylTemp: maxTemp,
    minCylTemp: minTemp,
  };
}
