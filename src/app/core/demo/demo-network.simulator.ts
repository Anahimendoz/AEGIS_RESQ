import { Sighting } from '../../features/devices/node-registry';

interface DemoNode {
  shortId: number;
  baseRssi: number;
  relay: boolean;
  battery: number | null;
  /** Segundos tras los que el nodo deja de anunciarse, para mostrar el estado «fuera de alcance». */
  disappearsAfterS: number | null;
}

const DEMO_NODES: DemoNode[] = [
  { shortId: 0xd001, baseRssi: -58, relay: true, battery: 82, disappearsAfterS: null },
  { shortId: 0xd002, baseRssi: -71, relay: false, battery: null, disappearsAfterS: null },
  { shortId: 0xd003, baseRssi: -84, relay: true, battery: 35, disappearsAfterS: null },
  { shortId: 0xd004, baseRssi: -77, relay: false, battery: 64, disappearsAfterS: 25 },
];

/**
 * Generador de anuncios FICTICIOS para el modo demostración. Todas las observaciones
 * se marcan con `simulated: true` y la interfaz las rotula como datos simulados.
 */
export class DemoNetworkSimulator {
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;

  start(onSighting: (sighting: Sighting) => void): void {
    this.stop();
    this.startedAt = Date.now();
    this.timer = setInterval(() => this.emit(onSighting), 1_000);
    this.emit(onSighting);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private emit(onSighting: (sighting: Sighting) => void): void {
    const now = Date.now();
    const elapsedS = (now - this.startedAt) / 1000;
    for (const node of DEMO_NODES) {
      if (node.disappearsAfterS !== null && elapsedS > node.disappearsAfterS) continue;
      onSighting({
        shortId: node.shortId,
        rssi: Math.round(node.baseRssi + (Math.random() - 0.5) * 8),
        capabilities: { relayEnabled: node.relay, acousticParticipation: true, internetReported: node.shortId === 0xd003 },
        batteryLevel: node.battery,
        at: now,
        simulated: true,
      });
    }
  }
}
