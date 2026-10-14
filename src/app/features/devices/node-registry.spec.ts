import { NodeCapabilities } from '../../shared/models/network.models';
import { FORGET_AFTER_MS, NodeRegistry, OUT_OF_RANGE_AFTER_MS } from './node-registry';
import { recommendNode, scoreNode } from './node-scoring';

const caps: NodeCapabilities = { relayEnabled: false, acousticParticipation: true, internetReported: false };

function sight(registry: NodeRegistry, shortId: number, at: number, rssi: number | null = -70): void {
  registry.recordSighting({ shortId, rssi, capabilities: caps, batteryLevel: null, at, simulated: false });
}

describe('NodeRegistry', () => {
  it('no duplica nodos vistos varias veces', () => {
    const registry = new NodeRegistry();
    sight(registry, 1, 0);
    sight(registry, 1, 500);
    sight(registry, 2, 600);
    const nodes = registry.snapshot(1_000);
    expect(nodes.length).toBe(2);
    expect(nodes.find((n) => n.shortId === 1)?.lastSeen).toBe(500);
  });

  it('marca como fuera de alcance y luego olvida los nodos sin anuncios', () => {
    const registry = new NodeRegistry();
    sight(registry, 1, 0);
    expect(registry.snapshot(1_000)[0].state).toBe('available');
    expect(registry.snapshot(OUT_OF_RANGE_AFTER_MS + 1)[0].state).toBe('out-of-range');
    expect(registry.snapshot(FORGET_AFTER_MS + 1)).toEqual([]);
  });

  it('pasa a enlace verificado solo con una confirmación acústica', () => {
    const registry = new NodeRegistry();
    sight(registry, 1, 0);
    registry.recordAcousticSend(1);
    registry.recordAcousticAck(1, 4_000, 100);
    const [node] = registry.snapshot(200);
    expect(node.state).toBe('verified');
    expect(node.stats).toMatchObject({ acousticSent: 1, acousticAcked: 1, lastRoundTripMs: 4_000 });
  });

  it('calcula media y variación de RSSI sin inventar valores ausentes', () => {
    const registry = new NodeRegistry();
    sight(registry, 1, 0, -60);
    sight(registry, 1, 100, -80);
    sight(registry, 2, 100, null);
    const nodes = registry.snapshot(200);
    expect(nodes.find((n) => n.shortId === 1)?.stats.rssiMean).toBe(-70);
    expect(nodes.find((n) => n.shortId === 2)?.stats.rssiMean).toBeNull();
  });
});

describe('node scoring', () => {
  it('prefiere un enlace local fuerte frente a un nodo que solo declara Internet', () => {
    const registry = new NodeRegistry();
    sight(registry, 1, 0, -55);
    registry.recordSighting({
      shortId: 2,
      rssi: -95,
      capabilities: { ...caps, internetReported: true },
      batteryLevel: null,
      at: 0,
      simulated: false,
    });
    const nodes = registry.snapshot(100);
    expect(recommendNode(nodes)?.shortId).toBe(1);
    expect(scoreNode(nodes.find((n) => n.shortId === 2)!).reasons).toContain('Declara tener red de datos (no verificado).');
  });

  it('no recomienda nodos fuera de alcance', () => {
    const registry = new NodeRegistry();
    sight(registry, 1, 0);
    expect(recommendNode(registry.snapshot(OUT_OF_RANGE_AFTER_MS + 1))).toBeNull();
  });
});
