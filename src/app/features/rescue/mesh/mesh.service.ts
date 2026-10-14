import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Subject } from 'rxjs';
import { toAppError } from '../../../core/errors/app-error';
import { EventLogService } from '../../../core/services/event-log.service';
import { SessionIdentityService } from '../../../core/services/session-identity.service';
import { SettingsService } from '../../../core/services/settings.service';
import { BROADCAST_ID, pseudonymFor } from '../../../shared/utils/node-id';
import { DiscoveryService } from '../../devices/discovery.service';
import { AcousticModemService } from '../acoustic/acoustic-modem.service';
import { DecodedBytes, FskDecoder } from '../acoustic/fsk-codec';
import {
  FRAME_LENGTH_RULE,
  Frame,
  FrameError,
  FrameType,
  LocationPayload,
  decodeAck,
  decodeFrame,
  decodeLocation,
  decodeText,
  encodeAck,
  encodeFrame,
  encodeLocation,
  encodeText,
} from './frame';
import { MeshRouter } from './mesh-router';

/** TTL con el que se originan todas las tramas: permite deducir los saltos recorridos. */
export const DEFAULT_TTL = 3;
const ACK_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const BROADCAST_ACK_WINDOW_MS = 20_000;
const ACK_DELAY_MS: [number, number] = [400, 2_500];
const BROADCAST_ACK_DELAY_MS: [number, number] = [500, 6_000];
const RELAY_DELAY_MS: [number, number] = [1_000, 3_500];
const MAX_MESSAGES = 100;
export const TEST_PATTERN_TEXT = 'AEGIS-TEST';

export type RecipientStatus = 'pending' | 'confirmed' | 'no-confirmation';
export type MessageStatus = 'queued' | 'sending' | 'awaiting-ack' | 'confirmed' | 'sent' | 'failed' | 'received' | 'stopped';

export interface MeshMessage {
  key: string;
  direction: 'in' | 'out';
  type: FrameType;
  text: string | null;
  location: LocationPayload | null;
  source: number;
  destination: number;
  at: number;
  status: MessageStatus;
  attempts: number;
  hops: number | null;
  /** Calidad de la recepción acústica (relación tono/resto), solo para mensajes recibidos. */
  toneRatio: number | null;
  recipients: { shortId: number; status: RecipientStatus }[];
}

export interface ReceivedFrame {
  frame: Frame;
  toneRatio: number;
  at: number;
  hops: number;
}

/**
 * Red de malla sobre el canal acústico: cola de emisión (semidúplex), confirmaciones,
 * reintentos limitados, reenvío opcional y descarte de duplicados.
 */
@Injectable({ providedIn: 'root' })
export class MeshService {
  private readonly modem = inject(AcousticModemService);
  private readonly identity = inject(SessionIdentityService);
  private readonly settings = inject(SettingsService);
  private readonly discovery = inject(DiscoveryService);
  private readonly log = inject(EventLogService);

  private readonly router = new MeshRouter(
    () => this.identity.shortId,
    () => this.settings.settings().relayEnabled,
    () => this.settings.settings().acousticParticipation,
  );
  private decoder: FskDecoder | null = null;
  private decoderKey = '';
  private queue: Promise<void> = Promise.resolve();
  private stopped = false;
  private readonly ackWaiters = new Map<number, (ackSource: number) => void>();

  private readonly messagesSignal = signal<MeshMessage[]>([]);
  readonly messages = this.messagesSignal.asReadonly();
  readonly received$ = new Subject<ReceivedFrame>();

  constructor() {
    this.modem.addListener((samples, sampleRate) => this.decoderFor(sampleRate).push(samples));
    // Al cambiar de perfil acústico se reinicia el decodificador.
    effect(() => {
      this.settings.settings().modemProfile;
      untracked(() => (this.decoderKey = ''));
    });
  }

  /** Mensaje dirigido a un nodo, con confirmación y hasta dos reintentos. */
  async sendDirected(destination: number, text: string): Promise<void> {
    const frame = this.newFrame(FrameType.Text, destination, encodeText(text));
    const message = this.addOutgoing(frame, text, null, [{ shortId: destination, status: 'pending' }]);
    this.stopped = false;
    for (let attempt = 1; attempt <= MAX_RETRIES + 1 && !this.stopped; attempt++) {
      this.patch(message.key, { attempts: attempt, status: 'sending' });
      this.discovery.recordAcousticSend(destination);
      if (!(await this.enqueueTransmission(frame, message.key))) return;
      // La espera y la latencia se miden desde el final de la emisión.
      const sentAt = Date.now();
      this.patch(message.key, { status: 'awaiting-ack' });
      const acked = await this.waitForAck(frame.messageId, ACK_TIMEOUT_MS, () => true);
      if (acked.length) {
        this.discovery.recordAcousticAck(destination, Date.now() - sentAt);
        this.patch(message.key, { status: 'confirmed', recipients: [{ shortId: destination, status: 'confirmed' }] });
        return;
      }
    }
    if (!this.stopped) {
      this.patch(message.key, { status: 'failed', recipients: [{ shortId: destination, status: 'no-confirmation' }] });
      this.log.warn('mesh', `Sin confirmación de ${pseudonymFor(destination)} tras ${MAX_RETRIES + 1} intentos.`);
    }
  }

  /** Difusión única: el sonido llega a todos a la vez; quienes participan confirman por separado. */
  async sendBroadcast(text: string, recipients: number[]): Promise<void> {
    const frame = this.newFrame(FrameType.Text, BROADCAST_ID, encodeText(text));
    await this.broadcastFrame(frame, text, null, recipients);
  }

  async sendLocation(location: LocationPayload, recipients: number[]): Promise<void> {
    const frame = this.newFrame(FrameType.Location, BROADCAST_ID, encodeLocation(location));
    await this.broadcastFrame(frame, null, location, recipients);
  }

  /** Señal de prueba conocida, sin reenvío (TTL 0), para comprobar la recepción entre dos teléfonos. */
  async sendTestPattern(): Promise<void> {
    const frame = { ...this.newFrame(FrameType.TestPattern, BROADCAST_ID, encodeText(TEST_PATTERN_TEXT)), ttl: 0 };
    const message = this.addOutgoing(frame, TEST_PATTERN_TEXT, null, []);
    this.stopped = false;
    if (await this.enqueueTransmission(frame, message.key)) this.patch(message.key, { status: 'sent' });
  }

  /** Detiene la sesión: cancela esperas, vacía la cola y corta el audio. */
  stopSession(): void {
    this.stopped = true;
    for (const resolve of this.ackWaiters.values()) resolve(-1);
    this.ackWaiters.clear();
    this.modem.stopAll();
    this.messagesSignal.update((list) =>
      list.map((m) => (['queued', 'sending', 'awaiting-ack'].includes(m.status) ? { ...m, status: 'stopped' } : m)),
    );
    this.log.info('audio', 'Sesión acústica detenida por el usuario.');
  }

  clearMessages(): void {
    this.messagesSignal.set([]);
  }

  private async broadcastFrame(frame: Frame, text: string | null, location: LocationPayload | null, recipients: number[]): Promise<void> {
    const message = this.addOutgoing(frame, text, location, recipients.map((shortId) => ({ shortId, status: 'pending' })));
    this.stopped = false;
    recipients.forEach((shortId) => this.discovery.recordAcousticSend(shortId));
    if (!(await this.enqueueTransmission(frame, message.key))) return;
    const sentAt = Date.now();
    this.patch(message.key, { status: recipients.length ? 'awaiting-ack' : 'sent' });
    await this.waitForAck(frame.messageId, BROADCAST_ACK_WINDOW_MS, (source) => {
      this.setRecipient(message.key, source, 'confirmed');
      this.discovery.recordAcousticAck(source, Date.now() - sentAt);
      return false;
    });
    if (this.stopped) return;
    this.messagesSignal.update((list) =>
      list.map((m) =>
        m.key === message.key
          ? {
              ...m,
              status: 'sent',
              recipients: m.recipients.map((r) => (r.status === 'pending' ? { ...r, status: 'no-confirmation' } : r)),
            }
          : m,
      ),
    );
  }

  /** Espera confirmaciones; `onAck` decide si una basta para terminar (true) o se sigue escuchando. */
  private waitForAck(messageId: number, timeoutMs: number, onAck: (source: number) => boolean): Promise<number[]> {
    return new Promise((resolve) => {
      const sources: number[] = [];
      const finish = () => {
        clearTimeout(timer);
        this.ackWaiters.delete(messageId);
        resolve(sources);
      };
      const timer = setTimeout(finish, timeoutMs);
      this.ackWaiters.set(messageId, (source) => {
        if (source < 0) return finish();
        sources.push(source);
        if (onAck(source)) finish();
      });
    });
  }

  private enqueueTransmission(frame: Frame, messageKey?: string, delayMs = 0): Promise<boolean> {
    const bytes = encodeFrame(frame);
    this.router.rememberOutgoing(frame, Date.now());
    const run = async (): Promise<boolean> => {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (this.stopped && messageKey) return false;
      try {
        await this.modem.transmit(bytes);
        return true;
      } catch (error) {
        const appError = toAppError(error, 'audio-channel-failed');
        this.log.error('audio', appError);
        if (messageKey) this.patch(messageKey, { status: 'failed' });
        return false;
      }
    };
    const result = this.queue.then(run);
    this.queue = result.then(() => undefined);
    return result;
  }

  private decoderFor(sampleRate: number): FskDecoder {
    const profile = this.modem.profile();
    const key = `${profile.id}@${sampleRate}`;
    if (!this.decoder || key !== this.decoderKey) {
      this.decoder = new FskDecoder(profile, sampleRate, FRAME_LENGTH_RULE, (decoded) => this.onDecoded(decoded));
      this.decoderKey = key;
    }
    return this.decoder;
  }

  private onDecoded(decoded: DecodedBytes): void {
    let frame: Frame;
    try {
      frame = decodeFrame(decoded.bytes);
    } catch (error) {
      if (error instanceof FrameError) {
        this.log.warn('mesh', 'Trama acústica descartada por inválida.', error.message);
        return;
      }
      throw error;
    }
    const now = Date.now();
    const decision = this.router.route(frame, now);
    if (typeof decision === 'string') return;

    const hops = Math.max(0, DEFAULT_TTL - frame.ttl);
    if (hops === 0) this.discovery.recordAcousticContact(frame.source);

    if (frame.type === FrameType.Ack && decision.deliver) {
      this.handleAck(frame);
    } else if (decision.deliver) {
      this.handleDelivered(frame, decoded.meanToneRatio, hops, now);
    }
    if (decision.acknowledge) {
      const [min, max] = frame.destination === BROADCAST_ID ? BROADCAST_ACK_DELAY_MS : ACK_DELAY_MS;
      const ack = this.newFrame(FrameType.Ack, frame.source, encodeAck(frame.messageId));
      void this.enqueueTransmission(ack, undefined, randomBetween(min, max));
    }
    if (decision.relay) {
      this.log.info('mesh', `Reenviando mensaje de ${pseudonymFor(frame.source)} (TTL ${decision.relay.ttl}).`);
      void this.enqueueTransmission(decision.relay, undefined, randomBetween(...RELAY_DELAY_MS));
    }
  }

  private handleAck(frame: Frame): void {
    try {
      this.ackWaiters.get(decodeAck(frame.payload))?.(frame.source);
    } catch (error) {
      this.log.warn('mesh', 'Confirmación malformada descartada.', String(error));
    }
  }

  private handleDelivered(frame: Frame, toneRatio: number, hops: number, at: number): void {
    let text: string | null = null;
    let location: LocationPayload | null = null;
    try {
      if (frame.type === FrameType.Location) location = decodeLocation(frame.payload);
      else text = decodeText(frame.payload);
    } catch (error) {
      this.log.warn('mesh', 'Contenido de trama inválido.', String(error));
      return;
    }
    this.addMessage({
      key: `${frame.source}:${frame.messageId}`,
      direction: 'in',
      type: frame.type,
      text,
      location,
      source: frame.source,
      destination: frame.destination,
      at,
      status: 'received',
      attempts: 1,
      hops,
      toneRatio,
      recipients: [],
    });
    this.log.info('mesh', `Mensaje recibido de ${pseudonymFor(frame.source)} (${hops} saltos).`);
    this.received$.next({ frame, toneRatio, at, hops });
  }

  private newFrame(type: FrameType, destination: number, payload: Uint8Array): Frame {
    return {
      type,
      messageId: Math.floor(Math.random() * 0x10000),
      ttl: DEFAULT_TTL,
      source: this.identity.shortId,
      destination,
      payload,
    };
  }

  private addOutgoing(frame: Frame, text: string | null, location: LocationPayload | null, recipients: MeshMessage['recipients']): MeshMessage {
    const message: MeshMessage = {
      key: `${frame.source}:${frame.messageId}`,
      direction: 'out',
      type: frame.type,
      text,
      location,
      source: frame.source,
      destination: frame.destination,
      at: Date.now(),
      status: 'queued',
      attempts: 0,
      hops: null,
      toneRatio: null,
      recipients,
    };
    this.addMessage(message);
    return message;
  }

  private addMessage(message: MeshMessage): void {
    this.messagesSignal.update((list) => [message, ...list].slice(0, MAX_MESSAGES));
  }

  private patch(key: string, changes: Partial<MeshMessage>): void {
    this.messagesSignal.update((list) => list.map((m) => (m.key === key ? { ...m, ...changes } : m)));
  }

  private setRecipient(key: string, shortId: number, status: RecipientStatus): void {
    this.messagesSignal.update((list) =>
      list.map((m) => {
        if (m.key !== key) return m;
        const known = m.recipients.some((r) => r.shortId === shortId);
        const recipients = known
          ? m.recipients.map((r) => (r.shortId === shortId ? { ...r, status } : r))
          : [...m.recipients, { shortId, status }];
        return { ...m, recipients };
      }),
    );
  }
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
