import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IonButtons, IonHeader, IonIcon, IonMenuButton, IonTitle, IonToolbar } from '@ionic/angular';
import { SettingsService } from '../../core/services/settings.service';
import { AcousticModemService } from '../../features/rescue/acoustic/acoustic-modem.service';

/**
 * Cabecera común: título, botón de menú y avisos permanentes de
 * (1) modo demostración y (2) micrófono o altavoz en uso.
 */
@Component({
  selector: 'app-page-header',
  imports: [IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-menu-button aria-label="Abrir menú"></ion-menu-button>
        </ion-buttons>
        <ion-title>{{ title() }}</ion-title>
      </ion-toolbar>
      @if (isDemo()) {
        <div class="strip demo" role="status">
          <ion-icon name="flask" aria-hidden="true"></ion-icon>
          MODO DEMOSTRACIÓN · los nodos y métricas de red son simulados
        </div>
      }
      @if (audioActivity(); as activity) {
        <div class="strip audio" role="status">
          <ion-icon [name]="activity.icon" aria-hidden="true"></ion-icon>
          {{ activity.text }}
        </div>
      }
    </ion-header>
  `,
  styles: `
    :host { display: block; }
    .strip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .demo { background: #fde68a; color: #4a2c00; }
    .audio { background: #b91c1c; color: #fff; }
  `,
})
export class PageHeaderComponent {
  private readonly settings = inject(SettingsService);
  private readonly modem = inject(AcousticModemService);

  readonly title = input.required<string>();
  readonly isDemo = computed(() => this.settings.mode() === 'demo');
  readonly audioActivity = computed(() => {
    const transmitting = this.modem.playbackState() === 'transmitting';
    const listening = this.modem.capture() === 'listening';
    if (transmitting) return { icon: 'volume-high', text: 'EMITIENDO SEÑAL ACÚSTICA por el altavoz' };
    if (listening) return { icon: 'mic', text: 'MICRÓFONO ACTIVO · el audio se analiza y no se guarda' };
    return null;
  });
}
