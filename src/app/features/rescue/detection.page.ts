import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
  IonToggle,
} from '@ionic/angular';
import { AppError } from '../../core/errors/app-error';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { StatusLabel, relativeTime } from '../../shared/utils/labels';
import { AcousticModemService } from './acoustic/acoustic-modem.service';
import { DetectionReview, DetectionService } from './detection/detection.service';
import { MeshService } from './mesh/mesh.service';

const REVIEW_LABELS: Record<DetectionReview, StatusLabel> = {
  experimental: { text: 'Detección experimental · sin confirmar', icon: 'flask', tone: 'warn' },
  'confirmed-by-human': { text: 'Confirmada por una persona', icon: 'hand-left', tone: 'ok' },
  dismissed: { text: 'Descartada por una persona', icon: 'close-circle', tone: 'neutral' },
};

@Component({
  selector: 'app-detection-page',
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
    IonToggle,
    PageHeaderComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './detection.page.html',
})
export class DetectionPage {
  readonly modem = inject(AcousticModemService);
  readonly detection = inject(DetectionService);
  private readonly mesh = inject(MeshService);
  readonly error = signal<string | null>(null);

  async toggleListening(): Promise<void> {
    this.error.set(null);
    if (this.modem.capture() === 'listening') {
      this.modem.stopListening();
      return;
    }
    try {
      await this.modem.startListening();
    } catch (error) {
      this.error.set(error instanceof AppError ? error.userMessage : String(error));
    }
  }

  setKnockDetection(enabled: boolean): void {
    if (enabled) this.detection.enableKnockDetection();
    else this.detection.disableKnockDetection();
  }

  sendTest(): void {
    void this.mesh.sendTestPattern();
  }

  review(id: number, review: DetectionReview): void {
    this.detection.review(id, review);
  }

  reviewLabel(review: DetectionReview): StatusLabel {
    return REVIEW_LABELS[review];
  }

  time(at: number): string {
    return relativeTime(at);
  }

  clock(at: number): string {
    return new Date(at).toLocaleTimeString();
  }
}
