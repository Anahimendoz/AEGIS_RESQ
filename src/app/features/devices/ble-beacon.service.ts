import { Injectable, inject, signal } from '@angular/core';
import { BleClient, ScanMode, ScanResult } from '@capacitor-community/bluetooth-le';
import { Device } from '@capacitor/device';
import { AppError, toAppError } from '../../core/errors/app-error';
import { AegisNative } from '../../core/native/aegis-native';
import { ConnectivityService } from '../../core/services/connectivity.service';
import { EventLogService } from '../../core/services/event-log.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { SessionIdentityService } from '../../core/services/session-identity.service';
import { SettingsService } from '../../core/services/settings.service';
import { BEACON_COMPANY_ID, beaconFilterPrefix, encodeBeacon, parseBeacon } from './beacon';
import { Sighting } from './node-registry';

export type AdvertisingState = 'off' | 'active' | 'unsupported' | 'denied' | 'failed';

/**
 * Descubrimiento real por BLE: escanea anuncios de Aegis ResQ y anuncia este nodo.
 * BLE se usa solo para descubrimiento y señalización; no transporta audio.
 */
@Injectable({ providedIn: 'root' })
export class BleBeaconService {
  private readonly permissions = inject(PermissionsService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly settings = inject(SettingsService);
  private readonly identity = inject(SessionIdentityService);
  private readonly log = inject(EventLogService);
  private readonly advertisingSignal = signal<AdvertisingState>('off');
  private lastPayload: string | null = null;

  readonly advertising = this.advertisingSignal.asReadonly();

  async startScan(onSighting: (sighting: Sighting) => void): Promise<void> {
    await this.permissions.ensure('nearby');
    try {
      await BleClient.initialize({ androidNeverForLocation: false });
    } catch (error) {
      throw toAppError(error, 'bluetooth-unsupported');
    }
    if ((await this.connectivity.refreshBluetooth()) !== 'yes') {
      throw new AppError('bluetooth-disabled');
    }
    await BleClient.requestLEScan(
      {
        allowDuplicates: true,
        scanMode: this.settings.settings().lowPower ? ScanMode.SCAN_MODE_LOW_POWER : ScanMode.SCAN_MODE_BALANCED,
        manufacturerData: [{ companyIdentifier: BEACON_COMPANY_ID, dataPrefix: beaconFilterPrefix() }],
      },
      (result) => {
        const sighting = this.toSighting(result);
        if (sighting) onSighting(sighting);
      },
    );
  }

  async stopScan(): Promise<void> {
    try {
      await BleClient.stopLEScan();
    } catch (error) {
      this.log.warn('discovery', 'No se pudo detener el escaneo BLE.', String(error));
    }
  }

  /** Inicia o actualiza el anuncio. Un fallo no detiene el escaneo: solo impide que otros nos vean. */
  async startAdvertising(): Promise<void> {
    try {
      await this.permissions.ensure('advertise');
      const support = await AegisNative.getAdvertisingSupport();
      if (!support.supported) {
        this.advertisingSignal.set('unsupported');
        this.log.warn('discovery', new AppError('advertising-unsupported').userMessage, support.reason);
        return;
      }
      const payload = await this.buildPayload();
      const key = payload.join(',');
      if (this.advertisingSignal() === 'active' && key === this.lastPayload) return;
      await AegisNative.startAdvertising({ payload, lowPower: this.settings.settings().lowPower });
      this.lastPayload = key;
      this.advertisingSignal.set('active');
    } catch (error) {
      const appError = toAppError(error);
      this.advertisingSignal.set(appError.code === 'permission-denied' ? 'denied' : 'failed');
      this.log.error('discovery', appError);
    }
  }

  async stopAdvertising(): Promise<void> {
    this.lastPayload = null;
    this.advertisingSignal.set('off');
    try {
      await AegisNative.stopAdvertising();
    } catch (error) {
      this.log.warn('discovery', 'No se pudo detener el anuncio BLE.', String(error));
    }
  }

  private async buildPayload(): Promise<number[]> {
    const settings = this.settings.settings();
    let batteryLevel: number | null = null;
    if (settings.shareBattery) {
      const info = await Device.getBatteryInfo().catch(() => null);
      batteryLevel = info?.batteryLevel !== undefined ? Math.round(info.batteryLevel * 100) : null;
    }
    return encodeBeacon({
      shortId: this.identity.shortId,
      capabilities: {
        relayEnabled: settings.relayEnabled,
        acousticParticipation: settings.acousticParticipation,
        internetReported: this.connectivity.network().systemNetwork === 'yes',
      },
      batteryLevel,
    });
  }

  private toSighting(result: ScanResult): Sighting | null {
    const data = result.manufacturerData?.[String(BEACON_COMPANY_ID)];
    const beacon = data ? parseBeacon(data) : null;
    if (!beacon || beacon.shortId === this.identity.shortId) return null;
    return { ...beacon, rssi: result.rssi ?? null, at: Date.now(), simulated: false };
  }
}
