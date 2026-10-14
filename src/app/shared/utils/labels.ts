import { PermissionStatus } from '../../core/services/permissions.service';
import { TriState } from '../../core/services/connectivity.service';
import { NodeLinkState } from '../models/network.models';

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

/** Etiqueta con texto + icono: el estado nunca se comunica solo con color. */
export interface StatusLabel {
  text: string;
  icon: string;
  tone: Tone;
}

export function permissionLabel(status: PermissionStatus): StatusLabel {
  switch (status) {
    case 'granted':
      return { text: 'Concedido', icon: 'checkmark-circle', tone: 'ok' };
    case 'not-required':
      return { text: 'No requerido en esta versión', icon: 'checkmark-circle', tone: 'ok' };
    case 'denied':
      return { text: 'Denegado', icon: 'close-circle', tone: 'bad' };
    case 'prompt':
    case 'prompt-with-rationale':
      return { text: 'Pendiente de solicitar', icon: 'help-circle', tone: 'warn' };
    case 'unsupported':
      return { text: 'No disponible en esta plataforma', icon: 'remove-circle', tone: 'neutral' };
    default:
      return { text: 'Sin comprobar', icon: 'help-circle', tone: 'neutral' };
  }
}

export function linkStateLabel(state: NodeLinkState): StatusLabel {
  switch (state) {
    case 'verified':
      return { text: 'Enlace acústico verificado', icon: 'link', tone: 'ok' };
    case 'available':
      return { text: 'Disponible (visto por BLE)', icon: 'radio', tone: 'warn' };
    default:
      return { text: 'Fuera de alcance', icon: 'cloud-offline', tone: 'bad' };
  }
}

export function triStateLabel(value: TriState, yes: string, no: string): StatusLabel {
  if (value === 'yes') return { text: yes, icon: 'checkmark-circle', tone: 'ok' };
  if (value === 'no') return { text: no, icon: 'close-circle', tone: 'bad' };
  return { text: 'No se puede comprobar', icon: 'help-circle', tone: 'neutral' };
}

/** Clasificación cualitativa de la intensidad recibida. No es una medida de distancia. */
export function rssiLabel(rssi: number | null): string {
  if (rssi === null) return 'Sin medición';
  if (rssi >= -65) return `Fuerte (${rssi.toFixed(0)} dBm)`;
  if (rssi >= -80) return `Media (${rssi.toFixed(0)} dBm)`;
  return `Débil (${rssi.toFixed(0)} dBm)`;
}

export function relativeTime(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 5) return 'ahora';
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `hace ${minutes} min` : `hace ${Math.round(minutes / 60)} h`;
}
