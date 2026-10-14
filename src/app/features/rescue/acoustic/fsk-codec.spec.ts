import { FRAME_LENGTH_RULE, FrameType, decodeFrame, encodeFrame, encodeText } from '../mesh/frame';
import { DecodedBytes, FskDecoder, bytesToTones, synthesizeTones } from './fsk-codec';
import { MODEM_PROFILES, ModemProfile } from './modem-profile';

const SAMPLE_RATE = 48_000;

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

function addNoise(signal: Float32Array, amplitude: number, random: () => number): Float32Array {
  return signal.map((s) => s + (random() * 2 - 1) * amplitude);
}

function decodeAll(signal: Float32Array, profile: ModemProfile, chunk = 2048): DecodedBytes[] {
  const frames: DecodedBytes[] = [];
  const decoder = new FskDecoder(profile, SAMPLE_RATE, FRAME_LENGTH_RULE, (f) => frames.push(f));
  for (let i = 0; i < signal.length; i += chunk) {
    decoder.push(signal.subarray(i, i + chunk));
  }
  return frames;
}

const sampleFrame = encodeFrame({
  type: FrameType.Text,
  messageId: 0xbeef,
  ttl: 3,
  source: 0x1234,
  destination: 0xffff,
  payload: encodeText('Atrapado, necesito ayuda'),
});

describe('FSK codec', () => {
  for (const profile of Object.values(MODEM_PROFILES)) {
    it(`recupera una trama completa con el perfil ${profile.id}`, () => {
      const signal = synthesizeTones(bytesToTones(sampleFrame), profile, SAMPLE_RATE);
      const frames = decodeAll(signal, profile);
      expect(frames.length).toBe(1);
      expect(Array.from(frames[0].bytes)).toEqual(Array.from(sampleFrame));
    });
  }

  it('tolera ruido, desalineación y bloques de tamaño irregular', () => {
    const profile = MODEM_PROFILES.audible;
    const random = seededRandom(7);
    const tone = synthesizeTones(bytesToTones(sampleFrame), profile, SAMPLE_RATE, 0.3);
    const offset = new Float32Array(1_337);
    const signal = new Float32Array(offset.length + tone.length);
    signal.set(tone, offset.length);
    const frames = decodeAll(addNoise(signal, 0.05, random), profile, 1_000);
    expect(frames.length).toBe(1);
    const frame = decodeFrame(frames[0].bytes);
    expect(frame.messageId).toBe(0xbeef);
    expect(frames[0].meanToneRatio).toBeGreaterThan(4);
  });

  it('no inventa tramas a partir de ruido o silencio', () => {
    const random = seededRandom(42);
    const noise = addNoise(new Float32Array(SAMPLE_RATE * 3), 0.3, random);
    expect(decodeAll(noise, MODEM_PROFILES.audible)).toEqual([]);
    expect(decodeAll(new Float32Array(SAMPLE_RATE), MODEM_PROFILES.audible)).toEqual([]);
  });

  it('decodifica dos tramas consecutivas', () => {
    const profile = MODEM_PROFILES.audible;
    const one = synthesizeTones(bytesToTones(sampleFrame), profile, SAMPLE_RATE);
    const signal = new Float32Array(one.length * 2);
    signal.set(one);
    signal.set(one, one.length);
    expect(decodeAll(signal, profile).length).toBe(2);
  });
});
