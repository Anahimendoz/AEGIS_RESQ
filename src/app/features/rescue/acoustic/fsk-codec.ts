import { goertzelAmplitude } from './goertzel';
import { ModemProfile, PREAMBLE_TONES, TONE_COUNT, toneFrequency } from './modem-profile';

const RAMP_MS = 6;
const LEAD_SILENCE_MS = 120;
const TRAIL_SILENCE_MS = 250;
/** Ventanas de análisis por símbolo: con 3, al menos 2 caen enteras dentro de cada símbolo. */
const WINDOWS_PER_SYMBOL = 3;
const MIN_WINDOWS_PER_RUN = 2;
const SILENCE_WINDOWS_TO_ABORT = 4;
const SILENCE = -1;

// ---------- Codificación ----------

/** Convierte bytes en la secuencia de tonos (preámbulo + datos con codificación diferencial). */
export function bytesToTones(bytes: Uint8Array): number[] {
  const tones: number[] = [...PREAMBLE_TONES];
  let previous: number = PREAMBLE_TONES[PREAMBLE_TONES.length - 1];
  for (const byte of bytes) {
    for (const nibble of [byte >> 4, byte & 0x0f]) {
      previous = (previous + 1 + nibble) % TONE_COUNT;
      tones.push(previous);
    }
  }
  return tones;
}

/** Sintetiza la señal de audio de una secuencia de tonos, con rampas para evitar chasquidos. */
export function synthesizeTones(
  tones: number[],
  profile: ModemProfile,
  sampleRate: number,
  amplitude = 0.6,
): Float32Array<ArrayBuffer> {
  const symbolSamples = Math.round((profile.symbolMs / 1000) * sampleRate);
  const rampSamples = Math.round((RAMP_MS / 1000) * sampleRate);
  const lead = Math.round((LEAD_SILENCE_MS / 1000) * sampleRate);
  const trail = Math.round((TRAIL_SILENCE_MS / 1000) * sampleRate);
  const output = new Float32Array(lead + tones.length * symbolSamples + trail);

  tones.forEach((tone, index) => {
    const omega = (2 * Math.PI * toneFrequency(profile, tone)) / sampleRate;
    const offset = lead + index * symbolSamples;
    for (let i = 0; i < symbolSamples; i++) {
      const edge = Math.min(i, symbolSamples - 1 - i);
      const envelope = edge < rampSamples ? 0.5 - 0.5 * Math.cos((Math.PI * edge) / rampSamples) : 1;
      output[offset + i] = amplitude * envelope * Math.sin(omega * i);
    }
  });
  return output;
}

export function signalDurationMs(byteCount: number, profile: ModemProfile): number {
  const symbols = PREAMBLE_TONES.length + byteCount * 2;
  return LEAD_SILENCE_MS + symbols * profile.symbolMs + TRAIL_SILENCE_MS;
}

// ---------- Decodificación ----------

export interface DecodedBytes {
  bytes: Uint8Array;
  /** Relación media entre el tono dominante y el resto: indicador de calidad de la recepción. */
  meanToneRatio: number;
}

export interface FrameLengthRule {
  /** Bytes necesarios para conocer la longitud total. */
  headerBytes: number;
  /** Longitud total de la trama a partir de la cabecera, o `null` si la cabecera es inválida. */
  totalLength(header: Uint8Array): number | null;
}

export interface DecoderOptions {
  /** Amplitud mínima del tono dominante para no considerar la ventana como silencio. */
  minAmplitude?: number;
  /** Cuántas veces debe superar el tono dominante a la media de los demás. */
  minToneRatio?: number;
}

/**
 * Decodificador incremental: recibe bloques de audio de cualquier tamaño y entrega tramas completas.
 * No necesita sincronía de reloj: la codificación diferencial garantiza que cada símbolo cambia de
 * tono, así que los cambios de tono marcan los límites de símbolo.
 */
export class FskDecoder {
  private readonly windowSize: number;
  private readonly frequencies: number[];
  private readonly minAmplitude: number;
  private readonly minToneRatio: number;
  private buffer = new Float32Array(0);

  // Segmentación de ventanas en símbolos.
  private runTone = SILENCE;
  private runLength = 0;
  private runRatioSum = 0;
  private candidateTone: number | null = null;
  private candidateLength = 0;
  private candidateRatioSum = 0;

  // Ensamblado de trama.
  private recentSymbols: number[] = [];
  private inFrame = false;
  private previousTone = 0;
  private nibbles: number[] = [];
  private ratioSum = 0;
  private expectedBytes: number | null = null;
  private silenceWindows = 0;

  constructor(
    private readonly profile: ModemProfile,
    private readonly sampleRate: number,
    private readonly lengthRule: FrameLengthRule,
    private readonly onFrame: (decoded: DecodedBytes) => void,
    options: DecoderOptions = {},
  ) {
    const symbolSamples = (profile.symbolMs / 1000) * sampleRate;
    this.windowSize = Math.floor(symbolSamples / WINDOWS_PER_SYMBOL);
    this.frequencies = Array.from({ length: TONE_COUNT }, (_, tone) => toneFrequency(profile, tone));
    this.minAmplitude = options.minAmplitude ?? 0.004;
    this.minToneRatio = options.minToneRatio ?? 4;
  }

  push(samples: Float32Array): void {
    const merged = new Float32Array(this.buffer.length + samples.length);
    merged.set(this.buffer);
    merged.set(samples, this.buffer.length);
    let offset = 0;
    while (offset + this.windowSize <= merged.length) {
      this.classifyWindow(merged, offset);
      offset += this.windowSize;
    }
    this.buffer = merged.slice(offset);
  }

  reset(): void {
    this.buffer = new Float32Array(0);
    this.runTone = SILENCE;
    this.runLength = 0;
    this.runRatioSum = 0;
    this.candidateTone = null;
    this.candidateLength = 0;
    this.recentSymbols = [];
    this.abortFrame();
  }

  private classifyWindow(samples: Float32Array, start: number): void {
    let best = SILENCE;
    let bestAmplitude = 0;
    let total = 0;
    for (let tone = 0; tone < TONE_COUNT; tone++) {
      const amplitude = goertzelAmplitude(samples, start, this.windowSize, this.frequencies[tone], this.sampleRate);
      total += amplitude;
      if (amplitude > bestAmplitude) {
        bestAmplitude = amplitude;
        best = tone;
      }
    }
    const othersMean = (total - bestAmplitude) / (TONE_COUNT - 1);
    const ratio = bestAmplitude / (othersMean + 1e-9);
    const isTone = bestAmplitude >= this.minAmplitude && ratio >= this.minToneRatio;
    this.onWindow(isTone ? best : SILENCE, isTone ? ratio : 0);
  }

  /** Agrupa ventanas consecutivas del mismo tono; un cambio se confirma tras dos ventanas. */
  private onWindow(tone: number, ratio: number): void {
    if (tone === SILENCE) {
      this.silenceWindows++;
      if (this.inFrame && this.silenceWindows >= SILENCE_WINDOWS_TO_ABORT) {
        this.closeRun();
        this.abortFrame();
      }
    } else {
      this.silenceWindows = 0;
    }

    if (tone === this.runTone) {
      this.runLength++;
      this.runRatioSum += ratio;
      this.candidateTone = null;
      return;
    }
    if (tone === this.candidateTone) {
      this.candidateLength++;
      this.candidateRatioSum += ratio;
      if (this.candidateLength >= MIN_WINDOWS_PER_RUN) {
        this.closeRun();
        this.runTone = tone;
        this.runLength = this.candidateLength;
        this.runRatioSum = this.candidateRatioSum;
        this.candidateTone = null;
      }
      return;
    }
    this.candidateTone = tone;
    this.candidateLength = 1;
    this.candidateRatioSum = ratio;
  }

  private closeRun(): void {
    if (this.runTone !== SILENCE && this.runLength >= MIN_WINDOWS_PER_RUN) {
      this.onSymbol(this.runTone, this.runRatioSum / this.runLength);
    }
    this.runTone = SILENCE;
    this.runLength = 0;
    this.runRatioSum = 0;
  }

  private onSymbol(tone: number, ratio: number): void {
    if (!this.inFrame) {
      this.recentSymbols = [...this.recentSymbols, tone].slice(-PREAMBLE_TONES.length);
      if (this.recentSymbols.every((t, i) => t === PREAMBLE_TONES[i]) && this.recentSymbols.length === PREAMBLE_TONES.length) {
        this.inFrame = true;
        this.previousTone = tone;
        this.nibbles = [];
        this.ratioSum = 0;
        this.expectedBytes = null;
        this.recentSymbols = [];
      }
      return;
    }

    const nibble = (tone - this.previousTone - 1 + TONE_COUNT) % TONE_COUNT;
    if (nibble > 0x0f) {
      this.abortFrame();
      return;
    }
    this.previousTone = tone;
    this.nibbles.push(nibble);
    this.ratioSum += ratio;
    if (this.nibbles.length % 2 === 0) {
      this.onByteCompleted();
    }
  }

  private onByteCompleted(): void {
    const byteCount = this.nibbles.length / 2;
    if (this.expectedBytes === null && byteCount === this.lengthRule.headerBytes) {
      this.expectedBytes = this.lengthRule.totalLength(this.assembleBytes());
      if (this.expectedBytes === null) {
        this.abortFrame();
        return;
      }
    }
    if (this.expectedBytes !== null && byteCount >= this.expectedBytes) {
      const decoded = { bytes: this.assembleBytes(), meanToneRatio: this.ratioSum / this.nibbles.length };
      this.abortFrame();
      this.onFrame(decoded);
    }
  }

  private assembleBytes(): Uint8Array {
    const bytes = new Uint8Array(this.nibbles.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = (this.nibbles[2 * i] << 4) | this.nibbles[2 * i + 1];
    }
    return bytes;
  }

  private abortFrame(): void {
    this.inFrame = false;
    this.nibbles = [];
    this.ratioSum = 0;
    this.expectedBytes = null;
  }
}
