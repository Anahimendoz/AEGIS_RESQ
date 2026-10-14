import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.aegisresq.app',
  appName: 'Aegis ResQ',
  webDir: 'www',
  android: {
    // Sin servidores remotos: todo el contenido web se sirve desde el APK.
    allowMixedContent: false,
  },
};

export default config;
