export const BROADCAST_ID = 0xffff;

/** Genera un identificador de sesión aleatorio de 16 bits (nunca 0 ni el de difusión). */
export function randomShortId(random: () => number = Math.random): number {
  return 1 + Math.floor(random() * (BROADCAST_ID - 1));
}

export function pseudonymFor(shortId: number): string {
  return `Nodo-${shortId.toString(16).toUpperCase().padStart(4, '0')}`;
}
