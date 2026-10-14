import { TestBed } from '@angular/core/testing';
import { LocationService } from '../../features/location/location.service';
import { AcousticModemService } from '../../features/rescue/acoustic/acoustic-modem.service';
import { DetectionService } from '../../features/rescue/detection/detection.service';
import { AppError } from '../errors/app-error';
import { PermissionKind, PermissionsService } from './permissions.service';

class DenyingPermissions {
  requested: PermissionKind[] = [];
  readonly status = () => ({ nearby: 'denied', advertise: 'denied', location: 'denied', microphone: 'denied' });
  async ensure(kind: PermissionKind): Promise<void> {
    this.requested.push(kind);
    throw new AppError('permission-denied', `${kind}: denied`);
  }
}

describe('Funciones protegidas por permisos', () => {
  let permissions: DenyingPermissions;

  beforeEach(() => {
    permissions = new DenyingPermissions();
    TestBed.configureTestingModule({ providers: [{ provide: PermissionsService, useValue: permissions }] });
  });

  it('no abre el micrófono si el permiso está denegado', async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    const modem = TestBed.inject(AcousticModemService);

    await expect(modem.startListening()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(permissions.requested).toEqual(['microphone']);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(modem.capture()).toBe('error');
  });

  it('no genera ubicaciones si el permiso está denegado', async () => {
    // El plugin Geolocation (web) delega en navigator.geolocation: se intercepta ahí.
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    const location = TestBed.inject(LocationService);

    await expect(location.captureOwnLocation()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(location.observations()).toEqual([]);
  });

  it('no produce detecciones sin señal real', () => {
    const detection = TestBed.inject(DetectionService);
    detection.enableKnockDetection();
    expect(detection.events()).toEqual([]);
  });
});
