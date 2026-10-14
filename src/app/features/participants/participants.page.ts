import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  IonAvatar,
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonItem,
  IonLabel,
  IonList,
  IonSpinner,
} from '@ionic/angular';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { ParticipantsService, isPending } from './participants.service';

@Component({
  selector: 'app-participants-page',
  imports: [IonContent, IonCard, IonCardContent, IonList, IonItem, IonAvatar, IonLabel, IonButton, IonSpinner, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header title="Participantes" />
    <ion-content class="ion-padding">
      <div class="notice info">
        Equipo del proyecto académico. No tiene relación con los nodos detectados en la red. Los datos se editan en
        <code>src/assets/config/participants.json</code>.
      </div>
      @switch (state().status) {
        @case ('loading') {
          <ion-spinner aria-label="Cargando"></ion-spinner>
        }
        @case ('error') {
          <div class="notice" role="alert">{{ errorMessage() }}</div>
          <ion-button fill="outline" (click)="reload()">Reintentar</ion-button>
        }
        @case ('ready') {
          @if (config(); as config) {
            <ion-card>
              <ion-card-content>
                <p><strong>Proyecto:</strong> {{ config.project.name }}</p>
                <p>
                  <strong>Institución:</strong> {{ pending(config.project.institution) ? 'Pendiente de confirmar' : config.project.institution }}
                </p>
                <p><strong>Docente acompañante:</strong> {{ pending(config.project.teacher) ? 'Pendiente de confirmar' : config.project.teacher }}</p>
              </ion-card-content>
            </ion-card>
            <ion-list>
              @for (participant of config.participants; track participant.id) {
                <ion-item>
                  <ion-avatar slot="start" class="avatar">
                    <img [src]="participant.avatar" [alt]="'Avatar de ' + participant.alias" />
                  </ion-avatar>
                  <ion-label>
                    <h2>{{ participant.alias }}</h2>
                    <p>{{ participant.displayName }}</p>
                    <p>{{ participant.role }}</p>
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          }
        }
      }
    </ion-content>
  `,
  styles: `
    .avatar { width: 64px; height: 64px; }
  `,
})
export class ParticipantsPage {
  private readonly participants = inject(ParticipantsService);
  readonly state = this.participants.state;

  config() {
    const state = this.state();
    return state.status === 'ready' ? state.config : null;
  }

  errorMessage(): string {
    const state = this.state();
    return state.status === 'error' ? state.message : '';
  }

  pending(value: string): boolean {
    return isPending(value);
  }

  reload(): void {
    void this.participants.load();
  }
}
