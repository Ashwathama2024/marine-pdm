import { useState, useCallback, useEffect } from 'react';
import { registry, baselineStore, patternLibrary } from '@marine-pdm/knowledge';
import type { SensorDefinition } from '@marine-pdm/shared';
import { savePatternFeedback, restorePatternFeedback } from '../services/pattern-feedback';

let _restored = false;

export function useKnowledge() {
  const [sensors, setSensors] = useState<SensorDefinition[]>(() => registry.getAll());

  // patternLibrary is a module singleton, so restore its accuracy counters exactly once per page load
  // rather than once per hook consumer.
  useEffect(() => {
    if (_restored) return;
    _restored = true;
    void restorePatternFeedback();
  }, []);

  const refreshSensors = useCallback(() => {
    setSensors(registry.getAll());
  }, []);

  const addSensor = useCallback((def: Omit<SensorDefinition, 'status' | 'observationStartDate'>) => {
    registry.addSensor(def);
    refreshSensors();
  }, [refreshSensors]);

  const activateSensor = useCallback((id: string) => {
    registry.activateSensor(id, baselineStore.hasCurve(id));
    refreshSensors();
  }, [refreshSensors]);

  const recordPatternOutcome = useCallback(
    (patternId: string, outcome: 'CONFIRMED' | 'FALSE_POSITIVE') => {
      patternLibrary.recordOutcome(patternId, outcome);
      // Write through — these counters are the only record of whether P01–P08 fire correctly, and
      // they lived only in memory until now.
      void savePatternFeedback();
    },
    [],
  );

  return {
    sensors,
    registry,
    baselineStore,
    patternLibrary,
    addSensor,
    activateSensor,
    recordPatternOutcome,
    refreshSensors,
  };
}
