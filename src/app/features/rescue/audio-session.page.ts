import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCheckbox,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSegment,
  IonSegmentButton,
} from '@ionic/angular';
import { AppError } from '../../core/errors/app-error';
import { PermissionsService } from '../../core/services/permissions.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { StatusLabel, permissionLabel, relativeTime } from '../../shared/utils/labels';
import { BROADCAST_ID, pseudonymFor } from '../../shared/utils/node-id';
import { DiscoveryService } from '../devices/discovery.service';
import { AcousticModemService } from './acoustic/acoustic-modem.service';
import { signalDurationMs } from './acoustic/fsk-codec';
import { nominalBitRate } from './acoustic/modem-profile';
import { FrameType, HEADER_BYTES, MAX_PAYLOAD_BYTES, encodeText } from './mesh/frame';
import { MeshMessage, MeshService, MessageStatus, RecipientStatus } from './mesh/mesh.service';

type SessionMode = 'directed' | 'broadcast';

export const QUICK_MESSAGES = ['Necesito ayuda', 'Estoy atrapado', 'Hay heridos', 'Estoy bien', 'Necesito agua', 'Prueba de enlace'];

const STATUS_TEXT: Record<MessageStatus, string> = {
  queued: 'En cola',
  sending: 'Emitiendo…',
  'awaiting-ack': 'Esperando confirmación…',
  confirmed: 'Confirmado',
  sent: 'Emitido',
  failed: 'Sin confirmación / error',
  received: 'Recibido',
  stopped: 'Detenido',
};

const RECIPIENT_LABELS: Record<RecipientStatus, StatusLabel> = {
  pending: { text: 'Pendiente', icon: 'help-circle', tone: 'warn' },
  confirmed: { text: 'Confirmó', icon: 'checkmark-circle', tone: 'ok' },
  'no-confirmation': { text: 'Sin confirmación', icon: 'close-circle', tone: 'bad' },
};

@Component({
  selector: 'app-audio-session-page',
  imports: [
    FormsModule,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonIcon,
    IonSegment,
    IonSegmentButton,
    IonList,
    IonItem,
    IonLabel,
    IonCheckbox,
    IonInput,
    PageHeaderComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audio-session.page.html',
  styles: `
    .stop-all { --background: #b91c1c; font-weight: 700; }
    .level { height: 10px; background: #dbe4ea; border-radius: 6px; overflow: hidden; margin-top: 6px; }
    .level > div { height: 100%; background: var(--ion-color-secondary); transition: width 0.2s; }
    .recipients { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  `,
})
export class AudioSessionPage {
  readonly modem = inject(AcousticModemService);
  readonly mesh = inject(MeshService);
  readonly discovery = inject(DiscoveryService);
  private readonly permissions = inject(PermissionsService);

  readonly mode = signal<SessionMode>('directed');
  readonly customText = signal('');
  readonly error = signal<string | null>(null);
  readonly excluded = signal<Set<number>>(new Set());
  readonly quickMessages = QUICK_MESSAGES;
  readonly maxBytes = MAX_PAYLOAD_BYTES;

  readonly microphonePermission = computed(() => permissionLabel(this.permissions.status().microphone));
  readonly captureLabel = computed<StatusLabel>(() => {
    switch (this.modem.capture()) {
      case 'listening':
        return { text: 'Captura autorizada y activa', icon: 'mic', tone: 'warn' };
      case 'starting':
        return { text: 'Abriendo micrófono…', icon: 'refresh', tone: 'neutral' };
      case 'error':
        return { text: 'Error de micrófono', icon: 'alert-circle', tone: 'bad' };
      default:
        return { text: 'Micrófono desactivado', icon: 'mic-off', tone: 'neutral' };
    }
  });
  readonly playbackLabel = computed<StatusLabel>(() =>
    this.modem.playbackState() === 'transmitting'
      ? { text: 'Emitiendo por el altavoz', icon: 'volume-high', tone: 'warn' }
      : { text: 'Altavoz en reposo', icon: 'volume-high', tone: 'neutral' },
  );
  readonly levelPercent = computed(() => {
    const db = this.modem.inputLevelDb();
    return db === null ? 0 : Math.max(0, Math.min(100, ((db + 80) / 80) * 100));
  });

  readonly participatingNodes = computed(() =>
    this.discovery.reachableNodes().filter((n) => n.capabilities.acousticParticipation),
  );
  readonly broadcastRecipients = computed(() =>
    this.participatingNodes()
      .map((n) => n.shortId)
      .filter((id) => !this.excluded().has(id)),
  );
  readonly customBytes = computed(() => encodeText(this.customText()).length);
  readonly profile = computed(() => this.modem.profile());
  readonly bitRate = computed(() => nominalBitRate(this.profile()).toFixed(0));
  readonly typicalSeconds = computed(() => (signalDurationMs(HEADER_BYTES + 16 + 1, this.profile()) / 1000).toFixed(1));
  readonly outgoing = computed(() => this.mesh.messages().filter((m) => m.direction === 'out' && m.type !== FrameType.Ack));
  readonly incoming = computed(() => this.mesh.messages().filter((m) => m.direction === 'in'));

  setMode(value: unknown): void {
    if (value === 'directed' || value === 'broadcast') this.mode.set(value);
  }

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

  toggleRecipient(shortId: number, included: boolean): void {
    this.excluded.update((set) => {
      const next = new Set(set);
      if (included) next.delete(shortId);
      else next.add(shortId);
      return next;
    });
  }

  send(text: string): void {
    this.error.set(null);
    const trimmed = text.trim();
    if (!trimmed) return;
    if (this.mode() === 'directed') {
      const node = this.discovery.selectedNode();
      if (!node) {
        this.error.set('Selecciona primero un nodo en «Red de dispositivos».');
        return;
      }
      void this.mesh.sendDirected(node.shortId, trimmed);
    } else {
      void this.mesh.sendBroadcast(trimmed, this.broadcastRecipients());
    }
    this.customText.set('');
  }

  sendTest(): void {
    void this.mesh.sendTestPattern();
  }

  stopAll(): void {
    this.mesh.stopSession();
  }

  destinationName(message: MeshMessage): string {
    if (message.type === FrameType.TestPattern) return 'Señal de prueba (todos, sin reenvío)';
    return message.destination === BROADCAST_ID ? 'Difusión' : pseudonymFor(message.destination);
  }

  statusText(status: MessageStatus): string {
    return STATUS_TEXT[status];
  }

  recipientLabel(status: RecipientStatus): StatusLabel {
    return RECIPIENT_LABELS[status];
  }

  pseudonym(shortId: number): string {
    return pseudonymFor(shortId);
  }

  time(at: number): string {
    return relativeTime(at);
  }
}
