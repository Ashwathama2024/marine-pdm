import type { SensorDefinition, SensorStatus } from '@marine-pdm/shared';

export interface ObservationStatus {
  daysComplete: number;
  daysRequired: number;
  ready: boolean;
  hasBaseline: boolean;
}

export class SensorRegistry {
  private sensors = new Map<string, SensorDefinition>();

  addSensor(def: Omit<SensorDefinition, 'status' | 'observationStartDate'>): SensorDefinition {
    if (this.sensors.has(def.id)) {
      throw new Error(`Sensor '${def.id}' already exists`);
    }
    if (def.minPhysical >= def.maxPhysical) {
      throw new Error(`minPhysical must be less than maxPhysical for '${def.id}'`);
    }
    if (!def.unit) {
      throw new Error(`unit is required for sensor '${def.id}'`);
    }

    const sensor: SensorDefinition = {
      ...def,
      status: 'OBSERVATION',
      observationStartDate: new Date().toISOString().split('T')[0],
      observationDaysRequired: def.observationDaysRequired ?? 30,
    };
    this.sensors.set(def.id, sensor);
    return sensor;
  }

  // Used during seeding to load ACTIVE sensors without observation gate
  loadSensor(def: SensorDefinition): void {
    this.sensors.set(def.id, def);
  }

  activateSensor(id: string, baselineExists: boolean): void {
    const sensor = this.sensors.get(id);
    if (!sensor) throw new Error(`Sensor '${id}' not found`);
    if (sensor.status !== 'OBSERVATION') {
      throw new Error(`Sensor '${id}' is not in OBSERVATION status (current: ${sensor.status})`);
    }

    const obs = this.getObservationStatus(id, baselineExists);
    if (!obs.ready) {
      throw new Error(
        `Sensor '${id}' cannot be activated: ${obs.daysComplete}/${obs.daysRequired} days, ` +
        `baseline: ${obs.hasBaseline ? 'yes' : 'no'}`,
      );
    }

    this.sensors.set(id, { ...sensor, status: 'ACTIVE' });
  }

  disableSensor(id: string): void {
    const sensor = this.sensors.get(id);
    if (!sensor) throw new Error(`Sensor '${id}' not found`);
    this.sensors.set(id, { ...sensor, status: 'DISABLED' });
  }

  markFaultSuspect(id: string): void {
    const sensor = this.sensors.get(id);
    if (!sensor) throw new Error(`Sensor '${id}' not found`);
    this.sensors.set(id, { ...sensor, status: 'FAULT_SUSPECT' });
  }

  getSensor(id: string): SensorDefinition | undefined {
    return this.sensors.get(id);
  }

  getAll(): SensorDefinition[] {
    return [...this.sensors.values()];
  }

  getScoringActiveSensors(): SensorDefinition[] {
    return [...this.sensors.values()].filter(s => s.status === 'ACTIVE');
  }

  isActive(id: string): boolean {
    return this.sensors.get(id)?.status === 'ACTIVE';
  }

  getObservationStatus(id: string, baselineExists: boolean): ObservationStatus {
    const sensor = this.sensors.get(id);
    if (!sensor) throw new Error(`Sensor '${id}' not found`);

    const startDate = sensor.observationStartDate
      ? new Date(sensor.observationStartDate)
      : new Date();
    const daysComplete = Math.floor(
      (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const daysRequired = sensor.observationDaysRequired;
    const ready = daysComplete >= daysRequired && baselineExists;

    return { daysComplete, daysRequired, ready, hasBaseline: baselineExists };
  }

  updateStatus(id: string, status: SensorStatus): void {
    const sensor = this.sensors.get(id);
    if (!sensor) throw new Error(`Sensor '${id}' not found`);
    this.sensors.set(id, { ...sensor, status });
  }

  size(): number {
    return this.sensors.size;
  }
}
