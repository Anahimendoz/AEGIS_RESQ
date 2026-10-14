import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { SettingsService } from '../../core/services/settings.service';
import { PageHeaderComponent } from './page-header.component';

describe('PageHeaderComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PageHeaderComponent], providers: [provideIonicAngular()] });
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(PageHeaderComponent);
    fixture.componentRef.setInput('title', 'Inicio');
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('arranca en modo real y no muestra el rótulo de demostración', () => {
    expect(TestBed.inject(SettingsService).mode()).toBe('real');
    expect(render().textContent).not.toContain('MODO DEMOSTRACIÓN');
  });

  it('rotula claramente el modo demostración', () => {
    TestBed.inject(SettingsService).setMode('demo');
    expect(render().textContent).toContain('MODO DEMOSTRACIÓN');
  });

  it('no indica actividad de audio si el micrófono y el altavoz están inactivos', () => {
    expect(render().textContent).not.toMatch(/MICRÓFONO ACTIVO|EMITIENDO/);
  });
});
