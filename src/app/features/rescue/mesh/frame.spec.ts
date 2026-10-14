import {
  FrameError,
  FrameType,
  MAX_PAYLOAD_BYTES,
  decodeAck,
  decodeFrame,
  decodeLocation,
  decodeText,
  encodeAck,
  encodeFrame,
  encodeLocation,
  encodeText,
} from './frame';

const base = { type: FrameType.Text, messageId: 42, ttl: 2, source: 0x0a0b, destination: 0x0c0d };

describe('frame', () => {
  it('codifica y decodifica sin pérdida', () => {
    const payload = encodeText('Hola ñandú');
    const frame = decodeFrame(encodeFrame({ ...base, payload }));
    expect({ ...frame, payload: Array.from(frame.payload) }).toEqual({ ...base, payload: Array.from(payload) });
    expect(decodeText(frame.payload)).toBe('Hola ñandú');
  });

  it('rechaza tramas con CRC alterado', () => {
    const bytes = encodeFrame({ ...base, payload: encodeText('x') });
    bytes[9] ^= 0xff;
    expect(() => decodeFrame(bytes)).toThrow(FrameError);
  });

  it('rechaza tramas truncadas, con tipo desconocido o longitud incoherente', () => {
    const bytes = encodeFrame({ ...base, payload: encodeText('abc') });
    expect(() => decodeFrame(bytes.slice(0, 5))).toThrow(FrameError);
    expect(() => decodeFrame(bytes.slice(0, bytes.length - 1))).toThrow(FrameError);
    const badType = bytes.slice();
    badType[0] = 0x1f;
    expect(() => decodeFrame(badType)).toThrow(FrameError);
  });

  it('limita la carga útil y recorta el texto sin romper caracteres', () => {
    expect(() => encodeFrame({ ...base, payload: new Uint8Array(MAX_PAYLOAD_BYTES + 1) })).toThrow(FrameError);
    const text = encodeText('ñ'.repeat(40));
    expect(text.length).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    expect(decodeText(text)).toBe('ñ'.repeat(16));
  });

  it('codifica ubicación y confirmaciones', () => {
    const location = decodeLocation(encodeLocation({ latitude: 10.391049, longitude: -75.479426, accuracyMeters: 12.4 }));
    expect(location.latitude).toBeCloseTo(10.391049, 6);
    expect(location.longitude).toBeCloseTo(-75.479426, 6);
    expect(location.accuracyMeters).toBe(12);
    expect(decodeAck(encodeAck(0xabcd))).toBe(0xabcd);
  });
});
