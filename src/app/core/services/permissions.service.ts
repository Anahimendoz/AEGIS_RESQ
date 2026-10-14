import { Injectable, inject, signal } from '@angular/core';
import { BleClient, BluetoothLe } from '@capacitor-community/bluetooth-le';
import { Capacitor, PermissionState } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';
import { AppError, toAppError } from '../errors/app-error';
import { AegisNative } from '../native/aegis-native';
import { EventLogService } from './event-log.service';

export type PermissionKind = 'nearby' | 'location' | 'microphone' | 'advertise';
/** `not-required`: la versión de Android lo concede al instalar. `unsupported`: plataforma sin la función. */
export type PermissionStatus = PermissionState | 'not-required' | 'unsupported' | 'unknown';

export interface PermissionInfo {
  kind: PermissionKind;
  label: string;
  purpose: string;
  status: PermissionStatus;
}

const DESCRIPTIONS: Record<PermissionKind, Pick<PermissionInfo, 'label' | 'purpose'>> = {
  nearby: {
    label: 'Dispositivos cercanos (Bluetooth)',
    purpose: 'Buscar otros teléfonos con Aegis ResQ mediante Bluetooth Low Energy.',
  },
  advertise: {
    label: 'Anunciarse por Bluetooth',
    purpose: 'Que otros teléfonos detecten este nodo por su seudónimo de sesión.',
  },
  location: {
    label: 'Ubicación',
    purpose:
      'Android exige este permiso para entregar resultados de escaneo BLE y para registrar la posición del teléfono cuando el usuario lo pide.',
  },
  microphone: {
    label: 'Micrófono',
    purpose: 'Escuchar mensajes acústicos y señales de prueba. Solo se activa con un control visible.',
  },
};

/** Estado real de cada permiso, consultado al sistema; nunca se presume concedido. */
@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly log = inject(EventLogService);
  private readonly statusSignal = signal<Record<PermissionKind, PermissionStatus>>({
    nearby: 'unknown',
    advertise: 'unknown',
    location: 'unknown',
    microphone: 'unknown',
  });
  private sdkVersion: number | null = null;

  readonly status = this.statusSignal.asReadonly();

  list(): PermissionInfo[] {
    const status = this.statusSignal();
    return (Object.keys(DESCRIPTIONS) as PermissionKind[]).map((kind) => ({
      kind,
      ...DESCRIPTIONS[kind],
      status: status[kind],
    }));
  }

  isNative(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  async refresh(): Promise<void> {
    if (!this.isNative()) {
      this.statusSignal.set({ nearby: 'unsupported', advertise: 'unsupported', location: 'unsupported', microphone: await this.webMicrophone() });
      return;
    }
    try {
      const sdk = await this.androidSdk();
      const [ble, geo, native] = await Promise.all([
        (BluetoothLe as unknown as { checkPermissions(): Promise<Record<string, PermissionState>> }).checkPermissions(),
        Geolocation.checkPermissions(),
        AegisNative.checkPermissions(),
      ]);
      const nearby: PermissionStatus =
        sdk >= 31 ? combine(ble['BLUETOOTH_SCAN'], ble['BLUETOOTH_CONNECT']) : 'not-required';
      this.statusSignal.set({
        nearby,
        advertise: sdk >= 31 ? native.advertise : 'not-required',
        location: geo.location,
        microphone: native.microphone,
      });
    } catch (error) {
      this.log.error('permissions', toAppError(error));
    }
  }

  async request(kind: PermissionKind): Promise<PermissionStatus> {
    if (!this.isNative()) {
      throw new AppError('not-implemented-on-device', `Permiso ${kind} solicitado fuera de Android.`);
    }
    try {
      switch (kind) {
        case 'nearby':
          // initialize() pide BLUETOOTH_SCAN/CONNECT (Android 12+) o ubicación (Android ≤ 11).
          await BleClient.initialize({ androidNeverForLocation: false });
          break;
        case 'location':
          await Geolocation.requestPermissions({ permissions: ['location'] });
          break;
        case 'microphone':
        case 'advertise':
          await AegisNative.requestPermissions({ permissions: [kind] });
          break;
      }
    } catch (error) {
      this.log.warn('permissions', `Permiso «${DESCRIPTIONS[kind].label}» no concedido.`, String(error));
    }
    await this.refresh();
    const result = this.statusSignal()[kind];
    this.log.info('permissions', `Permiso «${DESCRIPTIONS[kind].label}»: ${result}.`);
    return result;
  }

  /** Comprueba y, si hace falta, solicita un permiso. Lanza `permission-denied` si no se concede. */
  async ensure(kind: PermissionKind): Promise<void> {
    await this.refresh();
    let status = this.statusSignal()[kind];
    if (status === 'granted' || status === 'not-required') return;
    if (status === 'unsupported') throw new AppError('not-implemented-on-device');
    status = await this.request(kind);
    if (status !== 'granted' && status !== 'not-required') {
      throw new AppError('permission-denied', `Permiso ${kind}: ${status}`);
    }
  }

  async openAppSettings(): Promise<void> {
    try {
      await AegisNative.openAppSettings();
    } catch (error) {
      this.log.error('permissions', toAppError(error, 'not-implemented-on-device'));
    }
  }

  private async androidSdk(): Promise<number> {
    if (this.sdkVersion === null) {
      this.sdkVersion = (await Device.getInfo()).androidSDKVersion ?? 0;
    }
    return this.sdkVersion;
  }

  private async webMicrophone(): Promise<PermissionStatus> {
    try {
      return (await AegisNative.checkPermissions()).microphone;
    } catch {
      return 'unknown';
    }
  }
}

function combine(...states: (PermissionState | undefined)[]): PermissionStatus {
  if (states.some((s) => s === undefined)) return 'unknown';
  if (states.every((s) => s === 'granted')) return 'granted';
  if (states.some((s) => s === 'denied')) return 'denied';
  return states.find((s) => s !== 'granted') ?? 'prompt';
}
