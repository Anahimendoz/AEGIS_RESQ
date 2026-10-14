import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent } from '@ionic/angular';
import { PageHeaderComponent } from '../../shared/components/page-header.component';

@Component({
  selector: 'app-about-page',
  imports: [IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header title="Acerca del proyecto" />
    <ion-content class="ion-padding">
      <div class="hero">
        <img src="assets/brand/logo.png" alt="Logotipo de Aegis ResQ" width="220" height="177" />
        <p>Prototipo académico de código abierto · versión 0.1.0</p>
      </div>

      <ion-card>
        <ion-card-header><ion-card-title>Qué es</ion-card-title></ion-card-header>
        <ion-card-content>
          <p>
            Un experimento para que varios teléfonos colaboren sin Internet durante una emergencia: se descubren por
            Bluetooth Low Energy e intercambian mensajes cortos codificados en sonido (altavoz → micrófono), que pueden
            saltar de teléfono en teléfono.
          </p>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header><ion-card-title>Qué NO es</ion-card-title></ion-card-header>
        <ion-card-content>
          <ul>
            <li>No es un sistema de rescate certificado ni sustituye a los organismos de emergencia.</li>
            <li>No garantiza encontrar personas atrapadas ni detectar señales de vida.</li>
            <li>No calcula la posición de víctimas ni la distancia a partir de la señal Bluetooth.</li>
            <li>No transmite voz en vivo.</li>
          </ul>
          <p>Cada función debe validarse con dispositivos físicos en escenarios controlados.</p>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header><ion-card-title>Tecnología</ion-card-title></ion-card-header>
        <ion-card-content>
          <p>
            Ionic 9 + Angular 22 + Capacitor 8. Módem MFSK diferencial propio (17 tonos, 4 bits por símbolo) con detección
            de Goertzel, tramas con CRC-8, reenvío con TTL y descarte de duplicados. Licencia MIT.
          </p>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
  styles: `
    .hero { text-align: center; padding: 8px 0 4px; }
    .hero img { max-width: 70%; height: auto; }
    .hero p { margin: 4px 0 0; color: var(--ion-color-medium); }
  `,
})
export class AboutPage {}
