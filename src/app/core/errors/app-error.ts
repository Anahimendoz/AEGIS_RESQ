export type AppErrorCode =
  | 'bluetooth-disabled'
  | 'bluetooth-unsupported'
  | 'advertising-unsupported'
  | 'permission-denied'
  | 'microphone-busy'
  | 'microphone-missing'
  | 'audio-unsupported'
  | 'audio-channel-failed'
  | 'location-unavailable'
  | 'config-invalid'
  | 'not-implemented-on-device'
  | 'unknown';

const USER_MESSAGES: Record<AppErrorCode, string> = {
  'bluetooth-disabled': 'Bluetooth está desactivado. Actívalo en los ajustes rápidos del teléfono.',
  'bluetooth-unsupported': 'Este dispositivo no ofrece Bluetooth Low Energy.',
  'advertising-unsupported': 'Este teléfono no puede anunciarse por BLE; podrá ver a otros, pero ellos no lo verán.',
  'permission-denied': 'El permiso necesario fue denegado. Puedes concederlo desde «Permisos y privacidad».',
  'microphone-busy': 'El micrófono está siendo usado por otra aplicación.',
  'microphone-missing': 'No se encontró un micrófono disponible.',
  'audio-unsupported': 'El motor de audio de este dispositivo no admite el modo seleccionado.',
  'audio-channel-failed': 'No se pudo abrir el canal de audio.',
  'location-unavailable': 'La ubicación no está disponible. Revisa que el GPS esté activado.',
  'config-invalid': 'La configuración de participantes falta o no es válida.',
  'not-implemented-on-device': 'Función no disponible en este dispositivo o plataforma.',
  unknown: 'Ocurrió un error inesperado.',
};

/** Error con un código estable: el mensaje de usuario se deriva del código, el detalle va al diagnóstico. */
export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    readonly detail?: string,
  ) {
    super(USER_MESSAGES[code]);
    this.name = 'AppError';
  }

  get userMessage(): string {
    return USER_MESSAGES[this.code];
  }
}

export function toAppError(error: unknown, fallback: AppErrorCode = 'unknown'): AppError {
  if (error instanceof AppError) return error;
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const lower = detail.toLowerCase();
  if (lower.includes('not implemented') || lower.includes('unimplemented') || lower.includes('not available on web')) {
    return new AppError('not-implemented-on-device', detail);
  }
  if (lower.includes('permission') || lower.includes('notallowederror')) {
    return new AppError('permission-denied', detail);
  }
  if (lower.includes('bluetooth le not initialized') || lower.includes('bluetooth not enabled') || lower.includes('bluetooth-disabled')) {
    return new AppError('bluetooth-disabled', detail);
  }
  return new AppError(fallback, detail);
}
