import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  AlertController,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
} from '@ionic/angular';
import { AppError } from '../../core/errors/app-error';
import { EventLogService } from '../../core/services/event-log.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { StatusLabel, relativeTime } from '../../shared/utils/labels';
import { DiscoveryService } from '../devices/discovery.service';
import { MeshService } from '../rescue/mesh/mesh.service';
import { LocationObservation, LocationService, LocationValidity } from './location.service';

const VALIDITY_LABELS: Record<LocationValidity, StatusLabel> = {
  good: { text: 'Precisión buena (≤ 30 m)', icon: 'checkmark-circle', tone: 'ok' },
  approximate: { text: 'Aproximada (≤ 100 m)', icon: 'warning', tone: 'warn' },
  'low-accuracy': { text: 'Baja precisión (> 100 m)', icon: 'alert-circle', tone: 'bad' },
};

@Component({
  selector: 'app-location-page',
  imports: [
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonIcon,
    IonItem,
    IonLabel,
    PageHeaderComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './location.page.html',
})
export class LocationPage {
  readonly location = inject(LocationService);
  private readonly mesh = inject(MeshService);
  private readonly discovery = inject(DiscoveryService);
  private readonly alerts = inject(AlertController);
  readonly log = inject(EventLogService);
  readonly error = signal<string | null>(null);

  readonly latestOwn = computed(() => this.location.observations().find((o) => o.source === 'own-device') ?? null);
  readonly recentEvents = computed(() => this.log.events().filter((e) => e.category !== 'permissions').slice(0, 15));

  async capture(): Promise<void> {
    this.error.set(null);
    try {
      await this.location.captureOwnLocation();
    } catch (error) {
      this.error.set(error instanceof AppError ? error.userMessage : String(error));
    }
  }

  /** Compartir la ubicación es siempre una acción explícita y confirmada. */
  async share(observation: LocationObservation): Promise<void> {
    const alert = await this.alerts.create({
      header: '¿Compartir ubicación?',
      message:
        'Se emitirán por el altavoz las coordenadas de ESTE teléfono. Cualquiera que escuche con Aegis ResQ podrá recibirlas. No se envían a Internet.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Compartir', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'confirm') return;
    const recipients = this.discovery
      .reachableNodes()
      .filter((n) => n.capabilities.acousticParticipation)
      .map((n) => n.shortId);
    void this.mesh.sendLocation(observation, recipients);
  }

  validityLabel(validity: LocationValidity): StatusLabel {
    return VALIDITY_LABELS[validity];
  }

  coordinates(observation: LocationObservation): string {
    return `${observation.latitude.toFixed(5)}, ${observation.longitude.toFixed(5)}`;
  }

  time(at: number): string {
    return relativeTime(at);
  }

  clock(at: number): string {
    return new Date(at).toLocaleString();
  }
}
