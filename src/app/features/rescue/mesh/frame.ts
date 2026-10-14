import { FrameLengthRule } from '../acoustic/fsk-codec';

/**
 * Formato binario de una trama de la red (independiente del medio de transporte):
 *
 *  byte 0      versión (4 bits) | tipo (4 bits)
 *  bytes 1-2   id del mensaje (aleatorio)
 *  byte 3      TTL: saltos restantes
 *  bytes 4-5   nodo origen
 *  bytes 6-7   nodo destino (0xFFFF = difusión)
 *  byte 8      longitud de la carga útil
 *  bytes 9..   carga útil
 *  último      CRC-8 de todo lo anterior
 */
export const PROTOCOL_VERSION = 1;
export const HEADER_BYTES = 9;
export const MAX_PAYLOAD_BYTES = 32;
export const MAX_TTL = 4;

export enum FrameType {
  Text = 1,
  Ack = 2,
  TestPattern = 3,
  Location = 4,
}

export interface Frame {
  type: FrameType;
  messageId: number;
  ttl: number;
  source: number;
  destination: number;
  payload: Uint8Array;
}

export class FrameError extends Error {}

export function crc8(bytes: Uint8Array, length = bytes.length): number {
  let crc = 0;
  for (let i = 0; i < length; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

export function encodeFrame(frame: Frame): Uint8Array {
  if (frame.payload.length > MAX_PAYLOAD_BYTES) {
    throw new FrameError(`La carga útil supera ${MAX_PAYLOAD_BYTES} bytes.`);
  }
  if (frame.ttl < 0 || frame.ttl > MAX_TTL) {
    throw new FrameError('TTL fuera de rango.');
  }
  const bytes = new Uint8Array(HEADER_BYTES + frame.payload.length + 1);
  bytes[0] = (PROTOCOL_VERSION << 4) | (frame.type & 0x0f);
  writeUint16(bytes, 1, frame.messageId);
  bytes[3] = frame.ttl;
  writeUint16(bytes, 4, frame.source);
  writeUint16(bytes, 6, frame.destination);
  bytes[8] = frame.payload.length;
  bytes.set(frame.payload, HEADER_BYTES);
  bytes[bytes.length - 1] = crc8(bytes, bytes.length - 1);
  return bytes;
}

/** Valida y decodifica una trama recibida. Rechaza versiones, tipos, longitudes y CRC inválidos. */
export function decodeFrame(bytes: Uint8Array): Frame {
  if (bytes.length < HEADER_BYTES + 1) {
    throw new FrameError('Trama demasiado corta.');
  }
  if (bytes[0] >> 4 !== PROTOCOL_VERSION) {
    throw new FrameError('Versión de protocolo desconocida.');
  }
  const type = bytes[0] & 0x0f;
  if (!Object.values(FrameType).includes(type)) {
    throw new FrameError('Tipo de trama desconocido.');
  }
  const payloadLength = bytes[8];
  if (payloadLength > MAX_PAYLOAD_BYTES || bytes.length !== HEADER_BYTES + payloadLength + 1) {
    throw new FrameError('Longitud de trama inválida.');
  }
  if (crc8(bytes, bytes.length - 1) !== bytes[bytes.length - 1]) {
    throw new FrameError('CRC inválido.');
  }
  if (bytes[3] > MAX_TTL) {
    throw new FrameError('TTL fuera de rango.');
  }
  return {
    type: type as FrameType,
    messageId: readUint16(bytes, 1),
    ttl: bytes[3],
    source: readUint16(bytes, 4),
    destination: readUint16(bytes, 6),
    payload: bytes.slice(HEADER_BYTES, HEADER_BYTES + payloadLength),
  };
}

/** Regla para que el decodificador acústico sepa cuándo termina una trama. */
export const FRAME_LENGTH_RULE: FrameLengthRule = {
  headerBytes: HEADER_BYTES,
  totalLength(header: Uint8Array): number | null {
    if (header[0] >> 4 !== PROTOCOL_VERSION || header[8] > MAX_PAYLOAD_BYTES) {
      return null;
    }
    return HEADER_BYTES + header[8] + 1;
  },
};

// ---------- Cargas útiles ----------

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

/** Codifica texto UTF-8 recortándolo para no partir caracteres multibyte. */
export function encodeText(text: string): Uint8Array {
  let encoded = textEncoder.encode(text);
  let end = text.length;
  while (encoded.length > MAX_PAYLOAD_BYTES && end > 0) {
    end--;
    encoded = textEncoder.encode(text.slice(0, end));
  }
  return encoded;
}

export function decodeText(payload: Uint8Array): string {
  try {
    return textDecoder.decode(payload);
  } catch {
    throw new FrameError('Texto con codificación inválida.');
  }
}

export interface LocationPayload {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

/** Latitud y longitud en microgrados (int32) y precisión en metros (uint16). */
export function encodeLocation(location: LocationPayload): Uint8Array {
  const bytes = new Uint8Array(10);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, Math.round(location.latitude * 1e6));
  view.setInt32(4, Math.round(location.longitude * 1e6));
  view.setUint16(8, Math.min(Math.round(location.accuracyMeters), 0xffff));
  return bytes;
}

export function decodeLocation(payload: Uint8Array): LocationPayload {
  if (payload.length !== 10) {
    throw new FrameError('Carga de ubicación inválida.');
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const latitude = view.getInt32(0) / 1e6;
  const longitude = view.getInt32(4) / 1e6;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new FrameError('Coordenadas fuera de rango.');
  }
  return { latitude, longitude, accuracyMeters: view.getUint16(8) };
}

export function encodeAck(messageId: number): Uint8Array {
  const bytes = new Uint8Array(2);
  writeUint16(bytes, 0, messageId);
  return bytes;
}

export function decodeAck(payload: Uint8Array): number {
  if (payload.length !== 2) {
    throw new FrameError('Confirmación inválida.');
  }
  return readUint16(payload, 0);
}

function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}
