import { SystemState, SystemEvent } from '../types';

export class SimulationEngine {
  private state: SystemState;
  private eventQueue: SystemEvent[] = [];

  constructor(initialState: SystemState) {
    this.state = initialState;
  }

  // Schedule an event in the simulation
  public scheduleEvent(event: SystemEvent) {
    this.eventQueue.push(event);
    this.eventQueue.sort((a, b) => a.time - b.time);
  }

  // Run the simulation loop for a specific duration
  public run(duration: number) {
    while (this.eventQueue.length > 0 && this.state.currentTime < duration) {
      const event = this.eventQueue.shift();
      if (!event) continue;

      this.state.currentTime = event.time;
      this.processEvent(event);
    }
  }

  private processEvent(event: SystemEvent) {
    const targetComponent = this.state.components[event.targetId];
    if (!targetComponent) return;

    // Simulate component processing: add latency
    targetComponent.throughputLimit++; // Simple metric: increment requests
    
    // Schedule response event
    this.scheduleEvent({
      id: `resp-${event.payload.requestId}`,
      time: event.time + processingTime,
      type: 'response',
      sourceId: event.targetId,
      targetId: event.sourceId, // Return to sender
      payload: event.payload
    });
  }

  public getState(): SystemState {
    return this.state;
  }
}
