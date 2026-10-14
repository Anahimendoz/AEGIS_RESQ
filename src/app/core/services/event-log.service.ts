import { Injectable, computed, signal } from '@angular/core';
import { AppEvent, EventCategory, EventSeverity } from '../../shared/models/network.models';
import { AppError } from '../errors/app-error';

const MAX_EVENTS = 300;

/** Registro en memoria de eventos de la sesión. Nunca se persiste ni se envía fuera del teléfono. */
@Injectable({ providedIn: 'root' })
export class EventLogService {
  private nextId = 1;
  private readonly eventsSignal = signal<AppEvent[]>([]);

  readonly events = this.eventsSignal.asReadonly();
  readonly errors = computed(() => this.eventsSignal().filter((e) => e.severity === 'error'));

  log(category: EventCategory, severity: EventSeverity, message: string, detail?: string, simulated = false): void {
    const event: AppEvent = { id: this.nextId++, at: Date.now(), category, severity, message, detail, simulated };
    this.eventsSignal.update((events) => [event, ...events].slice(0, MAX_EVENTS));
  }

  info(category: EventCategory, message: string, detail?: string): void {
    this.log(category, 'info', message, detail);
  }

  warn(category: EventCategory, message: string, detail?: string): void {
    this.log(category, 'warning', message, detail);
  }

  error(category: EventCategory, error: AppError): void {
    this.log(category, 'error', error.userMessage, error.detail);
  }

  clear(): void {
    this.eventsSignal.set([]);
  }
}
