import { NodeCapabilities } from '../../shared/models/network.models';

/**
 * Contenido del anuncio BLE (datos de fabricante, id de compañía 0xFFFF reservado para pruebas):
 *   'A' 'R' | versión | id corto (2 bytes) | banderas | batería (0xFF = no compartida)
 */
export const BEACON_COMPANY_ID = 0xffff;
const MAGIC = [0x41, 0x52];
const BEACON_VERSION = 1;
const BEACON_LENGTH = 7;
const NO_BATTERY = 0xff;

const FLAG_RELAY = 0b001;
const FLAG_ACOUSTIC = 0b010;
const FLAG_INTERNET = 0b100;

export interface BeaconContent {
  shortId: number;
  capabilities: NodeCapabilities;
  batteryLevel: number | null;
}

export function encodeBeacon(content: BeaconContent): number[] {
  const { capabilities } = content;
  const flags =
    (capabilities.relayEnabled ? FLAG_RELAY : 0) |
    (capabilities.acousticParticipation ? FLAG_ACOUSTIC : 0) |
    (capabilities.internetReported ? FLAG_INTERNET : 0);
  const battery = content.batteryLevel === null ? NO_BATTERY : Math.max(0, Math.min(100, Math.round(content.batteryLevel)));
  return [...MAGIC, BEACON_VERSION, (content.shortId >> 8) & 0xff, content.shortId & 0xff, flags, battery];
}

/** Interpreta un anuncio; devuelve `null` si no es de Aegis ResQ o está malformado. */
export function parseBeacon(data: DataView): BeaconContent | null {
  if (data.byteLength !== BEACON_LENGTH) return null;
  if (data.getUint8(0) !== MAGIC[0] || data.getUint8(1) !== MAGIC[1] || data.getUint8(2) !== BEACON_VERSION) {
    return null;
  }
  const shortId = data.getUint16(3);
  if (shortId === 0 || shortId === 0xffff) return null;
  const flags = data.getUint8(5);
  const battery = data.getUint8(6);
  return {
    shortId,
    capabilities: {
      relayEnabled: (flags & FLAG_RELAY) !== 0,
      acousticParticipation: (flags & FLAG_ACOUSTIC) !== 0,
      internetReported: (flags & FLAG_INTERNET) !== 0,
    },
    batteryLevel: battery <= 100 ? battery : null,
  };
}

/** Prefijo usado como filtro de escaneo para recibir solo anuncios de Aegis ResQ. */
export function beaconFilterPrefix(): DataView {
  return new DataView(new Uint8Array([...MAGIC, BEACON_VERSION]).buffer);
}
