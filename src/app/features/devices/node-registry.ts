import { NetworkNode, NodeCapabilities, NodeLinkState } from '../../shared/models/network.models';
import { pseudonymFor } from '../../shared/utils/node-id';

/** Sin anuncios durante este tiempo, el nodo pasa a «fuera de alcance». */
export const OUT_OF_RANGE_AFTER_MS = 15_000;
/** Los nodos fuera de alcance se olvidan tras este tiempo. */
export const FORGET_AFTER_MS = 10 * 60_000;
/** Una confirmación acústica mantiene el enlace como verificado durante este tiempo. */
export const VERIFIED_LINK_MS = 5 * 60_000;
const RSSI_WINDOW_MS = 20_000;

export interface Sighting {
  shortId: number;
  rssi: number | null;
  capabilities: NodeCapabilities;
  batteryLevel: number | null;
  at: number;
  simulated: boolean;
}

interface NodeEntry {
  node: NetworkNode;
  rssiSamples: { at: number; rssi: number }[];
  sightingTimes: number[];
}

/**
 * Registro de nodos sin E/S. Indexa por identificador de sesión (no hay duplicados),
 * calcula métricas a partir de observaciones reales y deriva el estado del enlace.
 */
export class NodeRegistry {
  private readonly entries = new Map<number, NodeEntry>();

  recordSighting(sighting: Sighting): void {
    const entry = this.entries.get(sighting.shortId) ?? this.createEntry(sighting);
    const node = entry.node;
    node.lastSeen = sighting.at;
    node.capabilities = sighting.capabilities;
    node.batteryLevel = sighting.batteryLevel;
    entry.sightingTimes.push(sighting.at);
    if (sighting.rssi !== null) {
      entry.rssiSamples.push({ at: sighting.at, rssi: sighting.rssi });
    }
    this.entries.set(sighting.shortId, entry);
  }

  /** Registra que se recibió una trama acústica válida de un nodo (aunque no se haya visto por BLE). */
  recordAcousticContact(shortId: number, at: number, simulated = false): void {
    const entry = this.entries.get(shortId);
    if (entry) {
      entry.node.lastSeen = Math.max(entry.node.lastSeen, at);
      return;
    }
    const capabilities = { relayEnabled: false, acousticParticipation: true, internetReported: false };
    this.recordSighting({ shortId, rssi: null, capabilities, batteryLevel: null, at, simulated });
  }

  recordAcousticSend(shortId: number): void {
    const entry = this.entries.get(shortId);
    if (entry) entry.node.stats.acousticSent++;
  }

  recordAcousticAck(shortId: number, roundTripMs: number, at: number): void {
    const entry = this.entries.get(shortId);
    if (!entry) return;
    entry.node.stats.acousticAcked++;
    entry.node.stats.lastRoundTripMs = roundTripMs;
    entry.node.lastAckAt = at;
  }

  /** Recalcula estados y métricas; elimina nodos olvidados. Devuelve una copia inmutable. */
  snapshot(now: number): NetworkNode[] {
    for (const [id, entry] of this.entries) {
      if (now - entry.node.lastSeen > FORGET_AFTER_MS) {
        this.entries.delete(id);
        continue;
      }
      entry.rssiSamples = entry.rssiSamples.filter((s) => now - s.at <= RSSI_WINDOW_MS);
      entry.sightingTimes = entry.sightingTimes.filter((t) => now - t <= RSSI_WINDOW_MS);
      const node = entry.node;
      node.state = this.linkState(node, now);
      const rssi = entry.rssiSamples.map((s) => s.rssi);
      node.stats.rssiMean = rssi.length ? mean(rssi) : null;
      node.stats.rssiStdDev = rssi.length >= 2 ? stdDev(rssi) : null;
      node.stats.advertisementsPerSecond = entry.sightingTimes.length / (RSSI_WINDOW_MS / 1000);
    }
    return [...this.entries.values()]
      .map((e) => structuredClone(e.node))
      .sort((a, b) => b.lastSeen - a.lastSeen);
  }

  clear(): void {
    this.entries.clear();
  }

  private linkState(node: NetworkNode, now: number): NodeLinkState {
    if (now - node.lastSeen > OUT_OF_RANGE_AFTER_MS) return 'out-of-range';
    if (node.lastAckAt !== null && now - node.lastAckAt <= VERIFIED_LINK_MS) return 'verified';
    return 'available';
  }

  private createEntry(sighting: Sighting): NodeEntry {
    return {
      node: {
        shortId: sighting.shortId,
        pseudonym: pseudonymFor(sighting.shortId),
        firstSeen: sighting.at,
        lastSeen: sighting.at,
        lastAckAt: null,
        state: 'available',
        capabilities: sighting.capabilities,
        batteryLevel: sighting.batteryLevel,
        simulated: sighting.simulated,
        stats: {
          rssiMean: null,
          rssiStdDev: null,
          advertisementsPerSecond: 0,
          acousticSent: 0,
          acousticAcked: 0,
          lastRoundTripMs: null,
        },
      },
      rssiSamples: [],
      sightingTimes: [],
    };
  }
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}
