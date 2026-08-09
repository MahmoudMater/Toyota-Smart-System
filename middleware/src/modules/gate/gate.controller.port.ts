export const GATE_CONTROLLER = Symbol('GATE_CONTROLLER');

export interface GateControllerPort {
  openGate(gateId: string): Promise<void>;
}
