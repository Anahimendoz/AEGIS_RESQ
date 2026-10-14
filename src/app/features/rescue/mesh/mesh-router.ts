import { BROADCAST_ID } from '../../../shared/utils/node-id';
import { Frame, FrameType } from './frame';

export const SEEN_EXPIRY_MS = 5 * 60_000;
const MAX_SEEN_ENTRIES = 512;
const RATE_WINDOW_MS = 60_000;
export const MAX_FRAMES_PER_SOURCE_PER_MINUTE = 20;

export type RoutingRejection = 'own-frame' | 'duplicate' | 'rate-limited';

export interface RoutingDecision {
  /** El mensaje es para este nodo (dirigido o difusión) y debe mostrarse. */
  deliver: boolean;
  /** Debe responderse con una confirmación (solo mensajes dirigidos a este nodo, nunca a un ACK). */
  acknowledge: boolean;
  /** Copia con TTL reducido a retransmitir, o `null` si no corresponde reenviar. */
  relay: Frame | null;
}

/**
 * Lógica de enrutamiento por inundación controlada, sin estado de E/S:
 * descarta duplicados y tramas propias, limita la frecuencia por origen y decide el reenvío.
 */
export class MeshRouter {
  private readonly seen = new Map<string, number>();
  private readonly arrivalsBySource = new Map<number, number[]>();

  constructor(
    private readonly ownId: () => number,
    private readonly relayEnabled: () => boolean,
    /** Si el usuario aceptó participar, también se confirman las difusiones de texto y ubicación. */
    private readonly acknowledgeBroadcasts: () => boolean = () => false,
  ) {}

  /** Registra un mensaje propio para no procesarlo cuando vuelva por la red. */
  rememberOutgoing(frame: Frame, now: number): void {
    this.markSeen(frame, now);
  }

  route(frame: Frame, now: number): RoutingDecision | RoutingRejection {
    this.expire(now);
    if (frame.source === this.ownId()) {
      return 'own-frame';
    }
    if (this.seen.has(this.key(frame))) {
      return 'duplicate';
    }
    if (this.isRateLimited(frame.source, now)) {
      return 'rate-limited';
    }
    this.markSeen(frame, now);

    const forMe = frame.destination === this.ownId();
    const isBroadcast = frame.destination === BROADCAST_ID;
    const relay = !forMe && frame.ttl > 0 && this.relayEnabled() ? { ...frame, ttl: frame.ttl - 1 } : null;
    const confirmable = frame.type === FrameType.Text || frame.type === FrameType.Location;
    return {
      deliver: forMe || isBroadcast,
      acknowledge: (forMe && frame.type !== FrameType.Ack) || (isBroadcast && confirmable && this.acknowledgeBroadcasts()),
      relay,
    };
  }

  private key(frame: Frame): string {
    return `${frame.source}:${frame.messageId}`;
  }

  private markSeen(frame: Frame, now: number): void {
    this.seen.set(this.key(frame), now);
    if (this.seen.size > MAX_SEEN_ENTRIES) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
  }

  private isRateLimited(source: number, now: number): boolean {
    const recent = (this.arrivalsBySource.get(source) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    recent.push(now);
    this.arrivalsBySource.set(source, recent);
    return recent.length > MAX_FRAMES_PER_SOURCE_PER_MINUTE;
  }

  private expire(now: number): void {
    for (const [key, at] of this.seen) {
      if (now - at > SEEN_EXPIRY_MS) this.seen.delete(key);
    }
  }
}
