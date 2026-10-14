import { PermissionState, WebPlugin, registerPlugin } from '@capacitor/core';

export type AegisPermission = 'microphone' | 'advertise';

export interface AegisPermissionStatus {
  microphone: PermissionState;
  /** En Android < 12 anunciarse por BLE no requiere permiso en tiempo de ejecución: se informa `granted`. */
  advertise: PermissionState;
}

export interface AdvertisingSupport {
  supported: boolean;
  /** Código de motivo cuando no se admite: `no-adapter`, `bluetooth-disabled`, `no-advertiser`. */
  reason?: string;
}

/**
 * Plugin nativo propio (android/app/src/main/java/.../AegisNativePlugin.java).
 * Cubre lo que los plugins oficiales no ofrecen: anunciarse por BLE como baliza,
 * consultar/solicitar el permiso de micrófono y abrir los ajustes de la app.
 */
export interface AegisNativePlugin {
  checkPermissions(): Promise<AegisPermissionStatus>;
  requestPermissions(options: { permissions: AegisPermission[] }): Promise<AegisPermissionStatus>;
  getAdvertisingSupport(): Promise<AdvertisingSupport>;
  /** `payload`: bytes de datos de fabricante (id de compañía 0xFFFF, reservado para pruebas). */
  startAdvertising(options: { payload: number[]; lowPower: boolean }): Promise<void>;
  stopAdvertising(): Promise<void>;
  openAppSettings(): Promise<void>;
}

class AegisNativeWeb extends WebPlugin implements AegisNativePlugin {
  async checkPermissions(): Promise<AegisPermissionStatus> {
    return { microphone: await browserMicrophoneState(), advertise: 'denied' };
  }

  async requestPermissions(): Promise<AegisPermissionStatus> {
    return this.checkPermissions();
  }

  async getAdvertisingSupport(): Promise<AdvertisingSupport> {
    return { supported: false, reason: 'web' };
  }

  async startAdvertising(): Promise<void> {
    throw this.unavailable('El anuncio BLE solo está disponible en Android.');
  }

  async stopAdvertising(): Promise<void> {
    return;
  }

  async openAppSettings(): Promise<void> {
    throw this.unavailable('Los ajustes del sistema solo se abren en Android.');
  }
}

async function browserMicrophoneState(): Promise<PermissionState> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch {
    return 'prompt';
  }
}

export const AegisNative = registerPlugin<AegisNativePlugin>('AegisNative', {
  web: () => new AegisNativeWeb(),
});
