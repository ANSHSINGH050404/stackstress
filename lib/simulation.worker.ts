import { SimulationEngine } from './engine';
import { SystemState } from '../types';

let engine: SimulationEngine;

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'INIT') {
    engine = new SimulationEngine(payload as SystemState);
  } else if (type === 'TICK') {
    engine.run(payload.duration);
    self.postMessage({ type: 'UPDATE', state: engine.getState() });
  }
};
