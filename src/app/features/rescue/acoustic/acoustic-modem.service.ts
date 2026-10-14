import { Injectable, inject, signal } from '@angular/core';
import { AppError, toAppError } from '../../../core/errors/app-error';
import { EventLogService } from '../../../core/services/event-log.service';
import { PermissionsService } from '../../../core/services/permissions.service';
import { SettingsService } from '../../../core/services/settings.service';
import { rms } from '../detection/knock-detector';
import { bytesToTones, synthesizeTones } from './fsk-codec';
import { MODEM_PROFILES, ModemProfile, TONE_COUNT, toneFrequency } from './modem-profile';

export type CaptureState = 'off' | 'starting' | 'listening' | 'error';
export type PlaybackState = 'idle' | 'transmitting';
export type SampleListener = (samples: Float32Array, sampleRate: number, timestampMs: number) => void;

/** Tras emitir, se ignora la entrada este tiempo para no decodificar el propio eco. */
const ECHO_GUARD_MS = 400;
const CAPTURE_BATCH = 2048;

const CAPTURE_WORKLET = `
class AegisCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(${CAPTURE_BATCH}); this.length = 0; }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        this.buffer[this.length++] = channel[i];
        if (this.length === this.buffer.length) { this.port.postMessage(this.buffer.slice(0)); this.length = 0; }
      }
    }
    return true;
  }
}
registerProcessor('aegis-capture', AegisCapture);`;

/**
 * Entrada y salida de audio del módem. El micrófono solo se abre con una acción explícita del
 * usuario y su estado es siempre visible. No graba ni guarda audio: las muestras se analizan
 * en memoria y se descartan.
 */
@Injectable({ providedIn: 'root' })
export class AcousticModemService {
  private readonly permissions = inject(PermissionsService);
  private readonly settings = inject(SettingsService);
  private readonly log = inject(EventLogService);

  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private captureNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private playback: AudioBufferSourceNode | null = null;
  private ignoreInputUntil = 0;
  private lastLevelUpdate = 0;
  private readonly listeners = new Set<SampleListener>();

  private readonly captureSignal = signal<CaptureState>('off');
  private readonly playbackSignal = signal<PlaybackState>('idle');
  private readonly levelSignal = signal<number | null>(null);

  readonly capture = this.captureSignal.asReadonly();
  readonly playbackState = this.playbackSignal.asReadonly();
  /** Nivel de entrada en dBFS, solo mientras se escucha. */
  readonly inputLevelDb = this.levelSignal.asReadonly();

  profile(): ModemProfile {
    return MODEM_PROFILES[this.settings.settings().modemProfile];
  }

  sampleRate(): number | null {
    return this.context?.sampleRate ?? null;
  }

  addListener(listener: SampleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async startListening(): Promise<void> {
    if (this.captureSignal() === 'listening' || this.captureSignal() === 'starting') return;
    this.captureSignal.set('starting');
    try {
      await this.permissions.ensure('microphone');
      const context = await this.ensureContext();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      this.sourceNode = context.createMediaStreamSource(this.stream);
      this.captureNode = await this.createCaptureNode(context);
      this.sourceNode.connect(this.captureNode);
      this.captureSignal.set('listening');
      this.log.info('audio', `Micrófono activo (${context.sampleRate} Hz).`);
    } catch (error) {
      this.releaseCapture();
      this.captureSignal.set('error');
      const appError = mapMediaError(error);
      this.log.error('audio', appError);
      throw appError;
    }
  }

  stopListening(): void {
    if (this.captureSignal() === 'off') return;
    this.releaseCapture();
    this.captureSignal.set('off');
    this.levelSignal.set(null);
    this.log.info('audio', 'Micrófono desactivado.');
  }

  /** Emite una trama por el altavoz. Resuelve cuando termina la reproducción. */
  async transmit(bytes: Uint8Array): Promise<void> {
    const context = await this.ensureContext();
    const profile = this.profile();
    const samples = synthesizeTones(bytesToTones(bytes), profile, context.sampleRate);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);

    await this.waitForPlayback();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.playback = source;
    this.playbackSignal.set('transmitting');
    this.ignoreInputUntil = Number.POSITIVE_INFINITY;
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
    this.playback = null;
    this.ignoreInputUntil = performance.now() + ECHO_GUARD_MS;
    this.playbackSignal.set('idle');
  }

  /** Detiene inmediatamente la emisión en curso y el micrófono. */
  stopAll(): void {
    try {
      this.playback?.stop();
    } catch {
      // Ya estaba detenida.
    }
    this.stopListening();
  }

  private async waitForPlayback(): Promise<void> {
    while (this.playbackSignal() === 'transmitting') {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.context) {
      if (typeof AudioContext === 'undefined') throw new AppError('audio-unsupported', 'AudioContext no disponible.');
      this.context = new AudioContext();
    }
    if (this.context.state === 'suspended') await this.context.resume();
    const highest = toneFrequency(this.profile(), TONE_COUNT - 1);
    if (this.context.sampleRate < highest * 2.2) {
      throw new AppError('audio-unsupported', `Frecuencia de muestreo ${this.context.sampleRate} Hz insuficiente para ${highest} Hz.`);
    }
    return this.context;
  }

  private async createCaptureNode(context: AudioContext): Promise<AudioWorkletNode> {
    const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }));
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(context, 'aegis-capture', { numberOfInputs: 1, numberOfOutputs: 0 });
    node.port.onmessage = (event: MessageEvent<Float32Array>) => this.onSamples(event.data, context.sampleRate);
    return node;
  }

  private onSamples(samples: Float32Array, sampleRate: number): void {
    const now = performance.now();
    if (now - this.lastLevelUpdate > 200) {
      this.lastLevelUpdate = now;
      this.levelSignal.set(Math.max(-100, 20 * Math.log10(rms(samples) + 1e-9)));
    }
    if (now < this.ignoreInputUntil) return;
    const timestamp = Date.now();
    for (const listener of this.listeners) listener(samples, sampleRate, timestamp);
  }

  private releaseCapture(): void {
    this.captureNode?.port.close();
    this.captureNode?.disconnect();
    this.sourceNode?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.captureNode = null;
    this.sourceNode = null;
    this.stream = null;
  }
}

function mapMediaError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const name = error instanceof Error ? error.name : '';
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new AppError('permission-denied', detail);
    case 'NotReadableError':
    case 'AbortError':
      return new AppError('microphone-busy', detail);
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new AppError('microphone-missing', detail);
    default:
      return toAppError(error, 'audio-channel-failed');
  }
}
