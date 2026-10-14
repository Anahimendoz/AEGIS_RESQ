import { Routes } from '@angular/router';

export interface MenuSection {
  path: string;
  title: string;
  icon: string;
}

/** Secciones del menú lateral, en el orden de la especificación. */
export const MENU_SECTIONS: MenuSection[] = [
  { path: 'inicio', title: 'Inicio', icon: 'home' },
  { path: 'red', title: 'Red de dispositivos', icon: 'bluetooth' },
  { path: 'audio', title: 'Sesión de audio', icon: 'volume-high' },
  { path: 'deteccion', title: 'Detección acústica', icon: 'pulse' },
  { path: 'ubicacion', title: 'Ubicación y eventos', icon: 'location' },
  { path: 'participantes', title: 'Participantes', icon: 'people' },
  { path: 'permisos', title: 'Permisos y privacidad', icon: 'shield-checkmark' },
  { path: 'diagnostico', title: 'Diagnóstico técnico', icon: 'bug' },
  { path: 'acerca', title: 'Acerca del proyecto', icon: 'information-circle' },
];

export const routes: Routes = [
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },
  { path: 'inicio', loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage) },
  { path: 'red', loadComponent: () => import('./features/devices/devices.page').then((m) => m.DevicesPage) },
  { path: 'audio', loadComponent: () => import('./features/rescue/audio-session.page').then((m) => m.AudioSessionPage) },
  { path: 'deteccion', loadComponent: () => import('./features/rescue/detection.page').then((m) => m.DetectionPage) },
  { path: 'ubicacion', loadComponent: () => import('./features/location/location.page').then((m) => m.LocationPage) },
  {
    path: 'participantes',
    loadComponent: () => import('./features/participants/participants.page').then((m) => m.ParticipantsPage),
  },
  { path: 'permisos', loadComponent: () => import('./features/settings/permissions.page').then((m) => m.PermissionsPage) },
  { path: 'diagnostico', loadComponent: () => import('./features/settings/diagnostics.page').then((m) => m.DiagnosticsPage) },
  { path: 'acerca', loadComponent: () => import('./features/about/about.page').then((m) => m.AboutPage) },
  { path: '**', redirectTo: 'inicio' },
];
