import { SensorRegistry } from './sensor-registry';
import { BaselineStore } from './baseline-store';
import { DependencyMap } from './dependency-map';
import { PatternLibrary } from './pattern-library';
import { seedKnowledgeBase } from './seed';

export const registry = new SensorRegistry();
export const baselineStore = new BaselineStore();
export const dependencyMap = new DependencyMap();
export const patternLibrary = new PatternLibrary();

seedKnowledgeBase(registry, baselineStore, dependencyMap, patternLibrary);
