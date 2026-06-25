// OPCUADataSource — implements IDataSource, drop-in replacement for SimulatorEngine
// Uses node-opcua under the hood; requires: pnpm add node-opcua
// One-line swap in App.tsx:
//   const src: IDataSource = new OPCUADataSource('opc.tcp://ipms:4840');

import type { IDataSource, EngineSnapshot } from '@marine-pdm/shared';
import { RingBuffer } from './buffer';
import { NODE_ID_TO_FIELD, ALL_NODE_IDS } from './tag-map';

// Dynamically imported so the module doesn't crash when node-opcua is absent
// (browser bundle excludes it; only used in Node.js environments)
type OPCUAClientType = import('node-opcua').OPCUAClient;
type ClientSessionType = import('node-opcua').ClientSession;
type ClientSubscriptionType = import('node-opcua').ClientSubscription;

import { MTU8000 } from '@marine-pdm/shared';

const CYL_COUNT = MTU8000.CYLINDERS;  // 20
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

function makeEmptySnapshot(): EngineSnapshot {
  return {
    timestamp: Date.now(),
    rpm: 0, load: 0, exhaustTemp: 0, lubeOilPressure: 0,
    fuelRack: 0, scavengeAir: 0, tcRPM: 0, jacketOutlet: 0,
    sfoc: 0, coolingEff: 1.0,
    cylTemps: Array(CYL_COUNT).fill(0),
    chargeAirTemp: 0, fuelOilPressure: 0, fuelOilTemp: 0,
    loFilterDP: 0, pistonCoolingPress: 0, shaftPower: 0,
    // MTU 8000 extended fields
    bearingTemps: Array(11).fill(0),
    tcSpeeds: Array(4).fill(0),
  };
}

export class OPCUADataSource implements IDataSource {
  private readonly endpointUrl: string;
  private buffer = new RingBuffer();
  private subscriber: ((snap: EngineSnapshot) => void) | null = null;
  private running = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private partial: EngineSnapshot = makeEmptySnapshot();

  // node-opcua objects — kept as `any` so this file compiles without node-opcua installed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private subscription: any = null;

  constructor(endpointUrl: string) {
    this.endpointUrl = endpointUrl;
  }

  subscribe(cb: (snap: EngineSnapshot) => void): void {
    if (this.running) return;
    this.subscriber = cb;
    this.running = true;
    this.connect();
  }

  unsubscribe(): void {
    this.running = false;
    this.subscriber = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    void this.disconnect();
  }

  getLatest(): EngineSnapshot | null {
    return this.buffer.getLatest()?.snapshot ?? null;
  }

  // ── Internal connection lifecycle ────────────────────────────────────────

  private async connect(): Promise<void> {
    if (!this.running) return;

    try {
      // Dynamic import — fails gracefully in browser; works in Node.js
      const { OPCUAClient, MessageSecurityMode, SecurityPolicy } = await import('node-opcua');

      this.client = OPCUAClient.create({
        endpointMustExist: false,
        connectionStrategy: {
          initialDelay: 0,
          maxDelay: 0,
          maxRetry: 0, // we handle reconnect ourselves
        },
        securityMode: MessageSecurityMode.None,
        securityPolicy: SecurityPolicy.None,
      });

      this.client.on('close', () => {
        if (this.running) this.scheduleReconnect();
      });

      await this.client.connect(this.endpointUrl);
      this.session = await this.client.createSession();
      this.reconnectAttempt = 0; // reset backoff on success

      await this.createSubscription();
    } catch (err) {
      if (this.running) this.scheduleReconnect();
    }
  }

  private async createSubscription(): Promise<void> {
    const { ClientSubscription, AttributeIds, TimestampsToReturn } = await import('node-opcua');

    this.subscription = ClientSubscription.create(this.session, {
      requestedPublishingInterval: 1000,
      requestedLifetimeCount: 60,
      requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: 1000,
      publishingEnabled: true,
      priority: 10,
    });

    for (const nodeId of ALL_NODE_IDS) {
      const item = this.subscription.monitor(
        { nodeId, attributeId: AttributeIds.Value },
        { samplingInterval: 1000, discardOldest: true, queueSize: 1 },
        TimestampsToReturn.Server,
      );

      item.on('changed', (dataValue: { value: { value: unknown } }) => {
        const raw = dataValue.value.value;
        if (typeof raw !== 'number') return;
        this.applyTagValue(nodeId, raw);
      });
    }

    // Emit a snapshot every second based on accumulated partial state
    const emitTimer = setInterval(() => {
      if (!this.running) { clearInterval(emitTimer); return; }
      const snap: EngineSnapshot = { ...this.partial, timestamp: Date.now() };
      this.buffer.push(snap);
      this.subscriber?.(snap);
    }, 1000);
  }

  private applyTagValue(nodeId: string, value: number): void {
    const mapping = NODE_ID_TO_FIELD.get(nodeId);
    if (!mapping) return;

    const scaled = value * (mapping.scale ?? 1.0) + (mapping.offset ?? 0);
    const field = mapping.field;

    // Handle array fields: 'cylTemps.N', 'bearingTemps.N', 'tcSpeeds.N'
    const dotIdx = field.indexOf('.');
    if (dotIdx !== -1) {
      const arrKey = field.slice(0, dotIdx) as keyof EngineSnapshot;
      const idx = parseInt(field.slice(dotIdx + 1), 10);
      const existing = this.partial[arrKey];
      if (Array.isArray(existing) && idx >= 0 && idx < existing.length) {
        const updated = [...existing];
        updated[idx] = scaled;
        this.partial = { ...this.partial, [arrKey]: updated };
      }
    } else {
      this.partial = { ...this.partial, [field]: scaled };
    }
  }

  private async disconnect(): Promise<void> {
    try {
      await this.subscription?.terminate();
    } catch { /* ignore */ }
    try {
      await this.session?.close();
    } catch { /* ignore */ }
    try {
      await this.client?.disconnect();
    } catch { /* ignore */ }
    this.subscription = null;
    this.session = null;
    this.client = null;
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer) return;
    this.reconnectAttempt++;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt - 1),
      RECONNECT_MAX_MS,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.disconnect().then(() => this.connect());
    }, delay);
  }
}
