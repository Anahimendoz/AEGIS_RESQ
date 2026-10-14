import { TestBed } from '@angular/core/testing';
import { SessionIdentityService } from '../../../core/services/session-identity.service';
import { AcousticModemService, SampleListener } from '../acoustic/acoustic-modem.service';
import { bytesToTones, synthesizeTones } from '../acoustic/fsk-codec';
import { MODEM_PROFILES } from '../acoustic/modem-profile';
import { FrameType, decodeFrame, encodeAck, encodeFrame, encodeText } from './frame';
import { DEFAULT_TTL, MeshService } from './mesh.service';

const SAMPLE_RATE = 48_000;
const PEER = 0x0bad;

/** Módem falso: registra lo emitido y permite inyectar audio sintetizado como si llegara por el micrófono. */
class FakeModem {
  transmitted: Uint8Array[] = [];
  private listeners: SampleListener[] = [];
  readonly capture = () => 'listening' as const;
  readonly playbackState = () => 'idle' as const;
  profile = () => MODEM_PROFILES.audible;
  addListener(listener: SampleListener): () => void {
    this.listeners.push(listener);
    return () => undefined;
  }
  async transmit(bytes: Uint8Array): Promise<void> {
    this.transmitted.push(bytes);
  }
  stopAll(): void {}
  hear(bytes: Uint8Array): void {
    const samples = synthesizeTones(bytesToTones(bytes), MODEM_PROFILES.audible, SAMPLE_RATE);
    this.listeners.forEach((l) => l(samples, SAMPLE_RATE, Date.now()));
  }
}

describe('MeshService (integración con el códec acústico)', () => {
  let modem: FakeModem;
  let mesh: MeshService;
  let ownId: number;

  beforeEach(() => {
    modem = new FakeModem();
    TestBed.configureTestingModule({ providers: [{ provide: AcousticModemService, useValue: modem }] });
    mesh = TestBed.inject(MeshService);
    ownId = TestBed.inject(SessionIdentityService).shortId;
  });

  it('un mensaje dirigido pasa a «confirmado» al recibir el ACK por audio', async () => {
    const sending = mesh.sendDirected(PEER, 'Necesito ayuda');
    await vi.waitFor(() => expect(mesh.messages()[0].status).toBe('awaiting-ack'));
    const sent = decodeFrame(modem.transmitted[0]);
    expect(sent).toMatchObject({ type: FrameType.Text, destination: PEER, ttl: DEFAULT_TTL });

    modem.hear(
      encodeFrame({ type: FrameType.Ack, messageId: 1, ttl: DEFAULT_TTL, source: PEER, destination: ownId, payload: encodeAck(sent.messageId) }),
    );
    await sending;
    expect(mesh.messages()[0].status).toBe('confirmed');
  });

  it('entrega mensajes recibidos y responde con ACK si van dirigidos a este nodo', async () => {
    modem.hear(
      encodeFrame({ type: FrameType.Text, messageId: 7, ttl: DEFAULT_TTL, source: PEER, destination: ownId, payload: encodeText('Hola') }),
    );
    expect(mesh.messages()[0]).toMatchObject({ direction: 'in', text: 'Hola', hops: 0, source: PEER });
    await vi.waitFor(() => expect(modem.transmitted.length).toBe(1), { timeout: 4_000 });
    const ack = decodeFrame(modem.transmitted[0]);
    expect(ack).toMatchObject({ type: FrameType.Ack, destination: PEER });
  });

  it('descarta el mismo mensaje recibido dos veces', () => {
    const frame = encodeFrame({ type: FrameType.Text, messageId: 9, ttl: 2, source: PEER, destination: 0xffff, payload: encodeText('x') });
    modem.hear(frame);
    modem.hear(frame);
    expect(mesh.messages().filter((m) => m.direction === 'in').length).toBe(1);
  });

  it('detener la sesión cancela la espera de confirmación', async () => {
    const sending = mesh.sendDirected(PEER, 'Prueba');
    await vi.waitFor(() => expect(mesh.messages()[0].status).toBe('awaiting-ack'));
    mesh.stopSession();
    await sending;
    expect(mesh.messages()[0].status).toBe('stopped');
  });
});
