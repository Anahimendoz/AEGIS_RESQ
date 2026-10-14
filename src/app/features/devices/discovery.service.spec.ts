import { TestBed } from '@angular/core/testing';
import { AppError } from '../../core/errors/app-error';
import { SettingsService } from '../../core/services/settings.service';
import { BleBeaconService } from './ble-beacon.service';
import { DiscoveryService } from './discovery.service';
import { Sighting } from './node-registry';

class FakeBle {
  emit: ((s: Sighting) => void) | null = null;
  failWith: AppError | null = null;
  scanning = false;
  readonly advertising = () => 'off' as const;

  async startScan(onSighting: (s: Sighting) => void): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.emit = onSighting;
    this.scanning = true;
  }
  async stopScan(): Promise<void> {
    this.scanning = false;
  }
  async startAdvertising(): Promise<void> {}
  async stopAdvertising(): Promise<void> {}
}

const caps = { relayEnabled: false, acousticParticipation: true, internetReported: false };

describe('DiscoveryService', () => {
  let ble: FakeBle;
  let discovery: DiscoveryService;
  let settings: SettingsService;

  beforeEach(() => {
    vi.useFakeTimers();
    ble = new FakeBle();
    TestBed.configureTestingModule({ providers: [{ provide: BleBeaconService, useValue: ble }] });
    discovery = TestBed.inject(DiscoveryService);
    settings = TestBed.inject(SettingsService);
    TestBed.tick();
  });

  afterEach(() => vi.useRealTimers());

  it('inicia y detiene el descubrimiento real', async () => {
    await discovery.start();
    expect(discovery.state()).toBe('running');
    expect(ble.scanning).toBe(true);
    await discovery.stop();
    expect(discovery.state()).toBe('idle');
    expect(ble.scanning).toBe(false);
  });

  it('no cuenta dos veces el mismo nodo', async () => {
    await discovery.start();
    for (let i = 0; i < 5; i++) {
      ble.emit!({ shortId: 0x42, rssi: -60 - i, capabilities: caps, batteryLevel: null, at: Date.now(), simulated: false });
    }
    vi.advanceTimersByTime(1_100);
    expect(discovery.nodes().length).toBe(1);
    expect(discovery.reachableNodes().length).toBe(1);
  });

  it('refleja la pérdida de un nodo que deja de anunciarse', async () => {
    await discovery.start();
    ble.emit!({ shortId: 0x42, rssi: -60, capabilities: caps, batteryLevel: null, at: Date.now(), simulated: false });
    vi.advanceTimersByTime(1_100);
    expect(discovery.nodes()[0].state).toBe('available');
    vi.advanceTimersByTime(20_000);
    expect(discovery.nodes()[0].state).toBe('out-of-range');
    expect(discovery.reachableNodes().length).toBe(0);
  });

  it('gestiona Bluetooth desactivado sin bloquear la app', async () => {
    ble.failWith = new AppError('bluetooth-disabled');
    await discovery.start();
    expect(discovery.state()).toBe('error');
    expect(discovery.lastError()?.code).toBe('bluetooth-disabled');
    expect(discovery.nodes()).toEqual([]);
  });

  it('en modo demostración solo produce nodos marcados como simulados', async () => {
    settings.setMode('demo');
    TestBed.tick();
    await discovery.start();
    vi.advanceTimersByTime(2_100);
    expect(ble.scanning).toBe(false);
    expect(discovery.nodes().length).toBeGreaterThan(0);
    expect(discovery.nodes().every((n) => n.simulated)).toBe(true);
  });

  it('borra los nodos al cambiar de modo para no mezclar datos simulados y reales', async () => {
    settings.setMode('demo');
    TestBed.tick();
    await discovery.start();
    vi.advanceTimersByTime(2_100);
    settings.setMode('real');
    TestBed.tick();
    await vi.runOnlyPendingTimersAsync();
    expect(discovery.nodes()).toEqual([]);
    expect(discovery.state()).toBe('idle');
  });

  it('no cambia el nodo seleccionado por su cuenta', async () => {
    await discovery.start();
    ble.emit!({ shortId: 1, rssi: -90, capabilities: caps, batteryLevel: null, at: Date.now(), simulated: false });
    ble.emit!({ shortId: 2, rssi: -50, capabilities: caps, batteryLevel: null, at: Date.now(), simulated: false });
    discovery.select(1);
    vi.advanceTimersByTime(1_100);
    expect(discovery.recommendation()?.shortId).toBe(2);
    expect(discovery.selectedId()).toBe(1);
  });
});
