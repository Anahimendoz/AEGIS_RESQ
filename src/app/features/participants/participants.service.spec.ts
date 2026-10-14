import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import config from '../../../assets/config/participants.json';
import { PARTICIPANTS_URL, ParticipantsService, isPending, parseParticipantsConfig } from './participants.service';

describe('ParticipantsService', () => {
  let service: ParticipantsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ParticipantsService);
    http = TestBed.inject(HttpTestingController);
  });

  it('carga los cinco participantes del archivo JSON real', async () => {
    const loading = service.load();
    http.expectOne(PARTICIPANTS_URL).flush(config);
    await loading;
    const state = service.state();
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.config.participants.map((p) => p.alias)).toEqual(['Nova', 'Orion', 'Lyra', 'Cosmo', 'Vega']);
    expect(state.config.participants.every((p) => p.avatar.startsWith('assets/avatars/') && p.avatar.endsWith('.png'))).toBe(true);
    expect(isPending(state.config.project.teacher)).toBe(false);
    expect(state.config.participants.filter((p) => p.role === 'Integrante').length).toBe(4);
  });

  it('muestra un error comprensible si falta el archivo, sin lanzar', async () => {
    const loading = service.load();
    http.expectOne(PARTICIPANTS_URL).flush('no encontrado', { status: 404, statusText: 'Not Found' });
    await loading;
    expect(service.state()).toEqual({ status: 'error', message: 'No se pudo leer assets/config/participants.json.' });
  });

  it('rechaza contenido inválido', async () => {
    const loading = service.load();
    http.expectOne(PARTICIPANTS_URL).flush({ project: { name: 'x' }, participants: [] });
    await loading;
    expect(service.state().status).toBe('error');
  });

  it('valida campos obligatorios e identificadores únicos', () => {
    const base = structuredClone(config);
    expect(() => parseParticipantsConfig(base)).not.toThrow();
    base.participants[1].id = base.participants[0].id;
    expect(() => parseParticipantsConfig(base)).toThrow();
    expect(() => parseParticipantsConfig({ ...config, participants: [{ id: 'a' }] })).toThrow();
    expect(() => parseParticipantsConfig(null)).toThrow();
  });
});
