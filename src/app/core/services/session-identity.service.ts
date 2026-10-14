import { Injectable } from '@angular/core';
import { pseudonymFor, randomShortId } from '../../shared/utils/node-id';

/**
 * Identidad del nodo para esta sesión: un número aleatorio de 16 bits que cambia en cada arranque.
 * No se deriva del hardware, de la cuenta ni de ningún dato personal.
 */
@Injectable({ providedIn: 'root' })
export class SessionIdentityService {
  readonly shortId = randomShortId();
  readonly pseudonym = pseudonymFor(this.shortId);
}
