import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

@Component({
  selector: 'app-empty-state',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <ion-icon [name]="icon()" aria-hidden="true"></ion-icon>
      <p class="title">{{ title() }}</p>
      @if (hint()) {
        <p class="hint">{{ hint() }}</p>
      }
    </div>
  `,
  styles: `
    .empty { text-align: center; padding: 24px 16px; color: var(--ion-color-medium); }
    ion-icon { font-size: 40px; }
    .title { font-weight: 600; margin: 8px 0 4px; color: var(--ion-text-color); }
    .hint { margin: 0; font-size: 0.9rem; }
  `,
})
export class EmptyStateComponent {
  readonly icon = input('information-circle');
  readonly title = input.required<string>();
  readonly hint = input<string>('');
}
