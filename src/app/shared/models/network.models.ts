/** Modo de operación. En `demo` todos los datos son simulados y se rotulan como tales. */
export type AppMode = 'real' | 'demo';

/**
 * Estado del enlace con un nodo, definido solo con evidencia observable:
 * - `verified`: el nodo confirmó (ACK acústico) un mensaje nuestro en los últimos minutos.
 * - `available`: su anuncio BLE se recibió recientemente.
 * - `out-of-range`: no se recibe nada desde hace un tiempo.
 */
export type NodeLinkState = 'verified' | 'available' | 'out-of-range';

/** Banderas que cada nodo declara en su anuncio BLE. Son autodeclaradas: no se verifican. */
export interface NodeCapabilities {
  relayEnabled: boolean;
  acousticParticipation: boolean;
  internetReported: boolean;
}

export interface LinkStats {
  /** Media de RSSI (dBm) en la ventana reciente. */
  rssiMean: number | null;
  /** Desviación estándar de RSSI: indica estabilidad, no distancia. */
  rssiStdDev: number | null;
  /** Anuncios recibidos por segundo en la ventana reciente. */
  advertisementsPerSecond: number;
  /** Mensajes dirigidos enviados y confirmados por el canal acústico. */
  acousticSent: number;
  acousticAcked: number;
  /** Latencia ida y vuelta medida en la última confirmación acústica (ms). */
  lastRoundTripMs: number | null;
}

export interface NetworkNode {
  /** Identificador corto de sesión (16 bits), aleatorio en cada arranque. */
  shortId: number;
  pseudonym: string;
  firstSeen: number;
  lastSeen: number;
  lastAckAt: number | null;
  state: NodeLinkState;
  capabilities: NodeCapabilities;
  /** Nivel de batería declarado (0-100), solo si el otro usuario decidió compartirlo. */
  batteryLevel: number | null;
  stats: LinkStats;
  simulated: boolean;
}

export type EventSeverity = 'info' | 'warning' | 'error';

export type EventCategory =
  | 'discovery'
  | 'mesh'
  | 'audio'
  | 'detection'
  | 'location'
  | 'permissions'
  | 'config'
  | 'system';

export interface AppEvent {
  id: number;
  at: number;
  category: EventCategory;
  severity: EventSeverity;
  message: string;
  /** Detalle técnico para el diagnóstico. No debe contener audio, coordenadas exactas ni identificadores personales. */
  detail?: string;
  simulated: boolean;
}
