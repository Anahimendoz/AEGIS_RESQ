import { NetworkNode } from '../../shared/models/network.models';

export interface NodeScore {
  shortId: number;
  score: number;
  reasons: string[];
}

/** Rango de RSSI usado solo para normalizar la intensidad recibida; no se interpreta como distancia. */
const RSSI_FLOOR = -100;
const RSSI_CEILING = -50;

/**
 * Puntúa un nodo (0-100) con las métricas disponibles. Cada criterio sin datos se omite y lo
 * indica en las razones. Internet solo suma un poco: un enlace local estable vale más.
 */
export function scoreNode(node: NetworkNode): NodeScore {
  const reasons: string[] = [];
  let points = 0;
  let maxPoints = 0;

  if (node.state === 'out-of-range') {
    return { shortId: node.shortId, score: 0, reasons: ['Fuera de alcance: no se reciben anuncios recientes.'] };
  }

  maxPoints += 30;
  if (node.stats.rssiMean !== null) {
    const normalized = clamp((node.stats.rssiMean - RSSI_FLOOR) / (RSSI_CEILING - RSSI_FLOOR), 0, 1);
    points += 30 * normalized;
    reasons.push(`Intensidad media ${node.stats.rssiMean.toFixed(0)} dBm.`);
  } else {
    reasons.push('Sin medición de intensidad de señal.');
  }

  maxPoints += 15;
  if (node.stats.rssiStdDev !== null) {
    const stability = clamp(1 - node.stats.rssiStdDev / 12, 0, 1);
    points += 15 * stability;
    reasons.push(`Variación de señal ±${node.stats.rssiStdDev.toFixed(1)} dB.`);
  }

  maxPoints += 25;
  if (node.stats.acousticSent > 0) {
    const delivery = node.stats.acousticAcked / node.stats.acousticSent;
    points += 25 * delivery;
    reasons.push(`Entrega acústica confirmada ${Math.round(delivery * 100)} % (${node.stats.acousticAcked}/${node.stats.acousticSent}).`);
    if (node.stats.lastRoundTripMs !== null) {
      reasons.push(`Latencia medida ${(node.stats.lastRoundTripMs / 1000).toFixed(1)} s.`);
    }
  } else {
    reasons.push('Canal acústico aún no probado con este nodo.');
  }

  maxPoints += 10;
  if (node.capabilities.relayEnabled) {
    points += 10;
    reasons.push('Declara que puede retransmitir.');
  }

  if (node.batteryLevel !== null) {
    maxPoints += 15;
    points += 15 * clamp(node.batteryLevel / 100, 0, 1);
    reasons.push(`Batería declarada ${node.batteryLevel} %.`);
  }

  maxPoints += 5;
  if (node.capabilities.internetReported) {
    points += 5;
    reasons.push('Declara tener red de datos (no verificado).');
  }

  return { shortId: node.shortId, score: Math.round((100 * points) / maxPoints), reasons };
}

/** Devuelve el nodo mejor puntuado entre los alcanzables, o `null` si no hay ninguno. */
export function recommendNode(nodes: NetworkNode[]): NodeScore | null {
  const scores = nodes.filter((n) => n.state !== 'out-of-range').map(scoreNode);
  if (!scores.length) return null;
  return scores.reduce((best, s) => (s.score > best.score ? s : best));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
