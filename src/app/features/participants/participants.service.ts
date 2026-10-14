import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EventLogService } from '../../core/services/event-log.service';
import { AppError } from '../../core/errors/app-error';

export const PARTICIPANTS_URL = 'assets/config/participants.json';

export interface Participant {
  id: string;
  alias: string;
  displayName: string;
  avatar: string;
  role: string;
}

export interface ProjectCredits {
  name: string;
  institution: string;
  teacher: string;
}

export interface ParticipantsConfig {
  project: ProjectCredits;
  participants: Participant[];
}

export type ParticipantsState =
  | { status: 'loading' }
  | { status: 'ready'; config: ParticipantsConfig }
  | { status: 'error'; message: string };

/** Valores que indican que el dato oficial aún no se ha confirmado. */
export function isPending(value: string): boolean {
  return /PENDIENTE/i.test(value);
}

export function parseParticipantsConfig(raw: unknown): ParticipantsConfig {
  const fail = (detail: string): never => {
    throw new AppError('config-invalid', detail);
  };
  if (!isRecord(raw)) fail('El archivo no contiene un objeto JSON.');
  const root = raw as Record<string, unknown>;
  const project = root['project'];
  if (!isRecord(project) || !['name', 'institution', 'teacher'].every((k) => isText(project[k]))) {
    fail('El bloque «project» debe tener name, institution y teacher.');
  }
  const list = root['participants'];
  if (!Array.isArray(list) || list.length === 0) fail('La lista «participants» está vacía o falta.');
  const participants = (list as unknown[]).map((item, index) => {
    if (!isRecord(item) || !['id', 'alias', 'displayName', 'avatar', 'role'].every((k) => isText(item[k]))) {
      return fail(`El participante ${index + 1} está incompleto.`);
    }
    return item as unknown as Participant;
  });
  if (new Set(participants.map((p) => p.id)).size !== participants.length) fail('Hay identificadores de participante repetidos.');
  return { project: project as unknown as ProjectCredits, participants };
}

/** Carga los participantes del proyecto académico (no confundir con los nodos de la red). */
@Injectable({ providedIn: 'root' })
export class ParticipantsService {
  private readonly http = inject(HttpClient);
  private readonly log = inject(EventLogService);
  private readonly stateSignal = signal<ParticipantsState>({ status: 'loading' });

  readonly state = this.stateSignal.asReadonly();

  async load(): Promise<void> {
    this.stateSignal.set({ status: 'loading' });
    try {
      const raw = await firstValueFrom(this.http.get<unknown>(PARTICIPANTS_URL));
      this.stateSignal.set({ status: 'ready', config: parseParticipantsConfig(raw) });
    } catch (error) {
      const message =
        error instanceof AppError
          ? `${error.userMessage} ${error.detail ?? ''}`.trim()
          : 'No se pudo leer assets/config/participants.json.';
      this.stateSignal.set({ status: 'error', message });
      this.log.log('config', 'error', 'Error al cargar la configuración de participantes.', String(error));
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
