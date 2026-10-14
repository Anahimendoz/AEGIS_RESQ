import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { AppComponent } from './app.component';
import { MENU_SECTIONS, routes } from './app.routes';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideIonicAngular(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('arranca sin pantalla de autenticación', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('input[type="password"]')).toBeNull();
    expect(element.textContent).not.toMatch(/contraseña|iniciar sesión/i);
    TestBed.inject(HttpTestingController).match(() => true);
  });

  it('muestra las nueve secciones del menú lateral en orden', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    // Stencil parchea textContent/childNodes en ion-label; innerHTML refleja el DOM real.
    const labels = Array.from<Element>(fixture.nativeElement.querySelectorAll('ion-item ion-label')).map((label) =>
      label.innerHTML.replace(/<[^>]*>/g, '').trim(),
    );
    expect(labels).toEqual([
      'Inicio',
      'Red de dispositivos',
      'Sesión de audio',
      'Detección acústica',
      'Ubicación y eventos',
      'Participantes',
      'Permisos y privacidad',
      'Diagnóstico técnico',
      'Acerca del proyecto',
    ]);
    TestBed.inject(HttpTestingController).match(() => true);
  });

  it('cada sección del menú tiene una ruta con componente cargable', async () => {
    for (const section of MENU_SECTIONS) {
      const route = routes.find((r) => r.path === section.path);
      expect(route?.loadComponent).toBeDefined();
      const component = await route!.loadComponent!();
      expect(component).toBeTruthy();
    }
  });
});
