import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSegment,
  IonSegmentButton,
} from '@ionic/angular';
import { ConnectivityService } from '../../core/services/connectivity.service';
import { EventLogService } from '../../core/services/event-log.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { SettingsService } from '../../core/services/settings.service';
import { AppMode } from '../../shared/models/network.models';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { StatusLabel, relativeTime, triStateLabel } from '../../shared/utils/labels';
import { DiscoveryService } from '../devices/discovery.service';
import { AcousticModemService } from '../rescue/acoustic/acoustic-modem.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonIcon,
    IonList,
    IonItem,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    RouterLink,
    PageHeaderComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
})
export class DashboardPage {
  readonly discovery = inject(DiscoveryService);
  readonly settings = inject(SettingsService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly permissions = inject(PermissionsService);
  private readonly modem = inject(AcousticModemService);
  private readonly log = inject(EventLogService);

  readonly recentEvents = computed(() => this.log.events().slice(0, 5));

  readonly networkLabel = computed<StatusLabel>(() => {
    switch (this.discovery.state()) {
      case 'running':
        return { text: 'Descubrimiento activo', icon: 'radio', tone: 'ok' };
      case 'starting':
        return { text: 'Iniciando…', icon: 'refresh', tone: 'warn' };
      case 'error':
        return { text: 'Error al iniciar', icon: 'alert-circle', tone: 'bad' };
      default:
        return { text: 'Detenido', icon: 'stop-circle', tone: 'neutral' };
    }
  });

  readonly bluetoothLabel = computed(() =>
    this.settings.mode() === 'demo'
      ? ({ text: 'No aplica (simulado)', icon: 'flask', tone: 'neutral' } satisfies StatusLabel)
      : triStateLabel(this.connectivity.bluetoothEnabled(), 'Activado', 'Desactivado'),
  );

  readonly networkSystemLabel = computed(() =>
    triStateLabel(this.connectivity.network().systemNetwork, `Red del sistema (${this.connectivity.network().connectionType})`, 'Sin red'),
  );

  readonly permissionsLabel = computed<StatusLabel>(() => {
    const list = this.permissions.list();
    const ok = list.filter((p) => p.status === 'granted' || p.status === 'not-required').length;
    const tone = ok === list.length ? 'ok' : list.some((p) => p.status === 'denied') ? 'bad' : 'warn';
    return { text: `${ok} de ${list.length} listos`, icon: 'shield-checkmark', tone };
  });

  readonly microphoneLabel = computed<StatusLabel>(() => {
    if (this.modem.capture() === 'listening') return { text: 'Captura activa', icon: 'mic', tone: 'warn' };
    if (this.modem.capture() === 'error') return { text: 'Error', icon: 'alert-circle', tone: 'bad' };
    const permission = this.permissions.status().microphone;
    return permission === 'granted'
      ? { text: 'Disponible, apagado', icon: 'mic-off', tone: 'ok' }
      : { text: 'Apagado · sin permiso', icon: 'mic-off', tone: 'neutral' };
  });

  setMode(value: unknown): void {
    if (value === 'real' || value === 'demo') this.settings.setMode(value as AppMode);
  }

  toggleDiscovery(): void {
    void (this.discovery.isRunning() ? this.discovery.stop() : this.discovery.start());
  }

  time(at: number): string {
    return relativeTime(at);
  }
}
