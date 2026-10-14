import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { StatusLabel } from '../utils/labels';

@Component({
  selector: 'app-status-badge',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge" [class]="'badge ' + label().tone">
      <ion-icon [name]="label().icon" aria-hidden="true"></ion-icon>
      <span>{{ label().text }}</span>
    </span>
  `,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
      border: 1px solid currentColor;
    }
    .ok { color: var(--ion-color-success); }
    .warn { color: var(--ion-color-warning); }
    .bad { color: var(--ion-color-danger); }
    .neutral { color: var(--ion-color-medium); }
  `,
})
export class StatusBadgeComponent {
  readonly label = input.required<StatusLabel>();
}
