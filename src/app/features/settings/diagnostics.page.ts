import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonItem,
  IonLabel,
} from '@ionic/angular';
import { AegisNative } from '../../core/native/aegis-native';
import { EventLogService } from '../../core/services/event-log.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { StatusLabel } from '../../shared/utils/labels';
import { FskDecoder, bytesToTones, synthesizeTones } from '../rescue/acoustic/fsk-codec';
import { MODEM_PROFILES } from '../rescue/acoustic/modem-profile';
import { FRAME_LENGTH_RULE, FrameType, decodeFrame, encodeFrame, encodeText } from '../rescue/mesh/frame';

interface Check {
  name: string;
  label: StatusLabel;
}

const ok = (text: string): StatusLabel => ({ text, icon: 'checkmark-circle', tone: 'ok' });
const no = (text: string): StatusLabel => ({ text, icon: 'close-circle', tone: 'bad' });

/** Autoprueba del módem: sintetiza una trama en memoria y comprueba que se decodifica igual. */
export function runModemSelfTest(sampleRate = 48_000): Check[] {
  const original = encodeFrame({
    type: FrameType.TestPattern,
    messageId: 0x1234,
    ttl: 0,
    source: 0x0001,
    destination: 0xffff,
    payload: encodeText('autoprueba'),
  });
  return Object.values(MODEM_PROFILES).map((profile) => {
    const frames: Uint8Array[] = [];
    const decoder = new FskDecoder(profile, sampleRate, FRAME_LENGTH_RULE, (d) => frames.push(d.bytes));
    decoder.push(synthesizeTones(bytesToTones(original), profile, sampleRate));
    let passed = false;
    try {
      passed = frames.length === 1 && decodeFrame(frames[0]).messageId === 0x1234;
    } catch {
      passed = false;
    }
    return {
      name: `Códec ${profile.id} (en memoria, sin altavoz)`,
      label: passed ? ok('Superada') : no('Fallida'),
    };
  });
}

@Component({
  selector: 'app-diagnostics-page',
  imports: [
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonItem,
    IonLabel,
    IonButton,
    PageHeaderComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './diagnostics.page.html',
})
export class DiagnosticsPage implements OnInit {
  readonly log = inject(EventLogService);
  readonly platform = signal<string>('…');
  readonly checks = signal<Check[]>([]);
  readonly selfTest = signal<Check[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      const info = await Device.getInfo();
      this.platform.set(
        `${info.platform} · ${info.operatingSystem} ${info.osVersion}` +
          (info.androidSDKVersion ? ` (API ${info.androidSDKVersion})` : '') +
          ` · WebView ${info.webViewVersion} · ${info.isVirtual ? 'emulador' : 'dispositivo físico'}`,
      );
    } catch {
      this.platform.set(Capacitor.getPlatform());
    }
    await this.runChecks();
  }

  async runChecks(): Promise<void> {
    const checks: Check[] = [];
    for (const plugin of ['BluetoothLe', 'AegisNative', 'Geolocation', 'Network', 'Device']) {
      checks.push({ name: `Plugin ${plugin}`, label: Capacitor.isPluginAvailable(plugin) ? ok('Disponible') : no('No disponible') });
    }
    checks.push({ name: 'Web Audio (AudioContext)', label: typeof AudioContext !== 'undefined' ? ok('Disponible') : no('No disponible') });
    checks.push({
      name: 'AudioWorklet',
      label: typeof AudioWorkletNode !== 'undefined' ? ok('Disponible') : no('No disponible'),
    });
    checks.push({
      name: 'Captura de micrófono (getUserMedia)',
      label: typeof navigator.mediaDevices?.getUserMedia === 'function' ? ok('API disponible') : no('No disponible'),
    });
    try {
      const support = await AegisNative.getAdvertisingSupport();
      checks.push({
        name: 'Anuncio BLE (periférico)',
        label: support.supported ? ok('Admitido') : no(`No admitido (${support.reason ?? 'sin motivo'})`),
      });
    } catch (error) {
      checks.push({ name: 'Anuncio BLE (periférico)', label: no(String(error)) });
    }
    this.checks.set(checks);
  }

  runSelfTest(): void {
    this.selfTest.set(runModemSelfTest());
    const passed = this.selfTest().every((c) => c.label.tone === 'ok');
    this.log.log('system', passed ? 'info' : 'error', `Autoprueba del módem: ${passed ? 'superada' : 'fallida'}.`);
  }

  clock(at: number): string {
    return new Date(at).toLocaleTimeString();
  }
}
