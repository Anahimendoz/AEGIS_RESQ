import { encodeBeacon, parseBeacon } from './beacon';

const view = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);

describe('beacon', () => {
  it('codifica y decodifica el anuncio BLE', () => {
    const content = {
      shortId: 0xabcd,
      capabilities: { relayEnabled: true, acousticParticipation: false, internetReported: true },
      batteryLevel: 57,
    };
    expect(parseBeacon(view(encodeBeacon(content)))).toEqual(content);
  });

  it('no inventa batería si no se comparte', () => {
    const bytes = encodeBeacon({
      shortId: 1,
      capabilities: { relayEnabled: false, acousticParticipation: false, internetReported: false },
      batteryLevel: null,
    });
    expect(parseBeacon(view(bytes))?.batteryLevel).toBeNull();
  });

  it('ignora anuncios ajenos o malformados', () => {
    expect(parseBeacon(view([0x41, 0x52, 1, 0, 1, 0]))).toBeNull();
    expect(parseBeacon(view([0x41, 0x42, 1, 0, 1, 0, 0xff]))).toBeNull();
    expect(parseBeacon(view([0x41, 0x52, 9, 0, 1, 0, 0xff]))).toBeNull();
    expect(parseBeacon(view([0x41, 0x52, 1, 0xff, 0xff, 0, 0xff]))).toBeNull();
  });
});
