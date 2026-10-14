import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonIcon,
} from '@ionic/angular';
import { SettingsService } from '../../core/services/settings.service';
import { NetworkNode } from '../../shared/models/network.models';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { StatusLabel, linkStateLabel, relativeTime, rssiLabel } from '../../shared/utils/labels';
import { AdvertisingState } from './ble-beacon.service';
import { DiscoveryService } from './discovery.service';

const ADVERTISING_LABELS: Record<AdvertisingState, StatusLabel> = {
  off: { text: 'Este teléfono no se está anunciando', icon: 'radio', tone: 'neutral' },
  active: { text: 'Este teléfono se anuncia por BLE', icon: 'radio', tone: 'ok' },
  unsupported: { text: 'El hardware no permite anunciarse', icon: 'remove-circle', tone: 'warn' },
  denied: { text: 'Anuncio sin permiso', icon: 'close-circle', tone: 'bad' },
  failed: { text: 'Error al anunciarse', icon: 'alert-circle', tone: 'bad' },
};

@Component({
  selector: 'app-devices-page',
  imports: [
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonButton,
    IonIcon,
    PageHeaderComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './devices.page.html',
  styles: `
    .selected { outline: 3px solid var(--ion-color-secondary); }
    .node-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 8px 0; font-size: 0.9rem; }
    dt { color: var(--ion-color-medium); }
    dd { margin: 0; }
    .sim { background: #fde68a; color: #4a2c00; font-weight: 700; font-size: 0.75rem; padding: 2px 6px; border-radius: 6px; }
    ul.reasons { margin: 4px 0 0; padding-left: 18px; font-size: 0.88rem; }
  `,
})
export class DevicesPage {
  readonly discovery = inject(DiscoveryService);
  private readonly settings = inject(SettingsService);
  private readonly router = inject(Router);

  readonly advertisingLabel = computed(() =>
    this.settings.mode() === 'demo'
      ? ({ text: 'No aplica en modo demostración', icon: 'flask', tone: 'neutral' } satisfies StatusLabel)
      : ADVERTISING_LABELS[this.discovery.advertising()],
  );

  readonly recommendedNode = computed(() => {
    const recommendation = this.discovery.recommendation();
    return recommendation ? this.discovery.nodes().find((n) => n.shortId === recommendation.shortId) ?? null : null;
  });

  toggleDiscovery(): void {
    void (this.discovery.isRunning() ? this.discovery.stop() : this.discovery.start());
  }

  select(node: NetworkNode): void {
    this.discovery.select(this.discovery.selectedId() === node.shortId ? null : node.shortId);
  }

  openAudioSession(node: NetworkNode): void {
    this.discovery.select(node.shortId);
    void this.router.navigateByUrl('/audio');
  }

  stateLabel(node: NetworkNode): StatusLabel {
    return linkStateLabel(node.state);
  }

  rssi(node: NetworkNode): string {
    return rssiLabel(node.stats.rssiMean);
  }

  time(at: number): string {
    return relativeTime(at);
  }
}
