import { SensorFailureRegistry } from '@marine-pdm/simulator';

// Module-level singleton — stable for entire app lifetime, survives page navigation
export const sensorRegistry = new SensorFailureRegistry();
