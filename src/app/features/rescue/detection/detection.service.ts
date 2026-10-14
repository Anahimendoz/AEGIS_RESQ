import { Injectable, inject, signal } from '@angular/core';
import { EventLogService } from '../../../core/services/event-log.service';
import { SessionIdentityService } from '../../../core/services/session-identity.service';
import { pseudonymFor } from '../../../shared/utils/node-id';
import { AcousticModemService } from '../acoustic/acoustic-modem.service';
import { FrameType } from '../mesh/frame';
import { MeshService, TEST_PATTERN_TEXT } from '../mesh/mesh.service';
import { KnockDetector } from './knock-detector';

export type DetectionKind = 'test-pattern' | 'knock-pattern';
/** `experimental`: resultado automático sin validar. Solo una persona puede confirmarlo o descartarlo. */
export type DetectionReview = 'experimental' | 'confirmed-by-human' | 'dismissed';

export interface DetectionEvent {
  id: number;
  kind: DetectionKind;
  at: number;
  receiver: string;
  description: string;
  /** Confianza del detector solo cuando existe una verificación objetiva (CRC de la señal de prueba). */
  confidence: string | null;
  review: DetectionReview;
}

@Injectable({ providedIn: 'root' })
export class DetectionService {
  private readonly modem = inject(AcousticModemService);
  private readonly mesh = inject(MeshService);
  private readonly identity = inject(SessionIdentityService);
  private readonly log = inject(EventLogService);

  private nextId = 1;
  private knockDetector: KnockDetector | null = null;
  private detachKnock: (() => void) | null = null;
  private readonly eventsSignal = signal<DetectionEvent[]>([]);
  private readonly knockEnabledSignal = signal(false);

  readonly events = this.eventsSignal.asReadonly();
  readonly knockDetectionEnabled = this.knockEnabledSignal.asReadonly();

  constructor() {
    this.mesh.received$.subscribe(({ frame, toneRatio, at, hops }) => {
      if (frame.type !== FrameType.TestPattern) return;
      const valid = new TextDecoder().decode(frame.payload) === TEST_PATTERN_TEXT;
      this.add({
        kind: 'test-pattern',
        at,
        description: `Señal de prueba de ${pseudonymFor(frame.source)} ${valid ? 'recibida' : 'con contenido inesperado'} (${hops} saltos).`,
        confidence: valid ? `Trama verificada por CRC · relación tono/resto ${toneRatio.toFixed(1)}` : null,
      });
    });
  }

  /** Activa el detector experimental de golpes. Requiere que el micrófono esté escuchando. */
  enableKnockDetection(): void {
    if (this.detachKnock) return;
    this.detachKnock = this.modem.addListener((samples, sampleRate, timestamp) => {
      this.knockDetector ??= new KnockDetector(sampleRate, (pattern) =>
        this.add({
          kind: 'knock-pattern',
          at: pattern.at,
          description: `Posible patrón de ${pattern.knockCount} golpes regulares (cada ~${(pattern.meanIntervalMs / 1000).toFixed(1)} s).`,
          confidence: null,
        }),
      );
      this.knockDetector.push(samples, timestamp - (samples.length / sampleRate) * 1000);
    });
    this.knockEnabledSignal.set(true);
    this.log.info('detection', 'Detector experimental de golpes activado.');
  }

  disableKnockDetection(): void {
    this.detachKnock?.();
    this.detachKnock = null;
    this.knockDetector = null;
    this.knockEnabledSignal.set(false);
  }

  review(id: number, review: DetectionReview): void {
    this.eventsSignal.update((list) => list.map((e) => (e.id === id ? { ...e, review } : e)));
    this.log.info('detection', `Detección #${id} marcada como «${review}» por el operador.`);
  }

  private add(event: Omit<DetectionEvent, 'id' | 'receiver' | 'review'>): void {
    const full: DetectionEvent = { ...event, id: this.nextId++, receiver: this.identity.pseudonym, review: 'experimental' };
    this.eventsSignal.update((list) => [full, ...list].slice(0, 100));
    this.log.info('detection', full.description);
  }
}
