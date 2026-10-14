import { Injectable, inject, signal } from '@angular/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { EventLogService } from './event-log.service';

export type TriState = 'yes' | 'no' | 'unknown';

export interface NetworkStatus {
  /** El sistema informa una red conectada. No garantiza que haya salida a Internet. */
  systemNetwork: TriState;
  connectionType: string;
}

/** Estado de Bluetooth y de la red del sistema, siempre leído de la plataforma. */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly log = inject(EventLogService);
  private readonly bluetoothSignal = signal<TriState>('unknown');
  private readonly networkSignal = signal<NetworkStatus>({ systemNetwork: 'unknown', connectionType: 'desconocido' });
  private started = false;
  private notifying = false;

  readonly bluetoothEnabled = this.bluetoothSignal.asReadonly();
  readonly network = this.networkSignal.asReadonly();

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      const status = await Network.getStatus();
      this.setNetwork(status.connected, status.connectionType);
      await Network.addListener('networkStatusChange', (s) => this.setNetwork(s.connected, s.connectionType));
    } catch (error) {
      this.log.warn('system', 'No se pudo leer el estado de la red.', String(error));
    }
  }

  /**
   * Lee si Bluetooth está activado. Requiere que BleClient esté inicializado (tras conceder
   * el permiso de dispositivos cercanos); si no, el estado queda como desconocido.
   */
  async refreshBluetooth(): Promise<TriState> {
    if (Capacitor.getPlatform() !== 'android') {
      this.bluetoothSignal.set('unknown');
      return 'unknown';
    }
    try {
      const enabled = await BleClient.isEnabled();
      this.bluetoothSignal.set(enabled ? 'yes' : 'no');
      if (!this.notifying) {
        await BleClient.startEnabledNotifications((value) => this.bluetoothSignal.set(value ? 'yes' : 'no'));
        this.notifying = true;
      }
    } catch {
      this.bluetoothSignal.set('unknown');
    }
    return this.bluetoothSignal();
  }

  private setNetwork(connected: boolean, type: string): void {
    this.networkSignal.set({ systemNetwork: connected ? 'yes' : 'no', connectionType: type });
  }
}
