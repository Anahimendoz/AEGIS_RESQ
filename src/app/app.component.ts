import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonApp,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonMenuToggle,
  IonRouterOutlet,
  IonSplitPane,
} from '@ionic/angular';
import { MENU_SECTIONS } from './app.routes';
import { registerIcons } from './core/icons';
import { ConnectivityService } from './core/services/connectivity.service';
import { PermissionsService } from './core/services/permissions.service';
import { SessionIdentityService } from './core/services/session-identity.service';
import { LocationService } from './features/location/location.service';
import { ParticipantsService } from './features/participants/participants.service';
import { DetectionService } from './features/rescue/detection/detection.service';

/** Shell de la app: menú lateral y área de contenido. No hay pantalla de inicio de sesión. */
@Component({
  selector: 'app-root',
  imports: [
    IonApp,
    IonSplitPane,
    IonMenu,
    IonContent,
    IonList,
    IonMenuToggle,
    IonItem,
    IonIcon,
    IonLabel,
    IonRouterOutlet,
    RouterLink,
    RouterLinkActive,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-app>
      <ion-split-pane contentId="main-content">
        <ion-menu contentId="main-content" type="overlay">
          <ion-content>
            <div class="brand">
              <img src="assets/brand/logo-white.png" alt="Logotipo de Aegis ResQ" width="150" height="121" />
              <p>Prototipo académico · {{ identity.pseudonym }}</p>
            </div>
            <ion-list lines="none" aria-label="Secciones">
              @for (section of sections; track section.path) {
                <ion-menu-toggle [autoHide]="false">
                  <ion-item
                    [routerLink]="'/' + section.path"
                    routerDirection="root"
                    routerLinkActive="active"
                    detail="false"
                    button
                  >
                    <ion-icon slot="start" [name]="section.icon" aria-hidden="true"></ion-icon>
                    <ion-label>{{ section.title }}</ion-label>
                  </ion-item>
                </ion-menu-toggle>
              }
            </ion-list>
          </ion-content>
        </ion-menu>
        <ion-router-outlet id="main-content"></ion-router-outlet>
      </ion-split-pane>
    </ion-app>
  `,
  styles: `
    .brand {
      text-align: center;
      padding: 20px 16px 12px;
      background: var(--aegis-dark);
      color: #fff;
    }
    .brand img { height: auto; }
    .brand p { margin: 6px 0 0; font-size: 0.8rem; opacity: 0.85; }
    ion-item.active { --background: rgba(252, 115, 28, 0.14); font-weight: 600; }
    ion-item.active ion-icon { color: var(--ion-color-secondary); }
  `,
})
export class AppComponent implements OnInit {
  readonly identity = inject(SessionIdentityService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly permissions = inject(PermissionsService);
  private readonly participants = inject(ParticipantsService);
  readonly sections = MENU_SECTIONS;

  constructor() {
    registerIcons();
    // Se crean al arrancar para recibir señales de prueba y ubicaciones aunque su pantalla no se haya abierto.
    inject(DetectionService);
    inject(LocationService);
  }

  ngOnInit(): void {
    // Ninguna de estas tareas bloquea la interfaz ni necesita Internet.
    void this.connectivity.start();
    void this.permissions.refresh();
    void this.participants.load();
  }
}
