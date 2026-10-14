import { BROADCAST_ID } from '../../../shared/utils/node-id';
import { Frame, FrameType } from './frame';
import { MAX_FRAMES_PER_SOURCE_PER_MINUTE, MeshRouter, SEEN_EXPIRY_MS } from './mesh-router';

const OWN_ID = 0x1111;

function frame(overrides: Partial<Frame> = {}): Frame {
  return {
    type: FrameType.Text,
    messageId: 1,
    ttl: 2,
    source: 0x2222,
    destination: BROADCAST_ID,
    payload: new Uint8Array(),
    ...overrides,
  };
}

describe('MeshRouter', () => {
  let relay = true;
  let router: MeshRouter;

  beforeEach(() => {
    relay = true;
    router = new MeshRouter(() => OWN_ID, () => relay);
  });

  it('entrega y retransmite una difusión con TTL reducido', () => {
    const decision = router.route(frame(), 0);
    expect(decision).toEqual({ deliver: true, acknowledge: false, relay: { ...frame(), ttl: 1 } });
  });

  it('descarta duplicados y tramas propias', () => {
    router.route(frame(), 0);
    expect(router.route(frame(), 10)).toBe('duplicate');
    expect(router.route(frame({ source: OWN_ID }), 10)).toBe('own-frame');
    const outgoing = frame({ source: 0x3333, messageId: 9 });
    router.rememberOutgoing(outgoing, 0);
    expect(router.route(outgoing, 5)).toBe('duplicate');
  });

  it('confirma mensajes dirigidos a este nodo sin reenviarlos', () => {
    expect(router.route(frame({ destination: OWN_ID }), 0)).toEqual({ deliver: true, acknowledge: true, relay: null });
    expect(router.route(frame({ destination: OWN_ID, type: FrameType.Ack, messageId: 2 }), 0)).toEqual({
      deliver: true,
      acknowledge: false,
      relay: null,
    });
  });

  it('reenvía mensajes ajenos solo si el usuario activó la retransmisión y queda TTL', () => {
    const other = frame({ destination: 0x4444 });
    expect(router.route(other, 0)).toEqual({ deliver: false, acknowledge: false, relay: { ...other, ttl: 1 } });
    expect(router.route(frame({ messageId: 3, ttl: 0, destination: 0x4444 }), 0)).toMatchObject({ relay: null });
    relay = false;
    expect(router.route(frame({ messageId: 4 }), 0)).toMatchObject({ relay: null });
  });

  it('confirma difusiones solo si el usuario aceptó participar', () => {
    const participating = new MeshRouter(() => OWN_ID, () => false, () => true);
    expect(participating.route(frame(), 0)).toMatchObject({ acknowledge: true });
    expect(participating.route(frame({ type: FrameType.TestPattern, messageId: 2 }), 0)).toMatchObject({ acknowledge: false });
    expect(router.route(frame({ messageId: 5 }), 0)).toMatchObject({ acknowledge: false });
  });

  it('olvida mensajes vistos tras la expiración', () => {
    router.route(frame(), 0);
    expect(router.route(frame(), SEEN_EXPIRY_MS + 1)).not.toBe('duplicate');
  });

  it('limita la frecuencia por origen', () => {
    for (let i = 0; i < MAX_FRAMES_PER_SOURCE_PER_MINUTE; i++) {
      expect(router.route(frame({ messageId: 100 + i }), i)).not.toBe('rate-limited');
    }
    expect(router.route(frame({ messageId: 999 }), 100)).toBe('rate-limited');
  });
});
