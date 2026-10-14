import { Injectable, inject, signal } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { AppError, toAppError } from '../../core/errors/app-error';
import { EventLogService } from '../../core/services/event-log.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { SessionIdentityService } from '../../core/services/session-identity.service';
import { pseudonymFor } from '../../shared/utils/node-id';
import { FrameType, decodeLocation } from '../rescue/mesh/frame';
import { MeshService } from '../rescue/mesh/mesh.service';

export type LocationValidity = 'good' | 'approximate' | 'low-accuracy';

/** Observación de la ubicación de un TELÉFONO, no de una persona atrapada. */
export interface LocationObservation {
  id: number;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  observedAt: number;
  source: 'own-device' | 'received-acoustic';
  node: string;
  validity: LocationValidity;
}

const MAX_OBSERVATIONS = 50;

export function validityFor(accuracyMeters: number): LocationValidity {
  if (accuracyMeters <= 30) return 'good';
  if (accuracyMeters <= 100) return 'approximate';
  return 'low-accuracy';
}

/** Ubicación bajo demanda. Las observaciones viven solo en memoria y nunca se envían a servicios externos. */
@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly permissions = inject(PermissionsService);
  private readonly identity = inject(SessionIdentityService);
  private readonly mesh = inject(MeshService);
  private readonly log = inject(EventLogService);
  private nextId = 1;
  private readonly observationsSignal = signal<LocationObservation[]>([]);
  private readonly busySignal = signal(false);

  readonly observations = this.observationsSignal.asReadonly();
  readonly busy = this.busySignal.asReadonly();

  constructor() {
    this.mesh.received$.subscribe(({ frame, at }) => {
      if (frame.type !== FrameType.Location) return;
      const location = decodeLocation(frame.payload);
      this.add({ ...location, observedAt: at, source: 'received-acoustic', node: pseudonymFor(frame.source) });
    });
  }

  async captureOwnLocation(): Promise<LocationObservation> {
    this.busySignal.set(true);
    try {
      await this.permissions.ensure('location');
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
      const observation = this.add({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        observedAt: position.timestamp,
        source: 'own-device',
        node: this.identity.pseudonym,
      });
      // El registro de diagnóstico guarda solo la precisión, nunca las coordenadas.
      this.log.info('location', `Ubicación del teléfono obtenida (±${Math.round(position.coords.accuracy)} m).`);
      return observation;
    } catch (error) {
      const appError = error instanceof AppError ? error : toAppError(error, 'location-unavailable');
      this.log.error('location', appError);
      throw appError;
    } finally {
      this.busySignal.set(false);
    }
  }

  clear(): void {
    this.observationsSignal.set([]);
  }

  private add(data: Omit<LocationObservation, 'id' | 'validity'>): LocationObservation {
    const observation = { ...data, id: this.nextId++, validity: validityFor(data.accuracyMeters) };
    this.observationsSignal.update((list) => [observation, ...list].slice(0, MAX_OBSERVATIONS));
    return observation;
  }
}
