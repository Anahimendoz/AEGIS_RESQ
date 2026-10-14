import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonToggle,
  ViewWillEnter,
} from '@ionic/angular';
import { PermissionKind, PermissionStatus, PermissionsService } from '../../core/services/permissions.service';
import { SessionIdentityService } from '../../core/services/session-identity.service';
import { SettingsService, UserSettings } from '../../core/services/settings.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { permissionLabel } from '../../shared/utils/labels';
import { MODEM_PROFILES } from '../rescue/acoustic/modem-profile';

@Component({
  selector: 'app-permissions-page',
  imports: [
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonList,
    IonItem,
    IonLabel,
    IonButton,
    IonToggle,
    IonSelect,
    IonSelectOption,
    PageHeaderComponent,
    StatusBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './permissions.page.html',
})
export class PermissionsPage implements ViewWillEnter {
  readonly permissions = inject(PermissionsService);
  readonly settings = inject(SettingsService);
  readonly identity = inject(SessionIdentityService);
  readonly profiles = Object.values(MODEM_PROFILES);

  ionViewWillEnter(): void {
    void this.permissions.refresh();
  }

  label(status: PermissionStatus) {
    return permissionLabel(status);
  }

  request(kind: PermissionKind): void {
    void this.permissions.request(kind);
  }

  openSettings(): void {
    void this.permissions.openAppSettings();
  }

  set<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
    this.settings.update({ [key]: value } as Partial<UserSettings>);
  }

  setDemo(enabled: boolean): void {
    this.settings.setMode(enabled ? 'demo' : 'real');
  }
}
