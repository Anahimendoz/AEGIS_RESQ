/**
 * Detector EXPERIMENTAL de golpes repetidos.
 * Busca impulsos de energía (inicios bruscos sobre el ruido de fondo) y avisa cuando aparecen
 * al menos `minKnocks` con intervalos regulares. No está validado: no identifica personas, solo
 * un patrón que un operador humano debe confirmar.
 */
export interface KnockPattern {
  at: number;
  knockCount: number;
  meanIntervalMs: number;
}

export interface KnockDetectorOptions {
  frameMs?: number;
  /** Cuántas veces debe superar la energía al fondo para considerarse impulso. */
  onsetFactor?: number;
  minRms?: number;
  minKnocks?: number;
  minIntervalMs?: number;
  maxIntervalMs?: number;
  /** Coeficiente de variación máximo de los intervalos para considerarlos regulares. */
  maxIntervalVariation?: number;
}

const REFRACTORY_MS = 150;
const BACKGROUND_SMOOTHING = 0.02;

export class KnockDetector {
  private readonly frameSamples: number;
  private readonly frameMs: number;
  private readonly onsetFactor: number;
  private readonly minRms: number;
  private readonly minKnocks: number;
  private readonly minIntervalMs: number;
  private readonly maxIntervalMs: number;
  private readonly maxVariation: number;

  private pending = new Float32Array(0);
  private elapsedMs = 0;
  private background: number | null = null;
  private lastOnsetMs = -Infinity;
  private onsets: number[] = [];

  constructor(
    sampleRate: number,
    private readonly onPattern: (pattern: KnockPattern) => void,
    options: KnockDetectorOptions = {},
  ) {
    this.frameMs = options.frameMs ?? 20;
    this.frameSamples = Math.round((this.frameMs / 1000) * sampleRate);
    this.onsetFactor = options.onsetFactor ?? 6;
    this.minRms = options.minRms ?? 0.02;
    this.minKnocks = options.minKnocks ?? 3;
    this.minIntervalMs = options.minIntervalMs ?? 250;
    this.maxIntervalMs = options.maxIntervalMs ?? 2500;
    this.maxVariation = options.maxIntervalVariation ?? 0.3;
  }

  /** `streamStartMs` permite expresar los eventos en hora real. */
  push(samples: Float32Array, streamStartMs = 0): void {
    const merged = new Float32Array(this.pending.length + samples.length);
    merged.set(this.pending);
    merged.set(samples, this.pending.length);
    let offset = 0;
    while (offset + this.frameSamples <= merged.length) {
      this.processFrame(rms(merged, offset, this.frameSamples), streamStartMs);
      offset += this.frameSamples;
    }
    this.pending = merged.slice(offset);
  }

  private processFrame(level: number, streamStartMs: number): void {
    const now = this.elapsedMs;
    this.elapsedMs += this.frameMs;
    const background = this.background ?? level;
    const isOnset =
      level >= this.minRms && level >= background * this.onsetFactor && now - this.lastOnsetMs >= REFRACTORY_MS;

    if (isOnset) {
      this.lastOnsetMs = now;
      this.onsets = [...this.onsets.filter((t) => now - t <= this.maxIntervalMs * this.minKnocks), now];
      this.evaluate(streamStartMs + now);
    } else {
      this.background = background + BACKGROUND_SMOOTHING * (level - background);
    }
  }

  private evaluate(atMs: number): void {
    if (this.onsets.length < this.minKnocks) return;
    const recent = this.onsets.slice(-this.minKnocks);
    const intervals = recent.slice(1).map((t, i) => t - recent[i]);
    if (intervals.some((d) => d < this.minIntervalMs || d > this.maxIntervalMs)) return;
    const meanInterval = intervals.reduce((s, d) => s + d, 0) / intervals.length;
    const variation =
      Math.sqrt(intervals.reduce((s, d) => s + (d - meanInterval) ** 2, 0) / intervals.length) / meanInterval;
    if (variation > this.maxVariation) return;

    this.onsets = [];
    this.onPattern({ at: atMs, knockCount: recent.length, meanIntervalMs: Math.round(meanInterval) });
  }
}

export function rms(samples: Float32Array, start = 0, length = samples.length): number {
  let sum = 0;
  for (let i = start; i < start + length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(length, 1));
}
