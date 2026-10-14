/**
 * Algoritmo de Goertzel: estima la amplitud de una frecuencia concreta en un bloque de muestras.
 * Devuelve una amplitud aproximada (1.0 = seno de amplitud completa).
 */
export function goertzelAmplitude(
  samples: Float32Array,
  start: number,
  length: number,
  frequencyHz: number,
  sampleRate: number,
): number {
  const coefficient = 2 * Math.cos((2 * Math.PI * frequencyHz) / sampleRate);
  let previous = 0;
  let beforePrevious = 0;
  for (let i = 0; i < length; i++) {
    const current = samples[start + i] + coefficient * previous - beforePrevious;
    beforePrevious = previous;
    previous = current;
  }
  const power = previous * previous + beforePrevious * beforePrevious - coefficient * previous * beforePrevious;
  return (2 * Math.sqrt(Math.max(power, 0))) / length;
}
