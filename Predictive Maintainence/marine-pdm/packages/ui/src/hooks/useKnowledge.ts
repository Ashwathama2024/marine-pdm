import { useState, useCallback } from 'react';
import { registry, baselineStore, patternLibrary } from '@marine-pdm/knowledge';
import type { SensorDefinition } from '@marine-pdm/shared';

export function useKnowledge() {
  const [sensors, setSensors] = useState<SensorDefinition[]>(() => registry.getAll());

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
