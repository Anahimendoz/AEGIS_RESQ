import { Injectable, effect, signal } from '@angular/core';
import { AppMode } from '../../shared/models/network.models';
import { ModemProfile } from '../../features/rescue/acoustic/modem-profile';

/** Preferencias del usuario. Ninguna contiene datos personales; todas empiezan en el valor más conservador. */
export interface UserSettings {
  /** Retransmitir mensajes de otros nodos por el canal acústico. */
  relayEnabled: boolean;
  /** Acepta recibir sesiones acústicas y responder con confirmaciones automáticas. */
  acousticParticipation: boolean;
  /** Incluir el nivel de batería en el anuncio BLE. */
  shareBattery: boolean;
  /** Escaneo y anuncio BLE en modo de bajo consumo. */
  lowPower: boolean;
  modemProfile: ModemProfile['id'];
}

const STORAGE_KEY = 'aegisresq.settings.v1';

const DEFAULTS: UserSettings = {
  relayEnabled: false,
  acousticParticipation: false,
  shareBattery: false,
  lowPower: true,
  modemProfile: 'audible',
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly settingsSignal = signal<UserSettings>(loadSettings());
  /** El modo siempre arranca en «real» para que nunca se confundan datos simulados con reales. */
  private readonly modeSignal = signal<AppMode>('real');

  readonly settings = this.settingsSignal.asReadonly();
  readonly mode = this.modeSignal.asReadonly();

  constructor() {
    effect(() => saveSettings(this.settingsSignal()));
  }

  update(changes: Partial<UserSettings>): void {
    this.settingsSignal.update((current) => ({ ...current, ...changes }));
  }

  setMode(mode: AppMode): void {
    this.modeSignal.set(mode);
  }

  isDemo(): boolean {
    return this.modeSignal() === 'demo';
  }
}

function loadSettings(): UserSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<UserSettings>;
    return { ...DEFAULTS, ...pickKnown(stored) };
  } catch {
    return { ...DEFAULTS };
  }
}

function pickKnown(stored: Partial<UserSettings>): Partial<UserSettings> {
  const result: Partial<UserSettings> = {};
  for (const key of ['relayEnabled', 'acousticParticipation', 'shareBattery', 'lowPower'] as const) {
    if (typeof stored[key] === 'boolean') result[key] = stored[key];
  }
  if (stored.modemProfile === 'audible' || stored.modemProfile === 'near-ultrasonic') {
    result.modemProfile = stored.modemProfile;
  }
  return result;
}

function saveSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Sin almacenamiento disponible: las preferencias duran solo esta sesión.
  }
}
