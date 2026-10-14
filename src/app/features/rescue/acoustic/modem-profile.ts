/**
 * Parámetros del módem acústico MFSK diferencial.
 * Cada símbolo es un tono de `TONE_COUNT` posibles y transporta 4 bits (un nibble).
 */
export interface ModemProfile {
  id: 'audible' | 'near-ultrasonic';
  label: string;
  baseFrequencyHz: number;
  toneSpacingHz: number;
  symbolMs: number;
}

/** 17 tonos: 16 valores de nibble + 1 para que dos símbolos consecutivos nunca repitan tono. */
export const TONE_COUNT = 17;
/** Secuencia de tonos que marca el inicio de una trama. */
export const PREAMBLE_TONES = [0, 8, 0, 8] as const;

export const MODEM_PROFILES: Record<ModemProfile['id'], ModemProfile> = {
  audible: {
    id: 'audible',
    label: 'Audible (1,5–3,5 kHz) · más robusto, recomendado para pruebas',
    baseFrequencyHz: 1500,
    toneSpacingHz: 125,
    symbolMs: 90,
  },
  'near-ultrasonic': {
    id: 'near-ultrasonic',
    label: 'Casi ultrasonido (17–19 kHz) · poco audible, depende del hardware',
    baseFrequencyHz: 17000,
    toneSpacingHz: 125,
    symbolMs: 90,
  },
};

export function toneFrequency(profile: ModemProfile, tone: number): number {
  return profile.baseFrequencyHz + tone * profile.toneSpacingHz;
}

/** Bits por segundo nominales del perfil (sin contar preámbulo ni cabecera). */
export function nominalBitRate(profile: ModemProfile): number {
  return 4 / (profile.symbolMs / 1000);
}
