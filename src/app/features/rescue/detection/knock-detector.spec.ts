import { KnockDetector, KnockPattern } from './knock-detector';

const SAMPLE_RATE = 16_000;

function knockTrain(times: number[], durationMs: number, noise = 0.003): Float32Array {
  const signal = new Float32Array(Math.round((durationMs / 1000) * SAMPLE_RATE));
  let seed = 1;
  for (let i = 0; i < signal.length; i++) {
    seed = (seed * 16_807) % 2_147_483_647;
    signal[i] = (seed / 2_147_483_647 - 0.5) * 2 * noise;
  }
  for (const t of times) {
    const start = Math.round((t / 1000) * SAMPLE_RATE);
    for (let i = 0; i < SAMPLE_RATE * 0.03; i++) {
      signal[start + i] += 0.6 * Math.exp(-i / (SAMPLE_RATE * 0.006)) * Math.sin(i * 0.9);
    }
  }
  return signal;
}

function detect(signal: Float32Array): KnockPattern[] {
  const patterns: KnockPattern[] = [];
  const detector = new KnockDetector(SAMPLE_RATE, (p) => patterns.push(p));
  for (let i = 0; i < signal.length; i += 1_024) detector.push(signal.subarray(i, i + 1_024));
  return patterns;
}

describe('KnockDetector (experimental)', () => {
  it('detecta tres golpes regulares', () => {
    const patterns = detect(knockTrain([1_000, 1_800, 2_600], 4_000));
    expect(patterns.length).toBe(1);
    expect(patterns[0].knockCount).toBe(3);
    expect(patterns[0].meanIntervalMs).toBeGreaterThan(700);
    expect(patterns[0].meanIntervalMs).toBeLessThan(900);
  });

  it('no detecta nada con ruido de fondo o un golpe aislado', () => {
    expect(detect(knockTrain([], 4_000))).toEqual([]);
    expect(detect(knockTrain([1_500], 4_000))).toEqual([]);
  });

  it('ignora golpes irregulares', () => {
    expect(detect(knockTrain([500, 800, 3_000], 4_000))).toEqual([]);
  });
});
