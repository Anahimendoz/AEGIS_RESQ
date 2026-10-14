import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { DemoNetworkSimulator } from '../../core/demo/demo-network.simulator';
import { AppError, toAppError } from '../../core/errors/app-error';
import { EventLogService } from '../../core/services/event-log.service';
import { SettingsService } from '../../core/services/settings.service';
import { AppMode, NetworkNode, NodeLinkState } from '../../shared/models/network.models';
import { BleBeaconService } from './ble-beacon.service';
import { NodeRegistry, Sighting } from './node-registry';
import { recommendNode, scoreNode } from './node-scoring';

export type DiscoveryState = 'idle' | 'starting' | 'running' | 'error';

const REFRESH_MS = 1_000;
const READVERTISE_MS = 60_000;

const STATE_LABELS: Record<NodeLinkState, string> = {
  verified: 'enlace acústico verificado',
  available: 'disponible',
  'out-of-range': 'fuera de alcance',
};

/** Orquesta el descubrimiento (BLE real o simulador de demostración) y mantiene la lista de nodos. */
@Injectable({ providedIn: 'root' })
export class DiscoveryService {
  private readonly ble = inject(BleBeaconService);
  private readonly settings = inject(SettingsService);
  private readonly log = inject(EventLogService);
  private readonly registry = new NodeRegistry();
  private readonly demo = new DemoNetworkSimulator();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private readvertiseTimer: ReturnType<typeof setInterval> | null = null;
  private previousStates = new Map<number, NodeLinkState>();
  private bleActive = false;

  private readonly stateSignal = signal<DiscoveryState>('idle');
  private readonly nodesSignal = signal<NetworkNode[]>([]);
  private readonly selectedIdSignal = signal<number | null>(null);
  private readonly errorSignal = signal<AppError | null>(null);

  readonly state = this.stateSignal.asReadonly();
  readonly nodes = this.nodesSignal.asReadonly();
  readonly selectedId = this.selectedIdSignal.asReadonly();
  readonly lastError = this.errorSignal.asReadonly();
  readonly advertising = this.ble.advertising;

  readonly reachableNodes = computed(() => this.nodesSignal().filter((n) => n.state !== 'out-of-range'));
  readonly verifiedCount = computed(() => this.nodesSignal().filter((n) => n.state === 'verified').length);
  readonly selectedNode = computed(() => this.nodesSignal().find((n) => n.shortId === this.selectedIdSignal()) ?? null);
  readonly recommendation = computed(() => recommendNode(this.nodesSignal()));
  readonly scores = computed(() => new Map(this.nodesSignal().map((n) => [n.shortId, scoreNode(n)])));

  constructor() {
    // Al cambiar de modo se descartan todos los nodos: nunca se mezclan datos reales y simulados.
    let previousMode: AppMode | null = null;
    effect(() => {
      const mode = this.settings.mode();
      if (previousMode !== null && previousMode !== mode) {
        untracked(() => void this.resetForModeChange());
      }
      previousMode = mode;
    });
  }

  isRunning(): boolean {
    return this.stateSignal() === 'running' || this.stateSignal() === 'starting';
  }

  async start(): Promise<void> {
    if (this.isRunning()) return;
    this.stateSignal.set('starting');
    this.errorSignal.set(null);
    const onSighting = (s: Sighting) => this.registry.recordSighting(s);
    try {
      if (this.settings.isDemo()) {
        this.demo.start(onSighting);
        this.log.log('discovery', 'info', 'Descubrimiento simulado iniciado.', undefined, true);
      } else {
        this.bleActive = true;
        await this.ble.startScan(onSighting);
        await this.ble.startAdvertising();
        this.readvertiseTimer = setInterval(() => void this.ble.startAdvertising(), READVERTISE_MS);
        this.log.info('discovery', 'Descubrimiento BLE iniciado.');
      }
      this.refreshTimer = setInterval(() => this.refresh(), REFRESH_MS);
      this.stateSignal.set('running');
    } catch (error) {
      const appError = toAppError(error, 'bluetooth-unsupported');
      this.errorSignal.set(appError);
      this.stateSignal.set('error');
      this.log.error('discovery', appError);
      await this.stopSources();
    }
  }

  async stop(): Promise<void> {
    await this.stopSources();
    this.stateSignal.set('idle');
    this.refresh();
    this.log.info('discovery', 'Descubrimiento detenido.');
  }

  /** Selección manual: la app nunca cambia el nodo seleccionado por su cuenta. */
  select(shortId: number | null): void {
    this.selectedIdSignal.set(shortId);
  }

  recordAcousticContact(shortId: number): void {
    this.registry.recordAcousticContact(shortId, Date.now(), this.settings.isDemo());
    this.refresh();
  }

  recordAcousticSend(shortId: number): void {
    this.registry.recordAcousticSend(shortId);
  }

  recordAcousticAck(shortId: number, roundTripMs: number): void {
    this.registry.recordAcousticAck(shortId, roundTripMs, Date.now());
    this.refresh();
  }

  private refresh(): void {
    const nodes = this.registry.snapshot(Date.now());
    for (const node of nodes) {
      const previous = this.previousStates.get(node.shortId);
      if (previous !== node.state) {
        const message = previous
          ? `${node.pseudonym}: ${STATE_LABELS[previous]} → ${STATE_LABELS[node.state]}.`
          : `${node.pseudonym} detectado.`;
        this.log.log('discovery', node.state === 'out-of-range' ? 'warning' : 'info', message, undefined, node.simulated);
      }
    }
    this.previousStates = new Map(nodes.map((n) => [n.shortId, n.state]));
    this.nodesSignal.set(nodes);
  }

  private async stopSources(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.readvertiseTimer) clearInterval(this.readvertiseTimer);
    this.refreshTimer = null;
    this.readvertiseTimer = null;
    this.demo.stop();
    if (this.bleActive) {
      this.bleActive = false;
      await this.ble.stopScan();
      await this.ble.stopAdvertising();
    }
  }

  private async resetForModeChange(): Promise<void> {
    if (this.isRunning()) {
      await this.stopSources();
      this.stateSignal.set('idle');
    }
    this.registry.clear();
    this.previousStates.clear();
    this.selectedIdSignal.set(null);
    this.nodesSignal.set([]);
  }
}
